import React, { useState, useEffect } from 'react';
import api from '../api';

function UpstreamList({ onRefresh }) {
  const [upstreams, setUpstreams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [polling, setPolling] = useState({});

  const load = () => {
    api.get('/api/upstreams').then(r => {
      setUpstreams(r.data);
      setLoading(false);
    });
  };

  useEffect(load, []);

  const pollOne = async (id) => {
    setPolling(p => ({ ...p, [id]: true }));
    try {
      const res = await api.post(`/api/upstreams/${id}/poll`);
      alert(res.data.success
        ? `轮询成功，获取 ${res.data.groups} 个分组`
        : `轮询失败: ${res.data.error}`
      );
    } catch (err) {
      alert(`轮询失败: ${err.response?.data?.error || err.message}`);
    }
    setPolling(p => ({ ...p, [id]: false }));
    load();
  };

  const pollAll = async () => {
    setPolling({ all: true });
    try {
      const res = await api.post('/api/poll');
      const summary = res.data.map(r =>
        `${r.upstream}: ${r.success ? `${r.groups} 个分组` : r.error}`
      ).join('\n');
      alert(summary);
    } catch (err) {
      alert(`轮询失败: ${err.message}`);
    }
    setPolling({ all: false });
    load();
    onRefresh?.();
  };

  if (loading) return <div className="text-center py-10 text-gray-400">加载中...</div>;

  return (
    <div className="space-y-4">
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-700">
        ℹ️ 中转配置需通过服务器配置文件（config.yaml）管理，前端仅支持查看和手动轮询。
      </div>

      <div className="flex justify-between items-center">
        <h2 className="text-lg font-semibold text-gray-800">中转列表</h2>
        <button
          onClick={pollAll}
          disabled={polling.all}
          className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 transition"
        >
          {polling.all ? '轮询中...' : '🔄 全部轮询'}
        </button>
      </div>

      {upstreams.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm p-10 text-center text-gray-400">
          暂无中转配置，请在服务器 config.yaml 文件中添加
        </div>
      ) : (
        <div className="space-y-3">
          {upstreams.map(u => (
            <div key={u.id} className="bg-white rounded-xl shadow-sm p-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className={`w-3 h-3 rounded-full ${u.enabled ? 'bg-green-400' : 'bg-gray-300'}`} />
                  <div>
                    <div className="font-semibold text-gray-800">{u.name}</div>
                    <div className="text-sm text-gray-400 font-mono">{u.base_url}</div>
                    {u.email && (
                      <div className="text-xs text-gray-300 mt-0.5">
                        账号: {u.email}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-400 px-2 py-1 bg-gray-100 rounded">
                    {u.type} · 每 {u.poll_interval}s
                  </span>
                  {u.last_poll_at && (
                    <span className={`text-xs px-2 py-1 rounded ${
                      u.last_poll_status === 'success'
                        ? 'bg-green-50 text-green-600'
                        : 'bg-red-50 text-red-600'
                    }`}>
                      {u.last_poll_status === 'success' ? '✓ 成功' : '✗ 失败'}
                    </span>
                  )}
                  <button
                    onClick={() => pollOne(u.id)}
                    disabled={polling[u.id]}
                    className="px-3 py-1.5 text-sm bg-blue-50 text-blue-600 rounded hover:bg-blue-100 disabled:opacity-50 transition"
                  >
                    {polling[u.id] ? '...' : '轮询'}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default UpstreamList;
