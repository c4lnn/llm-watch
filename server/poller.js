/**
 * 轮询引擎 — 模板无关的轮询、变更检测、快照管理
 *
 * 流程：
 * 1. 按 upstream.type 取 adapter，登录（或用缓存凭证）后拉取归一化分组
 * 2. 与上次快照按 group_id 对比：
 *    - 新出现 → available
 *    - 消失 → unavailable（只触发一次）
 *    - 字段变化 → changed（按 adapter.trackedFields 逐字段对比）
 * 3. 变动写入 group_changes，合并为一条通知推送
 * 4. 快照入库，每个 (upstream, group) 保留最近 10 条
 *
 * cron 每分钟心跳，按 last_poll_at + poll_interval（减 30s 容差）判断是否到点
 */

const { sendNotification } = require('./notifier');
const { selectAll, run } = require('./db');
const { getAdapter } = require('./adapters');
const { getUpstreams } = require('./config');

// 确保数据库中存在对应的 upstream 记录
// 配置文件中的 id 作为数据库主键
function ensureUpstreamInDb(upstream) {
  const existing = selectAll('SELECT id FROM upstreams WHERE id = ?', [upstream.id]);
  if (existing.length === 0) {
    // 插入新记录
    run(
      `INSERT INTO upstreams (id, name, base_url, type, email, password, poll_interval, enabled)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [upstream.id, upstream.name, upstream.base_url, upstream.type, upstream.email, upstream.password,
       upstream.poll_interval, upstream.enabled ? 1 : 0]
    );
  }
}

// Fetch normalized groups using the cached auth token, transparently
// (re)logging in with the stored credentials when the token is missing or
// rejected (401). A freshly obtained token is persisted back to the upstream.
async function fetchGroupsWithAuth(upstream, adapter) {
  const { id, base_url, email, password } = upstream;
  let token = upstream.auth_token;

  // 确保数据库中存在记录
  ensureUpstreamInDb(upstream);

  const relogin = async () => {
    if (!email || !password) throw new Error('缺少账号或密码，无法登录');
    console.log(`[Auth] ${upstream.name}: 登录获取凭证 (${email})`);
    token = await adapter.login(base_url, email, password);
    run(`UPDATE upstreams SET auth_token = ? WHERE id = ?`, [token, id]);
    return token;
  };

  if (!token) await relogin();

  try {
    return await adapter.fetchGroups(base_url, token);
  } catch (err) {
    if (err.response?.status === 401 && email && password) {
      console.log(`[Auth] ${upstream.name}: 凭证失效 (401)，自动重新登录`);
      await relogin();
      return await adapter.fetchGroups(base_url, token);
    }
    throw err;
  }
}

// Load the PREVIOUS poll's groups for an upstream, keyed by group key (string).
// Each poll stamps all its groups with the same created_at, so the previous
// poll is simply the snapshots with the latest created_at currently in the
// table (new snapshots aren't inserted until after this runs). Comparing
// against only the last poll — not every group ever seen — means a vanished
// group fires "unavailable" exactly once, not on every subsequent poll.
function loadPreviousSnapshots(upstreamId) {
  const rows = selectAll(
    `SELECT group_id, group_name, rate, raw_data
       FROM group_snapshots
      WHERE upstream_id = ?
        AND created_at = (SELECT MAX(created_at) FROM group_snapshots WHERE upstream_id = ?)`,
    [upstreamId, upstreamId]
  );
  return new Map(rows.map(r => [String(r.group_id), r]));
}

// Keep only the most recent SNAPSHOTS_PER_GROUP snapshots per (upstream, group).
// Comparison needs only the last poll and diff needs the last two, so a small
// cap bounds table growth without losing anything we read.
const SNAPSHOTS_PER_GROUP = 10;

function pruneSnapshots(upstreamId) {
  run(
    `DELETE FROM group_snapshots
      WHERE id IN (
        SELECT id FROM (
          SELECT id, ROW_NUMBER() OVER (
            PARTITION BY group_id ORDER BY id DESC
          ) AS rn
          FROM group_snapshots
          WHERE upstream_id = ?
        ) WHERE rn > ?
      )`,
    [upstreamId, SNAPSHOTS_PER_GROUP]
  );
}

// Compare current vs previous group maps and return a flat list of changes.
// `adapter.trackedFields` drives which raw fields are diffed per template.
function detectChanges(currentMap, prevMap, adapter) {
  const changes = [];

  // Appeared / disappeared
  for (const [key, group] of currentMap) {
    if (!prevMap.has(key)) {
      changes.push({ group_id: key, group_name: group.name, type: 'available', rate: group.rate });
    }
  }
  for (const [key, prev] of prevMap) {
    if (!currentMap.has(key)) {
      changes.push({ group_id: key, group_name: prev.group_name, type: 'unavailable' });
    }
  }

  // Field-level changes on groups present in both
  for (const [key, group] of currentMap) {
    const prev = prevMap.get(key);
    if (!prev) continue;

    let prevRaw;
    try { prevRaw = JSON.parse(prev.raw_data); } catch { continue; }

    for (const field of adapter.trackedFields) {
      const oldVal = prevRaw[field];
      const newVal = group.raw[field];
      if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
        changes.push({
          group_id: key, group_name: group.name, type: 'changed', field,
          old_value: oldVal == null ? 'null' : String(oldVal),
          new_value: newVal == null ? 'null' : String(newVal),
        });
      }
    }
  }

  return changes;
}

function formatRate(rate) {
  if (rate == null || rate === '') return '';
  const numeric = Number(rate);
  return Number.isFinite(numeric) ? String(numeric) : String(rate);
}

// Persist changes to group_changes and return a notification body (or '').
function recordChanges(upstreamId, changes, now, adapter) {
  const lines = [];
  for (const c of changes) {
    run(
      `INSERT INTO group_changes
         (upstream_id, group_id, group_name, change_type, field_name, old_value, new_value, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [upstreamId, c.group_id, c.group_name, c.type, c.field ?? null, c.old_value ?? null, c.new_value ?? null, now]
    );

    if (c.type === 'available') {
      const rate = formatRate(c.rate);
      lines.push(rate ? `🟢 新增: ${c.group_name} · 倍率: ${rate}` : `🟢 新增: ${c.group_name}`);
    } else if (c.type === 'unavailable') {
      lines.push(`🔴 下线: ${c.group_name}`);
    } else {
      const label = adapter.fieldLabels[c.field] || c.field;
      lines.push(`✏️ ${c.group_name} · ${label}: ${c.old_value} → ${c.new_value}`);
    }
  }
  return lines.join('\n');
}

// Stamp the poll outcome onto the upstream row. Uses last_poll_at (distinct
// from updated_at, which tracks config edits) so editing config never delays a
// poll, and a failed poll still respects the interval instead of retrying every
// cron tick.
function markPolled(upstreamId, status, error) {
  run(
    `UPDATE upstreams SET last_poll_at = ?, last_poll_status = ?, last_poll_error = ? WHERE id = ?`,
    [new Date().toISOString(), status, error ?? null, upstreamId]
  );
}

// Poll a single upstream: fetch, diff against last snapshot, record + notify.
async function pollUpstream(upstream) {
  const { id: upstreamId, name: upstreamName, type } = upstream;

  try {
    const adapter = getAdapter(type);
    const groups = await fetchGroupsWithAuth(upstream, adapter);
    const now = new Date().toISOString();

    const currentMap = new Map(groups.map(g => [String(g.key), g]));
    const prevMap = loadPreviousSnapshots(upstreamId);
    const changes = detectChanges(currentMap, prevMap, adapter);

    // Snapshot every current group (group_id column holds the string key)
    for (const group of currentMap.values()) {
      run(
        `INSERT INTO group_snapshots (upstream_id, group_id, group_name, rate, raw_data, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [upstreamId, group.key, group.name, group.rate, JSON.stringify(group.raw), now]
      );
    }
    pruneSnapshots(upstreamId);

    if (changes.length) {
      const body = recordChanges(upstreamId, changes, now, adapter);
      console.log(`[Poll] ${upstreamName} 检测到 ${changes.length} 处变动:\n${body}`);
      if (body) {
        const title = `中转变动 - ${upstreamName}`;
        const fullBody = `${body}\n\n⏰ ${new Date().toLocaleString('zh-CN')}`;
        try {
          await sendNotification(title, fullBody);
        } catch (err) {
          console.error(`[Notify] ${upstreamName} 推送失败:`, err.message);
        }
      }
    }

    markPolled(upstreamId, 'success', null);
    console.log(`[Poll] ${upstreamName}: ${currentMap.size} 个分组, ${changes.length} 处变动`);
    return { success: true, groups: currentMap.size, changes: changes.length };

  } catch (err) {
    markPolled(upstreamId, 'failed', err.message);
    console.error(`[Poll] ${upstreamName} 轮询失败:`, err.message);
    return { success: false, error: err.message };
  }
}

// Poll all enabled upstreams sequentially (from config file).
async function pollAll() {
  const configUpstreams = getUpstreams().filter(u => u.enabled);
  const results = [];

  for (const configUpstream of configUpstreams) {
    // 合并数据库中的 auth_token
    const dbRow = selectAll('SELECT auth_token FROM upstreams WHERE id = ?', [configUpstream.id])[0];
    const upstream = { ...configUpstream, auth_token: dbRow?.auth_token || null };
    const r = await pollUpstream(upstream);
    results.push({ upstream: configUpstream.name, ...r });
  }
  return results;
}

module.exports = {
  fetchGroupsWithAuth,
  pollUpstream,
  pollAll,
  _test: {
    ensureUpstreamInDb,
    detectChanges,
    formatRate,
    recordChanges,
    markPolled,
  },
};
