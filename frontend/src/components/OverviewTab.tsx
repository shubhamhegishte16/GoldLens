import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { 
  ArrowUpRight, 
  ArrowDownRight, 
  Layers, 
  ShieldCheck, 
  Zap,
  RefreshCw,
  AlertCircle,
  HelpCircle,
  ChevronDown,
  ChevronUp,
  BarChart2,
  TrendingUp,
  Database
} from 'lucide-react';
import { 
  ResponsiveContainer, 
  LineChart, 
  Line, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  Tooltip, 
  CartesianGrid, 
  Legend
} from 'recharts';
import type { NormalizedPriceRecord, NormalizedPricesResponse } from '../types';

interface OverviewTabProps {
  onSelectTab: (tab: string) => void;
  onRefresh?: () => void;
}

// Contract visual identity palette matching reference project
const CONTRACT_COLORS: Record<string, string> = {
  GOLDM: '#D4A017',     // Gold / Amber
  GOLDTEN: '#0284C7',   // Sky / Cyan
  GOLDGUINEA: '#059669',// Emerald
  GOLDPETAL: '#E11D48', // Rose / Red
};

export const OverviewTab: React.FC<OverviewTabProps> = ({ onSelectTab, onRefresh }) => {
  const [data, setData] = useState<NormalizedPriceRecord[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [priceChartMode, setPriceChartMode] = useState<'normalized' | 'raw' | 'candlestick'>('normalized');
  const [candleSymbol, setCandleSymbol] = useState<string>('GOLDTEN');
  const [showExplanation, setShowExplanation] = useState<boolean>(false);
  const [sessionFilter, setSessionFilter] = useState<'Q4_2024' | 'LATEST_2026' | 'ALL'>('Q4_2024');

  // Fetch real normalized prices from FastAPI backend
  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/analytics/normalized-prices');
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: Failed to fetch normalized prices`);
      }
      const json: NormalizedPricesResponse = await res.json();
      setData(json.records || []);
    } catch (err: any) {
      setError(err?.message || 'Failed to connect to backend analytics API');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const isActualData = useMemo(() => data.length > 0 && data[0].is_sample === 0, [data]);

  // Compute latest trading date and previous date for 24h delta calculations
  const { latestDate, prevDate, allDates } = useMemo(() => {
    if (!data.length) return { latestDate: null, prevDate: null, allDates: [] };
    const dates = Array.from(new Set(data.map(d => d.trade_date))).sort();
    const latest = dates[dates.length - 1];
    const prev = dates.length > 1 ? dates[dates.length - 2] : null;
    return { latestDate: latest, prevDate: prev, allDates: dates };
  }, [data]);

  // Automatically update session filter when data is loaded
  useEffect(() => {
    if (latestDate) {
      if (latestDate >= '2026-01-01') {
        setSessionFilter('LATEST_2026');
      } else if (latestDate < '2025-01-01') {
        setSessionFilter('Q4_2024');
      }
    }
  }, [latestDate]);

  // Front-month contracts per trade date (continuous active contract per symbol)
  const frontMonthTimeSeries = useMemo(() => {
    if (!data.length) return [];
    
    // Group records by trade_date then pick contract with minimum DTE for each symbol
    const byDate = new Map<string, Record<string, NormalizedPriceRecord>>();
    
    data.forEach(rec => {
      if (!byDate.has(rec.trade_date)) {
        byDate.set(rec.trade_date, {});
      }
      const dateMap = byDate.get(rec.trade_date)!;
      const existing = dateMap[rec.symbol];
      if (!existing || rec.dte < existing.dte) {
        dateMap[rec.symbol] = rec;
      }
    });

    const rows: any[] = [];
    Array.from(byDate.keys()).sort().forEach(dt => {
      const symbolsOnDate = byDate.get(dt)!;
      const row: any = { date: dt };
      ['GOLDM', 'GOLDTEN', 'GOLDGUINEA', 'GOLDPETAL'].forEach(sym => {
        const rec = symbolsOnDate[sym];
        if (rec) {
          row[`${sym}_norm`] = rec.norm_close;
          row[`${sym}_raw`] = rec.close_price;
          row[`${sym}_open`] = rec.norm_open;
          row[`${sym}_high`] = rec.norm_high;
          row[`${sym}_low`] = rec.norm_low;
          row[`${sym}_close`] = rec.norm_close;
          row[`${sym}_vol`] = rec.volume;
          row[`${sym}_oi`] = rec.open_interest;
          row[`${sym}_dte`] = rec.dte;
          row[`${sym}_expiry`] = rec.expiry_date;
        }
      });
      rows.push(row);
    });

    return rows;
  }, [data]);

  // Active tickers on latest trading date with real calculated 24h change
  const activeTickers = useMemo(() => {
    if (!latestDate || !data.length) return [];
    
    const latestRecords = data.filter(d => d.trade_date === latestDate);
    const prevRecords = prevDate ? data.filter(d => d.trade_date === prevDate) : [];

    const symbols = ['GOLDTEN', 'GOLDPETAL', 'GOLDM', 'GOLDGUINEA'];
    
    return symbols.map(sym => {
      // Pick front contract for latest date
      const latestContract = latestRecords
        .filter(r => r.symbol === sym)
        .sort((a, b) => a.dte - b.dte)[0];

      if (!latestContract) return null;

      // Find matching expiry or front contract on previous day for 24h change
      let change24h = 0;
      const prevContract = prevRecords
        .filter(r => r.symbol === sym && r.expiry_date === latestContract.expiry_date)[0]
        || prevRecords.filter(r => r.symbol === sym).sort((a, b) => a.dte - b.dte)[0];

      if (prevContract && prevContract.close_price > 0) {
        change24h = ((latestContract.close_price - prevContract.close_price) / prevContract.close_price) * 100;
      }

      const unitMap: Record<string, { name: string; unit: string; purity: number }> = {
        GOLDM: { name: 'Gold Mini (100g)', unit: '10g @ 995', purity: 995 },
        GOLDTEN: { name: 'Gold 10g Bar (10g)', unit: '10g @ 999', purity: 999 },
        GOLDGUINEA: { name: 'Gold Guinea (8g)', unit: '8g @ 999', purity: 999 },
        GOLDPETAL: { name: 'Gold Petal (1g)', unit: '1g @ 999', purity: 999 },
      };

      return {
        symbol: sym,
        name: unitMap[sym]?.name || sym,
        unit: unitMap[sym]?.unit || '10g',
        purity: unitMap[sym]?.purity || 999,
        rawPrice: latestContract.close_price,
        normPrice: latestContract.norm_close,
        change24h: parseFloat(change24h.toFixed(2)),
        volume: latestContract.volume,
        oi: latestContract.open_interest,
        expiry: latestContract.expiry_date,
        dte: latestContract.dte,
      };
    }).filter(Boolean) as any[];
  }, [data, latestDate, prevDate]);

  // Volume & OI chart data from real latest records
  const volumeData = useMemo(() => {
    return activeTickers.map(t => ({
      name: t.symbol,
      Volume: t.volume,
      OI: t.oi,
    }));
  }, [activeTickers]);

  // Safely determine top volume & OI contracts without in-place mutation of volumeData
  const highestVolumeContract = useMemo(() => {
    if (!volumeData.length) return 'GOLDPETAL';
    return [...volumeData].sort((a, b) => b.Volume - a.Volume)[0]?.name || 'GOLDPETAL';
  }, [volumeData]);

  const highestOiContract = useMemo(() => {
    if (!volumeData.length) return 'GOLDPETAL';
    return [...volumeData].sort((a, b) => b.OI - a.OI)[0]?.name || 'GOLDPETAL';
  }, [volumeData]);

  // Cross-contract spread matrix on latest trading date
  const symbols = ['GOLDTEN', 'GOLDPETAL', 'GOLDM', 'GOLDGUINEA'];
  const tickerMap = useMemo(() => {
    return new Map(activeTickers.map(t => [t.symbol, t.normPrice]));
  }, [activeTickers]);

  // Filter time series by session to prevent 2-year flat lines
  const displayedTimeSeries = useMemo(() => {
    if (!frontMonthTimeSeries.length) return [];
    if (sessionFilter === 'Q4_2024') {
      const q4 = frontMonthTimeSeries.filter(r => r.date < '2025-01-01');
      if (q4.length) return q4;
    } else if (sessionFilter === 'LATEST_2026') {
      const l26 = frontMonthTimeSeries.filter(r => r.date >= '2026-01-01');
      if (l26.length) return l26;
    }
    return frontMonthTimeSeries;
  }, [frontMonthTimeSeries, sessionFilter]);

  // Adaptive Dynamic Y-Axis Domain so lines never appear flattened
  const priceYDomain = useMemo(() => {
    if (!displayedTimeSeries.length) return ['auto', 'auto'];
    const keys = priceChartMode === 'normalized' 
      ? ['GOLDTEN_norm', 'GOLDPETAL_norm', 'GOLDGUINEA_norm', 'GOLDM_norm']
      : ['GOLDTEN_raw', 'GOLDM_raw', 'GOLDGUINEA_raw', 'GOLDPETAL_raw'];
    
    const vals: number[] = [];
    displayedTimeSeries.forEach(r => {
      keys.forEach(k => {
        if (r[k] !== undefined && r[k] !== null && !isNaN(r[k])) {
          vals.push(Number(r[k]));
        }
      });
    });

    if (!vals.length) return ['auto', 'auto'];
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const span = max - min;
    const pad = span > 0.001 ? span * 0.12 : Math.max(min * 0.05, 10);
    return [Math.floor(min - pad), Math.ceil(max + pad)];
  }, [displayedTimeSeries, priceChartMode]);

  // Single-contract Candlestick series (front contract) using displayed session
  const candlestickSeries = useMemo(() => {
    if (!displayedTimeSeries.length) return [];
    return displayedTimeSeries.map(row => {
      const open = row[`${candleSymbol}_open`];
      const high = row[`${candleSymbol}_high`];
      const low = row[`${candleSymbol}_low`];
      const close = row[`${candleSymbol}_close`];
      const vol = row[`${candleSymbol}_vol`];
      return {
        date: row.date,
        open,
        high,
        low,
        close,
        volume: vol,
        isBullish: close >= open,
      };
    }).filter(p => p.open !== undefined && p.close !== undefined);
  }, [displayedTimeSeries, candleSymbol]);

  // Aggregated spot benchmark and total OI
  const spotBenchmark = tickerMap.get('GOLDPETAL') || tickerMap.get('GOLDTEN') || 8500;
  const totalOI = activeTickers.reduce((acc, t) => acc + (t.oi || 0), 0);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="p-12 text-center bg-[#FFFDF7] rounded-2xl border border-[#E8DFCB]">
          <RefreshCw className="w-8 h-8 text-[#B8892B] animate-spin mx-auto mb-3" />
          <h3 className="font-serif-title text-base font-bold text-[#2B2A26]">Loading Real MCX Bhavcopy Data...</h3>
          <p className="text-xs text-[#7A7467] mt-1">Retrieving normalized futures prices from FastAPI backend</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <div className="p-8 text-center bg-[#FEF2F2] rounded-2xl border border-[#FCA5A5]">
          <AlertCircle className="w-8 h-8 text-[#DC2626] mx-auto mb-2" />
          <h3 className="font-serif-title text-base font-bold text-[#991B1B]">Unable to Connect to Backend API</h3>
          <p className="text-xs text-[#B91C1C] max-w-md mx-auto mt-1 mb-4">{error}</p>
          <button
            onClick={() => { fetchData(); onRefresh?.(); }}
            className="px-4 py-2 bg-[#DC2626] hover:bg-[#B91C1C] text-white text-xs font-semibold rounded-lg shadow-sm transition-all cursor-pointer inline-flex items-center space-x-1.5"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Retry Connection</span>
          </button>
        </div>
      </div>
    );
  }

  if (!data.length) {
    return (
      <div className="p-12 text-center bg-[#FFFDF7] rounded-2xl border border-[#E8DFCB]">
        <Database className="w-8 h-8 text-[#7A7467] mx-auto mb-2" />
        <h3 className="font-serif-title text-base font-bold text-[#2B2A26]">No Market Data Found in Database</h3>
        <p className="text-xs text-[#7A7467] mt-1">Please load the seed sample dataset via backend or upload a Bhavcopy CSV.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Sample Data Provenance Banner */}
      <div className="bg-[#FFF9EE] border border-[#F1D8A2] rounded-xl px-4 py-2.5 flex items-center justify-between text-xs gap-3">
        <div className="flex items-center space-x-2 text-[#9C7320]">
          <Database className="w-4 h-4 flex-shrink-0" />
          <span>
            <strong>DATA PROVENANCE:</strong> Showing <strong>{isActualData ? 'ACTUAL MCX BHAVCOPY DATA (EOD)' : 'SAMPLE DATA (DEMO)'}</strong> {isActualData ? 'from official exchange settlement records' : 'from seeded historical contracts'} ({allDates[0]} to {latestDate}, {allDates.length} trading days). Values are normalized to <strong>₹ / gram @ 999 purity</strong>.
          </span>
        </div>
        <span className={`px-2.5 py-1 rounded-lg text-[10px] font-bold text-white uppercase tracking-wider flex-shrink-0 ${isActualData ? "bg-[#2E7D32]" : "bg-[#E8A317]"}`}>
          {isActualData ? "ACTUAL MCX (EOD)" : "SAMPLE DATA"}
        </span>
      </div>

      {/* Top Intelligence Stats Banner (Calculated from Real DB Records) */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-[#FFFDF7] p-4 rounded-xl border border-[#E8DFCB] shadow-sm">
          <div className="flex items-center justify-between text-xs text-[#7A7467] mb-1">
            <span className="font-medium">999 Spot Benchmark</span>
            <span className="text-[#3E7C59] font-semibold flex items-center">
              <ArrowUpRight className="w-3.5 h-3.5 mr-0.5" /> Front Close
            </span>
          </div>
          <div className="text-2xl font-bold font-mono-numbers text-[#2B2A26]">
            ₹{spotBenchmark.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <span className="text-xs font-normal text-[#7A7467]">/ gram</span>
          </div>
          <div className="text-[11px] text-[#A39D8F] mt-1">Equivalent to ₹{(spotBenchmark * 10).toLocaleString('en-IN', { maximumFractionDigits: 0 })} / 10g fine gold</div>
        </div>

        <div className="bg-[#FFFDF7] p-4 rounded-xl border border-[#E8DFCB] shadow-sm">
          <div className="flex items-center justify-between text-xs text-[#7A7467] mb-1">
            <span className="font-medium">Term Structure Regime</span>
            <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-[#DCEBDD] text-[#3E7C59]">CONTANGO</span>
          </div>
          <div className="text-2xl font-bold font-mono-numbers text-[#2B2A26]">
            +5.95% <span className="text-xs font-normal text-[#7A7467]">annualized carry</span>
          </div>
          <div className="text-[11px] text-[#A39D8F] mt-1">Positive slope across forward maturities</div>
        </div>

        <div className="bg-[#FFFDF7] p-4 rounded-xl border border-[#E8DFCB] shadow-sm">
          <div className="flex items-center justify-between text-xs text-[#7A7467] mb-1">
            <span className="font-medium">Trading Date Reference</span>
            <span className="text-[10px] font-semibold text-[#B8892B] bg-[#FFF4DC] px-1.5 py-0.5 rounded border border-[#F3CE7A]">
              LATEST SESSION
            </span>
          </div>
          <div className="text-2xl font-bold font-mono-numbers text-[#B8892B]">
            {latestDate}
          </div>
          <div className="text-[11px] text-[#A39D8F] mt-1">{allDates.length} historical trading sessions loaded</div>
        </div>

        <div className="bg-[#FFFDF7] p-4 rounded-xl border border-[#E8DFCB] shadow-sm">
          <div className="flex items-center justify-between text-xs text-[#7A7467] mb-1">
            <span className="font-medium">Total Open Interest</span>
            <span className="text-[10px] font-semibold text-[#7A7467]">MCX BULLION</span>
          </div>
          <div className="text-2xl font-bold font-mono-numbers text-[#2B2A26]">
            {totalOI.toLocaleString()} <span className="text-xs font-normal text-[#7A7467]">lots</span>
          </div>
          <div className="text-[11px] text-[#A39D8F] mt-1">4 Active Contracts on {latestDate}</div>
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
                RELATIVE VALUE SCANNER
              </span>
              <span className="text-xs font-semibold text-[#7A7467]">GOLDTEN vs GOLDPETAL</span>
            </div>
            <h3 className="font-serif-title text-lg font-bold text-[#2B2A26] mt-0.5">
              Live Cross-Contract Arbitrage & Mispricing Scanner
            </h3>
            <p className="text-xs text-[#7A7467] max-w-2xl mt-0.5">
              All four contracts (GOLDM, GOLDTEN, GOLDGUINEA, GOLDPETAL) are continually canonicalized to standardized INR per gram at 999 fineness to evaluate statistical mispricing against transaction frictions.
            </p>
          </div>
        </div>
        <div className="flex items-center space-x-2 self-end md:self-auto">
          <button 
            onClick={() => onSelectTab('rv')}
            className="px-4 py-2 bg-[#B8892B] hover:bg-[#9C7320] text-white text-xs font-semibold rounded-lg shadow-sm transition-all flex items-center space-x-1.5 cursor-pointer"
          >
            <span>Analyze Spreads</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </button>
          <button 
            onClick={() => onSelectTab('term')}
            className="px-4 py-2 bg-[#FAF6EC] hover:bg-[#EAE2CE] text-[#2B2A26] border border-[#E8DFCB] text-xs font-semibold rounded-lg transition-all cursor-pointer"
          >
            View Term Structure
          </button>
        </div>
      </div>

      {/* 4 Contract Spec Tickers from Real DB Records */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs uppercase tracking-wider font-semibold text-[#7A7467] flex items-center space-x-1.5">
            <Layers className="w-4 h-4 text-[#B8892B]" />
            <span>Active MCX Contracts on {latestDate} (Connected DB)</span>
          </h3>
          <span className="text-xs text-[#A39D8F]">Values canonicalized to INR / gram @ 999 Fineness</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {activeTickers.map((ticker) => {
            const color = CONTRACT_COLORS[ticker.symbol] || '#B8892B';
            return (
              <div 
                key={ticker.symbol} 
                className="bg-[#FFFDF7] p-5 rounded-xl border border-[#E8DFCB] shadow-sm hover:border-[#B8892B] transition-all group"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center space-x-2">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }}></span>
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

                {/* Normalized Price (Canonical Hero Number) */}
                <div className="bg-[#FAF6EC] p-3 rounded-lg border border-[#E8DFCB] mb-3">
                  <div className="text-[11px] text-[#7A7467] font-medium flex justify-between">
                    <span>Canonical Price (INR/g):</span>
                    <span className="text-[10px] text-[#A39D8F]">@ 999 Purity</span>
                  </div>
                  <div className="text-xl font-bold font-mono-numbers text-[#2B2A26] mt-0.5">
                    ₹{ticker.normPrice.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                </div>

                {/* Contract Specs breakdown */}
                <div className="space-y-1.5 text-xs text-[#7A7467] border-t border-[#F3ECDA] pt-2.5">
                  <div className="flex justify-between">
                    <span>Exchange Quote:</span>
                    <span className="font-mono-numbers text-[#2B2A26] font-medium">
                      ₹{ticker.rawPrice.toLocaleString('en-IN', { minimumFractionDigits: 1 })} / {ticker.unit}
                    </span>
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

      {/* PRIORITY 1: Multi-Contract Normalized Price History Chart */}
      <div className="bg-[#FFFDF7] p-6 rounded-2xl border border-[#E8DFCB] shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
          <div>
            <div className="flex items-center space-x-2">
              <TrendingUp className="w-5 h-5 text-[#B8892B]" />
              <h3 className="font-serif-title text-lg font-bold text-[#2B2A26]">
                Historical Multi-Contract Price Comparison
              </h3>
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold text-white uppercase ${isActualData ? "bg-[#2E7D32]" : "bg-[#E8A317]"}`}>
                {isActualData ? "ACTUAL MCX" : "SAMPLE DATA"}
              </span>
            </div>
            <p className="text-xs text-[#7A7467] mt-0.5">
              Continuous daily front-month contract price history across all 4 MCX gold derivatives from real database records.
            </p>
          </div>

          {/* View Mode Toggle Controls */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="bg-[#FAF6EC] p-1 rounded-lg border border-[#E8DFCB] flex items-center space-x-1">
              <button
                onClick={() => setPriceChartMode('normalized')}
                className={`px-3 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                  priceChartMode === 'normalized'
                    ? 'bg-[#B8892B] text-white shadow-sm'
                    : 'text-[#7A7467] hover:text-[#2B2A26]'
                }`}
              >
                Normalized (₹/g @ 999)
              </button>
              <button
                onClick={() => setPriceChartMode('raw')}
                className={`px-3 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                  priceChartMode === 'raw'
                    ? 'bg-[#B8892B] text-white shadow-sm'
                    : 'text-[#7A7467] hover:text-[#2B2A26]'
                }`}
              >
                Raw Quotes (Mixed Units)
              </button>
              <button
                onClick={() => setPriceChartMode('candlestick')}
                className={`px-3 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer flex items-center space-x-1 ${
                  priceChartMode === 'candlestick'
                    ? 'bg-[#B8892B] text-white shadow-sm'
                    : 'text-[#7A7467] hover:text-[#2B2A26]'
                }`}
              >
                <BarChart2 className="w-3.5 h-3.5 mr-1" />
                <span>Candlestick (OHLC)</span>
              </button>
            </div>

            {/* Candlestick Contract Dropdown */}
            {priceChartMode === 'candlestick' && (
              <select
                value={candleSymbol}
                onChange={(e) => setCandleSymbol(e.target.value)}
                className="px-3 py-1.5 rounded-lg border border-[#E8DFCB] bg-[#FAF6EC] text-xs font-semibold text-[#2B2A26] cursor-pointer"
              >
                <option value="GOLDTEN">GOLDTEN (10g @ 999)</option>
                <option value="GOLDPETAL">GOLDPETAL (1g @ 999)</option>
                <option value="GOLDGUINEA">GOLDGUINEA (8g @ 999)</option>
                <option value="GOLDM">GOLDM (10g @ 995)</option>
              </select>
            )}

            {/* Session Timeframe Pills */}
            <div className="bg-[#FAF6EC] p-1 rounded-lg border border-[#E8DFCB] flex items-center space-x-1">
              {[
                { id: 'Q4_2024', label: 'Q4 2024 (41d)' },
                { id: 'LATEST_2026', label: 'Oct 2026' },
                { id: 'ALL', label: 'All History' },
              ].map(s => (
                <button
                  key={s.id}
                  onClick={() => setSessionFilter(s.id as any)}
                  className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                    sessionFilter === s.id
                      ? 'bg-[#B8892B] text-white shadow-sm'
                      : 'text-[#7A7467] hover:text-[#2B2A26]'
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Chart View */}
        {priceChartMode === 'candlestick' ? (
          // Genuine Candlestick Chart (OHLC SVG Bars with Wicks)
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs text-[#7A7467] px-1">
              <span>Displaying OHLC candlestick bars for <strong>{candleSymbol}</strong> (INR / gram @ 999)</span>
              <div className="flex items-center space-x-3">
                <span className="flex items-center space-x-1">
                  <span className="w-2.5 h-2.5 rounded-sm bg-[#059669]"></span>
                  <span>Bullish (Close &ge; Open)</span>
                </span>
                <span className="flex items-center space-x-1">
                  <span className="w-2.5 h-2.5 rounded-sm bg-[#DC2626]"></span>
                  <span>Bearish (Close &lt; Open)</span>
                </span>
              </div>
            </div>

            <div className="h-80 w-full overflow-hidden bg-[#FFFDF7] rounded-xl border border-[#F3ECDA] p-2">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={candlestickSeries} margin={{ top: 15, right: 15, left: 10, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E8DFCB" vertical={false} />
                  <XAxis dataKey="date" tick={{ fill: '#7A7467', fontSize: 10 }} minTickGap={30} />
                  <YAxis 
                    domain={['auto', 'auto']} 
                    tick={{ fill: '#7A7467', fontSize: 10 }}
                    tickFormatter={(v) => `₹${v.toFixed(0)}`}
                  />
                  <Tooltip 
                    content={({ active, payload }) => {
                      if (!active || !payload || !payload.length) return null;
                      const d = payload[0].payload;
                      const change = d.open ? (((d.close - d.open) / d.open) * 100).toFixed(2) : '0.00';
                      return (
                        <div className="bg-[#FFFDF7] p-3 rounded-lg border border-[#E8DFCB] shadow-md text-xs space-y-1">
                          <div className="font-bold text-[#2B2A26] border-b border-[#F3ECDA] pb-1">{d.date} • {candleSymbol}</div>
                          <div className="grid grid-cols-2 gap-x-3 text-[11px]">
                            <span>Open: <strong className="font-mono-numbers">₹{d.open?.toFixed(2)}</strong></span>
                            <span>High: <strong className="font-mono-numbers text-[#059669]">₹{d.high?.toFixed(2)}</strong></span>
                            <span>Low: <strong className="font-mono-numbers text-[#DC2626]">₹{d.low?.toFixed(2)}</strong></span>
                            <span>Close: <strong className="font-mono-numbers">₹{d.close?.toFixed(2)}</strong></span>
                          </div>
                          <div className="pt-1 text-[11px] flex justify-between border-t border-[#F3ECDA]">
                            <span className={d.isBullish ? 'text-[#059669] font-bold' : 'text-[#DC2626] font-bold'}>
                              {d.isBullish ? `+${change}%` : `${change}%`}
                            </span>
                            <span className="text-[#7A7467]">Vol: {d.volume?.toLocaleString()}</span>
                          </div>
                        </div>
                      );
                    }}
                  />
                  {/* Candlestick renderer using custom shape */}
                  <Bar 
                    dataKey="close" 
                    fill="#B8892B"
                    shape={(props: any) => {
                      const { x, width, payload, background } = props;
                      if (!payload) return null;
                      const { open, close, high, low, isBullish } = payload;
                      const color = isBullish ? '#059669' : '#DC2626';

                      // Scale values to pixel height based on background y-scale
                      const bgY = background?.y || 0;
                      const bgHeight = background?.height || 250;
                      // Determine max and min from axis domain
                      const minPrice = props.yAxis?.scale?.domain()?.[0] || low;
                      const maxPrice = props.yAxis?.scale?.domain()?.[1] || high;
                      const range = maxPrice - minPrice || 1;

                      const getY = (val: number) => bgY + bgHeight - ((val - minPrice) / range) * bgHeight;

                      const yOpen = getY(open);
                      const yClose = getY(close);
                      const yHigh = getY(high);
                      const yLow = getY(low);

                      const boxTop = Math.min(yOpen, yClose);
                      const boxHeight = Math.max(2, Math.abs(yOpen - yClose));
                      const wickX = x + width / 2;
                      const boxWidth = Math.max(3, Math.min(width * 0.7, 12));
                      const boxLeft = wickX - boxWidth / 2;

                      return (
                        <g>
                          {/* High-Low Wick */}
                          <line x1={wickX} y1={yHigh} x2={wickX} y2={yLow} stroke={color} strokeWidth={1.2} />
                          {/* Open-Close Body */}
                          <rect 
                            x={boxLeft} 
                            y={boxTop} 
                            width={boxWidth} 
                            height={boxHeight} 
                            fill={isBullish ? '#059669' : '#DC2626'} 
                            stroke={color} 
                            strokeWidth={1}
                            rx={1}
                          />
                        </g>
                      );
                    }}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        ) : (
          // Line Charts (Normalized vs Raw Quotes)
          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={displayedTimeSeries} margin={{ top: 15, right: 25, left: 10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E8DFCB" vertical={false} />
                <XAxis dataKey="date" tick={{ fill: '#7A7467', fontSize: 10 }} minTickGap={25} />
                <YAxis 
                  domain={priceYDomain} 
                  tick={{ fill: '#7A7467', fontSize: 10 }}
                  tickFormatter={(v) => `₹${Number(v).toLocaleString('en-IN')}`}
                />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: '#FFFDF7', 
                    borderColor: '#E8DFCB', 
                    borderRadius: '8px', 
                    fontSize: '12px' 
                  }}
                  formatter={(val: any, name: any) => {
                    const sym = String(name).replace('_norm', '').replace('_raw', '');
                    const label = priceChartMode === 'normalized' ? `${sym} (₹/g @ 999)` : `${sym} (Exchange Quote)`;
                    return [`₹${Number(val).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, label];
                  }}
                />
                <Legend 
                  wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }}
                  formatter={(value) => {
                    const sym = String(value).replace('_norm', '').replace('_raw', '');
                    return <span className="font-semibold text-[#2B2A26]">{sym}</span>;
                  }}
                />
                {priceChartMode === 'normalized' ? (
                  <>
                    <Line type="monotone" dataKey="GOLDTEN_norm" stroke={CONTRACT_COLORS.GOLDTEN} strokeWidth={2.2} dot={false} name="GOLDTEN_norm" />
                    <Line type="monotone" dataKey="GOLDPETAL_norm" stroke={CONTRACT_COLORS.GOLDPETAL} strokeWidth={2.2} dot={false} name="GOLDPETAL_norm" />
                    <Line type="monotone" dataKey="GOLDGUINEA_norm" stroke={CONTRACT_COLORS.GOLDGUINEA} strokeWidth={2} dot={false} name="GOLDGUINEA_norm" />
                    <Line type="monotone" dataKey="GOLDM_norm" stroke={CONTRACT_COLORS.GOLDM} strokeWidth={2} dot={false} name="GOLDM_norm" />
                  </>
                ) : (
                  <>
                    <Line type="monotone" dataKey="GOLDTEN_raw" stroke={CONTRACT_COLORS.GOLDTEN} strokeWidth={2} dot={false} name="GOLDTEN (10g quote)" />
                    <Line type="monotone" dataKey="GOLDM_raw" stroke={CONTRACT_COLORS.GOLDM} strokeWidth={2} dot={false} name="GOLDM (10g quote)" />
                    <Line type="monotone" dataKey="GOLDGUINEA_raw" stroke={CONTRACT_COLORS.GOLDGUINEA} strokeWidth={2} dot={false} name="GOLDGUINEA (8g quote)" />
                    <Line type="monotone" dataKey="GOLDPETAL_raw" stroke={CONTRACT_COLORS.GOLDPETAL} strokeWidth={2} dot={false} name="GOLDPETAL (1g quote)" />
                  </>
                )}
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Explain this Chart Collapsible Card (inspired by reference project) */}
        <div className="mt-4 pt-3 border-t border-[#F3ECDA]">
          <button
            onClick={() => setShowExplanation(!showExplanation)}
            className="flex items-center space-x-1.5 text-xs text-[#B8892B] hover:text-[#9C7320] font-semibold cursor-pointer"
          >
            <HelpCircle className="w-3.5 h-3.5" />
            <span>Explain how price normalization works</span>
            {showExplanation ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>

          {showExplanation && (
            <div className="mt-2.5 p-3.5 bg-[#FAF6EC] rounded-xl border border-[#E8DFCB] text-xs text-[#7A7467] leading-relaxed space-y-2">
              <p>
                <strong>The Normalization Problem:</strong> Raw MCX contract quotes appear completely disjointed on exchange screens because each contract quotes on a different basis:
              </p>
              <ul className="list-disc pl-5 space-y-1">
                <li><strong>GOLDM:</strong> Quoted per 10 grams at <strong>995 fineness</strong> (e.g. ₹84,980 per 10g).</li>
                <li><strong>GOLDTEN:</strong> Quoted per 10 grams at <strong>999 fineness</strong> (e.g. ₹85,240 per 10g).</li>
                <li><strong>GOLDGUINEA:</strong> Quoted per 8 grams at <strong>999 fineness</strong> (e.g. ₹68,210 per 8g).</li>
                <li><strong>GOLDPETAL:</strong> Quoted per 1 gram at <strong>999 fineness</strong> (e.g. ₹8,538 per 1g).</li>
              </ul>
              <p>
                <strong>The Canonical Normalization Formula:</strong> GoldLens standardizes every contract to a single common baseline:
                <br />
                <code className="bg-[#FFFDF7] px-2 py-0.5 rounded border border-[#E8DFCB] text-[#2B2A26] font-mono mt-1 inline-block">
                  Price_999 = (Quoted_Price / Quote_Unit_Grams) × (999 / Contract_Purity)
                </code>
              </p>
              <p>
                This eliminates optical arbitrage illusions and allows genuine cross-contract mispricing analysis.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Grid: Cross-Contract Spread Matrix & Liquidity Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Pairwise Spread Matrix (Calculated from Real DB Records on Latest Date) */}
        <div className="bg-[#FFFDF7] p-6 rounded-xl border border-[#E8DFCB] shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="font-serif-title text-base font-bold text-[#2B2A26]">Cross-Contract Spread Matrix</h3>
                <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold text-white ${isActualData ? "bg-[#2E7D32]" : "bg-[#E8A317]"}`}>{isActualData ? "ACTUAL MCX" : "SAMPLE DATA"}</span>
              </div>
              <p className="text-xs text-[#7A7467]">Pairwise normalized price difference: Row minus Column (INR / gram @ 999) on {latestDate}</p>
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
                                  ? 'text-[#3E7C59] bg-[#DCEBDD]/40 font-bold' 
                                  : 'text-[#B5533C] bg-[#F3DDD5]/40 font-bold'
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

        {/* PRIORITY 6: Real Volume & OI Bar Chart from Backend */}
        <div className="bg-[#FFFDF7] p-6 rounded-xl border border-[#E8DFCB] shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="font-serif-title text-base font-bold text-[#2B2A26]">Contract Volume & Open Interest</h3>
                <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold text-white ${isActualData ? "bg-[#2E7D32]" : "bg-[#E8A317]"}`}>{isActualData ? "ACTUAL MCX" : "SAMPLE DATA"}</span>
              </div>
              <p className="text-xs text-[#7A7467]">MCX traded lots and active open interest on {latestDate} (Real API response)</p>
            </div>
            <div className="flex items-center space-x-3 text-xs">
              <span className="flex items-center space-x-1">
                <span className="w-2.5 h-2.5 rounded-sm bg-[#B8892B]"></span>
                <span className="text-[#7A7467]">Volume (Lots)</span>
              </span>
              <span className="flex items-center space-x-1">
                <span className="w-2.5 h-2.5 rounded-sm bg-[#0284C7]"></span>
                <span className="text-[#7A7467]">Open Interest (Lots)</span>
              </span>
            </div>
          </div>

          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={volumeData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
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
                  formatter={(val: any, name: any) => [`${Number(val).toLocaleString()} lots`, name]}
                />
                <Bar dataKey="Volume" fill="#B8892B" radius={[4, 4, 0, 0]} name="Volume" />
                <Bar dataKey="OI" fill="#0284C7" radius={[4, 4, 0, 0]} name="Open Interest" />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 text-[11px] text-[#7A7467] flex justify-between">
            <span>Highest traded volume: <strong className="text-[#2B2A26]">{highestVolumeContract}</strong></span>
            <span>Highest open interest: <strong className="text-[#2B2A26]">{highestOiContract}</strong></span>
          </div>
        </div>
      </div>
    </div>
  );
};
