import React, { useState, useEffect } from 'react';
import api from '../api';

const BARK_TYPE = {
  type: 'bark',
  label: 'Bark (iOS)',
  fields: [
    { key: 'server', label: '服务地址', placeholder: 'https://api.day.app' },
    { key: 'key', label: '推送 Key', placeholder: 'your-bark-key' },
  ],
};

function NotificationSettings() {
  const [configs, setConfigs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({});
  const [testing, setTesting] = useState(false);

  const load = () => {
    api.get('/api/notifications').then(r => {
      setConfigs(r.data);
      setLoading(false);
    });
  };

  useEffect(load, []);

  const add = async () => {
    try {
      await api.post('/api/notifications', { type: 'bark', config: form });
      setShowAdd(false);
      setForm({});
      load();
    } catch (err) {
      alert(err.response?.data?.error || err.message);
    }
  };

  const toggle = async (id, enabled) => {
    await api.put(`/api/notifications/${id}`, { enabled: !enabled });
    load();
  };

  const remove = async (id) => {
    if (!window.confirm('确定删除此通知渠道？')) return;
    await api.delete(`/api/notifications/${id}`);
    load();
  };

  const testNotify = async () => {
    setTesting(true);
    try {
      const res = await api.post('/api/notifications/test', {
        type: 'bark',
        config: form,
      });
      alert(res.data.success ? '发送成功！' : `发送失败: ${res.data.error}`);
    } catch (err) {
      alert(`发送失败: ${err.response?.data?.error || err.message}`);
    }
    setTesting(false);
  };

  if (loading) return <div className="text-center py-10 text-gray-400">加载中...</div>;

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-semibold text-gray-800">通知渠道</h2>
        <button
          onClick={() => setShowAdd(true)}
          className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition"
        >
          + 添加通知
        </button>
      </div>

      {/* Existing configs */}
      {configs.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm p-10 text-center text-gray-400">
          暂无通知渠道，添加后可在倍率变动时收到推送
        </div>
      ) : (
        <div className="space-y-3">
          {configs.map(c => (
            <div key={c.id} className="bg-white rounded-xl shadow-sm p-5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className={`w-3 h-3 rounded-full ${c.enabled ? 'bg-green-400' : 'bg-gray-300'}`} />
                <div>
                  <div className="font-medium text-gray-800">
                    {c.type === 'bark' ? 'Bark (iOS)' : c.type}
                  </div>
                  <div className="text-sm text-gray-400 font-mono">
                    {(() => {
                      try {
                        const cfg = JSON.parse(c.config);
                        return cfg.server || cfg.key?.substring(0, 20) || '...';
                      } catch { return '...'; }
                    })()}
                  </div>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => toggle(c.id, c.enabled)}
                  className={`px-3 py-1.5 text-sm rounded transition ${
                    c.enabled
                      ? 'bg-yellow-50 text-yellow-600 hover:bg-yellow-100'
                      : 'bg-green-50 text-green-600 hover:bg-green-100'
                  }`}
                >
                  {c.enabled ? '禁用' : '启用'}
                </button>
                <button
                  onClick={() => remove(c.id)}
                  className="px-3 py-1.5 text-sm bg-red-50 text-red-600 rounded hover:bg-red-100 transition"
                >
                  删除
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add Modal */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 p-6">
            <h3 className="text-lg font-bold text-gray-800 mb-4">添加 Bark 通知</h3>

            <div className="space-y-4">
              {BARK_TYPE.fields.map(f => (
                <div key={f.key}>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{f.label}</label>
                  <input
                    type="text"
                    value={form[f.key] || ''}
                    onChange={e => setForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                    placeholder={f.placeholder}
                    className="w-full px-3 py-2 border rounded-lg outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                  />
                </div>
              ))}
            </div>

            <div className="flex justify-between mt-6">
              <button
                onClick={testNotify}
                disabled={testing}
                className="px-4 py-2 text-sm bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 disabled:opacity-50 transition"
              >
                {testing ? '发送中...' : '📨 测试发送'}
              </button>
              <div className="flex gap-2">
                <button
                  onClick={() => { setShowAdd(false); setForm({}); }}
                  className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition"
                >
                  取消
                </button>
                <button
                  onClick={add}
                  className="px-4 py-2 text-sm bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition"
                >
                  保存
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default NotificationSettings;
