'use strict';
// LifeOS 90 - zero-dependency Node.js server (Node >= 18).
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const store = require('./lib/store');
const core = require('./lib/core');
const content = require('./lib/content');
const checklist = require('./lib/checklist');
const sc = require('./lib/scorecard');

// optional .env loader
try {
  const envp = path.join(__dirname, '.env');
  if (fs.existsSync(envp)) fs.readFileSync(envp, 'utf8').split(/\r?\n/).forEach(l => {
    const m = l.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/); if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  });
} catch (e) { /* ignore */ }

const PORT = +process.env.PORT || 8080;
const HOST = process.env.HOST || '0.0.0.0';
const USER = process.env.APP_USER || 'admin';
const PASS = process.env.APP_PASSWORD || '';
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '';
const PUB = path.join(__dirname, 'public');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json', '.png': 'image/png', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json' };

const send = (res, code, body, headers = {}) => {
  const isObj = typeof body === 'object' && !Buffer.isBuffer(body);
  res.writeHead(code, Object.assign({ 'Content-Type': isObj ? 'application/json; charset=utf-8' : 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY' }, headers));
  res.end(isObj ? JSON.stringify(body) : body);
};
const readBody = req => new Promise((resolve, reject) => {
  let d = ''; req.on('data', c => { d += c; if (d.length > 5e6) { reject(new Error('Body too large')); req.destroy(); } });
  req.on('end', () => { try { resolve(d ? JSON.parse(d) : {}); } catch (e) { reject(new Error('Invalid JSON')); } });
});
const safeEq = (a, b) => { const x = crypto.createHash('sha256').update(a).digest(), y = crypto.createHash('sha256').update(b).digest(); return crypto.timingSafeEqual(x, y); };
function authed(req) {
  if (!PASS) return true;
  const h = req.headers.authorization || '';
  if (!h.startsWith('Basic ')) return false;
  const [u, ...rest] = Buffer.from(h.slice(6), 'base64').toString().split(':');
  return safeEq(u, USER) && safeEq(rest.join(':'), PASS);
}

// ---------- validation ----------
const NUM = { age: [10, 90], heightCm: [120, 230], weightKg: [30, 200], targetWeightKg: [30, 200], commuteMin: [0, 240], trainDays: [4, 5] };
const ENUM = { gender: ['male', 'female', 'other'], experience: ['beginner', 'intermediate', 'advanced'], dietPref: ['veg', 'egg', 'nonveg'],
  equipment: ['gym', 'home_dumbbells', 'home_none'], activity: ['sedentary', 'light', 'moderate', 'active'], workoutTime: ['morning', 'evening'] };
const SKILL = ['none', 'basic', 'intermediate', 'advanced'];
function cleanProfile(b) {
  const p = {}, errors = [];
  for (const [k, [lo, hi]] of Object.entries(NUM)) {
    if (b[k] === undefined || b[k] === '' || b[k] === null) continue;
    const v = +b[k]; if (isNaN(v) || v < lo || v > hi) errors.push(`${k} must be between ${lo} and ${hi}`); else p[k] = v;
  }
  for (const [k, vals] of Object.entries(ENUM)) { if (b[k] === undefined || b[k] === '') continue; if (!vals.includes(b[k])) errors.push(`${k} invalid`); else p[k] = b[k]; }
  for (const k of ['workStart', 'workEnd', 'wake', 'sleep']) { if (!b[k]) continue; if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(b[k])) errors.push(`${k} must be HH:MM`); else p[k] = b[k]; }
  if (b.startDate) { if (!core.validDate(b.startDate)) errors.push('startDate invalid'); else p.startDate = b.startDate; }
  for (const k of ['name', 'conditions', 'targetRole', 'jobTimeline']) if (typeof b[k] === 'string') p[k] = b[k].trim().slice(0, 300);
  p.skills = {}; for (const k of ['sql', 'python', 'excel', 'powerbi', 'stats']) p.skills[k] = SKILL.includes((b.skills || {})[k]) ? b.skills[k] : 'none';
  return { p, errors };
}
const needProfile = (res) => { const pr = store.get().profile; if (!pr || core.missingFields(pr).length) { send(res, 409, { error: 'profile_incomplete', missing: core.missingFields(pr) }); return null; } return pr; };

// ---------- API ----------
async function api(req, res, url) {
  await store.ready();
  const db = store.get(); const m = req.method; const seg = url.pathname.split('/').filter(Boolean).slice(1);
  const [a, b] = seg;
  if (a === 'profile') {
    if (m === 'GET') return send(res, 200, { profile: db.profile, missing: core.missingFields(db.profile), required: core.REQUIRED });
    if (m === 'PUT') {
      const { p, errors } = cleanProfile(await readBody(req));
      const miss = core.missingFields(p);
      if (errors.length) return send(res, 400, { error: errors.join('; ') });
      if (miss.length) return send(res, 400, { error: 'Missing: ' + miss.join(', '), missing: miss });
      db.profile = p; await store.save();
      return send(res, 200, { profile: p, missing: [] });
    }
  }
  if (a === 'plan' && m === 'GET') { const pr = needProfile(res); if (!pr) return; return send(res, 200, content.build(pr)); }
  if (a === 'day' && b) {
    if (!core.validDate(b)) return send(res, 400, { error: 'bad date' });
    const pr = needProfile(res); if (!pr) return;
    if (m === 'PUT') {
      const body = await readBody(req);
      const d = db.days[b] || (db.days[b] = { mode: 'normal', checks: {}, log: {} });
      if (body.mode === 'normal' || body.mode === 'minimum') d.mode = body.mode;
      if (body.checks && typeof body.checks === 'object') for (const [k, v] of Object.entries(body.checks)) { if (/^[a-z_0-9]{2,20}$/.test(k)) { if (v) d.checks[k] = true; else delete d.checks[k]; } }
      if (body.log && typeof body.log === 'object') for (const k of ['weight', 'sleep', 'steps', 'water', 'calories', 'protein', 'studyH', 'mood', 'stress', 'applications']) {
        if (k in body.log) { const v = body.log[k]; if (v === '' || v === null) delete d.log[k]; else if (!isNaN(+v) && +v >= 0 && +v < 1e6) d.log[k] = +v; }
      }
      if (typeof body.note === 'string') d.note = body.note.slice(0, 1000);
      await store.save();
    }
    const cl = checklist.build(pr, b); const st = db.days[b] || { mode: 'normal', checks: {}, log: {} };
    return send(res, 200, { date: b, info: cl.info, sections: cl.sections, minItems: cl.minItems, state: st, score: sc.dayScore(pr, db, b), streak: sc.streak(pr, db, b), calc: core.calc(pr) });
  }
  if (a === 'week' && b) {
    if (!core.validDate(b)) return send(res, 400, { error: 'bad date' });
    const pr = needProfile(res); if (!pr) return; const mon = core.mondayOf(b);
    const today = (url.searchParams.get('today') || '').slice(0, 10);
    const card = sc.weekCard(pr, db, mon, core.validDate(today) ? today : null);
    return send(res, 200, { card, suggestions: sc.suggestions(pr, db, mon, card), review: db.reviews[mon] || {} });
  }
  if (a === 'review' && b && m === 'PUT') {
    if (!core.validDate(b)) return send(res, 400, { error: 'bad date' });
    const body = await readBody(req); const mon = core.mondayOf(b); const r = db.reviews[mon] || {};
    for (const k of ['wins', 'struggles', 'changes', 'priorities', 'energy', 'strengthLifts', 'proud']) if (k in body) r[k] = typeof body[k] === 'string' ? body[k].slice(0, 2000) : body[k];
    r.updated = new Date().toISOString(); db.reviews[mon] = r; await store.save(); return send(res, 200, { review: r });
  }
  if (a === 'progress') {
    if (m === 'GET') return send(res, 200, { progress: db.progress.sort((x, y) => x.date.localeCompare(y.date)) });
    if (m === 'POST') {
      const body = await readBody(req); if (!core.validDate(body.date)) return send(res, 400, { error: 'date required' });
      const e = { id: crypto.randomUUID(), date: body.date };
      for (const k of ['weight', 'waist', 'chest', 'arm', 'thigh', 'hips', 'squat', 'bench', 'deadlift', 'row', 'ohp']) if (body[k] !== '' && body[k] != null && !isNaN(+body[k])) e[k] = +body[k];
      if (typeof body.note === 'string') e.note = body.note.slice(0, 300);
      db.progress.push(e); await store.save(); return send(res, 200, { entry: e });
    }
    if (m === 'DELETE' && b) { db.progress = db.progress.filter(x => x.id !== b); await store.save(); return send(res, 200, { ok: true }); }
  }
  if (a === 'jobs') {
    const f = ['company', 'role', 'link', 'status', 'appliedOn', 'nextStep', 'followUp', 'notes'];
    const pick = body => { const o = {}; for (const k of f) if (typeof body[k] === 'string') o[k] = body[k].slice(0, 500); return o; };
    if (m === 'GET') return send(res, 200, { jobs: db.jobs });
    if (m === 'POST') { const o = Object.assign({ id: crypto.randomUUID(), status: 'Applied', created: new Date().toISOString() }, pick(await readBody(req))); db.jobs.push(o); await store.save(); return send(res, 200, { job: o }); }
    if (m === 'PUT' && b) { const j = db.jobs.find(x => x.id === b); if (!j) return send(res, 404, { error: 'not found' }); Object.assign(j, pick(await readBody(req))); await store.save(); return send(res, 200, { job: j }); }
    if (m === 'DELETE' && b) { db.jobs = db.jobs.filter(x => x.id !== b); await store.save(); return send(res, 200, { ok: true }); }
  }
  if (a === 'export' && m === 'GET') return send(res, 200, db, { 'Content-Disposition': 'attachment; filename="lifeos-backup.json"' });
  if (a === 'import' && m === 'POST') { const body = await readBody(req); if (!body || typeof body !== 'object' || !body.days) return send(res, 400, { error: 'Not a LifeOS backup' }); await store.replace(body); return send(res, 200, { ok: true }); }
  return send(res, 404, { error: 'not found' });
}

function applyCors(req, res) {
  const origin = (req.headers.origin || '').trim();
  if (!origin) return false;
  const rawList = process.env.ALLOWED_ORIGIN || '';
  if (!rawList) return false;
  const origins = rawList.split(',').map(s => s.trim().replace(/\/$/, '')).filter(Boolean);
  const normOrigin = origin.replace(/\/$/, '');
  const isAllowed = origins.includes('*') || origins.includes(normOrigin);

  if (isAllowed) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, Accept');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Max-Age', '86400');
  }
  if (req.method === 'OPTIONS') {
    res.writeHead(isAllowed ? 204 : 403);
    res.end();
    return true;
  }
  return false;
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://x');
    if (applyCors(req, res)) return;
    if (url.pathname === '/healthz') return send(res, 200, { status: 'ok', database: store.status() });
    if (!authed(req)) return send(res, 401, 'Authentication required', { 'WWW-Authenticate': 'Basic realm="LifeOS 90", charset="UTF-8"' });
    if (url.pathname.startsWith('/api/')) return await api(req, res, url);
    let f = path.normalize(path.join(PUB, url.pathname === '/' ? 'index.html' : url.pathname));
    if (!f.startsWith(PUB) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(PUB, 'index.html');
    const ext = path.extname(f);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=3600', 'X-Content-Type-Options': 'nosniff' });
    fs.createReadStream(f).pipe(res);
  } catch (e) { console.error(e); if (!res.headersSent) send(res, 500, { error: e.message }); else res.end(); }
});

if (require.main === module) {
  server.listen(PORT, HOST, () => {
    console.log(`LifeOS 90 running on http://${HOST}:${PORT}  (auth: ${PASS ? 'ON' : 'OFF - set APP_PASSWORD!'})  data: ${store.DATA_DIR}`);
  });
}
module.exports = server;
