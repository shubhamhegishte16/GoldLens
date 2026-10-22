import type { MarketTicker, ContractSpec, SpreadDataPoint, CurvePoint, SystemAlert } from './types';

export const CONTRACT_SPECS: Record<string, ContractSpec> = {
  GOLDM: {
    symbol: 'GOLDM',
    name: 'Gold Mini',
    unit: '100g',
    quote_unit_grams: 10,
    quote: '10g',
    purity: 995,
    lot_size_grams: 100,
    cycle: '3rd-5th of Delivery Month',
    tender_days: 5,
  },
  GOLDTEN: {
    symbol: 'GOLDTEN',
    name: 'Gold 10g Bar',
    unit: '10g',
    quote_unit_grams: 10,
    quote: '10g',
    purity: 999,
    lot_size_grams: 10,
    cycle: '27th-31st Month-End',
    tender_days: 5,
  },
  GOLDGUINEA: {
    symbol: 'GOLDGUINEA',
    name: 'Gold Guinea',
    unit: '8g',
    quote_unit_grams: 8,
    quote: '8g',
    purity: 999,
    lot_size_grams: 8,
    cycle: '27th-31st Month-End',
    tender_days: 5,
  },
  GOLDPETAL: {
    symbol: 'GOLDPETAL',
    name: 'Gold Petal',
    unit: '1g',
    quote_unit_grams: 1,
    quote: '1g',
    purity: 999,
    lot_size_grams: 1,
    cycle: '27th-31st Month-End',
    tender_days: 5,
  },
};

// Current Live-Simulated MCX Market Tickers
export const MOCK_TICKERS: MarketTicker[] = [
  {
    symbol: 'GOLDTEN',
    name: 'Gold 10g Bar (999)',
    expiry: '2025-05-30',
    dte: 34,
    rawPrice: 85240, // per 10g
    normPrice: 8524.0, // 85240 / 10
    change24h: 0.42,
    volume: 14250,
    oi: 42300,
    purity: 999,
    unit: '10g',
  },
  {
    symbol: 'GOLDPETAL',
    name: 'Gold Petal (999)',
    expiry: '2025-05-30',
    dte: 34,
    rawPrice: 8538, // per 1g
    normPrice: 8538.0, // 8538 / 1
    change24h: 0.58,
    volume: 89400,
    oi: 128500,
    purity: 999,
    unit: '1g',
  },
  {
    symbol: 'GOLDM',
    name: 'Gold Mini (995)',
    expiry: '2025-06-05',
    dte: 40,
    rawPrice: 84980, // per 10g at 995 purity
    normPrice: 8532.2, // (84980 / 10) * (999 / 995)
    change24h: 0.35,
    volume: 38200,
    oi: 94100,
    purity: 995,
    unit: '100g',
  },
  {
    symbol: 'GOLDGUINEA',
    name: 'Gold Guinea (999)',
    expiry: '2025-05-30',
    dte: 34,
    rawPrice: 68210, // per 8g
    normPrice: 8526.25, // 68210 / 8
    change24h: 0.39,
    volume: 9800,
    oi: 31200,
    purity: 999,
    unit: '8g',
  },
];

// Historical 60-day relative value spread data (GOLDTEN vs GOLDPETAL)
export function generateSpreadHistory(windowDays: number = 20, zThreshold: number = 2.0): SpreadDataPoint[] {
  const points: SpreadDataPoint[] = [];
  const baseDate = new Date('2025-03-01');
  const spreadValues: number[] = [];

  for (let i = 0; i < 60; i++) {
    const curDate = new Date(baseDate);
    curDate.setDate(curDate.getDate() + i);
    // skip weekends
    if (curDate.getDay() === 0 || curDate.getDay() === 6) continue;

    const dateStr = curDate.toISOString().split('T')[0];
    
    // Mean reverting oscillator around -12 INR/g with periodic structural dislocation
    const meanBasis = -14.0;
    const cycle = Math.sin(i * 0.32) * 9.5 + Math.cos(i * 0.18) * 4.2;
    // Anomaly spike on step 48
    const anomaly = i >= 45 && i <= 50 ? 8.5 : 0;
    const spread = parseFloat((meanBasis + cycle + anomaly).toFixed(2));
    spreadValues.push(spread);

    // Compute rolling mean and std
    const startIdx = Math.max(0, spreadValues.length - windowDays);
    const windowSlice = spreadValues.slice(startIdx);
    const mean = windowSlice.reduce((a, b) => a + b, 0) / windowSlice.length;
    const variance = windowSlice.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / (windowSlice.length || 1);
    const std = Math.sqrt(variance) || 1.0;
    const zScore = parseFloat(((spread - mean) / std).toFixed(2));

    const upperBand = parseFloat((mean + zThreshold * std).toFixed(2));
    const lowerBand = parseFloat((mean - zThreshold * std).toFixed(2));

    let signal: 'BUY_A' | 'SELL_A' | 'NEUTRAL' = 'NEUTRAL';
    if (zScore >= zThreshold) signal = 'SELL_A';
    else if (zScore <= -zThreshold) signal = 'BUY_A';

    points.push({
      date: dateStr,
      spread,
      zScore,
      mean: parseFloat(mean.toFixed(2)),
      upperBand,
      lowerBand,
      signal,
    });
  }
  return points;
}

// Term structure forward curve points
export const MOCK_CURVE: CurvePoint[] = [
  { contract: 'GOLDTEN (May)', symbol: 'GOLDTEN', expiry: '2025-05-30', dte: 34, normPrice: 8524.0, carryAnnualized: 5.82, basisToSpot: 46.0 },
  { contract: 'GOLDM (Jun)', symbol: 'GOLDM', expiry: '2025-06-05', dte: 40, normPrice: 8532.2, carryAnnualized: 5.95, basisToSpot: 54.2 },
  { contract: 'GOLDTEN (Jun)', symbol: 'GOLDTEN', expiry: '2025-06-30', dte: 65, normPrice: 8568.5, carryAnnualized: 6.12, basisToSpot: 90.5 },
  { contract: 'GOLDM (Aug)', symbol: 'GOLDM', expiry: '2025-08-05', dte: 101, normPrice: 8618.0, carryAnnualized: 6.24, basisToSpot: 140.0 },
  { contract: 'GOLDTEN (Aug)', symbol: 'GOLDTEN', expiry: '2025-08-29', dte: 125, normPrice: 8652.4, carryAnnualized: 6.38, basisToSpot: 174.4 },
  { contract: 'GOLDTEN (Oct)', symbol: 'GOLDTEN', expiry: '2025-10-31', dte: 188, normPrice: 8740.0, carryAnnualized: 6.55, basisToSpot: 262.0 },
];

// Carry decomposition data
export const MOCK_DECOMPOSITION = [
  { date: '2025-04-14', totalChange: 14.5, carryDecay: 1.25, spotShift: 13.25 },
  { date: '2025-04-15', totalChange: -8.2, carryDecay: 1.24, spotShift: -9.44 },
  { date: '2025-04-16', totalChange: 22.0, carryDecay: 1.25, spotShift: 20.75 },
  { date: '2025-04-17', totalChange: -4.5, carryDecay: 1.23, spotShift: -5.73 },
  { date: '2025-04-21', totalChange: 18.2, carryDecay: 3.70, spotShift: 14.50 }, // weekend jump
  { date: '2025-04-22', totalChange: 7.0, carryDecay: 1.24, spotShift: 5.76 },
  { date: '2025-04-23', totalChange: -12.4, carryDecay: 1.25, spotShift: -13.65 },
];

// Live signals & risk alerts
export const MOCK_ALERTS: SystemAlert[] = [
  {
    id: 'ALT-101',
    time: '10 mins ago',
    type: 'OPPORTUNITY',
    severity: 'high',
    title: 'Statistical Arb Signal: GOLDTEN vs GOLDPETAL',
    description: 'Rolling 20D Z-Score widened to -2.31σ. Normalized spread is INR -21.40/g vs mean INR -14.20/g. Reversion edge ~INR 7.20/g gross.',
    contractPair: 'GOLDTEN / GOLDPETAL',
    metric: 'Z = -2.31σ',
  },
  {
    id: 'ALT-102',
    time: '1 hour ago',
    type: 'RISK',
    severity: 'medium',
    title: 'Calendar Expiry Cycle Desync Warning',
    description: 'Spread calculation between GOLDM and GOLDTEN spans differing delivery cycles (5th vs 30th). Basis volatility contains calendar carry risk.',
    contractPair: 'GOLDM / GOLDTEN',
    metric: 'Cycle Mismatch',
  },
  {
    id: 'ALT-103',
    time: '3 hours ago',
    type: 'EXPIRY',
    severity: 'high',
    title: 'Tender Period Avoid Zone Approaching',
    description: 'GOLDM Apr-25 delivery notice period in 4 days. Mandatory delivery risk applies to physical holders. Algorithmic liquidations recommended.',
    contractPair: 'GOLDM Apr-25',
    metric: 'DTE = 4 Days',
  },
  {
    id: 'ALT-104',
    time: '5 hours ago',
    type: 'LIQUIDITY',
    severity: 'low',
    title: 'GOLDPETAL Liquidity Surge',
    description: 'Volume exceeded 20-day rolling 95th percentile (+240% vs average). Tightened retail spread to 0.15 INR/g.',
    contractPair: 'GOLDPETAL',
    metric: '89.4k Lots',
  },
];
