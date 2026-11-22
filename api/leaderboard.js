// Vercel Serverless Function: global leaderboard stored in Upstash Redis.
// Setup: Vercel dashboard → your project → Storage → Create / connect "Upstash for Redis".
// Vercel then adds the env vars automatically (KV_REST_API_URL + KV_REST_API_TOKEN,
// or UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN). Redeploy after connecting.

const BOARD = 'ecc:board';   // sorted set: pid -> best time
const INFO = 'ecc:info';     // hash: pid -> JSON entry
const TOP = 50;
const KEEP = 1000;

function getRedisConfig() {
  const rawUrl = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || process.env.REDIS_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || process.env.REDIS_REST_API_TOKEN;
  const url = rawUrl ? rawUrl.replace(/\/+$/, '') : null;
  return { url, token };
}

async function redis(commands, url, token) {
  const r = await fetch(`${url}/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(commands),
  });
  if (!r.ok) throw new Error(`Redis error ${r.status}`);
  const out = await r.json();
  if (!Array.isArray(out)) throw new Error('Invalid Redis response');
  return out.map((x) => x.result);
}

const clean = (s, n) => String(s || '').replace(/[^\p{L}\p{N} _.\-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, n);
const num = (v, max) => { const x = Number(v); return Number.isFinite(x) ? Math.max(0, Math.min(max, x)) : 0; };

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body || '{}'); } catch { return {}; }
  }
  try {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const str = Buffer.concat(chunks).toString();
    return str ? JSON.parse(str) : {};
  } catch {
    return {};
  }
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  const { url, token } = getRedisConfig();
  if (!url || !token) return res.status(200).json({ enabled: false, entries: [] });

  try {
    if (req.method === 'GET') {
      if (req.query && req.query.probe) return res.status(200).json({ enabled: true });
      const pid = clean(req.query && req.query.pid, 40);
      const [flat] = await redis([['ZREVRANGE', BOARD, '0', String(TOP - 1), 'WITHSCORES']], url, token);
      const flatList = Array.isArray(flat) ? flat : [];
      const ids = [];
      for (let i = 0; i < flatList.length; i += 2) ids.push(flatList[i]);
      let infos = [];
      if (ids.length) [infos] = await redis([['HMGET', INFO, ...ids]], url, token);
      const entries = ids.map((id, i) => {
        let e = {};
        try { e = JSON.parse(infos[i] || '{}'); } catch (err) { /* ignore */ }
        return { name: e.name || 'Driver', time: Number(flatList[i * 2 + 1]), score: e.score || 0, kills: e.kills || 0, car: e.car || '', date: e.date || '', me: id === pid };
      });
      let you = null;
      if (pid && !entries.some((e) => e.me)) {
        const [rank, info] = await redis([['ZREVRANK', BOARD, pid], ['HGET', INFO, pid]], url, token);
        if (rank !== null && info) {
          let e = {};
          try { e = JSON.parse(info || '{}'); } catch (err) { /* ignore */ }
          you = { rank: rank + 1, ...e, me: true };
        }
      }
      return res.status(200).json({ enabled: true, entries, you });
    }

    if (req.method === 'POST') {
      const b = await readBody(req);
      const pid = clean(b.pid, 40);
      const name = clean(b.name, 16) || 'Driver';
      if (!pid) return res.status(400).json({ error: 'missing pid' });

      if (b.renameOnly) {
        const [info] = await redis([['HGET', INFO, pid]], url, token);
        if (info) {
          try {
            const e = JSON.parse(info);
            e.name = name;
            await redis([['HSET', INFO, pid, JSON.stringify(e)]], url, token);
          } catch (err) { /* ignore */ }
        }
        return res.status(200).json({ ok: true });
      }

      const entry = {
        name,
        time: Math.round(num(b.time, 7200) * 10) / 10,
        score: Math.round(num(b.score, 1e6)),
        kills: Math.round(num(b.kills, 1e5)),
        car: clean(b.car, 24),
        date: new Date().toISOString(),
      };
      const [prev, prevInfo] = await redis([['ZSCORE', BOARD, pid], ['HGET', INFO, pid]], url, token);
      if (prev === null || entry.time > Number(prev)) {
        await redis([
          ['ZADD', BOARD, String(entry.time), pid],
          ['HSET', INFO, pid, JSON.stringify(entry)],
          ['ZREMRANGEBYRANK', BOARD, '0', String(-KEEP - 1)],
        ], url, token);
      } else if (prevInfo) {
        try {
          const e = JSON.parse(prevInfo);
          if (e.name !== name) {
            e.name = name;
            await redis([['HSET', INFO, pid, JSON.stringify(e)]], url, token);
          }
        } catch (err) { /* ignore */ }
      }
      const [rank] = await redis([['ZREVRANK', BOARD, pid]], url, token);
      return res.status(200).json({ ok: true, rank: rank === null ? null : rank + 1, best: prev === null || entry.time > Number(prev) });
    }

    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'method not allowed' });
  } catch (err) {
    return res.status(500).json({ error: 'leaderboard unavailable' });
  }
};
