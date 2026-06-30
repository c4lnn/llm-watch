require('./logger'); // patch console with timestamps — must be first
const express = require('express');
const cors = require('cors');
const cron = require('node-cron');
const path = require('path');
const fs = require('fs');
const {
  getDb,
  save,
  selectAll,
  run,
  selectLatestUpstreamBalanceStatuses,
  getBalanceAlertGlobalSettings,
  updateBalanceAlertGlobalSettings,
  getBalanceAlertOverrides,
  upsertBalanceAlertOverride,
  deleteBalanceAlertOverride,
  getEffectiveBalanceAlertSettings,
  getBalanceAlertState,
} = require('./db');
const { pollAll, pollUpstream } = require('./poller');
const { notify } = require('./notifier');
const { getAdapter } = require('./adapters');
const {
  loadConfig,
  getUpstreams,
  getUpstreamById,
  getUpstreamsForApi,
  getNotificationsForApi,
  getNotificationById,
} = require('./config');

const app = express();
const PORT = process.env.PORT || 8888;

app.use(cors());
app.use(express.json());

// Serve the built frontend
const clientBuild = path.join(__dirname, '..', 'client', 'build');
app.use(express.static(clientBuild));

const stripTrailingSlash = (url) => url.replace(/\/+$/, '');

// ==================== Upstream APIs ====================

// List upstreams from config file (read-only, no password/token exposed)
app.get('/api/upstreams', (req, res) => {
  const configUpstreams = getUpstreamsForApi();

  // 合并数据库中的轮询状态
  const dbUpstreams = selectAll(`
    SELECT id, last_poll_at, last_poll_status, last_poll_error
    FROM upstreams
  `);

  // 按 config id 关联数据库状态
  const result = configUpstreams.map(cu => {
    const dbRow = dbUpstreams.find(db => String(db.id) === cu.id);
    return {
      ...cu,
      last_poll_at: dbRow?.last_poll_at || null,
      last_poll_status: dbRow?.last_poll_status || null,
      last_poll_error: dbRow?.last_poll_error || null,
    };
  });

  res.json(result);
});

// Add upstream - disabled (config file is source of truth)
app.post('/api/upstreams', (req, res) => {
  res.status(403).json({ error: '中转配置需通过服务器配置文件管理，无法通过前端新增' });
});

// Update upstream - disabled (config file is source of truth)
app.put('/api/upstreams/:id', (req, res) => {
  res.status(403).json({ error: '中转配置需通过服务器配置文件管理，无法通过前端修改' });
});

// Delete upstream - disabled (config file is source of truth)
app.delete('/api/upstreams/:id', (req, res) => {
  res.status(403).json({ error: '中转配置需通过服务器配置文件管理，无法通过前端删除' });
});

// ==================== Groups / Snapshots ====================

// Groups present in the most recent poll (currently-available only)
app.get('/api/upstreams/:id/groups', (req, res) => {
  const { id } = req.params;
  const rows = selectAll(`
    SELECT group_id, group_name, rate, raw_data, created_at
    FROM group_snapshots
    WHERE upstream_id = ?
      AND created_at = (SELECT MAX(created_at) FROM group_snapshots WHERE upstream_id = ?)
    ORDER BY created_at DESC
  `, [id, id]);
  res.json(rows);
});

// Change history (availability + field changes), optionally filtered by upstream
app.get('/api/changes', (req, res) => {
  const { upstream_id, limit = 100 } = req.query;
  const params = [];
  let sql = `
    SELECT gc.*, u.name as upstream_name
    FROM group_changes gc
    JOIN upstreams u ON u.id = gc.upstream_id
  `;
  if (upstream_id) {
    sql += ` WHERE gc.upstream_id = ?`;
    params.push(upstream_id);
  }
  sql += ` ORDER BY gc.created_at DESC LIMIT ?`;
  params.push(parseInt(limit) || 100);
  res.json(selectAll(sql, params));
});

// Rate history for a specific group (by name)
app.get('/api/upstreams/:id/groups/:name/history', (req, res) => {
  const { id, name } = req.params;
  const rows = selectAll(`
    SELECT rate, created_at
    FROM group_snapshots
    WHERE upstream_id = ? AND group_name = ?
    ORDER BY created_at DESC
    LIMIT 200
  `, [id, name]);
  res.json(rows);
});

// Diff between the latest two snapshots of a group (for dashboard hover)
app.get('/api/upstreams/:uid/groups/:gid/diff', (req, res) => {
  const { uid, gid } = req.params;
  const upstream = selectAll('SELECT type FROM upstreams WHERE id = ?', [uid])[0];
  const rows = selectAll(`
    SELECT raw_data, created_at FROM group_snapshots
    WHERE upstream_id = ? AND group_id = ?
    ORDER BY id DESC LIMIT 2
  `, [uid, gid]);

  if (rows.length < 2) {
    return res.json({ hasDiff: false, message: '仅有一条记录，无法对比' });
  }

  let curRaw, prevRaw;
  try {
    curRaw = JSON.parse(rows[0].raw_data);
    prevRaw = JSON.parse(rows[1].raw_data);
  } catch {
    return res.json({ hasDiff: false });
  }

  const fieldLabels = upstream ? getAdapter(upstream.type).fieldLabels : {};
  const diffs = [];
  for (const [key, label] of Object.entries(fieldLabels)) {
    if (JSON.stringify(prevRaw[key]) !== JSON.stringify(curRaw[key])) {
      diffs.push({ field: label, old: String(prevRaw[key] ?? ''), new: String(curRaw[key] ?? '') });
    }
  }

  res.json({
    hasDiff: diffs.length > 0,
    diffs,
    prevTime: rows[1].created_at,
    curTime: rows[0].created_at,
  });
});

// ==================== Manual Poll ====================

app.post('/api/poll', async (req, res) => {
  try {
    console.log('[Poll] 手动触发全部轮询');
    const results = await pollAll();
    save();
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/upstreams/:id/poll', async (req, res) => {
  const configUpstream = getUpstreamById(req.params.id);
  if (!configUpstream) return res.status(404).json({ error: 'Upstream not found' });

  // 合并数据库中的 auth_token
  const dbRow = selectAll('SELECT auth_token FROM upstreams WHERE id = ?', [configUpstream.id])[0];
  const upstream = { ...configUpstream, auth_token: dbRow?.auth_token || null };

  try {
    const result = await pollUpstream(upstream);
    save();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== Test Connection ====================

app.post('/api/test', async (req, res) => {
  const { base_url, type = 'sub2api', email, password } = req.body;
  if (!base_url || !email || !password) {
    return res.status(400).json({ success: false, error: 'base_url、账号、密码 均为必填' });
  }
  const url = stripTrailingSlash(base_url);
  try {
    const adapter = getAdapter(type);
    const token = await adapter.login(url, email, password);
    const data = await adapter.fetchGroups(url, token);
    res.json({ success: true, data });
  } catch (err) {
    res.status(400).json({ success: false, error: err.response?.data?.message || err.message });
  }
});

// ==================== Notification Config ====================

function getNotificationEnabledOverrides() {
  const rows = selectAll('SELECT notification_id, enabled FROM notification_state');
  return Object.fromEntries(rows.map(row => [String(row.notification_id), row.enabled === 1]));
}

function applyNotificationEnabledOverrides(configs) {
  const overrides = getNotificationEnabledOverrides();
  return configs.map(cfg => ({
    ...cfg,
    enabled: Object.prototype.hasOwnProperty.call(overrides, cfg.id) ? overrides[cfg.id] : cfg.enabled,
  }));
}

app.get('/api/notifications', (req, res) => {
  res.json(applyNotificationEnabledOverrides(getNotificationsForApi()));
});

app.post('/api/notifications', (req, res) => {
  res.status(403).json({ error: '通知渠道需通过 config.yaml 配置，无法通过前端新增' });
});

app.put('/api/notifications/:id', (req, res) => {
  const { id } = req.params;
  const keys = Object.keys(req.body || {});
  const { enabled } = req.body || {};

  if (keys.some(key => key !== 'enabled')) {
    return res.status(400).json({ error: '仅支持修改 enabled 状态' });
  }
  if (typeof enabled !== 'boolean') {
    return res.status(400).json({ error: 'enabled must be boolean' });
  }
  if (!getNotificationById(id)) {
    return res.status(404).json({ error: 'Notification channel not found' });
  }

  const existing = selectAll('SELECT notification_id FROM notification_state WHERE notification_id = ?', [id])[0];
  if (existing) {
    run(
      'UPDATE notification_state SET enabled = ?, updated_at = datetime(\'now\') WHERE notification_id = ?',
      [enabled ? 1 : 0, id]
    );
  } else {
    run(
      'INSERT INTO notification_state (notification_id, enabled) VALUES (?, ?)',
      [id, enabled ? 1 : 0]
    );
  }
  save();
  res.json({ success: true });
});

app.delete('/api/notifications/:id', (req, res) => {
  res.status(403).json({ error: '通知渠道需通过 config.yaml 配置，无法通过前端删除' });
});

app.post('/api/notifications/test', async (req, res) => {
  const { id } = req.body;
  const channel = getNotificationById(id);
  if (!channel) {
    return res.status(404).json({ success: false, error: 'Notification channel not found' });
  }

  try {
    const results = await notify(
      [{ ...channel, enabled: true }],
      '监控系统测试通知',
      `这是一条测试通知\n时间: ${new Date().toLocaleString('zh-CN')}`
    );
    res.json(results[0]);
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// ==================== Balance Alert Settings ====================

function parseOptionalNonNegativeNumber(value, field) {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) {
    const err = new Error(`${field} must be a non-negative number`);
    err.status = 400;
    throw err;
  }
  return numeric;
}

function parseOptionalBoolean(value, field) {
  if (value === undefined) return undefined;
  if (typeof value !== 'boolean') {
    const err = new Error(`${field} must be boolean`);
    err.status = 400;
    throw err;
  }
  return value;
}

function buildBalanceAlertSettingsPayload() {
  const global = getBalanceAlertGlobalSettings();
  const overrides = getBalanceAlertOverrides();
  const overrideMap = Object.fromEntries(overrides.map(row => [row.upstream_id, row]));
  const upstreams = getUpstreamsForApi().map(upstream => {
    const effective = getEffectiveBalanceAlertSettings(upstream.id);
    const state = getBalanceAlertState(upstream.id);
    return {
      id: upstream.id,
      name: upstream.name,
      type: upstream.type,
      enabled: effective.enabled,
      threshold: effective.threshold,
      threshold_source: effective.threshold_source,
      override: overrideMap[upstream.id] || null,
      state,
    };
  });

  return { global, upstreams };
}

app.get('/api/balance-alerts/settings', (req, res) => {
  res.json(buildBalanceAlertSettingsPayload());
});

app.put('/api/balance-alerts/settings', (req, res) => {
  try {
    const body = req.body || {};
    const patch = {};

    if (body.enabled !== undefined) patch.enabled = parseOptionalBoolean(body.enabled, 'enabled');
    if (body.notify_recovery !== undefined) {
      patch.notify_recovery = parseOptionalBoolean(body.notify_recovery, 'notify_recovery');
    }
    if (body.default_threshold !== undefined) {
      patch.default_threshold = parseOptionalNonNegativeNumber(body.default_threshold, 'default_threshold');
    }
    if (body.cooldown_minutes !== undefined) {
      const cooldown = parseOptionalNonNegativeNumber(body.cooldown_minutes, 'cooldown_minutes');
      if (cooldown === null || !Number.isInteger(cooldown)) {
        return res.status(400).json({ error: 'cooldown_minutes must be a non-negative integer' });
      }
      patch.cooldown_minutes = cooldown;
    }

    updateBalanceAlertGlobalSettings(patch);
    save();
    res.json(buildBalanceAlertSettingsPayload());
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

app.put('/api/balance-alerts/upstreams/:id', (req, res) => {
  try {
    const { id } = req.params;
    if (!getUpstreamById(id)) return res.status(404).json({ error: 'Upstream not found' });

    const body = req.body || {};
    const patch = {};
    if (body.enabled !== undefined) patch.enabled = parseOptionalBoolean(body.enabled, 'enabled');
    if (body.threshold !== undefined) {
      patch.threshold = parseOptionalNonNegativeNumber(body.threshold, 'threshold');
    }

    upsertBalanceAlertOverride(id, patch);
    save();
    res.json(buildBalanceAlertSettingsPayload());
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

app.delete('/api/balance-alerts/upstreams/:id', (req, res) => {
  if (!getUpstreamById(req.params.id)) return res.status(404).json({ error: 'Upstream not found' });
  deleteBalanceAlertOverride(req.params.id);
  save();
  res.json(buildBalanceAlertSettingsPayload());
});

// ==================== Dashboard Stats ====================

function buildStatsPayload() {
  const upstreamCount = selectAll('SELECT COUNT(*) as count FROM upstreams WHERE enabled = 1')[0]?.count || 0;
  const changes24h = selectAll(`
    SELECT COUNT(*) as count FROM group_changes WHERE created_at >= datetime('now', '-24 hours')
  `)[0]?.count || 0;

  const latestRates = selectAll(`
    SELECT gs.upstream_id, u.name as upstream_name, u.type, gs.group_id, gs.group_name, gs.rate, gs.raw_data, gs.created_at
    FROM group_snapshots gs
    JOIN upstreams u ON u.id = gs.upstream_id
    WHERE gs.created_at = (SELECT MAX(created_at) FROM group_snapshots WHERE upstream_id = gs.upstream_id)
    ORDER BY u.name, gs.created_at DESC
  `);

  // Most-recent change(s) per group, keyed "upstreamId_groupId"
  const recentChanges = selectAll(`
    SELECT gc.upstream_id, gc.group_id, gc.group_name, gc.change_type, gc.field_name, gc.old_value, gc.new_value
    FROM group_changes gc
    INNER JOIN (
      SELECT upstream_id, group_id, MAX(created_at) as max_time
      FROM group_changes GROUP BY upstream_id, group_id
    ) latest
      ON gc.upstream_id = latest.upstream_id
     AND gc.group_id = latest.group_id
     AND gc.created_at = latest.max_time
  `);

  const changeMap = {};
  for (const c of recentChanges) {
    (changeMap[`${c.upstream_id}_${c.group_id}`] ||= []).push(c);
  }

  const upstreamRows = selectAll('SELECT id, name, type FROM upstreams WHERE enabled = 1');
  const latestBalanceRows = selectLatestUpstreamBalanceStatuses(upstreamRows.map(u => u.id));
  const balanceMap = {};

  for (const upstream of upstreamRows) {
    const row = latestBalanceRows.find(r => String(r.upstream_id) === String(upstream.id));
    balanceMap[upstream.id] = row
      ? {
          upstream_id: row.upstream_id,
          status: row.status,
          balance: row.balance,
          display_value: row.display_value,
          display_unit: row.display_unit,
          label: row.label,
          kind: row.kind,
          error: row.error,
          created_at: row.created_at,
        }
      : {
          upstream_id: upstream.id,
          status: 'not_fetched',
          balance: null,
          display_value: null,
          display_unit: null,
          label: upstream.type === 'new-api' ? '额度' : '余额',
          kind: null,
          error: null,
          created_at: null,
        };
  }

  return {
    upstream_count: upstreamCount,
    changes_24h: changes24h,
    latest_rates: latestRates,
    recent_changes: changeMap,
    upstream_balances: balanceMap,
  };
}

app.get('/api/stats', (req, res) => {
  res.json(buildStatsPayload());
});

// ==================== SPA fallback ====================

app.get('{*path}', (req, res) => {
  const indexPath = path.join(clientBuild, 'index.html');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(404).json({ error: 'Frontend not built. Run: cd client && npm run build' });
  }
});

// ==================== Scheduler ====================

// Cron is a 1-minute heartbeat; each upstream's poll_interval decides whether
// it is actually due. Polls run off last_poll_at (not updated_at), so config
// edits never delay a poll and a failed poll waits the full interval.
//
// DUE_GRACE_MS absorbs sub-minute jitter: last_poll_at is stamped a fraction of
// a second after the tick, so without slack an interval that is a multiple of
// the 60s cron period always misses its mark by ~0.x s and slips a whole extra
// minute (e.g. a 300s interval effectively becoming 360s). 30s < cron period,
// so it fixes the boundary without ever double-firing within a minute.
const DUE_GRACE_MS = 30 * 1000;

function isDue(upstream, now) {
  const ref = upstream.last_poll_at || upstream.created_at;
  const lastMs = ref ? new Date(ref).getTime() : 0;
  const intervalMs = (upstream.poll_interval || 60) * 1000;
  return now - lastMs >= intervalMs - DUE_GRACE_MS;
}

async function start() {
  await getDb();
  console.log('[DB] 数据库就绪');

  // 加载配置文件
  loadConfig();

  cron.schedule('* * * * *', async () => {
    const now = Date.now();
    const configUpstreams = getUpstreams().filter(u => u.enabled);

    // 合并数据库中的轮询状态
    const dbUpstreams = selectAll('SELECT id, last_poll_at, created_at FROM upstreams');

    const due = configUpstreams.filter(configU => {
      const dbRow = dbUpstreams.find(db => String(db.id) === configU.id);
      const upstream = {
        ...configU,
        last_poll_at: dbRow?.last_poll_at || null,
        created_at: dbRow?.created_at || new Date().toISOString(),
      };
      return isDue(upstream, now);
    });

    if (!due.length) return; // stay quiet on idle ticks

    console.log(`[Cron] ${due.length} 个中转到点轮询: ${due.map(u => u.name).join(', ')}`);
    for (const configUpstream of due) {
      try {
        // 合并数据库中的 auth_token
        const dbRow = selectAll('SELECT auth_token FROM upstreams WHERE id = ?', [configUpstream.id])[0];
        const upstream = { ...configUpstream, auth_token: dbRow?.auth_token || null };
        await pollUpstream(upstream);
      } catch (err) {
        console.error(`[Cron] ${configUpstream.name} 轮询异常:`, err.message);
      }
    }
    save();
  });
  console.log('[Cron] 定时轮询已启动（每分钟检查一次到点的中转）');

  app.listen(PORT, () => {
    console.log(`[Server] Monitor 运行于 http://localhost:${PORT}`);
  });
}

if (require.main === module) {
  start().catch(err => {
    console.error('Failed to start:', err);
    process.exit(1);
  });
}

module.exports = { app, buildStatsPayload, isDue, start };
