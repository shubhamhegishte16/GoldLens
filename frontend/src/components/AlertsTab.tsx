import React, { useState } from 'react';
import { 
  Bell, 
  Clock, 
  Settings2, 
  ExternalLink,
  ShieldAlert
} from 'lucide-react';
import { MOCK_ALERTS } from '../mockData';
import type { SystemAlert } from '../types';

interface AlertsTabProps {
  onSelectTab: (tab: string) => void;
}

export const AlertsTab: React.FC<AlertsTabProps> = ({ onSelectTab }) => {
  const [filterSeverity, setFilterSeverity] = useState<string>('all');
  const [alerts, setAlerts] = useState<SystemAlert[]>(MOCK_ALERTS);

  const [ruleZScore, setRuleZScore] = useState(true);
  const [ruleTender, setRuleTender] = useState(true);
  const [ruleVolume, setRuleVolume] = useState(false);

  const filteredAlerts = alerts.filter(a => {
    if (filterSeverity === 'all') return true;
    return a.severity === filterSeverity;
  });

  const handleDismiss = (id: string) => {
    setAlerts(alerts.filter(a => a.id !== id));
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-[#FFFDF7] p-6 rounded-2xl border border-[#E8DFCB] shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center space-x-2">
              <Bell className="w-5 h-5 text-[#B8892B]" />
              <h2 className="font-serif-title text-xl font-bold text-[#2B2A26]">
                Real-Time Surveillance & Arbitrage Alerts
              </h2>
            </div>
            <p className="text-xs text-[#7A7467] mt-1">
              Automated anomaly detection across MCX gold futures, calendar roll windows, and delivery avoid zones.
            </p>
          </div>

          <div className="flex items-center space-x-2">
            {['all', 'high', 'medium', 'low'].map(s => (
              <button
                key={s}
                onClick={() => setFilterSeverity(s)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition-all cursor-pointer ${
                  filterSeverity === s
                    ? 'bg-[#B8892B] text-white shadow-sm'
                    : 'bg-[#FAF6EC] text-[#7A7467] hover:text-[#2B2A26] border border-[#E8DFCB]'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Rules Configurator & Active Alerts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Active Alerts List (2 Cols) */}
        <div className="lg:col-span-2 space-y-3">
          <div className="flex items-center justify-between text-xs text-[#7A7467] px-1">
            <span>Showing {filteredAlerts.length} Active System Notifications</span>
            <span className="text-[11px] text-[#3E7C59] font-medium flex items-center">
              <span className="w-2 h-2 rounded-full bg-[#3E7C59] mr-1.5 animate-pulse"></span>
              Surveillance Engine Active
            </span>
          </div>

          {filteredAlerts.length === 0 ? (
            <div className="bg-[#FFFDF7] p-12 text-center rounded-xl border border-[#E8DFCB] text-xs text-[#7A7467]">
              No active alerts matching filter. All monitored spreads are within normal bands.
            </div>
          ) : (
            filteredAlerts.map(alert => (
              <div 
                key={alert.id}
                className="bg-[#FFFDF7] p-5 rounded-xl border border-[#E8DFCB] shadow-sm hover:border-[#B8892B] transition-all flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center space-x-2">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                        alert.severity === 'high'
                          ? 'bg-[#F3DDD5] text-[#B5533C]'
                          : alert.severity === 'medium'
                            ? 'bg-[#FCF4DD] text-[#C9962E]'
                            : 'bg-[#DCEBDD] text-[#3E7C59]'
                      }`}>
                        {alert.type}
                      </span>
                      {alert.contractPair && (
                        <span className="text-xs font-mono-numbers font-bold text-[#2B2A26]">
                          {alert.contractPair}
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] text-[#A39D8F] flex items-center">
                      <Clock className="w-3 h-3 mr-1" />
                      {alert.time}
                    </span>
                  </div>

                  <h4 className="font-serif-title text-base font-bold text-[#2B2A26] mb-1">
                    {alert.title}
                  </h4>
                  <p className="text-xs text-[#7A7467] leading-relaxed mb-3">
                    {alert.description}
                  </p>
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-[#F3ECDA] text-xs">
                  <span className="font-mono-numbers text-[11px] font-bold text-[#B8892B] bg-[#FBF6E9] px-2 py-0.5 rounded border border-[#E8DFCB]">
                    {alert.metric}
                  </span>

                  <div className="flex items-center space-x-2">
                    {alert.type === 'OPPORTUNITY' && (
                      <button
                        onClick={() => onSelectTab('rv')}
                        className="px-3 py-1 bg-[#B8892B] hover:bg-[#9C7320] text-white text-xs font-semibold rounded-lg transition-all flex items-center space-x-1 cursor-pointer"
                      >
                        <span>Investigate</span>
                        <ExternalLink className="w-3 h-3" />
                      </button>
                    )}
                    <button
                      onClick={() => handleDismiss(alert.id)}
                      className="px-3 py-1 bg-[#FAF6EC] hover:bg-[#EAE2CE] text-[#7A7467] border border-[#E8DFCB] text-xs font-semibold rounded-lg transition-all cursor-pointer"
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Surveillance Rules & Parameters Sidebar (1 Col) */}
        <div className="space-y-4">
          <div className="bg-[#FFFDF7] p-5 rounded-xl border border-[#E8DFCB] shadow-sm">
            <div className="flex items-center space-x-2 mb-4 pb-3 border-b border-[#F3ECDA]">
              <Settings2 className="w-4 h-4 text-[#B8892B]" />
              <h3 className="font-serif-title text-sm font-bold text-[#2B2A26]">
                Surveillance Rules Engine
              </h3>
            </div>

            <div className="space-y-4 text-xs">
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-semibold text-[#2B2A26] block">Z-Score Dislocation (&gt; 2.0σ)</span>
                  <span className="text-[#7A7467] text-[11px]">Triggers on 95.4% outlier spreads</span>
                </div>
                <input 
                  type="checkbox" 
                  checked={ruleZScore} 
                  onChange={(e) => setRuleZScore(e.target.checked)}
                  className="w-4 h-4 accent-[#B8892B] cursor-pointer"
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <span className="font-semibold text-[#2B2A26] block">Tender Period Warning (&lt; 5d)</span>
                  <span className="text-[#7A7467] text-[11px]">Physical delivery liquidity avoid-zone</span>
                </div>
                <input 
                  type="checkbox" 
                  checked={ruleTender} 
                  onChange={(e) => setRuleTender(e.target.checked)}
                  className="w-4 h-4 accent-[#B8892B] cursor-pointer"
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <span className="font-semibold text-[#2B2A26] block">Volume Surge (&gt; 95th %ile)</span>
                  <span className="text-[#7A7467] text-[11px]">Sudden retail or block flow alerts</span>
                </div>
                <input 
                  type="checkbox" 
                  checked={ruleVolume} 
                  onChange={(e) => setRuleVolume(e.target.checked)}
                  className="w-4 h-4 accent-[#B8892B] cursor-pointer"
                />
              </div>
            </div>
          </div>

          {/* Delivery Avoid-Zone Methodology Card */}
          <div className="bg-[#FFFDF7] p-5 rounded-xl border border-[#E8DFCB] shadow-sm">
            <div className="flex items-center space-x-2 text-xs font-bold text-[#B5533C] mb-2">
              <ShieldAlert className="w-4 h-4" />
              <span>MCX Tender Period Rule</span>
            </div>
            <p className="text-xs text-[#7A7467] leading-relaxed">
              In MCX Gold contracts, the 5 business days preceding expiry mark the mandatory <strong>Tender Period</strong>.
              During this window, open positions can result in physical delivery obligations with severe margin step-ups (from 10% to 25%+).
              The GoldLens engine strictly mandates rolling or exiting before this window.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
