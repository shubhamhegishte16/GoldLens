import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  Activity, 
  RefreshCw,
  AlertCircle,
  Calendar,
  HelpCircle,
  ChevronDown,
  ChevronUp,
  Database
} from 'lucide-react';
import { 
  ResponsiveContainer, 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  Tooltip, 
  CartesianGrid,
  BarChart,
  Bar,
  ReferenceLine
} from 'recharts';
import type { TermStructureResponse, CarryDecompositionResponse } from '../types';

const CONTRACT_COLORS: Record<string, string> = {
  GOLDM: '#D4A017',     // Gold / Amber
  GOLDTEN: '#0284C7',   // Sky / Cyan
  GOLDGUINEA: '#059669',// Emerald
  GOLDPETAL: '#E11D48', // Rose / Red
};

export const TermStructureTab: React.FC = () => {
  // Preset dates with rich multi-expiry curves
  const PRESET_DATES = [
    { label: '2025-05-15 (Peak Multi-Expiry Contango)', value: '2025-05-15' },
    { label: '2025-06-16 (Mid-Cycle Forward Curve)', value: '2025-06-16' },
    { label: '2025-07-15 (Summer Basis Structure)', value: '2025-07-15' },
    { label: '2025-08-14 (Autumn Expiry Transition)', value: '2025-08-14' },
    { label: '2025-10-31 (Latest Dataset Session)', value: '2025-10-31' },
  ];

  const [selectedDate, setSelectedDate] = useState<string>('2025-05-15');
  const [decompSymbol, setDecompSymbol] = useState<string>('GOLDTEN');
  const [decompExpiry, setDecompExpiry] = useState<string>('2025-06-30');
  const [showCurveExplanation, setShowCurveExplanation] = useState<boolean>(false);
  const [showDecompExplanation, setShowDecompExplanation] = useState<boolean>(false);

  // API states for Term Structure
  const [termData, setTermData] = useState<TermStructureResponse | null>(null);
  const [isTermLoading, setIsTermLoading] = useState<boolean>(true);
  const [termError, setTermError] = useState<string | null>(null);

  // API states for Carry Decomposition
  const [decompData, setDecompData] = useState<CarryDecompositionResponse | null>(null);
  const [isDecompLoading, setIsDecompLoading] = useState<boolean>(true);
  const [decompError, setDecompError] = useState<string | null>(null);

  // Fetch Term Structure for selected date
  const fetchTermStructure = useCallback(async (dt: string) => {
    setIsTermLoading(true);
    setTermError(null);
    try {
      const res = await fetch(`/api/analytics/term-structure?trade_date=${dt}`);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: Failed to fetch term structure`);
      }
      const data: TermStructureResponse = await res.json();
      setTermData(data);
    } catch (err: any) {
      setTermError(err?.message || 'Failed to fetch term structure');
    } finally {
      setIsTermLoading(false);
    }
  }, []);

  // Fetch Carry Decomposition for selected symbol and expiry
  const fetchCarryDecomp = useCallback(async (sym: string, exp: string) => {
    setIsDecompLoading(true);
    setDecompError(null);
    try {
      const url = exp 
        ? `/api/analytics/carry-decomposition?symbol=${sym}&expiry_date=${exp}`
        : `/api/analytics/carry-decomposition?symbol=${sym}`;
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: Failed to fetch carry decomposition`);
      }
      const data: CarryDecompositionResponse = await res.json();
      setDecompData(data);
      if (data.expiry_date && data.expiry_date !== decompExpiry) {
        setDecompExpiry(data.expiry_date);
      }
    } catch (err: any) {
      setDecompError(err?.message || 'Failed to fetch carry decomposition');
    } finally {
      setIsDecompLoading(false);
    }
  }, [decompExpiry]);

  useEffect(() => {
    fetchTermStructure(selectedDate);
  }, [selectedDate, fetchTermStructure]);

  useEffect(() => {
    fetchCarryDecomp(decompSymbol, decompExpiry);
  }, [decompSymbol, decompExpiry, fetchCarryDecomp]);

  // Transform curve points for plotting
  const curvePoints = useMemo(() => {
    if (!termData || !termData.curve_points) return [];
    // Sort by DTE ascending
    return [...termData.curve_points].sort((a, b) => a.dte - b.dte).map(p => ({
      name: `${p.symbol} (${p.expiry_date.slice(5)})`,
      symbol: p.symbol,
      expiry: p.expiry_date,
      dte: p.dte,
      normPrice: p.norm_close,
      rawPrice: p.raw_close,
      volume: p.volume,
      oi: p.open_interest,
    }));
  }, [termData]);

  // Spot anchor price (near contract normalized price)
  const spotAnchor = useMemo(() => {
    if (!curvePoints.length) return 8500;
    return curvePoints[0].normPrice;
  }, [curvePoints]);

  // Overall curve structure evaluation
  const curveRegime = useMemo(() => {
    if (!curvePoints.length) return { status: 'NORMAL CONTANGO', carryPct: 5.95 };
    const near = curvePoints[0].normPrice;
    const far = curvePoints[curvePoints.length - 1].normPrice;
    const dteDiff = curvePoints[curvePoints.length - 1].dte - curvePoints[0].dte;
    if (dteDiff > 0 && near > 0) {
      const annCarry = ((far - near) / near) * (365 / dteDiff) * 100;
      return {
        status: annCarry >= 0 ? 'NORMAL CONTANGO' : 'BACKWARDATION',
        carryPct: parseFloat(annCarry.toFixed(2))
      };
    }
    return { status: 'NORMAL CONTANGO', carryPct: 5.95 };
  }, [curvePoints]);

  return (
    <div className="space-y-6">
      {/* Sample Data Provenance Banner */}
      <div className="bg-[#FFF9EE] border border-[#F1D8A2] rounded-xl px-4 py-2.5 flex items-center justify-between text-xs">
        <div className="flex items-center space-x-2 text-[#9C7320]">
          <Database className="w-4 h-4 flex-shrink-0" />
          <span>
            <strong>DATA PROVENANCE:</strong> Showing <strong>SAMPLE DATA</strong> from seeded MCX historical contracts. Curve points and annualized carry decay are calculated directly from backend SQLite Bhavcopy records.
          </span>
        </div>
        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[#E8A317] text-white uppercase tracking-wider">
          SAMPLE DATA
        </span>
      </div>

      {/* Header and Controls */}
      <div className="bg-[#FFFDF7] p-6 rounded-2xl border border-[#E8DFCB] shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center space-x-2">
              <Activity className="w-5 h-5 text-[#B8892B]" />
              <h2 className="font-serif-title text-xl font-bold text-[#2B2A26]">
                Futures Term Structure & Implied Carry Analytics
              </h2>
            </div>
            <p className="text-xs text-[#7A7467] mt-1">
              Analyzing normalized futures pricing across expiry maturities to evaluate calendar carry, roll yield, and spot basis.
            </p>
          </div>

          <div className="flex items-center space-x-3">
            <span className="text-xs text-[#7A7467]">Curve Status on {selectedDate}:</span>
            <span className={`px-2.5 py-1 rounded-full text-xs font-bold border ${
              curveRegime.status === 'NORMAL CONTANGO'
                ? 'bg-[#DCEBDD] text-[#3E7C59] border-[#C4DEC7]'
                : 'bg-[#FDE8E8] text-[#DC2626] border-[#FCA5A5]'
            }`}>
              {curveRegime.status} ({curveRegime.carryPct > 0 ? `+${curveRegime.carryPct}%` : `${curveRegime.carryPct}%`} p.a.)
            </span>
          </div>
        </div>

        {/* Date Selector Bar */}
        <div className="mt-5 pt-4 border-t border-[#F3ECDA] flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-center space-x-2 text-xs text-[#7A7467]">
            <Calendar className="w-4 h-4 text-[#B8892B]" />
            <span className="font-semibold text-[#2B2A26]">Select Trade Date:</span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {PRESET_DATES.map(preset => (
              <button
                key={preset.value}
                onClick={() => setSelectedDate(preset.value)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  selectedDate === preset.value
                    ? 'bg-[#B8892B] text-white shadow-sm'
                    : 'bg-[#FAF6EC] text-[#7A7467] hover:text-[#2B2A26] border border-[#E8DFCB]'
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Loading & Error States for Term Structure */}
      {isTermLoading && (
        <div className="p-12 text-center bg-[#FFFDF7] rounded-xl border border-[#E8DFCB]">
          <RefreshCw className="w-8 h-8 text-[#B8892B] animate-spin mx-auto mb-2" />
          <p className="text-xs text-[#7A7467]">Loading futures curve for {selectedDate} from backend...</p>
        </div>
      )}

      {termError && (
        <div className="p-6 bg-[#FEF2F2] rounded-xl border border-[#FCA5A5] text-xs text-[#991B1B] flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <AlertCircle className="w-5 h-5 text-[#DC2626] flex-shrink-0" />
            <span><strong>Term Structure Error:</strong> {termError}</span>
          </div>
          <button 
            onClick={() => fetchTermStructure(selectedDate)}
            className="px-3 py-1 bg-[#DC2626] text-white rounded font-medium hover:bg-[#B91C1C] transition-colors cursor-pointer"
          >
            Retry
          </button>
        </div>
      )}

      {/* PRIORITY 4: Futures Term-Structure Forward Curve Chart */}
      {!isTermLoading && !termError && curvePoints.length > 0 && (
        <div className="bg-[#FFFDF7] p-6 rounded-2xl border border-[#E8DFCB] shadow-sm">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 mb-4">
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="font-serif-title text-base font-bold text-[#2B2A26]">
                  MCX Gold Futures Forward Curve on {selectedDate} (INR / gram @ 999)
                </h3>
                <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-[#E8A317] text-white">SAMPLE DATA</span>
              </div>
              <p className="text-xs text-[#7A7467]">
                Ascending slope across Days to Expiry (DTE) reflects positive cost of carry (repo rate + storage/insurance fees).
              </p>
            </div>
            <span className="text-xs font-mono-numbers text-[#B8892B] font-semibold bg-[#FFF4DC] px-2.5 py-1 rounded-lg border border-[#F3CE7A]">
              Spot Anchor: ₹{spotAnchor.toFixed(2)} / g
            </span>
          </div>

          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={curvePoints} margin={{ top: 20, right: 30, left: 10, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E8DFCB" vertical={false} />
                <XAxis 
                  dataKey="name" 
                  tick={{ fill: '#7A7467', fontSize: 10 }}
                  interval={0}
                  angle={-15}
                  textAnchor="end"
                />
                <YAxis 
                  domain={['auto', 'auto']} 
                  tick={{ fill: '#7A7467', fontSize: 10 }} 
                  tickFormatter={(v) => `₹${v.toFixed(0)}`}
                />
                <Tooltip 
                  content={({ active, payload }) => {
                    if (!active || !payload || !payload.length) return null;
                    const p = payload[0].payload;
                    const basis = p.normPrice - spotAnchor;
                    return (
                      <div className="bg-[#FFFDF7] p-3 rounded-lg border border-[#E8DFCB] shadow-md text-xs space-y-1">
                        <div className="font-bold text-[#2B2A26] border-b border-[#F3ECDA] pb-1 flex justify-between">
                          <span>{p.symbol} ({p.expiry})</span>
                          <span className="font-mono-numbers text-[#7A7467]">{p.dte}d DTE</span>
                        </div>
                        <div className="space-y-0.5 pt-1 text-[11px]">
                          <div className="flex justify-between">
                            <span>Normalized Price:</span>
                            <strong className="font-mono-numbers text-[#B8892B]">₹{p.normPrice.toFixed(2)}/g</strong>
                          </div>
                          <div className="flex justify-between">
                            <span>Raw Exchange Quote:</span>
                            <span className="font-mono-numbers text-[#2B2A26]">₹{p.rawPrice.toLocaleString()}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Basis to Front Spot:</span>
                            <span className="font-mono-numbers text-[#059669]">+{basis.toFixed(2)} INR/g</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Volume / OI:</span>
                            <span className="font-mono-numbers text-[#7A7467]">{p.volume.toLocaleString()} / {p.oi.toLocaleString()} lots</span>
                          </div>
                        </div>
                      </div>
                    );
                  }}
                />
                <ReferenceLine 
                  y={spotAnchor} 
                  stroke="#94A3B8" 
                  strokeDasharray="4 4" 
                  label={{ value: `Front Anchor (₹${spotAnchor.toFixed(1)})`, fill: '#7A7467', fontSize: 10 }} 
                />
                <Line 
                  type="monotone" 
                  dataKey="normPrice" 
                  stroke="#B8892B" 
                  strokeWidth={2.5} 
                  dot={{ r: 5, fill: '#B8892B', stroke: '#FFFDF7', strokeWidth: 2 }} 
                  activeDot={{ r: 7 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Explain Futures Curve Collapsible */}
          <div className="mt-3 pt-3 border-t border-[#F3ECDA]">
            <button
              onClick={() => setShowCurveExplanation(!showCurveExplanation)}
              className="flex items-center space-x-1.5 text-xs text-[#B8892B] hover:text-[#9C7320] font-semibold cursor-pointer"
            >
              <HelpCircle className="w-3.5 h-3.5" />
              <span>Explain Contango vs Backwardation on MCX</span>
              {showCurveExplanation ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>

            {showCurveExplanation && (
              <div className="mt-2.5 p-3.5 bg-[#FAF6EC] rounded-xl border border-[#E8DFCB] text-xs text-[#7A7467] leading-relaxed space-y-1.5">
                <p>
                  <strong>Cost of Carry Theory:</strong> In commodities like bullion, distant futures naturally trade at a premium to near futures (<strong>Contango</strong>). This premium compensates for financing interest (~6.0% Indian sovereign repo), vaults insurance, and depository storage fees.
                </p>
                <p>
                  <strong>Calendar Spread Arbitrage:</strong> If distant futures trade above full carry, arbitrageurs short the far month and buy the near month, pocketing the excess financing yield until delivery convergence.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Implied Carry Matrix Table (From Real API `implied_carry_table`) */}
      <div className="bg-[#FFFDF7] p-6 rounded-2xl border border-[#E8DFCB] shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="flex items-center space-x-2">
              <h3 className="font-serif-title text-base font-bold text-[#2B2A26]">
                Implied Annualized Carry Table ({selectedDate})
              </h3>
              <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-[#E8A317] text-white">SAMPLE DATA</span>
            </div>
            <p className="text-xs text-[#7A7467]">
              Computed between consecutive contract maturities: Annualized Carry % = [(F2 - F1) / F1] × (365 / ΔDTE) × 100
            </p>
          </div>
          <span className="text-xs text-[#7A7467] bg-[#FAF6EC] px-2.5 py-1 rounded border border-[#E8DFCB]">
            Repo Benchmark: ~6.50%
          </span>
        </div>

        {termData && termData.implied_carry_table && termData.implied_carry_table.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[#E8DFCB] text-[#7A7467]">
                  <th className="py-2.5 text-left font-semibold">Contract</th>
                  <th className="py-2.5 text-left font-semibold">Near Expiry</th>
                  <th className="py-2.5 text-left font-semibold">Far Expiry</th>
                  <th className="py-2.5 text-right font-semibold">DTE Spread</th>
                  <th className="py-2.5 text-right font-semibold">Near Price</th>
                  <th className="py-2.5 text-right font-semibold">Far Price</th>
                  <th className="py-2.5 text-right font-semibold">Per-Gram Basis</th>
                  <th className="py-2.5 text-right font-semibold">Implied Carry (p.a.)</th>
                  <th className="py-2.5 text-center font-semibold">Curve Position</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F3ECDA]">
                {termData.implied_carry_table.map((row, idx) => (
                  <tr key={idx} className="hover:bg-[#FAF6EC]/60 transition-colors">
                    <td className="py-3 font-bold font-mono-numbers text-[#2B2A26] flex items-center space-x-1.5">
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: CONTRACT_COLORS[row.symbol] || '#B8892B' }}></span>
                      <span>{row.symbol}</span>
                    </td>
                    <td className="py-3 font-mono-numbers text-[#7A7467]">{row.near_expiry} ({row.near_dte}d)</td>
                    <td className="py-3 font-mono-numbers text-[#7A7467]">{row.far_expiry} ({row.far_dte}d)</td>
                    <td className="py-3 text-right font-mono-numbers text-[#2B2A26] font-medium">{row.dte_spread} days</td>
                    <td className="py-3 text-right font-mono-numbers font-medium text-[#2B2A26]">₹{row.near_norm_price.toFixed(2)}</td>
                    <td className="py-3 text-right font-mono-numbers font-medium text-[#2B2A26]">₹{row.far_norm_price.toFixed(2)}</td>
                    <td className="py-3 text-right font-mono-numbers text-[#059669] font-medium">+₹{row.spread_inr_g.toFixed(2)}</td>
                    <td className="py-3 text-right font-mono-numbers font-bold text-[#B8892B]">{row.implied_annualized_carry_pct.toFixed(2)}%</td>
                    <td className="py-3 text-center">
                      <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-[#DCEBDD] text-[#3E7C59]">
                        {row.structure}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="py-8 text-center text-xs text-[#7A7467] bg-[#FAF6EC] rounded-xl border border-[#E8DFCB]">
            On {selectedDate}, contracts have a single front expiry active. Select an earlier date (e.g. <strong>2025-05-15</strong>) to view multi-expiry carry calculations across simultaneous contract cycles.
          </div>
        )}
      </div>

      {/* PRIORITY 5: Carry Decomposition Section (Roll-Down vs Curve Shift) */}
      <div className="bg-[#FFFDF7] p-6 rounded-2xl border border-[#E8DFCB] shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
          <div>
            <div className="flex items-center space-x-2">
              <h3 className="font-serif-title text-base font-bold text-[#2B2A26]">
                Carry Decomposition: Mechanical Roll-Down vs Genuine Curve Shift
              </h3>
              <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-[#E8A317] text-white">SAMPLE DATA</span>
            </div>
            <p className="text-xs text-[#7A7467] mt-0.5">
              Decomposes daily futures price movement into theoretical carry decay along the term slope versus macro bullion price shifts.
            </p>
          </div>

          {/* Contract Selector for Carry Decomposition */}
          <div className="flex items-center space-x-2">
            <span className="text-xs text-[#7A7467]">Contract:</span>
            {['GOLDTEN', 'GOLDGUINEA', 'GOLDPETAL', 'GOLDM'].map(s => (
              <button
                key={s}
                onClick={() => setDecompSymbol(s)}
                className={`px-2.5 py-1 rounded text-xs font-semibold transition-all cursor-pointer ${
                  decompSymbol === s
                    ? 'bg-[#B8892B] text-white shadow-sm'
                    : 'bg-[#FAF6EC] text-[#7A7467] hover:text-[#2B2A26] border border-[#E8DFCB]'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {/* Legend Indicators */}
        <div className="flex items-center justify-between mb-3 text-xs">
          <div className="flex items-center space-x-4">
            <span className="flex items-center space-x-1.5">
              <span className="w-3 h-2.5 rounded-sm bg-[#059669]"></span>
              <span className="text-[#7A7467]">Roll-Down Carry Decay (₹/g)</span>
            </span>
            <span className="flex items-center space-x-1.5">
              <span className="w-3 h-2.5 rounded-sm bg-[#0284C7]"></span>
              <span className="text-[#7A7467]">Genuine Spot / Curve Shift (₹/g)</span>
            </span>
            <span className="flex items-center space-x-1.5">
              <span className="w-3 h-0.5 bg-[#B8892B]"></span>
              <span className="text-[#2B2A26] font-semibold">Total Daily Change (₹/g)</span>
            </span>
          </div>
          <span className="text-[11px] text-[#A39D8F]">
            Expiry Cycle: {decompExpiry}
          </span>
        </div>

        {/* Decomposition Chart */}
        {isDecompLoading ? (
          <div className="h-60 flex items-center justify-center bg-[#FAF6EC] rounded-xl border border-[#E8DFCB]">
            <RefreshCw className="w-6 h-6 text-[#B8892B] animate-spin mr-2" />
            <span className="text-xs text-[#7A7467]">Computing daily carry decomposition...</span>
          </div>
        ) : decompError ? (
          <div className="p-6 bg-[#FEF2F2] rounded-xl border border-[#FCA5A5] text-xs text-[#991B1B] flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <AlertCircle className="w-5 h-5 text-[#DC2626] flex-shrink-0" />
              <span><strong>Decomposition Error:</strong> {decompError}</span>
            </div>
            <button 
              onClick={() => fetchCarryDecomp(decompSymbol, decompExpiry)}
              className="px-3 py-1 bg-[#DC2626] text-white rounded font-medium hover:bg-[#B91C1C] transition-colors cursor-pointer"
            >
              Retry
            </button>
          </div>
        ) : decompData && decompData.decomposition && decompData.decomposition.length > 0 ? (
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={decompData.decomposition} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E8DFCB" vertical={false} />
                <XAxis dataKey="trade_date" tick={{ fill: '#7A7467', fontSize: 10 }} minTickGap={20} />
                <YAxis tick={{ fill: '#7A7467', fontSize: 10 }} tickFormatter={(v) => `₹${v.toFixed(1)}`} />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: '#FFFDF7', 
                    borderColor: '#E8DFCB', 
                    borderRadius: '8px', 
                    fontSize: '12px' 
                  }} 
                  formatter={(val: any, name: any) => [`₹${Number(val).toFixed(3)} / g`, name]}
                />
                <Bar dataKey="roll_down_component_inr" fill="#059669" name="Roll-Down Carry" radius={[2, 2, 0, 0]} />
                <Bar dataKey="curve_shift_component_inr" fill="#0284C7" name="Curve Shift" radius={[2, 2, 0, 0]} />
                <Line type="monotone" dataKey="total_daily_change_inr" stroke="#B8892B" strokeWidth={2} dot={false} name="Total Daily Change" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="py-12 text-center text-xs text-[#7A7467] bg-[#FAF6EC] rounded-xl border border-[#E8DFCB]">
            No decomposition records found for {decompSymbol} ({decompExpiry}).
          </div>
        )}

        {/* Explain Carry Decomposition Collapsible */}
        <div className="mt-3 pt-3 border-t border-[#F3ECDA]">
          <button
            onClick={() => setShowDecompExplanation(!showDecompExplanation)}
            className="flex items-center space-x-1.5 text-xs text-[#B8892B] hover:text-[#9C7320] font-semibold cursor-pointer"
          >
            <HelpCircle className="w-3.5 h-3.5" />
            <span>Explain Carry Decomposition Methodology</span>
            {showDecompExplanation ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>

          {showDecompExplanation && (
            <div className="mt-2.5 p-3.5 bg-[#FAF6EC] rounded-xl border border-[#E8DFCB] text-xs text-[#7A7467] leading-relaxed space-y-1.5">
              <p>
                <strong>The Mathematical Decomposition:</strong>
                <br />
                <code className="bg-[#FFFDF7] px-2 py-0.5 rounded border border-[#E8DFCB] text-[#2B2A26] font-mono mt-1 inline-block">
                  Total Daily Change = Mechanical Roll-Down Carry Decay + Genuine Curve Shift
                </code>
              </p>
              <ul className="list-disc pl-5 space-y-1">
                <li>
                  <strong>Roll-Down Carry Decay:</strong> The deterministic daily PnL drag captured as the contract rolls down the sloped futures curve toward expiry with each passing day.
                </li>
                <li>
                  <strong>Genuine Curve Shift:</strong> The underlying market repricing caused by international bullion spot price changes, USD/INR exchange rate shifts, or macro basis changes.
                </li>
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
