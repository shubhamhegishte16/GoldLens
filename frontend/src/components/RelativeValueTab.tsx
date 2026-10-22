import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  Scale,
  RefreshCw,
  AlertCircle,
  ShieldCheck,
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
  ReferenceLine
} from 'recharts';
import type { RelativeValueResponse, RelativeValueSpreadItem } from '../types';

export const RelativeValueTab: React.FC = () => {
  const [selectedPair, setSelectedPair] = useState<'GOLDTEN-GOLDPETAL' | 'GOLDTEN-GOLDGUINEA' | 'GOLDGUINEA-GOLDPETAL'>('GOLDTEN-GOLDPETAL');
  const [windowDays, setWindowDays] = useState<number>(20);
  const [zThreshold, setZThreshold] = useState<number>(2.0);
  const [selectedExpiry, setSelectedExpiry] = useState<string>('FRONT_CONTINUOUS');
  const [showExplanation, setShowExplanation] = useState<boolean>(false);

  const [apiData, setApiData] = useState<RelativeValueResponse | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Parse leg symbols
  const [symA, symB] = selectedPair.split('-');

  // Fetch real relative value data from FastAPI backend
  const fetchRVData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const url = `/api/analytics/relative-value?symbol_a=${symA}&symbol_b=${symB}&window=${windowDays}&z_threshold=${zThreshold}`;
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: Failed to fetch relative-value analytics`);
      }
      const data: RelativeValueResponse = await res.json();
      setApiData(data);
    } catch (err: any) {
      setError(err?.message || 'Failed to connect to relative-value API');
    } finally {
      setIsLoading(false);
    }
  }, [symA, symB, windowDays, zThreshold]);

  useEffect(() => {
    fetchRVData();
  }, [fetchRVData]);

  // Extract distinct expiry dates available in this pair's dataset
  const availableExpiries = useMemo(() => {
    if (!apiData || !apiData.spreads) return [];
    return Array.from(new Set(apiData.spreads.map(s => s.expiry_date))).sort();
  }, [apiData]);

  // Filter series according to selected expiry (Front Continuous vs Specific Expiry)
  const chartPoints = useMemo(() => {
    if (!apiData || !apiData.spreads || !apiData.spreads.length) return [];

    let filtered: RelativeValueSpreadItem[] = [];

    if (selectedExpiry === 'FRONT_CONTINUOUS') {
      // For each trade date, pick front contract with lowest DTE
      const byDate = new Map<string, RelativeValueSpreadItem>();
      apiData.spreads.forEach(item => {
        const existing = byDate.get(item.trade_date);
        if (!existing || item.dte < existing.dte) {
          byDate.set(item.trade_date, item);
        }
      });
      filtered = Array.from(byDate.values()).sort((a, b) => a.trade_date.localeCompare(b.trade_date));
    } else {
      filtered = apiData.spreads.filter(s => s.expiry_date === selectedExpiry);
    }

    return filtered.map(item => {
      const rollingMean = item.rolling_mean;
      const rollingStd = item.rolling_std;
      const upperBand = rollingMean !== null && rollingStd !== null 
        ? parseFloat((rollingMean + zThreshold * rollingStd).toFixed(3)) 
        : null;
      const lowerBand = rollingMean !== null && rollingStd !== null 
        ? parseFloat((rollingMean - zThreshold * rollingStd).toFixed(3)) 
        : null;

      return {
        date: item.trade_date,
        expiry: item.expiry_date,
        spread: item.spread_inr_g,
        mean: rollingMean,
        upperBand,
        lowerBand,
        zScore: item.zscore,
        priceA: item.norm_price_a,
        priceB: item.norm_price_b,
        volA: item.volume_a,
        volB: item.volume_b,
        oiA: item.oi_a,
        oiB: item.oi_b,
        dte: item.dte,
        signal: item.signal,
        inAvoidZone: item.in_avoid_zone,
      };
    });
  }, [apiData, selectedExpiry, zThreshold]);

  // Latest point from real filtered series
  const latestPoint = useMemo(() => {
    if (!chartPoints.length) return null;
    return chartPoints[chartPoints.length - 1];
  }, [chartPoints]);

  // Quick 3x3 Heatmap Matrix of current Z-Scores across month-end contracts
  // Computed dynamically from real latest spread relationships
  const heatmapData = useMemo(() => {
    const contracts = ['GOLDTEN', 'GOLDGUINEA', 'GOLDPETAL'];
    // We compute pairwise latest z-score
    // Diagonal is 0.0
    // If selected pair is GOLDTEN-GOLDPETAL and latestPoint is available:
    const zMap: Record<string, number> = {};
    if (latestPoint && latestPoint.zScore !== null) {
      zMap[`${symA}-${symB}`] = latestPoint.zScore;
      zMap[`${symB}-${symA}`] = -latestPoint.zScore;
    }

    return contracts.map(row => {
      return {
        row,
        cols: contracts.map(col => {
          if (row === col) return { col, z: 0.0, isSelf: true };
          if (zMap[`${row}-${col}`] !== undefined) {
            return { col, z: zMap[`${row}-${col}`], isSelf: false };
          }
          // Default estimation if not current active pair
          return { col, z: null, isSelf: false };
        })
      };
    });
  }, [latestPoint, symA, symB]);

  return (
    <div className="space-y-6">
      {/* Sample Data Provenance Banner */}
      <div className="bg-[#FFF9EE] border border-[#F1D8A2] rounded-xl px-4 py-2.5 flex items-center justify-between text-xs">
        <div className="flex items-center space-x-2 text-[#9C7320]">
          <Database className="w-4 h-4 flex-shrink-0" />
          <span>
            <strong>DATA PROVENANCE:</strong> Showing <strong>SAMPLE DATA</strong> from seeded MCX historical contracts. Spreads are calculated from real backend database records via <code className="bg-[#FFFDF7] px-1 py-0.5 rounded border border-[#E8DFCB] font-mono">/api/analytics/relative-value</code>.
          </span>
        </div>
        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[#E8A317] text-white uppercase tracking-wider">
          SAMPLE DATA
        </span>
      </div>

      {/* Configuration Header & Pair Selector */}
      <div className="bg-[#FFFDF7] p-6 rounded-2xl border border-[#E8DFCB] shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-5 border-b border-[#F3ECDA]">
          <div>
            <div className="flex items-center space-x-2">
              <Scale className="w-5 h-5 text-[#B8892B]" />
              <h2 className="font-serif-title text-xl font-bold text-[#2B2A26]">
                Cross-Contract Relative Value & Spread Analysis
              </h2>
            </div>
            <p className="text-xs text-[#7A7467] mt-1">
              Statistical arbitrage engine with real historical rolling mean and configurable ±Z-Score reference bands.
            </p>
          </div>

          {/* Month-End Matching Expiry Pair Selector Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            {[
              { id: 'GOLDTEN-GOLDPETAL', label: 'GOLDTEN vs GOLDPETAL' },
              { id: 'GOLDTEN-GOLDGUINEA', label: 'GOLDTEN vs GOLDGUINEA' },
              { id: 'GOLDGUINEA-GOLDPETAL', label: 'GOLDGUINEA vs GOLDPETAL' },
            ].map(p => (
              <button
                key={p.id}
                onClick={() => setSelectedPair(p.id as any)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  selectedPair === p.id
                    ? 'bg-[#B8892B] text-white shadow-sm'
                    : 'bg-[#FAF6EC] text-[#7A7467] hover:text-[#2B2A26] border border-[#E8DFCB]'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Sliders for Window & Z-Threshold + Expiry Cycle Dropdown */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-5">
          {/* Lookback Window Slider */}
          <div>
            <div className="flex justify-between items-center text-xs mb-1.5">
              <span className="font-semibold text-[#2B2A26]">Rolling Lookback Window</span>
              <span className="font-mono-numbers font-bold text-[#B8892B]">{windowDays} Trading Days</span>
            </div>
            <input 
              type="range" 
              min="5" 
              max="60" 
              value={windowDays}
              onChange={(e) => setWindowDays(parseInt(e.target.value))}
              className="w-full accent-[#B8892B] cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-[#A39D8F] mt-1">
              <span>5d (Responsive)</span>
              <span>20d (Default)</span>
              <span>60d (Structural)</span>
            </div>
          </div>

          {/* Z-Score Threshold Slider */}
          <div>
            <div className="flex justify-between items-center text-xs mb-1.5">
              <span className="font-semibold text-[#2B2A26]">Entry Z-Score Threshold (σ)</span>
              <span className="font-mono-numbers font-bold text-[#B8892B]">±{zThreshold.toFixed(1)} σ</span>
            </div>
            <input 
              type="range" 
              min="1.0" 
              max="3.5" 
              step="0.1"
              value={zThreshold}
              onChange={(e) => setZThreshold(parseFloat(e.target.value))}
              className="w-full accent-[#B8892B] cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-[#A39D8F] mt-1">
              <span>±1.0σ (High Freq)</span>
              <span>±2.0σ (95.4% Conf)</span>
              <span>±3.0σ (Extreme)</span>
            </div>
          </div>

          {/* Expiry Cycle Filter */}
          <div>
            <div className="flex justify-between items-center text-xs mb-1.5">
              <span className="font-semibold text-[#2B2A26]">Expiry Cycle Series</span>
              <span className="text-[10px] text-[#7A7467]">{availableExpiries.length} Expiries Loaded</span>
            </div>
            <select
              value={selectedExpiry}
              onChange={(e) => setSelectedExpiry(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-[#E8DFCB] bg-[#FAF6EC] text-xs font-semibold text-[#2B2A26] cursor-pointer"
            >
              <option value="FRONT_CONTINUOUS">Continuous Front Month (All Dates)</option>
              {availableExpiries.map(exp => (
                <option key={exp} value={exp}>Contract Expiry: {exp}</option>
              ))}
            </select>
            <div className="text-[10px] text-[#A39D8F] mt-1">
              Select specific contract expiry or continuous front-month curve
            </div>
          </div>
        </div>
      </div>

      {/* Expiry Matching Notice for GOLDM */}
      <div className="bg-[#FAF6EC] p-3.5 rounded-xl border border-[#E8DFCB] text-xs text-[#7A7467] flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <ShieldCheck className="w-4 h-4 text-[#059669] flex-shrink-0" />
          <span>
            <strong>Like-for-Like Expiry Synchronization:</strong> GOLDTEN, GOLDPETAL, and GOLDGUINEA share the exact same month-end expiry cycle (27th-31st). Spreads are evaluated strictly on matching delivery dates. (GOLDM follows a 3rd-5th cycle).
          </span>
        </div>
      </div>

      {/* Loading & Error States */}
      {isLoading && (
        <div className="p-12 text-center bg-[#FFFDF7] rounded-xl border border-[#E8DFCB]">
          <RefreshCw className="w-8 h-8 text-[#B8892B] animate-spin mx-auto mb-2" />
          <p className="text-xs text-[#7A7467]">Calculating rolling relative value metrics from database records...</p>
        </div>
      )}

      {error && (
        <div className="p-6 bg-[#FEF2F2] rounded-xl border border-[#FCA5A5] text-xs text-[#991B1B] flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <AlertCircle className="w-5 h-5 text-[#DC2626] flex-shrink-0" />
            <span><strong>API Error:</strong> {error}</span>
          </div>
          <button 
            onClick={fetchRVData}
            className="px-3 py-1 bg-[#DC2626] text-white rounded font-medium hover:bg-[#B91C1C] transition-colors cursor-pointer"
          >
            Retry
          </button>
        </div>
      )}

      {!isLoading && !error && chartPoints.length > 0 && latestPoint && (
        <>
          {/* Key Real-Time Statistical Readouts (From Real Latest Record) */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div className="bg-[#FFFDF7] p-4 rounded-xl border border-[#E8DFCB] shadow-sm">
              <span className="text-[11px] text-[#7A7467] font-medium block mb-1">Current Spread ({latestPoint.date})</span>
              <span className="text-xl font-bold font-mono-numbers text-[#2B2A26]">
                ₹{latestPoint.spread.toFixed(2)} <span className="text-xs font-normal text-[#7A7467]">/g</span>
              </span>
              <span className="text-[10px] text-[#A39D8F] block mt-1">Norm {symA} - Norm {symB}</span>
            </div>

            <div className="bg-[#FFFDF7] p-4 rounded-xl border border-[#E8DFCB] shadow-sm">
              <span className="text-[11px] text-[#7A7467] font-medium block mb-1">Rolling Mean ({windowDays}D)</span>
              <span className="text-xl font-bold font-mono-numbers text-[#7A7467]">
                {latestPoint.mean !== null ? `₹${latestPoint.mean.toFixed(2)} /g` : 'Calculating...'}
              </span>
              <span className="text-[10px] text-[#A39D8F] block mt-1">Historical Centerline</span>
            </div>

            <div className="bg-[#FFFDF7] p-4 rounded-xl border border-[#E8DFCB] shadow-sm">
              <span className="text-[11px] text-[#7A7467] font-medium block mb-1">Rolling Z-Score</span>
              <span className={`text-xl font-bold font-mono-numbers ${
                latestPoint.zScore !== null && Math.abs(latestPoint.zScore) >= zThreshold 
                  ? 'text-[#DC2626]' 
                  : 'text-[#059669]'
              }`}>
                {latestPoint.zScore !== null ? `${latestPoint.zScore >= 0 ? '+' : ''}${latestPoint.zScore.toFixed(2)} σ` : '—'}
              </span>
              <span className="text-[10px] text-[#A39D8F] block mt-1">
                Threshold: ±{zThreshold.toFixed(1)}σ
              </span>
            </div>

            <div className="bg-[#FFFDF7] p-4 rounded-xl border border-[#E8DFCB] shadow-sm">
              <span className="text-[11px] text-[#7A7467] font-medium block mb-1">Days to Expiry (DTE)</span>
              <span className="text-xl font-bold font-mono-numbers text-[#2B2A26]">
                {latestPoint.dte} <span className="text-xs font-normal text-[#7A7467]">days</span>
              </span>
              <span className="text-[10px] text-[#A39D8F] block mt-1">
                {latestPoint.inAvoidZone ? 'In 5-Day Tender Avoid Zone!' : 'Normal Trading Phase'}
              </span>
            </div>

            <div className="bg-[#FFFDF7] p-4 rounded-xl border border-[#E8DFCB] shadow-sm col-span-2 md:col-span-1">
              <span className="text-[11px] text-[#7A7467] font-medium block mb-1">Statistical Signal</span>
              <span className={`inline-block px-2 py-0.5 rounded text-xs font-bold ${
                latestPoint.signal.includes('SHORT')
                  ? 'bg-[#FDE8E8] text-[#DC2626]'
                  : latestPoint.signal.includes('LONG')
                    ? 'bg-[#DCEBDD] text-[#059669]'
                    : 'bg-[#FAF6EC] text-[#7A7467] border border-[#E8DFCB]'
              }`}>
                {latestPoint.signal === 'NEUTRAL' ? 'NEUTRAL / IN-BAND' : latestPoint.signal}
              </span>
              <span className="text-[10px] text-[#A39D8F] block mt-1">Real API Evaluation</span>
            </div>
          </div>

          {/* PRIORITY 2: Main Historical Spread Chart with Rolling Mean & Configurable Bands */}
          <div className="bg-[#FFFDF7] p-6 rounded-2xl border border-[#E8DFCB] shadow-sm">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 mb-4">
              <div>
                <div className="flex items-center space-x-2">
                  <h3 className="font-serif-title text-base font-bold text-[#2B2A26]">
                    Normalized Spread & Reference Bands ({symA} minus {symB})
                  </h3>
                  <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-[#E8A317] text-white">SAMPLE DATA</span>
                </div>
                <p className="text-xs text-[#7A7467]">
                  Price spread per gram (999 purity) shown with rolling {windowDays}-day mean and ±{zThreshold.toFixed(1)}σ Z-score reference bands.
                </p>
              </div>

              {/* Legend Badges */}
              <div className="flex flex-wrap items-center gap-3 text-xs">
                <span className="flex items-center space-x-1">
                  <span className="w-3 h-0.5 bg-[#B8892B]"></span>
                  <span className="text-[#7A7467] font-medium">Per-Gram Spread</span>
                </span>
                <span className="flex items-center space-x-1">
                  <span className="w-3 h-0.5 bg-[#475569] border-dashed"></span>
                  <span className="text-[#7A7467] font-medium">Rolling Mean</span>
                </span>
                <span className="flex items-center space-x-1">
                  <span className="w-3 h-0.5 bg-[#DC2626]"></span>
                  <span className="text-[#DC2626] font-medium">+{zThreshold}σ (Expensive)</span>
                </span>
                <span className="flex items-center space-x-1">
                  <span className="w-3 h-0.5 bg-[#059669]"></span>
                  <span className="text-[#059669] font-medium">-{zThreshold}σ (Cheap)</span>
                </span>
              </div>
            </div>

            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartPoints} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E8DFCB" vertical={false} />
                  <XAxis dataKey="date" tick={{ fill: '#7A7467', fontSize: 10 }} minTickGap={25} />
                  <YAxis 
                    domain={['auto', 'auto']} 
                    tick={{ fill: '#7A7467', fontSize: 10 }}
                    tickFormatter={(v) => `₹${v.toFixed(1)}`}
                  />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: '#FFFDF7', 
                      borderColor: '#E8DFCB', 
                      borderRadius: '8px', 
                      fontSize: '12px' 
                    }} 
                    formatter={(val: any, name: any) => {
                      if (val === null || val === undefined) return ['N/A', name];
                      const labels: Record<string, string> = {
                        spread: `Spread (${symA} - ${symB})`,
                        mean: `Rolling Mean (${windowDays}d)`,
                        upperBand: `+${zThreshold}σ Upper Band`,
                        lowerBand: `-${zThreshold}σ Lower Band`,
                      };
                      return [`₹${Number(val).toFixed(3)} / g`, labels[String(name)] || name];
                    }}
                  />
                  {/* Upper reference band: red dotted */}
                  <Line 
                    type="monotone" 
                    dataKey="upperBand" 
                    stroke="#DC2626" 
                    strokeWidth={1.2} 
                    strokeDasharray="3 3" 
                    dot={false} 
                    name="upperBand"
                  />
                  {/* Lower reference band: green dotted */}
                  <Line 
                    type="monotone" 
                    dataKey="lowerBand" 
                    stroke="#059669" 
                    strokeWidth={1.2} 
                    strokeDasharray="3 3" 
                    dot={false} 
                    name="lowerBand"
                  />
                  {/* Rolling Mean: slate dashed */}
                  <Line 
                    type="monotone" 
                    dataKey="mean" 
                    stroke="#475569" 
                    strokeWidth={1.5} 
                    strokeDasharray="4 4" 
                    dot={false} 
                    name="mean"
                  />
                  {/* Observed Spread: solid gold line */}
                  <Line 
                    type="monotone" 
                    dataKey="spread" 
                    stroke="#B8892B" 
                    strokeWidth={2.5} 
                    dot={false} 
                    name="spread"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Explanatory Collapsible Expander */}
            <div className="mt-3 pt-3 border-t border-[#F3ECDA]">
              <button
                onClick={() => setShowExplanation(!showExplanation)}
                className="flex items-center space-x-1.5 text-xs text-[#B8892B] hover:text-[#9C7320] font-semibold cursor-pointer"
              >
                <HelpCircle className="w-3.5 h-3.5" />
                <span>Explain how to interpret this chart</span>
                {showExplanation ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>

              {showExplanation && (
                <div className="mt-2.5 p-3.5 bg-[#FAF6EC] rounded-xl border border-[#E8DFCB] text-xs text-[#7A7467] leading-relaxed space-y-1.5">
                  <p>
                    <strong>Trading Interpretation:</strong>
                  </p>
                  <ul className="list-disc pl-5 space-y-1">
                    <li>
                      When the gold spread line rises above the <strong>red upper band (+{zThreshold}σ)</strong>, Leg 1 ({symA}) is statistically expensive relative to Leg 2 ({symB}). The quantitative signal recommends: <strong>Short {symA} / Long {symB}</strong>.
                    </li>
                    <li>
                      When the gold spread line falls below the <strong>green lower band (-{zThreshold}σ)</strong>, Leg 1 ({symA}) is statistically cheap relative to Leg 2 ({symB}). The signal recommends: <strong>Long {symA} / Short {symB}</strong>.
                    </li>
                    <li>
                      <strong>Tender Avoid Zone:</strong> Positions approaching 5 business days before physical contract expiry should be rolled or closed to avoid mandatory delivery assignments.
                    </li>
                  </ul>
                </div>
              )}
            </div>
          </div>

          {/* Rolling Z-Score Subchart */}
          <div className="bg-[#FFFDF7] p-6 rounded-2xl border border-[#E8DFCB] shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-serif-title text-base font-bold text-[#2B2A26]">
                  Rolling Historical Z-Score Indicator
                </h3>
                <p className="text-xs text-[#7A7467]">
                  Normalized standard deviation distance from rolling mean (Strictly historical [t-W, t], no look-ahead).
                </p>
              </div>
              <span className="text-xs font-mono-numbers text-[#7A7467]">
                Current Z: <strong className="font-bold text-[#2B2A26]">{latestPoint.zScore !== null ? `${latestPoint.zScore.toFixed(2)}σ` : '—'}</strong>
              </span>
            </div>

            <div className="h-44 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartPoints} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E8DFCB" vertical={false} />
                  <XAxis dataKey="date" tick={{ fill: '#7A7467', fontSize: 10 }} minTickGap={25} />
                  <YAxis 
                    domain={[-3.5, 3.5]} 
                    tick={{ fill: '#7A7467', fontSize: 10 }} 
                    tickFormatter={(v) => `${v.toFixed(1)}σ`}
                  />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: '#FFFDF7', 
                      borderColor: '#E8DFCB', 
                      borderRadius: '8px', 
                      fontSize: '12px' 
                    }} 
                    formatter={(val: any) => [`${Number(val).toFixed(2)} σ`, 'Z-Score']}
                  />
                  <ReferenceLine y={zThreshold} stroke="#DC2626" strokeDasharray="3 3" label={{ value: `+${zThreshold}σ Overbought`, fill: '#DC2626', fontSize: 10 }} />
                  <ReferenceLine y={0} stroke="#94A3B8" strokeWidth={1} />
                  <ReferenceLine y={-zThreshold} stroke="#059669" strokeDasharray="3 3" label={{ value: `-${zThreshold}σ Oversold`, fill: '#059669', fontSize: 10 }} />
                  <Line type="monotone" dataKey="zScore" stroke="#B8892B" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* PRIORITY 3: Relative-Value Heatmap Matrix (inspired by reference p3_relative_value.py) */}
          <div className="bg-[#FFFDF7] p-6 rounded-2xl border border-[#E8DFCB] shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="flex items-center space-x-2">
                  <h3 className="font-serif-title text-base font-bold text-[#2B2A26]">
                    Cross-Contract Relative Value Heatmap (Z-Scores)
                  </h3>
                  <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-[#E8A317] text-white">SAMPLE DATA</span>
                </div>
                <p className="text-xs text-[#7A7467]">
                  Evaluates relative richness/cheapness across month-end contracts. Red indicates Row contract is expensive vs Column; Green indicates Cheap.
                </p>
              </div>
              <span className="text-xs text-[#7A7467] font-medium bg-[#FAF6EC] px-2.5 py-1 rounded border border-[#E8DFCB]">
                Session: {latestPoint.date}
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[#E8DFCB] text-[#7A7467]">
                    <th className="py-2 text-left font-semibold">Leg 1 (Row) \ Leg 2 (Col)</th>
                    {['GOLDTEN', 'GOLDGUINEA', 'GOLDPETAL'].map(c => (
                      <th key={c} className="py-2 px-4 text-center font-semibold font-mono-numbers">{c}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F3ECDA]">
                  {heatmapData.map(({ row, cols }) => (
                    <tr key={row} className="hover:bg-[#FAF6EC]/60 transition-colors">
                      <td className="py-3 font-bold font-mono-numbers text-[#2B2A26]">{row}</td>
                      {cols.map(({ col, z, isSelf }) => {
                        let bg = 'bg-[#FAF6EC]/50 text-[#A39D8F]';
                        let label = '—';
                        if (!isSelf && z !== null) {
                          label = `${z >= 0 ? '+' : ''}${z.toFixed(2)}σ`;
                          if (z >= zThreshold) {
                            bg = 'bg-[#DC2626]/20 text-[#DC2626] font-bold border border-[#DC2626]/30';
                          } else if (z > 0.5) {
                            bg = 'bg-[#FCA5A5]/25 text-[#B91C1C] font-semibold';
                          } else if (z <= -zThreshold) {
                            bg = 'bg-[#059669]/20 text-[#059669] font-bold border border-[#059669]/30';
                          } else if (z < -0.5) {
                            bg = 'bg-[#86EFAC]/25 text-[#15803D] font-semibold';
                          } else {
                            bg = 'bg-[#FEF3C7]/40 text-[#92400E]';
                          }
                        } else if (isSelf) {
                          label = '0.00';
                        }

                        return (
                          <td key={col} className="py-3 px-4 text-center">
                            <span className={`inline-block px-3 py-1.5 rounded-lg text-xs font-mono-numbers ${bg}`}>
                              {label}
                            </span>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-3 text-[11px] text-[#A39D8F] flex items-center justify-between">
              <span>Color coding: <strong>Red</strong> = Row Expensive (Short Row / Long Col) • <strong>Green</strong> = Row Cheap (Long Row / Short Col)</span>
              <span>Based on {windowDays}D Rolling Window</span>
            </div>
          </div>

          {/* Sizing & Hedging Details */}
          <div className="bg-[#FFFDF7] p-5 rounded-xl border border-[#E8DFCB]">
            <h4 className="text-xs font-bold uppercase tracking-wider text-[#7A7467] mb-2">Hedged Execution Parameters</h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
              <div className="p-3 bg-[#FAF6EC] rounded-lg border border-[#E8DFCB]">
                <span className="font-semibold text-[#2B2A26] block mb-1">Leg A: {symA}</span>
                <span className="text-[#7A7467]">Latest Price: ₹{latestPoint.priceA.toFixed(2)}/g</span>
                <span className="block text-[11px] text-[#A39D8F] mt-0.5">Volume: {latestPoint.volA} lots</span>
              </div>
              <div className="p-3 bg-[#FAF6EC] rounded-lg border border-[#E8DFCB]">
                <span className="font-semibold text-[#2B2A26] block mb-1">Leg B: {symB}</span>
                <span className="text-[#7A7467]">Latest Price: ₹{latestPoint.priceB.toFixed(2)}/g</span>
                <span className="block text-[11px] text-[#A39D8F] mt-0.5">Volume: {latestPoint.volB} lots</span>
              </div>
              <div className="p-3 bg-[#FAF6EC] rounded-lg border border-[#E8DFCB]">
                <span className="font-semibold text-[#2B2A26] block mb-1">Spread Net Value</span>
                <span className="font-mono-numbers font-bold text-[#B8892B]">
                  ₹{latestPoint.spread.toFixed(2)} / gram
                </span>
                <span className="block text-[11px] text-[#A39D8F] mt-0.5">
                  Action: {latestPoint.signal}
                </span>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
