export interface ContractSpec {
  symbol: string;
  name: string;
  unit: string;
  quote_unit_grams: number;
  quote: string;
  purity: number;
  lot_size_grams: number;
  cycle: string;
  tender_days: number;
}

export interface MarketTicker {
  symbol: string;
  name: string;
  expiry: string;
  dte: number;
  rawPrice: number;
  normPrice: number; // INR / g @ 999
  change24h: number;
  volume: number; // lots
  oi: number; // lots
  purity: number;
  unit: string;
}

export interface SpreadDataPoint {
  date: string;
  spread: number;
  zScore: number;
  upperBand: number;
  lowerBand: number;
  mean: number;
  signal?: 'BUY_A' | 'SELL_A' | 'NEUTRAL';
}

export interface CurvePoint {
  contract: string;
  symbol: string;
  expiry: string;
  dte: number;
  normPrice: number;
  carryAnnualized: number;
  basisToSpot: number;
}

export interface BacktestParams {
  pair: string;
  window: number;
  entryZ: number;
  exitZ: number;
  stopLossINR: number;
  maxHoldDays: number;
  slippageBps: number;
  costBps: number;
}

export interface TradeRecord {
  id: string;
  entryDate: string;
  exitDate: string;
  side: 'LONG_A_SHORT_B' | 'SHORT_A_LONG_B';
  entrySpread: number;
  exitSpread: number;
  holdDays: number;
  grossPnL: number;
  netPnL: number;
  reason: 'MEAN_REVERT' | 'STOP_LOSS' | 'TIME_EXIT' | 'AVOID_ZONE';
}

export interface BacktestResult {
  totalReturnPct: number;
  sharpeRatio: number;
  maxDrawdownPct: number;
  winRatePct: number;
  profitFactor: number;
  totalTrades: number;
  equityCurve: { date: string; equity: number; drawdown: number }[];
  trades: TradeRecord[];
}

export interface SystemAlert {
  id: string;
  time: string;
  type: 'OPPORTUNITY' | 'RISK' | 'EXPIRY' | 'LIQUIDITY';
  severity: 'high' | 'medium' | 'low';
  title: string;
  description: string;
  contractPair?: string;
  metric?: string;
}
