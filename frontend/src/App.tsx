import { useEffect, useState } from 'react';
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
  Coins
} from 'lucide-react';

import { OverviewTab } from './components/OverviewTab';
import { RelativeValueTab } from './components/RelativeValueTab';
import { TermStructureTab } from './components/TermStructureTab';
import { BacktestTab } from './components/BacktestTab';
import { AlertsTab } from './components/AlertsTab';
import { CalendarTab } from './components/CalendarTab';
import { MethodologyTab } from './components/MethodologyTab';

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
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    checkHealth();
  }, []);

  const checkHealth = () => {
    setIsRefreshing(true);
    fetch('/api/health')
      .then(res => res.json())
      .then(data => {
        setHealth(data);
        setIsRefreshing(false);
      })
      .catch(() => {
        // Fallback for standalone demo mode
        setHealth({
          status: 'healthy',
          service: 'GoldLens Intelligence Engine',
          version: '1.0.0 (Local Engine)',
          supported_contracts: ['GOLDM', 'GOLDTEN', 'GOLDGUINEA', 'GOLDPETAL'],
          target_purity: 999
        });
        setIsRefreshing(false);
      });
  };

  const navItems = [
    { id: 'overview', label: 'Overview', icon: BarChart3, badge: null },
    { id: 'rv', label: 'Relative Value', icon: TrendingUp, badge: 'Active' },
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
            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-[#DCEBDD] text-[#3E7C59]">
              <CircleDot className="w-2.5 h-2.5 mr-1 animate-pulse" />
              CONNECTED
            </span>
          </div>

          <div className="space-y-1 text-[11px] text-[#7A7467]">
            <div className="flex justify-between">
              <span>Service:</span>
              <span className="font-medium text-[#2B2A26] truncate max-w-[120px]">{health?.service || 'FastAPI'}</span>
            </div>
            <div className="flex justify-between">
              <span>Version:</span>
              <span className="font-mono-numbers text-[#2B2A26]">{health?.version || 'v1.0.0'}</span>
            </div>
            <div className="flex justify-between">
              <span>Benchmark:</span>
              <span className="font-mono-numbers text-[#2B2A26] font-semibold">{health?.target_purity || 999} Fine Gold</span>
            </div>
          </div>

          <button 
            onClick={checkHealth}
            disabled={isRefreshing}
            className="w-full mt-3 py-1.5 bg-[#FAF6EC] hover:bg-[#EAE2CE] text-[#7A7467] hover:text-[#2B2A26] border border-[#E8DFCB] rounded-lg text-[10px] font-semibold flex items-center justify-center space-x-1 transition-all cursor-pointer"
          >
            <RefreshCw className={`w-3 h-3 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span>Sync Market Data</span>
          </button>
        </div>
      </aside>

      {/* Main Workspace Area */}
      <main className="flex-1 flex flex-col overflow-y-auto">
        {/* Sticky Header */}
        <header className="h-16 border-b border-[#E8DFCB] bg-[#FFFDF7]/90 backdrop-blur-md px-8 flex items-center justify-between sticky top-0 z-20">
          <div className="flex items-center space-x-3">
            <span className="text-xs uppercase tracking-wider font-bold text-[#7A7467]">MCX Bullion</span>
            <span className="text-[#E8DFCB]">/</span>
            <span className="text-sm font-bold text-[#2B2A26]">
              {navItems.find(n => n.id === activeTab)?.label}
            </span>
          </div>

          <div className="flex items-center space-x-3">
            <div className="hidden sm:flex items-center space-x-2 bg-[#F1E3BF] px-3 py-1 rounded-full border border-[#E5D2A0] text-xs font-semibold text-[#9C7320]">
              <Layers className="w-3.5 h-3.5" />
              <span>Target Standard: INR / gram @ 999 Fineness</span>
            </div>

            <div className="flex items-center space-x-1.5 bg-[#FAF6EC] px-3 py-1 rounded-full border border-[#E8DFCB] text-xs font-bold text-[#3E7C59]">
              <span className="w-2 h-2 rounded-full bg-[#3E7C59] animate-ping"></span>
              <span>LIVE READY</span>
            </div>
          </div>
        </header>

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
    </div>
  );
}

export default App;
