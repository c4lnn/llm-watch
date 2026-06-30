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
 * - upstream_balance_snapshots: 中转账号余额/额度状态快照
 *   - status: success / failed / unsupported
 *
 * - notification_config: 旧版通知渠道配置（兼容保留，不再作为配置源）
 * - notification_state: YAML 通知渠道的运行时启用状态覆盖
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
  createUpstreamBalanceSnapshotsTable();
  createNotificationConfigTable();
  createNotificationStateTable();
  createBalanceAlertSettingsTable();
  createBalanceAlertOverridesTable();
  createBalanceAlertStateTable();

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

function createUpstreamBalanceSnapshotsTable() {
  db.run(`
    CREATE TABLE IF NOT EXISTS upstream_balance_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      upstream_id TEXT NOT NULL,
      status TEXT NOT NULL,
      balance REAL,
      display_value REAL,
      display_unit TEXT,
      label TEXT,
      kind TEXT,
      raw_data TEXT,
      error TEXT,
      created_at TEXT DEFAULT (datetime('now')),
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

function createNotificationStateTable() {
  db.run(`
    CREATE TABLE IF NOT EXISTS notification_state (
      notification_id TEXT PRIMARY KEY,
      enabled INTEGER NOT NULL,
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);
}

function createBalanceAlertSettingsTable() {
  db.run(`
    CREATE TABLE IF NOT EXISTS balance_alert_settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      enabled INTEGER NOT NULL DEFAULT 1,
      default_threshold REAL,
      cooldown_minutes INTEGER NOT NULL DEFAULT 360,
      notify_recovery INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);
  db.run(`
    INSERT OR IGNORE INTO balance_alert_settings
      (id, enabled, default_threshold, cooldown_minutes, notify_recovery)
    VALUES (1, 1, NULL, 360, 1)
  `);
}

function createBalanceAlertOverridesTable() {
  db.run(`
    CREATE TABLE IF NOT EXISTS balance_alert_overrides (
      upstream_id TEXT PRIMARY KEY,
      enabled INTEGER,
      threshold REAL,
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);
}

function createBalanceAlertStateTable() {
  db.run(`
    CREATE TABLE IF NOT EXISTS balance_alert_state (
      upstream_id TEXT PRIMARY KEY,
      state TEXT NOT NULL DEFAULT 'normal',
      last_value REAL,
      threshold REAL,
      last_alert_at TEXT,
      last_recovery_at TEXT,
      updated_at TEXT DEFAULT (datetime('now'))
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
    db.run('DROP TABLE IF EXISTS upstream_balance_snapshots');
    db.run('DROP TABLE IF EXISTS group_changes');
    db.run('DROP TABLE IF EXISTS group_snapshots');
    db.run('DROP TABLE IF EXISTS upstreams');
    createUpstreamsTable();
    createGroupSnapshotsTable();
    createGroupChangesTable();
    createUpstreamBalanceSnapshotsTable();
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

  if (hasIncompatibleColumns('upstream_balance_snapshots', { upstream_id: 'TEXT' })) {
    console.log('[DB] Migrating upstream_balance_snapshots identifier columns to TEXT');
    db.run('DROP TABLE IF EXISTS upstream_balance_snapshots');
    createUpstreamBalanceSnapshotsTable();
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

function serializeRawData(rawData) {
  if (rawData == null) return null;
  return typeof rawData === 'string' ? rawData : JSON.stringify(rawData);
}

function insertUpstreamBalanceSnapshot(snapshot) {
  run(
    `INSERT INTO upstream_balance_snapshots
       (upstream_id, status, balance, display_value, display_unit, label, kind, raw_data, error, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      snapshot.upstreamId,
      snapshot.status,
      snapshot.balance ?? null,
      snapshot.displayValue ?? null,
      snapshot.displayUnit ?? null,
      snapshot.label ?? null,
      snapshot.kind ?? null,
      serializeRawData(snapshot.rawData),
      snapshot.error ?? null,
      snapshot.createdAt ?? new Date().toISOString(),
    ]
  );
}

function selectLatestUpstreamBalanceStatuses(upstreamIds = null) {
  const rows = selectAll(`
    SELECT upstream_id, status, balance, display_value, display_unit, label, kind, error, created_at
    FROM upstream_balance_snapshots
    WHERE id IN (
      SELECT MAX(id) FROM upstream_balance_snapshots GROUP BY upstream_id
    )
  `);

  if (!Array.isArray(upstreamIds)) return rows;
  if (upstreamIds.length === 0) return [];
  const allowed = new Set(upstreamIds.map(String));
  return rows.filter(row => allowed.has(String(row.upstream_id)));
}

function toBoolean(value, fallback = false) {
  if (value === undefined || value === null) return fallback;
  return value === true || value === 1;
}

function nullableNumber(value) {
  if (value === undefined || value === null || value === '') return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function getBalanceAlertGlobalSettings() {
  const row = selectAll('SELECT * FROM balance_alert_settings WHERE id = 1')[0];
  return {
    enabled: toBoolean(row?.enabled, true),
    default_threshold: nullableNumber(row?.default_threshold),
    cooldown_minutes: Number(row?.cooldown_minutes ?? 360),
    notify_recovery: toBoolean(row?.notify_recovery, true),
    updated_at: row?.updated_at || null,
  };
}

function updateBalanceAlertGlobalSettings(settings) {
  const current = getBalanceAlertGlobalSettings();
  const next = {
    enabled: settings.enabled ?? current.enabled,
    default_threshold: Object.prototype.hasOwnProperty.call(settings, 'default_threshold')
      ? nullableNumber(settings.default_threshold)
      : current.default_threshold,
    cooldown_minutes: settings.cooldown_minutes ?? current.cooldown_minutes,
    notify_recovery: settings.notify_recovery ?? current.notify_recovery,
  };

  run(
    `UPDATE balance_alert_settings
        SET enabled = ?, default_threshold = ?, cooldown_minutes = ?, notify_recovery = ?, updated_at = datetime('now')
      WHERE id = 1`,
    [
      next.enabled ? 1 : 0,
      next.default_threshold,
      Number(next.cooldown_minutes),
      next.notify_recovery ? 1 : 0,
    ]
  );
  return getBalanceAlertGlobalSettings();
}

function getBalanceAlertOverrides() {
  return selectAll('SELECT upstream_id, enabled, threshold, updated_at FROM balance_alert_overrides')
    .map(row => ({
      upstream_id: String(row.upstream_id),
      enabled: row.enabled == null ? null : row.enabled === 1,
      threshold: nullableNumber(row.threshold),
      updated_at: row.updated_at || null,
    }));
}

function getBalanceAlertOverride(upstreamId) {
  return getBalanceAlertOverrides().find(row => row.upstream_id === String(upstreamId)) || null;
}

function upsertBalanceAlertOverride(upstreamId, patch) {
  const existing = getBalanceAlertOverride(upstreamId);
  const hasEnabled = Object.prototype.hasOwnProperty.call(patch, 'enabled');
  const hasThreshold = Object.prototype.hasOwnProperty.call(patch, 'threshold');
  const enabled = hasEnabled ? patch.enabled : existing?.enabled ?? null;
  const threshold = hasThreshold ? nullableNumber(patch.threshold) : existing?.threshold ?? null;

  if (existing) {
    run(
      `UPDATE balance_alert_overrides
          SET enabled = ?, threshold = ?, updated_at = datetime('now')
        WHERE upstream_id = ?`,
      [enabled == null ? null : enabled ? 1 : 0, threshold, String(upstreamId)]
    );
  } else {
    run(
      `INSERT INTO balance_alert_overrides (upstream_id, enabled, threshold)
       VALUES (?, ?, ?)`,
      [String(upstreamId), enabled == null ? null : enabled ? 1 : 0, threshold]
    );
  }

  return getBalanceAlertOverride(upstreamId);
}

function deleteBalanceAlertOverride(upstreamId) {
  run('DELETE FROM balance_alert_overrides WHERE upstream_id = ?', [String(upstreamId)]);
}

function getEffectiveBalanceAlertSettings(upstreamId) {
  const global = getBalanceAlertGlobalSettings();
  const override = getBalanceAlertOverride(upstreamId);
  const enabled = override?.enabled == null ? global.enabled : override.enabled;
  const threshold = override?.threshold == null ? global.default_threshold : override.threshold;
  return {
    upstream_id: String(upstreamId),
    enabled,
    threshold,
    threshold_source: override?.threshold == null ? 'default' : 'override',
    global,
    override,
    cooldown_minutes: global.cooldown_minutes,
    notify_recovery: global.notify_recovery,
  };
}

function getBalanceAlertState(upstreamId) {
  const row = selectAll('SELECT * FROM balance_alert_state WHERE upstream_id = ?', [String(upstreamId)])[0];
  if (!row) return null;
  return {
    upstream_id: String(row.upstream_id),
    state: row.state || 'normal',
    last_value: nullableNumber(row.last_value),
    threshold: nullableNumber(row.threshold),
    last_alert_at: row.last_alert_at || null,
    last_recovery_at: row.last_recovery_at || null,
    updated_at: row.updated_at || null,
  };
}

function upsertBalanceAlertState(upstreamId, state) {
  const current = getBalanceAlertState(upstreamId);
  const next = {
    state: state.state ?? current?.state ?? 'normal',
    last_value: Object.prototype.hasOwnProperty.call(state, 'last_value')
      ? nullableNumber(state.last_value)
      : current?.last_value ?? null,
    threshold: Object.prototype.hasOwnProperty.call(state, 'threshold')
      ? nullableNumber(state.threshold)
      : current?.threshold ?? null,
    last_alert_at: Object.prototype.hasOwnProperty.call(state, 'last_alert_at')
      ? state.last_alert_at
      : current?.last_alert_at ?? null,
    last_recovery_at: Object.prototype.hasOwnProperty.call(state, 'last_recovery_at')
      ? state.last_recovery_at
      : current?.last_recovery_at ?? null,
  };

  if (current) {
    run(
      `UPDATE balance_alert_state
          SET state = ?, last_value = ?, threshold = ?, last_alert_at = ?, last_recovery_at = ?, updated_at = datetime('now')
        WHERE upstream_id = ?`,
      [
        next.state,
        next.last_value,
        next.threshold,
        next.last_alert_at,
        next.last_recovery_at,
        String(upstreamId),
      ]
    );
  } else {
    run(
      `INSERT INTO balance_alert_state
         (upstream_id, state, last_value, threshold, last_alert_at, last_recovery_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        String(upstreamId),
        next.state,
        next.last_value,
        next.threshold,
        next.last_alert_at,
        next.last_recovery_at,
      ]
    );
  }

  return getBalanceAlertState(upstreamId);
}

function save() {
  if (!db) return;
  fs.writeFileSync(getDbPath(), Buffer.from(db.export()));
}

function resetForTests() {
  db = null;
  _migrated = false;
}

module.exports = {
  getDb,
  save,
  selectAll,
  run,
  insertUpstreamBalanceSnapshot,
  selectLatestUpstreamBalanceStatuses,
  getBalanceAlertGlobalSettings,
  updateBalanceAlertGlobalSettings,
  getBalanceAlertOverrides,
  getBalanceAlertOverride,
  upsertBalanceAlertOverride,
  deleteBalanceAlertOverride,
  getEffectiveBalanceAlertSettings,
  getBalanceAlertState,
  upsertBalanceAlertState,
  resetForTests,
  getDbPath,
};
