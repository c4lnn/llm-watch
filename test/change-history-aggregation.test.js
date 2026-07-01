const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const db = require('../server/db');

function tempDbPath(name) {
  return path.join(os.tmpdir(), `llm-watch-${process.pid}-${Date.now()}-${name}.db`);
}

async function withTempDb(name, fn) {
  const dbPath = tempDbPath(name);
  const previousPath = process.env.MONITOR_DB_PATH;
  process.env.MONITOR_DB_PATH = dbPath;
  db.resetForTests();

  try {
    await db.getDb();
    await fn();
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

async function withServer(fn) {
  delete require.cache[require.resolve('../server/index')];
  const { app } = require('../server/index');
  let server;
  try {
    await new Promise(resolve => {
      server = app.listen(0, resolve);
    });
    await fn(`http://127.0.0.1:${server.address().port}`);
  } finally {
    if (server) {
      await new Promise((resolve, reject) => server.close(err => (err ? reject(err) : resolve())));
    }
    delete require.cache[require.resolve('../server/index')];
  }
}

function insertUpstream(id, name) {
  db.run(
    `INSERT INTO upstreams (id, name, base_url, type, enabled)
     VALUES (?, ?, ?, 'sub2api', 1)`,
    [id, name, `https://${id}.example.test`]
  );
}

function insertChange(change) {
  db.run(
    `INSERT INTO group_changes
       (upstream_id, group_id, group_name, change_type, field_name, old_value, new_value, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      change.upstream_id,
      change.group_id,
      change.group_name,
      change.change_type,
      change.field_name ?? null,
      change.old_value ?? null,
      change.new_value ?? null,
      change.created_at,
    ]
  );
}

test('change history API merges same-poll group field changes for display', async () => {
  await withTempDb('change-history-merge', async () => {
    const currentPoll = '2026-01-01T00:01:00.000Z';
    const previousPoll = '2026-01-01T00:00:00.000Z';

    insertUpstream('u1', 'Upstream One');
    insertUpstream('u2', 'Upstream Two');

    insertChange({
      upstream_id: 'u1',
      group_id: 'g1',
      group_name: 'Group One',
      change_type: 'changed',
      field_name: 'rate_multiplier',
      old_value: '1',
      new_value: '2',
      created_at: currentPoll,
    });
    insertChange({
      upstream_id: 'u1',
      group_id: 'g1',
      group_name: 'Group One',
      change_type: 'changed',
      field_name: 'description',
      old_value: 'old',
      new_value: 'new',
      created_at: currentPoll,
    });
    insertChange({
      upstream_id: 'u1',
      group_id: 'g2',
      group_name: 'Group Two',
      change_type: 'changed',
      field_name: 'ratio',
      old_value: '3',
      new_value: '4',
      created_at: currentPoll,
    });
    insertChange({
      upstream_id: 'u1',
      group_id: 'g1',
      group_name: 'Group One',
      change_type: 'changed',
      field_name: 'status',
      old_value: 'enabled',
      new_value: 'disabled',
      created_at: previousPoll,
    });
    insertChange({
      upstream_id: 'u1',
      group_id: 'gone',
      group_name: 'Gone Group',
      change_type: 'unavailable',
      created_at: currentPoll,
    });
    insertChange({
      upstream_id: 'u1',
      group_id: 'new',
      group_name: 'New Group',
      change_type: 'available',
      created_at: currentPoll,
    });
    insertChange({
      upstream_id: 'u2',
      group_id: 'g1',
      group_name: 'Other Upstream Group',
      change_type: 'changed',
      field_name: 'rate_multiplier',
      old_value: '5',
      new_value: '6',
      created_at: currentPoll,
    });

    await withServer(async baseUrl => {
      let res = await fetch(`${baseUrl}/api/changes?upstream_id=u1&limit=10`);
      let body = await res.json();

      assert.equal(res.status, 200);
      assert.equal(body.length, 5);
      assert.equal(body.some(row => row.upstream_id === 'u2'), false);
      assert.equal(body.filter(row => row.change_type === 'available').length, 1);
      assert.equal(body.filter(row => row.change_type === 'unavailable').length, 1);

      const currentGroupOneRows = body.filter(row =>
        row.change_type === 'changed' &&
        row.group_id === 'g1' &&
        row.created_at === currentPoll
      );
      assert.equal(currentGroupOneRows.length, 1);
      assert.deepEqual(
        currentGroupOneRows[0].field_changes
          .map(change => [change.field_name, change.old_value, change.new_value])
          .sort(),
        [
          ['description', 'old', 'new'],
          ['rate_multiplier', '1', '2'],
        ]
      );

      const groupTwo = body.find(row => row.change_type === 'changed' && row.group_id === 'g2');
      assert.deepEqual(groupTwo.field_changes, [
        { field_name: 'ratio', old_value: '3', new_value: '4' },
      ]);

      const previousGroupOne = body.find(row =>
        row.change_type === 'changed' &&
        row.group_id === 'g1' &&
        row.created_at === previousPoll
      );
      assert.deepEqual(previousGroupOne.field_changes, [
        { field_name: 'status', old_value: 'enabled', new_value: 'disabled' },
      ]);

      res = await fetch(`${baseUrl}/api/changes?upstream_id=u1&limit=4`);
      body = await res.json();

      assert.equal(res.status, 200);
      assert.equal(body.length, 4);
      const limitedGroupOne = body.find(row => row.change_type === 'changed' && row.group_id === 'g1');
      assert.equal(limitedGroupOne.field_changes.length, 2);
    });
  });
});
