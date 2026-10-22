import React from 'react';
import { 
  Calendar as CalendarIcon
} from 'lucide-react';

export const CalendarTab: React.FC = () => {
  const activeContracts = [
    {
      symbol: 'GOLDTEN',
      expiry: '2025-05-30',
      dte: 34,
      status: 'ACTIVE_TRADING',
      tenderStart: '2025-05-23',
      rollWindow: '2025-05-15 to 2025-05-22',
      purity: '999 Fine',
    },
    {
      symbol: 'GOLDPETAL',
      expiry: '2025-05-30',
      dte: 34,
      status: 'ACTIVE_TRADING',
      tenderStart: '2025-05-23',
      rollWindow: '2025-05-15 to 2025-05-22',
      purity: '999 Fine',
    },
    {
      symbol: 'GOLDGUINEA',
      expiry: '2025-05-30',
      dte: 34,
      status: 'ACTIVE_TRADING',
      tenderStart: '2025-05-23',
      rollWindow: '2025-05-15 to 2025-05-22',
      purity: '999 Fine',
    },
    {
      symbol: 'GOLDM',
      expiry: '2025-06-05',
      dte: 40,
      status: 'ACTIVE_TRADING',
      tenderStart: '2025-05-29',
      rollWindow: '2025-05-20 to 2025-05-28',
      purity: '995 Fineness',
    },
    {
      symbol: 'GOLDM (Apr-25)',
      expiry: '2025-04-04',
      dte: 4,
      status: 'TENDER_AVOID_ZONE',
      tenderStart: '2025-03-28',
      rollWindow: 'EXPIRED / CLOSED',
      purity: '995 Fineness',
    },
  ];

  const holidays = [
    { date: '2025-01-26', name: 'Republic Day', day: 'Sunday' },
    { date: '2025-02-26', name: 'Mahashivratri', day: 'Wednesday' },
    { date: '2025-03-14', name: 'Holi', day: 'Friday' },
    { date: '2025-03-31', name: 'Id-Ul-Fitr', day: 'Monday' },
    { date: '2025-04-18', name: 'Good Friday', day: 'Friday' },
    { date: '2025-05-01', name: 'Maharashtra Day', day: 'Thursday' },
    { date: '2025-08-15', name: 'Independence Day', day: 'Friday' },
    { date: '2025-10-02', name: 'Gandhi Jayanti', day: 'Thursday' },
    { date: '2025-10-21', name: 'Diwali Laxmi Pujan', day: 'Tuesday' },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-[#FFFDF7] p-6 rounded-2xl border border-[#E8DFCB] shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center space-x-2">
              <CalendarIcon className="w-5 h-5 text-[#B8892B]" />
              <h2 className="font-serif-title text-xl font-bold text-[#2B2A26]">
                Contract Expiry & Delivery Cycle Master Calendar
              </h2>
            </div>
            <p className="text-xs text-[#7A7467] mt-1">
              Synchronizing differing MCX delivery schedules, tender periods, and optimal roll dates.
            </p>
          </div>
          <div className="flex items-center space-x-2">
            <span className="text-xs font-semibold px-3 py-1 rounded-full bg-[#FAF6EC] border border-[#E8DFCB] text-[#7A7467]">
              Current Horizon: 2025-2026
            </span>
          </div>
        </div>
      </div>

      {/* Cycle Architecture Comparison */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-[#FFFDF7] p-5 rounded-xl border border-[#E8DFCB] shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="font-mono-numbers font-bold text-base text-[#2B2A26]">GOLDM Delivery Cycle</span>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-[#F1E3BF] text-[#9C7320]">
              EARLY MONTH (3rd-5th)
            </span>
          </div>
          <p className="text-xs text-[#7A7467] mb-3">
            GOLDM contracts mature on the 3rd to 5th business day of the delivery month. 
            Tender period commences 5 business days prior to expiry in the preceding month.
          </p>
          <div className="p-3 bg-[#FAF6EC] rounded-lg border border-[#E8DFCB] text-xs space-y-1">
            <div className="flex justify-between">
              <span className="text-[#7A7467]">Delivery Months:</span>
              <span className="font-semibold text-[#2B2A26]">Feb, Apr, Jun, Aug, Oct, Dec (Even Months)</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#7A7467]">Delivery Unit:</span>
              <span className="font-semibold text-[#2B2A26]">100g Bar @ 995 Purity</span>
            </div>
          </div>
        </div>

        <div className="bg-[#FFFDF7] p-5 rounded-xl border border-[#E8DFCB] shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="font-mono-numbers font-bold text-base text-[#2B2A26]">GOLDTEN, GUINEA, PETAL Cycle</span>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-[#DCEBDD] text-[#3E7C59]">
              MONTH-END (27th-31st)
            </span>
          </div>
          <p className="text-xs text-[#7A7467] mb-3">
            All other size derivatives mature on the last trading day of the contract month.
            Tender period begins 5 business days prior to month-end.
          </p>
          <div className="p-3 bg-[#FAF6EC] rounded-lg border border-[#E8DFCB] text-xs space-y-1">
            <div className="flex justify-between">
              <span className="text-[#7A7467]">Delivery Months:</span>
              <span className="font-semibold text-[#2B2A26]">All 12 Calendar Months</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#7A7467]">Delivery Unit:</span>
              <span className="font-semibold text-[#2B2A26]">1g, 8g, 10g Coins/Bars @ 999 Fineness</span>
            </div>
          </div>
        </div>
      </div>

      {/* Contract Schedule Timeline Table */}
      <div className="bg-[#FFFDF7] p-6 rounded-xl border border-[#E8DFCB] shadow-sm">
        <h3 className="font-serif-title text-base font-bold text-[#2B2A26] mb-4">
          Active MCX Contracts Lifecycle & Tender Window Monitor
        </h3>

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-[#E8DFCB] text-[#7A7467]">
                <th className="py-2.5 text-left font-semibold">Contract Symbol</th>
                <th className="py-2.5 text-left font-semibold">Purity</th>
                <th className="py-2.5 text-left font-semibold">Expiry Date</th>
                <th className="py-2.5 text-right font-semibold">DTE</th>
                <th className="py-2.5 text-left font-semibold">Tender Start (Avoid Zone)</th>
                <th className="py-2.5 text-left font-semibold">Recommended Roll Window</th>
                <th className="py-2.5 text-center font-semibold">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F3ECDA]">
              {activeContracts.map((c) => (
                <tr key={c.symbol} className="hover:bg-[#FAF6EC]/60 transition-colors">
                  <td className="py-3 font-mono-numbers font-bold text-[#2B2A26]">{c.symbol}</td>
                  <td className="py-3 text-[#7A7467]">{c.purity}</td>
                  <td className="py-3 font-mono-numbers text-[#2B2A26] font-medium">{c.expiry}</td>
                  <td className="py-3 text-right font-mono-numbers font-bold text-[#2B2A26]">{c.dte}d</td>
                  <td className="py-3 font-mono-numbers text-[#B5533C]">{c.tenderStart}</td>
                  <td className="py-3 font-mono-numbers text-[#3E7C59]">{c.rollWindow}</td>
                  <td className="py-3 text-center">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      c.status === 'ACTIVE_TRADING'
                        ? 'bg-[#DCEBDD] text-[#3E7C59]'
                        : 'bg-[#F3DDD5] text-[#B5533C]'
                    }`}>
                      {c.status === 'ACTIVE_TRADING' ? 'PRIME LIQUIDITY' : 'AVOID / LIQUIDATE'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* MCX Market Holidays */}
      <div className="bg-[#FFFDF7] p-6 rounded-xl border border-[#E8DFCB] shadow-sm">
        <h3 className="font-serif-title text-base font-bold text-[#2B2A26] mb-1">
          Indian Commodity Exchange Holidays (2025)
        </h3>
        <p className="text-xs text-[#7A7467] mb-4">
          Non-trading sessions excluded from calendar spread look-back windows to prevent synthetic distortion.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {holidays.map((h) => (
            <div key={h.date} className="p-3 bg-[#FAF6EC] rounded-lg border border-[#E8DFCB] text-xs flex items-center justify-between">
              <div>
                <span className="font-semibold text-[#2B2A26] block">{h.name}</span>
                <span className="text-[11px] text-[#7A7467]">{h.day}</span>
              </div>
              <span className="font-mono-numbers text-[11px] font-bold text-[#B8892B] bg-[#FFFDF7] px-2 py-0.5 rounded border border-[#E8DFCB]">
                {h.date}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
