import React, { useState, useMemo } from 'react';
import { 
  AlertTriangle, 
  Scale
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
import { generateSpreadHistory, CONTRACT_SPECS } from '../mockData';

export const RelativeValueTab: React.FC = () => {
  const [selectedPair, setSelectedPair] = useState<'GOLDTEN-GOLDPETAL' | 'GOLDM-GOLDTEN' | 'GOLDTEN-GOLDGUINEA' | 'GOLDM-GOLDPETAL'>('GOLDTEN-GOLDPETAL');
  const [windowDays, setWindowDays] = useState<number>(20);
  const [zThreshold, setZThreshold] = useState<number>(2.0);

  const [symA, symB] = selectedPair.split('-');
  const specA = CONTRACT_SPECS[symA];
  const specB = CONTRACT_SPECS[symB];

  // Generate dynamic spread data based on parameters
  const spreadData = useMemo(() => {
    return generateSpreadHistory(windowDays, zThreshold);
  }, [windowDays, zThreshold, selectedPair]);

  const latestPoint = spreadData[spreadData.length - 1] || {
    spread: -14.0,
    zScore: -2.31,
    mean: -14.2,
    upperBand: -9.5,
    lowerBand: -18.9,
    signal: 'BUY_A' as const,
  };

  const isCalendarMismatch = symA === 'GOLDM' || symB === 'GOLDM';

  return (
    <div className="space-y-6">
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
              Statistically normalized pairwise arbitrage engine with rolling historical Z-Score boundaries.
            </p>
          </div>

          {/* Pair Selector Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            {[
              { id: 'GOLDTEN-GOLDPETAL', label: 'GOLDTEN / GOLDPETAL' },
              { id: 'GOLDM-GOLDTEN', label: 'GOLDM / GOLDTEN' },
              { id: 'GOLDTEN-GOLDGUINEA', label: 'GOLDTEN / GOLDGUINEA' },
              { id: 'GOLDM-GOLDPETAL', label: 'GOLDM / GOLDPETAL' },
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

        {/* Sliders for Window & Z-Threshold */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-5">
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
              <span>20d (Default Benchmark)</span>
              <span>60d (Structural Trend)</span>
            </div>
          </div>

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
              <span>±1.0σ (High Frequency)</span>
              <span>±2.0σ (95.4% Confidence)</span>
              <span>±3.0σ (Extreme Outlier)</span>
            </div>
          </div>
        </div>
      </div>

      {/* Calendar Risk Warning if GOLDM is involved */}
      {isCalendarMismatch && (
        <div className="bg-[#FCF4DD] p-4 rounded-xl border border-[#E5D2A0] text-xs text-[#9C7320] flex items-start space-x-3">
          <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <div>
            <span className="font-bold">Expiry Cycle Desynchronization Notice:</span>
            <p className="mt-0.5 text-[#7A7467]">
              GOLDM contracts expire between the 3rd and 5th of the month, whereas month-end contracts (GOLDTEN/GOLDPETAL/GUINEA) expire between the 27th and 31st.
              This introduces a ~25-day calendar basis drift. Hedged legs must account for carry and roll timing.
            </p>
          </div>
        </div>
      )}

      {/* Key Real-Time Statistical Readouts */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="bg-[#FFFDF7] p-4 rounded-xl border border-[#E8DFCB] shadow-sm">
          <span className="text-[11px] text-[#7A7467] font-medium block mb-1">Current Spread</span>
          <span className="text-xl font-bold font-mono-numbers text-[#2B2A26]">
            ₹{latestPoint.spread.toFixed(2)} <span className="text-xs font-normal text-[#7A7467]">/g</span>
          </span>
          <span className="text-[10px] text-[#A39D8F] block mt-1">Norm A minus Norm B</span>
        </div>

        <div className="bg-[#FFFDF7] p-4 rounded-xl border border-[#E8DFCB] shadow-sm">
          <span className="text-[11px] text-[#7A7467] font-medium block mb-1">Rolling Mean</span>
          <span className="text-xl font-bold font-mono-numbers text-[#7A7467]">
            ₹{latestPoint.mean.toFixed(2)} <span className="text-xs font-normal text-[#7A7467]">/g</span>
          </span>
          <span className="text-[10px] text-[#A39D8F] block mt-1">{windowDays}D Moving Average</span>
        </div>

        <div className="bg-[#FFFDF7] p-4 rounded-xl border border-[#E8DFCB] shadow-sm">
          <span className="text-[11px] text-[#7A7467] font-medium block mb-1">Rolling Z-Score</span>
          <span className={`text-xl font-bold font-mono-numbers ${
            Math.abs(latestPoint.zScore) >= zThreshold ? 'text-[#B5533C]' : 'text-[#3E7C59]'
          }`}>
            {latestPoint.zScore >= 0 ? `+${latestPoint.zScore}` : latestPoint.zScore} σ
          </span>
          <span className="text-[10px] text-[#A39D8F] block mt-1">Distance in Standard Devs</span>
        </div>

        <div className="bg-[#FFFDF7] p-4 rounded-xl border border-[#E8DFCB] shadow-sm">
          <span className="text-[11px] text-[#7A7467] font-medium block mb-1">Historical Percentile</span>
          <span className="text-xl font-bold font-mono-numbers text-[#2B2A26]">
            94.2%
          </span>
          <span className="text-[10px] text-[#A39D8F] block mt-1">Over past 60 sessions</span>
        </div>

        <div className="bg-[#FFFDF7] p-4 rounded-xl border border-[#E8DFCB] shadow-sm col-span-2 md:col-span-1">
          <span className="text-[11px] text-[#7A7467] font-medium block mb-1">Trading Signal</span>
          <span className={`inline-block px-2 py-0.5 rounded text-xs font-bold ${
            latestPoint.signal === 'BUY_A'
              ? 'bg-[#DCEBDD] text-[#3E7C59]'
              : latestPoint.signal === 'SELL_A'
                ? 'bg-[#F3DDD5] text-[#B5533C]'
                : 'bg-[#FAF6EC] text-[#7A7467] border border-[#E8DFCB]'
          }`}>
            {latestPoint.signal === 'BUY_A' ? `BUY ${symA} / SELL ${symB}` : latestPoint.signal === 'SELL_A' ? `SELL ${symA} / BUY ${symB}` : 'NEUTRAL / IN-BAND'}
          </span>
          <span className="text-[10px] text-[#A39D8F] block mt-1">Rule: Absolute Z &gt; {zThreshold}σ</span>
        </div>
      </div>

      {/* Main Historical Spread Chart */}
      <div className="bg-[#FFFDF7] p-6 rounded-xl border border-[#E8DFCB] shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-serif-title text-base font-bold text-[#2B2A26]">
              Historical Normalized Spread (INR / gram @ 999)
            </h3>
            <p className="text-xs text-[#7A7467]">
              Spread = {symA} Price (INR/g) - {symB} Price (INR/g). Solid line is observed spread; dashed line is {windowDays}D mean.
            </p>
          </div>
          <div className="flex items-center space-x-3 text-xs">
            <span className="flex items-center space-x-1">
              <span className="w-3 h-0.5 bg-[#B8892B]"></span>
              <span className="text-[#7A7467]">Observed Spread</span>
            </span>
            <span className="flex items-center space-x-1">
              <span className="w-3 h-0.5 bg-[#2F3E5C] border-dashed"></span>
              <span className="text-[#7A7467]">Rolling Mean</span>
            </span>
          </div>
        </div>

        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={spreadData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E8DFCB" vertical={false} />
              <XAxis dataKey="date" tick={{ fill: '#7A7467', fontSize: 10 }} />
              <YAxis tick={{ fill: '#7A7467', fontSize: 10 }} domain={['auto', 'auto']} />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: '#FFFDF7', 
                  borderColor: '#E8DFCB', 
                  borderRadius: '8px', 
                  fontSize: '12px' 
                }} 
              />
              <Line type="monotone" dataKey="spread" stroke="#B8892B" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="mean" stroke="#2F3E5C" strokeWidth={1.5} strokeDasharray="4 4" dot={false} />
              <Line type="monotone" dataKey="upperBand" stroke="#B5533C" strokeWidth={1} strokeDasharray="2 2" dot={false} />
              <Line type="monotone" dataKey="lowerBand" stroke="#3E7C59" strokeWidth={1} strokeDasharray="2 2" dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Rolling Z-Score Subchart */}
      <div className="bg-[#FFFDF7] p-6 rounded-xl border border-[#E8DFCB] shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-serif-title text-base font-bold text-[#2B2A26]">
              Rolling Z-Score Indicator
            </h3>
            <p className="text-xs text-[#7A7467]">
              Boundary threshold bands at ±{zThreshold}σ. Values outside bands denote mean-reversion trading opportunities.
            </p>
          </div>
          <span className="text-xs font-mono-numbers text-[#7A7467]">
            Confidence Interval: 95.4%
          </span>
        </div>

        <div className="h-48 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={spreadData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E8DFCB" vertical={false} />
              <XAxis dataKey="date" tick={{ fill: '#7A7467', fontSize: 10 }} />
              <YAxis tick={{ fill: '#7A7467', fontSize: 10 }} domain={[-3.5, 3.5]} />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: '#FFFDF7', 
                  borderColor: '#E8DFCB', 
                  borderRadius: '8px', 
                  fontSize: '12px' 
                }} 
              />
              <ReferenceLine y={zThreshold} stroke="#B5533C" strokeDasharray="3 3" label={{ value: `+${zThreshold}σ`, fill: '#B5533C', fontSize: 10 }} />
              <ReferenceLine y={0} stroke="#7A7467" strokeWidth={1} />
              <ReferenceLine y={-zThreshold} stroke="#3E7C59" strokeDasharray="3 3" label={{ value: `-${zThreshold}σ`, fill: '#3E7C59', fontSize: 10 }} />
              <Line type="monotone" dataKey="zScore" stroke="#B8892B" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Hedging & Contract Sizing Matrix */}
      <div className="bg-[#FFFDF7] p-5 rounded-xl border border-[#E8DFCB]">
        <h4 className="text-xs font-bold uppercase tracking-wider text-[#7A7467] mb-2">Hedged Lot Sizing Formula</h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
          <div className="p-3 bg-[#FAF6EC] rounded-lg border border-[#E8DFCB]">
            <span className="font-semibold text-[#2B2A26] block mb-1">Leg A: {symA} ({specA?.unit})</span>
            <span className="text-[#7A7467]">Lot Size: {specA?.lot_size_grams}g ({specA?.purity} fineness)</span>
          </div>
          <div className="p-3 bg-[#FAF6EC] rounded-lg border border-[#E8DFCB]">
            <span className="font-semibold text-[#2B2A26] block mb-1">Leg B: {symB} ({specB?.unit})</span>
            <span className="text-[#7A7467]">Lot Size: {specB?.lot_size_grams}g ({specB?.purity} fineness)</span>
          </div>
          <div className="p-3 bg-[#FAF6EC] rounded-lg border border-[#E8DFCB]">
            <span className="font-semibold text-[#2B2A26] block mb-1">Hedge Ratio</span>
            <span className="font-mono-numbers font-bold text-[#B8892B]">
              1 Lot {symA} = {(specA?.lot_size_grams / (specB?.lot_size_grams || 1)).toFixed(0)} Lots {symB}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
