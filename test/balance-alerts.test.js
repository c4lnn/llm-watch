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

function installNotifierMock(calls) {
  const notifierPath = require.resolve('../server/notifier');
  const previous = require.cache[notifierPath];
  require.cache[notifierPath] = {
    id: notifierPath,
    filename: notifierPath,
    loaded: true,
    exports: {
      sendNotification: async (title, body) => {
        calls.push({ title, body });
        return [{ success: true }];
      },
    },
  };
  delete require.cache[require.resolve('../server/balanceAlerts')];

  return () => {
    if (previous) {
      require.cache[notifierPath] = previous;
    } else {
      delete require.cache[notifierPath];
    }
    delete require.cache[require.resolve('../server/balanceAlerts')];
  };
}

function upstream(overrides = {}) {
  return {
    id: 'upstream-alert',
    name: 'Alert Upstream',
    type: 'sub2api',
    ...overrides,
  };
}

function status(overrides = {}) {
  return {
    balance: 9,
    displayValue: 9,
    displayUnit: '',
    label: '余额',
    kind: 'balance',
    ...overrides,
  };
}

test('balance alert state machine sends low alert, suppresses cooldown, reminds, and recovers', async () => {
  await withTempDb('balance-alert-state-machine', async () => {
    db.updateBalanceAlertGlobalSettings({
      enabled: true,
      default_threshold: 10,
      cooldown_minutes: 60,
      notify_recovery: true,
    });

    const calls = [];
    const restore = installNotifierMock(calls);
    try {
      const { evaluateBalanceAlert } = require('../server/balanceAlerts');

      let result = await evaluateBalanceAlert(upstream(), status({ displayValue: 9 }), '2026-01-01T00:00:00.000Z');
      assert.equal(result.action, 'low_alert');
      assert.equal(calls.length, 1);
      assert.equal(db.getBalanceAlertState('upstream-alert').state, 'low');

      result = await evaluateBalanceAlert(upstream(), status({ displayValue: 8 }), '2026-01-01T00:30:00.000Z');
      assert.equal(result.action, 'cooldown_suppressed');
      assert.equal(calls.length, 1);

      result = await evaluateBalanceAlert(upstream(), status({ displayValue: 7 }), '2026-01-01T01:01:00.000Z');
      assert.equal(result.action, 'low_reminder');
      assert.equal(calls.length, 2);

      result = await evaluateBalanceAlert(upstream(), status({ displayValue: 12 }), '2026-01-01T01:10:00.000Z');
      assert.equal(result.action, 'recovery_alert');
      assert.equal(calls.length, 3);
      assert.equal(db.getBalanceAlertState('upstream-alert').state, 'normal');
    } finally {
      restore();
    }
  });
});

test('balance alert skips disabled, missing threshold, failed, unsupported, and non-finite values', async () => {
  await withTempDb('balance-alert-skips', async () => {
    const calls = [];
    const restore = installNotifierMock(calls);
    try {
      const { evaluateBalanceAlert } = require('../server/balanceAlerts');

      let result = await evaluateBalanceAlert(upstream(), status({ displayValue: 1 }), '2026-01-01T00:00:00.000Z');
      assert.equal(result.action, 'skipped');
      assert.equal(result.reason, 'no_threshold');

      db.updateBalanceAlertGlobalSettings({ enabled: false, default_threshold: 10 });
      result = await evaluateBalanceAlert(upstream(), status({ displayValue: 1 }), '2026-01-01T00:01:00.000Z');
      assert.equal(result.reason, 'disabled');

      db.updateBalanceAlertGlobalSettings({ enabled: true, default_threshold: 10 });
      result = await evaluateBalanceAlert(upstream(), { status: 'failed' }, '2026-01-01T00:02:00.000Z');
      assert.equal(result.reason, 'unsupported_or_failed');

      result = await evaluateBalanceAlert(upstream(), { status: 'unsupported' }, '2026-01-01T00:03:00.000Z');
      assert.equal(result.reason, 'unsupported_or_failed');

      result = await evaluateBalanceAlert(upstream(), status({ displayValue: 'NaN', balance: null }), '2026-01-01T00:04:00.000Z');
      assert.equal(result.reason, 'non_finite_value');
      assert.equal(calls.length, 0);
    } finally {
      restore();
    }
  });
});

test('balance alert compares new-api raw quota through normalized display value', async () => {
  await withTempDb('balance-alert-newapi-normalized', async () => {
    db.updateBalanceAlertGlobalSettings({ enabled: true, default_threshold: 10, cooldown_minutes: 60 });

    const calls = [];
    const restore = installNotifierMock(calls);
    try {
      const { evaluateBalanceAlert, _test } = require('../server/balanceAlerts');
      const accountStatus = {
        balance: 2500000,
        displayValue: 5,
        displayUnit: '',
        label: '额度',
        kind: 'quota',
      };

      assert.equal(_test.getComparableBalanceValue(accountStatus), 5);
      const result = await evaluateBalanceAlert(
        upstream({ id: 'newapi-upstream', name: 'New API', type: 'new-api' }),
        accountStatus,
        '2026-01-01T00:00:00.000Z'
      );

      assert.equal(result.action, 'low_alert');
      assert.equal(result.value, 5);
      assert.equal(calls.length, 1);
    } finally {
      restore();
    }
  });
});

test('balance alert settings API reads and updates global and upstream settings', async () => {
  await withTempDb('balance-alert-api', async () => {
    const previousConfigPath = process.env.CONFIG_PATH;
    const configPath = path.join(os.tmpdir(), `llm-watch-${process.pid}-${Date.now()}-balance-alert-api.yaml`);
    fs.writeFileSync(configPath, `upstreams:
  - name: API Upstream
    base_url: https://api-alert.example.test
    type: sub2api
    email: user@example.test
    password: secret
`);
    process.env.CONFIG_PATH = configPath;

    let server;
    try {
      const config = require('../server/config');
      config.loadConfig();
      const upstreamId = config.getUpstreams()[0].id;
      delete require.cache[require.resolve('../server/index')];
      const { app } = require('../server/index');
      await new Promise(resolve => {
        server = app.listen(0, resolve);
      });
      const baseUrl = `http://127.0.0.1:${server.address().port}`;

      let res = await fetch(`${baseUrl}/api/balance-alerts/settings`);
      let body = await res.json();
      assert.equal(res.status, 200);
      assert.equal(body.global.enabled, true);
      assert.equal(body.upstreams.length, 1);
      assert.equal(body.upstreams[0].threshold, null);

      res = await fetch(`${baseUrl}/api/balance-alerts/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ default_threshold: 10, cooldown_minutes: 30, notify_recovery: false }),
      });
      body = await res.json();
      assert.equal(res.status, 200);
      assert.equal(body.global.default_threshold, 10);
      assert.equal(body.global.cooldown_minutes, 30);
      assert.equal(body.global.notify_recovery, false);
      assert.equal(body.upstreams[0].threshold, 10);
      assert.equal(body.upstreams[0].threshold_source, 'default');

      res = await fetch(`${baseUrl}/api/balance-alerts/upstreams/${upstreamId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ threshold: 5, enabled: false }),
      });
      body = await res.json();
      assert.equal(res.status, 200);
      assert.equal(body.upstreams[0].threshold, 5);
      assert.equal(body.upstreams[0].threshold_source, 'override');
      assert.equal(body.upstreams[0].enabled, false);

      res = await fetch(`${baseUrl}/api/balance-alerts/upstreams/${upstreamId}`, { method: 'DELETE' });
      body = await res.json();
      assert.equal(res.status, 200);
      assert.equal(body.upstreams[0].threshold, 10);
      assert.equal(body.upstreams[0].threshold_source, 'default');

      res = await fetch(`${baseUrl}/api/balance-alerts/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cooldown_minutes: 1.5 }),
      });
      assert.equal(res.status, 400);
    } finally {
      if (server) {
        await new Promise((resolve, reject) => server.close(err => (err ? reject(err) : resolve())));
      }
      delete require.cache[require.resolve('../server/index')];
      if (previousConfigPath == null) {
        delete process.env.CONFIG_PATH;
      } else {
        process.env.CONFIG_PATH = previousConfigPath;
      }
      fs.rmSync(configPath, { force: true });
    }
  });
});
