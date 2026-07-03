# Cassa — Cena Sotto le Stelle

POS da cassa per una serata: iPad + browser **Bluefy** + stampante termica **Bisofice 58mm** via Bluetooth. App 100% client-side (PWA): nessun server, ordini salvati in locale (IndexedDB), stampa Bluetooth che funziona anche senza internet.

## 1. Pubblicare l'app (una volta sola)

Serve un URL **HTTPS** (Web Bluetooth lo richiede). Il modo più semplice è GitHub Pages:

1. Crea un repository su GitHub e carica tutti i file di questa cartella.
2. Su GitHub: **Settings → Pages → Deploy from branch → main → / (root)**.
3. Dopo ~1 minuto l'app è su `https://<utente>.github.io/<repo>/`.

(In alternativa: Netlify o Vercel, trascinando la cartella.)

## 2. Preparare l'iPad

1. Installa **"Bluefy – Web BLE Browser"** dall'App Store (gratis).
2. Attiva il **Bluetooth** dell'iPad e accendi la stampante Bisofice.
3. Apri l'URL HTTPS dell'app **dentro Bluefy** (non Safari — Safari non ha Web Bluetooth).
4. Tieni l'iPad **in carica** durante la serata.

## 3. Collegare la stampante

1. Vai in **Impostazioni** (PIN predefinito: **1234**) → **Seleziona stampante**.
2. Bluefy mostra i dispositivi Bluetooth: scegli la **Bisofice** e concedi l'accesso.
3. Tocca **Stampa di prova**: deve uscire uno scontrino con caratteri accentati corretti.
4. Il chip in alto mostra **Connessa**. Se cade la connessione: **Riconnetti stampante**.

## 4. Prima dell'evento

- **Impostazioni → Azzera serata** (PIN): cancella gli ordini di prova e riparte dal n. 1.
- Verifica le opzioni: calcolo del resto, copie comanda, categoria "Cena al banco".
- Carta: rotoli **57,5 mm, diametro ≤ 50 mm** — tieni diversi ricambi in cassa.

## 5. Uso in cassa

1. Tocca i prodotti → si aggiungono all'ordine (− / + per le quantità).
2. **Stampa comanda** → conferma il totale (opzionale: contanti ricevuti → resto).
3. Lo scontrino esce dalla stampante; il cliente lo porta al **bar** per il ritiro.
4. Se la stampa fallisce: **l'ordine è comunque salvato** — riconnetti la stampante e tocca **Ristampa**. Ogni comanda si può ristampare anche da **Ordini**.

A fine serata: **Report** → totali per prodotto e categoria, **Esporta CSV/JSON**, **Stampa report** per la riconciliazione della cassa.

## 6. Piano offline (importante)

La cache offline di Bluefy **non è garantita** come quella di Chrome. Piano pratico:

1. **Carica l'app in Bluefy prima dell'apertura** e **lascia la scheda aperta** tutta la sera.
2. Tieni un **hotspot del telefono** di riserva per ricaricare la pagina se dovesse chiudersi.
3. Stampa Bluetooth e salvataggio ordini funzionano **senza internet** in ogni caso.

**Test obbligatorio prima dell'evento** (iPad vero + Bisofice vera):
- Il selettore Bluetooth trova la Bisofice e si collega.
- Uno scontrino reale esce corretto a 58 mm.
- Attiva la **modalità aereo** dopo il caricamento: l'app continua a funzionare e stampare.
- Spegni/riaccendi la stampante: **Riconnetti stampante** ricollega.

## 7. Test su computer (senza stampante)

Apri `index.html` in Chrome: tutto funziona; la stampa usa la finestra di stampa del browser (anteprima testuale dello scontrino a 32 colonne). Per servire in locale: `python3 -m http.server` nella cartella.

## 8. Note tecniche

- File statici, nessun build step: `index.html`, `styles.css`, `menu.js` (listino modificabile), `db.js`, `escpos.js`, `printer.js`, `app.js`, `sw.js`.
- Ticket ESC/POS a **32 colonne** (58 mm), code page **CP858** (accenti italiani + €), scrittura BLE a blocchi da ~120 byte.
- Servizi BLE candidati: `0x18F0`, `0xFFE0`, `0xFF00`, Nordic UART — la caratteristica di scrittura viene rilevata a runtime.
- PIN impostazioni/azzeramento: `1234` (modificabile in `db.js`, `DEFAULT_SETTINGS`).

### Piano B (solo se Bluefy non funzionasse con questa stampante)

Impacchettare la **stessa** web app con **Capacitor** + plugin `@capacitor-community/bluetooth-le` (CoreBluetooth) e distribuire via TestFlight. Richiede account Apple Developer (99 €/anno) e un Mac con Xcode. Non è il percorso predefinito.
