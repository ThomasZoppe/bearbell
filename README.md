# Bearbell

<img src="icons/icon-512.png" alt="Icona di Bearbell: un orso bianco con la fascia arancione su sfondo nero" width="120">

Bearbell è un tracker per la palestra, in italiano, pensato per iPhone. È una web app (PWA): si apre da Safari e si installa con **Condividi > Aggiungi a Home**, senza passare dall'App Store.

## Cosa fa

- **Workout**: scegli una scheda e registra serie, ripetizioni e carichi. Ogni serie parte con peso e ripetizioni dell'ultima volta, e c'è un timer per la pausa tra le serie.
- **Setup**: crei e modifichi le schede, partendo da una libreria di esercizi divisi per distretto muscolare, e imposti tempi di recupero e incrementi di peso.
- **Grafici**: costanza negli allenamenti, progressi per esercizio, durata delle pause e distretti allenati.
- **Funziona offline**: i dati restano sul telefono e l'app si apre anche senza connessione.
- **Backup**: puoi esportare e importare un file JSON, oppure scegliere un nome utente per tenere una copia online e ritrovare i dati su un altro telefono.

## Attenzione al backup online

Il backup online non ha password: chi conosce il tuo nome utente può leggere e sovrascrivere i tuoi dati. È una scelta voluta, perché l'app è pensata per un gruppo di amici. Se vuoi pubblicarla per sconosciuti, prima aggiungi un'autenticazione.

## Come è fatta

HTML, CSS e JavaScript senza framework né bundler.

| File | Contenuto |
| --- | --- |
| `index.html` | struttura della pagina e animazione di apertura |
| `app.js` | tutta l'app: stato, schermate, eventi, backup |
| `exercises.js` | libreria degli esercizi |
| `styles.css` | stile, tema chiaro e scuro |
| `sw.js` | service worker per l'uso offline |
| `netlify/functions/backup.mjs` | API del backup online (Netlify Functions + Netlify Blobs) |
| `build.py` | unisce tutto in un solo `dist/index.html` |

### Provarla in locale

```bash
python3 -m http.server 8123
```

Poi apri `http://localhost:8123`. Il backup online in locale non funziona, perché ha bisogno di Netlify. Con `http://localhost:8123/?selftest` parte un controllo automatico dei calcoli.

### Pubblicarla

Su Netlify, collegando questa repository: il file `netlify.toml` imposta già la build (`python3 build.py`), la cartella da pubblicare (`dist`) e le funzioni. Non servono chiavi né variabili d'ambiente.
