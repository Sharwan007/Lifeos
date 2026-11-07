'use strict';
// Data storage: supports Neon Postgres (HTTP/REST or pg), Supabase REST, or local JSON file.
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(__dirname, '..', 'data'));
const FILE = path.join(DATA_DIR, 'db.json');
const EMPTY = () => ({ profile: null, days: {}, reviews: {}, progress: [], jobs: [] });

let db = EMPTY();
let timer = null;
let syncFailure = null;

// --- Supabase Config ---
const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const TABLE = process.env.SUPABASE_TABLE || 'lifeos_state';

// --- Neon / Postgres Config ---
const NEON_CONN = (process.env.NEON_DATABASE_URL || process.env.DATABASE_URL || '').trim();
let isNeon = false;
let neonHost = '';
let neonConnStr = '';

if (NEON_CONN && (NEON_CONN.startsWith('postgres://') || NEON_CONN.startsWith('postgresql://'))) {
  try {
    const u = new URL(NEON_CONN);
    neonHost = u.hostname;
    isNeon = Boolean(process.env.NEON_DATABASE_URL || neonHost.includes('neon.tech'));
    neonConnStr = NEON_CONN;
  } catch (e) {
    console.error('Failed to parse database connection URL:', e.message);
  }
}

// Optional pg pool for non-Neon Postgres
let pgPool = null;
if (!isNeon && (NEON_CONN.startsWith('postgres://') || NEON_CONN.startsWith('postgresql://'))) {
  try {
    const { Pool } = require('pg');
    pgPool = new Pool({
      connectionString: NEON_CONN,
      ssl: NEON_CONN.includes('sslmode=disable') ? false : { rejectUnauthorized: false }
    });
  } catch (_) {
    // pg driver not installed; will attempt Neon HTTP if host matches or warn
  }
}

// Provider selection
const DB_PROVIDER = (process.env.DATABASE_PROVIDER || '').toLowerCase();
const USE_NEON = DB_PROVIDER === 'neon' || (!DB_PROVIDER && (isNeon || (Boolean(neonConnStr) && !SUPABASE_URL)));
const USE_SUPABASE = DB_PROVIDER === 'supabase' || (!DB_PROVIDER && !USE_NEON && Boolean(SUPABASE_URL && SUPABASE_KEY));
const USE_PG = Boolean(pgPool && !USE_NEON && !USE_SUPABASE);
const USE_JSON = !USE_NEON && !USE_SUPABASE && !USE_PG;

if (USE_JSON) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (fs.existsSync(FILE)) {
    try {
      db = Object.assign(EMPTY(), JSON.parse(fs.readFileSync(FILE, 'utf8')));
    } catch (e) {
      console.error('db.json unreadable, keeping backup and starting fresh:', e.message);
      fs.copyFileSync(FILE, FILE + '.corrupt-' + Date.now());
    }
  }
} else {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// ---------- Neon HTTP Driver (zero-dependency using Node 18+ fetch) ----------
async function neonQuery(query, params = []) {
  if (!neonHost || !neonConnStr) throw new Error('Neon database host or connection string missing');
  const endpoint = `https://${neonHost}/sql`;
  const r = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Neon-Connection-String': neonConnStr,
    },
    body: JSON.stringify({ query, params }),
  });
  if (!r.ok) {
    const txt = await r.text();
    throw new Error(`Neon SQL failed (${r.status}): ${txt}`);
  }
  return r.json();
}

// ---------- Supabase REST Driver ----------
async function supabase(method, pathPart, body) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${pathPart}`, {
    method,
    headers: {
      apikey: SUPABASE_KEY,
      authorization: 'Bearer ' + SUPABASE_KEY,
      'Content-Type': 'application/json',
      ...(method === 'POST' ? { Prefer: 'resolution=merge-duplicates,return=minimal' } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`Supabase ${method} failed: ${r.status} ${await r.text()}`);
  if (r.status === 204) return null;
  return r.json();
}

let readyPromise;
async function ready() {
  if (USE_JSON) return db;
  if (!readyPromise) {
    readyPromise = (async () => {
      if (USE_NEON) {
        try {
          // Auto-create state table in Neon if needed
          await neonQuery(`
            CREATE TABLE IF NOT EXISTS ${TABLE} (
              id TEXT PRIMARY KEY,
              data JSONB NOT NULL DEFAULT '{}'::jsonb,
              updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
            );
          `).catch(() => {});

          const res = await neonQuery(`SELECT data FROM ${TABLE} WHERE id = $1 LIMIT 1`, ['single']);
          if (res && res.rows && res.rows.length > 0 && res.rows[0].data) {
            let row = res.rows[0].data;
            if (typeof row === 'string') {
              try { row = JSON.parse(row); } catch (_) {}
            }
            if (typeof row === 'object' && row !== null) {
              db = Object.assign(EMPTY(), row);
            }
          }
        } catch (e) {
          syncFailure = e;
          console.error('Neon load failed; mutations will be retried:', e.message);
        }
      } else if (USE_PG && pgPool) {
        try {
          await pgPool.query(`
            CREATE TABLE IF NOT EXISTS ${TABLE} (
              id TEXT PRIMARY KEY,
              data JSONB NOT NULL DEFAULT '{}'::jsonb,
              updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
            );
          `).catch(() => {});
          const res = await pgPool.query(`SELECT data FROM ${TABLE} WHERE id = $1 LIMIT 1`, ['single']);
          if (res.rows.length && res.rows[0].data) {
            let row = res.rows[0].data;
            if (typeof row === 'string') {
              try { row = JSON.parse(row); } catch (_) {}
            }
            if (typeof row === 'object' && row !== null) {
              db = Object.assign(EMPTY(), row);
            }
          }
        } catch (e) {
          syncFailure = e;
          console.error('Postgres load failed:', e.message);
        }
      } else if (USE_SUPABASE) {
        try {
          const rows = await supabase('GET', `${TABLE}?select=data&id=eq.single&limit=1`);
          if (rows && rows[0] && rows[0].data) db = Object.assign(EMPTY(), rows[0].data);
        } catch (e) {
          syncFailure = e;
          console.error('Supabase load failed; mutations will be retried:', e.message);
        }
      }
    })();
  }
  await readyPromise;
  return db;
}

async function flushNeon() {
  syncFailure = null;
  try {
    await neonQuery(
      `INSERT INTO ${TABLE} (id, data, updated_at)
       VALUES ($1, $2::jsonb, now())
       ON CONFLICT (id) DO UPDATE
       SET data = EXCLUDED.data, updated_at = EXCLUDED.updated_at;`,
      ['single', JSON.stringify(db)]
    );
  } catch (e) {
    syncFailure = e;
    console.error('Neon save failed:', e.message);
  }
}

async function flushPg() {
  if (!pgPool) return;
  syncFailure = null;
  try {
    await pgPool.query(
      `INSERT INTO ${TABLE} (id, data, updated_at)
       VALUES ($1, $2::jsonb, now())
       ON CONFLICT (id) DO UPDATE
       SET data = EXCLUDED.data, updated_at = EXCLUDED.updated_at;`,
      ['single', JSON.stringify(db)]
    );
  } catch (e) {
    syncFailure = e;
    console.error('Postgres save failed:', e.message);
  }
}

async function flushSupabase() {
  syncFailure = null;
  try {
    await supabase('POST', TABLE, [{ id: 'single', data: db, updated_at: new Date().toISOString() }]);
  } catch (e) {
    syncFailure = e;
    console.error('Supabase save failed:', e.message);
  }
}

function save() {
  if (USE_NEON || USE_PG || USE_SUPABASE) return flush();
  clearTimeout(timer);
  timer = setTimeout(flush, 150);
}

function flush() {
  if (USE_NEON) return flushNeon();
  if (USE_PG) return flushPg();
  if (USE_SUPABASE) return flushSupabase();
  const tmp = FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db));
  fs.renameSync(tmp, FILE);
}

process.on('SIGTERM', () => { flush(); process.exit(0); });
process.on('SIGINT', () => { flush(); process.exit(0); });

module.exports = {
  get: () => db,
  replace(obj) { db = Object.assign(EMPTY(), obj); return flush(); },
  save, flush, DATA_DIR,
  ready,
  status: () => {
    if (USE_NEON) return { backend: 'neon', host: neonHost, table: TABLE, error: syncFailure ? syncFailure.message : null };
    if (USE_PG) return { backend: 'postgres', table: TABLE, error: syncFailure ? syncFailure.message : null };
    if (USE_SUPABASE) return { backend: 'supabase', url: SUPABASE_URL, table: TABLE, error: syncFailure ? syncFailure.message : null };
    return { backend: 'json', file: FILE };
  },
};
