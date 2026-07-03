// App logic: views, cart, payment, print/complete flow, orders log,
// report/export, settings. UI text Italian, code English.

let settings = null;
let cart = [];            // [{ itemKey, name, unitPrice, qty }]
let lastFailedOrderId = null;
let settingsUnlocked = false;

const $ = id => document.getElementById(id);

// Lookup: itemKey → { item, category }
const ITEM_INDEX = {};
for (const cat of MENU.categories) {
  for (const item of cat.items) ITEM_INDEX[item.key] = { item, category: cat.name };
}

function fmtEuro(n) { return MENU.currency + ' ' + money(n); }

function toast(msg, ms) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.remove('hidden');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.add('hidden'), ms || 2200);
}

// ---------- views / navigation ----------

function showView(name) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.view === name));
  $('view-' + name).classList.add('active');
  if (name === 'ordini') renderOrders();
  if (name === 'report') renderReport();
  if (name === 'impostazioni') renderSettings();
}

document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', async () => {
    if (tab.dataset.view === 'impostazioni' && !settingsUnlocked) {
      const ok = await askConfirm('Impostazioni', 'Inserisci il PIN per accedere.', { pin: true });
      if (!ok) return;
      settingsUnlocked = true;
    }
    showView(tab.dataset.view);
  });
});

// ---------- menu grid ----------

function renderMenu() {
  const grid = $('menu-grid');
  grid.innerHTML = '';
  for (const cat of MENU.categories) {
    if (cat.hidden && !settings.showHidden) continue;
    const title = document.createElement('div');
    title.className = 'category-title';
    title.textContent = cat.name;
    grid.appendChild(title);

    const items = document.createElement('div');
    items.className = 'item-grid';
    for (const item of cat.items) {
      const btn = document.createElement('button');
      btn.className = 'item-btn';
      btn.innerHTML = `<span>${item.name}</span><span class="price">${fmtEuro(item.price)}</span>`;
      btn.addEventListener('click', () => addToCart(item.key));
      items.appendChild(btn);
    }
    grid.appendChild(items);
  }
}

// ---------- cart ----------

function addToCart(itemKey) {
  const found = cart.find(l => l.itemKey === itemKey);
  if (found) found.qty++;
  else {
    const { item } = ITEM_INDEX[itemKey];
    cart.push({ itemKey, name: item.name, unitPrice: item.price, qty: 1 });
  }
  renderCart();
}

function changeQty(itemKey, delta) {
  const line = cart.find(l => l.itemKey === itemKey);
  if (!line) return;
  line.qty += delta;
  if (line.qty <= 0) cart = cart.filter(l => l !== line);
  renderCart();
}

function removeLine(itemKey) {
  cart = cart.filter(l => l.itemKey !== itemKey);
  renderCart();
}

function cartTotal() {
  return cart.reduce((sum, l) => sum + l.unitPrice * l.qty, 0);
}

function renderCart() {
  const el = $('cart-lines');
  el.innerHTML = '';
  if (!cart.length) {
    el.innerHTML = '<div class="cart-empty">Tocca un prodotto per iniziare l\'ordine</div>';
  }
  for (const line of cart) {
    const row = document.createElement('div');
    row.className = 'cart-line';
    row.innerHTML = `
      <span class="name">${line.name}</span>
      <span class="stepper">
        <button class="minus">−</button>
        <span class="qty">${line.qty}</span>
        <button class="plus">+</button>
      </span>
      <span class="line-total">${money(line.unitPrice * line.qty)}</span>
      <button class="remove">×</button>`;
    row.querySelector('.minus').addEventListener('click', () => changeQty(line.itemKey, -1));
    row.querySelector('.plus').addEventListener('click', () => changeQty(line.itemKey, +1));
    row.querySelector('.remove').addEventListener('click', () => removeLine(line.itemKey));
    el.appendChild(row);
  }
  $('cart-total').textContent = fmtEuro(cartTotal());
  $('btn-stampa').disabled = !cart.length;
}

$('btn-annulla').addEventListener('click', async () => {
  if (!cart.length) return;
  const ok = await askConfirm('Annulla ordine', 'Svuotare l\'ordine corrente?');
  if (ok) { cart = []; renderCart(); }
});

// ---------- payment modal ----------

$('btn-stampa').addEventListener('click', () => {
  if (!cart.length) return;
  $('pay-total').textContent = fmtEuro(cartTotal());
  $('pay-cash').value = '';
  $('pay-change').classList.add('hidden');
  $('pay-cash-section').classList.toggle('hidden', !settings.changeCalc);
  $('modal-payment').classList.remove('hidden');
});

$('pay-cancel').addEventListener('click', () => $('modal-payment').classList.add('hidden'));

$('pay-cash').addEventListener('input', updateChange);
document.querySelectorAll('#quick-cash button').forEach(btn => {
  btn.addEventListener('click', () => {
    $('pay-cash').value = btn.dataset.cash;
    updateChange();
  });
});

function updateChange() {
  const cash = parseFloat(String($('pay-cash').value).replace(',', '.'));
  const box = $('pay-change');
  if (isNaN(cash) || cash <= 0) { box.classList.add('hidden'); return; }
  const change = cash - cartTotal();
  $('pay-change-value').textContent = fmtEuro(Math.abs(change)) + (change < 0 ? ' MANCANTI' : '');
  box.classList.toggle('negative', change < 0);
  box.classList.remove('hidden');
}

$('pay-confirm').addEventListener('click', completeOrder);

// ---------- complete order (save first, then print — never lose an order) ----------

async function completeOrder() {
  const btn = $('pay-confirm');
  btn.disabled = true;
  try {
    const cash = parseFloat(String($('pay-cash').value).replace(',', '.'));
    const total = cartTotal();
    const cashReceived = (settings.changeCalc && !isNaN(cash) && cash > 0) ? cash : null;

    const number = await nextOrderNumber();
    const order = {
      id: Date.now() + '-' + number,
      number,
      createdAt: new Date().toISOString(),
      total,
      cashReceived,
      changeDue: cashReceived != null ? +(cashReceived - total).toFixed(2) : null,
      status: 'saved',
      items: cart.map(l => ({
        itemKey: l.itemKey, name: l.name, unitPrice: l.unitPrice,
        qty: l.qty, lineTotal: +(l.unitPrice * l.qty).toFixed(2)
      }))
    };
    await saveOrder(order);

    $('modal-payment').classList.add('hidden');
    cart = [];
    renderCart();

    await printOrder(order);
  } finally {
    btn.disabled = false;
  }
}

async function printOrder(order) {
  try {
    await Printer.printLayout(orderTicketLayout(order), settings.copies);
    order.status = 'printed';
    await saveOrder(order);
    hidePrintError();
    toast(`Comanda n. ${formatOrderNumber(order.number)} stampata`);
  } catch (e) {
    console.error('Print failed:', e);
    lastFailedOrderId = order.id;
    showPrintError(`Errore di stampa comanda n. ${formatOrderNumber(order.number)}. L'ordine è salvato.`);
  }
}

// ---------- print error banner / Ristampa ----------

function showPrintError(msg) {
  $('print-error-text').textContent = msg;
  $('print-error').classList.remove('hidden');
}
function hidePrintError() {
  $('print-error').classList.add('hidden');
}

$('btn-error-close').addEventListener('click', hidePrintError);
$('btn-ristampa').addEventListener('click', async () => {
  if (!lastFailedOrderId) return;
  const order = await getOrder(lastFailedOrderId);
  if (!order) return;
  if (Printer.available && !Printer.connected) {
    try { await Printer.reconnect(); } catch (e) { /* printOrder will surface the error */ }
  }
  await printOrder(order);
});

// ---------- orders log ----------

async function renderOrders() {
  const orders = await getAllOrders();
  const el = $('orders-list');
  el.innerHTML = '';
  if (!orders.length) {
    el.innerHTML = '<div class="cart-empty">Nessun ordine stasera</div>';
    return;
  }
  for (const o of orders) {
    const d = new Date(o.createdAt);
    const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    const count = o.items.reduce((s, i) => s + i.qty, 0);
    const row = document.createElement('div');
    row.className = 'order-row';
    row.innerHTML = `
      <span class="num">N. ${formatOrderNumber(o.number)}</span>
      <span class="time">${time}</span>
      <span class="count">${count} pezzi</span>
      ${o.status !== 'printed' ? '<span class="badge">non stampata</span>' : ''}
      <span class="total">${fmtEuro(o.total)}</span>`;
    row.addEventListener('click', () => showOrderDetail(o));
    el.appendChild(row);
  }
}

function showOrderDetail(order) {
  $('order-detail-title').textContent = `Comanda N. ${formatOrderNumber(order.number)}`;
  $('order-detail-body').innerHTML = `<pre>${layoutToText(orderTicketLayout(order))}</pre>`;
  $('modal-order').classList.remove('hidden');
  $('order-detail-reprint').onclick = async () => {
    $('modal-order').classList.add('hidden');
    if (Printer.available && !Printer.connected) {
      try { await Printer.reconnect(); } catch (e) { /* handled below */ }
    }
    await printOrder(order);
  };
}
$('order-detail-close').addEventListener('click', () => $('modal-order').classList.add('hidden'));

// ---------- report ----------

async function buildReport() {
  const orders = await getAllOrders();
  const categories = MENU.categories.map(cat => ({
    name: cat.name,
    qty: 0, revenue: 0,
    items: cat.items.map(i => ({ key: i.key, name: i.name, qty: 0, revenue: 0 }))
  }));
  const byKey = {};
  for (const c of categories) for (const i of c.items) byKey[i.key] = { item: i, cat: c };

  let total = 0;
  for (const o of orders) {
    total += o.total;
    for (const line of o.items) {
      const entry = byKey[line.itemKey];
      if (!entry) continue; // item removed from menu — still counted in total
      entry.item.qty += line.qty;
      entry.item.revenue += line.lineTotal;
      entry.cat.qty += line.qty;
      entry.cat.revenue += line.lineTotal;
    }
  }
  return { orderCount: orders.length, total, categories, orders };
}

async function renderReport() {
  const r = await buildReport();
  $('report-summary').innerHTML = `
    <div class="stat"><div class="label">Ordini</div><div class="value">${r.orderCount}</div></div>
    <div class="stat"><div class="label">Incasso</div><div class="value">${fmtEuro(r.total)}</div></div>`;

  let html = '<table><tr><th>Prodotto</th><th class="num">Qtà</th><th class="num">Incasso</th></tr>';
  for (const cat of r.categories) {
    if (cat.qty === 0) continue;
    html += `<tr class="cat-row"><td>${cat.name}</td><td class="num">${cat.qty}</td><td class="num">${money(cat.revenue)}</td></tr>`;
    for (const it of cat.items) {
      if (it.qty === 0) continue;
      html += `<tr><td>${it.name}</td><td class="num">${it.qty}</td><td class="num">${money(it.revenue)}</td></tr>`;
    }
  }
  html += `<tr class="total-row"><td>TOTALE</td><td></td><td class="num">${fmtEuro(r.total)}</td></tr></table>`;
  $('report-table').innerHTML = html;
}

function download(filename, content, mime) {
  const blob = new Blob([content], { type: mime });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

function eventDateStamp() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

$('btn-export-csv').addEventListener('click', async () => {
  const orders = await getAllOrders();
  const rows = [['numero', 'orario', 'prodotto', 'quantita', 'prezzo_unitario', 'totale_riga', 'totale_ordine']];
  for (const o of [...orders].sort((a, b) => a.number - b.number)) {
    for (const line of o.items) {
      rows.push([
        formatOrderNumber(o.number), o.createdAt, `"${line.name}"`,
        line.qty, line.unitPrice.toFixed(2), line.lineTotal.toFixed(2), o.total.toFixed(2)
      ]);
    }
  }
  download(`report-${eventDateStamp()}.csv`, rows.map(r => r.join(';')).join('\n'), 'text/csv');
  toast('CSV esportato');
});

$('btn-export-json').addEventListener('click', async () => {
  const orders = await getAllOrders();
  download(`ordini-${eventDateStamp()}.json`, JSON.stringify(orders, null, 2), 'application/json');
  toast('JSON esportato');
});

$('btn-print-report').addEventListener('click', async () => {
  const r = await buildReport();
  try {
    await Printer.printLayout(reportTicketLayout(r), 1);
    toast('Report stampato');
  } catch (e) {
    showPrintError('Errore di stampa del report.');
  }
});

// ---------- settings ----------

function renderSettings() {
  $('set-show-hidden').checked = settings.showHidden;
  $('set-change-calc').checked = settings.changeCalc;
  $('set-copies').value = String(settings.copies);
}

async function updateSetting(key, value) {
  settings[key] = value;
  await saveSettings(settings);
  renderMenu();
}

$('set-show-hidden').addEventListener('change', e => updateSetting('showHidden', e.target.checked));
$('set-change-calc').addEventListener('change', e => updateSetting('changeCalc', e.target.checked));
$('set-copies').addEventListener('change', e => updateSetting('copies', parseInt(e.target.value, 10)));

$('btn-select-printer').addEventListener('click', async () => {
  if (!Printer.available) { toast('Bluetooth non disponibile: uso stampa browser'); return; }
  try {
    await Printer.selectAndConnect();
    toast('Stampante connessa');
  } catch (e) {
    console.error(e);
    if (e.name === 'NotFoundError') toast('Nessuna stampante selezionata');
    else toast('Connessione fallita: ' + e.message, 6000);
  }
});

$('btn-test-print').addEventListener('click', async () => {
  try {
    await Printer.printLayout(testTicketLayout(), 1);
    toast('Prova stampata');
  } catch (e) {
    showPrintError('Errore di stampa di prova. Controlla la connessione.');
  }
});

$('btn-reset').addEventListener('click', async () => {
  const ok = await askConfirm(
    'Azzera serata',
    'Cancellare TUTTI gli ordini e ripartire dal n. 1? Operazione irreversibile. Inserisci il PIN per confermare.',
    { pin: true }
  );
  if (!ok) return;
  await resetEvent();
  lastFailedOrderId = null;
  hidePrintError();
  toast('Serata azzerata: si riparte dal n. 1');
});

// ---------- confirm modal (optional PIN) ----------

function askConfirm(title, text, opts) {
  opts = opts || {};
  return new Promise(resolve => {
    $('confirm-title').textContent = title;
    $('confirm-text').textContent = text;
    const pinInput = $('confirm-pin');
    pinInput.value = '';
    pinInput.classList.toggle('hidden', !opts.pin);
    $('modal-confirm').classList.remove('hidden');
    if (opts.pin) setTimeout(() => pinInput.focus(), 50);

    const done = result => {
      $('modal-confirm').classList.add('hidden');
      $('confirm-yes').onclick = null;
      $('confirm-no').onclick = null;
      resolve(result);
    };
    $('confirm-yes').onclick = () => {
      if (opts.pin && pinInput.value !== settings.pin) {
        pinInput.value = '';
        pinInput.placeholder = 'PIN errato';
        return;
      }
      done(true);
    };
    $('confirm-no').onclick = () => done(false);
  });
}

// ---------- printer status / reconnect ----------

Printer.onStatusChange = connected => {
  const chip = $('printer-chip');
  chip.textContent = 'Stampante: ' + (connected ? 'Connessa' : 'Disconnessa');
  chip.className = 'chip ' + (connected ? 'connected' : 'disconnected');
};

$('btn-reconnect').addEventListener('click', async () => {
  if (!Printer.available) { toast('Bluetooth non disponibile in questo browser'); return; }
  try {
    await Printer.reconnect();
    toast('Stampante connessa');
  } catch (e) {
    console.error(e);
    if (e.name === 'NotFoundError') toast('Nessuna stampante selezionata');
    else toast('Connessione fallita: ' + e.message, 6000);
  }
});

// ---------- keep-awake ----------

async function keepAwake() {
  // Bluefy-specific API (guarded so normal browsers keep working)
  try {
    if (navigator.bluetooth && typeof navigator.bluetooth.setScreenDimEnabled === 'function') {
      navigator.bluetooth.setScreenDimEnabled(false);
    }
  } catch (e) { /* ignore */ }
  // Standard Wake Lock API where supported
  try {
    if (navigator.wakeLock) {
      await navigator.wakeLock.request('screen');
      document.addEventListener('visibilitychange', async () => {
        if (document.visibilityState === 'visible') {
          try { await navigator.wakeLock.request('screen'); } catch (e) { /* ignore */ }
        }
      });
    }
  } catch (e) { /* ignore */ }
}

// ---------- init ----------

async function init() {
  settings = await getSettings();
  renderMenu();
  renderCart();
  keepAwake();
  Printer.tryAutoReconnect();

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' })
      .catch(() => { /* offline caching is best-effort */ });
  }

  // Warn before accidental page unload during service
  window.addEventListener('beforeunload', e => {
    if (cart.length) { e.preventDefault(); e.returnValue = ''; }
  });
}

init();
