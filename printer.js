// Web Bluetooth / WebUSB → thermal printers (ESC/POS), with window.print()
// fallback.
//
// This app runs independently on each cassa tablet (no shared backend), and
// each tablet talks to 2 physical printers: its OWN station printer, and the
// ONE kitchen printer shared by every tablet in the venue. Both are tracked
// independently under a "role" id so a receipt can be routed to the right
// device. Cheap 58mm printers expose different GATT services; we declare the
// common candidates and detect the writable characteristic at runtime.
//
// Each role can be connected over EITHER Bluetooth (BLE/GATT) or USB
// (WebUSB) — whichever the user picks in Impostazioni. This matters because
// cheap BLE thermal printers only accept ONE active connection at a time, so
// a printer shared by 2 tablets can't hold 2 simultaneous BLE links; a USB
// connection (optionally through a physical USB sharing switch between the
// tablets and the printer) sidesteps that. Remembered device ids are stored
// per role as a single string prefixed with the transport, e.g.
// "ble:<device.id>" or "usb:<vendorId>:<productId>:<serialNumber>", so
// auto-reconnect knows which API to use without a separate settings field.

const PRINTER_ROLES = [
  { id: 'kitchen', label: 'Cucina (condivisa)' },
  { id: 'station', label: 'Stampante di questa cassa' }
];

// Full 128-bit UUID strings: quirky Web Bluetooth stacks (Bluefy) may not
// expand the 16-bit numeric shorthand, so spell everything out.
const PRINTER_SERVICES = [
  '000018f0-0000-1000-8000-00805f9b34fb',   // common thermal printer service (write 0x2AF1)
  '0000ffe0-0000-1000-8000-00805f9b34fb',   // HM-10 style (write 0xFFE1)
  '0000ff00-0000-1000-8000-00805f9b34fb',   // (write 0xFF02)
  '0000ff10-0000-1000-8000-00805f9b34fb',   // some Goojprt/POS-58 clones (write 0xFF11)
  '0000fee7-0000-1000-8000-00805f9b34fb',   // some Chinese BLE modules
  '6e400001-b5a3-f393-e0a9-e50e24dcca9e',   // Nordic UART (write ...0002...)
  '49535343-fe7d-4ae5-8fa9-9fafd205e455',   // ISSC/Microchip transparent UART (very common on 58mm printers)
  'e7810a71-73ae-499d-8c15-faa9aef0c3f2'    // "BlueTooth Printer" generic module
];

// Robust error → text (Bluefy sometimes rejects with message-less objects)
function bleErrorText(e, stage) {
  let detail = '';
  if (e) {
    detail = e.message || e.name || (typeof e === 'string' ? e : '');
    if (!detail) { try { detail = JSON.stringify(e); } catch (_) { detail = String(e); } }
  }
  return stage + (detail ? ': ' + detail : ': errore sconosciuto');
}

const CHUNK_SIZE = 120;   // bytes per GATT write (stay under typical MTU)
const CHUNK_DELAY = 40;   // ms between writes — cheap printers need breathing room

// Many cheap 58mm printers have no auto-cutter, so back-to-back print jobs
// on the same physical printer come out as one continuous unbroken strip
// unless we deliberately pause so a person can tear the paper by hand.
// Used both between repeated copies here, and between separate tickets
// routed to the same role (see app.js printOrderReceipts).
const TEAR_PAUSE_MS = 3000;

function freshRoleState() {
  return {
    type: null,            // 'ble' | 'usb' | null
    device: null,
    characteristic: null,  // BLE only
    usbEndpoint: null,     // USB only: OUT endpoint number
    usbInterface: null,    // USB only: claimed interface number
    onDisconnect: null,
    lastFoundServices: []
  };
}

// A remembered id is "<type>:<...>". Older saved ids (pre-USB-support) have
// no prefix and were always BLE, so treat an unprefixed id as BLE for
// backward compatibility with settings saved before this change.
function parseDeviceId(id) {
  if (!id) return null;
  if (id.startsWith('ble:')) return { type: 'ble', bleId: id.slice(4) };
  if (id.startsWith('usb:')) return { type: 'usb' };
  return { type: 'ble', bleId: id };
}

function usbDeviceId(device) {
  return 'usb:' + device.vendorId + ':' + device.productId + ':' + (device.serialNumber || '');
}

const Printer = {
  roles: PRINTER_ROLES,
  _state: {
    kitchen: freshRoleState(),
    station: freshRoleState()
  },
  onStatusChange: null,   // set by app.js: fn(role, connected, deviceName)
  onDeviceSelected: null, // set by app.js: fn(role, deviceId) — persist for auto-reconnect
  onTearPause: null,      // set by app.js: fn(role) — called right before a TEAR_PAUSE_MS wait, so the UI can prompt "tear the receipt"

  get availableBLE() {
    return !!navigator.bluetooth;
  },

  get availableUSB() {
    return !!navigator.usb;
  },

  get available() {
    return this.availableBLE || this.availableUSB;
  },

  isConnected(role) {
    const s = this._state[role];
    if (!s || !s.device) return false;
    if (s.type === 'usb') return s.device.opened && s.usbEndpoint != null;
    return !!(s.device.gatt.connected && s.characteristic);
  },

  hasKnownDevice(role) {
    const s = this._state[role];
    return !!(s && s.device);
  },

  _notify(role) {
    const s = this._state[role];
    if (this.onStatusChange) {
      this.onStatusChange(role, this.isConnected(role), s.device ? (s.device.name || 'stampante') : null);
    }
  },

  // Show the Bluetooth device picker and connect for a given role
  async selectAndConnect(role) {
    let device;
    try {
      device = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: PRINTER_SERVICES
      });
    } catch (e) {
      if (e && e.name === 'NotFoundError') throw e;   // user cancelled the picker
      throw new Error(bleErrorText(e, 'Selezione dispositivo fallita'));
    }
    if (!device) throw new Error('Selezione dispositivo fallita: nessun dispositivo');
    await this._connect(role, device);
    if (this.onDeviceSelected) this.onDeviceSelected(role, 'ble:' + device.id);
  },

  // Show the USB device picker and connect for a given role
  async selectAndConnectUSB(role) {
    let device;
    try {
      device = await navigator.usb.requestDevice({ filters: [{}] });
    } catch (e) {
      if (e && e.name === 'NotFoundError') throw e;   // user cancelled the picker
      throw new Error(bleErrorText(e, 'Selezione dispositivo USB fallita'));
    }
    if (!device) throw new Error('Selezione dispositivo fallita: nessun dispositivo');
    await this._connectUSB(role, device);
    if (this.onDeviceSelected) this.onDeviceSelected(role, usbDeviceId(device));
  },

  // Reconnect one role: in-memory device → remembered device (by transport) → picker.
  // `knownId` is the remembered "ble:..."/"usb:..." string from settings, so we
  // know which transport to search/open the picker for.
  async reconnect(role, knownId) {
    const s = this._state[role];
    if (s.device) {
      try {
        if (s.type === 'usb') await this._connectUSB(role, s.device);
        else await this._connect(role, s.device);
        return;
      } catch (e) { /* fall through */ }
    }

    const parsed = parseDeviceId(knownId);

    if ((!parsed || parsed.type === 'ble') && this.availableBLE && navigator.bluetooth.getDevices) {
      try {
        const devices = await navigator.bluetooth.getDevices();
        const device = (parsed && devices.find(d => d.id === parsed.bleId)) || devices[0];
        if (device) { await this._connect(role, device); return; }
      } catch (e) { /* fall through */ }
    }

    if (parsed && parsed.type === 'usb' && this.availableUSB && navigator.usb.getDevices) {
      try {
        const devices = await navigator.usb.getDevices();
        const device = devices.find(d => usbDeviceId(d) === knownId);
        if (device) { await this._connectUSB(role, device); return; }
      } catch (e) { /* fall through */ }
    }

    if (parsed && parsed.type === 'usb') await this.selectAndConnectUSB(role);
    else await this.selectAndConnect(role);
  },

  // Silent auto-reconnect on app launch (no picker) for every role that has
  // a remembered device id. `knownDeviceIds` = { kitchen: id, station: id }
  async tryAutoReconnectAll(knownDeviceIds) {
    if (!this.available) return;
    let bleDevices = [], usbDevices = [];
    if (this.availableBLE && navigator.bluetooth.getDevices) {
      try { bleDevices = await navigator.bluetooth.getDevices(); } catch (e) { /* ignore */ }
    }
    if (this.availableUSB && navigator.usb.getDevices) {
      try { usbDevices = await navigator.usb.getDevices(); } catch (e) { /* ignore */ }
    }
    for (const role of Object.keys(knownDeviceIds || {})) {
      const wantId = knownDeviceIds[role];
      const parsed = parseDeviceId(wantId);
      if (!parsed) continue;
      try {
        if (parsed.type === 'usb') {
          const device = usbDevices.find(d => usbDeviceId(d) === wantId);
          if (device) await this._connectUSB(role, device);
        } else {
          const device = bleDevices.find(d => d.id === parsed.bleId);
          if (device) await this._connect(role, device);
        }
      } catch (e) { /* leave disconnected, user can reconnect */ }
    }
  },

  async _connect(role, device) {
    const s = this._state[role];
    s.type = 'ble';
    s.device = device;
    try {
      if (s.onDisconnect) device.removeEventListener('gattserverdisconnected', s.onDisconnect);
      s.onDisconnect = () => { s.characteristic = null; this._notify(role); };
      device.addEventListener('gattserverdisconnected', s.onDisconnect);
    } catch (e) { /* some stacks lack device event listeners — not fatal */ }

    if (!device.gatt) throw new Error('Dispositivo senza interfaccia GATT (Bluetooth classico? Serve una stampante BLE)');
    let server;
    try {
      server = await device.gatt.connect();
    } catch (e) {
      throw new Error(bleErrorText(e, 'Collegamento GATT fallito (stampante spenta o già collegata a un altro dispositivo?)'));
    }
    try {
      s.characteristic = await this._findWritableCharacteristic(role, server);
    } catch (e) {
      throw new Error(bleErrorText(e, 'Ricerca servizi fallita'));
    }
    if (!s.characteristic) {
      const found = s.lastFoundServices.length
        ? 'Servizi trovati: ' + s.lastFoundServices.join(', ')
        : 'Nessun servizio accessibile trovato';
      device.gatt.disconnect();
      throw new Error('Stampante non compatibile con i servizi noti. ' + found);
    }
    console.log(`Printer[${role}] connected via Bluetooth. Service:`, s.characteristic.service.uuid,
                'characteristic:', s.characteristic.uuid);
    this._notify(role);
  },

  // USB (WebUSB) connect: open the device, select its configuration, claim
  // the interface with a bulk OUT endpoint, and write to that endpoint.
  // Requires a secure context (https / localhost), same as Web Bluetooth.
  async _connectUSB(role, device) {
    const s = this._state[role];
    s.type = 'usb';
    s.device = device;
    s.usbEndpoint = null;
    s.usbInterface = null;
    try {
      if (s.onDisconnect) navigator.usb.removeEventListener('disconnect', s.onDisconnect);
      s.onDisconnect = (e) => { if (e.device === device) { s.usbEndpoint = null; this._notify(role); } };
      navigator.usb.addEventListener('disconnect', s.onDisconnect);
    } catch (e) { /* not fatal */ }

    try {
      await device.open();
      if (!device.configuration) {
        await device.selectConfiguration(device.configurations[0].configurationValue);
      }
      const found = this._findUSBOutEndpoint(device);
      if (!found) {
        await device.close().catch(() => {});
        throw new Error('Nessun endpoint di scrittura USB trovato (stampante non compatibile?)');
      }
      await device.claimInterface(found.interfaceNumber);
      s.usbInterface = found.interfaceNumber;
      s.usbEndpoint = found.endpointNumber;
    } catch (e) {
      s.usbEndpoint = null;
      throw new Error(bleErrorText(e, 'Collegamento USB fallito (stampante spenta, o interfaccia già presa dal sistema operativo?)'));
    }
    console.log(`Printer[${role}] connected via USB.`, device.productName || '', 'endpoint:', s.usbEndpoint);
    this._notify(role);
  },

  _findUSBOutEndpoint(device) {
    const config = device.configuration;
    if (!config) return null;
    for (const iface of config.interfaces) {
      for (const alt of iface.alternates) {
        const ep = alt.endpoints.find(e => e.direction === 'out');
        if (ep) return { interfaceNumber: iface.interfaceNumber, endpointNumber: ep.endpointNumber };
      }
    }
    return null;
  },

  async _findWritableCharacteristic(role, server) {
    const s = this._state[role];
    let services = [];
    try { services = await server.getPrimaryServices(); } catch (e) { /* some stacks require UUIDs */ }
    if (!services.length) {
      for (const uuid of PRINTER_SERVICES) {
        try { services.push(await server.getPrimaryService(uuid)); } catch (e) { /* not present */ }
      }
    }
    s.lastFoundServices = services.map(sv => sv.uuid);
    let fallback = null;
    for (const service of services) {
      let chars = [];
      try { chars = await service.getCharacteristics(); } catch (e) { continue; }
      for (const ch of chars) {
        if (ch.properties.writeWithoutResponse) return ch;   // preferred: fast
        if (ch.properties.write && !fallback) fallback = ch;
      }
    }
    return fallback;
  },

  // Write an ESC/POS buffer in chunks to a specific role's printer
  async printBytes(role, bytes) {
    const s = this._state[role];
    if (!this.isConnected(role)) throw new Error(`Stampante "${role}" non connessa`);
    for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
      const chunk = bytes.slice(i, i + CHUNK_SIZE);
      if (s.type === 'usb') {
        await s.device.transferOut(s.usbEndpoint, chunk);
      } else if (s.characteristic.properties.writeWithoutResponse) {
        await s.characteristic.writeValueWithoutResponse(chunk);
      } else {
        await s.characteristic.writeValue(chunk);
      }
      await new Promise(r => setTimeout(r, CHUNK_DELAY));
    }
  },

  // Print a layout on a given role's printer. Falls back to window.print()
  // only when no printer was ever selected for ANY role (laptop testing);
  // if this role's printer is known but disconnected, throw so the app
  // shows the error + per-role Ristampa flow.
  async printLayout(role, layout, copies) {
    copies = copies || 1;
    if (this.available && (this.isConnected(role) || this.hasKnownDevice(role))) {
      const bytes = layoutToBytes(layout);
      for (let c = 0; c < copies; c++) {
        if (c > 0) {
          if (this.onTearPause) this.onTearPause(role);
          await new Promise(r => setTimeout(r, TEAR_PAUSE_MS));
        }
        await this.printBytes(role, bytes);
      }
    } else if (!this.available || !this._anyDeviceKnown()) {
      this.printFallback(layout);
    } else {
      throw new Error(`Stampante "${role}" non connessa`);
    }
  },

  _anyDeviceKnown() {
    return PRINTER_ROLES.some(r => this.hasKnownDevice(r.id));
  },

  // window.print() HTML fallback (laptop testing / no Web Bluetooth / no printer ever selected)
  printFallback(layout) {
    const pre = document.getElementById('print-fallback');
    pre.textContent = layoutToText(layout);
    window.print();
  }
};
