import React from 'react';
import { 
  Activity, 
  ShieldCheck
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
import { MOCK_CURVE, MOCK_DECOMPOSITION } from '../mockData';

export const TermStructureTab: React.FC = () => {

  return (
    <div className="space-y-6">
      {/* Header and Overview */}
      <div className="bg-[#FFFDF7] p-6 rounded-2xl border border-[#E8DFCB] shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center space-x-2">
              <Activity className="w-5 h-5 text-[#B8892B]" />
              <h2 className="font-serif-title text-xl font-bold text-[#2B2A26]">
                Term Structure, Forward Curve & Implied Carry
              </h2>
            </div>
            <p className="text-xs text-[#7A7467] mt-1">
              Analyzing normalized futures pricing across expiry maturities to evaluate calendar carry, roll yield, and financing rates.
            </p>
          </div>

          <div className="flex items-center space-x-3">
            <span className="text-xs text-[#7A7467]">Curve Status:</span>
            <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-[#DCEBDD] text-[#3E7C59] border border-[#C4DEC7]">
              NORMAL CONTANGO (+5.95% p.a.)
            </span>
          </div>
        </div>
      </div>

      {/* Main Forward Curve Chart */}
      <div className="bg-[#FFFDF7] p-6 rounded-xl border border-[#E8DFCB] shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-serif-title text-base font-bold text-[#2B2A26]">
              MCX Gold Futures Forward Curve (INR / gram @ 999)
            </h3>
            <p className="text-xs text-[#7A7467]">
              Plotted against Days to Expiry (DTE). Ascending curve represents positive cost of carry (financing + insurance + storage).
            </p>
          </div>
          <span className="text-xs font-mono-numbers text-[#B8892B] font-semibold">
            Spot Anchor: ₹8,478.00/g
          </span>
        </div>

        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={MOCK_CURVE} margin={{ top: 15, right: 20, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E8DFCB" vertical={false} />
              <XAxis dataKey="contract" tick={{ fill: '#7A7467', fontSize: 11 }} />
              <YAxis 
                domain={[8450, 8800]} 
                tick={{ fill: '#7A7467', fontSize: 11 }} 
                tickFormatter={(v) => `₹${v}`}
              />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: '#FFFDF7', 
                  borderColor: '#E8DFCB', 
                  borderRadius: '8px', 
                  fontSize: '12px' 
                }} 
                formatter={(val: any) => [`₹${val}/g`, 'Normalized Price']}
              />
              <ReferenceLine y={8478} stroke="#7A7467" strokeDasharray="3 3" label={{ value: 'Spot Anchor (₹8,478)', fill: '#7A7467', fontSize: 10 }} />
              <Line 
                type="monotone" 
                dataKey="normPrice" 
                stroke="#B8892B" 
                strokeWidth={3} 
                dot={{ r: 5, fill: '#B8892B' }} 
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Implied Carry Matrix Table */}
      <div className="bg-[#FFFDF7] p-6 rounded-xl border border-[#E8DFCB] shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-serif-title text-base font-bold text-[#2B2A26]">
              Implied Annualized Carry Table
            </h3>
            <p className="text-xs text-[#7A7467]">
              Computed as: Carry % = [(Normalized Futures - Spot) / Spot] × (365 / DTE) × 100
            </p>
          </div>
          <span className="text-xs text-[#A39D8F]">Indian Sovereign Repo Reference: 6.50%</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-[#E8DFCB] text-[#7A7467]">
                <th className="py-2.5 text-left font-semibold">Contract</th>
                <th className="py-2.5 text-left font-semibold">Expiry Date</th>
                <th className="py-2.5 text-right font-semibold">DTE</th>
                <th className="py-2.5 text-right font-semibold">Normalized Price</th>
                <th className="py-2.5 text-right font-semibold">Basis to Spot</th>
                <th className="py-2.5 text-right font-semibold">Implied Carry (p.a.)</th>
                <th className="py-2.5 text-center font-semibold">Curve Position</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F3ECDA]">
              {MOCK_CURVE.map((c) => (
                <tr key={c.contract} className="hover:bg-[#FAF6EC]/60 transition-colors">
                  <td className="py-3 font-bold font-mono-numbers text-[#2B2A26]">{c.contract}</td>
                  <td className="py-3 font-mono-numbers text-[#7A7467]">{c.expiry}</td>
                  <td className="py-3 text-right font-mono-numbers text-[#2B2A26] font-medium">{c.dte} days</td>
                  <td className="py-3 text-right font-mono-numbers font-bold text-[#2B2A26]">₹{c.normPrice.toFixed(2)}</td>
                  <td className="py-3 text-right font-mono-numbers text-[#3E7C59] font-medium">+₹{c.basisToSpot.toFixed(2)}</td>
                  <td className="py-3 text-right font-mono-numbers font-bold text-[#B8892B]">{c.carryAnnualized.toFixed(2)}%</td>
                  <td className="py-3 text-center">
                    <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-[#DCEBDD] text-[#3E7C59]">
                      CONTANGO
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Carry Decomposition Section */}
      <div className="bg-[#FFFDF7] p-6 rounded-xl border border-[#E8DFCB] shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 mb-4">
          <div>
            <h3 className="font-serif-title text-base font-bold text-[#2B2A26]">
              Daily Price Change Decomposition (Roll-Down vs Spot Shift)
            </h3>
            <p className="text-xs text-[#7A7467]">
              Isolating genuine bullion price movement from the mechanical time-decay of futures carry along the curve.
            </p>
          </div>
          <div className="flex items-center space-x-3 text-xs">
            <span className="flex items-center space-x-1">
              <span className="w-2.5 h-2.5 rounded-sm bg-[#B8892B]"></span>
              <span className="text-[#7A7467]">Roll-Down Carry Decay</span>
            </span>
            <span className="flex items-center space-x-1">
              <span className="w-2.5 h-2.5 rounded-sm bg-[#2F3E5C]"></span>
              <span className="text-[#7A7467]">Genuine Spot Shift</span>
            </span>
          </div>
        </div>

        <div className="h-56 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={MOCK_DECOMPOSITION} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E8DFCB" vertical={false} />
              <XAxis dataKey="date" tick={{ fill: '#7A7467', fontSize: 11 }} />
              <YAxis tick={{ fill: '#7A7467', fontSize: 11 }} tickFormatter={(v) => `₹${v}`} />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: '#FFFDF7', 
                  borderColor: '#E8DFCB', 
                  borderRadius: '8px', 
                  fontSize: '12px' 
                }} 
              />
              <Bar dataKey="carryDecay" fill="#B8892B" radius={[2, 2, 0, 0]} name="Carry Decay (INR/g)" />
              <Bar dataKey="spotShift" fill="#2F3E5C" radius={[2, 2, 0, 0]} name="Spot Shift (INR/g)" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="mt-3 p-3 bg-[#FAF6EC] rounded-lg border border-[#E8DFCB] text-xs text-[#7A7467] flex items-center space-x-2">
          <ShieldCheck className="w-4 h-4 text-[#3E7C59] flex-shrink-0" />
          <span>
            <strong>Takeaway:</strong> Daily futures return is not pure gold direction. Holding long futures incurs ~₹1.24/g daily carry drag under current 6% interest rate regimes.
          </span>
        </div>
      </div>
    </div>
  );
};
