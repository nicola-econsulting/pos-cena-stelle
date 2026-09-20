// Menu data — edit prices/items here (embedded to work without fetch/CORS issues)
//
// Category shape:
//   { name, receiptTarget: 'kitchen'|'drinks'|'dolci', items: [...] }
//
// Item shape: { key, name, price }
//   + classicBeer: true → hidden when settings.eventMode is on, replaced by the
//     dedicated "Ticket Birra" button (see MENU.ticketBirra)
//   + customizable: 'burger' → ingredients can be removed, and add-ons can be added.
//     ingredients: [...]        (required when customizable === 'burger'; [] if none removable)
//     addons: [...]             (optional per-item override; falls back to
//                                the category's `addons`, then BURGER_ADDONS)
//   + customizable: 'fries'   → an optional sauce can be added, from FRIES_SAUCES

const BURGER_ADDONS = ['Maionese', 'Ketchup'];
const FRIES_SAUCES = ['Ketchup', 'Maionese', 'Salsa Rosa', 'Barbecue'];

const MENU = {
  "event": "La Corte Rivive in Piazza",
  "currency": "€",
  "ticketBirra": { "key": "ticket_birra", "name": "Ticket Birra", "price": 4.00, "receiptTarget": "drinks" },
  "categories": [
    // Trimmed to today's event menu: Bond Burger, Hot Dog, Patatine Fritte.
    { "name": "Burger", "receiptTarget": "kitchen", "customizable": "burger", "items": [
      { "key": "bond_burger", "name": "Bond Burger", "price": 8.00,
        "ingredients": ["Cipolla Caramellata", "Cavolo Cappuccio Viola", "Cheddar"],
        "addons": ["Maionese", "Ketchup", "Peperoni"] },
      { "key": "hot_dog", "name": "Hot Dog", "price": 6.00, "ingredients": [] },
      { "key": "patatine_fritte", "name": "Patatine Fritte", "price": 3.00, "ingredients": [] }
    ]},
    // The 4 primi below get a free "Grana" add-on (no removable ingredients).
    { "name": "Piatti", "receiptTarget": "kitchen", "items": [
      { "key": "maccheroni_anitra", "name": "Maccheroni all'Anitra", "price": 8.00,
        "customizable": "burger", "ingredients": [], "addons": ["Grana"] },
      { "key": "pasta_bianco", "name": "Pasta in Bianco", "price": 5.00,
        "customizable": "burger", "ingredients": [], "addons": ["Grana"] },
      { "key": "pasta_pomodoro", "name": "Pasta al Pomodoro", "price": 6.00,
        "customizable": "burger", "ingredients": [], "addons": ["Grana"] },
      { "key": "trippe_pane", "name": "Trippe più Pane", "price": 9.00,
        "customizable": "burger", "ingredients": [], "addons": ["Grana"] },
      { "key": "baccala_polenta", "name": "Baccalà e Polenta", "price": 14.00 }
    ]},
    { "name": "Bibite", "receiptTarget": "drinks", "items": [
      { "key": "bibita_lattina", "name": "Bibite in Lattina", "price": 3.00 },
      { "key": "birra", "name": "Birra", "price": 3.50, "classicBeer": true },
      { "key": "acqua", "name": "Acqua", "price": 1.00 },
      { "key": "bicchiere_vino", "name": "Bicchiere di Vino", "price": 1.50 },
      { "key": "spritz_aperol", "name": "Spritz Aperol", "price": 4.00 },
      { "key": "spritz_bianco", "name": "Spritz Bianco", "price": 2.50 },
      { "key": "caffe", "name": "Caffè", "price": 1.00 }
    ]},
    { "name": "Caraffe", "receiptTarget": "drinks", "items": [
      { "key": "caraffa_birra", "name": "1 Litro Birra", "price": 12.00 },
      { "key": "caraffa_vino", "name": "1 Litro Vino", "price": 7.00 }
    ]},
    { "name": "Dolci", "receiptTarget": "dolci", "items": [
      { "key": "krapfen", "name": "Krapfen", "price": 2.00 },
      { "key": "fritella", "name": "Fritella", "price": 3.00 },
      { "key": "fritella_nutella", "name": "Fritella alla Nutella", "price": 3.50 }
    ]}
  ]
};
