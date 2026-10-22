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

export interface NormalizedPriceRecord {
  trade_date: string;
  symbol: string;
  expiry_date: string;
  dte: number;
  open_price: number;
  high_price: number;
  low_price: number;
  close_price: number;
  norm_open: number;
  norm_high: number;
  norm_low: number;
  norm_close: number;
  volume: number;
  open_interest: number;
  is_sample: number;
}

export interface NormalizedPricesResponse {
  count: number;
  normalization_formula: string;
  target_unit: string;
  records: NormalizedPriceRecord[];
}

export interface RelativeValueSpreadItem {
  trade_date: string;
  expiry_date: string;
  symbol_a: string;
  symbol_b: string;
  price_a_raw: number;
  price_b_raw: number;
  norm_price_a: number;
  norm_price_b: number;
  spread_inr_g: number;
  spread_pct: number;
  rolling_mean: number | null;
  rolling_std: number | null;
  zscore: number | null;
  volume_a: number;
  volume_b: number;
  oi_a: number;
  oi_b: number;
  dte: number;
  is_liquid: boolean;
  in_avoid_zone: boolean;
  signal: string;
}

export interface RelativeValueResponse {
  pair: string;
  symbol_a: string;
  symbol_b: string;
  window: number;
  z_threshold: number;
  calendar_note: string;
  total_datapoints: number;
  spreads: RelativeValueSpreadItem[];
  note?: string;
}

export interface TermStructurePoint {
  symbol: string;
  expiry_date: string;
  dte: number;
  raw_close: number;
  norm_close: number;
  volume: number;
  open_interest: number;
}

export interface ImpliedCarryRow {
  symbol: string;
  near_expiry: string;
  far_expiry: string;
  near_dte: number;
  far_dte: number;
  dte_spread: number;
  near_norm_price: number;
  far_norm_price: number;
  spread_inr_g: number;
  implied_annualized_carry_pct: number;
  structure: 'CONTANGO' | 'BACKWARDATION' | string;
}

export interface TermStructureResponse {
  trade_date: string;
  curve_points: TermStructurePoint[];
  implied_carry_table: ImpliedCarryRow[];
}

export interface CarryDecompositionItem {
  trade_date: string;
  symbol: string;
  expiry_date: string;
  dte: number;
  norm_price: number;
  total_daily_change_inr: number;
  roll_down_component_inr: number;
  curve_shift_component_inr: number;
}

export interface CarryDecompositionResponse {
  symbol: string;
  expiry_date: string;
  methodology: string;
  decomposition: CarryDecompositionItem[];
}

export interface DataStatusResponse {
  total_records: number;
  total_trading_dates: number;
  date_range: {
    start: string;
    end: string;
  };
  is_sample_dataset: boolean;
  dataset_type_badge: string;
  contracts_loaded: string[];
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
