// App logic: views, cart, customization, payment, multi-station print/complete
// flow, orders log, report/export, settings. UI text Italian, code English.

let settings = null;
let cart = [];            // [{ lineId, itemKey, name, unitPrice, qty, customization }]
let lastFailedOrderId = null;
let settingsUnlocked = false;

// menu drill-down navigation state
let drillPath = [];       // [] = macro tiles, [macro] = sub tiles or items, [macro, sub] = items
let viewAllMode = false;

const $ = id => document.getElementById(id);

// ---------- menu item index (flattens categories + subcategories + Ticket Birra) ----------

const ITEM_INDEX = {};

function indexItem(item, categoryName, receiptTarget, customizableType, ingredients) {
  ITEM_INDEX[item.key] = { item, categoryName, receiptTarget, customizableType, ingredients: ingredients || null };
}

// Rebuilds the flat lookup from MENU.categories — called at load, and again
// after merging any custom items added from Impostazioni (see applyCustomItems).
function rebuildItemIndex() {
  for (const key of Object.keys(ITEM_INDEX)) delete ITEM_INDEX[key];
  for (const cat of MENU.categories) {
    if (cat.items) {
      for (const item of cat.items) {
        const type = cat.customizable || item.customizable || null;
        indexItem(item, cat.name, cat.receiptTarget, type, type === 'burger' ? item.ingredients : null);
      }
    }
    if (cat.subcategories) {
      for (const sub of cat.subcategories) {
        for (const item of sub.items) {
          const type = item.customizable || null;
          indexItem(item, `${cat.name} — ${sub.name}`, cat.receiptTarget, type, null);
        }
      }
    }
  }
  indexItem(MENU.ticketBirra, 'Ticket Birra', MENU.ticketBirra.receiptTarget, null);
}
rebuildItemIndex();

// ---------- custom menu items (added from Impostazioni, persisted in settings.customItems) ----------
// Only top-level categories (those with a plain `items` array, not subcategories)
// are offered as a target, keeping the add-item UI to a single category picker.

function addableCategories() {
  return MENU.categories.filter(c => !!c.items);
}

// Merge settings.customItems into MENU.categories (idempotent by key), so
// rendering/ordering/printing all see them exactly like built-in items.
function applyCustomItems(customItems) {
  for (const custom of (customItems || [])) {
    const cat = MENU.categories.find(c => c.name === custom.category && c.items);
    if (!cat) continue;
    if (!cat.items.some(it => it.key === custom.key)) {
      cat.items.push({ key: custom.key, name: custom.name, price: custom.price });
    }
  }
}

function removeCustomItemFromMenu(key) {
  for (const cat of MENU.categories) {
    if (!cat.items) continue;
    const i = cat.items.findIndex(it => it.key === key);
    if (i !== -1) { cat.items.splice(i, 1); return; }
  }
}

// Flat { name, items } list across categories/subcategories, for report/export
function flattenCategories() {
  const out = [];
  for (const cat of MENU.categories) {
    if (cat.items) out.push({ name: cat.name, items: cat.items });
    if (cat.subcategories) {
      for (const sub of cat.subcategories) out.push({ name: `${cat.name} — ${sub.name}`, items: sub.items });
    }
  }
  out.push({ name: 'Ticket Birra', items: [MENU.ticketBirra] });
  return out;
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

// ---------- menu grid (macro category drill-down + "vedi tutto" toggle) ----------

function itemVisible(item) {
  return !(item.classicBeer && settings.eventMode);
}

function itemButton(item) {
  const btn = document.createElement('button');
  btn.className = 'item-btn';
  btn.innerHTML = `<span>${item.name}</span><span class="price">${fmtEuro(item.price)}</span>`;
  btn.addEventListener('click', () => onItemTapped(item.key));
  return btn;
}

function renderItemGrid(container, items) {
  const grid = document.createElement('div');
  grid.className = 'item-grid';
  for (const item of items) {
    if (!itemVisible(item)) continue;
    grid.appendChild(itemButton(item));
  }
  container.appendChild(grid);
}

function tile(label, onClick) {
  const btn = document.createElement('button');
  btn.className = 'category-tile';
  btn.textContent = label;
  btn.addEventListener('click', onClick);
  return btn;
}

function renderMacroTiles(container) {
  const grid = document.createElement('div');
  grid.className = 'category-tile-grid';
  for (const cat of MENU.categories) {
    grid.appendChild(tile(cat.name, () => { drillPath = [cat]; renderMenu(); }));
  }
  container.appendChild(grid);
}

function renderSubTiles(container, macro) {
  const grid = document.createElement('div');
  grid.className = 'category-tile-grid';
  for (const sub of macro.subcategories) {
    grid.appendChild(tile(sub.name, () => { drillPath = [macro, sub]; renderMenu(); }));
  }
  container.appendChild(grid);
}

function renderAllFlat(container) {
  for (const group of flattenCategories()) {
    const visibleItems = group.items.filter(itemVisible);
    if (!visibleItems.length) continue;
    const title = document.createElement('div');
    title.className = 'category-title';
    title.textContent = group.name;
    container.appendChild(title);
    renderItemGrid(container, visibleItems);
  }
}

function updateBreadcrumb() {
  const bc = $('menu-breadcrumb');
  const backBtn = $('btn-menu-back');
  if (viewAllMode || drillPath.length === 0) {
    bc.textContent = viewAllMode ? 'Tutto il menu' : '';
    backBtn.classList.add('hidden');
    return;
  }
  bc.textContent = drillPath.map(c => c.name).join(' › ');
  backBtn.classList.remove('hidden');
}

function renderMenu() {
  const grid = $('menu-grid');
  grid.innerHTML = '';
  updateBreadcrumb();
  $('btn-ticket-birra').classList.toggle('hidden', !settings.eventMode);

  if (viewAllMode) { renderAllFlat(grid); return; }

  if (drillPath.length === 0) { renderMacroTiles(grid); return; }

  const macro = drillPath[0];
  if (drillPath.length === 1) {
    if (macro.subcategories) renderSubTiles(grid, macro);
    else renderItemGrid(grid, macro.items);
    return;
  }
  renderItemGrid(grid, drillPath[1].items);
}

$('btn-menu-back').addEventListener('click', () => { drillPath.pop(); renderMenu(); });

$('btn-view-all').addEventListener('click', () => {
  viewAllMode = !viewAllMode;
  drillPath = [];
  $('btn-view-all').classList.toggle('active', viewAllMode);
  $('btn-view-all').textContent = viewAllMode ? 'Vista categorie' : 'Vedi tutto il menu';
  renderMenu();
});

$('btn-ticket-birra').addEventListener('click', () => addToCart(MENU.ticketBirra.key, null));

// ---------- product customization (burger ingredients/add-ons, patatine fritte sauce) ----------

function onItemTapped(itemKey) {
  const entry = ITEM_INDEX[itemKey];
  if (entry.customizableType === 'burger') openCustomizeBurger(itemKey);
  else if (entry.customizableType === 'fries') openCustomizeFries(itemKey);
  else addToCart(itemKey, null);
}

function openCustomizeBurger(itemKey) {
  const entry = ITEM_INDEX[itemKey];
  $('customize-title').textContent = entry.item.name;
  const body = $('customize-body');
  body.innerHTML = '';

  const ingLabel = document.createElement('div');
  ingLabel.className = 'customize-section-label';
  ingLabel.textContent = 'Ingredienti (− per togliere)';
  body.appendChild(ingLabel);

  for (const ing of entry.ingredients) {
    body.appendChild(customizeToggleRow('ingredient', ing, true));
  }

  const addonLabel = document.createElement('div');
  addonLabel.className = 'customize-section-label';
  addonLabel.textContent = 'Aggiunte (+ per aggiungere)';
  body.appendChild(addonLabel);

  for (const addon of BURGER_ADDONS) {
    body.appendChild(customizeToggleRow('addon', addon, false));
  }

  $('modal-customize').classList.remove('hidden');
  $('customize-confirm').onclick = () => {
    const removed = [];
    const addons = [];
    body.querySelectorAll('.customize-toggle-row[data-kind="ingredient"]').forEach(row => { if (row.dataset.active === 'false') removed.push(row.dataset.value); });
    body.querySelectorAll('.customize-toggle-row[data-kind="addon"]').forEach(row => { if (row.dataset.active === 'true') addons.push(row.dataset.value); });
    const customization = (removed.length || addons.length) ? { removed, addons } : null;
    $('modal-customize').classList.add('hidden');
    addToCart(itemKey, customization);
  };
}

// A row with a name and a single − / + toggle button.
// `kind` = 'ingredient' (starts active/included, − removes it) or
// 'addon' (starts inactive/not-added, + adds it). Tapping the button flips
// `active` and swaps the button's symbol and styling to match.
function customizeToggleRow(kind, value, active) {
  const row = document.createElement('div');
  row.className = 'customize-toggle-row';
  row.dataset.kind = kind;
  row.dataset.value = value;
  row.dataset.active = String(active);
  row.innerHTML = `<span class="cz-name">${value}</span><button type="button" class="cz-toggle-btn"></button>`;

  const btn = row.querySelector('.cz-toggle-btn');
  const applyState = () => {
    const isActive = row.dataset.active === 'true';
    // ingredient: active = included (show − to remove); inactive = removed (show + to re-add)
    // addon: active = added (show − to remove); inactive = not added (show + to add)
    // Button color follows the symbol, not the section: + is always orange, − is always neutral.
    btn.textContent = isActive ? '−' : '+';
    btn.classList.toggle('cz-btn-plus', !isActive);
    btn.classList.toggle('cz-btn-minus', isActive);
    row.classList.toggle('cz-removed', kind === 'ingredient' && !isActive);
    row.classList.toggle('cz-added', kind === 'addon' && isActive);
  };
  btn.addEventListener('click', () => {
    row.dataset.active = String(row.dataset.active !== 'true');
    applyState();
  });
  applyState();
  return row;
}

function openCustomizeFries(itemKey) {
  const entry = ITEM_INDEX[itemKey];
  $('customize-title').textContent = entry.item.name;
  const body = $('customize-body');
  body.innerHTML = '';

  const label = document.createElement('div');
  label.className = 'customize-section-label';
  label.textContent = 'Salsa (opzionale)';
  body.appendChild(label);

  const noneRow = document.createElement('label');
  noneRow.className = 'customize-row';
  noneRow.innerHTML = `<input type="radio" name="sauce" value="" checked><span>Nessuna salsa</span>`;
  body.appendChild(noneRow);

  for (const sauce of FRIES_SAUCES) {
    const row = document.createElement('label');
    row.className = 'customize-row';
    row.innerHTML = `<input type="radio" name="sauce" value="${sauce}"><span>${sauce}</span>`;
    body.appendChild(row);
  }

  $('modal-customize').classList.remove('hidden');
  $('customize-confirm').onclick = () => {
    const checked = body.querySelector('input[name="sauce"]:checked');
    const sauce = checked && checked.value ? checked.value : null;
    $('modal-customize').classList.add('hidden');
    addToCart(itemKey, sauce ? { sauce } : null);
  };
}

$('customize-cancel').addEventListener('click', () => $('modal-customize').classList.add('hidden'));

// ---------- cart ----------

function customizationSignature(cz) {
  if (!cz) return '';
  const removed = (cz.removed || []).slice().sort().join(',');
  const addons = (cz.addons || []).slice().sort().join(',');
  const sauce = cz.sauce || '';
  return `r:${removed}|a:${addons}|s:${sauce}`;
}

function customizationSummary(cz) {
  if (!cz) return '';
  const parts = [];
  for (const ing of cz.removed || []) parts.push(`SENZA ${ing}`);
  for (const ad of cz.addons || []) parts.push(`+ ${ad}`);
  if (cz.sauce) parts.push(`Salsa: ${cz.sauce}`);
  return parts.join(', ');
}

function addToCart(itemKey, customization) {
  const lineId = itemKey + '::' + customizationSignature(customization);
  const found = cart.find(l => l.lineId === lineId);
  if (found) { found.qty++; }
  else {
    const { item } = ITEM_INDEX[itemKey];
    cart.push({ lineId, itemKey, name: item.name, unitPrice: item.price, qty: 1, customization: customization || null });
  }
  renderCart();
}

function changeQty(lineId, delta) {
  const line = cart.find(l => l.lineId === lineId);
  if (!line) return;
  line.qty += delta;
  if (line.qty <= 0) cart = cart.filter(l => l !== line);
  renderCart();
}

function removeLine(lineId) {
  cart = cart.filter(l => l.lineId !== lineId);
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
    const summary = customizationSummary(line.customization);
    row.innerHTML = `
      <span class="name">${line.name}${summary ? `<br><small class="cz-summary">${summary}</small>` : ''}</span>
      <span class="stepper">
        <button class="minus">−</button>
        <span class="qty">${line.qty}</span>
        <button class="plus">+</button>
      </span>
      <span class="line-total">${money(line.unitPrice * line.qty)}</span>
      <button class="remove">×</button>`;
    row.querySelector('.minus').addEventListener('click', () => changeQty(line.lineId, -1));
    row.querySelector('.plus').addEventListener('click', () => changeQty(line.lineId, +1));
    row.querySelector('.remove').addEventListener('click', () => removeLine(line.lineId));
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

function cartHasKitchenItems() {
  return cart.some(l => ITEM_INDEX[l.itemKey].receiptTarget === 'kitchen');
}

$('btn-stampa').addEventListener('click', () => {
  if (!cart.length) return;
  $('pay-total').textContent = fmtEuro(cartTotal());
  $('pay-cash').value = '';
  $('pay-change').classList.add('hidden');
  $('pay-cash-section').classList.toggle('hidden', !settings.changeCalc);
  $('pay-disc').value = '';
  $('pay-disc').classList.remove('field-invalid');
  $('pay-disc-error').classList.add('hidden');
  $('pay-disc-section').classList.toggle('hidden', !cartHasKitchenItems());
  $('modal-payment').classList.remove('hidden');
});

$('pay-cancel').addEventListener('click', () => $('modal-payment').classList.add('hidden'));

$('pay-disc').addEventListener('input', () => {
  $('pay-disc').classList.remove('field-invalid');
  $('pay-disc-error').classList.add('hidden');
});

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
  const needsDisc = cartHasKitchenItems();
  const discNumber = $('pay-disc').value.trim();
  if (needsDisc && !discNumber) {
    $('pay-disc').classList.add('field-invalid');
    $('pay-disc-error').classList.remove('hidden');
    $('pay-disc').focus();
    return;
  }

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
      tabletLabel: settings.tabletLabel || '',
      discNumber: needsDisc ? discNumber : null,
      createdAt: new Date().toISOString(),
      total,
      cashReceived,
      changeDue: cashReceived != null ? +(cashReceived - total).toFixed(2) : null,
      status: 'saved',
      printStatus: {},
      items: cart.map(l => ({
        itemKey: l.itemKey, name: l.name, unitPrice: l.unitPrice,
        qty: l.qty, lineTotal: +(l.unitPrice * l.qty).toFixed(2),
        customization: l.customization || null,
        receiptTarget: ITEM_INDEX[l.itemKey].receiptTarget
      }))
    };
    await saveOrder(order);

    $('modal-payment').classList.add('hidden');
    cart = [];
    renderCart();

    await printOrderReceipts(order, false);
  } finally {
    btn.disabled = false;
  }
}

// ---------- multi-station printing ----------
// Kitchen items print on the shared 'kitchen' printer, PLUS a copy on THIS
// tablet's own 'station' printer — kept at the register so staff have proof
// of what was ordered if a customer disputes it later. Drinks and dolci
// each print as their own ticket, both on the 'station' printer too (there's
// no separate physical dolci printer). Print status is tracked per receipt
// TYPE (kitchen/kitchenCopy/drinks/dolci), not per physical printer role,
// since several receipt types can share one role.

const RECEIPT_ROLE = { kitchen: 'kitchen', kitchenCopy: 'station', drinks: 'station', dolci: 'station' };

function buildReceiptJobs(order) {
  const byTarget = { kitchen: [], drinks: [], dolci: [] };
  // Older saved orders (from before this menu had receipt routing) lack
  // `receiptTarget` on their lines — fall back to the drinks ticket so a
  // reprint never crashes on stale data.
  for (const it of order.items) (byTarget[it.receiptTarget] || byTarget.drinks).push(it);

  const jobs = [];
  if (byTarget.kitchen.length) {
    jobs.push({ target: 'kitchen', role: RECEIPT_ROLE.kitchen, layout: kitchenTicketLayout(order, byTarget.kitchen), label: 'comanda cucina' });
    jobs.push({ target: 'kitchenCopy', role: RECEIPT_ROLE.kitchenCopy, layout: kitchenTicketLayout(order, byTarget.kitchen, true), label: 'copia comanda cucina (cassa)' });
  }
  if (byTarget.drinks.length) {
    jobs.push({ target: 'drinks', role: RECEIPT_ROLE.drinks, layout: drinksTicketLayout(order, byTarget.drinks), label: 'scontrino bibite' });
  }
  if (byTarget.dolci.length) {
    jobs.push({ target: 'dolci', role: RECEIPT_ROLE.dolci, layout: dolciTicketLayout(order, byTarget.dolci), label: 'scontrino dolci' });
  }
  return jobs;
}

// onlyFailed = true → retry just the jobs that didn't print yet (used by the
// inline error banner's Ristampa); false → reprint every applicable receipt
// (used by the Ordini list's explicit Ristampa on an already-saved order).
async function printOrderReceipts(order, onlyFailed) {
  let jobs = buildReceiptJobs(order);
  if (onlyFailed) jobs = jobs.filter(j => order.printStatus[j.target] !== 'printed');

  let anyError = null;
  let prevRole = null;   // tracks the last SUCCESSFULLY printed job's role
  for (const job of jobs) {
    if (prevRole === job.role) {
      // Same physical printer as the previous job, back to back — pause so
      // whoever's at the register can tear the first ticket off before the
      // next one starts (most of these printers have no auto-cutter).
      if (Printer.onTearPause) Printer.onTearPause(job.role);
      await new Promise(r => setTimeout(r, TEAR_PAUSE_MS));
    }
    try {
      await Printer.printLayout(job.role, job.layout, settings.copies);
      order.printStatus[job.target] = 'printed';
      prevRole = job.role;
    } catch (e) {
      console.error(`Print failed [${job.target} → ${job.role}]:`, e);
      order.printStatus[job.target] = 'failed';
      anyError = anyError || e;
      prevRole = null; // nothing actually printed — no ticket to tear before the next job
    }
  }
  const allTargets = buildReceiptJobs(order).map(j => j.target);
  order.status = allTargets.every(target => order.printStatus[target] === 'printed') ? 'printed' : 'partial';
  await saveOrder(order);

  if (anyError) {
    lastFailedOrderId = order.id;
    const failedLabels = jobs.filter(j => order.printStatus[j.target] !== 'printed').map(j => j.label).join(', ');
    showPrintError(`Errore di stampa (${failedLabels || 'stampante'}) per l'ordine n. ${formatOrderNumber(order)}. L'ordine è salvato.`);
  } else {
    hidePrintError();
    toast(`Ordine n. ${formatOrderNumber(order)} stampato`);
  }
}

// ---------- print error banner / Ristampa ----------

function showPrintError(msg, withRistampa) {
  $('print-error-text').textContent = msg;
  $('btn-ristampa').classList.toggle('hidden', withRistampa === false);
  $('print-error').classList.remove('hidden');
}

function errText(e) {
  return (e && (e.message || e.name)) || String(e);
}
function hidePrintError() {
  $('print-error').classList.add('hidden');
}

$('btn-error-close').addEventListener('click', hidePrintError);
$('btn-ristampa').addEventListener('click', async () => {
  if (!lastFailedOrderId) return;
  const order = await getOrder(lastFailedOrderId);
  if (!order) return;
  await printOrderReceipts(order, true);
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
      <span class="num">N. ${formatOrderNumber(o)}</span>
      ${o.discNumber ? `<span class="disc">🔔 ${o.discNumber}</span>` : ''}
      <span class="time">${time}</span>
      <span class="count">${count} pezzi</span>
      ${o.status !== 'printed' ? '<span class="badge">non stampata</span>' : ''}
      <span class="total">${fmtEuro(o.total)}</span>`;
    row.addEventListener('click', () => showOrderDetail(o));
    el.appendChild(row);
  }
}

function showOrderDetail(order) {
  $('order-detail-title').textContent = `Ordine N. ${formatOrderNumber(order)}`
    + (order.discNumber ? ` — Dischetto ${order.discNumber}` : '');
  $('order-detail-body').innerHTML = `<pre>${layoutToText(orderTicketLayout(order))}</pre>`;
  $('modal-order').classList.remove('hidden');
  $('order-detail-reprint').onclick = async () => {
    $('modal-order').classList.add('hidden');
    order.printStatus = order.printStatus || {};
    await printOrderReceipts(order, false);
  };
}
$('order-detail-close').addEventListener('click', () => $('modal-order').classList.add('hidden'));

// ---------- report ----------

async function buildReport() {
  const orders = await getAllOrders();
  const categories = flattenCategories().map(group => ({
    name: group.name,
    qty: 0, revenue: 0,
    items: group.items.map(i => ({ key: i.key, name: i.name, qty: 0, revenue: 0 }))
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
  const rows = [['numero', 'dischetto', 'orario', 'prodotto', 'personalizzazione', 'quantita', 'prezzo_unitario', 'totale_riga', 'totale_ordine']];
  for (const o of [...orders].sort((a, b) => a.number - b.number)) {
    for (const line of o.items) {
      rows.push([
        formatOrderNumber(o), o.discNumber || '', o.createdAt, `"${line.name}"`, `"${customizationSummary(line.customization)}"`,
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
    await Printer.printLayout('station', reportTicketLayout(r), 1);
    toast('Report stampato');
  } catch (e) {
    showPrintError('Errore di stampa del report.');
  }
});

// ---------- settings ----------

function renderSettings() {
  $('set-tablet-label').value = settings.tabletLabel || '';
  $('set-change-calc').checked = settings.changeCalc;
  $('set-copies').value = String(settings.copies);
  $('set-event-mode').checked = settings.eventMode;
  renderAddItemCategories();
  renderCustomItemsList();
}

async function updateSetting(key, value) {
  settings[key] = value;
  await saveSettings(settings);
  renderMenu();
}

$('set-tablet-label').addEventListener('change', e => {
  const label = e.target.value.trim().toUpperCase().slice(0, 3);
  e.target.value = label;
  updateSetting('tabletLabel', label);
});
$('set-change-calc').addEventListener('change', e => updateSetting('changeCalc', e.target.checked));
$('set-copies').addEventListener('change', e => updateSetting('copies', parseInt(e.target.value, 10)));
$('set-event-mode').addEventListener('change', e => updateSetting('eventMode', e.target.checked));

// ---------- settings: add a menu item on the fly ----------

function renderAddItemCategories() {
  const sel = $('add-item-category');
  const prev = sel.value;
  sel.innerHTML = addableCategories().map(c => `<option value="${c.name}">${c.name}</option>`).join('');
  if (prev && addableCategories().some(c => c.name === prev)) sel.value = prev;
}

function renderCustomItemsList() {
  const list = $('custom-items-list');
  const items = settings.customItems || [];
  if (!items.length) { list.innerHTML = ''; return; }
  list.innerHTML = items.map(it => `
    <div class="custom-item-row">
      <span class="custom-item-name">${it.name}</span>
      <span class="custom-item-cat">${it.category}</span>
      <span>${fmtEuro(it.price)}</span>
      <button class="btn-remove-item" data-key="${it.key}" title="Rimuovi">×</button>
    </div>
  `).join('');
}

$('btn-add-item').addEventListener('click', async () => {
  const category = $('add-item-category').value;
  const name = $('add-item-name').value.trim();
  const price = parseFloat($('add-item-price').value);
  if (!category) { toast('Nessuna categoria disponibile'); return; }
  if (!name) { toast('Inserisci un nome'); return; }
  if (!(price >= 0)) { toast('Inserisci un prezzo valido'); return; }

  const item = {
    key: 'custom_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    name, price, category
  };
  settings.customItems = settings.customItems || [];
  settings.customItems.push(item);
  await saveSettings(settings);
  applyCustomItems([item]);
  rebuildItemIndex();

  $('add-item-name').value = '';
  $('add-item-price').value = '';
  renderCustomItemsList();
  renderMenu();
  toast('Voce aggiunta al menu');
});

$('custom-items-list').addEventListener('click', async e => {
  const btn = e.target.closest('.btn-remove-item');
  if (!btn) return;
  const key = btn.dataset.key;
  settings.customItems = (settings.customItems || []).filter(it => it.key !== key);
  await saveSettings(settings);
  removeCustomItemFromMenu(key);
  rebuildItemIndex();
  renderCustomItemsList();
  renderMenu();
  toast('Voce rimossa');
});

document.querySelectorAll('.btn-select-printer').forEach(btn => {
  btn.addEventListener('click', async () => {
    const role = btn.dataset.role;
    const conn = btn.dataset.conn; // 'ble' | 'usb'
    if (conn === 'usb' && !Printer.availableUSB) { toast('USB non disponibile in questo browser'); return; }
    if (conn === 'ble' && !Printer.availableBLE) { toast('Bluetooth non disponibile: uso stampa browser'); return; }
    try {
      if (conn === 'usb') await Printer.selectAndConnectUSB(role);
      else await Printer.selectAndConnect(role);
      hidePrintError();
      toast('Stampante connessa');
    } catch (e) {
      console.error(e);
      if (e && e.name === 'NotFoundError') toast('Nessuna stampante selezionata');
      else showPrintError('Connessione fallita — ' + errText(e), false);
    }
  });
});

document.querySelectorAll('.btn-test-print').forEach(btn => {
  btn.addEventListener('click', async () => {
    const role = btn.dataset.role;
    const roleLabel = PRINTER_ROLES.find(r => r.id === role).label;
    try {
      await Printer.printLayout(role, testTicketLayout(roleLabel), 1);
      toast('Prova stampata');
    } catch (e) {
      showPrintError('Errore di stampa di prova. Controlla la connessione.');
    }
  });
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

// ---------- printer status / reconnect (per role) ----------

Printer.onStatusChange = (role, connected, name) => {
  const chip = $('printer-chip-' + role);
  if (!chip) return;
  const label = PRINTER_ROLES.find(r => r.id === role).label;
  chip.textContent = label + ': ' + (connected ? 'Connessa' : 'Disconnessa');
  chip.className = 'chip ' + (connected ? 'connected' : 'disconnected');
};

Printer.onDeviceSelected = (role, deviceId) => {
  settings.printerDevices[role] = deviceId;
  saveSettings(settings);
};

Printer.onTearPause = () => {
  toast('Strappa lo scontrino prima del prossimo…', TEAR_PAUSE_MS);
};

document.querySelectorAll('.btn-reconnect').forEach(btn => {
  btn.addEventListener('click', async () => {
    const role = btn.dataset.role;
    if (!Printer.available) { toast('Bluetooth/USB non disponibili in questo browser'); return; }
    try {
      await Printer.reconnect(role, settings.printerDevices[role]);
      hidePrintError();
      toast('Stampante connessa');
    } catch (e) {
      console.error(e);
      if (e && e.name === 'NotFoundError') toast('Nessuna stampante selezionata');
      else showPrintError('Connessione fallita — ' + errText(e), false);
    }
  });
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
  applyCustomItems(settings.customItems);
  rebuildItemIndex();
  $('event-name').textContent = MENU.event;
  document.title = 'Cassa — ' + MENU.event;
  renderMenu();
  renderCart();
  keepAwake();
  Printer.tryAutoReconnectAll(settings.printerDevices);

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
