import React, { useState, useCallback } from 'react';
import Dashboard from './components/Dashboard';
import UpstreamList from './components/UpstreamList';
import ChangeHistory from './components/ChangeHistory';
import NotificationSettings from './components/NotificationSettings';

const TABS = [
  { key: 'dashboard', label: '仪表盘', icon: '📊' },
  { key: 'upstreams', label: '中转管理', icon: '🔗' },
  { key: 'changes', label: '变动记录', icon: '📈' },
  { key: 'notifications', label: '通知设置', icon: '🔔' },
];

function App() {
  const [tab, setTab] = useState('dashboard');
  const [refreshKey, setRefreshKey] = useState(0);

  const refresh = useCallback(() => setRefreshKey(k => k + 1), []);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <h1 className="text-xl font-bold text-gray-800">
            🔍 中转监控系统
          </h1>
          <button
            onClick={refresh}
            className="px-3 py-1.5 text-sm bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition"
          >
            🔄 刷新
          </button>
        </div>
      </header>

      {/* Tabs */}
      <nav className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 flex gap-1">
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition ${
                tab === t.key
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </div>
      </nav>

      {/* Content */}
      <main className="max-w-7xl mx-auto px-4 py-6">
        {tab === 'dashboard' && <Dashboard key={refreshKey} />}
        {tab === 'upstreams' && <UpstreamList key={refreshKey} onRefresh={refresh} />}
        {tab === 'changes' && <ChangeHistory key={refreshKey} />}
        {tab === 'notifications' && <NotificationSettings key={refreshKey} />}
      </main>
    </div>
  );
}

export default App;
