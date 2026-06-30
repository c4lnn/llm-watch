/**
 * 模板适配器 — 每个中转类型一个 adapter，封装登录/拉取/字段标签
 *
 * 接口：
 *   login(baseUrl, account, password) -> auth token string (缓存到 DB)
 *   fetchGroups(baseUrl, authToken)   -> [{ key, name, rate, raw }] 归一化分组
 *   fetchAccountStatus(baseUrl, authToken) -> { balance, displayValue, displayUnit, label, kind, raw }
 *                                      可选；归一化账号余额/剩余额度
 *   fieldLabels                       -> { rawField: 中文标签 } 变动显示用
 *   trackedFields                     -> 变动检测对比的字段列表
 *
 * 两种模板差异：
 *                    sub2api                          new-api
 *   登录        POST /api/v1/auth/login         POST /api/user/login
 *               {email,password}                 {username,password}
 *               → data.access_token              → Set-Cookie + data.id
 *   认证        Authorization: Bearer <token>   Cookie: session + New-Api-User: <id>
 *   分组        GET /api/v1/groups/available    GET /api/user/self/groups
 *               data:[{id,name,rate_multiplier,…}] data:{名称:{ratio,desc}}
 *   账号状态    GET /api/v1/user/profile        GET /api/user/self
 *               data.balance                    data.quota
 *   归一化 key   String(id)                      分组名
 *   凭证失效    401 → 自动重登                   401 → 自动重登
 *
 * new-api 的 auth_token 缓存 JSON.stringify({cookie, userId})；sub2api 是 JWT。
 * new-api 跳过非数字 ratio 的元分组（如 auto → "自动"）。
 */

const axios = require('axios');

const TIMEOUT = 15000;
const NEWAPI_QUOTA_PER_DISPLAY_UNIT = 500000;

// ---------------- sub2api ----------------

const SUB2API_FIELDS = {
  name: '名称', description: '描述', platform: '平台', rate_multiplier: '倍率',
  is_exclusive: '独占', status: '状态', subscription_type: '订阅类型',
  daily_limit_usd: '日限额($)', weekly_limit_usd: '周限额($)', monthly_limit_usd: '月限额($)',
  allow_image_generation: '允许图片生成', image_rate_independent: '图片倍率独立',
  image_rate_multiplier: '图片倍率', image_price_1k: '图片价格1k',
  image_price_2k: '图片价格2k', image_price_4k: '图片价格4k',
  claude_code_only: '仅Claude Code', fallback_group_id: '回退分组',
  fallback_group_id_on_invalid_request: '无效请求回退分组',
  allow_messages_dispatch: '消息分发', require_oauth_only: '仅OAuth',
  require_privacy_set: '隐私集', rpm_limit: 'RPM限制',
};

const sub2api = {
  fieldLabels: SUB2API_FIELDS,
  trackedFields: Object.keys(SUB2API_FIELDS),

  async login(baseUrl, account, password) {
    const resp = await axios.post(
      `${baseUrl}/api/v1/auth/login`,
      { email: account, password },
      { timeout: TIMEOUT }
    );
    const token = resp.data?.data?.access_token;
    if (!token) throw new Error(resp.data?.message || '登录失败：未返回 access_token');
    return token;
  },

  async fetchGroups(baseUrl, authToken) {
    const resp = await axios.get(
      `${baseUrl}/api/v1/groups/available?timezone=Asia%2FShanghai`,
      { headers: { Authorization: `Bearer ${authToken}` }, timeout: TIMEOUT }
    );
    const items = Array.isArray(resp.data?.data) ? resp.data.data : [];
    return items.map(it => ({
      key: String(it.id),
      name: it.name || String(it.id ?? '') || 'Unknown',
      rate: parseFloat(it.rate_multiplier ?? 1),
      raw: it,
    }));
  },

  async fetchAccountStatus(baseUrl, authToken) {
    const resp = await axios.get(
      `${baseUrl}/api/v1/user/profile`,
      { headers: { Authorization: `Bearer ${authToken}` }, timeout: TIMEOUT }
    );
    const data = resp.data?.data || {};
    const balance = Number(data.balance);
    if (!Number.isFinite(balance)) {
      throw new Error(resp.data?.message || '获取余额失败：未返回有效 balance');
    }
    return {
      balance,
      displayValue: balance,
      displayUnit: '',
      label: '余额',
      kind: 'balance',
      raw: { balance: data.balance },
    };
  },
};

// ---------------- new-api ----------------

const NEWAPI_FIELDS = {
  ratio: '倍率',
  desc: '描述',
};

const newapi = {
  fieldLabels: NEWAPI_FIELDS,
  trackedFields: Object.keys(NEWAPI_FIELDS),

  // Session-cookie auth: cache both the cookie and the user id (required as the
  // New-Api-User header on every authenticated request).
  async login(baseUrl, account, password) {
    const resp = await axios.post(
      `${baseUrl}/api/user/login`,
      { username: account, password },
      { timeout: TIMEOUT }
    );
    if (!resp.data?.success) throw new Error(resp.data?.message || '登录失败');
    const userId = resp.data?.data?.id;
    const setCookie = resp.headers['set-cookie'];
    if (userId == null || !setCookie?.length) {
      throw new Error('登录失败：未返回会话 cookie');
    }
    const cookie = setCookie.map(c => c.split(';')[0]).join('; ');
    return JSON.stringify({ cookie, userId });
  },

  async fetchGroups(baseUrl, authToken) {
    const { cookie, userId } = JSON.parse(authToken);
    const resp = await axios.get(
      `${baseUrl}/api/user/self/groups`,
      { headers: { Cookie: cookie, 'New-Api-User': String(userId) }, timeout: TIMEOUT }
    );
    if (!resp.data?.success) throw new Error(resp.data?.message || '获取分组失败');
    const data = resp.data.data || {};
    return Object.entries(data)
      .map(([name, info]) => ({
        key: name,
        name,
        rate: typeof info.ratio === 'number' ? info.ratio : parseFloat(info.ratio),
        raw: { ratio: info.ratio, desc: info.desc },
      }))
      // skip meta groups without a numeric ratio (e.g. "auto" → "自动")
      .filter(g => Number.isFinite(g.rate));
  },

  async fetchAccountStatus(baseUrl, authToken) {
    const { cookie, userId } = JSON.parse(authToken);
    const resp = await axios.get(
      `${baseUrl}/api/user/self`,
      { headers: { Cookie: cookie, 'New-Api-User': String(userId) }, timeout: TIMEOUT }
    );
    if (!resp.data?.success) throw new Error(resp.data?.message || '获取额度失败');
    const data = resp.data.data || {};
    const quota = Number(data.quota);
    if (!Number.isFinite(quota)) {
      throw new Error(resp.data?.message || '获取额度失败：未返回有效 quota');
    }
    return {
      balance: quota,
      displayValue: quota / NEWAPI_QUOTA_PER_DISPLAY_UNIT,
      displayUnit: '',
      label: '额度',
      kind: 'quota',
      raw: { quota: data.quota, used_quota: data.used_quota },
    };
  },
};

// ---------------- registry ----------------

const ADAPTERS = { sub2api, 'new-api': newapi };

function getAdapter(type) {
  const adapter = ADAPTERS[type];
  if (!adapter) throw new Error(`不支持的中转类型: ${type}`);
  return adapter;
}

module.exports = { getAdapter, ADAPTERS, NEWAPI_QUOTA_PER_DISPLAY_UNIT };
