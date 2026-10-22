import React, { useState } from 'react';
import { 
  BookOpen, 
  Calculator, 
  ShieldCheck, 
  CheckCircle2
} from 'lucide-react';
import { CONTRACT_SPECS } from '../mockData';

export const MethodologyTab: React.FC = () => {
  // Calculator state
  const [calcSymbol, setCalcSymbol] = useState('GOLDM');
  const [calcRawPrice, setCalcRawPrice] = useState<number>(84980);

  const selectedSpec = CONTRACT_SPECS[calcSymbol];
  
  // Calculate canonical price
  const pricePerQuoteGram = calcRawPrice / (selectedSpec?.quote_unit_grams || 1);
  const purityMultiplier = 999 / (selectedSpec?.purity || 999);
  const canonicalPrice = pricePerQuoteGram * purityMultiplier;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-[#FFFDF7] p-6 rounded-2xl border border-[#E8DFCB] shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center space-x-2">
              <BookOpen className="w-5 h-5 text-[#B8892B]" />
              <h2 className="font-serif-title text-xl font-bold text-[#2B2A26]">
                Methodology, Normalization Math & QA Assurance
              </h2>
            </div>
            <p className="text-xs text-[#7A7467] mt-1">
              Rigorous specifications ensuring zero look-ahead bias, mathematically rigorous cross-contract basis, and institutional auditability.
            </p>
          </div>
          <span className="text-xs font-semibold px-3 py-1 rounded-full bg-[#DCEBDD] text-[#3E7C59] border border-[#C4DEC7]">
            VERIFIED INSTITUTIONAL BENCHMARK
          </span>
        </div>
      </div>

      {/* Interactive Normalization Calculator Card */}
      <div className="bg-[#FFFDF7] p-6 rounded-2xl border border-[#E8DFCB] shadow-sm">
        <div className="flex items-center space-x-2 mb-4 pb-3 border-b border-[#F3ECDA]">
          <Calculator className="w-5 h-5 text-[#B8892B]" />
          <div>
            <h3 className="font-serif-title text-base font-bold text-[#2B2A26]">
              Interactive Canonical Normalization Calculator
            </h3>
            <p className="text-xs text-[#7A7467]">
              Verify how any raw MCX quote translates into standardized INR per gram at standard 999 fineness.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-[#2B2A26] block mb-1.5">Select Contract</label>
              <select
                value={calcSymbol}
                onChange={(e) => {
                  const s = e.target.value;
                  setCalcSymbol(s);
                  if (s === 'GOLDM') setCalcRawPrice(84980);
                  else if (s === 'GOLDTEN') setCalcRawPrice(85240);
                  else if (s === 'GOLDGUINEA') setCalcRawPrice(68210);
                  else if (s === 'GOLDPETAL') setCalcRawPrice(8538);
                }}
                className="w-full bg-[#FAF6EC] border border-[#E8DFCB] rounded-lg px-3 py-2 text-xs font-medium text-[#2B2A26]"
              >
                <option value="GOLDM">GOLDM (Gold Mini 100g, 995 Purity)</option>
                <option value="GOLDTEN">GOLDTEN (Gold 10g Bar, 999 Purity)</option>
                <option value="GOLDGUINEA">GOLDGUINEA (Gold Guinea 8g, 999 Purity)</option>
                <option value="GOLDPETAL">GOLDPETAL (Gold Petal 1g, 999 Purity)</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold text-[#2B2A26] block mb-1.5">
                Exchange Raw Quote (₹ per {selectedSpec?.quote})
              </label>
              <input
                type="number"
                value={calcRawPrice}
                onChange={(e) => setCalcRawPrice(parseFloat(e.target.value) || 0)}
                className="w-full bg-[#FAF6EC] border border-[#E8DFCB] rounded-lg px-3 py-2 text-sm font-bold font-mono-numbers text-[#2B2A26]"
              />
            </div>
          </div>

          {/* Step-by-Step Breakdown */}
          <div className="space-y-2.5 text-xs text-[#7A7467] bg-[#FAF6EC] p-4 rounded-xl border border-[#E8DFCB]">
            <span className="font-bold text-[#2B2A26] block text-xs border-b border-[#E8DFCB] pb-1.5">
              Step-by-Step Math Derivation:
            </span>
            <div className="flex justify-between">
              <span>1. Quote Unit Grams:</span>
              <span className="font-mono-numbers text-[#2B2A26] font-semibold">{selectedSpec?.quote_unit_grams}g</span>
            </div>
            <div className="flex justify-between">
              <span>2. Raw Price per Gram:</span>
              <span className="font-mono-numbers text-[#2B2A26] font-semibold">₹{pricePerQuoteGram.toFixed(2)}/g</span>
            </div>
            <div className="flex justify-between">
              <span>3. Contract Purity:</span>
              <span className="font-mono-numbers text-[#2B2A26] font-semibold">{selectedSpec?.purity} Fineness</span>
            </div>
            <div className="flex justify-between">
              <span>4. Target Benchmark:</span>
              <span className="font-mono-numbers text-[#2B2A26] font-semibold">999 Fineness</span>
            </div>
            <div className="flex justify-between">
              <span>5. Purity Multiplier (999 / {selectedSpec?.purity}):</span>
              <span className="font-mono-numbers text-[#B8892B] font-semibold">{purityMultiplier.toFixed(5)}</span>
            </div>
          </div>

          {/* Final Result Card */}
          <div className="bg-[#FAF6EC] p-5 rounded-xl border border-[#E8DFCB] flex flex-col justify-between">
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#7A7467] block mb-1">
                Canonical Normalized Price
              </span>
              <span className="text-3xl font-bold font-mono-numbers text-[#2B2A26] block">
                ₹{canonicalPrice.toFixed(2)}
              </span>
              <span className="text-xs text-[#7A7467] block mt-1">
                Standardized INR / gram @ 999 Fineness
              </span>
            </div>

            <div className="mt-4 pt-3 border-t border-[#E8DFCB] text-[11px] text-[#3E7C59] flex items-center space-x-1.5">
              <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
              <span>Ready for cross-contract spread calculation.</span>
            </div>
          </div>
        </div>
      </div>

      {/* Transaction Cost & Friction Schedule */}
      <div className="bg-[#FFFDF7] p-6 rounded-xl border border-[#E8DFCB] shadow-sm">
        <h3 className="font-serif-title text-base font-bold text-[#2B2A26] mb-2">
          MCX Commodity Derivatives Friction & Taxation Schedule
        </h3>
        <p className="text-xs text-[#7A7467] mb-4">
          All backtesting models incorporate the complete statutory and exchange fee architecture of Indian commodity derivatives.
        </p>

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-[#E8DFCB] text-[#7A7467]">
                <th className="py-2.5 text-left font-semibold">Cost Component</th>
                <th className="py-2.5 text-left font-semibold">Applicability</th>
                <th className="py-2.5 text-right font-semibold">Statutory Rate</th>
                <th className="py-2.5 text-right font-semibold">Impact on 10g (approx)</th>
                <th className="py-2.5 text-left font-semibold">Authority</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F3ECDA]">
              <tr className="hover:bg-[#FAF6EC]/60">
                <td className="py-2.5 font-semibold text-[#2B2A26]">Commodity Transaction Tax (CTT)</td>
                <td className="py-2.5 text-[#7A7467]">Sell Side Only</td>
                <td className="py-2.5 text-right font-mono-numbers text-[#2B2A26]">0.0125% (1.25 bps)</td>
                <td className="py-2.5 text-right font-mono-numbers text-[#7A7467]">₹10.65</td>
                <td className="py-2.5 text-[#7A7467]">Govt of India (CBDT)</td>
              </tr>
              <tr className="hover:bg-[#FAF6EC]/60">
                <td className="py-2.5 font-semibold text-[#2B2A26]">MCX Exchange Turnover Fee</td>
                <td className="py-2.5 text-[#7A7467]">Both Sides (Turnover)</td>
                <td className="py-2.5 text-right font-mono-numbers text-[#2B2A26]">0.0021% (0.21 bps)</td>
                <td className="py-2.5 text-right font-mono-numbers text-[#7A7467]">₹3.58</td>
                <td className="py-2.5 text-[#7A7467]">Multi Commodity Exchange</td>
              </tr>
              <tr className="hover:bg-[#FAF6EC]/60">
                <td className="py-2.5 font-semibold text-[#2B2A26]">State Stamp Duty</td>
                <td className="py-2.5 text-[#7A7467]">Buy Side Only</td>
                <td className="py-2.5 text-right font-mono-numbers text-[#2B2A26]">0.0030% (0.30 bps)</td>
                <td className="py-2.5 text-right font-mono-numbers text-[#7A7467]">₹2.55</td>
                <td className="py-2.5 text-[#7A7467]">State Revenue Dept</td>
              </tr>
              <tr className="hover:bg-[#FAF6EC]/60">
                <td className="py-2.5 font-semibold text-[#2B2A26]">SEBI Regulatory Turnover Fee</td>
                <td className="py-2.5 text-[#7A7467]">Both Sides</td>
                <td className="py-2.5 text-right font-mono-numbers text-[#2B2A26]">₹10 / crore (0.0001%)</td>
                <td className="py-2.5 text-right font-mono-numbers text-[#7A7467]">₹0.17</td>
                <td className="py-2.5 text-[#7A7467]">SEBI</td>
              </tr>
              <tr className="hover:bg-[#FAF6EC]/60">
                <td className="py-2.5 font-semibold text-[#2B2A26]">GST (Goods & Services Tax)</td>
                <td className="py-2.5 text-[#7A7467]">On Exchange + Brokerage</td>
                <td className="py-2.5 text-right font-mono-numbers text-[#2B2A26]">18.00%</td>
                <td className="py-2.5 text-right font-mono-numbers text-[#7A7467]">₹1.20</td>
                <td className="py-2.5 text-[#7A7467]">CBIC</td>
              </tr>
              <tr className="hover:bg-[#FAF6EC]/60">
                <td className="py-2.5 font-semibold text-[#2B2A26]">Execution Slippage Modeling</td>
                <td className="py-2.5 text-[#7A7467]">Bid-Ask Spread Cross</td>
                <td className="py-2.5 text-right font-mono-numbers text-[#B8892B] font-bold">2.00 - 4.00 bps</td>
                <td className="py-2.5 text-right font-mono-numbers text-[#B8892B]">₹17.00 - ₹34.00</td>
                <td className="py-2.5 text-[#7A7467]">Empirical Order Book</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Zero Look-Ahead Assurance */}
      <div className="bg-[#FFFDF7] p-6 rounded-xl border border-[#E8DFCB] shadow-sm">
        <h3 className="font-serif-title text-base font-bold text-[#2B2A26] mb-2 flex items-center space-x-2">
          <ShieldCheck className="w-5 h-5 text-[#3E7C59]" />
          <span>Zero Look-Ahead & Rigorous QA Assurance</span>
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs text-[#7A7467] mt-3">
          <div className="p-4 bg-[#FAF6EC] rounded-lg border border-[#E8DFCB]">
            <strong className="text-[#2B2A26] block mb-1">1. Walk-Forward Rolling Windows</strong>
            Z-score statistics at trade date T strictly compute mean and standard deviation from [T-window, T-1]. Future prices never contaminate historical signal generation.
          </div>
          <div className="p-4 bg-[#FAF6EC] rounded-lg border border-[#E8DFCB]">
            <strong className="text-[#2B2A26] block mb-1">2. Point-in-Time Data Provenance</strong>
            Every market record in the database stores raw Bhavcopy fields (Open, High, Low, Close, Volume, OI) unmodified, with SHA-256 ingestion provenance logging.
          </div>
          <div className="p-4 bg-[#FAF6EC] rounded-lg border border-[#E8DFCB]">
            <strong className="text-[#2B2A26] block mb-1">3. Conservative Friction Deduction</strong>
            Profits are recorded strictly after all statutory taxes (CTT, GST, stamp duty) and slippage penalties are debited, eliminating hypothetical paper returns.
          </div>
        </div>
      </div>
    </div>
  );
};
