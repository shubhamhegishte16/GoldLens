import React from 'react';
import { 
  ArrowUpRight, 
  ArrowDownRight, 
  Layers, 
  ShieldCheck, 
  Zap
} from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { MOCK_TICKERS } from '../mockData';

interface OverviewTabProps {
  onSelectTab: (tab: string) => void;
  onRefresh?: () => void;
}

export const OverviewTab: React.FC<OverviewTabProps> = ({ onSelectTab }) => {
  // Volume & OI chart data
  const volumeData = MOCK_TICKERS.map(t => ({
    name: t.symbol,
    Volume: t.volume,
    OI: t.oi,
  }));

  // Matrix calculation: difference in normalized prices (row - col) in INR/g
  const symbols = ['GOLDTEN', 'GOLDPETAL', 'GOLDM', 'GOLDGUINEA'];
  const tickerMap = new Map(MOCK_TICKERS.map(t => [t.symbol, t.normPrice]));

  return (
    <div className="space-y-6">
      {/* Top Intelligence Stats Banner */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-[#FFFDF7] p-4 rounded-xl border border-[#E8DFCB] shadow-sm">
          <div className="flex items-center justify-between text-xs text-[#7A7467] mb-1">
            <span className="font-medium">999 Spot Benchmark</span>
            <span className="text-[#3E7C59] font-semibold flex items-center">
              <ArrowUpRight className="w-3.5 h-3.5 mr-0.5" /> +0.45%
            </span>
          </div>
          <div className="text-2xl font-bold font-mono-numbers text-[#2B2A26]">
            ₹8,478.00 <span className="text-xs font-normal text-[#7A7467]">/ gram</span>
          </div>
          <div className="text-[11px] text-[#A39D8F] mt-1">Equivalent to ₹84,780 / 10g fine gold</div>
        </div>

        <div className="bg-[#FFFDF7] p-4 rounded-xl border border-[#E8DFCB] shadow-sm">
          <div className="flex items-center justify-between text-xs text-[#7A7467] mb-1">
            <span className="font-medium">Term Structure Regime</span>
            <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-[#DCEBDD] text-[#3E7C59]">CONTANGO</span>
          </div>
          <div className="text-2xl font-bold font-mono-numbers text-[#2B2A26]">
            +5.92% <span className="text-xs font-normal text-[#7A7467]">annualized carry</span>
          </div>
          <div className="text-[11px] text-[#A39D8F] mt-1">Near to Far forward curve slope</div>
        </div>

        <div className="bg-[#FFFDF7] p-4 rounded-xl border border-[#E8DFCB] shadow-sm">
          <div className="flex items-center justify-between text-xs text-[#7A7467] mb-1">
            <span className="font-medium">Statistical Dislocation</span>
            <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-[#F1E3BF] text-[#9C7320]">1 ACTIVE</span>
          </div>
          <div className="text-2xl font-bold font-mono-numbers text-[#B8892B]">
            -2.31 σ <span className="text-xs font-normal text-[#7A7467]">Z-Score</span>
          </div>
          <div className="text-[11px] text-[#A39D8F] mt-1">GOLDTEN vs GOLDPETAL (20D window)</div>
        </div>

        <div className="bg-[#FFFDF7] p-4 rounded-xl border border-[#E8DFCB] shadow-sm">
          <div className="flex items-center justify-between text-xs text-[#7A7467] mb-1">
            <span className="font-medium">Total Open Interest</span>
            <span className="text-[10px] font-semibold text-[#7A7467]">MCX BULLION</span>
          </div>
          <div className="text-2xl font-bold font-mono-numbers text-[#2B2A26]">
            296,100 <span className="text-xs font-normal text-[#7A7467]">lots</span>
          </div>
          <div className="text-[11px] text-[#A39D8F] mt-1">4 Active Contracts Across 3 Expiries</div>
        </div>
      </div>

      {/* Actionable Signal Card */}
      <div className="bg-gradient-to-r from-[#FFFDF7] to-[#FAF3E0] p-5 rounded-2xl border border-[#E0D2B4] shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-start space-x-3.5">
          <div className="p-2.5 rounded-xl bg-[#B8892B] text-white shadow-sm mt-0.5">
            <Zap className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="px-2 py-0.5 rounded text-[11px] font-bold tracking-wider uppercase bg-[#B8892B] text-white">
                STAT ARB TRIGGER
              </span>
              <span className="text-xs font-semibold text-[#7A7467]">GOLDTEN vs GOLDPETAL</span>
            </div>
            <h3 className="font-serif-title text-lg font-bold text-[#2B2A26] mt-0.5">
              Normalized Spread Dislocation (-2.31σ | ₹-14.00/g basis)
            </h3>
            <p className="text-xs text-[#7A7467] max-w-2xl mt-0.5">
              GOLDPETAL is trading at a ₹14.00/g premium to GOLDTEN after purity and unit normalization. Rolling 20-day mean is -₹14.20/g. Net target edge is ₹7.20/g after accounting for 8 bps round-trip friction.
            </p>
          </div>
        </div>
        <div className="flex items-center space-x-2 self-end md:self-auto">
          <button 
            onClick={() => onSelectTab('rv')}
            className="px-4 py-2 bg-[#B8892B] hover:bg-[#9C7320] text-white text-xs font-semibold rounded-lg shadow-sm transition-all flex items-center space-x-1.5 cursor-pointer"
          >
            <span>Analyze Spread</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </button>
          <button 
            onClick={() => onSelectTab('backtest')}
            className="px-4 py-2 bg-[#FAF6EC] hover:bg-[#EAE2CE] text-[#2B2A26] border border-[#E8DFCB] text-xs font-semibold rounded-lg transition-all cursor-pointer"
          >
            Run Backtest
          </button>
        </div>
      </div>

      {/* 4 Contract Spec Tickers */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs uppercase tracking-wider font-semibold text-[#7A7467] flex items-center space-x-1.5">
            <Layers className="w-4 h-4 text-[#B8892B]" />
            <span>Active Normalized MCX Contracts (Live Benchmark)</span>
          </h3>
          <span className="text-xs text-[#A39D8F]">Values canonicalized to INR / gram @ 999 Fineness</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {MOCK_TICKERS.map((ticker) => {
            return (
              <div 
                key={ticker.symbol} 
                className="bg-[#FFFDF7] p-5 rounded-xl border border-[#E8DFCB] shadow-sm hover:border-[#B8892B] transition-all group"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center space-x-2">
                    <span className="font-mono-numbers font-bold text-base text-[#2B2A26]">{ticker.symbol}</span>
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-[#F1E3BF] text-[#9C7320] border border-[#E5D2A0]">
                      {ticker.purity} Fineness
                    </span>
                  </div>
                  <span className={`text-xs font-semibold flex items-center ${ticker.change24h >= 0 ? 'text-[#3E7C59]' : 'text-[#B5533C]'}`}>
                    {ticker.change24h >= 0 ? <ArrowUpRight className="w-3.5 h-3.5 mr-0.5" /> : <ArrowDownRight className="w-3.5 h-3.5 mr-0.5" />}
                    {ticker.change24h > 0 ? `+${ticker.change24h}%` : `${ticker.change24h}%`}
                  </span>
                </div>

                <div className="text-xs text-[#7A7467] mb-3">{ticker.name}</div>

                {/* Normalized Price (The Hero Number) */}
                <div className="bg-[#FAF6EC] p-3 rounded-lg border border-[#E8DFCB] mb-3">
                  <div className="text-[11px] text-[#7A7467] font-medium flex justify-between">
                    <span>Canonical Price (INR/g):</span>
                    <span className="text-[10px] text-[#A39D8F]">@ 999 Purity</span>
                  </div>
                  <div className="text-xl font-bold font-mono-numbers text-[#2B2A26] mt-0.5">
                    ₹{ticker.normPrice.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </div>
                </div>

                {/* Contract Specs breakdown */}
                <div className="space-y-1.5 text-xs text-[#7A7467] border-t border-[#F3ECDA] pt-2.5">
                  <div className="flex justify-between">
                    <span>Exchange Quote:</span>
                    <span className="font-mono-numbers text-[#2B2A26] font-medium">₹{ticker.rawPrice.toLocaleString('en-IN')} / {ticker.unit}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Active Expiry:</span>
                    <span className="font-mono-numbers text-[#2B2A26] font-medium">{ticker.expiry} ({ticker.dte}d)</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Volume / OI:</span>
                    <span className="font-mono-numbers text-[#2B2A26]">{ticker.volume.toLocaleString()} / {ticker.oi.toLocaleString()}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Grid: Pairwise Spread Matrix & Liquidity Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Pairwise Spread Matrix */}
        <div className="bg-[#FFFDF7] p-6 rounded-xl border border-[#E8DFCB] shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-serif-title text-base font-bold text-[#2B2A26]">Cross-Contract Spread Matrix</h3>
              <p className="text-xs text-[#7A7467]">Pairwise normalized price difference: Row minus Column (INR / gram @ 999)</p>
            </div>
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-[#FAF6EC] border border-[#E8DFCB] text-[#7A7467]">
              Live Normalized Basis
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[#E8DFCB] text-[#7A7467]">
                  <th className="py-2.5 text-left font-semibold">Row \ Col</th>
                  {symbols.map(s => (
                    <th key={s} className="py-2.5 px-3 text-right font-semibold font-mono-numbers">{s}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F3ECDA]">
                {symbols.map(rowSym => {
                  const rowPrice = tickerMap.get(rowSym) || 0;
                  return (
                    <tr key={rowSym} className="hover:bg-[#FAF6EC]/60 transition-colors">
                      <td className="py-3 font-bold font-mono-numbers text-[#2B2A26]">{rowSym}</td>
                      {symbols.map(colSym => {
                        const colPrice = tickerMap.get(colSym) || 0;
                        const diff = rowPrice - colPrice;
                        const isDiag = rowSym === colSym;
                        return (
                          <td 
                            key={colSym} 
                            className={`py-3 px-3 text-right font-mono-numbers font-medium ${
                              isDiag 
                                ? 'text-[#A39D8F]' 
                                : diff > 0 
                                  ? 'text-[#3E7C59] bg-[#DCEBDD]/30' 
                                  : 'text-[#B5533C] bg-[#F3DDD5]/30'
                            }`}
                          >
                            {isDiag ? '—' : `${diff > 0 ? '+' : ''}${diff.toFixed(2)}`}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="mt-3 text-[11px] text-[#A39D8F] flex items-center space-x-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-[#3E7C59]" />
            <span>Green indicates row trades at a premium; red indicates discount to column contract.</span>
          </div>
        </div>

        {/* Volume & OI Bar Chart */}
        <div className="bg-[#FFFDF7] p-6 rounded-xl border border-[#E8DFCB] shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-serif-title text-base font-bold text-[#2B2A26]">Contract Liquidity & Open Interest</h3>
              <p className="text-xs text-[#7A7467]">Comparing trading volume and active open interest lots</p>
            </div>
            <div className="flex items-center space-x-3 text-xs">
              <span className="flex items-center space-x-1">
                <span className="w-2.5 h-2.5 rounded-sm bg-[#B8892B]"></span>
                <span className="text-[#7A7467]">Volume</span>
              </span>
              <span className="flex items-center space-x-1">
                <span className="w-2.5 h-2.5 rounded-sm bg-[#2F3E5C]"></span>
                <span className="text-[#7A7467]">Open Interest</span>
              </span>
            </div>
          </div>

          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={volumeData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E8DFCB" vertical={false} />
                <XAxis dataKey="name" tick={{ fill: '#7A7467', fontSize: 11 }} />
                <YAxis tick={{ fill: '#7A7467', fontSize: 11 }} />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: '#FFFDF7', 
                    borderColor: '#E8DFCB', 
                    borderRadius: '8px', 
                    fontSize: '12px' 
                  }} 
                />
                <Bar dataKey="Volume" fill="#B8892B" radius={[4, 4, 0, 0]} />
                <Bar dataKey="OI" fill="#2F3E5C" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 text-[11px] text-[#7A7467] flex justify-between">
            <span>Highest retail liquidity: <strong className="text-[#2B2A26]">GOLDPETAL</strong></span>
            <span>Highest institutional capital: <strong className="text-[#2B2A26]">GOLDM</strong></span>
          </div>
        </div>
      </div>
    </div>
  );
};
