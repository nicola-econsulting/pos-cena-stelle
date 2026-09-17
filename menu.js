// Menu data — edit prices/items here (embedded to work without fetch/CORS issues)
//
// Category shape:
//   { name, receiptTarget: 'kitchen'|'drinks'|'dolci', items: [...] }
//
// Item shape: { key, name, price }
//   + classicBeer: true → hidden when settings.eventMode is on, replaced by the
//     dedicated "Ticket Birra" button (see MENU.ticketBirra)
//   + customizable: 'burger' → ingredients can be removed, allowed add-ons are BURGER_ADDONS
//     ingredients: [...]        (required when customizable === 'burger')
//   + customizable: 'fries'   → an optional sauce can be added, from FRIES_SAUCES

const BURGER_ADDONS = ['Maionese', 'Ketchup'];
const FRIES_SAUCES = ['Ketchup', 'Maionese', 'Salsa Rosa', 'Barbecue'];

const MENU = {
  "event": "La Corte Rivive in Piazza",
  "currency": "€",
  "ticketBirra": { "key": "ticket_birra", "name": "Ticket Birra", "price": 4.00, "receiptTarget": "drinks" },
  "categories": [
    // Placeholder items/prices — burgers aren't part of the current menu yet,
    // real names/prices/ingredients to come later.
    { "name": "Burger", "receiptTarget": "kitchen", "customizable": "burger", "items": [
      { "key": "burger_classico", "name": "Burger Classico", "price": 7.00,
        "ingredients": ["Insalata", "Pomodoro", "Cipolla", "Cheddar", "Bacon"] },
      { "key": "burger_veg", "name": "Burger Veg", "price": 6.50,
        "ingredients": ["Insalata", "Pomodoro", "Cipolla", "Formaggio"] },
      { "key": "burger_doppio", "name": "Burger Doppio", "price": 9.00,
        "ingredients": ["Insalata", "Pomodoro", "Cipolla", "Cheddar", "Bacon"] }
    ]},
    { "name": "Piatti", "receiptTarget": "kitchen", "items": [
      { "key": "maccheroni_anitra", "name": "Maccheroni all'Anitra", "price": 8.00 },
      { "key": "pasta_bianco", "name": "Pasta in Bianco", "price": 5.00 },
      { "key": "pasta_pomodoro", "name": "Pasta al Pomodoro", "price": 6.00 },
      { "key": "trippe_pane", "name": "Trippe più Pane", "price": 9.00 },
      { "key": "baccala_polenta", "name": "Baccalà e Polenta", "price": 15.00 },
      { "key": "patatine_fritte", "name": "Patatine Fritte", "price": 3.00 },
      { "key": "fritella", "name": "Fritella", "price": 3.00 },
      { "key": "fritella_nutella", "name": "Fritella alla Nutella", "price": 3.50 },
      { "key": "torta_moia", "name": "Torta Moia", "price": 2.00 }
    ]},
    { "name": "Bibite", "receiptTarget": "drinks", "items": [
      { "key": "bibita_lattina", "name": "Bibite in Lattina", "price": 3.00 },
      { "key": "birra", "name": "Birra", "price": 4.00, "classicBeer": true },
      { "key": "acqua", "name": "Acqua", "price": 1.00 },
      { "key": "bicchiere_vino", "name": "Bicchiere di Vino", "price": 1.50 },
      { "key": "caffe", "name": "Caffè", "price": 1.00 }
    ]},
    { "name": "Caraffe", "receiptTarget": "drinks", "items": [
      { "key": "caraffa_birra", "name": "1 Litro Birra", "price": 10.00 },
      { "key": "caraffa_vino", "name": "1 Litro Vino", "price": 8.00 }
    ]},
    { "name": "Dolci", "receiptTarget": "dolci", "items": [
      { "key": "krapfen", "name": "Krapfen", "price": 2.00 }
    ]}
  ]
};
