const axios = require('axios');
const { selectAll } = require('./db');

// Bark push notification
async function sendBark(config, title, body) {
  const { server, key } = config;
  const url = `${server}/${key}/${encodeURIComponent(title)}/${encodeURIComponent(body)}?sound=minuet&group=monitor`;
  await axios.get(url);
}

const HANDLERS = {
  bark: sendBark,
};

async function notify(configs, title, body) {
  const results = [];
  for (const cfg of configs) {
    if (!cfg.enabled) continue;
    const handler = HANDLERS[cfg.type];
    if (!handler) {
      results.push({ type: cfg.type, success: false, error: 'Unknown type' });
      continue;
    }
    try {
      await handler(JSON.parse(cfg.config), title, body);
      results.push({ type: cfg.type, success: true });
    } catch (err) {
      results.push({ type: cfg.type, success: false, error: err.message });
    }
  }
  return results;
}

// Dispatch a notification to every enabled channel.
async function sendNotification(title, body) {
  const configs = selectAll('SELECT * FROM notification_config WHERE enabled = 1');
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

module.exports = { notify, sendNotification };
