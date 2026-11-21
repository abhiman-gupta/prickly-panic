// Prickly Panic leaderboard API (Cloudflare Worker + D1).
//
//   POST /player              {name}                    -> {id, key}   new device identity
//   POST /run                 (auth)                    -> {run}       ticket for a run that just started
//   POST /score               (auth) {run, score, cleared, close, name}
//                                                       -> {ok, best, rank, weekRank, passed} or {ok:false, reason}
//   GET  /board?period=week|all&player=ID               -> {period, week, top, me, total}
//   GET  /config                                        -> {vapid}     public VAPID key for push
//   POST /push                (auth) {subscription}     -> {ok}        "tell me when someone beats me"
//   DELETE /push              (auth)                    -> {ok}
//   GET  /admin/recent        (Bearer ADMIN_TOKEN)      -> latest runs, for spotting cheaters
//   POST /admin/ban           (Bearer ADMIN_TOKEN) {player, banned}
//
// Auth for player calls: headers X-Player (id) and X-Key (HMAC of the id, handed out by /player).

import { sendPush } from './push.js';

const MIN_MS_PER_PLANT = 450;  // plants come at most ~1.6 per second, even at top speed
const MAX_RUN_MS = 3 * 3600e3;
const NOTIFY_EVERY_MS = 3 * 3600e3; // at most one "you got beaten" push per player per 3 hours
const PUSH_HOSTS = [/(^|\.)fcm\.googleapis\.com$/, /(^|\.)push\.services\.mozilla\.com$/, /(^|\.)push\.apple\.com$/, /(^|\.)notify\.windows\.com$/];

export default {
  async fetch(req, env, ctx) {
    const origin = req.headers.get('Origin') || '';
    const allowed = (env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim());
    const cors = {
      'Access-Control-Allow-Origin': allowed.includes(origin) ? origin : allowed[0] || '*',
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Player, X-Key, Authorization',
      'Access-Control-Max-Age': '86400',
      Vary: 'Origin',
    };
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    try {
      const res = await route(req, env, ctx);
      for (const [k, v] of Object.entries(cors)) res.headers.set(k, v);
      return res;
    } catch (e) {
      const status = e.status || 500;
      if (status === 500) console.error(e.stack || e);
      return json({ error: status === 500 ? 'server error' : e.message }, status, cors);
    }
  },
};

async function route(req, env, ctx) {
  const url = new URL(req.url);
  const p = url.pathname.replace(/\/+$/, '') || '/';
  const m = req.method;
  if (m === 'GET' && p === '/') return json({ name: 'prickly-panic-api', ok: true });
  if (m === 'GET' && p === '/config') return json({ vapid: env.VAPID_PUBLIC || '' });
  if (m === 'POST' && p === '/player') return newPlayer(req, env);
  if (m === 'POST' && p === '/run') return startRun(req, env);
  if (m === 'POST' && p === '/score') return submitScore(req, env, ctx);
  if (m === 'GET' && p === '/board') return board(url, env);
  if (m === 'POST' && p === '/push') return subscribe(req, env);
  if (m === 'DELETE' && p === '/push') return unsubscribe(req, env);
  if (p.startsWith('/admin/')) return admin(req, env, p, m);
  throw httpErr(404, 'not found');
}

// ---------------------------------------------------------------- players
async function newPlayer(req, env) {
  const body = await readJson(req);
  const id = crypto.randomUUID();
  await env.DB.prepare('INSERT INTO players (id, name, created) VALUES (?, ?, ?)').bind(id, cleanName(body.name), Date.now()).run();
  return json({ id, key: await playerKey(env, id) });
}

async function auth(req, env) {
  const id = req.headers.get('X-Player') || '', key = req.headers.get('X-Key') || '';
  if (!/^[0-9a-f-]{36}$/.test(id) || !safeEqual(key, await playerKey(env, id))) throw httpErr(401, 'bad player key');
  const player = await env.DB.prepare('SELECT * FROM players WHERE id = ?').bind(id).first();
  if (!player) throw httpErr(401, 'unknown player');
  return player;
}

// ---------------------------------------------------------------- runs + scores
async function startRun(req, env) {
  const player = await auth(req, env);
  const now = Date.now();
  const last = await env.DB.prepare('SELECT started FROM runs WHERE player = ? ORDER BY started DESC LIMIT 1').bind(player.id).first();
  if (last && now - last.started < 1500) throw httpErr(429, 'slow down');
  const run = crypto.randomUUID();
  await env.DB.prepare('INSERT INTO runs (id, player, started) VALUES (?, ?, ?)').bind(run, player.id, now).run();
  return json({ run });
}

async function submitScore(req, env, ctx) {
  const player = await auth(req, env);
  const b = await readJson(req);
  const now = Date.now();
  const run = await env.DB.prepare('SELECT * FROM runs WHERE id = ? AND player = ?').bind(String(b.run || ''), player.id).first();
  if (!run) throw httpErr(404, 'unknown run');
  if (run.ended) throw httpErr(409, 'run already scored');
  const score = int(b.score), cleared = int(b.cleared), close = int(b.close);
  // plausibility: the numbers must add up, and the run must have lasted long enough for that many plants
  let reason = '';
  if (score < 0 || cleared < 0 || close < 0) reason = 'negative';
  else if (score !== cleared + close || close > cleared) reason = 'inconsistent';
  else if (now - run.started < cleared * MIN_MS_PER_PLANT) reason = 'too fast';
  else if (now - run.started > MAX_RUN_MS) reason = 'too old';
  await env.DB.prepare('UPDATE runs SET ended = ?, score = ?, cleared = ?, close = ?, rejected = ? WHERE id = ?')
    .bind(now, score, cleared, close, reason || null, run.id).run();
  if (reason) return json({ ok: false, reason });

  const name = cleanName(b.name ?? player.name);
  const prevBest = player.best;
  const week = weekKey(now);
  const stmts = [env.DB.prepare('UPDATE players SET name = ? WHERE id = ?').bind(name, player.id)];
  if (score > prevBest) stmts.push(env.DB.prepare('UPDATE players SET best = ?, best_at = ? WHERE id = ?').bind(score, now, player.id));
  stmts.push(env.DB.prepare(`INSERT INTO weekly (week, player, score, at) VALUES (?, ?, ?, ?)
    ON CONFLICT (week, player) DO UPDATE SET score = excluded.score, at = excluded.at WHERE excluded.score > weekly.score`).bind(week, player.id, score, now));
  await env.DB.batch(stmts);

  const best = Math.max(prevBest, score);
  const rank = player.banned ? null : await rankOf(env, 'all', best, player.id);
  const wk = await env.DB.prepare('SELECT score FROM weekly WHERE week = ? AND player = ?').bind(week, player.id).first();
  const weekRank = player.banned ? null : await rankOf(env, 'week', wk.score, player.id, week);

  // who did this score just pass? players whose best sat between the old best and the new score
  let passed = [];
  if (score > prevBest && !player.banned && score >= 3) {
    const { results } = await env.DB.prepare(`SELECT id, name, best FROM players
      WHERE banned = 0 AND id != ? AND best >= ? AND best < ? ORDER BY best DESC LIMIT 25`).bind(player.id, Math.max(prevBest, 1), score).all();
    passed = results;
    if (passed.length) ctx.waitUntil(notifyPassed(env, passed, name, score, now));
  }
  return json({ ok: true, best, rank, weekRank, passed: passed.length, week });
}

async function notifyPassed(env, passed, name, score, now) {
  if (!env.VAPID_PUBLIC || !env.VAPID_PRIVATE_JWK) return;
  const ids = passed.map((p) => p.id);
  const { results: subs } = await env.DB.prepare(`SELECT push.*, players.best, players.notified_at FROM push JOIN players ON players.id = push.player
    WHERE push.player IN (${ids.map(() => '?').join(',')})`).bind(...ids).all();
  for (const s of subs) {
    if (now - s.notified_at < NOTIFY_EVERY_MS) continue;
    const payload = {
      title: 'Prickly Panic',
      body: `${name} just beat your best of ${s.best} with ${score}. Fly again?`,
      tag: 'beaten',
      url: '/',
    };
    try {
      const res = await sendPush(env, { endpoint: s.endpoint, p256dh: s.p256dh, auth: s.auth }, JSON.stringify(payload));
      if (res.status === 404 || res.status === 410) await env.DB.prepare('DELETE FROM push WHERE player = ?').bind(s.player).run();
      else if (res.ok) await env.DB.prepare('UPDATE players SET notified_at = ? WHERE id = ?').bind(now, s.player).run();
      else console.warn('push failed', res.status, await res.text());
    } catch (e) { console.warn('push error', e.message); }
  }
}

// ---------------------------------------------------------------- boards
async function rankOf(env, period, score, id, week) {
  const r = period === 'week'
    ? await env.DB.prepare(`SELECT COUNT(*) AS n FROM weekly JOIN players ON players.id = weekly.player
        WHERE weekly.week = ? AND players.banned = 0 AND (weekly.score > ? OR (weekly.score = ? AND weekly.at < (SELECT at FROM weekly WHERE week = ? AND player = ?)))`)
      .bind(week, score, score, week, id).first()
    : await env.DB.prepare(`SELECT COUNT(*) AS n FROM players
        WHERE banned = 0 AND best > 0 AND (best > ? OR (best = ? AND best_at < (SELECT best_at FROM players WHERE id = ?)))`)
      .bind(score, score, id).first();
  return r.n + 1;
}

async function board(url, env) {
  const period = url.searchParams.get('period') === 'all' ? 'all' : 'week';
  const me = url.searchParams.get('player') || '';
  const limit = clamp(int(url.searchParams.get('limit') || 50), 1, 100);
  const week = weekKey(Date.now());
  const q = period === 'week'
    ? env.DB.prepare(`SELECT players.id, players.name, weekly.score FROM weekly JOIN players ON players.id = weekly.player
        WHERE weekly.week = ? AND players.banned = 0 ORDER BY weekly.score DESC, weekly.at ASC LIMIT ?`).bind(week, limit)
    : env.DB.prepare(`SELECT id, name, best AS score FROM players WHERE banned = 0 AND best > 0 ORDER BY best DESC, best_at ASC LIMIT ?`).bind(limit);
  const total = period === 'week'
    ? await env.DB.prepare('SELECT COUNT(*) AS n FROM weekly JOIN players ON players.id = weekly.player WHERE week = ? AND banned = 0').bind(week).first()
    : await env.DB.prepare('SELECT COUNT(*) AS n FROM players WHERE banned = 0 AND best > 0').first();
  const { results } = await q.all();
  const top = results.map((r, i) => ({ rank: i + 1, name: r.name, score: r.score, me: r.id === me }));
  let mine = null;
  if (me && !top.some((r) => r.me)) {
    const row = period === 'week'
      ? await env.DB.prepare('SELECT score FROM weekly WHERE week = ? AND player = ?').bind(week, me).first()
      : await env.DB.prepare('SELECT best AS score FROM players WHERE id = ? AND banned = 0 AND best > 0').bind(me).first();
    if (row) mine = { rank: await rankOf(env, period, row.score, me, week), score: row.score };
  }
  return json({ period, week, top, me: mine, total: total.n }, 200, { 'Cache-Control': 'no-store' });
}

// ---------------------------------------------------------------- push subscriptions
async function subscribe(req, env) {
  const player = await auth(req, env);
  const { subscription: s } = await readJson(req);
  let host = '';
  try { const u = new URL(s.endpoint); if (u.protocol === 'https:') host = u.hostname; } catch {}
  if (!host || !PUSH_HOSTS.some((re) => re.test(host))) throw httpErr(400, 'unsupported push service');
  const p256dh = String(s.keys?.p256dh || ''), authKey = String(s.keys?.auth || '');
  if (!/^[A-Za-z0-9_-]{80,100}$/.test(p256dh) || !/^[A-Za-z0-9_-]{16,32}$/.test(authKey)) throw httpErr(400, 'bad keys');
  await env.DB.prepare(`INSERT INTO push (player, endpoint, p256dh, auth, created) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT (player) DO UPDATE SET endpoint = excluded.endpoint, p256dh = excluded.p256dh, auth = excluded.auth, created = excluded.created`)
    .bind(player.id, s.endpoint, p256dh, authKey, Date.now()).run();
  return json({ ok: true });
}

async function unsubscribe(req, env) {
  const player = await auth(req, env);
  await env.DB.prepare('DELETE FROM push WHERE player = ?').bind(player.id).run();
  return json({ ok: true });
}

// ---------------------------------------------------------------- admin
async function admin(req, env, p, m) {
  const tok = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!env.ADMIN_TOKEN || !safeEqual(tok, env.ADMIN_TOKEN)) throw httpErr(401, 'no');
  if (m === 'GET' && p === '/admin/recent') {
    const { results } = await env.DB.prepare(`SELECT runs.*, players.name, players.best, players.banned FROM runs JOIN players ON players.id = runs.player
      WHERE runs.ended IS NOT NULL ORDER BY runs.ended DESC LIMIT 100`).all();
    return json(results.map((r) => ({ ...r, seconds: Math.round((r.ended - r.started) / 1000) })));
  }
  if (m === 'POST' && p === '/admin/ban') {
    const b = await readJson(req);
    await env.DB.prepare('UPDATE players SET banned = ? WHERE id = ?').bind(b.banned === false ? 0 : 1, String(b.player)).run();
    return json({ ok: true });
  }
  throw httpErr(404, 'not found');
}

// ---------------------------------------------------------------- helpers
// weeks start Monday 00:00 in Arizona (UTC-7 all year, no daylight saving)
function weekKey(now) {
  const az = new Date(now - 7 * 3600e3);
  const monday = new Date(az.getTime() - ((az.getUTCDay() + 6) % 7) * 86400e3);
  return monday.toISOString().slice(0, 10);
}
function cleanName(s) {
  const n = String(s ?? '').replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 12);
  return n || 'Wren';
}
async function playerKey(env, id) {
  if (!env.PLAYER_SECRET) throw new Error('PLAYER_SECRET not set');
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.PLAYER_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(id)));
  return btoa(String.fromCharCode(...sig)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
async function readJson(req) {
  if (Number(req.headers.get('Content-Length') || 0) > 8192) throw httpErr(413, 'too big');
  try { return (await req.json()) || {}; } catch { return {}; }
}
const int = (v) => (Number.isFinite(Number(v)) ? Math.trunc(Number(v)) : -1);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const json = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', ...headers } });
const httpErr = (status, message) => Object.assign(new Error(message), { status });
