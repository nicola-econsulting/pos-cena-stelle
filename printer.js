// Web Bluetooth → BLE thermal printer (ESC/POS), with window.print() fallback.
// Cheap 58mm printers expose different GATT services; we declare the common
// candidates and detect the writable characteristic at runtime.

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

const Printer = {
  device: null,
  characteristic: null,
  onStatusChange: null,   // set by app.js: fn(connected, deviceName)

  get available() {
    return !!navigator.bluetooth;
  },

  get connected() {
    return !!(this.device && this.device.gatt.connected && this.characteristic);
  },

  _notify() {
    if (this.onStatusChange) {
      this.onStatusChange(this.connected, this.device ? (this.device.name || 'stampante') : null);
    }
  },

  // Show the browser device picker and connect
  async selectAndConnect() {
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
    await this._connect(device);
  },

  // Reconnect: known device → last granted device (getDevices) → picker
  async reconnect() {
    if (this.device) {
      try { await this._connect(this.device); return; } catch (e) { /* fall through */ }
    }
    if (navigator.bluetooth.getDevices) {
      try {
        const devices = await navigator.bluetooth.getDevices();
        for (const d of devices) {
          try { await this._connect(d); return; } catch (e) { /* try next */ }
        }
      } catch (e) { /* getDevices unsupported/failed */ }
    }
    await this.selectAndConnect();
  },

  // Silent auto-reconnect on app launch (no picker)
  async tryAutoReconnect() {
    if (!this.available || !navigator.bluetooth.getDevices) return;
    try {
      const devices = await navigator.bluetooth.getDevices();
      for (const d of devices) {
        try { await this._connect(d); return; } catch (e) { /* try next */ }
      }
    } catch (e) { /* ignore */ }
  },

  async _connect(device) {
    this.device = device;
    try {
      if (this._onDisconnect) device.removeEventListener('gattserverdisconnected', this._onDisconnect);
      this._onDisconnect = () => { this.characteristic = null; this._notify(); };
      device.addEventListener('gattserverdisconnected', this._onDisconnect);
    } catch (e) { /* some stacks lack device event listeners — not fatal */ }

    if (!device.gatt) throw new Error('Dispositivo senza interfaccia GATT (Bluetooth classico? Serve una stampante BLE)');
    let server;
    try {
      server = await device.gatt.connect();
    } catch (e) {
      throw new Error(bleErrorText(e, 'Collegamento GATT fallito (stampante spenta o già collegata a un altro dispositivo?)'));
    }
    try {
      this.characteristic = await this._findWritableCharacteristic(server);
    } catch (e) {
      throw new Error(bleErrorText(e, 'Ricerca servizi fallita'));
    }
    if (!this.characteristic) {
      const found = this._lastFoundServices.length
        ? 'Servizi trovati: ' + this._lastFoundServices.join(', ')
        : 'Nessun servizio accessibile trovato';
      device.gatt.disconnect();
      throw new Error('Stampante non compatibile con i servizi noti. ' + found);
    }
    console.log('Printer connected. Service:', this.characteristic.service.uuid,
                'characteristic:', this.characteristic.uuid);
    this._notify();
  },

  _lastFoundServices: [],

  async _findWritableCharacteristic(server) {
    let services = [];
    try { services = await server.getPrimaryServices(); } catch (e) { /* some stacks require UUIDs */ }
    if (!services.length) {
      for (const uuid of PRINTER_SERVICES) {
        try { services.push(await server.getPrimaryService(uuid)); } catch (e) { /* not present */ }
      }
    }
    this._lastFoundServices = services.map(s => s.uuid);
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

  // Write an ESC/POS buffer in chunks
  async printBytes(bytes) {
    if (!this.connected) throw new Error('Stampante non connessa');
    for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
      const chunk = bytes.slice(i, i + CHUNK_SIZE);
      if (this.characteristic.properties.writeWithoutResponse) {
        await this.characteristic.writeValueWithoutResponse(chunk);
      } else {
        await this.characteristic.writeValue(chunk);
      }
      await new Promise(r => setTimeout(r, CHUNK_DELAY));
    }
  },

  // Print a layout over Bluetooth. Falls back to window.print() only when
  // no printer was ever selected (laptop testing); if a printer is known but
  // disconnected, throw so the app shows the error + Ristampa flow.
  async printLayout(layout, copies) {
    copies = copies || 1;
    if (this.available && (this.connected || this.device)) {
      const bytes = layoutToBytes(layout);
      for (let c = 0; c < copies; c++) await this.printBytes(bytes);
    } else {
      this.printFallback(layout);
    }
  },

  // window.print() HTML fallback (laptop testing / no Web Bluetooth)
  printFallback(layout) {
    const pre = document.getElementById('print-fallback');
    pre.textContent = layoutToText(layout);
    window.print();
  }
};
