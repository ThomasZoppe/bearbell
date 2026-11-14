// Backup in the cloud: one copy per username (the last one wins), no password — the app is shared among friends.
// GET  /api/backup?user=marco  → { savedAt, data }   (404 if none)
// PUT  /api/backup?user=marco  body = app state JSON → { savedAt }
import { getStore } from '@netlify/blobs';

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

export default async req => {
  const user = (new URL(req.url).searchParams.get('user') || '').trim().toLowerCase();
  if (!/^[a-z0-9._-]{2,30}$/.test(user)) return json({ error: 'nome utente non valido' }, 400);
  const store = getStore({ name: 'backup', consistency: 'strong' });

  if (req.method === 'GET') {
    const saved = await store.get(user, { type: 'json' });
    return saved ? json(saved) : json({ error: 'nessun backup' }, 404);
  }
  if (req.method === 'PUT') {
    const text = await req.text();
    if (text.length > 4_000_000) return json({ error: 'backup troppo grande' }, 413);
    let data;
    try { data = JSON.parse(text); } catch { return json({ error: 'JSON non valido' }, 400); }
    if (!data || !Array.isArray(data.sessions) || !Array.isArray(data.exercises)) return json({ error: 'non è un backup di Bearbell' }, 400);
    const savedAt = Date.now();
    await store.setJSON(user, { savedAt, data });
    return json({ savedAt });
  }
  return json({ error: 'metodo non supportato' }, 405);
};

export const config = { path: '/api/backup' };
