import React, { useState } from 'react';
import api from '../api';

function AddUpstream({ onClose, onAdded, editData }) {
  const isEdit = !!editData;
  const [form, setForm] = useState({
    name: editData?.name || '',
    base_url: editData?.base_url || '',
    type: editData?.type || 'sub2api',
    email: editData?.email || '',
    password: editData?.password || '',
    poll_interval: editData?.poll_interval || 60,
  });
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [saving, setSaving] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const update = (key, value) => {
    setForm(f => ({ ...f, [key]: value }));
    setTestResult(null);
  };

  const testConnection = async () => {
    if (!form.base_url || !form.email || !form.password) return;
    setTesting(true);
    setTestResult(null);
    try {
      const res = await api.post('/api/test', {
        base_url: form.base_url,
        type: form.type,
        email: form.email,
        password: form.password,
      });
      if (res.data.success) {
        const groups = Array.isArray(res.data.data)
          ? res.data.data
          : res.data.data?.data || [];
        setTestResult({
          success: true,
          message: `登录成功，发现 ${groups.length} 个分组`,
          groups,
        });
      } else {
        setTestResult({ success: false, message: res.data.error });
      }
    } catch (err) {
      setTestResult({
        success: false,
        message: err.response?.data?.error || err.message,
      });
    }
    setTesting(false);
  };

  const submit = async () => {
    if (!form.name || !form.base_url) return;
    setSaving(true);
    try {
      if (isEdit) {
        await api.put(`/api/upstreams/${editData.id}`, form);
      } else {
        await api.post('/api/upstreams', form);
      }
      onAdded();
    } catch (err) {
      alert(err.response?.data?.error || err.message);
    }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 p-6">
        <h3 className="text-lg font-bold text-gray-800 mb-4">
          {isEdit ? '编辑中转' : '添加中转'}
        </h3>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">名称</label>
            <input
              type="text"
              value={form.name}
              onChange={e => update('name', e.target.value)}
              placeholder="例：元宇宙中转"
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Base URL</label>
            <input
              type="text"
              value={form.base_url}
              onChange={e => update('base_url', e.target.value)}
              placeholder="https://example.com"
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none font-mono text-sm"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">类型</label>
              <select
                value={form.type}
                onChange={e => update('type', e.target.value)}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              >
                <option value="sub2api">sub2api</option>
                <option value="new-api">new-api</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">轮询间隔 (秒)</label>
              <input
                type="number"
                value={form.poll_interval}
                onChange={e => update('poll_interval', parseInt(e.target.value) || 60)}
                min="10"
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              账号 <span className="text-gray-400">{form.type === 'new-api' ? '(用户名/邮箱)' : '(邮箱)'}</span>
            </label>
            <input
              type="text"
              value={form.email}
              onChange={e => update('email', e.target.value)}
              placeholder={form.type === 'new-api' ? '用户名或邮箱' : 'your@email.com'}
              autoComplete="off"
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">密码</label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={form.password}
                onChange={e => update('password', e.target.value)}
                placeholder={isEdit ? '留空表示不修改' : '登录密码'}
                autoComplete="new-password"
                className="w-full px-3 py-2 pr-16 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
              />
              <button
                type="button"
                onClick={() => setShowPassword(s => !s)}
                className="absolute right-2 top-1/2 -translate-y-1/2 px-2 py-1 text-xs text-gray-400 hover:text-gray-600"
              >
                {showPassword ? '隐藏' : '显示'}
              </button>
            </div>
            <p className="mt-1 text-xs text-gray-400">系统将用账号密码自动登录获取 token，过期后自动重新登录</p>
          </div>

          {/* Test Result */}
          {testResult && (
            <div className={`p-3 rounded-lg text-sm ${
              testResult.success ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
            }`}>
              {testResult.message}
              {testResult.groups && testResult.groups.length > 0 && (
                <div className="mt-2 text-xs">
                  分组预览: {testResult.groups.slice(0, 5).map(g =>
                    g.name || g.group_name || g.group || JSON.stringify(g)
                  ).join(', ')}
                  {testResult.groups.length > 5 && ` ...共 ${testResult.groups.length} 个`}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex justify-between mt-6">
          <button
            onClick={testConnection}
            disabled={testing || !form.base_url || !form.email || !form.password}
            className="px-4 py-2 text-sm bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 disabled:opacity-50 transition"
          >
            {testing ? '测试中...' : '🔌 测试登录'}
          </button>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition"
            >
              取消
            </button>
            <button
              onClick={submit}
              disabled={saving || !form.name || !form.base_url}
              className="px-4 py-2 text-sm bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 transition"
            >
              {saving ? '保存中...' : '保存'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default AddUpstream;
