// Mini Key-Value Store
// Persists to a JSON file — real I/O, real database concepts

const fs   = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '../data/kvstore.json');

// ── Load / Save ────────────────────────────────
function load() {
  try {
    if (!fs.existsSync(DB_PATH)) return { records: {}, log: [] };
    return JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
  } catch { return { records: {}, log: [] }; }
}

function save(db) {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

// ── Operations ─────────────────────────────────
function put(key, value) {
  if (!key || key.length > 64)  return { ok: false, error: 'Key must be 1-64 characters' };
  if (value === undefined || value === null) return { ok: false, error: 'Value is required' };

  const db  = load();
  const existed = key in db.records;
  const old = db.records[key];
  db.records[key] = { value, updatedAt: new Date().toISOString(), createdAt: existed ? old.createdAt : new Date().toISOString() };
  db.log.unshift({ op: existed ? 'UPDATE' : 'PUT', key, value: String(value).slice(0, 80), ts: new Date().toISOString() });
  if (db.log.length > 50) db.log = db.log.slice(0, 50);
  save(db);
  return { ok: true, existed, key, value };
}

function get(key) {
  if (!key) return { ok: false, error: 'Key is required' };
  const db = load();
  db.log.unshift({ op: 'GET', key, ts: new Date().toISOString() });
  if (db.log.length > 50) db.log = db.log.slice(0, 50);
  save(db);
  if (!(key in db.records)) return { ok: false, error: `Key "${key}" not found`, key };
  return { ok: true, key, ...db.records[key] };
}

function del(key) {
  if (!key) return { ok: false, error: 'Key is required' };
  const db = load();
  if (!(key in db.records)) return { ok: false, error: `Key "${key}" not found`, key };
  const val = db.records[key].value;
  delete db.records[key];
  db.log.unshift({ op: 'DELETE', key, ts: new Date().toISOString() });
  if (db.log.length > 50) db.log = db.log.slice(0, 50);
  save(db);
  return { ok: true, key, value: val };
}

function scan(prefix = '') {
  const db = load();
  const matches = Object.entries(db.records)
    .filter(([k]) => k.startsWith(prefix))
    .map(([key, meta]) => ({ key, ...meta }))
    .sort((a, b) => a.key.localeCompare(b.key));
  db.log.unshift({ op: 'SCAN', key: prefix ? `prefix:"${prefix}"` : '*', ts: new Date().toISOString() });
  if (db.log.length > 50) db.log = db.log.slice(0, 50);
  save(db);
  return { ok: true, count: matches.length, records: matches };
}

function flush() {
  save({ records: {}, log: [] });
  return { ok: true };
}

function stats() {
  const db  = load();
  const records = Object.entries(db.records);
  const sizes   = records.map(([k, v]) => k.length + String(v.value).length);
  return {
    ok:         true,
    count:      records.length,
    totalBytes: sizes.reduce((a, b) => a + b, 0),
    avgBytes:   sizes.length ? Math.round(sizes.reduce((a, b) => a + b, 0) / sizes.length) : 0,
    log:        db.log,
    dbPath:     DB_PATH
  };
}

function getAll() {
  const db = load();
  return {
    records: Object.entries(db.records).map(([key, meta]) => ({ key, ...meta })),
    log:     db.log
  };
}

module.exports = { put, get, del, scan, flush, stats, getAll };
