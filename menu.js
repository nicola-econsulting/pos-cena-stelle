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
    // From "Nero Vintage Cibo Hamburger Street Food Menù" (2-page PDF).
    // Bond Burger's "o" choice (cipolla caramellata O cavolo cappuccio viola)
    // is modelled as: both listed as removable ingredients, so whichever one
    // isn't wanted gets removed — the customization engine doesn't have a
    // dedicated "choose one of two" type.
    { "name": "Burger", "receiptTarget": "kitchen", "customizable": "burger", "items": [
      { "key": "contra_burger", "name": "Contra'Burger", "price": 8.00,
        "ingredients": ["Cipolla Caramellata", "Peperoni", "Cheddar"] },
      { "key": "cheeseburger", "name": "Cheeseburger", "price": 7.00,
        "ingredients": ["Pomodoro", "Insalata", "Cheddar"] },
      { "key": "easy_burger", "name": "Easy Burger", "price": 6.00,
        "ingredients": ["Pomodoro", "Insalata"] },
      { "key": "bond_burger", "name": "Bond Burger", "price": 8.00,
        "ingredients": ["Cipolla Caramellata", "Cavolo Cappuccio Viola", "Cheddar"] },
      { "key": "hot_dog", "name": "Hot Dog", "price": 6.00, "ingredients": [] },
      { "key": "cicchetto_mare", "name": "Cicchetto di Mare", "price": 3.00, "ingredients": [] },
      { "key": "patatine_fritte", "name": "Patatine Fritte", "price": 3.00, "ingredients": [] }
    ]},
    { "name": "Piatti", "receiptTarget": "kitchen", "items": [
      { "key": "maccheroni_anitra", "name": "Maccheroni all'Anitra", "price": 8.00 },
      { "key": "pasta_bianco", "name": "Pasta in Bianco", "price": 5.00 },
      { "key": "pasta_pomodoro", "name": "Pasta al Pomodoro", "price": 6.00 },
      { "key": "trippe_pane", "name": "Trippe più Pane", "price": 9.00 },
      { "key": "baccala_polenta", "name": "Baccalà e Polenta", "price": 14.00 },
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
