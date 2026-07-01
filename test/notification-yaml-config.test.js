const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const db = require('../server/db');
const config = require('../server/config');

function tempPath(name, ext) {
  return path.join(os.tmpdir(), `llm-watch-${process.pid}-${Date.now()}-${name}.${ext}`);
}

function yamlWithNotifications(notificationsYaml) {
  return `upstreams: []\nnotifications:\n${notificationsYaml}`;
}

async function withTempDb(name, fn) {
  const dbPath = tempPath(name, 'db');
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

async function withTempConfig(name, yaml, fn) {
  const configPath = tempPath(name, 'yaml');
  const previousPath = process.env.CONFIG_PATH;
  fs.writeFileSync(configPath, yaml);
  process.env.CONFIG_PATH = configPath;

  try {
    config.loadConfig();
    await fn();
  } finally {
    if (previousPath == null) {
      delete process.env.CONFIG_PATH;
    } else {
      process.env.CONFIG_PATH = previousPath;
    }
    fs.rmSync(configPath, { force: true });
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
    },
  };

  delete require.cache[require.resolve('../server/notifier')];
  return () => {
    if (previous) {
      require.cache[axiosPath] = previous;
    } else {
      delete require.cache[axiosPath];
    }
    delete require.cache[require.resolve('../server/notifier')];
  };
}

function requireFreshIndex() {
  delete require.cache[require.resolve('../server/index')];
  return require('../server/index');
}

function requireFreshNotifier() {
  delete require.cache[require.resolve('../server/notifier')];
  return require('../server/notifier');
}

function listen(app) {
  return new Promise(resolve => {
    const server = app.listen(0, () => {
      resolve({
        server,
        baseUrl: `http://127.0.0.1:${server.address().port}`,
      });
    });
  });
}

function close(server) {
  return new Promise((resolve, reject) => {
    server.close(err => (err ? reject(err) : resolve()));
  });
}

async function requestJson(baseUrl, url, options = {}) {
  const res = await fetch(`${baseUrl}${url}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  return { status: res.status, body: await res.json() };
}

test('config loads YAML notifications with default enabled and sanitized API config', async () => {
  await withTempConfig(
    'notification-config',
    yamlWithNotifications(`  - id: bark-main
    type: bark
    config:
      server: https://api.day.app/
      key: secret-bark-key
      group: 自定义分组
`),
    async () => {
      const full = config.getNotifications();
      const sanitized = config.getNotificationsForApi();

      assert.equal(full.length, 1);
      assert.equal(full[0].id, 'bark-main');
      assert.equal(full[0].enabled, true);
      assert.deepEqual(full[0].config, { server: 'https://api.day.app', key: 'secret-bark-key', group: '自定义分组' });

      assert.equal(sanitized[0].config.server, 'https://api.day.app');
      assert.equal(sanitized[0].config.group, '自定义分组');
      assert.notEqual(sanitized[0].config.key, 'secret-bark-key');
      assert.match(sanitized[0].config.key, /\*\*\*/);
    }
  );
});

test('notification APIs expose config-managed channels and reject create/delete', async () => {
  await withTempDb('notification-api', async () => {
    await withTempConfig(
      'notification-api',
      yamlWithNotifications(`  - id: bark-main
    type: bark
    config:
      server: https://api.day.app
      key: secret-bark-key
      group: 测试 Group
`),
      async () => {
        const calls = [];
        const restoreAxios = installAxiosMock((method, url) => {
          calls.push({ method, url });
          return Promise.resolve({ data: { ok: true } });
        });

        let server;
        let baseUrl;
        try {
          const { app } = requireFreshIndex();
          ({ server, baseUrl } = await listen(app));

          let response = await requestJson(baseUrl, '/api/notifications');
          assert.equal(response.status, 200);
          assert.equal(response.body.length, 1);
          assert.equal(response.body[0].id, 'bark-main');
          assert.equal(response.body[0].enabled, true);
          assert.equal(response.body[0].config.group, '测试 Group');
          assert.notEqual(response.body[0].config.key, 'secret-bark-key');

          response = await requestJson(baseUrl, '/api/notifications/bark-main', {
            method: 'PUT',
            body: JSON.stringify({ enabled: false }),
          });
          assert.equal(response.status, 200);

          response = await requestJson(baseUrl, '/api/notifications');
          assert.equal(response.body[0].enabled, false);

          response = await requestJson(baseUrl, '/api/notifications/bark-main', {
            method: 'PUT',
            body: JSON.stringify({ config: { key: 'browser-secret' } }),
          });
          assert.equal(response.status, 400);

          response = await requestJson(baseUrl, '/api/notifications', {
            method: 'POST',
            body: JSON.stringify({ type: 'bark', config: { key: 'browser-secret' } }),
          });
          assert.equal(response.status, 403);

          response = await requestJson(baseUrl, '/api/notifications/bark-main', { method: 'DELETE' });
          assert.equal(response.status, 403);

          response = await requestJson(baseUrl, '/api/notifications/test', {
            method: 'POST',
            body: JSON.stringify({ id: 'bark-main' }),
          });
          assert.equal(response.status, 200);
          assert.equal(response.body.success, true);
          assert.equal(calls.length, 1);
          assert.equal(calls[0].method, 'get');
          assert.match(calls[0].url, /^https:\/\/api\.day\.app\/secret-bark-key\//);
          assert.equal(new URL(calls[0].url).searchParams.get('group'), '测试 Group');
        } finally {
          if (server) await close(server);
          restoreAxios();
          delete require.cache[require.resolve('../server/index')];
        }
      }
    );
  });
});

test('sendNotification uses YAML channels and skips runtime-disabled channels', async () => {
  await withTempDb('notification-send-filter', async () => {
    await withTempConfig(
      'notification-send-filter',
      yamlWithNotifications(`  - id: bark-enabled
    type: bark
    config:
      server: https://api.day.app
      key: enabled-key
  - id: bark-disabled
    type: bark
    enabled: true
    config:
      server: https://api.day.app
      key: disabled-key
`),
      async () => {
        const apiNotifications = config.getNotificationsForApi();
        assert.equal(apiNotifications.find(n => n.id === 'bark-enabled').config.group, 'LLM Watch');

        db.run(
          'INSERT INTO notification_state (notification_id, enabled) VALUES (?, ?)',
          ['bark-disabled', 0]
        );

        const calls = [];
        const restoreAxios = installAxiosMock((method, url) => {
          calls.push({ method, url });
          return Promise.resolve({ data: { ok: true } });
        });

        try {
          const { sendNotification } = requireFreshNotifier();
          const results = await sendNotification('Title', 'Body');

          assert.equal(results.length, 1);
          assert.equal(results[0].id, 'bark-enabled');
          assert.equal(calls.length, 1);
          assert.match(calls[0].url, /^https:\/\/api\.day\.app\/enabled-key\//);
          assert.equal(new URL(calls[0].url).searchParams.get('group'), 'LLM Watch');
          assert.doesNotMatch(calls[0].url, /disabled-key/);
        } finally {
          restoreAxios();
        }
      }
    );
  });
});

test('Bark group query parameter uses configured value or default', async () => {
  const calls = [];
  const restoreAxios = installAxiosMock((method, url) => {
    calls.push({ method, url });
    return Promise.resolve({ data: { ok: true } });
  });

  try {
    const { notify } = requireFreshNotifier();
    const results = await notify(
      [
        {
          id: 'bark-custom',
          type: 'bark',
          enabled: true,
          config: { server: 'https://api.day.app', key: 'custom-key', group: '中文 Group' },
        },
        {
          id: 'bark-default',
          type: 'bark',
          enabled: true,
          config: { server: 'https://api.day.app', key: 'default-key', group: '   ' },
        },
      ],
      'Title',
      'Body'
    );

    assert.equal(results.length, 2);
    assert.equal(new URL(calls[0].url).searchParams.get('group'), '中文 Group');
    assert.equal(new URL(calls[1].url).searchParams.get('group'), 'LLM Watch');
  } finally {
    restoreAxios();
  }
});
