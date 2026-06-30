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

function installAxiosMock(handler) {
  const axiosPath = require.resolve('axios');
  const previous = require.cache[axiosPath];
  require.cache[axiosPath] = {
    id: axiosPath,
    filename: axiosPath,
    loaded: true,
    exports: {
      get: (...args) => handler('get', ...args),
      post: (...args) => handler('post', ...args),
    },
  };

  delete require.cache[require.resolve('../server/adapters')];
  return () => {
    if (previous) {
      require.cache[axiosPath] = previous;
    } else {
      delete require.cache[axiosPath];
    }
    delete require.cache[require.resolve('../server/adapters')];
  };
}

test('adapters normalize sub2api balance and new-api quota account status', async () => {
  const restore = installAxiosMock((method, url) => {
    if (method === 'get' && url.endsWith('/api/v1/user/profile')) {
      return Promise.resolve({ data: { data: { balance: 12.5 } } });
    }
    if (method === 'get' && url.endsWith('/api/user/self')) {
      return Promise.resolve({ data: { success: true, data: { quota: 1000000, used_quota: 250000 } } });
    }
    return Promise.reject(new Error(`unexpected axios call: ${method} ${url}`));
  });

  try {
    const { ADAPTERS } = require('../server/adapters');

    const sub2apiStatus = await ADAPTERS.sub2api.fetchAccountStatus('https://sub.example.test', 'token');
    assert.deepEqual(sub2apiStatus, {
      balance: 12.5,
      displayValue: 12.5,
      displayUnit: '',
      label: '余额',
      kind: 'balance',
      raw: { balance: 12.5 },
    });

    const newapiStatus = await ADAPTERS['new-api'].fetchAccountStatus(
      'https://new.example.test',
      JSON.stringify({ cookie: 'session=abc', userId: 7 })
    );
    assert.equal(newapiStatus.balance, 1000000);
    assert.equal(newapiStatus.displayValue, 2);
    assert.equal(newapiStatus.label, '额度');
    assert.equal(newapiStatus.kind, 'quota');
    assert.deepEqual(newapiStatus.raw, { quota: 1000000, used_quota: 250000 });
  } finally {
    restore();
  }
});

test('poller records failed balance status without failing successful group poll', async () => {
  await withTempDb('balance-failure-poll', async () => {
    const notifierPath = require.resolve('../server/notifier');
    const previousNotifier = require.cache[notifierPath];
    require.cache[notifierPath] = {
      id: notifierPath,
      filename: notifierPath,
      loaded: true,
      exports: { sendNotification: async () => ({ success: true }) },
    };

    delete require.cache[require.resolve('../server/poller')];
    const { pollUpstream } = require('../server/poller');

    const upstream = {
      id: 'poll-balance-upstream',
      name: 'Poll Balance Upstream',
      base_url: 'https://poll.example.test',
      type: 'custom',
      email: 'user@example.test',
      password: 'secret',
      poll_interval: 60,
      enabled: true,
      auth_token: 'token',
    };

    const adapter = {
      fieldLabels: {},
      trackedFields: [],
      async fetchGroups() {
        return [{ key: 'group-a', name: 'Group A', rate: 1, raw: { name: 'Group A' } }];
      },
      async fetchAccountStatus() {
        throw new Error('balance endpoint down');
      },
    };

    const adaptersPath = require.resolve('../server/adapters');
    const adapters = require(adaptersPath);
    const originalCustom = adapters.ADAPTERS.custom;
    adapters.ADAPTERS.custom = adapter;

    try {
      const result = await pollUpstream(upstream);
      const snapshots = db.selectAll('SELECT group_name FROM group_snapshots WHERE upstream_id = ?', [upstream.id]);
      const balanceRows = db.selectAll('SELECT status, error FROM upstream_balance_snapshots WHERE upstream_id = ?', [upstream.id]);
      const upstreamRows = db.selectAll('SELECT last_poll_status FROM upstreams WHERE id = ?', [upstream.id]);

      assert.deepEqual(result, { success: true, groups: 1, changes: 1 });
      assert.equal(snapshots.length, 1);
      assert.equal(snapshots[0].group_name, 'Group A');
      assert.equal(balanceRows.length, 1);
      assert.equal(balanceRows[0].status, 'failed');
      assert.equal(balanceRows[0].error, 'balance endpoint down');
      assert.equal(upstreamRows[0].last_poll_status, 'success');
    } finally {
      if (originalCustom) {
        adapters.ADAPTERS.custom = originalCustom;
      } else {
        delete adapters.ADAPTERS.custom;
      }
      if (previousNotifier) {
        require.cache[notifierPath] = previousNotifier;
      } else {
        delete require.cache[notifierPath];
      }
      delete require.cache[require.resolve('../server/poller')];
    }
  });
});

test('poller records unsupported account status when adapter has no status fetcher', async () => {
  await withTempDb('balance-unsupported', async () => {
    const { _test } = require('../server/poller');
    const upstream = {
      id: 'unsupported-upstream',
      name: 'Unsupported Upstream',
      base_url: 'https://unsupported.example.test',
      type: 'custom',
      email: 'user@example.test',
      password: 'secret',
      poll_interval: 60,
      enabled: true,
      auth_token: 'token',
    };

    const result = await _test.recordAccountStatus(upstream, {}, '2026-01-01T00:00:00.000Z');
    const rows = db.selectAll('SELECT status, label FROM upstream_balance_snapshots WHERE upstream_id = ?', [upstream.id]);

    assert.deepEqual(result, { status: 'unsupported' });
    assert.equal(rows.length, 1);
    assert.equal(rows[0].status, 'unsupported');
  });
});

test('sub2api poll records successful account balance status', async () => {
  await withTempDb('sub2api-balance-poll', async () => {
    const notifierPath = require.resolve('../server/notifier');
    const previousNotifier = require.cache[notifierPath];
    require.cache[notifierPath] = {
      id: notifierPath,
      filename: notifierPath,
      loaded: true,
      exports: { sendNotification: async () => ({ success: true }) },
    };

    delete require.cache[require.resolve('../server/poller')];
    const { pollUpstream } = require('../server/poller');
    const adapters = require('../server/adapters');
    const originalSub2api = adapters.ADAPTERS.sub2api;
    adapters.ADAPTERS.sub2api = {
      fieldLabels: {},
      trackedFields: [],
      async fetchGroups() {
        return [{ key: '1', name: 'Default', rate: 1, raw: { name: 'Default' } }];
      },
      async fetchAccountStatus() {
        return { balance: 9.75, displayValue: 9.75, displayUnit: '', label: 'balance', kind: 'balance', raw: { balance: 9.75 } };
      },
    };

    try {
      const result = await pollUpstream({
        id: 'sub2api-balance-upstream',
        name: 'Sub2API Balance Upstream',
        base_url: 'https://sub2api.example.test',
        type: 'sub2api',
        email: 'user@example.test',
        password: 'secret',
        poll_interval: 60,
        enabled: true,
        auth_token: 'token',
      });
      const rows = db.selectAll(
        'SELECT status, balance, display_value, kind FROM upstream_balance_snapshots WHERE upstream_id = ?',
        ['sub2api-balance-upstream']
      );

      assert.deepEqual(result, { success: true, groups: 1, changes: 1 });
      assert.equal(rows.length, 1);
      assert.equal(rows[0].status, 'success');
      assert.equal(rows[0].balance, 9.75);
      assert.equal(rows[0].display_value, 9.75);
      assert.equal(rows[0].kind, 'balance');
    } finally {
      adapters.ADAPTERS.sub2api = originalSub2api;
      if (previousNotifier) {
        require.cache[notifierPath] = previousNotifier;
      } else {
        delete require.cache[notifierPath];
      }
      delete require.cache[require.resolve('../server/poller')];
    }
  });
});

test('authenticated account status fetch retries once after 401', async () => {
  await withTempDb('balance-auth-retry', async () => {
    const { _test } = require('../server/poller');
    const upstream = {
      id: 'retry-upstream',
      name: 'Retry Upstream',
      base_url: 'https://retry.example.test',
      type: 'sub2api',
      email: 'user@example.test',
      password: 'secret',
      poll_interval: 60,
      enabled: true,
      auth_token: 'expired-token',
    };
    let accountCalls = 0;
    const adapter = {
      async login() {
        return 'fresh-token';
      },
      async fetchAccountStatus(baseUrl, token) {
        accountCalls += 1;
        if (accountCalls === 1) {
          const err = new Error('expired');
          err.response = { status: 401 };
          throw err;
        }
        return { balance: 3, displayValue: 3, displayUnit: '', label: 'balance', kind: 'balance', raw: { token } };
      },
    };

    const status = await _test.recordAccountStatus(upstream, adapter, '2026-01-01T00:00:00.000Z');
    const tokenRows = db.selectAll('SELECT auth_token FROM upstreams WHERE id = ?', [upstream.id]);
    const balanceRows = db.selectAll('SELECT status, balance FROM upstream_balance_snapshots WHERE upstream_id = ?', [upstream.id]);

    assert.deepEqual(status, { status: 'success' });
    assert.equal(accountCalls, 2);
    assert.equal(upstream.auth_token, 'fresh-token');
    assert.equal(tokenRows[0].auth_token, 'fresh-token');
    assert.equal(balanceRows[0].status, 'success');
    assert.equal(balanceRows[0].balance, 3);
  });
});

test('stats include latest upstream balance without raw sensitive data', async () => {
  await withTempDb('stats-balance', async () => {
    db.run(
      `INSERT INTO upstreams (id, name, base_url, type, enabled)
       VALUES (?, ?, ?, ?, 1), (?, ?, ?, ?, 1)`,
      [
        'with-balance',
        'With Balance',
        'https://with-balance.example.test',
        'sub2api',
        'without-balance',
        'Without Balance',
        'https://without-balance.example.test',
        'new-api',
      ]
    );
    db.insertUpstreamBalanceSnapshot({
      upstreamId: 'with-balance',
      status: 'success',
      balance: 8,
      displayValue: 8,
      displayUnit: '',
      label: '余额',
      kind: 'balance',
      rawData: { token: 'secret' },
      createdAt: '2026-01-01T00:00:00.000Z',
    });

    const { buildStatsPayload } = require('../server/index');
    const stats = buildStatsPayload();

    assert.equal(stats.upstream_balances['with-balance'].status, 'success');
    assert.equal(stats.upstream_balances['with-balance'].display_value, 8);
    assert.equal(stats.upstream_balances['with-balance'].raw_data, undefined);
    assert.equal(stats.upstream_balances['without-balance'].status, 'not_fetched');
    assert.equal(stats.upstream_balances['without-balance'].label, '额度');
  });
});
