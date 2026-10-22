"""
GoldLens Configuration Module
Contains strictly typed definitions for MCX Gold Futures contract mechanics,
trading cost structures, normalization formulas, and risk/liquidity thresholds.
No magic numbers buried in code.
"""

from typing import Dict, List, Optional
from pydantic import BaseModel, Field


class ContractSpec(BaseModel):
    """MCX Gold Futures contract specification."""
    symbol: str
    description: str
    trading_unit_grams: float = Field(..., description="Lot size in grams")
    quote_unit_grams: float = Field(..., description="Quotation unit in grams (e.g. 10g for GOLDM)")
    purity: float = Field(..., description="Gold fineness per 1000 parts (e.g. 995 or 999)")
    expiry_window: str = Field(..., description="Window of monthly expiry (e.g. '3rd-5th' or '27th-31st')")
    listing_year: int = Field(2003, description="Year contract was listed on MCX (e.g. 2025 for GOLDTEN)")
    tick_size_inr: float = Field(1.0, description="Minimum price movement in INR")
    delivery_type: str = Field("Compulsory Delivery", description="MCX settlement mechanism")
    tender_period_days: int = Field(5, description="Days before expiry where delivery intention applies")


class CostParameters(BaseModel):
    """
    Realistic friction parameters for MCX commodity derivatives execution.
    Modeled post-trade to strictly separate gross alpha from executable net alpha.
    """
    brokerage_per_order_inr: float = Field(20.0, description="Flat discount broker fee per order (₹20)")
    exchange_txn_fee_bps: float = Field(2.1, description="MCX transaction charge in basis points (0.0021%)")
    sebi_turnover_fee_bps: float = Field(0.01, description="SEBI regulatory fee per turnover crore (approx 0.01 bps)")
    stamp_duty_bps: float = Field(0.2, description="State stamp duty on buyer turnover (approx 0.2 bps)")
    gst_rate: float = Field(0.18, description="18% GST applicable on brokerage and exchange charges")
    base_slippage_bps: float = Field(1.5, description="Base half-spread / slippage in basis points for liquid lots")
    thin_market_slippage_multiplier: float = Field(2.5, description="Multiplier applied when Volume or OI is below median")
    liquidity_haircut_bps: float = Field(1.0, description="Conservative liquidity haircut on exit")


class ModelThresholds(BaseModel):
    """Configurable thresholds for relative-value statistical signals and safety checks."""
    rolling_zscore_window: int = Field(20, description="Lookback window in trading days for rolling mean & std")
    zscore_entry_threshold: float = Field(2.0, description="Abs Z-score required to flag relative mispricing (|Z| >= 2.0)")
    zscore_exit_threshold: float = Field(0.5, description="Abs Z-score reversion target to close position (|Z| <= 0.5)")
    min_volume_filter: int = Field(25, description="Minimum contract volume (lots) required on signal day")
    min_open_interest_filter: int = Field(50, description="Minimum Open Interest (lots) required on signal day")
    avoid_zone_days: int = Field(5, description="Days prior to expiry where new positions are blocked (avoid zone)")
    max_holding_days: int = Field(15, description="Time-stop threshold to prevent holding dead capital")
    min_edge_to_cost_ratio: float = Field(1.2, description="Expected spread reversion edge must exceed round-trip costs by 20%")


# Master specification catalog for all 4 contracts
CONTRACT_SPECS: Dict[str, ContractSpec] = {
    "GOLDM": ContractSpec(
        symbol="GOLDM",
        description="MCX Gold Mini 100g Bar",
        trading_unit_grams=100.0,
        quote_unit_grams=10.0,
        purity=995.0,
        expiry_window="3rd-5th",
        listing_year=2003,
        tick_size_inr=1.0,
        delivery_type="Compulsory Delivery",
        tender_period_days=5
    ),
    "GOLDTEN": ContractSpec(
        symbol="GOLDTEN",
        description="MCX Gold 10g Bar (999 Fine)",
        trading_unit_grams=10.0,
        quote_unit_grams=10.0,
        purity=999.0,
        expiry_window="27th-31st",
        listing_year=2025,
        tick_size_inr=1.0,
        delivery_type="Compulsory Delivery",
        tender_period_days=5
    ),
    "GOLDGUINEA": ContractSpec(
        symbol="GOLDGUINEA",
        description="MCX Gold Guinea 8g Sovereign Coin",
        trading_unit_grams=8.0,
        quote_unit_grams=8.0,
        purity=999.0,
        expiry_window="27th-31st",
        listing_year=2008,
        tick_size_inr=1.0,
        delivery_type="Compulsory Delivery",
        tender_period_days=5
    ),
    "GOLDPETAL": ContractSpec(
        symbol="GOLDPETAL",
        description="MCX Gold Petal 1g Micro Bar",
        trading_unit_grams=1.0,
        quote_unit_grams=1.0,
        purity=999.0,
        expiry_window="27th-31st",
        listing_year=2011,
        tick_size_inr=1.0,
        delivery_type="Compulsory Delivery",
        tender_period_days=5
    ),
}

DEFAULT_COSTS = CostParameters()
DEFAULT_THRESHOLDS = ModelThresholds()
TARGET_PURITY = 999.0  # Normalization target: INR per gram at 999 purity
