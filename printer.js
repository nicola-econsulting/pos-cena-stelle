// Web Bluetooth → BLE thermal printer (ESC/POS), with window.print() fallback.
// Cheap 58mm printers expose different GATT services; we declare the common
// candidates and detect the writable characteristic at runtime.

const PRINTER_SERVICES = [
  0x18F0,                                   // common thermal printer service (write 0x2AF1)
  0xFFE0,                                   // HM-10 style (write 0xFFE1)
  0xFF00,                                   // (write 0xFF02)
  '6e400001-b5a3-f393-e0a9-e50e24dcca9e'    // Nordic UART (write ...0002...)
];

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
    const device = await navigator.bluetooth.requestDevice({
      acceptAllDevices: true,
      optionalServices: PRINTER_SERVICES
    });
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
    device.removeEventListener('gattserverdisconnected', this._onDisconnect);
    this._onDisconnect = () => { this.characteristic = null; this._notify(); };
    device.addEventListener('gattserverdisconnected', this._onDisconnect);

    const server = await device.gatt.connect();
    this.characteristic = await this._findWritableCharacteristic(server);
    if (!this.characteristic) {
      device.gatt.disconnect();
      throw new Error('Nessuna caratteristica di scrittura trovata sulla stampante');
    }
    this._notify();
  },

  async _findWritableCharacteristic(server) {
    let services = [];
    try { services = await server.getPrimaryServices(); } catch (e) { /* some stacks require UUIDs */ }
    if (!services.length) {
      for (const uuid of PRINTER_SERVICES) {
        try { services.push(await server.getPrimaryService(uuid)); } catch (e) { /* not present */ }
      }
    }
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
