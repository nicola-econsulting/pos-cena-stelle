// IndexedDB persistence: `orders` store + `meta` store (order counter, settings)
const DB_NAME = 'pos-cena-stelle';
const DB_VERSION = 1;

const DEFAULT_SETTINGS = {
  showHidden: false,   // "Cena al banco" category
  changeCalc: true,    // show "Contanti ricevuti" / "Resto"
  copies: 1,           // ticket copies (1 or 2)
  pin: '1234'          // light PIN for Settings / reset
};

let _db = null;

function openDB() {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('orders')) {
        const os = db.createObjectStore('orders', { keyPath: 'id' });
        os.createIndex('number', 'number', { unique: false });
      }
      if (!db.objectStoreNames.contains('meta')) {
        db.createObjectStore('meta', { keyPath: 'key' });
      }
    };
    req.onsuccess = () => { _db = req.result; resolve(_db); };
    req.onerror = () => reject(req.error);
  });
}

function tx(store, mode, fn) {
  return openDB().then(db => new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const os = t.objectStore(store);
    let result;
    try { result = fn(os); } catch (e) { reject(e); return; }
    t.oncomplete = () => resolve(result && result.result !== undefined ? result.result : result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  }));
}

// --- meta helpers ---

function metaGet(key) {
  return openDB().then(db => new Promise((resolve, reject) => {
    const req = db.transaction('meta', 'readonly').objectStore('meta').get(key);
    req.onsuccess = () => resolve(req.result ? req.result.value : undefined);
    req.onerror = () => reject(req.error);
  }));
}

function metaSet(key, value) {
  return tx('meta', 'readwrite', os => os.put({ key, value }));
}

async function getSettings() {
  const saved = await metaGet('settings');
  return Object.assign({}, DEFAULT_SETTINGS, saved || {});
}

function saveSettings(settings) {
  return metaSet('settings', settings);
}

// Atomically increment and return the next order number (persists across relaunch)
function nextOrderNumber() {
  return openDB().then(db => new Promise((resolve, reject) => {
    const t = db.transaction('meta', 'readwrite');
    const os = t.objectStore('meta');
    const req = os.get('counter');
    req.onsuccess = () => {
      const next = ((req.result && req.result.value) || 0) + 1;
      os.put({ key: 'counter', value: next });
      t.oncomplete = () => resolve(next);
    };
    req.onerror = () => reject(req.error);
  }));
}

// --- orders ---

function saveOrder(order) {
  return tx('orders', 'readwrite', os => os.put(order));
}

function getOrder(id) {
  return openDB().then(db => new Promise((resolve, reject) => {
    const req = db.transaction('orders', 'readonly').objectStore('orders').get(id);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }));
}

function getAllOrders() {
  return openDB().then(db => new Promise((resolve, reject) => {
    const req = db.transaction('orders', 'readonly').objectStore('orders').getAll();
    req.onsuccess = () => resolve((req.result || []).sort((a, b) => b.number - a.number));
    req.onerror = () => reject(req.error);
  }));
}

// "Azzera serata": wipe orders + counter, keep settings
async function resetEvent() {
  await tx('orders', 'readwrite', os => os.clear());
  await metaSet('counter', 0);
}
