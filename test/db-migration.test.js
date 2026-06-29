const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const initSqlJs = require('sql.js');
const db = require('../server/db');

async function createLegacyDb(dbPath) {
  const SQL = await initSqlJs();
  const legacy = new SQL.Database();
  legacy.run(`
    CREATE TABLE upstreams (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      base_url TEXT NOT NULL,
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
  legacy.run(`
    CREATE TABLE group_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      upstream_id INTEGER NOT NULL,
      group_id INTEGER NOT NULL DEFAULT 0,
      group_name TEXT NOT NULL,
      rate REAL NOT NULL,
      raw_data TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);
  legacy.run(`
    CREATE TABLE group_changes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      upstream_id INTEGER NOT NULL,
      group_id INTEGER NOT NULL,
      group_name TEXT NOT NULL,
      change_type TEXT NOT NULL,
      field_name TEXT,
      old_value TEXT,
      new_value TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      notified INTEGER DEFAULT 0
    )
  `);
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  fs.writeFileSync(dbPath, Buffer.from(legacy.export()));
  legacy.close();
}

function tempDbPath(name) {
  return path.join(os.tmpdir(), `llm-watch-${process.pid}-${Date.now()}-${name}.db`);
}

async function withTempDb(name, fn, seed) {
  const dbPath = tempDbPath(name);
  const previousPath = process.env.MONITOR_DB_PATH;
  process.env.MONITOR_DB_PATH = dbPath;
  db.resetForTests();

  try {
    if (seed) await seed(dbPath);
    await db.getDb();
    await fn(dbPath);
  } finally {
    db.resetForTests();
    if (previousPath == null) {
      delete process.env.MONITOR_DB_PATH;
    } else {
      process.env.MONITOR_DB_PATH = previousPath;
    }
    fs.rmSync(dbPath, { force: true });
  }
}

function columnType(table, column) {
  const cols = db.selectAll(`PRAGMA table_info(${table})`);
  return cols.find(c => c.name === column)?.type;
}

test('startup normalizes legacy numeric poll identifier columns', async () => {
  await withTempDb('legacy-migration', async () => {
    assert.equal(columnType('upstreams', 'id'), 'TEXT');
    assert.equal(columnType('group_snapshots', 'upstream_id'), 'TEXT');
    assert.equal(columnType('group_snapshots', 'group_id'), 'TEXT');
    assert.equal(columnType('group_changes', 'upstream_id'), 'TEXT');
    assert.equal(columnType('group_changes', 'group_id'), 'TEXT');
  }, createLegacyDb);
});

test('poll persistence accepts generated upstream IDs and named group keys after migration', async () => {
  await withTempDb('poll-persistence', async () => {
    const { _test } = require('../server/poller');
    const upstream = {
      id: 'abc123def456',
      name: 'Test Upstream',
      base_url: 'https://example.test',
      type: 'sub2api',
      email: 'user@example.test',
      password: 'secret',
      poll_interval: 60,
      enabled: true,
    };
    const now = new Date().toISOString();

    _test.ensureUpstreamInDb(upstream);
    db.run(
      `INSERT INTO group_snapshots (upstream_id, group_id, group_name, rate, raw_data, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [upstream.id, 'named-group', 'Named Group', 1, '{}', now]
    );
    _test.recordChanges(
      upstream.id,
      [{ group_id: 'named-group', group_name: 'Named Group', type: 'available', rate: 1 }],
      now,
      { fieldLabels: {} }
    );
    _test.markPolled(upstream.id, 'failed', 'boom');

    const upstreamRows = db.selectAll('SELECT id, last_poll_status, last_poll_error FROM upstreams WHERE id = ?', [upstream.id]);
    const snapshotRows = db.selectAll('SELECT upstream_id, group_id FROM group_snapshots WHERE upstream_id = ?', [upstream.id]);
    const changeRows = db.selectAll('SELECT upstream_id, group_id FROM group_changes WHERE upstream_id = ?', [upstream.id]);

    assert.equal(upstreamRows.length, 1);
    assert.equal(upstreamRows[0].last_poll_status, 'failed');
    assert.equal(upstreamRows[0].last_poll_error, 'boom');
    assert.deepEqual(snapshotRows[0], { upstream_id: upstream.id, group_id: 'named-group' });
    assert.deepEqual(changeRows[0], { upstream_id: upstream.id, group_id: 'named-group' });
  }, createLegacyDb);
});

test('available change notification line includes the group rate', async () => {
  await withTempDb('available-rate-notification', async () => {
    const { _test } = require('../server/poller');
    _test.ensureUpstreamInDb({
      id: 'abc123def456',
      name: 'Test Upstream',
      base_url: 'https://example.test',
      type: 'sub2api',
      email: 'user@example.test',
      password: 'secret',
      poll_interval: 60,
      enabled: true,
    });

    const body = _test.recordChanges(
      'abc123def456',
      [{ group_id: 'claude', group_name: 'Claude', type: 'available', rate: 2.5 }],
      new Date().toISOString(),
      { fieldLabels: {} }
    );

    assert.equal(body, '🟢 新增: Claude · 倍率: 2.5');
  });
});

test('first poll available changes preserve each group rate', async () => {
  const { _test } = require('../server/poller');
  const current = new Map([
    ['gpt', { key: 'gpt', name: 'GPT', rate: 1, raw: { rate_multiplier: 1 } }],
    ['claude', { key: 'claude', name: 'Claude', rate: 3, raw: { rate_multiplier: 3 } }],
  ]);

  const changes = _test.detectChanges(current, new Map(), { trackedFields: [] });

  assert.deepEqual(
    changes.map(c => ({ group_id: c.group_id, group_name: c.group_name, type: c.type, rate: c.rate })),
    [
      { group_id: 'gpt', group_name: 'GPT', type: 'available', rate: 1 },
      { group_id: 'claude', group_name: 'Claude', type: 'available', rate: 3 },
    ]
  );
});

test('unavailable and field-change notification lines keep their existing format', async () => {
  await withTempDb('unchanged-notification-formats', async () => {
    const { _test } = require('../server/poller');
    const upstreamId = 'abc123def456';
    _test.ensureUpstreamInDb({
      id: upstreamId,
      name: 'Test Upstream',
      base_url: 'https://example.test',
      type: 'sub2api',
      email: 'user@example.test',
      password: 'secret',
      poll_interval: 60,
      enabled: true,
    });

    const body = _test.recordChanges(
      upstreamId,
      [
        { group_id: 'old', group_name: 'Old Group', type: 'unavailable', rate: 9 },
        {
          group_id: 'changed',
          group_name: 'Changed Group',
          type: 'changed',
          field: 'rate_multiplier',
          old_value: '1',
          new_value: '2',
          rate: 2,
        },
      ],
      new Date().toISOString(),
      { fieldLabels: { rate_multiplier: '倍率' } }
    );

    assert.equal(body, '🔴 下线: Old Group\n✏️ Changed Group · 倍率: 1 → 2');
  });
});
