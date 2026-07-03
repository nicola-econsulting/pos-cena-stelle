// Menu data — edit prices/items here (embedded to work without fetch/CORS issues)
const MENU = {
  "event": "Cena Sotto le Stelle",
  "currency": "€",
  "categories": [
    { "name": "Paella", "items": [
      { "key": "paella_asporto", "name": "Paella d'asporto", "price": 15.00 },
      { "key": "bis_paella",     "name": "Bis Paella",       "price": 10.00 }
    ]},
    { "name": "Birra", "items": [
      { "key": "birra_bionda",   "name": "Birra Bionda",     "price": 3.50 },
      { "key": "caraffa_birra",  "name": "Caraffa Birra",    "price": 15.00 }
    ]},
    { "name": "Vino", "items": [
      { "key": "vino",           "name": "Vino",             "price": 1.50 },
      { "key": "caraffa_vino",   "name": "Caraffa Vino",     "price": 7.00 }
    ]},
    { "name": "Bibite & Caffè", "items": [
      { "key": "bibita",         "name": "Coca / The / Fanta", "price": 3.00 },
      { "key": "caffe",          "name": "Caffè",            "price": 1.00 },
      { "key": "caffe_corretto", "name": "Caffè Corretto",   "price": 1.50 }
    ]},
    { "name": "Dolci", "items": [
      { "key": "crema_caffe",    "name": "Crema al Caffè",   "price": 2.50 },
      { "key": "gelato",         "name": "Gelato",           "price": 2.50 }
    ]},
    { "name": "Cena al banco", "hidden": true, "items": [
      { "key": "paella_cena",    "name": "Paella (cena)",    "price": 25.00 },
      { "key": "menu_pasta",     "name": "Menu Pasta",       "price": 8.00 }
    ]}
  ]
};
