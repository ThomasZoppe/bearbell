'use strict';
/* Tracker palestra — un solo file, dati in localStorage; copia di backup su Netlify (/api/backup) per nome utente. */

const DISTRICTS = ['petto', 'dorso', 'spalle', 'bicipiti', 'tricipiti', 'avambracci', 'quadricipiti', 'femorali', 'glutei', 'polpacci', 'addome'];
const MONTHS = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'];
const MONTHS_FULL = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'];
const DAYS = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'];
const DEFAULTS = { name: '', user: '', exec: 30, bandMin: 10, bandMax: 20, minExtra: 15, maxMin: 15, step: 2.5 };
const KEY = 'palestra.v1';
const DAY = 86400000;

const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const fmt = n => (Math.round(n * 100) / 100).toLocaleString('it-IT', { maximumFractionDigits: 2, useGrouping: false });
const fmt1 = n => (Math.round(n * 10) / 10).toLocaleString('it-IT', { maximumFractionDigits: 1, useGrouping: false });
const half = n => Math.round(n * 2) / 2;
const parseNum = v => { const n = parseFloat(String(v).replace(',', '.')); return isFinite(n) && n >= 0 ? n : 0; };
const mmss = sec => { sec = Math.max(0, Math.floor(sec)); return Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0'); };
const clock = sec => { sec = Math.max(0, Math.floor(sec)); const h = Math.floor(sec / 3600); return h ? h + ':' + String(Math.floor(sec / 60) % 60).padStart(2, '0') + ':' + String(sec % 60).padStart(2, '0') : mmss(sec); };
const dayKey = t => { const d = new Date(t); return d.getFullYear() + '-' + d.getMonth() + '-' + d.getDate(); };
const monday = t => { const d = new Date(t); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - (d.getDay() + 6) % 7); return d.getTime(); };
const monthStart = (y, m) => new Date(y, m, 1).getTime();
const shortDate = t => { const d = new Date(t); return d.getDate() + ' ' + MONTHS[d.getMonth()].toLowerCase(); };
const longDate = t => { const d = new Date(t); return DAYS[d.getDay()] + ' ' + d.getDate() + ' ' + MONTHS_FULL[d.getMonth()].toLowerCase() + ' ' + d.getFullYear(); };

/* ---------- Stato ---------- */

function fresh() {
  return {
    v: 1,
    exercises: LIBRARY.map((e, i) => ({ id: 'x' + i, name: e[0], primary: e[1], secondary: e[2], bodyweight: !!e[3] })),
    templates: [], sessions: [], settings: { ...DEFAULTS }, active: null,
  };
}
// Trust boundary: localStorage and imported files.
// Ids and numbers end up inside HTML attributes and text, so only safe shapes pass.
function valid(s) {
  if (!s || typeof s !== 'object' || !Array.isArray(s.exercises) || !Array.isArray(s.templates) || !Array.isArray(s.sessions)) return false;
  const ID = v => typeof v === 'string' && /^[\w-]{1,64}$/.test(v);
  const optNum = v => v == null || (typeof v === 'number' && isFinite(v));
  const okEx = s.exercises.every(e => e && ID(e.id) && typeof e.name === 'string' && DISTRICTS.includes(e.primary) && Array.isArray(e.secondary) && e.secondary.every(d => DISTRICTS.includes(d)));
  const okItem = i => i && ID(i.exId) && typeof i.sets === 'number' && isFinite(i.sets) && (i.group == null || ID(i.group)) && (i.dropSets == null || (Array.isArray(i.dropSets) && i.dropSets.every(n => typeof n === 'number')));
  const okT = s.templates.every(t => t && ID(t.id) && typeof t.name === 'string' && Array.isArray(t.items) && t.items.every(okItem));
  const okSet = x => x && ID(x.id) && ID(x.exId) && typeof x.ts === 'number' && typeof x.reps === 'number' && isFinite(x.reps) && typeof x.weight === 'number' && isFinite(x.weight) && optNum(x.n) && optNum(x.k);
  const okS = s.sessions.every(x => x && ID(x.id) && typeof x.start === 'number' && typeof x.name === 'string' && Array.isArray(x.sets) && x.sets.every(okSet) && (x.plan == null || (Array.isArray(x.plan) && x.plan.every(okItem))));
  const a = s.active;
  const okA = a == null || (ID(a.id) && typeof a.name === 'string' && typeof a.start === 'number' && Array.isArray(a.sets) && a.sets.every(okSet) && Array.isArray(a.plan) && a.plan.every(okItem) && a.entry && ID(a.entry.exId));
  return okEx && okT && okS && okA;
}
function migrate(s) {
  s.settings = { ...DEFAULTS, ...(s.settings || {}) };
  for (const k in DEFAULTS) {
    const v = s.settings[k];
    if (typeof v !== typeof DEFAULTS[k] || (typeof v === 'number' && !isFinite(v))) s.settings[k] = DEFAULTS[k];
  }
  // New library exercises reach existing installs; the ones already saved keep the user's edits.
  const have = new Set(s.exercises.map(e => e.name.toLowerCase()));
  LIBRARY.forEach((e, i) => { if (!have.has(e[0].toLowerCase())) s.exercises.push({ id: 'x' + i + '-' + uid(), name: e[0], primary: e[1], secondary: e[2], bodyweight: !!e[3] }); });
  s.active = s.active || null;
  s.sessions.forEach(x => { x.plan = x.plan || []; x.sets.forEach(z => { z.k = z.k || 0; z.n = z.n || 1; z.type = z.type || 'normal'; }); });
  s.templates.forEach(t => t.items.forEach(i => { i.dropSets = i.dropSets || []; i.group = i.group || null; }));
  s.sessions.sort((a, b) => a.start - b.start);
  return s;
}
function load() {
  let r = null;
  try { r = localStorage.getItem(KEY); if (r) { const s = JSON.parse(r); if (valid(s)) return migrate(s); } } catch (e) { /* fall through */ }
  // Never lose saved data silently: keep the unreadable copy before starting fresh.
  if (r) try { localStorage.setItem(KEY + '.broken', r); } catch (e) { /* storage full */ }
  return fresh();
}
function save() {
  rev++;
  try { localStorage.setItem(KEY, JSON.stringify(S)); localStorage.setItem(KEY + '.pending', '1'); }
  catch (e) { notice('Impossibile salvare i dati sul dispositivo. Esporta un backup.'); }
}

/* ---------- Backup cloud ---------- */
// Only the last copy per user is kept on the server. Sent on "Concludi", when the app goes to the
// background, every 10 minutes and when the signal comes back — but only if something changed.
let rev = 0, sending = false;
const USER_RE = /^[a-z0-9._-]{2,30}$/;
const cloudUrl = u => '/api/backup?user=' + encodeURIComponent(u);
const lsGet = k => { try { return localStorage.getItem(KEY + k); } catch (e) { return null; } };
const lsSet = (k, v) => { try { v == null ? localStorage.removeItem(KEY + k) : localStorage.setItem(KEY + k, v); } catch (e) { /* storage full */ } };
async function backup() {
  const u = S.settings.user;
  if (!u || sending || !navigator.onLine || lsGet('.pending') !== '1' || location.protocol === 'file:') return;
  if (!S.sessions.length && !S.templates.length && !S.active) return; // a fresh install never replaces a real backup
  const r = rev, body = JSON.stringify(S);
  sending = true;
  try {
    // keepalive lets the upload finish while iOS suspends the app, but only for small bodies.
    const res = await fetch(cloudUrl(u), { method: 'PUT', body, headers: { 'content-type': 'application/json' }, keepalive: body.length < 60000 });
    if (res.ok) { lsSet('.cloudAt', String((await res.json()).savedAt || Date.now())); if (rev === r) lsSet('.pending', null); }
  } catch (e) { /* offline: retry at the next trigger */ }
  sending = false;
}
async function fetchBackup(u) {
  const res = await fetch(cloudUrl(u), { cache: 'no-store' });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error('server');
  const w = await res.json();
  if (!w || !valid(w.data)) throw new Error('formato');
  return w;
}
function offerRestore(w) {
  const d = new Date(w.savedAt);
  ask('Ripristinare il backup?', `Backup di "${S.settings.user}" del ${shortDate(w.savedAt)} alle ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}. I dati di questo telefono verranno sostituiti.`, 'Ripristina', () => {
    const user = S.settings.user;
    S = migrate(w.data); S.settings.user = user; V.stack = []; V.tab = 'setup';
    lsSet('.cloudAt', String(w.savedAt)); done(); lsSet('.pending', null);
    notice('Backup ripristinato.');
  });
}
function cloudStatus() {
  if (!S.settings.user) return 'Scegli un nome utente per salvare una copia online dei tuoi dati.';
  const t = +lsGet('.cloudAt');
  const last = t ? `Ultimo backup: ${shortDate(t)} alle ${new Date(t).getHours()}:${String(new Date(t).getMinutes()).padStart(2, '0')}` : 'Nessun backup ancora';
  return last + (lsGet('.pending') === '1' ? ' · modifiche da inviare' : '');
}

let S = load();
save(); // persist migrations (e.g. new library exercises) right away
const V = { tab: 'workout', stack: [], q: '', pq: '', dist: 'week', timerOpen: false, select: null, sheet: null, finish: false };
const cur = () => V.stack[V.stack.length - 1];


const exMap = () => Object.fromEntries(S.exercises.map(e => [e.id, e]));
const exById = id => S.exercises.find(e => e.id === id) || { id, name: 'Esercizio rimosso', primary: 'petto', secondary: [], bodyweight: false };
const allSessions = () => S.active && S.active.sets.length ? [...S.sessions, S.active] : S.sessions;

/* ---------- Icone ---------- */
const svg = (d, w = 20, sw = 2.4, extra = '') => `<svg width="${w}" height="${w}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}${extra}</svg>`;
const IC = {
  workout: svg('<path d="M6.5 6.5v11M17.5 6.5v11M3.5 9v6M20.5 9v6M6.5 12h11"/>', 26, 2),
  setup: svg('<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>', 26, 2),
  chart: svg('<path d="M5 20V11M12 20V4M19 20v-6"/>', 26, 2),
  chevR: '<svg class="chev" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>',
  chevD: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>',
  back: svg('<path d="M15 6l-6 6 6 6"/>', 20, 2.6),
  up: svg('<path d="M6 15l6-6 6 6"/>', 16, 2.6),
  plus: svg('<path d="M12 5v14M5 12h14"/>', 20, 2.6),
  check: svg('<path d="M5 12.5l4.5 4.5L19 7.5"/>', 24, 3),
  timer: svg('<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2M9 2h6"/>', 18, 2.2),
  clock: svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>', 16, 2.2),
  search: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>',
  grip: '<svg width="22" height="22" viewBox="0 0 24 24" fill="var(--grip)" aria-hidden="true"><circle cx="9" cy="7" r="1.6"/><circle cx="15" cy="7" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="9" cy="17" r="1.6"/><circle cx="15" cy="17" r="1.6"/></svg>',
  export: svg('<path d="M12 15V3M7 8l5-5 5 5M5 15v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4"/>', 20, 2.2),
  import: svg('<path d="M12 3v12M7 10l5 5 5-5M5 15v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4"/>', 20, 2.2),
};

/* ---------- Schede: superset e etichette ---------- */

function blocksOf(items) {
  const out = [];
  items.forEach(it => {
    const last = out[out.length - 1];
    if (it.group && last && last[0].group === it.group) last.push(it); else out.push([it]);
  });
  return out;
}
// Superset → A1, A2 (lettere per superset); esercizi singoli → numero di blocco.
function labelsOf(items) {
  const map = new Map(); let letter = 0;
  blocksOf(items).forEach((b, bi) => {
    if (b.length > 1) { const L = String.fromCharCode(65 + letter++); b.forEach((it, j) => map.set(it, { t: L + (j + 1), ss: true, L })); }
    else map.set(b[0], { t: String(bi + 1), ss: false });
  });
  return map;
}
// Membri di un superset devono essere contigui e almeno 2.
function normGroups(items) {
  const seen = new Set(); let prev = null;
  items.forEach(it => {
    if (it.group) { if (it.group !== prev && seen.has(it.group)) it.group = null; else seen.add(it.group); }
    prev = it.group;
  });
  const cnt = {};
  items.forEach(i => { if (i.group) cnt[i.group] = (cnt[i.group] || 0) + 1; });
  items.forEach(i => { if (i.group && cnt[i.group] < 2) i.group = null; });
}
function tplSummary(t) {
  const b = blocksOf(t.items), ss = b.filter(x => x.length > 1).length, dr = t.items.filter(i => i.dropSets.length).length;
  return [t.items.length + (t.items.length === 1 ? ' esercizio' : ' esercizi'), ss && ss + ' superset', dr && dr + ' dropset'].filter(Boolean).join(' · ');
}

/* ---------- Workout: logica ---------- */

const A = () => S.active;
const planItem = exId => A().plan.find(i => i.exId === exId);
const setsOf = exId => A().sets.filter(s => s.exId === exId);
const workDone = exId => new Set(setsOf(exId).filter(s => s.type !== 'warmup').map(s => s.n)).size;
const planned = exId => (planItem(exId) || { sets: 0 }).sets;
const remaining = exId => planned(exId) - workDone(exId);
const nextWorkN = exId => setsOf(exId).filter(s => s.type !== 'warmup').reduce((m, s) => Math.max(m, s.n), 0) + 1;
const nextWarmN = exId => setsOf(exId).filter(s => s.type === 'warmup').reduce((m, s) => Math.max(m, s.n), 0) + 1;
const defaultType = exId => { const it = planItem(exId); return it && it.dropSets.includes(nextWorkN(exId)) ? 'drop' : 'normal'; };

function lastSessionSets(exId) {
  for (let i = S.sessions.length - 1; i >= 0; i--) {
    const ss = S.sessions[i].sets.filter(s => s.exId === exId);
    if (ss.length) return ss.sort((a, b) => a.ts - b.ts);
  }
  return [];
}
// Stessa serie dell'ultima sessione; se non c'era, la serie precedente (di oggi, altrimenti l'ultima registrata).
function suggest(exId, type, n, k) {
  const last = lastSessionSets(exId);
  const warm = type === 'warmup';
  const ref = last.find(s => (s.type === 'warmup') === warm && s.n === n && (s.k || 0) === k) || null;
  const today = setsOf(exId);
  const todaySame = today.filter(s => (s.type === 'warmup') === warm && (k > 0 || !s.k)); // dopo un dropset riparte dal peso della serie, non del drop
  const src = ref || todaySame[todaySame.length - 1] || today[today.length - 1] || last[last.length - 1];
  const bw = exById(exId).bodyweight;
  return { weight: src ? src.weight : (bw ? 0 : 20), reps: src ? src.reps : 10, ref };
}
function prepare(exId, type) {
  const a = A(); a.cur = exId;
  let n, k = 0;
  if (a.drop && a.drop.exId === exId) { type = 'drop'; n = a.drop.n; k = a.drop.k; }
  else if (type === 'warmup') n = nextWarmN(exId);
  else n = nextWorkN(exId);
  const s = suggest(exId, type, n, k);
  a.entry = { exId, type, n, k, weight: s.weight, reps: s.reps, ref: s.ref ? { weight: s.ref.weight, reps: s.ref.reps } : null };
}
function startSession(tid) {
  const t = S.templates.find(x => x.id === tid);
  if (!t || !t.items.length) { notice('La scheda è vuota: aggiungi degli esercizi in Setup.'); return; }
  S.active = { id: uid(), templateId: t.id, name: t.name, start: Date.now(), plan: JSON.parse(JSON.stringify(t.items)), sets: [], drop: null, timer: { run: false, start: 0, acc: 0 } };
  prepare(t.items[0].exId, defaultType(t.items[0].exId));
  V.timerOpen = false;
  done();
}
function confirmSet() {
  const a = A(), e = a.entry;
  if (!(e.reps > 0)) { notice('Inserisci almeno 1 ripetizione.'); return; }
  const now = Date.now(), prev = a.sets[a.sets.length - 1];
  a.sets.push({ id: uid(), exId: e.exId, n: e.n, k: e.k, type: e.type, reps: e.reps, weight: e.weight, ts: now, gap: prev ? Math.round((now - prev.ts) / 1000) : null });
  if (e.type === 'drop') { a.drop = { exId: e.exId, n: e.n, k: e.k + 1 }; prepare(e.exId, 'drop'); return done(); }
  advance(e.exId, e.type);
}
function advance(exId, type) {
  if (type === 'warmup') { prepare(exId, 'warmup'); return done(); }
  const it = planItem(exId);
  if (it && it.group) {
    const m = A().plan.filter(i => i.group === it.group), idx = m.indexOf(it);
    for (let j = 1; j <= m.length; j++) {
      const x = m[(idx + j) % m.length];
      if (remaining(x.exId) > 0) { prepare(x.exId, defaultType(x.exId)); return done(); }
    }
  } else if (remaining(exId) > 0) { prepare(exId, defaultType(exId)); return done(); }
  prepare(exId, defaultType(exId));
  V.finish = true;
  done();
}
function timerSec() { const t = A().timer; return (t.acc + (t.run ? Date.now() - t.start : 0)) / 1000; }

/* ---------- Pause (calcolo automatico) ---------- */

function pauseStats(sess) {
  const st = S.settings, minRaw = st.exec + st.minExtra, max = st.maxMin * 60;
  const grp = exId => ((sess.plan || []).find(i => i.exId === exId) || {}).group || null;
  const sets = [...sess.sets].sort((a, b) => a.ts - b.ts);
  const map = {}; let prev = null; const set = [], ex = []; let excl = 0;
  for (const s of sets) {
    if (s.k > 0) { prev = s; continue; } // un drop non è una pausa
    if (prev) {
      const raw = (s.ts - prev.ts) / 1000, pause = Math.max(0, raw - st.exec);
      const g = grp(s.exId);
      const kind = s.exId === prev.exId || (g && g === grp(prev.exId)) ? 'set' : 'ex';
      const ok = raw >= minRaw && pause <= max;
      map[s.id] = { pause, ok, kind };
      if (ok) (kind === 'set' ? set : ex).push(pause); else excl++;
    }
    prev = s;
  }
  const avg = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
  return { map, avgSet: avg(set), avgEx: avg(ex), used: set.length + ex.length, excl };
}

/* ---------- Render ---------- */

let lastView = null, lastDepth = 0;
function render() {
  const app = $('#app'), s = cur();
  // Animate only when the screen changes (not on every ± tap): forward = push, back = pop, otherwise fade up.
  const view = [V.tab, V.stack.map(x => x.k + (x.id || '')).join('/'), A() ? 'active' : '', V.timerOpen, V.startTab].join('|');
  const depth = V.stack.length;
  const anim = lastView === null || view === lastView ? '' : depth > lastDepth ? 'anim push' : depth < lastDepth ? 'anim pop' : 'anim';
  lastView = view; lastDepth = depth;
  const segs = segPositions();
  let html;
  if (s) html = ({ scheda: viewScheda, session: viewSession, costanza: viewCostanza, progressi: viewProgressi, exercise: viewExercise, pause: viewPause, distretti: viewDistretti })[s.k](s);
  else if (V.tab === 'workout') html = A() ? viewActive() : viewStart();
  else if (V.tab === 'setup') html = viewSetup();
  else html = viewCharts();
  app.className = (!s && V.tab === 'workout' && A() ? 'fit ' : '') + anim;
  app.innerHTML = html;
  placeSegs(segs);
  renderNav();
  tick();
  if (V.finish) { V.finish = false; openFinish(); }
}
// Segmented controls get a pill that slides from the old choice to the new one, like the tab bar.
function segPositions() {
  const out = {};
  document.querySelectorAll('#app .seg').forEach(g => { const b = g.querySelector('[aria-checked="true"]'); if (b) out[g.getAttribute('aria-label')] = [b.offsetLeft, b.offsetWidth]; });
  return out;
}
function placeSegs(prev) {
  document.querySelectorAll('#app .seg').forEach(g => {
    const b = g.querySelector('[aria-checked="true"]'); if (!b) return;
    const ind = document.createElement('span'); ind.className = 'seg-ind'; ind.setAttribute('aria-hidden', 'true');
    g.prepend(ind); g.classList.add('has-ind');
    const from = prev[g.getAttribute('aria-label')], to = [b.offsetLeft, b.offsetWidth];
    const put = ([l, w]) => { ind.style.left = l + 'px'; ind.style.width = w + 'px'; };
    if (from && (from[0] !== to[0] || from[1] !== to[1])) { put(from); ind.getBoundingClientRect(); ind.classList.add('go'); }
    put(to);
  });
}
const TABS = [['workout', 'Workout', IC.workout], ['setup', 'Setup', IC.setup], ['grafici', 'Grafici', IC.chart]];
// Built once and then only updated, so the oval can slide between tabs.
function renderNav() {
  const nav = $('#nav');
  if (!nav.firstChild) nav.innerHTML = '<span class="ind" aria-hidden="true"></span>' + TABS.map(([k, l, ic]) => `<button class="${k}" data-act="tab" data-arg="${k}">${ic}${l}</button>`).join('');
  TABS.forEach(([k]) => { const b = nav.querySelector('.' + k); if (V.tab === k) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
  nav.dataset.tab = V.tab;
  nav.style.setProperty('--i', TABS.findIndex(t => t[0] === V.tab));
}
const backBtn = label => `<div class="row-between"><button class="back" data-act="back">${IC.back}${esc(label)}</button></div>`;
function done() { save(); render(); }

/* Workout — scelta scheda */
function viewStart() {
  const t = S.templates.map(t => `<button class="tpl-card" data-act="start" data-arg="${t.id}">
      <span class="grow"><span class="name">${esc(t.name)}</span><span class="muted" style="font-size:14px">${tplSummary(t)}</span></span>
      <span class="go">Inizia</span></button>`).join('');
  const recent = S.sessions.slice(-10).reverse().map(x => `<button class="li" data-act="session" data-arg="${x.id}">
      <span class="grow"><span>${esc(x.name)}</span><span class="sub">${shortDate(x.start)} · ${x.sets.length} serie</span></span>${IC.chevR}</button>`).join('');
  const h = new Date().getHours(), hello = h >= 5 && h < 13 ? 'Buongiorno' : h >= 13 && h < 18 ? 'Ciao' : 'Buonasera';
  const name = S.settings.name.trim(), showRecent = V.startTab === 'recent';
  return `<h1 class="h1">${hello}${name ? ', ' + esc(name) : ''}!</h1>
    <div class="seg" role="radiogroup" aria-label="Mostra" style="grid-template-columns:repeat(2,minmax(0,1fr))">
      <button role="radio" aria-checked="${!showRecent}" data-act="startTab" data-arg="tpl">Scegli la scheda</button>
      <button role="radio" aria-checked="${showRecent}" data-act="startTab" data-arg="recent">Sessioni recenti</button>
    </div>
    ${showRecent
      ? (recent ? `<div class="list">${recent}</div>` : '<div class="empty">Nessuna sessione ancora.</div>')
      : t || `<div class="empty">Nessuna scheda.<br>Creane una in Setup per iniziare.</div><button class="btn primary" data-act="tab" data-arg="setup">Vai a Setup</button>`}`;
}

/* Workout — sessione in corso */
function viewActive() {
  const a = A(), e = a.entry, ex = exById(e.exId), it = planItem(e.exId);
  const lab = labelsOf(a.plan).get(it) || { t: '·', ss: false };
  const last = a.sets[a.sets.length - 1];
  const dn = workDone(e.exId), pl = planned(e.exId);
  const curIdx = e.type !== 'warmup' && e.k === 0 ? dn : -1;
  const total = Math.max(pl, dn + (curIdx >= 0 ? 1 : 0));
  const dots = Array.from({ length: total }, (_, i) => `<span class="dot ${i < dn ? 'done' : i === curIdx ? 'cur' : ''}"></span>`).join('');
  const status = e.type === 'warmup' ? `Riscaldamento ${e.n}` : e.k > 0 ? `Serie ${e.n} · drop ${e.k}` : e.n <= pl ? `Serie ${e.n} di ${pl}` : `Serie ${e.n} · extra`;
  const t = a.timer;
  const head = `<div class="w-head">
      <div class="t"><span class="n">${esc(a.name)}</span><span class="clock" data-live="clock"></span></div>
      <div class="acts">
        <button class="pill blue" data-act="timerOpen" aria-label="${V.timerOpen ? 'Chiudi' : 'Apri'} timer pausa">${V.timerOpen ? IC.up + 'Riduci' : IC.timer + `<span data-live="tpill">Pausa</span>`}</button>
        ${V.timerOpen ? '' : `<button class="pill" data-act="finishAsk">Fine</button>`}
      </div></div>
    <button class="ex-card" data-act="picker" aria-label="Cambia esercizio">
      <span class="badge ${lab.ss ? 'ss' : ''}">${lab.t}</span>
      <span class="grow"><span class="name">${esc(ex.name)}</span><span class="dots">${dots}<span class="lbl">${status}</span></span></span>
      ${IC.chevD}</button>`;
  const since = last ? `<div class="since">${IC.clock}Dalla serie precedente <b data-live="since"></b></div>` : '';
  const lastTxt = e.ref ? `${fmt(e.ref.weight)} × ${e.ref.reps}` : '—';
  const confirmBtn = `<button class="confirm" data-act="confirm">${IC.check}${e.k > 0 ? 'Conferma drop' : 'Conferma serie'}</button>`;

  if (V.timerOpen) {
    return head + `<div class="timer-card">
        <span class="k">Pausa</span><span class="v" data-live="timer">0:00</span>
        <div class="b"><button data-act="timerReset">Reset</button><button class="go" data-act="timerToggle">${t.run ? 'Stop' : 'Start'}</button></div>
      </div>${since}
      <button class="compact-entry" data-act="timerOpen" aria-label="Modifica peso e ripetizioni">
        <span class="v"><b>${fmt(e.weight)}</b><span>kg</span><i>×</i><b>${e.reps}</b></span><small>ultima ${lastTxt}</small></button>
      ${confirmBtn}`;
  }

  const typeCtl = a.drop && a.drop.exId === e.exId
    ? `<div class="drop-bar"><span>Drop ${e.k} · nuovo peso e rep</span><button data-act="endDrop">Fine dropset</button></div>`
    : `<div class="seg" role="radiogroup" aria-label="Tipo di serie">
        ${[['normal', 'Lavoro'], ['warmup', 'Riscaldamento'], ['drop', 'Drop']].map(([k, l]) => `<button role="radio" class="${k === 'drop' ? 'drop' : ''}" aria-checked="${e.type === k}" data-act="type" data-arg="${k}">${l}</button>`).join('')}
      </div>`;
  const doneSets = setsOf(e.exId).map(s => `<button data-act="editSet" data-arg="${s.id}"><span class="i">${setLabel(s)}</span>${fmt(s.weight)} × ${s.reps}</button>`).join('');
  const st = S.settings.step;
  return head + typeCtl + `<div class="spacer done-list">${doneSets}</div>${since}
    <div class="stepper">
      <div class="r">
        <button class="rb" data-act="w" data-arg="-1" aria-label="Diminuisci peso">−</button>
        <label class="big"><input data-in="weight" inputmode="decimal" value="${fmt(e.weight)}" style="${bigSize(fmt(e.weight))}" aria-label="Peso in kg"><span class="u">kg</span></label>
        <button class="rb" data-act="w" data-arg="1" aria-label="Aumenta peso">+</button>
      </div>
      <button class="step-toggle" data-act="step" aria-label="Cambia passo peso">${ex.bodyweight ? 'zavorra · ' : ''}passo ${st === 2.5 ? '<b>2,5</b> · 1,25' : '2,5 · <b>1,25</b>'}</button>
    </div>
    <div class="stepper"><div class="r">
      <button class="rb" data-act="r" data-arg="-1" aria-label="Diminuisci ripetizioni">−</button>
      <label class="big"><input data-in="reps" inputmode="numeric" value="${e.reps}" style="${bigSize(String(e.reps))}" aria-label="Ripetizioni"><span class="u">rep</span></label>
      <button class="rb" data-act="r" data-arg="1" aria-label="Aumenta ripetizioni">+</button>
    </div></div>
    <div class="last-row"><span class="l">Ultima volta <b>${lastTxt}</b></span>
      <span class="pm"><span>serie</span><button class="mini" data-act="setsAdj" data-arg="-1" aria-label="Togli serie">−</button><button class="mini" data-act="setsAdj" data-arg="1" aria-label="Aggiungi serie">+</button></span></div>
    ${confirmBtn}`;
}
// Input as wide as its text; long values shrink so "102,5" fits between the ± buttons.
const bigSize = s => {
  const digits = Math.max(1, s.replace(/[^0-9]/g, '').length), sep = /[,.]/.test(s);
  return `width:${digits + (sep ? 0.45 : 0) + 0.15}ch;--fs:${digits <= 2 ? 1 : digits === 3 ? 0.8 : 0.66}`;
};
const setLabel = s => s.type === 'warmup' ? 'R' + s.n : s.k > 0 ? s.n + '.' + s.k : String(s.n);

function openFinish() {
  const a = A(), it = planItem(a.cur), blocks = blocksOf(a.plan), labs = labelsOf(a.plan);
  const cb = blocks.findIndex(b => b.includes(it));
  let next = null;
  for (let j = 1; j <= blocks.length && !next; j++) next = blocks[(cb + j) % blocks.length].find(i => remaining(i.exId) > 0) || null;
  const others = a.plan.filter(i => i !== next).map(i => `<button class="li" data-act="pickEx" data-arg="${i.exId}">
      <span class="badge ${labs.get(i).ss ? 'ss' : ''}">${labs.get(i).t}</span><span class="grow">${esc(exById(i.exId).name)}</span><span class="val">${workDone(i.exId)}/${i.sets}</span></button>`).join('');
  showSheet(() => `<h2>Esercizio completato</h2><p>Quale esercizio fai adesso?</p>
    ${next ? `<button class="btn orange" data-act="pickEx" data-arg="${next.exId}">Avanti: ${esc(exById(next.exId).name)}</button>`
      : `<button class="btn orange" data-act="finishAsk">Concludi sessione</button>`}
    <button class="btn" data-act="oneMore">Un'altra serie di ${esc(exById(a.cur).name)}</button>
    <div class="list">${others}</div>
    <button class="btn blue-t" data-act="picker">Altro esercizio…</button>`);
}

/* Picker esercizi (workout e schede) */
function openPicker(mode) {
  V.pq = ''; V.pickMode = mode;
  showSheet(() => {
    let top = '';
    if (mode === 'workout') {
      const a = A(), labs = labelsOf(a.plan);
      top = `<div class="list">${a.plan.map(i => `<button class="li" data-act="pickEx" data-arg="${i.exId}" ${i.exId === a.cur ? 'aria-current="true"' : ''}>
        <span class="badge ${labs.get(i).ss ? 'ss' : ''}">${labs.get(i).t}</span><span class="grow"><span style="${i.exId === a.cur ? 'font-weight:700' : ''}">${esc(exById(i.exId).name)}</span></span><span class="val">${workDone(i.exId)}/${i.sets}</span></button>`).join('')}</div>
        <span class="lab">Altri esercizi</span>`;
    }
    return `<h2>${mode === 'workout' ? 'Esercizio' : 'Aggiungi esercizio'}</h2>${top}
      <label class="field">${IC.search}<input type="search" data-in="pq" placeholder="Cerca esercizio" aria-label="Cerca esercizio"></label>
      <div class="list" id="pick-results">${pickList()}</div>`;
  });
}
function pickList() {
  const q = V.pq.trim().toLowerCase();
  const inPlan = V.pickMode === 'workout' ? new Set(A().plan.map(i => i.exId)) : new Set();
  const list = S.exercises.filter(e => !inPlan.has(e.id) && (!q || e.name.toLowerCase().includes(q) || e.primary.includes(q)));
  return list.slice(0, 60).map(e => `<button class="li" data-act="${V.pickMode === 'workout' ? 'pickEx' : 'tplAdd'}" data-arg="${e.id}">
    <span class="grow"><span>${esc(e.name)}</span><span class="sub">${exDistricts(e)}</span></span></button>`).join('') || '<div class="empty">Nessun esercizio trovato</div>';
}
const exDistricts = e => cap(e.primary) + (e.secondary.length ? ' · ' + e.secondary.join(', ') : '');

/* Setup */
function viewSetup() {
  const st = S.settings;
  const tpls = S.templates.map(t => `<button class="li" data-act="scheda" data-arg="${t.id}">
      <span class="grow"><span style="font-weight:600">${esc(t.name)}</span><span class="sub">${tplSummary(t)}</span></span>${IC.chevR}</button>`).join('');
  return `<h1 class="h1">Setup</h1>
    <span class="section-label">Schede</span>
    <div class="list">${tpls}<button class="li add" data-act="newTpl">${IC.plus}Nuova scheda</button></div>
    <span class="section-label">Esercizi</span>
    <div class="list">
      <label class="li" style="min-height:52px">${IC.search}<input type="search" data-in="exq" value="${esc(V.q)}" placeholder="Cerca tra ${S.exercises.length} esercizi" aria-label="Cerca esercizio" style="flex:1;border:none;background:transparent;font-size:17px;outline:none;min-width:0"></label>
      <div id="ex-results" class="list" style="border-radius:0">${exResults()}</div>
      <button class="li add" data-act="newEx">${IC.plus}Nuovo esercizio</button>
    </div>
    <span class="section-label">Impostazioni</span>
    <div class="list">
      <button class="li" data-act="editName"><span class="grow">Nome</span><span class="val">${esc(st.name) || 'Aggiungi'}</span></button>
      <button class="li" data-act="setting" data-arg="exec"><span class="grow">Durata di una serie</span><span class="val">${st.exec} s</span></button>
      <button class="li" data-act="setting" data-arg="band"><span class="grow">Serie a settimana</span><span class="val">${st.bandMin} – ${st.bandMax}</span></button>
      <button class="li" data-act="setting" data-arg="minPause"><span class="grow">Pausa minima valida</span><span class="val">${st.exec + st.minExtra} s</span></button>
      <button class="li" data-act="setting" data-arg="maxPause"><span class="grow">Pausa massima valida</span><span class="val">${st.maxMin} min</span></button>
    </div>
    <span class="section-label">Backup online</span>
    <div class="list">
      <button class="li" data-act="editUser"><span class="grow">Nome utente</span><span class="val">${esc(st.user) || 'Scegli'}</span></button>
      ${st.user ? '<button class="li" data-act="cloudRestore" style="color:var(--blue)"><span class="grow">Ripristina dal backup online</span></button>' : ''}
    </div>
    <p class="muted" style="font-size:13px;margin:8px 16px 0">${esc(cloudStatus())}</p>
    <span class="section-label">Dati</span>
    <div class="grid2">
      <button class="btn" style="height:56px;border-radius:18px" data-act="export">${IC.export}Esporta</button>
      <button class="btn" style="height:56px;border-radius:18px" data-act="import">${IC.import}Importa</button>
    </div>`;
}
function exResults() {
  const q = V.q.trim().toLowerCase();
  const all = S.exercises.filter(e => !q || e.name.toLowerCase().includes(q) || e.primary.includes(q)).sort((a, b) => a.name.localeCompare(b.name));
  const list = q || V.showAll ? all : all.slice(0, 5);
  const more = list.length < all.length ? `<button class="li" data-act="showAll" style="color:var(--blue);font-weight:600">Mostra tutti (${all.length})</button>` : '';
  return list.map(e => `<button class="li" data-act="editEx" data-arg="${e.id}">
    <span class="grow"><span>${esc(e.name)}</span><span class="sub">${exDistricts(e)}</span></span>${e.bodyweight ? '<span class="tag">Corpo libero</span>' : ''}</button>`).join('') + more || '<div class="empty">Nessun esercizio trovato</div>';
}

function openExForm(id) {
  const e = id && S.exercises.find(x => x.id === id);
  V.exForm = e ? { id: e.id, name: e.name, primary: e.primary, secondary: [...e.secondary], bodyweight: e.bodyweight } : { name: '', primary: 'petto', secondary: [], bodyweight: false };
  showSheet(() => {
    const f = V.exForm;
    return `<h2>${f.id ? 'Modifica esercizio' : 'Nuovo esercizio'}</h2>
      <label class="field"><input data-in="exname" value="${esc(f.name)}" placeholder="Nome (in inglese)" aria-label="Nome esercizio" autocapitalize="words"></label>
      <span class="lab">Distretto primario</span>
      <div class="chips">${DISTRICTS.map(d => `<button class="chip" aria-pressed="${f.primary === d}" data-act="exPrim" data-arg="${d}">${cap(d)}</button>`).join('')}</div>
      <span class="lab">Distretti secondari</span>
      <div class="chips">${DISTRICTS.filter(d => d !== f.primary).map(d => `<button class="chip ss" aria-pressed="${f.secondary.includes(d)}" data-act="exSec" data-arg="${d}">${cap(d)}</button>`).join('')}</div>
      <div class="chips"><button class="chip ss" aria-pressed="${f.bodyweight}" data-act="exBw">Corpo libero</button></div>
      <button class="btn primary" data-act="exSave">Salva</button>`;
  });
}

function openSetting(key) {
  V.setKey = key;
  showSheet(() => {
    const st = S.settings;
    const row = (k, v, unit) => `<div class="set-steprow"><button class="rb" data-act="setAdj" data-arg="${k}|-1" aria-label="Diminuisci">−</button><b>${v} <span class="muted" style="font-size:18px">${unit}</span></b><button class="rb" data-act="setAdj" data-arg="${k}|1" aria-label="Aumenta">+</button></div>`;
    if (key === 'exec') return `<h2>Durata di una serie</h2><p>Tempo di esecuzione sottratto all'intervallo tra due conferme per calcolare la pausa.</p>${row('exec', st.exec, 's')}<button class="btn primary" data-act="closeSheet">Fatto</button>`;
    if (key === 'band') return `<h2>Serie a settimana</h2><p>Fascia di riferimento per distretto: sotto = carente, sopra = alto.</p><span class="lab">Minimo</span>${row('bandMin', st.bandMin, 'serie')}<span class="lab">Massimo</span>${row('bandMax', st.bandMax, 'serie')}<button class="btn primary" data-act="closeSheet">Fatto</button>`;
    if (key === 'minPause') return `<h2>Pausa minima valida</h2><p>Se tra due conferme passa meno di questo tempo la pausa è "non attendibile". Predefinito: durata serie + 15 s.</p>${row('minExtra', st.exec + st.minExtra, 's')}<button class="btn primary" data-act="closeSheet">Fatto</button>`;
    return `<h2>Pausa massima valida</h2><p>Pause più lunghe vengono escluse dalle medie.</p>${row('maxMin', st.maxMin, 'min')}<button class="btn primary" data-act="closeSheet">Fatto</button>`;
  });
}
const SET_RULES = { exec: [5, 5, 300], bandMin: [1, 1, 60], bandMax: [1, 1, 80], minExtra: [5, 0, 600], maxMin: [1, 1, 120] };

/* Scheda editor */
function viewScheda(s) {
  const t = S.templates.find(x => x.id === s.id);
  if (!t) { V.stack.pop(); return viewSetup(); }
  const labs = labelsOf(t.items), sel = V.select;
  let idx = 0, html = '', singles = '';
  const row = it => {
    const i = idx++, l = labs.get(it);
    const left = sel ? `<span class="check ${sel.has(i) ? 'on' : ''}" aria-hidden="true"></span>` : `<span class="grip" data-drag aria-hidden="true">${IC.grip}</span>`;
    const dr = it.dropSets.length ? `<span class="tag drop">DROP${it.dropSets.length > 1 ? ' ×' + it.dropSets.length : ''}</span>` : '';
    return `<div class="ed-row" data-idx="${i}">${left}${l.ss ? `<span class="lbl">${l.t}</span>` : ''}
      <button class="nm" data-act="${sel ? 'selToggle' : 'itemSheet'}" data-arg="${i}"><span>${esc(exById(it.exId).name)}</span>${dr}</button>
      ${sel ? '' : `<div class="sets-step"><button data-act="tplSets" data-arg="${i}|-1" aria-label="Meno serie">−</button><span aria-label="serie">${it.sets}</span><button data-act="tplSets" data-arg="${i}|1" aria-label="Più serie">+</button></div>`}</div>`;
  };
  const flush = () => { if (singles) html += `<div class="list">${singles}</div>`; singles = ''; };
  blocksOf(t.items).forEach(b => {
    if (b.length === 1) { singles += row(b[0]); return; }
    flush();
    html += `<div class="list ss-card"><div class="ss-head"><span>Superset ${labs.get(b[0]).L}</span><button data-act="ungroup" data-arg="${b[0].group}">Separa</button></div>${b.map(row).join('<div class="hr" style="margin-left:60px"></div>')}</div>`;
  });
  flush();
  const bottom = sel
    ? `<div class="grid2"><button class="btn" data-act="selCancel">Annulla</button><button class="btn primary" data-act="selGroup" ${sel.size < 2 ? 'disabled style="opacity:.4"' : ''}>Raggruppa${sel.size ? ' (' + sel.size + ')' : ''}</button></div>`
    : `<div class="grid2"><button class="btn blue-t" data-act="selStart">Crea superset</button><button class="btn primary" data-act="tplPicker">${IC.plus}Esercizio</button></div>`;
  return `<div class="row-between"><button class="back" data-act="back">${IC.back}Setup</button><button class="link" data-act="back">Fine</button></div>
    <h1 class="h1 sm"><button data-act="tplRename" style="font:inherit;letter-spacing:inherit;text-align:left">${esc(t.name)}</button></h1>
    ${sel ? '<p class="muted" style="margin:0 4px">Seleziona gli esercizi da raggruppare in superset.</p>' : ''}
    ${html || '<div class="empty">Scheda vuota. Aggiungi il primo esercizio.</div>'}
    <div class="spacer"></div>${bottom}
    ${sel ? '' : '<button class="btn danger" style="background:transparent;height:44px" data-act="tplDelete">Elimina scheda</button>'}`;
}
const curTpl = () => S.templates.find(x => x.id === cur().id);

function openItemSheet(i) {
  V.itemIdx = i;
  showSheet(() => {
    const it = curTpl().items[V.itemIdx];
    const chips = Array.from({ length: it.sets }, (_, j) => `<button class="chip dr" aria-pressed="${it.dropSets.includes(j + 1)}" data-act="dropToggle" data-arg="${j + 1}">Serie ${j + 1}</button>`).join('');
    return `<h2>${esc(exById(it.exId).name)}</h2>
      <span class="lab">Serie dropset</span>
      <div class="chips">${chips}<button class="chip dr" aria-pressed="${it.dropSets.length === it.sets}" data-act="dropAll">Tutte</button></div>
      <button class="btn primary" data-act="closeSheet">Fatto</button>
      <button class="btn danger" data-act="itemRemove">Rimuovi dalla scheda</button>`;
  });
}

/* Dettaglio sessione (pause e correzioni) */
function findSession(id) { return S.active && S.active.id === id ? S.active : S.sessions.find(x => x.id === id); }
function viewSession(s) {
  const x = findSession(s.id);
  if (!x) return backBtn('Indietro') + '<div class="empty">Sessione non trovata.</div>';
  const ps = pauseStats(x), sets = [...x.sets].sort((a, b) => a.ts - b.ts);
  const order = [...new Set(sets.map(z => z.exId))];
  const dur = ((x.end || Date.now()) - x.start) / 60000;
  const cards = order.map(exId => {
    const ss = sets.filter(z => z.exId === exId);
    const valid = ss.map(z => ps.map[z.id]).filter(p => p && p.ok && p.kind === 'set');
    const avg = valid.length ? mmss(valid.reduce((a, p) => a + p.pause, 0) / valid.length) : '—';
    const lines = ss.map(z => {
      const p = ps.map[z.id];
      const ptxt = z.k > 0 ? 'drop' : !p ? '—' : p.ok ? (p.kind === 'ex' ? 'cambio ' : '') + mmss(p.pause) : 'non attendibile';
      const tag = z.type === 'warmup' ? '<span class="tag warm">R</span>' : z.type === 'drop' ? '<span class="tag drop">DROP</span>' : '';
      return `<button class="set-line" data-act="editSet" data-arg="${z.id}"><span class="i">${setLabel(z)}</span><span class="w">${fmt(z.weight)} kg × ${z.reps}${tag}</span><span class="p ${p && !p.ok && z.k === 0 ? 'bad' : ''}">${ptxt}</span></button>`;
    }).join('');
    return `<div class="list"><div class="ex-head"><b>${esc(exById(exId).name)}</b><span>pausa media ${avg}</span></div>${lines}</div>`;
  }).join('');
  return backBtn('Indietro') + `<span class="kicker">${cap(longDate(x.start))} · ${Math.round(dur)} min</span>
    <h1 class="h1 sm">${esc(x.name)}</h1>
    <div class="grid2">
      <div class="blk" style="padding:16px;gap:4px"><div class="kpi"><b style="font-size:32px;color:var(--blue)">${ps.avgSet == null ? '—' : mmss(ps.avgSet)}</b></div><span class="muted" style="font-size:14px;font-weight:600">tra serie</span></div>
      <div class="blk" style="padding:16px;gap:4px"><div class="kpi"><b style="font-size:32px">${ps.avgEx == null ? '—' : mmss(ps.avgEx)}</b></div><span class="muted" style="font-size:14px;font-weight:600">tra esercizi</span></div>
    </div>
    <div style="display:flex;gap:8px"><span class="chip-s">Usate ${ps.used}</span><span class="chip-s muted">Escluse ${ps.excl}</span></div>
    ${cards || '<div class="empty">Nessuna serie registrata.</div>'}
    <p class="muted" style="margin:0 4px;font-size:13px">Tocca una serie per correggerla o eliminarla.</p>`;
}
function openEditSet(id) {
  const sess = [S.active, ...S.sessions].find(x => x && x.sets.some(z => z.id === id));
  if (!sess) return;
  const z = sess.sets.find(q => q.id === id);
  V.edit = { sessId: sess.id, id, weight: z.weight, reps: z.reps, type: z.type };
  showSheet(() => {
    const f = V.edit;
    return `<h2>${esc(exById(z.exId).name)} · serie ${setLabel(z)}</h2>
      <span class="lab">Peso (kg)</span>
      <div class="set-steprow"><button class="rb" data-act="edAdj" data-arg="weight|-1" aria-label="Diminuisci peso">−</button><input data-in="edW" inputmode="decimal" value="${fmt(f.weight)}" aria-label="Peso"><button class="rb" data-act="edAdj" data-arg="weight|1" aria-label="Aumenta peso">+</button></div>
      <span class="lab">Ripetizioni</span>
      <div class="set-steprow"><button class="rb" data-act="edAdj" data-arg="reps|-1" aria-label="Diminuisci ripetizioni">−</button><input data-in="edR" inputmode="numeric" value="${f.reps}" aria-label="Ripetizioni"><button class="rb" data-act="edAdj" data-arg="reps|1" aria-label="Aumenta ripetizioni">+</button></div>
      <span class="lab">Tipo</span>
      <div class="chips">${[['normal', 'Lavoro'], ['warmup', 'Riscaldamento'], ['drop', 'Drop']].map(([k, l]) => `<button class="chip ${k === 'drop' ? 'dr' : ''}" aria-pressed="${f.type === k}" data-act="edType" data-arg="${k}">${l}</button>`).join('')}</div>
      <button class="btn primary" data-act="edSave">Salva</button>
      <button class="btn danger" data-act="edDelete">Elimina serie</button>`;
  });
}

/* ---------- Grafici ---------- */

function trainedDays() { return new Set(allSessions().map(x => dayKey(x.start))); }
function monthCounts(n) {
  const now = new Date(), out = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const a = d.getTime(), b = monthStart(d.getFullYear(), d.getMonth() + 1);
    out.push({ m: d.getMonth(), c: new Set(allSessions().filter(x => x.start >= a && x.start < b).map(x => dayKey(x.start))).size, cur: i === 0 });
  }
  return out;
}
function costanzaKpi() {
  const now = new Date(), a = monthStart(now.getFullYear(), now.getMonth());
  const c = new Set(allSessions().filter(x => x.start >= a).map(x => dayKey(x.start))).size; // giorni, come barre e calendario
  return { c, avg: c / Math.max(1, now.getDate() / 7) };
}
function calendar(weeks) {
  const days = trainedDays(), today = new Date(); today.setHours(0, 0, 0, 0);
  const t0 = monday(today.getTime()) - (weeks - 1) * 7 * DAY;
  let cols = '', labels = '', prevM = -1, lastLeft = -99;
  for (let w = 0; w < weeks; w++) {
    let cells = '';
    for (let d = 0; d < 7; d++) {
      const t = new Date(t0 + (w * 7 + d) * DAY + 12 * 3600000); t.setHours(0, 0, 0, 0);
      const ts = t.getTime();
      const cls = ts > today.getTime() ? 'fut' : (days.has(dayKey(ts)) ? 'on' : '') + (ts === today.getTime() ? ' today' : '');
      cells += `<i class="${cls}"></i>`;
    }
    cols += `<div class="wk">${cells}</div>`;
    const m = new Date(t0 + w * 7 * DAY + 12 * 3600000).getMonth();
    if (m !== prevM) { const left = w / weeks * 100; if (left - lastLeft >= 10) { labels += `<span style="left:${left.toFixed(1)}%">${MONTHS[m]}</span>`; lastLeft = left; } prevM = m; }
  }
  return `<div style="display:flex;flex-direction:column;gap:6px"><div class="cal-months">${labels}</div><div class="cal" role="img" aria-label="Calendario allenamenti ultime ${weeks} settimane">${cols}</div></div>`;
}
function monthBars(n) {
  const mc = monthCounts(n), max = Math.max(1, ...mc.map(x => x.c));
  return `<div class="mbars ${n > 6 ? 'dense' : ''}">${mc.map(x => `<div class="${x.cur ? 'cur' : ''}"><span>${x.c}</span><div class="bar" style="height:${Math.round(x.c / max * 64)}px"></div><span>${MONTHS[x.m]}</span></div>`).join('')}</div>`;
}

function progressData() {
  const per = {};
  [...allSessions()].sort((a, b) => a.start - b.start).forEach(x => {
    const by = {};
    x.sets.forEach(s => {
      if (s.type === 'warmup') return;
      const o = by[s.exId] || (by[s.exId] = { e1: 0, vol: 0 });
      o.vol += s.weight * s.reps;
      if (s.reps > 0 && s.reps <= 12 && s.weight > 0) o.e1 = Math.max(o.e1, s.weight * (1 + s.reps / 30));
    });
    Object.entries(by).forEach(([id, o]) => (per[id] = per[id] || []).push({ t: x.start, e1: o.e1, vol: o.vol }));
  });
  return Object.entries(per).map(([id, pts]) => {
    const e = pts.filter(p => p.e1 > 0);
    if (!e.length) return null;
    const curV = e[e.length - 1].e1, cut = Date.now() - 28 * DAY;
    const base = [...e].reverse().find(p => p.t <= cut);
    return { id, pts, e, cur: curV, delta: base ? half(curV - base.e1) : null, lastT: pts[pts.length - 1].t };
  }).filter(Boolean).sort((a, b) => b.lastT - a.lastT);
}
function spark(vals, color) {
  if (vals.length < 2) vals = [vals[0], vals[0]];
  const mn = Math.min(...vals), mx = Math.max(...vals), r = mx - mn || 1;
  const pts = vals.map((v, i) => [2 + i / (vals.length - 1) * 68, 24 - (v - mn) / r * 20]);
  const l = pts[pts.length - 1];
  return `<svg width="72" height="28" viewBox="0 0 72 28" aria-hidden="true"><polyline points="${pts.map(p => p.join(',')).join(' ')}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/><circle cx="${l[0]}" cy="${l[1]}" r="3" fill="${color}"/></svg>`;
}
const progToggle = () => `<div class="seg sm" role="radiogroup" aria-label="Metrica" style="display:inline-flex">
  <button role="radio" aria-checked="${V.prog !== 'vol'}" data-act="prog" data-arg="e1">1RM stimato</button>
  <button role="radio" aria-checked="${V.prog === 'vol'}" data-act="prog" data-arg="vol">Volume</button></div>`;
function progRow(p) {
  // Volume: last session's volume vs the last session at least 4 weeks ago, like the 1RM.
  const vol = V.prog === 'vol', pts = vol ? p.pts.filter(x => x.vol > 0) : p.e, key = vol ? 'vol' : 'e1';
  const curV = vol ? (pts.length ? pts[pts.length - 1].vol : 0) : p.cur;
  const base = vol ? [...pts].reverse().find(x => x.t <= Date.now() - 28 * DAY) : null;
  const d = vol ? (base ? Math.round(curV - base.vol) : null) : p.delta, step = vol ? 1 : 0.5;
  const cls = d == null ? '' : d >= step ? 'up' : d <= -step ? 'down' : '';
  const txt = d == null ? 'nuovo' : d >= step ? '↑ +' + fmt(d) + ' kg' : d <= -step ? '↓ −' + fmt(-d) + ' kg' : '→ stabile';
  const col = cls === 'up' ? 'var(--green)' : cls === 'down' ? 'var(--orange)' : 'var(--muted)';
  return `<button class="prow" data-act="exDetail" data-arg="${p.id}"><span class="grow"><b>${esc(exById(p.id).name)}</b><span class="${cls}">${txt}</span></span>${pts.length ? spark(pts.slice(-8).map(x => x[key]), col) : ''}<span class="v">${fmt(vol ? Math.round(curV) : half(curV))}</span></button>`;
}
function lineChart(pts, color, opt = {}) {
  if (!pts.length) return '<div class="empty">Nessun dato</div>';
  const W = 358, H = 170, L = 38, R = 12, T = 14, B = 24;
  const ys = pts.map(p => p.y), mn = Math.min(...ys), mx = Math.max(...ys), pad = (mx - mn) * 0.12 || Math.max(1, mx * 0.05);
  const y0 = mn - pad, y1 = mx + pad, t0 = pts[0].x, t1 = pts[pts.length - 1].x;
  const X = t => t1 === t0 ? L + (W - L - R) / 2 : L + (t - t0) / (t1 - t0) * (W - L - R);
  const Y = v => T + (1 - (v - y0) / (y1 - y0)) * (H - T - B);
  let best = -Infinity, marks = '';
  const top = Math.max(...ys);
  if (opt.pr) pts.forEach(p => {
    if (p.y > best) {
      best = p.y;
      const at = p.y === top;
      marks += `<circle cx="${X(p.x)}" cy="${Y(p.y)}" r="${at ? 6 : 4}" fill="${at ? 'var(--orange-fill)' : color}" stroke="var(--card)" stroke-width="2"/>`;
      if (at) marks += `<text x="${Math.min(X(p.x), W - 40)}" y="${Y(p.y) - 10}" text-anchor="middle" style="fill:var(--orange);font-weight:700">PR ${fmt(half(p.y))}</text>`;
    }
  });
  const line = pts.map(p => X(p.x).toFixed(1) + ',' + Y(p.y).toFixed(1)).join(' ');
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(opt.label || 'grafico')}">
    <line x1="${L}" x2="${W - R}" y1="${H - B}" y2="${H - B}" stroke="var(--sep)"/>
    <text x="${L - 6}" y="${Y(mx) + 4}" text-anchor="end">${fmt(Math.round(mx))}</text>
    <text x="${L - 6}" y="${Y(mn) + 4}" text-anchor="end">${fmt(Math.round(mn))}</text>
    <polyline points="${line}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
    ${pts.length === 1 ? `<circle cx="${X(t0)}" cy="${Y(ys[0])}" r="4" fill="${color}"/>` : ''}
    ${marks}
    <text x="${L}" y="${H - 6}">${shortDate(t0)}</text>
    ${t1 !== t0 ? `<text x="${W - R}" y="${H - 6}" text-anchor="end">${shortDate(t1)}</text>` : ''}
  </svg>`;
}

function districtPeriod(mode) {
  const now = Date.now(), d = new Date();
  if (mode === 'week') { const a = monday(now); return { a, b: a + 7 * DAY, div: 1 }; }
  const a = monthStart(d.getFullYear(), d.getMonth());
  return { a, b: monthStart(d.getFullYear(), d.getMonth() + 1), div: Math.max(1, d.getDate() / 7) };
}
function districtCounts(mode) {
  const { a, b, div } = districtPeriod(mode), m = exMap(), c = Object.fromEntries(DISTRICTS.map(d => [d, 0])), by = {};
  const add = (d, id, v) => { if (c[d] == null) return; c[d] += v; by[d] = by[d] || {}; by[d][id] = (by[d][id] || 0) + v; };
  allSessions().forEach(x => x.sets.forEach(s => {
    if (s.ts < a || s.ts >= b || s.type === 'warmup' || s.k > 0) return; // un dropset conta come una serie
    const e = m[s.exId]; if (!e) return;
    add(e.primary, e.id, 1);
    e.secondary.forEach(d => add(d, e.id, 0.5));
  }));
  DISTRICTS.forEach(d => { c[d] /= div; });
  return { c, by, div };
}
const dStatus = v => v < S.settings.bandMin ? 'carente' : v > S.settings.bandMax ? 'alto' : 'ok';
const D_COL = { carente: 'var(--orange-fill)', ok: 'var(--green-fill)', alto: 'var(--blue-fill)' };

// Sagome: [distretto | null, forma]. Distretto null = parte neutra.
const FIG_FRONT = [
  [null, '<ellipse cx="60" cy="20" rx="10.5" ry="12.5"/>'],
  ['spalle', '<path d="M44 42 C34 41 27 47 27 57 C27 61 29 63 31 63 C33 55 38 49 46 47 Z"/>'],
  ['spalle', '<path d="M76 42 C86 41 93 47 93 57 C93 61 91 63 89 63 C87 55 82 49 74 47 Z"/>'],
  ['petto', '<path d="M59 44 L59 66 C52 68 44 66 40 60 C39 54 41 48 46 46 C50 44 55 44 59 44 Z"/>'],
  ['petto', '<path d="M61 44 L61 66 C68 68 76 66 80 60 C81 54 79 48 74 46 C70 44 65 44 61 44 Z"/>'],
  ['bicipiti', '<path d="M30 66 C27 72 26 82 28 92 C30 94 34 94 35 91 C37 82 37 72 35 66 C33 64 31 64 30 66 Z"/>'],
  ['bicipiti', '<path d="M90 66 C93 72 94 82 92 92 C90 94 86 94 85 91 C83 82 83 72 85 66 C87 64 89 64 90 66 Z"/>'],
  ['avambracci', '<path d="M27 97C24 106 23 118 25 128 L30 128 C33 118 34 106 34 97 Z"/>'],
  ['avambracci', '<path d="M93 97C96 106 97 118 95 128 L90 128 C87 118 86 106 86 97 Z"/>'],
  [null, '<circle cx="27.5" cy="133" r="4"/>'], [null, '<circle cx="92.5" cy="133" r="4"/>'],
  [null, '<path d="M42 66 C45 80 46 96 48 114 L49 114 L49 70 Z"/>'],
  [null, '<path d="M78 66 C75 80 74 96 72 114 L71 114 L71 70 Z"/>'],
  ['addome', '<rect x="50.5" y="70" width="8.5" height="10" rx="3"/><rect x="61" y="70" width="8.5" height="10" rx="3"/><rect x="50.5" y="82" width="8.5" height="10" rx="3"/><rect x="61" y="82" width="8.5" height="10" rx="3"/><rect x="50.5" y="94" width="8.5" height="10" rx="3"/><rect x="61" y="94" width="8.5" height="10" rx="3"/><path d="M51 106 L69 106 L67 116 C64 119 56 119 53 116 Z"/>'],
  [null, '<path d="M45 118 L52 118 C55 121 65 121 68 118 L75 118 L78 130 L42 130 Z"/>'],
  ['quadricipiti', '<path d="M43 132 C39 145 39 165 43 182 C46 188 54 188 56 182 C59 165 59 145 57 132 Z"/>'],
  ['quadricipiti', '<path d="M77 132 C81 145 81 165 77 182 C74 188 66 188 64 182 C61 165 61 145 63 132 Z"/>'],
  ['polpacci', '<path d="M45 194 C42 204 43 218 46 232 L53 232 C56 218 57 204 54 194 C51 191 48 191 45 194 Z"/>'],
  ['polpacci', '<path d="M75 194 C78 204 77 218 74 232 L67 232 C64 218 63 204 66 194 C69 191 72 191 75 194 Z"/>'],
  [null, '<rect x="44" y="235" width="11" height="6" rx="3"/><rect x="65" y="235" width="11" height="6" rx="3"/>'],
];
const FIG_BACK = [
  [null, '<ellipse cx="60" cy="20" rx="10.5" ry="12.5"/>'],
  ['dorso', '<path d="M53 33 L67 33 L80 45 L60 50 L40 45 Z"/>'],
  ['spalle', '<path d="M44 42 C34 41 27 47 27 57 C27 61 29 63 31 63 C33 55 38 49 46 47 Z"/>'],
  ['spalle', '<path d="M76 42 C86 41 93 47 93 57 C93 61 91 63 89 63 C87 55 82 49 74 47 Z"/>'],
  ['dorso', '<path d="M59 52 L59 100 C53 98 47 92 44 82 C41 70 40 58 42 50 Z"/>'],
  ['dorso', '<path d="M61 52 L61 100 C67 98 73 92 76 82 C79 70 80 58 78 50 Z"/>'],
  [null, '<rect x="50" y="102" width="20" height="14" rx="5"/>'],
  ['tricipiti', '<path d="M30 66 C27 72 26 82 28 92 C30 94 34 94 35 91 C37 82 37 72 35 66 C33 64 31 64 30 66 Z"/>'],
  ['tricipiti', '<path d="M90 66 C93 72 94 82 92 92 C90 94 86 94 85 91 C83 82 83 72 85 66 C87 64 89 64 90 66 Z"/>'],
  ['avambracci', '<path d="M27 97C24 106 23 118 25 128 L30 128 C33 118 34 106 34 97 Z"/>'],
  ['avambracci', '<path d="M93 97C96 106 97 118 95 128 L90 128 C87 118 86 106 86 97 Z"/>'],
  [null, '<circle cx="27.5" cy="133" r="4"/>'], [null, '<circle cx="92.5" cy="133" r="4"/>'],
  ['glutei', '<path d="M59 118 L59 140 C52 143 44 140 42 132 C41 124 45 118 52 118 Z"/>'],
  ['glutei', '<path d="M61 118 L61 140 C68 143 76 140 78 132 C79 124 75 118 68 118 Z"/>'],
  ['femorali', '<path d="M43 144 C40 156 40 170 43 184 C46 189 54 189 56 184 C58 170 58 156 57 144 Z"/>'],
  ['femorali', '<path d="M77 144 C80 156 80 170 77 184 C74 189 66 189 64 184 C62 170 62 156 63 144 Z"/>'],
  ['polpacci', '<path d="M45 192 C40 200 41 212 46 222 L48 232 L53 232 L54 222 C58 212 58 200 54 192 C51 189 48 189 45 192 Z"/>'],
  ['polpacci', '<path d="M75 192 C80 200 79 212 74 222 L72 232 L67 232 L66 222 C62 212 62 200 66 192 C69 189 72 189 75 192 Z"/>'],
  [null, '<rect x="44" y="235" width="11" height="6" rx="3"/><rect x="65" y="235" width="11" height="6" rx="3"/>'],
];
function figure(shapes, c, label) {
  const parts = shapes.map(([d, s]) => `<g fill="${d ? D_COL[dStatus(c[d])] : 'var(--card3)'}">${s}</g>`).join('');
  return `<svg width="140" height="286" viewBox="0 0 120 245" role="img" aria-label="${label}">${parts}</svg>`;
}
function districtBlock(withDetail) {
  const { c } = districtCounts(V.dist), st = S.settings;
  const scale = Math.max(st.bandMax * 1.25, ...Object.values(c));
  const low = DISTRICTS.filter(d => dStatus(c[d]) === 'carente').length;
  const desc = shapes => [...new Set(shapes.map(x => x[0]).filter(Boolean))].map(d => d + ' ' + dStatus(c[d])).join(', ');
  const bars = DISTRICTS.map(d => `<div class="dbar"><span class="n">${cap(d)}</span><div class="t"><div class="band" style="left:${st.bandMin / scale * 100}%;width:${(st.bandMax - st.bandMin) / scale * 100}%"></div><div class="f" style="width:${Math.min(100, c[d] / scale * 100)}%;background:${D_COL[dStatus(c[d])]}"></div></div><span class="v">${fmt1(c[d])}</span></div>`).join('');
  return `<section class="blk" ${withDetail ? 'data-act="open" data-arg="distretti"' : ''}>
    <div class="row-between"><span class="blk-title">Distretti</span>
      <div class="seg sm" role="radiogroup" aria-label="Periodo">
        <button role="radio" aria-checked="${V.dist === 'week'}" data-act="dist" data-arg="week">Settimana</button>
        <button role="radio" aria-checked="${V.dist === 'month'}" data-act="dist" data-arg="month">Mese</button>
      </div></div>
    <div class="row-between"><div class="kpi"><b style="color:var(--orange)">${low}</b><span>distretti carenti su ${DISTRICTS.length}</span></div>
      ${withDetail ? `<button class="go-btn" data-act="open" data-arg="distretti" aria-label="Dettaglio distretti">${IC.chevR}</button>` : ''}</div>
    <div class="figs"><figure style="margin:0">${figure(FIG_FRONT, c, 'Figura frontale: ' + desc(FIG_FRONT))}</figure><figure style="margin:0">${figure(FIG_BACK, c, 'Figura posteriore: ' + desc(FIG_BACK))}</figure></div>
    <div class="legend"><span><i style="background:${D_COL.carente}"></i>Carente</span><span><i style="background:${D_COL.ok}"></i>Ok</span><span><i style="background:${D_COL.alto}"></i>Alto</span></div>
    <div class="dbars">${bars}<span style="font-size:12px;color:var(--muted);padding-left:102px">Fascia grigia = ${st.bandMin}–${st.bandMax} serie${V.dist === 'month' ? ' · media a settimana' : ''}</span></div>
  </section>`;
}
function pauseSeries() { return allSessions().map(x => ({ x, p: pauseStats(x) })).filter(o => o.p.used + o.p.excl > 0); }
function pauseBars(list, key) {
  const vals = list.map(o => o.p[key]), max = Math.max(1, ...vals.filter(v => v != null));
  return `<div class="pbars" role="img" aria-label="Pausa media per seduta">${vals.map((v, i) => `<div class="${i === vals.length - 1 ? 'last' : ''}" style="height:${v == null ? 2 : Math.round(v / max * 92)}px" title="${v == null ? '—' : mmss(v)}"></div>`).join('')}</div>`;
}

function viewCharts() {
  const now = new Date(), k = costanzaKpi(), prog = progressData(), ps = pauseSeries(), lastP = ps[ps.length - 1], recent = ps.slice(-12);
  return `<div style="display:flex;flex-direction:column;gap:2px;padding:0 4px 4px"><span class="kicker" style="padding:0">${MONTHS_FULL[now.getMonth()]} ${now.getFullYear()}</span><h1 class="h1" style="margin:0">Grafici</h1></div>

  <section class="blk" data-act="open" data-arg="costanza">
    <div class="row-between" style="align-items:flex-start">
      <div style="display:flex;gap:18px;flex-wrap:wrap"><div class="kpi"><b>${k.c}</b><span>sedute</span></div><div class="kpi"><b style="color:var(--green)">${fmt1(k.avg)}</b><span>/sett</span></div></div>
      <button class="go-btn" data-act="open" data-arg="costanza" aria-label="Dettaglio costanza">${IC.chevR}</button>
    </div>
    ${calendar(18)}
    ${monthBars(6)}
  </section>

  <section class="blk" style="gap:6px" data-act="open" data-arg="progressi">
    <div class="row-between" style="margin-bottom:8px">${progToggle()}<span class="muted" style="font-size:13px;text-align:right">vs 4 sett. fa</span></div>
    ${prog.length ? prog.slice(0, 4).map(progRow).join('<div class="hr"></div>') : '<div class="empty">Registra delle serie per vedere i progressi.</div>'}
    ${prog.length ? `<button class="btn sm" style="margin-top:8px" data-act="open" data-arg="progressi">Tutti gli esercizi</button>` : ''}
  </section>

  ${districtBlock(true)}

  <section class="blk" style="gap:18px" data-act="open" data-arg="pause">
    <div class="row-between"><span class="blk-title">Pause</span><button class="go-btn" data-act="open" data-arg="pause" aria-label="Dettaglio pause">${IC.chevR}</button></div>
    ${lastP ? `<div class="grid2">
      <div style="display:flex;flex-direction:column;gap:4px"><div class="kpi"><b style="color:var(--blue)">${lastP.p.avgSet == null ? '—' : mmss(lastP.p.avgSet)}</b></div><span class="muted" style="font-size:14px;font-weight:600">tra serie</span></div>
      <div style="display:flex;flex-direction:column;gap:4px"><div class="kpi"><b>${lastP.p.avgEx == null ? '—' : mmss(lastP.p.avgEx)}</b></div><span class="muted" style="font-size:14px;font-weight:600">tra esercizi</span></div>
    </div>
    ${pauseBars(recent, 'avgSet')}
    <div class="row-between muted" style="font-size:13px;margin-top:-8px"><span>${recent.length} sedute fa</span><span>ultima</span></div>
    <div style="display:flex;gap:8px"><span class="chip-s">Usate ${lastP.p.used}</span><span class="chip-s muted">Escluse ${lastP.p.excl}</span></div>`
      : '<div class="empty">Le pause si calcolano dagli orari di conferma delle serie.</div>'}
  </section>`;
}

function viewCostanza() {
  const days = trainedDays(), now = new Date(), k = costanzaKpi();
  let months = '';
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1), y = d.getFullYear(), m = d.getMonth();
    const lead = (d.getDay() + 6) % 7, n = new Date(y, m + 1, 0).getDate();
    let cells = '<i class="x"></i>'.repeat(lead), c = 0;
    for (let g = 1; g <= n; g++) { const on = days.has(dayKey(new Date(y, m, g).getTime())); c += on; cells += `<i class="${on ? 'on' : ''}"></i>`; }
    months += `<div class="mcal"><b>${MONTHS_FULL[m]} ${y !== now.getFullYear() ? y : ''} <span class="muted" style="font-weight:600">· ${c}</span></b><div class="g">${cells}</div></div>`;
  }
  return backBtn('Grafici') + `<h1 class="h1 sm">Costanza</h1>
    <div class="blk"><div style="display:flex;gap:18px"><div class="kpi"><b>${k.c}</b><span>sedute questo mese</span></div></div><div class="kpi"><b style="color:var(--green);font-size:32px">${fmt1(k.avg)}</b><span>sedute a settimana</span></div></div>
    <div class="blk"><span class="blk-title">Sedute per mese</span>${monthBars(12)}</div>
    <div class="blk"><span class="blk-title">Ultimi 12 mesi</span><div class="months-grid">${months}</div></div>`;
}
function viewProgressi() {
  const prog = progressData();
  return backBtn('Grafici') + `<h1 class="h1 sm">Progressi</h1><div>${progToggle()}</div><p class="muted" style="margin:0 4px;font-size:14px">${V.prog === 'vol' ? 'Volume: serie × ripetizioni × kg dell\'ultima seduta, riscaldamenti esclusi.' : 'Epley: peso × (1 + rep/30). Esclusi riscaldamenti e serie oltre 12 rep.'}</p>
    <div class="blk" style="gap:6px">${prog.map(progRow).join('<div class="hr"></div>') || '<div class="empty">Nessun dato</div>'}</div>`;
}
function viewExercise(s) {
  const p = progressData().find(x => x.id === s.id);
  if (!p) return backBtn('Indietro') + '<div class="empty">Nessun dato</div>';
  const pr = p.e.reduce((a, b) => b.e1 > a.e1 ? b : a);
  return backBtn('Indietro') + `<h1 class="h1 sm">${esc(exById(p.id).name)}</h1>
    <div class="grid2">
      <div class="blk" style="padding:16px;gap:4px"><div class="kpi"><b style="font-size:32px">${fmt(half(p.cur))}</b><span>kg</span></div><span class="muted" style="font-size:14px;font-weight:600">1RM attuale</span></div>
      <div class="blk" style="padding:16px;gap:4px"><div class="kpi"><b style="font-size:32px;color:var(--orange)">${fmt(half(pr.e1))}</b><span>kg</span></div><span class="muted" style="font-size:14px;font-weight:600">record · ${shortDate(pr.t)}</span></div>
    </div>
    <div class="blk"><span class="blk-title">1RM stimato</span>${lineChart(p.e.map(x => ({ x: x.t, y: x.e1 })), 'var(--green)', { pr: true, label: '1RM stimato nel tempo' })}
      <span class="muted" style="font-size:12px">Punti = nuovi record · arancione = record assoluto</span></div>
    <div class="blk"><span class="blk-title">Volume totale (kg)</span>${lineChart(p.pts.map(x => ({ x: x.t, y: x.vol })), 'var(--blue)', { label: 'Volume per seduta' })}</div>`;
}
function viewPause() {
  const ps = pauseSeries(), recent = ps.slice(-20);
  const rows = [...ps].reverse().map(o => `<button class="li" data-act="session" data-arg="${o.x.id}">
    <span class="grow"><span>${esc(o.x.name)} <span class="muted" style="font-size:14px">· ${shortDate(o.x.start)}</span></span>
    <span class="sub">tra serie ${o.p.avgSet == null ? '—' : mmss(o.p.avgSet)} · tra esercizi ${o.p.avgEx == null ? '—' : mmss(o.p.avgEx)}</span>
    <span class="sub">usate ${o.p.used}, escluse ${o.p.excl}</span></span>${IC.chevR}</button>`).join('');
  const st = S.settings;
  return backBtn('Grafici') + `<h1 class="h1 sm">Pause</h1>
    <p class="muted" style="margin:0 4px;font-size:14px">Intervallo tra due conferme meno ${st.exec} s di esecuzione. Escluse se l'intervallo è sotto ${st.exec + st.minExtra} s o la pausa supera ${st.maxMin} min.</p>
    ${recent.length ? `<div class="blk"><span class="blk-title">Tra serie</span>${pauseBars(recent, 'avgSet')}</div>
    <div class="blk"><span class="blk-title">Tra esercizi</span>${pauseBars(recent, 'avgEx')}</div>` : ''}
    <div class="list">${rows || '<div class="empty">Nessuna seduta</div>'}</div>`;
}
function viewDistretti() {
  const { by } = districtCounts(V.dist), div = districtPeriod(V.dist).div;
  const detail = DISTRICTS.map(d => {
    const e = Object.entries(by[d] || {}).sort((a, b) => b[1] - a[1]);
    return e.length ? `<div class="list"><div class="ex-head"><b>${cap(d)}</b></div>${e.map(([id, n]) => `<div class="set-line"><span class="w">${esc(exById(id).name)}</span><span class="p">${fmt1(n / div)} serie</span></div>`).join('')}</div>` : '';
  }).join('');
  return backBtn('Grafici') + `<h1 class="h1 sm">Distretti</h1>${districtBlock(false)}
    <span class="section-label">Da quali esercizi</span>${detail || '<div class="empty">Nessuna serie nel periodo.</div>'}`;
}

/* ---------- Sheet ---------- */
let sheetTimer = null;
function showSheet(fn) {
  clearTimeout(sheetTimer);
  const w = $('#sheet-wrap'); w.classList.remove('closing');
  V.sheet = fn; $('#sheet').innerHTML = '<div class="grabber"></div>' + fn(); w.hidden = false;
}
function refreshSheet() { if (V.sheet) $('#sheet').innerHTML = '<div class="grabber"></div>' + V.sheet(); }
// Slide down, then hide. V.sheet is the "open" flag, so a sheet opened meanwhile cancels the hide.
function closeSheet() {
  if (!V.sheet) return;
  V.sheet = null;
  const w = $('#sheet-wrap'); w.classList.add('closing');
  sheetTimer = setTimeout(() => { w.hidden = true; w.classList.remove('closing'); }, matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 200);
}
// Native confirm()/alert() are blocked in some webviews (they return false at once), so ask in a sheet.
function ask(title, text, label, onYes) {
  V.onYes = onYes;
  showSheet(() => `<h2>${esc(title)}</h2><p>${esc(text)}</p><button class="btn danger" data-act="yes">${esc(label)}</button><button class="btn" data-act="closeSheet">Annulla</button>`);
}
// Inside an open sheet the message appears on top of the form (the form keeps its values); otherwise in its own sheet.
function notice(text) {
  if (V.sheet) {
    let p = $('#sheet .err');
    if (!p) { p = document.createElement('p'); p.className = 'err'; $('#sheet .grabber').after(p); }
    p.textContent = text;
    return;
  }
  showSheet(() => `<h2>${esc(text)}</h2><button class="btn primary" data-act="closeSheet">OK</button>`);
}

/* ---------- Azioni ---------- */
const ACT = {
  tab(k) { V.tab = k; V.stack = []; V.select = null; window.scrollTo(0, 0); render(); },
  back() { V.stack.pop(); V.select = null; render(); },
  open(k) { V.stack.push({ k }); window.scrollTo(0, 0); render(); },
  session(id) { closeSheet(); V.stack.push({ k: 'session', id }); window.scrollTo(0, 0); render(); },
  exDetail(id) { V.stack.push({ k: 'exercise', id }); window.scrollTo(0, 0); render(); },
  closeSheet,

  start: id => startSession(id),
  confirm: confirmSet,
  endDrop() { const ex = A().drop.exId; A().drop = null; advance(ex, 'drop'); },
  type(t) { prepare(A().cur, t); done(); },
  // ± only redraw: the entry is saved with the set on Conferma, no need to rewrite all history per tap.
  w(d) { const e = A().entry; e.weight = Math.max(0, Math.round((e.weight + d * S.settings.step) * 100) / 100); render(); },
  r(d) { const e = A().entry; e.reps = Math.max(1, e.reps + +d); render(); },
  step() { S.settings.step = S.settings.step === 2.5 ? 1.25 : 2.5; done(); },
  setsAdj(d) { const it = planItem(A().cur); if (it) it.sets = Math.max(1, workDone(A().cur), it.sets + +d); done(); },
  picker() { openPicker('workout'); },
  pickEx(id) {
    const a = A();
    if (!planItem(id)) a.plan.push({ exId: id, sets: 3, group: null, dropSets: [] });
    a.drop = null; prepare(id, defaultType(id)); closeSheet(); done();
  },
  oneMore() { const it = planItem(A().cur); it.sets = Math.max(it.sets, workDone(A().cur)) + 1; prepare(A().cur, defaultType(A().cur)); closeSheet(); done(); },
  timerOpen() { V.timerOpen = !V.timerOpen; render(); },
  timerToggle() { const t = A().timer; if (t.run) { t.acc += Date.now() - t.start; t.run = false; } else { t.start = Date.now(); t.run = true; } done(); },
  timerReset() { A().timer = { run: false, start: 0, acc: 0 }; done(); },
  finishAsk() {
    const n = A().sets.length;
    showSheet(() => `<h2>Concludere la sessione?</h2><p>${n ? n + ' serie registrate. La sessione verrà salvata nello storico.' : 'Nessuna serie registrata: la sessione non verrà salvata.'}</p>
      <button class="btn orange" data-act="finish">${n ? 'Concludi e salva' : 'Chiudi sessione'}</button><button class="btn" data-act="closeSheet">Continua allenamento</button>`);
  },
  finish() {
    const a = A();
    if (a.sets.length) S.sessions.push({ id: a.id, templateId: a.templateId, name: a.name, start: a.start, end: Date.now(), plan: a.plan, sets: a.sets });
    S.active = null; V.timerOpen = false; closeSheet(); done();
    backup();
  },

  editSet: id => openEditSet(id),
  edAdj(arg) { const [k, d] = arg.split('|'); const f = V.edit; f[k] = k === 'weight' ? Math.max(0, f.weight + d * S.settings.step) : Math.max(1, f.reps + +d); refreshSheet(); },
  edType(t) { V.edit.type = t; refreshSheet(); },
  edSave() {
    const f = V.edit, sess = findSession(f.sessId), z = sess && sess.sets.find(q => q.id === f.id);
    if (!z) return closeSheet();
    if (!(f.reps > 0)) { notice('Le ripetizioni devono essere almeno 1.'); return; }
    if (z.type !== f.type) { // rinumera la serie nel nuovo tipo
      const others = sess.sets.filter(q => q.exId === z.exId && q !== z);
      z.k = 0;
      z.n = f.type === 'warmup' ? others.filter(q => q.type === 'warmup').length + 1 : others.filter(q => q.type !== 'warmup').reduce((m, q) => Math.max(m, q.n), 0) + 1;
    }
    Object.assign(z, { weight: f.weight, reps: f.reps, type: f.type });
    if (sess === S.active && S.active.entry) prepare(S.active.cur, S.active.entry.type);
    closeSheet(); done();
  },
  edDelete() { ask('Eliminare questa serie?', 'Non si può annullare.', 'Elimina serie', ACT.edDeleteYes); },
  edDeleteYes() {
    const f = V.edit, sess = findSession(f.sessId);
    if (!sess) return;
    sess.sets = sess.sets.filter(q => q.id !== f.id);
    if (sess === S.active) { if (S.active.drop && !sess.sets.some(q => q.exId === S.active.drop.exId && q.n === S.active.drop.n)) S.active.drop = null; prepare(S.active.cur, S.active.drop ? 'drop' : defaultType(S.active.cur)); }
    else if (!sess.sets.length) { S.sessions = S.sessions.filter(x => x !== sess); V.stack.pop(); }
    closeSheet(); done();
  },

  scheda(id) { V.stack.push({ k: 'scheda', id }); V.select = null; window.scrollTo(0, 0); render(); },
  newTpl() {
    V.tplName = '';
    showSheet(() => `<h2>Nuova scheda</h2><label class="field"><input data-in="tplName" placeholder="Es. Push A" aria-label="Nome scheda" autocapitalize="words"></label><button class="btn primary" data-act="tplCreate">Crea</button>`);
    setTimeout(() => { const i = $('#sheet input'); if (i) i.focus(); }, 50);
  },
  tplCreate() {
    const name = (V.tplName || '').trim(); if (!name) return;
    const t = { id: uid(), name, items: [] }; S.templates.push(t); closeSheet(); V.stack.push({ k: 'scheda', id: t.id }); done();
  },
  tplRename() {
    V.tplName = curTpl().name;
    showSheet(() => `<h2>Rinomina scheda</h2><label class="field"><input data-in="tplName" value="${esc(V.tplName)}" aria-label="Nome scheda"></label><button class="btn primary" data-act="tplRenameSave">Salva</button>`);
  },
  tplRenameSave() { const n = (V.tplName || '').trim(); if (n) curTpl().name = n; closeSheet(); done(); },
  tplDelete() {
    const id = cur().id;
    ask('Eliminare la scheda?', 'Lo storico delle sessioni resta invariato.', 'Elimina scheda', () => {
      S.templates = S.templates.filter(t => t.id !== id); V.stack.pop(); done();
    });
  },
  yes() { const f = V.onYes; V.onYes = null; closeSheet(); if (f) f(); },
  tplPicker() { openPicker('tpl'); },
  tplAdd(id) { curTpl().items.push({ exId: id, sets: 3, group: null, dropSets: [] }); closeSheet(); done(); },
  tplSets(arg) { const [i, d] = arg.split('|'); const it = curTpl().items[+i]; it.sets = Math.max(1, Math.min(20, it.sets + +d)); it.dropSets = it.dropSets.filter(n => n <= it.sets); done(); },
  itemSheet: i => openItemSheet(+i),
  dropToggle(n) { const it = curTpl().items[V.itemIdx]; n = +n; it.dropSets = it.dropSets.includes(n) ? it.dropSets.filter(x => x !== n) : [...it.dropSets, n].sort((a, b) => a - b); save(); refreshSheet(); render(); },
  dropAll() { const it = curTpl().items[V.itemIdx]; it.dropSets = it.dropSets.length === it.sets ? [] : Array.from({ length: it.sets }, (_, j) => j + 1); save(); refreshSheet(); render(); },
  itemRemove() { const t = curTpl(); t.items.splice(V.itemIdx, 1); normGroups(t.items); closeSheet(); done(); },
  ungroup(g) { curTpl().items.forEach(i => { if (i.group === g) i.group = null; }); done(); },
  selStart() { V.select = new Set(); render(); },
  selCancel() { V.select = null; render(); },
  selToggle(i) { i = +i; V.select.has(i) ? V.select.delete(i) : V.select.add(i); render(); },
  selGroup() {
    const t = curTpl(), idx = [...V.select].sort((a, b) => a - b);
    if (idx.length < 2) return;
    const g = uid(), picked = idx.map(i => t.items[i]);
    picked.forEach(it => { it.group = g; });
    const rest = t.items.filter(it => !picked.includes(it));
    rest.splice(idx[0] - idx.filter(i => i < idx[0]).length, 0, ...picked);
    t.items = rest; normGroups(t.items); V.select = null; done();
  },

  newEx: () => openExForm(null),
  editEx: id => openExForm(id),
  exPrim(d) { const f = V.exForm; f.primary = d; f.secondary = f.secondary.filter(x => x !== d); refreshSheet(); },
  exSec(d) { const f = V.exForm; f.secondary = f.secondary.includes(d) ? f.secondary.filter(x => x !== d) : [...f.secondary, d]; refreshSheet(); },
  exBw() { V.exForm.bodyweight = !V.exForm.bodyweight; refreshSheet(); },
  exSave() {
    const f = V.exForm, name = f.name.trim();
    if (!name) { notice('Inserisci un nome.'); return; }
    if (S.exercises.some(e => e.id !== f.id && e.name.toLowerCase() === name.toLowerCase())) { notice('Esiste già un esercizio con questo nome.'); return; }
    const data = { name, primary: f.primary, secondary: f.secondary, bodyweight: f.bodyweight };
    if (f.id) Object.assign(S.exercises.find(e => e.id === f.id), data); else S.exercises.push({ id: uid(), ...data });
    closeSheet(); done();
  },
  setting: k => openSetting(k),
  setAdj(arg) {
    const [k, d] = arg.split('|'), [step, min, max] = SET_RULES[k], st = S.settings;
    st[k] = Math.max(min, Math.min(max, st[k] + d * step));
    if (st.bandMin > st.bandMax) { if (k === 'bandMin') st.bandMax = st.bandMin; else st.bandMin = st.bandMax; }
    save(); refreshSheet(); render();
  },
  dist(m) { V.dist = m; render(); },
  prog(m) { V.prog = m; render(); },
  startTab(m) { V.startTab = m; render(); },
  editName() {
    V.tplName = S.settings.name;
    showSheet(() => `<h2>Il tuo nome</h2><p>Per il saluto nella schermata Workout.</p><label class="field"><input data-in="tplName" value="${esc(V.tplName)}" placeholder="Nome" aria-label="Nome" autocapitalize="words"></label><button class="btn primary" data-act="nameSave">Salva</button>`);
  },
  nameSave() { S.settings.name = (V.tplName || '').trim().slice(0, 30); closeSheet(); done(); },
  editUser() {
    V.tplName = S.settings.user;
    showSheet(() => `<h2>Nome utente</h2><p>Il backup online viene salvato con questo nome (minuscole, numeri, . _ -). Sul telefono nuovo usa lo stesso nome e tocca Ripristina.</p><label class="field"><input data-in="tplName" value="${esc(V.tplName)}" placeholder="es. marco" aria-label="Nome utente" autocapitalize="none" autocorrect="off" spellcheck="false"></label><button class="btn primary" data-act="userSave">Salva</button>`);
  },
  async userSave() {
    const u = (V.tplName || '').trim().toLowerCase();
    if (u && !USER_RE.test(u)) { notice('Da 2 a 30 caratteri: lettere minuscole, numeri, . _ -'); return; }
    if (u === S.settings.user) return closeSheet();
    S.settings.user = u; lsSet('.cloudAt', null); closeSheet(); done();
    if (!u) return;
    // An existing backup under this name: offer it before this phone's data replaces it.
    try { const w = await fetchBackup(u); if (w) return offerRestore(w); } catch (e) { /* offline or no server */ }
    backup().then(render);
  },
  async cloudRestore() {
    try {
      const w = await fetchBackup(S.settings.user);
      if (!w) return notice(`Nessun backup online per "${S.settings.user}".`);
      offerRestore(w);
    } catch (e) { notice('Backup online non raggiungibile. Controlla la connessione.'); }
  },
  showAll() { V.showAll = true; $('#ex-results').innerHTML = exResults(); },

  async export() {
    const data = JSON.stringify(S), d = new Date();
    const name = `palestra-backup-${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}.json`;
    const file = new File([data], name, { type: 'application/json' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file] }); return; } catch (e) { if (e.name === 'AbortError') return; }
    }
    const a = document.createElement('a'); a.href = URL.createObjectURL(file); a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  },
  import() { $('#import-file').click(); },
};

const IN = {
  weight(v) { A().entry.weight = parseNum(v); },
  reps(v) { A().entry.reps = Math.floor(parseNum(v)); },
  exq(v) { V.q = v; $('#ex-results').innerHTML = exResults(); },
  pq(v) { V.pq = v; $('#pick-results').innerHTML = pickList(); },
  exname(v) { V.exForm.name = v; },
  tplName(v) { V.tplName = v; },
  edW(v) { V.edit.weight = parseNum(v); },
  edR(v) { V.edit.reps = Math.floor(parseNum(v)); },
};

document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (!el || el.disabled) return;
  if (el.tagName === 'SECTION' && e.target.closest('button, a, input')) return;
  const f = ACT[el.dataset.act];
  if (f) f(el.dataset.arg, el, e);
});
document.addEventListener('input', e => {
  const t = e.target, f = IN[t.dataset.in]; if (!f) return;
  f(t.value);
  if (t.closest('.big')) t.setAttribute('style', bigSize(t.value));
});
// Reformat in place: a full render here would replace the button the finger is lifting off (e.g. Conferma) and lose the tap.
document.addEventListener('change', e => {
  const t = e.target, k = t.dataset.in;
  if (k !== 'weight' && k !== 'reps') return;
  t.value = k === 'weight' ? fmt(A().entry.weight) : A().entry.reps;
  t.setAttribute('style', bigSize(t.value));
});
document.addEventListener('focusin', e => { if (e.target.dataset.in === 'weight' || e.target.dataset.in === 'reps') e.target.select(); });
document.addEventListener('keydown', e => {
  if (e.key !== 'Enter') return;
  if (e.target.matches('#sheet input')) { const b = $('#sheet .btn.primary'); if (b) b.click(); }
});

$('#import-file').addEventListener('change', async e => {
  const file = e.target.files[0]; e.target.value = '';
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (!valid(data)) throw new Error('formato');
    ask('Importare il backup?', 'Tutti i dati attuali verranno sostituiti.', 'Importa', () => {
      S = migrate(data); V.stack = []; V.tab = 'setup'; done();
      notice('Backup importato.');
    });
  } catch (err) { notice('File non valido: non è un backup di questa app.'); }
});

/* Riordino schede: trascina dalla maniglia */
let drag = null;
document.addEventListener('pointerdown', e => {
  const h = e.target.closest('[data-drag]'); if (!h) return;
  const row = h.closest('.ed-row'), rows = [...document.querySelectorAll('.ed-row')];
  e.preventDefault();
  drag = { row, from: +row.dataset.idx, y0: e.clientY, mids: rows.filter(r => r !== row).map(r => { const b = r.getBoundingClientRect(); return b.top + b.height / 2; }), to: +row.dataset.idx };
  row.classList.add('dragging');
  h.setPointerCapture(e.pointerId);
});
document.addEventListener('pointermove', e => {
  if (!drag) return;
  drag.row.style.transform = `translateY(${e.clientY - drag.y0}px)`;
  drag.to = drag.mids.filter(m => m < e.clientY).length;
});
const endDrag = () => {
  if (!drag) return;
  const { from, to } = drag; drag = null;
  const items = curTpl().items, [it] = items.splice(from, 1);
  items.splice(to, 0, it);
  const p = items[to - 1], n = items[to + 1];
  it.group = p && n && p.group && p.group === n.group ? p.group : (p && p.group === it.group) || (n && n.group === it.group) ? it.group : null;
  normGroups(items); done();
};
document.addEventListener('pointerup', endDrag);
document.addEventListener('pointercancel', endDrag);

/* Aggiornamento in tempo reale (indicatore, cronometro, timer) */
function tick() {
  const a = A(); if (!a) return;
  const now = Date.now(), last = a.sets[a.sets.length - 1];
  document.querySelectorAll('[data-live]').forEach(el => {
    const k = el.dataset.live;
    if (k === 'since' && last) el.textContent = mmss((now - last.ts) / 1000);
    else if (k === 'clock') el.textContent = clock((now - a.start) / 1000);
    else if (k === 'timer') el.textContent = mmss(timerSec());
    else if (k === 'tpill') el.textContent = a.timer.run || a.timer.acc ? mmss(timerSec()) : 'Pausa';
  });
}
setInterval(tick, 500);
document.addEventListener('visibilitychange', tick);

/* Self-check of the core math: open the app with ?selftest. Uses a fake history and never saves. */
function selftest() {
  const real = S, res = [];
  const eq = (name, got, want) => res.push([Math.abs(got - want) < 1e-6 || got === want, name, got, want]);
  try {
    S = fresh(); // x0 = Bench Press: petto, secondari spalle + tricipiti
    const t0 = monday(Date.now()) + 60000;
    let t = t0, i = 0;
    const set = (gap, type, n, k, weight, reps) => { t += gap * 1000; return { id: 's' + i++, exId: 'x0', type, n, k, weight, reps, ts: t }; };
    const sets = [set(0, 'warmup', 1, 0, 40, 10), set(100, 'normal', 1, 0, 60, 8), set(100, 'normal', 2, 0, 60, 8),
      set(20, 'normal', 3, 0, 60, 8), set(1200, 'normal', 4, 0, 60, 8), set(100, 'drop', 5, 0, 80, 15), set(5, 'drop', 5, 1, 50, 10)];
    S.sessions = [{ id: 'past', name: 'T', start: t0, plan: [], sets }];
    const ps = pauseStats(S.sessions[0]);
    eq('pausa media tra serie (100 s − 30 s)', ps.avgSet, 70);
    eq('pause usate', ps.used, 3);
    eq('pause escluse (20 s e 20 min)', ps.excl, 2);
    const p = progressData()[0];
    eq('1RM Epley 60×8, esclusa 80×15', half(p.cur), 76);
    eq('volume senza riscaldamento', p.pts[0].vol, 3620);
    const { c } = districtCounts('week');
    eq('serie petto (drop = 1 serie)', c.petto, 5);
    eq('serie spalle (secondario = 0,5)', c.spalle, 2.5);
    S.active = { id: 'act', name: 'T', start: Date.now(), plan: [{ exId: 'x0', sets: 3, group: null, dropSets: [] }], sets: [], drop: null };
    eq('prefill stessa serie (serie 2 → 60)', suggest('x0', 'normal', 2, 0).weight, 60);
    eq('prefill riscaldamento (R1 → 40)', suggest('x0', 'warmup', 1, 0).weight, 40);
    eq('prefill serie nuova → ultima serie (50)', suggest('x0', 'normal', 9, 0).weight, 50);
    S.active.sets = [{ exId: 'x0', type: 'warmup', n: 2 }];
    eq('riscaldamento dopo aver eliminato R1', nextWarmN('x0'), 3);
    const noon = new Date().setHours(12, 0, 0, 0);
    S.active = null; S.sessions = [{ id: 'a', name: 'T', start: noon, sets: [] }, { id: 'b', name: 'T', start: noon + 60000, sets: [] }];
    eq('due sedute stesso giorno = 1', costanzaKpi().c, 1);
    const good = JSON.parse(JSON.stringify(real));
    eq('backup attuale valido', valid(good), true);
    eq('rifiuta distretto con codice', valid({ ...good, exercises: [{ id: 'z', name: 'z', primary: 'petto', secondary: ['<img src=x onerror=alert(1)>'] }] }), false);
    eq('rifiuta id con virgolette', valid({ ...good, templates: [{ id: 'a"b', name: 'z', items: [] }] }), false);
  } catch (err) { res.push([false, 'errore: ' + err.message, '', '']); }
  S = real;
  const fails = res.filter(r => !r[0]).length;
  console.table(res);
  showSheet(() => `<h2>${fails ? fails + ' controlli falliti' : 'Tutti i ' + res.length + ' controlli ok'}</h2><div class="list">${res.map(([ok, n, got, want]) =>
    `<div class="set-line"><span class="w" style="font-weight:500;font-size:14px">${esc(n)}</span><span class="p ${ok ? '' : 'bad'}">${ok ? 'ok' : esc(got) + ' ≠ ' + esc(want)}</span></div>`).join('')}</div><button class="btn primary" data-act="closeSheet">Chiudi</button>`);
}
if (/[?&]selftest\b/.test(location.search)) setTimeout(selftest);

document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') backup(); });
window.addEventListener('online', backup);
setInterval(backup, 10 * 60000);

if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
render();
