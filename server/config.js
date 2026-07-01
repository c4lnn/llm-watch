/**
 * 配置文件加载模块
 *
 * 从 YAML 配置文件读取中转列表，替代前端管理。
 * 配置文件路径优先级：CONFIG_PATH 环境变量 > ./config.yaml
 *
 * id 由代码自动生成（基于 base_url 的 MD5 hash），用户无需填写。
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const YAML = require('yaml');

// 默认配置文件路径
const DEFAULT_CONFIG_PATH = path.join(__dirname, '..', 'config.yaml');

// 内存中的中转配置列表
let upstreams = [];
let notifications = [];

const SUPPORTED_NOTIFICATION_TYPES = new Set(['bark']);
const DEFAULT_BARK_GROUP = 'LLM Watch';

/**
 * 获取配置文件路径
 */
function getConfigPath() {
  return process.env.CONFIG_PATH || DEFAULT_CONFIG_PATH;
}

/**
 * 加载并解析配置文件
 * @returns {Array} 中转配置列表
 */
function loadConfig() {
  const configPath = getConfigPath();

  if (!fs.existsSync(configPath)) {
    console.warn(`[Config] 配置文件不存在: ${configPath}`);
    upstreams = [];
    notifications = [];
    return upstreams;
  }

  try {
    const content = fs.readFileSync(configPath, 'utf8');
    const config = YAML.parse(content);

    if (!config || !Array.isArray(config.upstreams)) {
      console.warn('[Config] 配置文件格式错误: 缺少 upstreams 数组');
      upstreams = [];
      notifications = [];
      return upstreams;
    }

    upstreams = config.upstreams.map((u, index) => validateUpstream(u, index));
    notifications = validateNotifications(config.notifications || []);
    console.log(`[Config] 已加载 ${upstreams.length} 个中转配置，${notifications.length} 个通知渠道`);
    return upstreams;
  } catch (err) {
    console.error(`[Config] 配置文件解析失败: ${err.message}`);
    process.exit(1);
  }
}

/**
 * 校验单个中转配置
 */
function validateUpstream(upstream, index) {
  const prefix = `upstreams[${index}]`;

  // 必填字段检查
  if (!upstream.name) {
    console.error(`[Config] ${prefix}: 缺少 name 字段`);
    process.exit(1);
  }
  if (!upstream.base_url) {
    console.error(`[Config] ${prefix}: 缺少 base_url 字段`);
    process.exit(1);
  }
  if (!upstream.type) {
    console.error(`[Config] ${prefix}: 缺少 type 字段`);
    process.exit(1);
  }
  if (!upstream.email) {
    console.error(`[Config] ${prefix}: 缺少 email 字段`);
    process.exit(1);
  }
  if (!upstream.password) {
    console.error(`[Config] ${prefix}: 缺少 password 字段`);
    process.exit(1);
  }

  // id 由代码自动生成（基于 base_url 的 MD5 hash）
  const baseUrl = upstream.base_url.replace(/\/+$/, '');
  const id = crypto.createHash('md5').update(baseUrl).digest('hex').slice(0, 12);

  // 返回标准化的配置
  return {
    id,
    name: upstream.name,
    base_url: baseUrl,
    type: upstream.type,
    email: upstream.email,
    password: upstream.password,
    poll_interval: upstream.poll_interval || 60,
    enabled: upstream.enabled !== false,
  };
}

function validateNotifications(items) {
  if (!Array.isArray(items)) {
    console.error('[Config] notifications 必须是数组');
    process.exit(1);
  }

  const seenIds = new Set();
  return items.map((item, index) => validateNotification(item, index, seenIds));
}

function validateNotification(notification, index, seenIds) {
  const prefix = `notifications[${index}]`;

  if (!notification || typeof notification !== 'object') {
    console.error(`[Config] ${prefix}: 必须是对象`);
    process.exit(1);
  }

  const id = String(notification.id || '').trim();
  if (!id) {
    console.error(`[Config] ${prefix}: 缺少 id 字段`);
    process.exit(1);
  }
  if (seenIds.has(id)) {
    console.error(`[Config] ${prefix}: id 重复: ${id}`);
    process.exit(1);
  }
  seenIds.add(id);

  const type = String(notification.type || '').trim().toLowerCase();
  if (!type) {
    console.error(`[Config] ${prefix}: 缺少 type 字段`);
    process.exit(1);
  }
  if (!SUPPORTED_NOTIFICATION_TYPES.has(type)) {
    console.error(`[Config] ${prefix}: 不支持的通知类型: ${type}`);
    process.exit(1);
  }

  if (notification.enabled !== undefined && typeof notification.enabled !== 'boolean') {
    console.error(`[Config] ${prefix}: enabled 必须是布尔值`);
    process.exit(1);
  }

  if (!notification.config || typeof notification.config !== 'object' || Array.isArray(notification.config)) {
    console.error(`[Config] ${prefix}: 缺少 config 对象`);
    process.exit(1);
  }

  return {
    id,
    type,
    enabled: notification.enabled !== false,
    config: validateNotificationConfig(type, notification.config, prefix),
  };
}

function validateNotificationConfig(type, config, prefix) {
  if (type === 'bark') {
    const server = String(config.server || '').replace(/\/+$/, '');
    const key = String(config.key || '').trim();
    const group = String(config.group || '').trim();
    if (!server) {
      console.error(`[Config] ${prefix}: Bark config 缺少 server 字段`);
      process.exit(1);
    }
    if (!key) {
      console.error(`[Config] ${prefix}: Bark config 缺少 key 字段`);
      process.exit(1);
    }
    return group ? { server, key, group } : { server, key };
  }

  return { ...config };
}

/**
 * 获取所有中转配置
 */
function getUpstreams() {
  return upstreams;
}

/**
 * 根据 ID 获取单个中转配置
 */
function getUpstreamById(id) {
  return upstreams.find(u => u.id === String(id));
}

/**
 * 获取中转配置（不含敏感信息，用于 API 返回）
 */
function getUpstreamsForApi() {
  return upstreams.map(u => ({
    id: u.id,
    name: u.name,
    base_url: u.base_url,
    type: u.type,
    email: u.email,
    poll_interval: u.poll_interval,
    enabled: u.enabled,
  }));
}

function getNotifications() {
  return notifications.map(n => ({
    ...n,
    config: { ...n.config },
  }));
}

function getNotificationById(id) {
  const notification = notifications.find(n => n.id === String(id));
  if (!notification) return null;
  return {
    ...notification,
    config: { ...notification.config },
  };
}

function maskSecret(value) {
  const text = String(value || '');
  if (!text) return '';
  if (text.length <= 8) return '***';
  return `${text.slice(0, 4)}***${text.slice(-4)}`;
}

function sanitizeNotificationConfig(notification) {
  if (notification.type === 'bark') {
    return {
      server: notification.config.server,
      key: maskSecret(notification.config.key),
      group: notification.config.group || DEFAULT_BARK_GROUP,
    };
  }
  return {};
}

function getNotificationsForApi() {
  return notifications.map(n => ({
    id: n.id,
    type: n.type,
    enabled: n.enabled,
    config: sanitizeNotificationConfig(n),
  }));
}

module.exports = {
  loadConfig,
  getUpstreams,
  getUpstreamById,
  getUpstreamsForApi,
  getNotifications,
  getNotificationById,
  getNotificationsForApi,
  getConfigPath,
};
