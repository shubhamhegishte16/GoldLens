import { useEffect, useState, useCallback } from 'react';
import { 
  BarChart3, 
  TrendingUp, 
  Activity, 
  FlaskConical, 
  Bell, 
  Calendar, 
  BookOpen, 
  CircleDot,
  Layers,
  RefreshCw,
  Coins,
  AlertCircle,
  Database,
  Upload
} from 'lucide-react';

import { OverviewTab } from './components/OverviewTab';
import { RelativeValueTab } from './components/RelativeValueTab';
import { TermStructureTab } from './components/TermStructureTab';
import { BacktestTab } from './components/BacktestTab';
import { AlertsTab } from './components/AlertsTab';
import { CalendarTab } from './components/CalendarTab';
import { MethodologyTab } from './components/MethodologyTab';
import { ImportModal } from './components/ImportModal';
import type { DataStatusResponse } from './types';

interface HealthData {
  status: string;
  service: string;
  version: string;
  supported_contracts: string[];
  target_purity: number;
}

export function App() {
  const [activeTab, setActiveTab] = useState('overview');
  const [health, setHealth] = useState<HealthData | null>(null);
  const [dataStatus, setDataStatus] = useState<DataStatusResponse | null>(null);
  const [isConnected, setIsConnected] = useState<boolean | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);

  const checkHealth = useCallback(async () => {
    setIsRefreshing(true);
    setConnectionError(null);
    try {
      const [healthRes, statusRes] = await Promise.all([
        fetch('/api/health'),
        fetch('/api/data/status'),
      ]);

      if (!healthRes.ok) {
        throw new Error(`Health check returned HTTP ${healthRes.status}`);
      }

      const healthData = await healthRes.json();
      setHealth(healthData);

      if (statusRes.ok) {
        const statusData = await statusRes.json();
        setDataStatus(statusData);
      }

      setIsConnected(true);
    } catch (err: any) {
      setIsConnected(false);
      setHealth(null);
      setDataStatus(null);
      setConnectionError(err?.message || 'Failed to connect to GoldLens backend at http://127.0.0.1:8000');
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    checkHealth();
  }, [checkHealth]);

  const navItems = [
    { id: 'overview', label: 'Overview', icon: BarChart3, badge: null },
    { id: 'rv', label: 'Relative Value', icon: TrendingUp, badge: 'Live API' },
    { id: 'term', label: 'Term Structure & Carry', icon: Activity, badge: null },
    { id: 'backtest', label: 'Backtest Lab', icon: FlaskConical, badge: null },
    { id: 'alerts', label: 'Alerts & Surveillance', icon: Bell, badge: '4' },
    { id: 'calendar', label: 'Contract Calendar', icon: Calendar, badge: null },
    { id: 'methodology', label: 'Methodology & QA', icon: BookOpen, badge: null },
  ];

  return (
    <div className="flex h-screen bg-[#FAF6EC] text-[#2B2A26] overflow-hidden">
      {/* Sidebar Navigation */}
      <aside className="w-64 bg-[#F3ECDA] border-r border-[#E8DFCB] flex flex-col justify-between p-4 flex-shrink-0">
        <div>
          {/* Logo & Platform Brand */}
          <div className="flex items-center space-x-3 px-2 py-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#B8892B] to-[#9C7320] flex items-center justify-center text-white shadow-md">
              <Coins className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="font-serif-title text-xl font-bold tracking-tight text-[#2B2A26]">GoldLens</h1>
              <p className="text-[11px] text-[#7A7467] font-medium tracking-wide">MCX DERIVATIVES ARBITRAGE</p>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="space-y-1.5">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                    isActive
                      ? 'bg-[#FFFDF7] text-[#B8892B] shadow-sm border border-[#E8DFCB]'
                      : 'text-[#7A7467] hover:text-[#2B2A26] hover:bg-[#EAE2CE]/70'
                  }`}
                >
                  <div className="flex items-center space-x-3">
                    <Icon className={`w-4 h-4 ${isActive ? 'text-[#B8892B]' : 'text-[#7A7467]'}`} />
                    <span>{item.label}</span>
                  </div>
                  {item.badge && (
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                      isActive 
                        ? 'bg-[#B8892B] text-white' 
                        : 'bg-[#EAE2CE] text-[#7A7467]'
                    }`}>
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Backend health & provenance status */}
        <div className="p-3.5 bg-[#FFFDF7] rounded-xl border border-[#E8DFCB] text-xs shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="font-semibold text-[#7A7467] text-[11px]">Engine Status</span>
            {isConnected ? (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-[#DCEBDD] text-[#3E7C59]">
                <CircleDot className="w-2.5 h-2.5 mr-1 animate-pulse" />
                CONNECTED
              </span>
            ) : isConnected === false ? (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-[#FDE8E8] text-[#DC2626]">
                <AlertCircle className="w-2.5 h-2.5 mr-1" />
                DISCONNECTED
              </span>
            ) : (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-[#FAF6EC] text-[#7A7467]">
                <RefreshCw className="w-2.5 h-2.5 mr-1 animate-spin" />
                CHECKING...
              </span>
            )}
          </div>

          <div className="space-y-1 text-[11px] text-[#7A7467]">
            <div className="flex justify-between">
              <span>Service:</span>
              <span className="font-medium text-[#2B2A26] truncate max-w-[120px]">{health?.service || (isConnected === false ? 'Offline' : 'FastAPI')}</span>
            </div>
            <div className="flex justify-between items-center">
              <span>Mode:</span>
              <span className={`font-bold ${dataStatus?.data_mode === 'ACTUAL' ? 'text-[#236338]' : 'text-[#B8892B]'}`}>
                {dataStatus?.data_mode === 'ACTUAL' ? 'ACTUAL MCX' : 'SAMPLE DEMO'}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Records:</span>
              <span className="font-mono font-medium text-[#2B2A26]">
                {dataStatus?.data_mode === 'ACTUAL' 
                  ? `${dataStatus?.total_actual_records ?? 0} Actual` 
                  : `${dataStatus?.total_sample_records ?? 0} Demo`}
              </span>
            </div>
            {dataStatus?.latest_trading_date && (
              <div className="flex justify-between">
                <span>Session:</span>
                <span className="font-mono text-[#2B2A26] font-medium">{dataStatus.latest_trading_date}</span>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-1.5 mt-3">
            <button 
              onClick={checkHealth}
              disabled={isRefreshing}
              className="py-1.5 bg-[#FAF6EC] hover:bg-[#EAE2CE] text-[#7A7467] hover:text-[#2B2A26] border border-[#E8DFCB] rounded-lg text-[10px] font-semibold flex items-center justify-center space-x-1 transition-all cursor-pointer"
              title="Sync and verify engine status"
            >
              <RefreshCw className={`w-3 h-3 ${isRefreshing ? 'animate-spin' : ''}`} />
              <span>Sync</span>
            </button>
            <button 
              onClick={() => setIsImportModalOpen(true)}
              className="py-1.5 bg-[#FAF6EC] hover:bg-[#EAE2CE] text-[#B8892B] border border-[#E8DFCB] rounded-lg text-[10px] font-bold flex items-center justify-center space-x-1 transition-all cursor-pointer"
              title="Import MCX CSV or refresh latest session"
            >
              <Upload className="w-3 h-3 text-[#B8892B]" />
              <span>Import CSV</span>
            </button>
          </div>
        </div>
      </aside>

      {/* Main Workspace Area */}
      <main className="flex-1 flex flex-col overflow-y-auto">
        {/* Sticky Header with generous padding */}
        <header className="min-h-18 py-3.5 border-b border-[#E8DFCB] bg-[#FFFDF7]/95 backdrop-blur-md px-8 pr-10 sm:px-10 sm:pr-12 lg:px-12 lg:pr-14 flex items-center justify-between sticky top-0 z-20">
          <div className="flex items-center space-x-2.5 flex-shrink-0">
            <span className="text-xs uppercase tracking-wider font-bold text-[#7A7467]">MCX Bullion</span>
            <span className="text-[#E8DFCB]">/</span>
            <span className="text-sm font-bold text-[#2B2A26]">
              {navItems.find(n => n.id === activeTab)?.label}
            </span>
          </div>

          <div className="flex items-center space-x-3 sm:space-x-4 flex-shrink-0">
            <div className="hidden md:flex items-center space-x-2 bg-[#F1E3BF] px-3.5 py-1.5 rounded-full border border-[#E5D2A0] text-xs font-semibold text-[#9C7320]">
              <Layers className="w-3.5 h-3.5" />
              <span>Target Standard: INR / gram @ 999 Fineness</span>
            </div>

            {/* Dynamic Data Mode Badge */}
            {dataStatus?.data_mode === 'ACTUAL' ? (
              <div 
                className="flex items-center space-x-2 bg-[#DCEBDD] pl-3 pr-1.5 py-1 rounded-full border border-[#A6CDB0] text-xs font-bold text-[#236338]"
                title="Active dataset is official MCX end-of-day Bhavcopy settlement prices"
              >
                <Database className="w-3.5 h-3.5 text-[#2E7D32]" />
                <span>ACTUAL MCX (EOD)</span>
                {dataStatus.latest_trading_date && (
                  <span className="font-mono text-[11px] bg-white border border-[#A6CDB0] px-2 py-0.5 rounded-full text-[#236338] font-bold shadow-2xs">
                    {dataStatus.latest_trading_date}
                  </span>
                )}
                {dataStatus.is_stale && (
                  <span className="bg-[#FEF3C7] text-[#92400E] px-1.5 py-0.5 rounded text-[10px] font-semibold" title="Exchange session is more than 3 business days old">
                    STALE
                  </span>
                )}
              </div>
            ) : (
              <div 
                className="flex items-center space-x-1.5 bg-[#FFF4DC] px-3.5 py-1.5 rounded-full border border-[#F3CE7A] text-xs font-bold text-[#B8892B]"
                title="Active dataset is a seeded calendar-accurate sample dataset for offline demo"
              >
                <Database className="w-3.5 h-3.5" />
                <span>SAMPLE DATA (DEMO)</span>
              </div>
            )}

            {/* Import / Sync Button */}
            <button
              onClick={() => setIsImportModalOpen(true)}
              className="flex items-center space-x-1.5 bg-[#B8892B] hover:bg-[#9C7320] text-white px-4 py-1.5 rounded-full text-xs font-bold shadow-xs transition-all cursor-pointer"
              title="Manage MCX Bhavcopy Data & Ingestion"
            >
              <Upload className="w-3.5 h-3.5 text-white" />
              <span>Import / Sync</span>
            </button>
          </div>
        </header>

        {/* Backend offline warning banner */}
        {isConnected === false && (
          <div className="bg-[#FEF2F2] border-b border-[#FCA5A5] px-8 py-3 text-xs text-[#991B1B] flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0 text-[#DC2626]" />
              <span>
                <strong>Backend Disconnected:</strong> {connectionError || 'Could not connect to FastAPI server at http://127.0.0.1:8000.'} Charts require the backend service to load real data.
              </span>
            </div>
            <button
              onClick={checkHealth}
              className="px-3 py-1 bg-[#DC2626] text-white rounded font-medium hover:bg-[#B91C1C] transition-colors cursor-pointer text-[11px]"
            >
              Retry Connection
            </button>
          </div>
        )}

        {/* Dynamic Tab Body */}
        <div className="p-8 max-w-7xl mx-auto w-full pb-16">
          {activeTab === 'overview' && (
            <OverviewTab 
              onSelectTab={(tab) => setActiveTab(tab)} 
              onRefresh={checkHealth}
            />
          )}
          {activeTab === 'rv' && <RelativeValueTab />}
          {activeTab === 'term' && <TermStructureTab />}
          {activeTab === 'backtest' && <BacktestTab />}
          {activeTab === 'alerts' && <AlertsTab onSelectTab={(tab) => setActiveTab(tab)} />}
          {activeTab === 'calendar' && <CalendarTab />}
          {activeTab === 'methodology' && <MethodologyTab />}
        </div>
      </main>

      {/* MCX Bhavcopy Ingestion & Refresh Modal */}
      <ImportModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        dataStatus={dataStatus}
        onSuccess={() => {
          checkHealth();
        }}
      />
    </div>
  );
}

export default App;
