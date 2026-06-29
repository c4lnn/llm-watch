import React, { useState, useEffect } from 'react';
import api from '../api';

const FIELD_NAMES = {
  name: '名称', description: '描述', platform: '平台', rate_multiplier: '倍率',
  is_exclusive: '独占', status: '状态', subscription_type: '订阅类型',
  daily_limit_usd: '日限额($)', weekly_limit_usd: '周限额($)', monthly_limit_usd: '月限额($)',
  allow_image_generation: '允许图片生成', image_rate_independent: '图片倍率独立',
  image_rate_multiplier: '图片倍率', rpm_limit: 'RPM限制',
};

function Dashboard() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  const load = () => {
    api.get('/api/stats').then(r => {
      setStats(r.data);
      setLoading(false);
    });
  };

  useEffect(load, []);

  if (loading) return <div className="text-center py-10 text-gray-400">加载中...</div>;

  const changeMap = stats.recent_changes || {};

  // Group by upstream
  const grouped = {};
  for (const r of stats.latest_rates) {
    if (!grouped[r.upstream_name]) {
      grouped[r.upstream_name] = { upstreamId: r.upstream_id, type: r.type, time: r.created_at, groups: [] };
    }
    let platform = '';
    let updatedAt = '';
    let desc = '';
    try {
      const raw = JSON.parse(r.raw_data);
      platform = raw.platform || '';
      updatedAt = raw.updated_at || '';
      desc = raw.description || raw.desc || '';
    } catch {}
    const changeKey = `${r.upstream_id}_${r.group_id}`;
    grouped[r.upstream_name].groups.push({
      id: r.group_id,
      name: r.group_name,
      rate: r.rate,
      platform,
      updated_at: updatedAt,
      desc,
      changes: changeMap[changeKey] || [],
    });
    if (r.created_at > grouped[r.upstream_name].time) {
      grouped[r.upstream_name].time = r.created_at;
    }
  }

  // Sort groups by updated_at desc
  for (const data of Object.values(grouped)) {
    data.groups.sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''));
  }

  // Extract unique types for filter tabs (sub2api first)
  const typeOrder = ['sub2api', 'new-api'];
  const types = [...new Set(Object.values(grouped).map(d => d.type))].sort(
    (a, b) => typeOrder.indexOf(a) - typeOrder.indexOf(b)
  );

  // Apply filter and sort by type (sub2api first)
  const filteredEntries = (filter === 'all'
    ? Object.entries(grouped)
    : Object.entries(grouped).filter(([, data]) => data.type === filter)
  ).sort(([, a], [, b]) => typeOrder.indexOf(a.type) - typeOrder.indexOf(b.type));

  return (
    <div className="space-y-6">
      {/* Filter tabs */}
      {types.length > 1 && (
        <div className="flex items-center gap-2">
          {[{ label: '全部', value: 'all' }, ...types.map(t => ({ label: t, value: t }))].map(tab => (
            <button
              key={tab.value}
              onClick={() => setFilter(tab.value)}
              className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                filter === tab.value
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}

      {filteredEntries.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm p-10 text-center text-gray-400">
          {Object.keys(grouped).length === 0
            ? '暂无数据，请先添加中转并执行轮询'
            : '当前筛选条件下无中转'}
        </div>
      ) : (
        filteredEntries.map(([name, data]) => {
          const isNewApi = data.type === 'new-api';
          return (
            <div key={name} className="bg-white rounded-xl shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b bg-gray-50 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-gray-800">{name}</h3>
                  <span className="text-xs px-1.5 py-0.5 rounded bg-gray-200 text-gray-500">{data.type}</span>
                </div>
                <span className="text-xs text-gray-400">
                  最近轮询: {new Date(data.time).toLocaleString('zh-CN')}
                </span>
              </div>

              <table className="w-full">
                <thead className="text-sm text-gray-500">
                  <tr>
                    <th className="text-left px-6 py-2.5 font-medium">分组</th>
                    <th className="text-left px-6 py-2.5 font-medium">描述</th>
                    {!isNewApi && <th className="text-left px-6 py-2.5 font-medium">平台</th>}
                    <th className="text-right px-6 py-2.5 font-medium">倍率</th>
                    {!isNewApi && <th className="text-right px-6 py-2.5 font-medium">更新时间</th>}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {data.groups.map((g, i) => (
                    <tr key={g.id || i} className="hover:bg-gray-50">
                      <td className="px-6 py-2.5 text-gray-700">
                        {g.name}
                        <span className="ml-2 text-xs text-gray-300">#{g.id}</span>
                      </td>
                      <td className="px-6 py-2.5 text-gray-500 text-sm max-w-[200px] truncate" title={g.desc || undefined}>
                        {g.desc || '-'}
                      </td>
                      {!isNewApi && (
                        <td className="px-6 py-2.5">
                          <span className={`text-xs px-2 py-0.5 rounded ${
                            g.platform === 'anthropic' ? 'bg-orange-50 text-orange-600'
                              : g.platform === 'openai' ? 'bg-green-50 text-green-600'
                                : 'bg-gray-100 text-gray-500'
                          }`}>
                            {g.platform}
                          </span>
                        </td>
                      )}
                      <td className="px-6 py-2.5 text-right">
                        <span className={`font-mono font-bold text-sm ${
                          g.rate > 1 ? 'text-red-500' : g.rate < 1 ? 'text-green-500' : 'text-gray-600'
                        }`}>
                          {g.rate}x
                        </span>
                      </td>
                      {!isNewApi && (
                        <td className="px-6 py-2.5 text-right">
                          <DiffTooltip updatedAt={g.updated_at} changes={g.changes} />
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        })
      )}
    </div>
  );
}

function DiffTooltip({ updatedAt, changes }) {
  const [show, setShow] = useState(false);

  const formatTime = (t) => {
    if (!t) return '-';
    try { return new Date(t).toLocaleString('zh-CN'); } catch { return t; }
  };

  const hasChanges = changes.length > 0;

  return (
    <div
      className="relative inline-block"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      <span className={`text-xs cursor-default border-b border-dashed ${
        hasChanges ? 'text-orange-500 border-orange-300' : 'text-gray-400 border-gray-300'
      }`}>
        {formatTime(updatedAt)}
      </span>
      {show && (
        <div className="absolute right-0 bottom-full mb-2 w-72 bg-gray-900 text-white text-xs rounded-lg shadow-xl p-3 z-50">
          <div className="absolute right-3 -bottom-1.5 w-3 h-3 bg-gray-900 rotate-45" />
          {!hasChanges ? (
            <div className="text-gray-400">与上次轮询无变化</div>
          ) : (
            <div className="space-y-1.5">
              <div className="text-gray-400 mb-1">最近一次变更：</div>
              {changes.map((c, i) => (
                <div key={i}>
                  {c.change_type === 'available' ? (
                    <span className="text-green-400">🟢 分组上线</span>
                  ) : c.change_type === 'unavailable' ? (
                    <span className="text-red-400">🔴 分组下线</span>
                  ) : (
                    <div className="flex justify-between gap-2">
                      <span className="text-gray-300 shrink-0">{FIELD_NAMES[c.field_name] || c.field_name}</span>
                      <span className="text-right truncate">
                        <span className="line-through text-red-400">{c.old_value || '空'}</span>
                        <span className="text-gray-500 mx-1">→</span>
                        <span className="text-green-400">{c.new_value || '空'}</span>
                      </span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default Dashboard;
