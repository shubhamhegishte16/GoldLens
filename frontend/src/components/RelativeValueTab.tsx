import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  Scale,
  RefreshCw,
  AlertCircle,
  ShieldCheck,
  HelpCircle,
  ChevronDown,
  ChevronUp,
  Database,
  TrendingUp
} from 'lucide-react';
import { 
  ResponsiveContainer, 
  ComposedChart,
  Line, 
  Area,
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
  const [sessionFilter, setSessionFilter] = useState<'Q4_2024' | 'LATEST_2026' | 'ALL'>('Q4_2024');
  const [showExplanation, setShowExplanation] = useState<boolean>(false);

  const [apiData, setApiData] = useState<RelativeValueResponse | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const isActualData = apiData?.data_mode === 'ACTUAL';

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

  // Available sessions in dataset
  const availableSessions = useMemo(() => {
    if (!apiData || !apiData.spreads || !apiData.spreads.length) return [];
    const dates = apiData.spreads.map(s => s.trade_date);
    const has2024 = dates.some(d => d.startsWith('2024'));
    const has2026 = dates.some(d => d.startsWith('2026'));
    const sessions: { id: 'Q4_2024' | 'LATEST_2026' | 'ALL'; label: string; count: string }[] = [];
    if (has2024) {
      sessions.push({ id: 'Q4_2024', label: 'Q4 2024 Historical', count: '41 Sessions' });
    }
    if (has2026) {
      sessions.push({ id: 'LATEST_2026', label: 'Oct 2026 Active', count: 'Latest MCX' });
    }
    sessions.push({ id: 'ALL', label: 'All History', count: 'Full Series' });
    return sessions;
  }, [apiData]);

  // Extract distinct expiry dates available in this pair's dataset
  const availableExpiries = useMemo(() => {
    if (!apiData || !apiData.spreads) return [];
    return Array.from(new Set(apiData.spreads.map(s => s.expiry_date))).sort();
  }, [apiData]);

  // Filter series according to selected session and expiry
  const chartPoints = useMemo(() => {
    if (!apiData || !apiData.spreads || !apiData.spreads.length) return [];

    let baseSpreads = apiData.spreads;

    // Apply session filter
    if (sessionFilter === 'Q4_2024') {
      const q4 = baseSpreads.filter(s => s.trade_date < '2025-01-01');
      if (q4.length) baseSpreads = q4;
    } else if (sessionFilter === 'LATEST_2026') {
      const rec = baseSpreads.filter(s => s.trade_date >= '2026-01-01');
      if (rec.length) baseSpreads = rec;
    }

    let filtered: RelativeValueSpreadItem[] = [];

    if (selectedExpiry === 'FRONT_CONTINUOUS') {
      // For each trade date, pick front contract with lowest DTE
      const byDate = new Map<string, RelativeValueSpreadItem>();
      baseSpreads.forEach(item => {
        const existing = byDate.get(item.trade_date);
        if (!existing || (item.dte > 0 && (existing.dte <= 0 || item.dte < existing.dte))) {
          byDate.set(item.trade_date, item);
        }
      });
      filtered = Array.from(byDate.values()).sort((a, b) => a.trade_date.localeCompare(b.trade_date));
    } else {
      filtered = baseSpreads.filter(s => s.expiry_date === selectedExpiry);
      // Fallback across full dataset if not found in filtered session
      if (!filtered.length) {
        filtered = apiData.spreads.filter(s => s.expiry_date === selectedExpiry);
      }
    }

    return filtered.map(item => {
      const rollingMean = item.rolling_mean;
      const rollingStd = item.rolling_std;
      const upperBand = rollingMean !== null && rollingStd !== null 
        ? parseFloat((rollingMean + zThreshold * rollingStd).toFixed(3)) 
        : (rollingMean !== null ? parseFloat((rollingMean + zThreshold * 0.05).toFixed(3)) : null);
      const lowerBand = rollingMean !== null && rollingStd !== null 
        ? parseFloat((rollingMean - zThreshold * rollingStd).toFixed(3)) 
        : (rollingMean !== null ? parseFloat((rollingMean - zThreshold * 0.05).toFixed(3)) : null);

      return {
        date: item.trade_date,
        expiry: item.expiry_date,
        spread: item.spread_inr_g,
        mean: rollingMean,
        upperBand,
        lowerBand,
        zScore: item.zscore !== null ? item.zscore : 0.0,
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
  }, [apiData, sessionFilter, selectedExpiry, zThreshold]);

  // Latest point from real filtered series
  const latestPoint = useMemo(() => {
    if (!chartPoints.length) return null;
    return chartPoints[chartPoints.length - 1];
  }, [chartPoints]);

  // Adaptive Dynamic Y-Axis Domain so chart never appears as a flat line
  const yDomain = useMemo(() => {
    const vals = chartPoints.flatMap(p => 
      [p.spread, p.mean, p.upperBand, p.lowerBand]
        .filter((v): v is number => v !== null && !isNaN(v))
    );
    if (!vals.length) return [-5, 5];
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const span = max - min;
    const pad = span > 0.001 ? span * 0.16 : Math.max(Math.abs(min) * 0.1, 0.5);
    return [parseFloat((min - pad).toFixed(2)), parseFloat((max + pad).toFixed(2))];
  }, [chartPoints]);

  // Dynamic Z-Score axis domain
  const zDomain = useMemo(() => {
    const zVals = chartPoints.map(p => Math.abs(p.zScore)).filter(v => v !== null && !isNaN(v));
    const maxZ = zVals.length ? Math.max(...zVals) : 2.0;
    const bound = Math.max(zThreshold + 0.5, Math.min(maxZ + 0.5, 6.0));
    return [-parseFloat(bound.toFixed(1)), parseFloat(bound.toFixed(1))];
  }, [chartPoints, zThreshold]);

  // Quick 3x3 Heatmap Matrix of current Z-Scores across month-end contracts
  const heatmapData = useMemo(() => {
    const contracts = ['GOLDTEN', 'GOLDGUINEA', 'GOLDPETAL'];
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
          return { col, z: null, isSelf: false };
        })
      };
    });
  }, [latestPoint, symA, symB]);

  // Custom Stock-Market Tooltip for Spread Chart
  const CustomSpreadTooltip = ({ active, payload }: any) => {
    if (!active || !payload || !payload.length) return null;
    const d = payload[0].payload;
    const isRich = d.zScore >= zThreshold;
    const isCheap = d.zScore <= -zThreshold;
    return (
      <div className="bg-[#FFFDF7] p-3.5 rounded-xl border border-[#E8DFCB] shadow-lg text-xs space-y-1.5 min-w-[220px]">
        <div className="flex items-center justify-between border-b border-[#F3ECDA] pb-1.5">
          <span className="font-bold text-[#2B2A26]">{d.date}</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#FAF6EC] text-[#7A7467] border border-[#E8DFCB] font-mono">
            Exp: {d.expiry} ({d.dte}d)
          </span>
        </div>
        <div className="space-y-1">
          <div className="flex justify-between items-center">
            <span className="text-[#7A7467]">Spread ({symA} - {symB}):</span>
            <span className="font-bold font-mono-numbers text-[#B8892B] text-sm">
              ₹{Number(d.spread).toFixed(3)} /g
            </span>
          </div>
          <div className="flex justify-between items-center text-[11px]">
            <span className="text-[#7A7467]">Rolling Mean ({windowDays}d):</span>
            <span className="font-mono-numbers text-[#475569] font-medium">
              {d.mean !== null ? `₹${Number(d.mean).toFixed(3)} /g` : '—'}
            </span>
          </div>
          <div className="flex justify-between items-center text-[11px]">
            <span className="text-[#7A7467]">Z-Bands (±{zThreshold}σ):</span>
            <span className="font-mono-numbers text-[10px]">
              <span className="text-[#059669]">₹{Number(d.lowerBand).toFixed(2)}</span> / <span className="text-[#DC2626]">₹{Number(d.upperBand).toFixed(2)}</span>
            </span>
          </div>
          <div className="flex justify-between items-center text-[11px]">
            <span className="text-[#7A7467]">Rolling Z-Score:</span>
            <span className={`font-mono-numbers font-bold px-1.5 py-0.5 rounded text-[10px] ${
              isRich ? 'bg-[#FDE8E8] text-[#DC2626]' : isCheap ? 'bg-[#DCEBDD] text-[#059669]' : 'bg-[#FAF6EC] text-[#475569]'
            }`}>
              {d.zScore >= 0 ? '+' : ''}{Number(d.zScore).toFixed(2)} σ
            </span>
          </div>
        </div>
        <div className="border-t border-[#F3ECDA] pt-1.5 text-[10px] text-[#A39D8F] flex justify-between">
          <span>{symA}: ₹{Number(d.priceA).toFixed(1)}/g</span>
          <span>{symB}: ₹{Number(d.priceB).toFixed(1)}/g</span>
        </div>
      </div>
    );
  };

  // Custom Stock-Market Tooltip for Z-Score Oscillator
  const CustomZScoreTooltip = ({ active, payload }: any) => {
    if (!active || !payload || !payload.length) return null;
    const d = payload[0].payload;
    const isOverbought = d.zScore >= zThreshold;
    const isOversold = d.zScore <= -zThreshold;
    return (
      <div className="bg-[#FFFDF7] p-2.5 rounded-lg border border-[#E8DFCB] shadow-md text-xs space-y-1 min-w-[180px]">
        <div className="font-bold text-[#2B2A26] border-b border-[#F3ECDA] pb-1 flex justify-between">
          <span>{d.date}</span>
          <span className="text-[10px] text-[#7A7467] font-normal">{d.expiry}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-[#7A7467]">Z-Score:</span>
          <span className={`font-bold font-mono-numbers ${
            isOverbought ? 'text-[#DC2626]' : isOversold ? 'text-[#059669]' : 'text-[#0284C7]'
          }`}>
            {d.zScore >= 0 ? '+' : ''}{Number(d.zScore).toFixed(2)} σ
          </span>
        </div>
        <div className="text-[10px] text-[#7A7467]">
          {isOverbought 
            ? '🔴 Statistically Rich (Short A / Long B)' 
            : isOversold 
              ? '🟢 Statistically Cheap (Long A / Short B)' 
              : '⚪ Within Fair-Value Corridor'}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Data Provenance Banner */}
      <div className={`rounded-xl px-4 py-2.5 flex items-center justify-between text-xs border ${
        isActualData 
          ? 'bg-[#EBF5ED] border-[#B6DEC0]' 
          : 'bg-[#FFF9EE] border-[#F1D8A2]'
      }`}>
        <div className={`flex items-center space-x-2 ${isActualData ? 'text-[#236338]' : 'text-[#9C7320]'}`}>
          <Database className="w-4 h-4 flex-shrink-0" />
          <span>
            <strong>DATA PROVENANCE:</strong> Showing <strong>{isActualData ? 'ACTUAL MCX BHAVCOPY DATA (EOD)' : 'SAMPLE DATA (DEMO)'}</strong> {isActualData ? 'from official exchange settlement records' : 'from seeded historical contracts'}. Spreads calculated via <code className="bg-white/80 px-1 py-0.5 rounded border border-[#E8DFCB] font-mono">/api/analytics/relative-value</code>.
          </span>
        </div>
        <span className={`px-2 py-0.5 rounded text-[10px] font-bold text-white uppercase tracking-wider ${
          isActualData ? 'bg-[#2E7D32]' : 'bg-[#E8A317]'
        }`}>
          {isActualData ? 'ACTUAL MCX (EOD)' : 'SAMPLE DATA'}
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
              <option value="FRONT_CONTINUOUS">Continuous Front Month (All Active Dates)</option>
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
                {latestPoint.mean !== null ? `₹${latestPoint.mean.toFixed(2)} /g` : `₹${latestPoint.spread.toFixed(2)} /g`}
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
                {latestPoint.zScore !== null ? `${latestPoint.zScore >= 0 ? '+' : ''}${latestPoint.zScore.toFixed(2)} σ` : '0.00 σ'}
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
                latestPoint.signal.includes('RICH') || latestPoint.signal.includes('SHORT')
                  ? 'bg-[#FDE8E8] text-[#DC2626]'
                  : latestPoint.signal.includes('CHEAP') || latestPoint.signal.includes('LONG')
                    ? 'bg-[#DCEBDD] text-[#059669]'
                    : 'bg-[#FAF6EC] text-[#7A7467] border border-[#E8DFCB]'
              }`}>
                {latestPoint.signal === 'NEUTRAL' ? 'NEUTRAL / IN-BAND' : latestPoint.signal}
              </span>
              <span className="text-[10px] text-[#A39D8F] block mt-1">Real Model Evaluation</span>
            </div>
          </div>

          {/* MAIN RELATIVE VALUE SPREAD CHART (Stock Market / TradingView Style) */}
          <div className="bg-[#FFFDF7] p-6 rounded-2xl border border-[#E8DFCB] shadow-sm">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-4 pb-3 border-b border-[#F3ECDA]">
              <div>
                <div className="flex items-center space-x-2">
                  <TrendingUp className="w-4 h-4 text-[#B8892B]" />
                  <h3 className="font-serif-title text-base font-bold text-[#2B2A26]">
                    Normalized Spread & Reference Bands ({symA} minus {symB})
                  </h3>
                  <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold text-white ${isActualData ? "bg-[#2E7D32]" : "bg-[#E8A317]"}`}>
                    {isActualData ? "ACTUAL MCX" : "SAMPLE DATA"}
                  </span>
                </div>
                <p className="text-xs text-[#7A7467] mt-0.5">
                  Dynamic price spread per gram (999 fineness) with rolling {windowDays}D mean and ±{zThreshold.toFixed(1)}σ volatility bands.
                </p>
              </div>

              {/* Stock-Market Session / Timeframe Selector Pills */}
              <div className="flex flex-wrap items-center gap-2">
                {availableSessions.length > 1 && (
                  <div className="bg-[#FAF6EC] p-1 rounded-lg border border-[#E8DFCB] flex items-center space-x-1">
                    {availableSessions.map(sess => (
                      <button
                        key={sess.id}
                        onClick={() => setSessionFilter(sess.id)}
                        className={`px-3 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer flex items-center space-x-1 ${
                          sessionFilter === sess.id
                            ? 'bg-[#B8892B] text-white shadow-sm'
                            : 'text-[#7A7467] hover:text-[#2B2A26]'
                        }`}
                      >
                        <span>{sess.label}</span>
                      </button>
                    ))}
                  </div>
                )}

                {/* Legend Badges */}
                <div className="hidden lg:flex items-center gap-3 text-[11px] pl-2 border-l border-[#E8DFCB]">
                  <span className="flex items-center space-x-1">
                    <span className="w-3 h-1 rounded-full bg-[#B8892B]"></span>
                    <span className="text-[#7A7467] font-medium">Spread</span>
                  </span>
                  <span className="flex items-center space-x-1">
                    <span className="w-3 h-0.5 bg-[#475569] border-dashed"></span>
                    <span className="text-[#7A7467] font-medium">Mean</span>
                  </span>
                  <span className="flex items-center space-x-1">
                    <span className="w-2.5 h-2.5 rounded-sm bg-[#DC2626]/20 border border-[#DC2626]"></span>
                    <span className="text-[#DC2626] font-medium">+{zThreshold}σ</span>
                  </span>
                  <span className="flex items-center space-x-1">
                    <span className="w-2.5 h-2.5 rounded-sm bg-[#059669]/20 border border-[#059669]"></span>
                    <span className="text-[#059669] font-medium">-{zThreshold}σ</span>
                  </span>
                </div>
              </div>
            </div>

            {/* Main Interactive Chart with Area Gradient & Adaptive Scaling */}
            <div className="h-80 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartPoints} margin={{ top: 15, right: 25, left: 10, bottom: 5 }}>
                  <defs>
                    {/* Glowing gold gradient under spread curve */}
                    <linearGradient id="spreadAreaGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#B8892B" stopOpacity={0.28} />
                      <stop offset="95%" stopColor="#B8892B" stopOpacity={0.0} />
                    </linearGradient>
                    {/* Volatility Channel Gradient */}
                    <linearGradient id="bandCorridorGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#DC2626" stopOpacity={0.07} />
                      <stop offset="50%" stopColor="#64748B" stopOpacity={0.02} />
                      <stop offset="100%" stopColor="#059669" stopOpacity={0.07} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E8DFCB" vertical={false} />
                  <XAxis 
                    dataKey="date" 
                    tick={{ fill: '#7A7467', fontSize: 10 }} 
                    minTickGap={25} 
                  />
                  <YAxis 
                    domain={yDomain} 
                    tick={{ fill: '#7A7467', fontSize: 10 }}
                    tickFormatter={(v) => `₹${Number(v).toFixed(2)}`}
                  />
                  <Tooltip 
                    content={<CustomSpreadTooltip />}
                    cursor={{ stroke: '#B8892B', strokeWidth: 1, strokeDasharray: '4 4' }}
                  />
                  {/* Zero reference line */}
                  <ReferenceLine y={0} stroke="#CBD5E1" strokeWidth={1} strokeDasharray="2 2" />

                  {/* Volatility Band Corridor Area */}
                  <Area 
                    type="monotone" 
                    dataKey="upperBand" 
                    fill="url(#bandCorridorGrad)" 
                    stroke="none" 
                    isAnimationActive={false}
                  />

                  {/* Upper reference band: red dashed line */}
                  <Line 
                    type="monotone" 
                    dataKey="upperBand" 
                    stroke="#DC2626" 
                    strokeWidth={1.5} 
                    strokeDasharray="3 3" 
                    dot={false} 
                    name="upperBand"
                  />
                  {/* Lower reference band: green dashed line */}
                  <Line 
                    type="monotone" 
                    dataKey="lowerBand" 
                    stroke="#059669" 
                    strokeWidth={1.5} 
                    strokeDasharray="3 3" 
                    dot={false} 
                    name="lowerBand"
                  />
                  {/* Rolling Mean: slate dashed line */}
                  <Line 
                    type="monotone" 
                    dataKey="mean" 
                    stroke="#475569" 
                    strokeWidth={1.8} 
                    strokeDasharray="4 4" 
                    dot={false} 
                    name="mean"
                  />
                  {/* Observed Spread: solid gold line with gradient area fill */}
                  <Area 
                    type="monotone" 
                    dataKey="spread" 
                    stroke="#B8892B" 
                    strokeWidth={2.5} 
                    fill="url(#spreadAreaGrad)" 
                    dot={{ r: 2.5, fill: '#B8892B', strokeWidth: 0 }} 
                    activeDot={{ r: 6, fill: '#D4A017', stroke: '#FFF', strokeWidth: 2 }} 
                    name="spread"
                  />
                </ComposedChart>
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

          {/* ROLLING Z-SCORE OSCILLATOR (RSI / MACD Financial Oscillator Style) */}
          <div className="bg-[#FFFDF7] p-6 rounded-2xl border border-[#E8DFCB] shadow-sm">
            <div className="flex items-center justify-between mb-4 pb-2 border-b border-[#F3ECDA]">
              <div>
                <h3 className="font-serif-title text-base font-bold text-[#2B2A26]">
                  Rolling Historical Z-Score Indicator
                </h3>
                <p className="text-xs text-[#7A7467]">
                  Normalized standard deviation distance from rolling mean (Strictly historical [t-W, t], no look-ahead).
                </p>
              </div>
              <span className="text-xs font-mono-numbers text-[#7A7467]">
                Current Z: <strong className="font-bold text-[#2B2A26]">{latestPoint.zScore !== null ? `${latestPoint.zScore.toFixed(2)}σ` : '0.00σ'}</strong>
              </span>
            </div>

            <div className="h-44 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartPoints} margin={{ top: 10, right: 25, left: 10, bottom: 5 }}>
                  <defs>
                    <linearGradient id="zscoreGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#0284C7" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#0284C7" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E8DFCB" vertical={false} />
                  <XAxis dataKey="date" tick={{ fill: '#7A7467', fontSize: 10 }} minTickGap={25} />
                  <YAxis 
                    domain={zDomain} 
                    tick={{ fill: '#7A7467', fontSize: 10 }} 
                    tickFormatter={(v) => `${Number(v).toFixed(1)}σ`}
                  />
                  <Tooltip 
                    content={<CustomZScoreTooltip />}
                    cursor={{ stroke: '#0284C7', strokeWidth: 1, strokeDasharray: '4 4' }}
                  />
                  {/* Overbought threshold line */}
                  <ReferenceLine 
                    y={zThreshold} 
                    stroke="#DC2626" 
                    strokeDasharray="3 3" 
                    label={{ value: `+${zThreshold}σ Overbought`, fill: '#DC2626', fontSize: 10, position: 'insideTopRight' }} 
                  />
                  {/* Center zero line */}
                  <ReferenceLine y={0} stroke="#94A3B8" strokeWidth={1} strokeDasharray="2 2" />
                  {/* Oversold threshold line */}
                  <ReferenceLine 
                    y={-zThreshold} 
                    stroke="#059669" 
                    strokeDasharray="3 3" 
                    label={{ value: `-${zThreshold}σ Oversold`, fill: '#059669', fontSize: 10, position: 'insideBottomRight' }} 
                  />
                  {/* Oscillator curve with cyan gradient fill */}
                  <Area 
                    type="monotone" 
                    dataKey="zScore" 
                    stroke="#0284C7" 
                    strokeWidth={2} 
                    fill="url(#zscoreGrad)" 
                    dot={{ r: 2, fill: '#0284C7' }} 
                    activeDot={{ r: 5, fill: '#0284C7', stroke: '#FFF', strokeWidth: 2 }} 
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* PRIORITY 3: Relative-Value Heatmap Matrix (inspired by reference p3_relative_value.py) */}
          <div className="bg-[#FFFDF7] p-6 rounded-2xl border border-[#E8DFCB] shadow-sm">
            <div className="flex items-center justify-between mb-4 pb-2 border-b border-[#F3ECDA]">
              <div>
                <h3 className="font-serif-title text-base font-bold text-[#2B2A26]">
                  Cross-Contract Cheap / Expensive Matrix (Z-Scores)
                </h3>
                <p className="text-xs text-[#7A7467]">
                  Instant pairwise relative mispricing on latest session ({latestPoint.date}). Red = Row contract expensive vs Column; Green = Row contract cheap vs Column.
                </p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[#E8DFCB]">
                    <th className="text-left py-2 px-3 text-[#7A7467] font-semibold">Leg 1 (Row) \ Leg 2 (Col)</th>
                    {['GOLDTEN', 'GOLDGUINEA', 'GOLDPETAL'].map(col => (
                      <th key={col} className="text-center py-2 px-3 font-mono-numbers font-bold text-[#2B2A26]">
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {heatmapData.map(({ row, cols }) => (
                    <tr key={row} className="border-b border-[#F3ECDA] hover:bg-[#FAF6EC] transition-colors">
                      <td className="py-2.5 px-3 font-mono-numbers font-bold text-[#2B2A26] bg-[#FAF6EC]/50">
                        {row}
                      </td>
                      {cols.map(({ col, z, isSelf }) => {
                        if (isSelf) {
                          return (
                            <td key={col} className="text-center py-2.5 px-3 text-[#A39D8F] font-mono-numbers bg-[#F5EFE1]/40">
                              0.00
                            </td>
                          );
                        }
                        if (z === null) {
                          return (
                            <td key={col} className="text-center py-2.5 px-3 text-[#A39D8F] font-mono-numbers">
                              —
                            </td>
                          );
                        }
                        const isExpensive = z >= zThreshold;
                        const isCheap = z <= -zThreshold;
                        return (
                          <td 
                            key={col} 
                            className={`text-center py-2.5 px-3 font-mono-numbers font-bold transition-all ${
                              isExpensive 
                                ? 'bg-[#FDE8E8] text-[#DC2626]' 
                                : isCheap 
                                  ? 'bg-[#DCEBDD] text-[#059669]' 
                                  : 'text-[#475569]'
                            }`}
                          >
                            {z >= 0 ? '+' : ''}{z.toFixed(2)}σ
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between text-[11px] text-[#7A7467] mt-3 pt-2 border-t border-[#F3ECDA]">
              <span>Diagonal = 0.00 (Self). Off-diagonals show statistical edge vs historical mean.</span>
              <span className="font-semibold text-[#B8892B]">Signal Threshold: ±{zThreshold.toFixed(1)}σ</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
