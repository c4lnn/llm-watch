import React, { useCallback, useEffect, useState } from 'react';
import api from '../api';

function channelLabel(type) {
  return type === 'bark' ? 'Bark (iOS)' : type;
}

function normalizeConfig(config) {
  if (!config) return {};
  if (typeof config === 'string') {
    try {
      return JSON.parse(config);
    } catch {
      return {};
    }
  }
  return config;
}

function configSummary(channel) {
  const config = normalizeConfig(channel.config);
  if (channel.type === 'bark') {
    return [config.server, config.key ? `Key ${config.key}` : null].filter(Boolean).join(' / ');
  }
  return channel.id;
}

function numberInputValue(value) {
  return value === null || value === undefined ? '' : String(value);
}

function NotificationSettings() {
  const [configs, setConfigs] = useState([]);
  const [alertSettings, setAlertSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [testingId, setTestingId] = useState(null);
  const [savingAlerts, setSavingAlerts] = useState(false);

  const load = useCallback(async () => {
    try {
      const [notificationRes, alertRes] = await Promise.all([
        api.get('/api/notifications'),
        api.get('/api/balance-alerts/settings'),
      ]);
      setConfigs(notificationRes.data);
      setAlertSettings(alertRes.data);
    } catch (err) {
      alert(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const toggle = async (channel) => {
    try {
      await api.put(`/api/notifications/${channel.id}`, { enabled: !channel.enabled });
      load();
    } catch (err) {
      alert(err.response?.data?.error || err.message);
    }
  };

  const updateGlobalAlerts = async (patch) => {
    setSavingAlerts(true);
    try {
      const res = await api.put('/api/balance-alerts/settings', patch);
      setAlertSettings(res.data);
    } catch (err) {
      alert(err.response?.data?.error || err.message);
    } finally {
      setSavingAlerts(false);
    }
  };

  const updateUpstreamAlerts = async (upstreamId, patch) => {
    setSavingAlerts(true);
    try {
      const res = await api.put(`/api/balance-alerts/upstreams/${upstreamId}`, patch);
      setAlertSettings(res.data);
    } catch (err) {
      alert(err.response?.data?.error || err.message);
    } finally {
      setSavingAlerts(false);
    }
  };

  const clearUpstreamAlerts = async (upstreamId) => {
    setSavingAlerts(true);
    try {
      const res = await api.delete(`/api/balance-alerts/upstreams/${upstreamId}`);
      setAlertSettings(res.data);
    } catch (err) {
      alert(err.response?.data?.error || err.message);
    } finally {
      setSavingAlerts(false);
    }
  };

  const testNotify = async (id) => {
    setTestingId(id);
    try {
      const res = await api.post('/api/notifications/test', { id });
      alert(res.data.success ? '发送成功！' : `发送失败: ${res.data.error}`);
    } catch (err) {
      alert(`发送失败: ${err.response?.data?.error || err.message}`);
    } finally {
      setTestingId(null);
    }
  };

  if (loading) return <div className="text-center py-10 text-gray-400">加载中...</div>;

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-semibold text-gray-800">通知渠道</h2>
      </div>

      {configs.length === 0 ? (
        <div className="bg-white rounded-lg shadow-sm p-10 text-center text-gray-400">
          暂无通知渠道，请在 config.yaml 的 notifications 中配置
        </div>
      ) : (
        <div className="space-y-3">
          {configs.map(channel => (
            <div key={channel.id} className="bg-white rounded-lg shadow-sm p-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-center gap-3">
                <span className={`h-3 w-3 flex-none rounded-full ${channel.enabled ? 'bg-green-400' : 'bg-gray-300'}`} />
                <div className="min-w-0">
                  <div className="font-medium text-gray-800">
                    {channelLabel(channel.type)}
                  </div>
                  <div className="text-sm text-gray-400 font-mono break-all">
                    {configSummary(channel) || channel.id}
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 sm:flex-nowrap">
                <button
                  onClick={() => testNotify(channel.id)}
                  disabled={testingId === channel.id}
                  className="px-3 py-1.5 text-sm bg-gray-100 text-gray-600 rounded transition hover:bg-gray-200 disabled:opacity-50"
                >
                  {testingId === channel.id ? '发送中...' : '测试发送'}
                </button>
                <button
                  onClick={() => toggle(channel)}
                  className={`px-3 py-1.5 text-sm rounded transition ${
                    channel.enabled
                      ? 'bg-yellow-50 text-yellow-600 hover:bg-yellow-100'
                      : 'bg-green-50 text-green-600 hover:bg-green-100'
                  }`}
                >
                  {channel.enabled ? '禁用' : '启用'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {alertSettings && (
        <div className="space-y-3">
          <div className="flex justify-between items-center pt-2">
            <h2 className="text-lg font-semibold text-gray-800">余额提醒</h2>
          </div>

          <div className="bg-white rounded-lg shadow-sm p-5 space-y-4">
            <div className="grid gap-4 md:grid-cols-4">
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={alertSettings.global.enabled}
                  disabled={savingAlerts}
                  onChange={e => updateGlobalAlerts({ enabled: e.target.checked })}
                />
                启用余额提醒
              </label>

              <label className="text-sm text-gray-700">
                <span className="block mb-1">默认最低额度</span>
                <input
                  type="number"
                  min="0"
                  step="0.0001"
                  value={numberInputValue(alertSettings.global.default_threshold)}
                  disabled={savingAlerts}
                  onChange={e => updateGlobalAlerts({ default_threshold: e.target.value === '' ? null : Number(e.target.value) })}
                  className="w-full px-3 py-2 border rounded outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="未设置"
                />
              </label>

              <label className="text-sm text-gray-700">
                <span className="block mb-1">重复提醒间隔(分钟)</span>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={numberInputValue(alertSettings.global.cooldown_minutes)}
                  disabled={savingAlerts}
                  onChange={e => updateGlobalAlerts({ cooldown_minutes: Number(e.target.value || 0) })}
                  className="w-full px-3 py-2 border rounded outline-none focus:ring-2 focus:ring-blue-500"
                />
              </label>

              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={alertSettings.global.notify_recovery}
                  disabled={savingAlerts}
                  onChange={e => updateGlobalAlerts({ notify_recovery: e.target.checked })}
                />
                恢复正常时通知
              </label>
            </div>
          </div>

          {alertSettings.upstreams.length === 0 ? (
            <div className="bg-white rounded-lg shadow-sm p-10 text-center text-gray-400">
              暂无中转配置，无法设置单独阈值
            </div>
          ) : (
            <div className="space-y-3">
              {alertSettings.upstreams.map(upstream => (
                <div key={upstream.id} className="bg-white rounded-lg shadow-sm p-5 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <div className="font-medium text-gray-800">{upstream.name}</div>
                    <div className="text-sm text-gray-400">
                      {upstream.type} · 当前阈值: {upstream.threshold == null ? '未设置' : upstream.threshold}
                      {upstream.threshold_source === 'override' ? '（单独设置）' : '（默认）'}
                    </div>
                    {upstream.state && (
                      <div className="text-xs text-gray-400">
                        状态: {upstream.state.state === 'low' ? '低余额' : '正常'}
                        {upstream.state.last_value != null ? ` · 上次值: ${upstream.state.last_value}` : ''}
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <label className="flex items-center gap-2 text-sm text-gray-700">
                      <input
                        type="checkbox"
                        checked={upstream.enabled}
                        disabled={savingAlerts}
                        onChange={e => updateUpstreamAlerts(upstream.id, { enabled: e.target.checked })}
                      />
                      启用
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="0.0001"
                      value={numberInputValue(upstream.override?.threshold)}
                      disabled={savingAlerts}
                      onChange={e => updateUpstreamAlerts(upstream.id, { threshold: e.target.value === '' ? null : Number(e.target.value) })}
                      className="w-full sm:w-36 px-3 py-2 border rounded outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="使用默认"
                    />
                    <button
                      onClick={() => clearUpstreamAlerts(upstream.id)}
                      disabled={savingAlerts || !upstream.override}
                      className="px-3 py-2 text-sm bg-gray-100 text-gray-600 rounded transition hover:bg-gray-200 disabled:opacity-50"
                    >
                      清除单独设置
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default NotificationSettings;
