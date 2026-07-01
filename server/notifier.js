const axios = require('axios');
const { selectAll } = require('./db');
const { getNotifications } = require('./config');

const DEFAULT_BARK_GROUP = 'LLM Watch';

function getBarkGroup(config) {
  const group = String(config.group || '').trim();
  return group || DEFAULT_BARK_GROUP;
}

// Bark push notification
async function sendBark(config, title, body) {
  const { server, key } = config;
  const params = new URLSearchParams({
    sound: 'minuet',
    group: getBarkGroup(config),
  });
  const url = `${server}/${key}/${encodeURIComponent(title)}/${encodeURIComponent(body)}?${params.toString()}`;
  await axios.get(url);
}

const HANDLERS = {
  bark: sendBark,
};

function parseChannelConfig(config) {
  if (typeof config === 'string') return JSON.parse(config);
  if (config && typeof config === 'object') return config;
  return {};
}

async function notify(configs, title, body) {
  const results = [];
  for (const cfg of configs) {
    if (!cfg.enabled) continue;
    const handler = HANDLERS[cfg.type];
    if (!handler) {
      results.push({ id: cfg.id, type: cfg.type, success: false, error: 'Unknown type' });
      continue;
    }
    try {
      await handler(parseChannelConfig(cfg.config), title, body);
      results.push({ id: cfg.id, type: cfg.type, success: true });
    } catch (err) {
      results.push({ id: cfg.id, type: cfg.type, success: false, error: err.message });
    }
  }
  return results;
}

function applyEnabledOverrides(configs) {
  const rows = selectAll('SELECT notification_id, enabled FROM notification_state');
  const overrideMap = Object.fromEntries(rows.map(row => [String(row.notification_id), row.enabled === 1]));
  return configs.map(cfg => ({
    ...cfg,
    enabled: Object.prototype.hasOwnProperty.call(overrideMap, cfg.id) ? overrideMap[cfg.id] : cfg.enabled,
  }));
}

// Dispatch a notification to every enabled channel.
async function sendNotification(title, body) {
  const configs = applyEnabledOverrides(getNotifications()).filter(cfg => cfg.enabled);
  if (!configs.length) {
    console.log('[Notify] 无启用的通知渠道，跳过推送');
    return;
  }
  const results = await notify(configs, title, body);
  const ok = results.filter(r => r.success).length;
  console.log(`[Notify] 推送完成: ${ok}/${results.length} 个渠道成功`);
  for (const r of results.filter(r => !r.success)) {
    console.error(`[Notify] 渠道 ${r.type} 失败: ${r.error}`);
  }
  return results;
}

module.exports = {
  notify,
  sendNotification,
  _test: {
    applyEnabledOverrides,
    getBarkGroup,
    parseChannelConfig,
  },
};
