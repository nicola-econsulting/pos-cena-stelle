// ESC/POS ticket building for 58mm printers (32 columns), no external deps.
// A ticket "layout" is an array of ops; it renders both to ESC/POS bytes
// (Bluetooth path) and to plain text (window.print() fallback).

const COLS = 32;
const COLS_DOUBLE = 16; // double-width halves the columns

// CP858 mapping for the non-ASCII chars we need (Italian accents).
// NOTE: the Bisofice prints garbage for CP858's € (0xD5) — accents are fine,
// so it's really on CP437. We print a plain 'E' for € instead (same width).
const CP858 = {
  'à': 0x85, 'è': 0x8A, 'é': 0x82, 'ì': 0x8D, 'ò': 0x95, 'ù': 0x97,
  'À': 0xB7, 'È': 0xD4, 'É': 0x90, 'Ì': 0xDE, 'Ò': 0xE3, 'Ù': 0xEB,
  '€': 0x45, '°': 0xF8, 'ç': 0x87, 'ü': 0x81, 'ö': 0x94
};

function encodeCP858(text) {
  const out = [];
  for (const ch of text) {
    const code = ch.codePointAt(0);
    if (code < 0x80) out.push(code);
    else if (CP858[ch] !== undefined) out.push(CP858[ch]);
    else out.push(0x3F); // '?'
  }
  return out;
}

// --- formatting helpers ---

function money(n) {
  return n.toFixed(2).replace('.', ',');
}

function centerText(str, width) {
  if (str.length >= width) return str.slice(0, width);
  const pad = Math.floor((width - str.length) / 2);
  return ' '.repeat(pad) + str;
}

// Left text + right-aligned text on one line; truncates left if needed
function padLine(left, right, width) {
  width = width || COLS;
  const maxLeft = width - right.length - 1;
  if (left.length > maxLeft) left = left.slice(0, maxLeft);
  return left + ' '.repeat(width - left.length - right.length) + right;
}

function hr() {
  return '-'.repeat(COLS);
}

function formatDateTime(iso) {
  const d = new Date(iso);
  const p = n => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}  ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function formatOrderNumber(n) {
  return String(n).padStart(4, '0');
}

// --- layout builders ---
// op: { text, center: bool, double: bool, bold: bool }

function orderTicketLayout(order) {
  const L = [];
  L.push({ text: MENU.event.toUpperCase(), center: true, bold: true });
  L.push({ text: hr() });
  L.push({ text: `COMANDA N. ${formatOrderNumber(order.number)}`, center: true, double: true });
  L.push({ text: formatDateTime(order.createdAt), center: true });
  L.push({ text: hr() });
  for (const it of order.items) {
    L.push({ text: padLine(`${it.qty}x ${it.name}`, money(it.lineTotal)) });
  }
  L.push({ text: hr() });
  L.push({ text: padLine('TOTALE', '€ ' + money(order.total), COLS_DOUBLE), double: true, bold: true });
  if (order.cashReceived != null) {
    L.push({ text: padLine('Contanti', money(order.cashReceived)) });
    L.push({ text: padLine('Resto', money(order.changeDue)) });
  }
  L.push({ text: hr() });
  L.push({ text: '>> RITIRA AL BAR <<', center: true, bold: true });
  L.push({ text: 'Grazie!', center: true });
  L.push(...sponsorFooter());
  return L;
}

// Credit footer — work donated to the parish by Ermilani Consulting
function sponsorFooter() {
  return [
    { text: hr() },
    { text: 'Cassa offerta da', center: true },
    { text: 'ERMILANI CONSULTING S.R.L.', center: true, bold: true },
    { text: 'Boutique Data Agency', center: true },
    { text: 'ermilaniconsulting.com', center: true }
  ];
}

function reportTicketLayout(report) {
  const L = [];
  L.push({ text: MENU.event.toUpperCase(), center: true, bold: true });
  L.push({ text: 'REPORT SERATA', center: true, double: true });
  L.push({ text: formatDateTime(new Date().toISOString()), center: true });
  L.push({ text: hr() });
  L.push({ text: padLine('Ordini', String(report.orderCount)) });
  L.push({ text: hr() });
  for (const cat of report.categories) {
    if (cat.qty === 0) continue;
    L.push({ text: cat.name.toUpperCase().slice(0, COLS), bold: true });
    for (const it of cat.items) {
      if (it.qty === 0) continue;
      L.push({ text: padLine(`${it.qty}x ${it.name}`, money(it.revenue)) });
    }
  }
  L.push({ text: hr() });
  L.push({ text: padLine('TOTALE', '€ ' + money(report.total), COLS_DOUBLE), double: true, bold: true });
  L.push(...sponsorFooter());
  return L;
}

function testTicketLayout() {
  return [
    { text: MENU.event.toUpperCase(), center: true, bold: true },
    { text: hr() },
    { text: 'PROVA STAMPA', center: true, double: true },
    { text: formatDateTime(new Date().toISOString()), center: true },
    { text: hr() },
    { text: padLine('1x Caffè', money(1.00)) },
    { text: padLine('TOTALE', '€ ' + money(1.00), COLS_DOUBLE), double: true, bold: true },
    { text: hr() },
    { text: 'àèéìòù € OK', center: true },
    { text: 'Stampante connessa!', center: true }
  ];
}

// --- renderers ---

function layoutToBytes(layout) {
  const bytes = [];
  const push = (...b) => bytes.push(...b);
  push(0x1B, 0x40);        // ESC @ init
  push(0x1B, 0x74, 19);    // ESC t 19 → code page CP858
  for (const op of layout) {
    push(0x1B, 0x61, op.center ? 1 : 0);          // ESC a align
    push(0x1B, 0x45, op.bold ? 1 : 0);            // ESC E bold
    push(0x1D, 0x21, op.double ? 0x11 : 0x00);    // GS ! size (double w+h)
    push(...encodeCP858(op.text));
    push(0x0A);
  }
  push(0x1D, 0x21, 0x00, 0x1B, 0x45, 0);
  push(0x0A, 0x0A, 0x0A, 0x0A);                   // feed before cut
  push(0x1D, 0x56, 0x42, 0x00);                   // GS V 66 0 partial cut (harmless if no cutter)
  return new Uint8Array(bytes);
}

function layoutToText(layout) {
  return layout
    .map(op => op.center ? centerText(op.text, op.double ? COLS_DOUBLE : COLS) : op.text)
    .join('\n');
}
