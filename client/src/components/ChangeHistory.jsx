import React, { useState, useEffect } from 'react';
import api from '../api';

const TYPE_LABELS = {
  available: { label: '新增', icon: '🟢', color: 'bg-green-50 text-green-700' },
  unavailable: { label: '下线', icon: '🔴', color: 'bg-red-50 text-red-700' },
  changed: { label: '变更', icon: '✏️', color: 'bg-blue-50 text-blue-700' },
};

const FIELD_NAMES = {
  name: '名称', description: '描述', platform: '平台', rate_multiplier: '倍率',
  is_exclusive: '独占', status: '状态', subscription_type: '订阅类型',
  daily_limit_usd: '日限额($)', weekly_limit_usd: '周限额($)', monthly_limit_usd: '月限额($)',
  allow_image_generation: '允许图片生成', image_rate_independent: '图片倍率独立',
  image_rate_multiplier: '图片倍率', image_price_1k: '图片价格1k',
  image_price_2k: '图片价格2k', image_price_4k: '图片价格4k',
  claude_code_only: '仅Claude Code', fallback_group_id: '回退分组',
  allow_messages_dispatch: '消息分发', require_oauth_only: '仅OAuth',
  require_privacy_set: '隐私集', rpm_limit: 'RPM限制',
  // new-api fields
  ratio: '倍率', desc: '描述',
};

function ChangeHistory() {
  const [changes, setChanges] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    api.get('/api/changes?limit=200').then(r => {
      setChanges(r.data);
      setLoading(false);
    });
  }, []);

  if (loading) return <div className="text-center py-10 text-gray-400">加载中...</div>;

  const filtered = filter === 'all'
    ? changes
    : changes.filter(c => c.change_type === filter);

  return (
    <div className="space-y-4">
      {/* Filter Tabs */}
      <div className="flex gap-2">
        {[
          { key: 'all', label: '全部' },
          { key: 'changed', label: '✏️ 字段变更' },
          { key: 'available', label: '🟢 新增' },
          { key: 'unavailable', label: '🔴 下线' },
        ].map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`px-3 py-1.5 text-sm rounded-lg transition ${
              filter === f.key
                ? 'bg-blue-500 text-white'
                : 'bg-white text-gray-600 hover:bg-gray-100'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Changes List */}
      <div className="bg-white rounded-xl shadow-sm overflow-x-auto">
        {filtered.length === 0 ? (
          <div className="text-center py-10 text-gray-400">暂无变动记录</div>
        ) : (
          <table className="w-full min-w-[900px]">
            <thead className="bg-gray-50 text-sm text-gray-500">
              <tr>
                <th className="text-left px-6 py-3">时间</th>
                <th className="text-left px-6 py-3">中转</th>
                <th className="text-left px-6 py-3">分组</th>
                <th className="w-24 text-left px-6 py-3 whitespace-nowrap">类型</th>
                <th className="text-left px-6 py-3">详情</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map((c, i) => {
                const typeInfo = TYPE_LABELS[c.change_type] || { label: c.change_type, icon: '❓', color: 'bg-gray-50 text-gray-700' };
                return (
                  <tr key={i} className="hover:bg-gray-50">
                    <td className="px-6 py-3 text-sm text-gray-400 whitespace-nowrap">
                      {new Date(c.created_at).toLocaleString('zh-CN')}
                    </td>
                    <td className="px-6 py-3 font-medium text-gray-700">{c.upstream_name}</td>
                    <td className="px-6 py-3 text-gray-600">
                      {c.group_name}
                      <span className="ml-1 text-xs text-gray-300">#{c.group_id}</span>
                    </td>
                    <td className="px-6 py-3 whitespace-nowrap">
                      <span className={`inline-flex items-center gap-1 whitespace-nowrap text-xs px-2 py-0.5 rounded ${typeInfo.color}`}>
                        <span>{typeInfo.icon}</span>
                        <span>{typeInfo.label}</span>
                      </span>
                    </td>
                    <td className="px-6 py-3 text-sm text-gray-600">
                      {c.change_type === 'changed' ? (
                        <span>
                          <span className="text-gray-400">{FIELD_NAMES[c.field_name] || c.field_name}</span>
                          <span className="mx-1 text-gray-300">:</span>
                          <span className="line-through text-red-400">{c.old_value}</span>
                          <span className="mx-1 text-gray-300">→</span>
                          <span className="text-green-600 font-medium">{c.new_value}</span>
                        </span>
                      ) : c.change_type === 'available' ? (
                        <span className="text-green-600">分组上线</span>
                      ) : (
                        <span className="text-red-500">分组下线</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

export default ChangeHistory;
