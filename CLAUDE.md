# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Palestra is a gym tracker PWA in Italian, made to be installed on iPhones ("Aggiungi a Home"). It is plain HTML/CSS/JS: no framework, no bundler, no npm scripts. The UI text is Italian and code comments are mostly English. Keep both that way.

## Commands

- **Run locally:** use the `.claude/launch.json` preview servers. `palestra` (port 8123) serves the source files as they are, `palestra-dist` (port 8124) serves the built `dist/`.
- **Build:** `python3 build.py` inlines `styles.css`, `exercises.js` and `app.js` into a single `dist/index.html`, then copies `sw.js`, the manifest and the icons. It asserts on the exact `<link>`/`<script>` lines in `index.html`: if you change those lines, update the `replace()` calls in `build.py`. Don't write the strings `</script` or `</style` in the code, because they would break the inlined file.
- **Tests:** there is no test runner. Open the app with `?selftest` (e.g. `http://localhost:8123/?selftest`) to run `selftest()` at the bottom of `app.js`. It shows "Tutti i N controlli ok" in a sheet and logs a `console.table`. Add new checks to the `eq(...)` list there.
- **Deploy:** push to `main` on GitHub. Netlify builds from `netlify.toml` (`python3 build.py`, publish `dist/`, functions in `netlify/functions`). Nothing needs to be installed locally: the user deliberately removed Node and the Netlify CLI, so don't reintroduce local npm tooling.

## Architecture

- **`app.js` is the whole app.** One global state object `S` is persisted to `localStorage` under `palestra.v1`. `V` holds the UI state that is not saved (tab, navigation stack, open sheet, form drafts).
- **Data enters through `valid()` + `migrate()`.** Data from `localStorage`, from imported files and from cloud backups is untrusted. `valid()` only accepts safe shapes, because ids and numbers are interpolated into HTML. `migrate()` fills defaults and adds new `LIBRARY` exercises (from `exercises.js`) to existing installs. When you add a field to `S`, update both functions.
- **Rendering:** `render()` rebuilds `#app.innerHTML` from template-string view functions (`viewStart`, `viewActive`, `viewSetup`, `viewCharts`, plus the stack views keyed by `V.stack[].k`). Always pass user text through `esc()`. `done()` = `save()` + `render()`.
- **Events are delegated.** Buttons carry `data-act="name" data-arg="..."`, which dispatches to the `ACT` object. Inputs carry `data-in="name"`, which dispatches to `IN`. Add behavior by adding a method there, not by attaching listeners. Modal UI goes through `showSheet()`, `ask()` (confirm, because native `confirm()` is blocked in some webviews) and `notice()`.
- **Cloud backup** ("Backup cloud" section in `app.js` + `netlify/functions/backup.mjs`):
  - `GET`/`PUT /api/backup?user=<name>` stores one JSON per username in Netlify Blobs. Only the last copy is kept and there is no auth, by design: the app is shared among friends.
  - `save()` sets `localStorage` `palestra.v1.pending`, and `backup()` sends only when it is set. `backup()` is called only when something is stored for good: finishing a workout, setting its mood, saving or deleting an exercise, deleting a workout (or its last set), switching user. There are no timers or background triggers: other changes stay local and go with the next of these. Call `backup()` after `done()`, never before.
  - Invariants: an empty app never uploads. A username that already has a backup is set only when the user taps Ripristina. Import keeps the current username. Changing username (`switchUser`) first flushes the old user's data, then replaces the local data with the new user's backup, and refuses to do so offline.
- **`sw.js`** is network-first with a cache fallback, so the app works offline. It must never cache `/api/` responses. Its file list covers both the multi-file source and the single-file build.
