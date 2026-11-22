// Leaderboard with three storage backends, picked automatically:
//  1. "api"      — /api/leaderboard on Vercel (Upstash Redis). Global for everyone.
//  2. "artifact" — Claude artifact shared database (when played inside claude.ai).
//  3. "local"    — this browser only (always available as a fallback).

const LOCAL_KEY = 'endless-car-chase-runs-v1';
const MAX_LOCAL = 50;

function withTimeout(promise, ms) {
  return Promise.race([promise, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);
}

export function cleanName(name) {
  return String(name || '').replace(/[^\p{L}\p{N} _.\-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 16);
}

function byTime(a, b) { return (b.time - a.time) || (b.score - a.score); }

export class Leaderboard {
  constructor(pid) {
    this.pid = pid;
    this.mode = 'local';
    this.ready = this._detect();
  }

  async _detect() {
    // 1) Vercel serverless API (only exists on the deployed site)
    if (location.protocol.startsWith('http')) {
      try {
        const r = await withTimeout(fetch(`/api/leaderboard?probe=1`, { cache: 'no-store' }), 5000);
        if (r.ok && (r.headers.get('content-type') || '').includes('json')) {
          const j = await r.json();
          if (j && j.enabled) { this.mode = 'api'; return; }
        }
      } catch (e) { /* not deployed with the API */ }
    }
    // 2) Claude artifact shared database
    try {
      if (window.claude && typeof window.claude.use === 'function') {
        const db = await withTimeout(window.claude.use('db'), 8000);
        const user = await withTimeout(window.claude.use('user'), 8000);
        const uid = user ? await user.id() : null;
        if (db && uid) { this.db = db; this.uid = uid; this.mode = 'artifact'; return; }
      }
    } catch (e) { /* not inside claude.ai */ }
    this.mode = 'local';
  }

  get label() {
    return { api: 'Global — all players', artifact: 'Global — everyone with this link', local: 'This device only' }[this.mode];
  }

  // ---------- local ----------
  localRuns() {
    try {
      const arr = JSON.parse(localStorage.getItem(LOCAL_KEY));
      return Array.isArray(arr) ? arr : [];
    } catch (e) { return []; }
  }

  _saveLocal(entry) {
    const runs = this.localRuns();
    runs.push(entry);
    runs.sort(byTime);
    try { localStorage.setItem(LOCAL_KEY, JSON.stringify(runs.slice(0, MAX_LOCAL))); } catch (e) { /* ignore */ }
  }

  // ---------- submit ----------
  /** Saves a finished run. Returns { rank } (global rank when available) */
  async submit(entry) {
    this._saveLocal(entry);
    await this.ready;
    try {
      if (this.mode === 'api') {
        const r = await withTimeout(fetch('/api/leaderboard', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ ...entry, pid: this.pid }),
        }), 8000);
        const j = await r.json();
        return { rank: j.rank ?? null };
      }
      if (this.mode === 'artifact') {
        const ref = this.db.doc(`scores/${this.uid}`);
        const snap = await ref.get();
        const prev = snap.exists ? snap.data() : null;
        if (!prev || entry.time > prev.time) await ref.set({ ...entry });
        else if (prev.name !== entry.name) await ref.update({ name: entry.name });
        const list = await this.fetchGlobal();
        const idx = list.entries.findIndex((e) => e.me);
        return { rank: idx >= 0 ? idx + 1 : null };
      }
    } catch (e) { console.warn('Leaderboard submit failed', e); }
    const local = this.localRuns();
    const idx = local.findIndex((r) => r.date === entry.date);
    return { rank: idx >= 0 ? idx + 1 : null, local: true };
  }

  /** Rename the player's existing global entry */
  async rename(name) {
    await this.ready;
    try {
      if (this.mode === 'api') {
        await fetch('/api/leaderboard', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ pid: this.pid, name, renameOnly: true }) });
      } else if (this.mode === 'artifact') {
        const ref = this.db.doc(`scores/${this.uid}`);
        const snap = await ref.get();
        if (snap.exists) await ref.update({ name });
      }
    } catch (e) { /* ignore */ }
  }

  // ---------- read ----------
  async fetchGlobal() {
    await this.ready;
    if (this.mode === 'api') {
      const r = await withTimeout(fetch(`/api/leaderboard?pid=${encodeURIComponent(this.pid)}`, { cache: 'no-store' }), 8000);
      const j = await r.json();
      return { entries: j.entries || [], you: j.you || null };
    }
    if (this.mode === 'artifact') {
      const snap = await withTimeout(this.db.collection('scores').orderBy('time', 'desc').limit(50).get(), 10000);
      const entries = snap.docs.map((d) => ({ ...d.data(), me: d.id === this.uid }));
      entries.sort(byTime);
      return { entries, you: null };
    }
    return { entries: [], you: null, offline: true };
  }
}
