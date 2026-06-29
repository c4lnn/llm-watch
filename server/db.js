/**
 * SQLite 数据库模块 (sql.js, 纯 JS)
 *
 * 数据模型：
 * - upstreams: 中转配置（name, base_url, type, email, password, auth_token, poll_interval, enabled）
 *   - type: 模板类型 (sub2api / new-api)
 *   - auth_token: 缓存的登录凭证（sub2api 是 JWT；new-api 是 JSON.stringify({cookie, userId})）
 *   - updated_at: 配置最后修改时间（编辑接口写）
 *   - last_poll_at / last_poll_status / last_poll_error: 最后轮询时间与结果（轮询写）
 *   - 两者分离——编辑配置不会推迟轮询，轮询失败也按 last_poll_at 计时
 *
 * - group_snapshots: 分组快照，每次轮询存一条
 *   - group_id: 归一化 key（sub2api 数字 id 字符串；new-api 分组名）
 *   - 按 (upstream_id, group_id) 分组取最新，保留最近 SNAPSHOTS_PER_GROUP(10) 条
 *
 * - group_changes: 变动记录
 *   - change_type: available(上线) / unavailable(下线) / changed(字段变更)
 *   - 变动检测拿本次轮询结果和上一次轮询结果比（created_at 最大的那批）
 *
 * - notification_config: 通知渠道配置
 *
 * 导出：selectAll(sql, params) / run(sql, params) 参数化封装，save() 持久化到文件
 */

const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const DEFAULT_DB_PATH = path.join(__dirname, '..', 'data', 'monitor.db');

let db = null;

function getDbPath() {
  return process.env.MONITOR_DB_PATH || DEFAULT_DB_PATH;
}

async function getDb() {
  if (db) return db;

  const SQL = await initSqlJs();
  const dbPath = getDbPath();

  // Ensure data directory exists
  const dataDir = path.dirname(dbPath);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  // Load existing DB or create new
  if (fs.existsSync(dbPath)) {
    db = new SQL.Database(fs.readFileSync(dbPath));
  } else {
    db = new SQL.Database();
  }

  createSchema();
  save();
  return db;
}

function createSchema() {
  createUpstreamsTable();
  createGroupSnapshotsTable();
  createGroupChangesTable();
  createNotificationConfigTable();

  // ---- Migrations for databases created by earlier versions ----
  // Each is wrapped in try/catch because sql.js has no "ADD COLUMN IF NOT EXISTS".
  migrate(`ALTER TABLE upstreams ADD COLUMN email TEXT`);
  migrate(`ALTER TABLE upstreams ADD COLUMN password TEXT`);
  migrate(`ALTER TABLE upstreams ADD COLUMN last_poll_at TEXT`);
  migrate(`ALTER TABLE upstreams ADD COLUMN last_poll_status TEXT`);
  migrate(`ALTER TABLE upstreams ADD COLUMN last_poll_error TEXT`);
  // Old schemas used INTEGER for IDs that now hold MD5 hashes and group names.
  migrateIdentifierColumns();
}

function createUpstreamsTable() {
  db.run(`
    CREATE TABLE IF NOT EXISTS upstreams (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      base_url TEXT NOT NULL UNIQUE,
      type TEXT NOT NULL DEFAULT 'sub2api',
      email TEXT,
      password TEXT,
      auth_token TEXT,
      poll_interval INTEGER DEFAULT 60,
      enabled INTEGER DEFAULT 1,
      last_poll_at TEXT,
      last_poll_status TEXT,
      last_poll_error TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);
}

function createGroupSnapshotsTable() {
  db.run(`
    CREATE TABLE IF NOT EXISTS group_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      upstream_id TEXT NOT NULL,
      group_id TEXT NOT NULL DEFAULT '',
      group_name TEXT NOT NULL,
      rate REAL NOT NULL,
      raw_data TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (upstream_id) REFERENCES upstreams(id) ON DELETE CASCADE
    )
  `);
}

function createGroupChangesTable() {
  db.run(`
    CREATE TABLE IF NOT EXISTS group_changes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      upstream_id TEXT NOT NULL,
      group_id TEXT NOT NULL,
      group_name TEXT NOT NULL,
      change_type TEXT NOT NULL,
      field_name TEXT,
      old_value TEXT,
      new_value TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      notified INTEGER DEFAULT 0,
      FOREIGN KEY (upstream_id) REFERENCES upstreams(id) ON DELETE CASCADE
    )
  `);
}

function createNotificationConfigTable() {
  db.run(`
    CREATE TABLE IF NOT EXISTS notification_config (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      config TEXT NOT NULL,
      enabled INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);
}

// Detect old identifier column types and recreate tables with TEXT types.
// This is safe because: 1) group_snapshots/group_changes are ephemeral
// monitoring data, and 2) upstreams data is re-populated from config.yaml
// on each startup. Auth tokens will be re-obtained on next poll via relogin.
let _migrated = false;
function migrateIdentifierColumns() {
  if (_migrated) return;
  _migrated = true;

  if (hasIncompatibleColumns('upstreams', { id: 'TEXT' })) {
    console.log('[DB] Migrating upstreams.id to TEXT');
    db.run('DROP TABLE IF EXISTS group_changes');
    db.run('DROP TABLE IF EXISTS group_snapshots');
    db.run('DROP TABLE IF EXISTS upstreams');
    createUpstreamsTable();
    createGroupSnapshotsTable();
    createGroupChangesTable();
    console.log('[DB] Migration complete: upstreams recreated, will re-login on next poll');
    return;
  }

  if (hasIncompatibleColumns('group_snapshots', { upstream_id: 'TEXT', group_id: 'TEXT' })) {
    console.log('[DB] Migrating group_snapshots identifier columns to TEXT');
    db.run('DROP TABLE IF EXISTS group_snapshots');
    createGroupSnapshotsTable();
  }

  if (hasIncompatibleColumns('group_changes', { upstream_id: 'TEXT', group_id: 'TEXT' })) {
    console.log('[DB] Migrating group_changes identifier columns to TEXT');
    db.run('DROP TABLE IF EXISTS group_changes');
    createGroupChangesTable();
  }
}

function hasIncompatibleColumns(table, expectedTypes) {
  try {
    const cols = selectAll(`PRAGMA table_info(${table})`);
    if (!cols.length) return false;
    return Object.entries(expectedTypes).some(([name, expectedType]) => {
      const col = cols.find(c => c.name === name);
      return !col || normalizeType(col.type) !== expectedType;
    });
  } catch {
    return false;
  }
}

function normalizeType(type) {
  return String(type || '').trim().toUpperCase();
}

function migrate(sql) {
  try { db.run(sql); } catch { /* column already exists */ }
}

// Run a parameterized SELECT and return rows as plain objects.
// Centralizes the cursor→object mapping that was duplicated everywhere.
function selectAll(sql, params = []) {
  const stmt = db.prepare(sql);
  try {
    if (params.length) stmt.bind(params);
    const rows = [];
    while (stmt.step()) rows.push(stmt.getAsObject());
    return rows;
  } finally {
    stmt.free();
  }
}

// Run a parameterized write (INSERT/UPDATE/DELETE).
function run(sql, params = []) {
  db.run(sql, params);
}

function save() {
  if (!db) return;
  fs.writeFileSync(getDbPath(), Buffer.from(db.export()));
}

function resetForTests() {
  db = null;
  _migrated = false;
}

module.exports = { getDb, save, selectAll, run, resetForTests, getDbPath };
