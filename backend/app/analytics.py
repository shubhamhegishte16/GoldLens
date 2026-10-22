"""
GoldLens Analytics Engine.
Performs:
1. Normalization: Canonical formula norm = (price / quote_unit_grams) * (999 / purity)
2. Cross-contract Relative Value: Like-for-like expiry pairing, normalized spread (INR/g and %),
   strictly historical rolling mean & std (Z-Score), cheap/rich tags, and liquidity filters.
3. Term Structure & Carry: Futures curves (normalized price vs DTE), annualized implied carry,
   and daily decomposition (mechanical roll-down vs genuine curve shift).
4. Contract Lifecycle: Inception, liquidity ramp (volume & OI trajectory), avoid zone (tender period).
"""

from typing import List, Dict, Any, Optional, Tuple
from datetime import datetime
import pandas as pd
import numpy as np

from app.config import CONTRACT_SPECS, TARGET_PURITY, DEFAULT_THRESHOLDS


def normalize_price(price: float, symbol: str) -> float:
    """
    Canonical Normalization Target: INR per gram at standard 999 fineness.
    Formula: norm = (price / quote_unit_grams) * (999 / purity)
    
    Worked Examples:
    - GOLDM @ 85,000 (quote 10g, purity 995):
      norm = (85,000 / 10) * (999 / 995) = 8,500 * 1.0040201005 = 8,534.17085 INR/g
    - GOLDTEN @ 85,300 (quote 10g, purity 999):
      norm = (85,300 / 10) * (999 / 999) = 8,530.00 INR/g
    - GOLDGUINEA @ 68,240 (quote 8g, purity 999):
      norm = (68,240 / 8) * (999 / 999) = 8,530.00 INR/g
    - GOLDPETAL @ 8,530 (quote 1g, purity 999):
      norm = (8,530 / 1) * (999 / 999) = 8,530.00 INR/g
    """
    if price <= 0:
        return 0.0
    spec = CONTRACT_SPECS.get(symbol.upper())
    if not spec:
        raise ValueError(f"Unknown contract symbol '{symbol}'")
    
    norm = (float(price) / spec.quote_unit_grams) * (TARGET_PURITY / spec.purity)
    return round(norm, 4)


def normalize_bhavcopy_records(records: List[Dict[str, Any]]) -> pd.DataFrame:
    """
    Transforms raw Bhavcopy records into a enriched pandas DataFrame with
    normalized OHLC prices (INR/g @ 999) and days-to-expiry (DTE).
    """
    if not records:
        return pd.DataFrame()

    df = pd.DataFrame(records)
    df["trade_date"] = pd.to_datetime(df["trade_date"])
    df["expiry_date"] = pd.to_datetime(df["expiry_date"])
    
    # Days to expiry
    df["dte"] = (df["expiry_date"] - df["trade_date"]).dt.days

    # Apply canonical normalization to Open, High, Low, Close
    df["norm_open"] = df.apply(lambda r: normalize_price(r["open_price"], r["symbol"]), axis=1)
    df["norm_high"] = df.apply(lambda r: normalize_price(r["high_price"], r["symbol"]), axis=1)
    df["norm_low"] = df.apply(lambda r: normalize_price(r["low_price"], r["symbol"]), axis=1)
    df["norm_close"] = df.apply(lambda r: normalize_price(r["close_price"], r["symbol"]), axis=1)

    # Convert timestamps back to string for clean JSON serialization
    df["trade_date_str"] = df["trade_date"].dt.strftime("%Y-%m-%d")
    df["expiry_date_str"] = df["expiry_date"].dt.strftime("%Y-%m-%d")
    
    return df


def compute_relative_value_spreads(
    df: pd.DataFrame,
    symbol_a: str,
    symbol_b: str,
    window: int = 20,
    z_threshold: float = 2.0,
    min_volume: int = 25,
    min_oi: int = 50,
    avoid_zone_days: int = 5
) -> List[Dict[str, Any]]:
    """
    Calculates cross-contract normalized relative-value spread between symbol_a and symbol_b.
    Strictly aligns records by (trade_date, expiry_date) to ensure like-for-like expiry matching.
    Calculates rolling Z-score using STRICTLY historical data [t-W, t]. NO LOOK-AHEAD.
    """
    if df.empty:
        return []

    # Filter to requested contracts
    df_a = df[df["symbol"] == symbol_a].copy()
    df_b = df[df["symbol"] == symbol_b].copy()

    if df_a.empty or df_b.empty:
        return []

    # Merge on (trade_date_str, expiry_date_str)
    merged = pd.merge(
        df_a, df_b,
        on=["trade_date_str", "expiry_date_str"],
        suffixes=("_a", "_b")
    ).sort_values("trade_date_str")

    if merged.empty:
        return []

    results: List[Dict[str, Any]] = []

    # Group by expiry contract to calculate rolling metrics independently per contract lifecycle
    for expiry, group in merged.groupby("expiry_date_str"):
        group = group.sort_values("trade_date_str").reset_index(drop=True)

        # Normalized spread: Spread = NormPrice(A) - NormPrice(B) in INR/g
        spread_inr = group["norm_close_a"] - group["norm_close_b"]
        spread_pct = (spread_inr / group["norm_close_b"]) * 100.0

        # Rolling mean and std using past window ONLY (min_periods=5 to allow ramp up)
        rolling_mean = spread_inr.rolling(window=window, min_periods=5).mean()
        rolling_std = spread_inr.rolling(window=window, min_periods=5).std().replace(0, np.nan)
        zscore = (spread_inr - rolling_mean) / rolling_std

        for idx, row in group.iterrows():
            z = zscore.iloc[idx]
            z_val = round(float(z), 2) if pd.notna(z) else None
            
            vol_a = int(row["volume_a"])
            vol_b = int(row["volume_b"])
            oi_a = int(row["open_interest_a"])
            oi_b = int(row["open_interest_b"])
            dte = int(row["dte_a"])

            # Liquidity checks
            liquid = (vol_a >= min_volume and vol_b >= min_volume and oi_a >= min_oi and oi_b >= min_oi)
            in_avoid_zone = dte <= avoid_zone_days

            # Signal determination
            signal = "NEUTRAL"
            if z_val is not None and not in_avoid_zone and liquid:
                if z_val >= z_threshold:
                    # A is rich, B is cheap => Short A, Long B
                    signal = f"SHORT_{symbol_a}_LONG_{symbol_b}"
                elif z_val <= -z_threshold:
                    # A is cheap, B is rich => Long A, Short B
                    signal = f"LONG_{symbol_a}_SHORT_{symbol_b}"

            results.append({
                "trade_date": row["trade_date_str"],
                "expiry_date": expiry,
                "symbol_a": symbol_a,
                "symbol_b": symbol_b,
                "price_a_raw": float(row["close_price_a"]),
                "price_b_raw": float(row["close_price_b"]),
                "norm_price_a": round(float(row["norm_close_a"]), 2),
                "norm_price_b": round(float(row["norm_close_b"]), 2),
                "spread_inr_g": round(float(spread_inr.iloc[idx]), 3),
                "spread_pct": round(float(spread_pct.iloc[idx]), 4),
                "rolling_mean": round(float(rolling_mean.iloc[idx]), 3) if pd.notna(rolling_mean.iloc[idx]) else None,
                "rolling_std": round(float(rolling_std.iloc[idx]), 3) if pd.notna(rolling_std.iloc[idx]) else None,
                "zscore": z_val,
                "volume_a": vol_a,
                "volume_b": vol_b,
                "oi_a": oi_a,
                "oi_b": oi_b,
                "dte": dte,
                "is_liquid": liquid,
                "in_avoid_zone": in_avoid_zone,
                "signal": signal
            })

    return sorted(results, key=lambda x: (x["trade_date"], x["expiry_date"]))


def build_term_structure_curve(df: pd.DataFrame, target_date_str: str) -> Dict[str, Any]:
    """
    Constructs the futures term structure curve for a specific trade date:
    - Points: Normalized price vs Days To Expiry (DTE) for each active contract
    - Annualized Carry calculation between adjacent expiries:
      Carry_annualized = ((F2 - F1) / F1) * (365 / (DTE2 - DTE1)) * 100%
    """
    if df.empty:
        return {"trade_date": target_date_str, "curve_points": [], "implied_carry_table": []}

    day_df = df[df["trade_date_str"] == target_date_str].copy()
    if day_df.empty:
        return {"trade_date": target_date_str, "curve_points": [], "implied_carry_table": []}

    curve_points = []
    for _, row in day_df.sort_values("dte").iterrows():
        curve_points.append({
            "symbol": row["symbol"],
            "expiry_date": row["expiry_date_str"],
            "dte": int(row["dte"]),
            "raw_close": float(row["close_price"]),
            "norm_close": round(float(row["norm_close"]), 2),
            "volume": int(row["volume"]),
            "open_interest": int(row["open_interest"])
        })

    # Group by symbol to compute annualized carry between consecutive expiries
    carry_table = []
    for sym, group in day_df.groupby("symbol"):
        sorted_g = group.sort_values("dte").reset_index(drop=True)
        if len(sorted_g) >= 2:
            for i in range(len(sorted_g) - 1):
                near = sorted_g.iloc[i]
                far = sorted_g.iloc[i + 1]
                
                dte_diff = far["dte"] - near["dte"]
                if dte_diff > 0 and near["norm_close"] > 0:
                    price_diff_inr = far["norm_close"] - near["norm_close"]
                    carry_annualized_pct = ((price_diff_inr / near["norm_close"]) * (365.0 / dte_diff)) * 100.0

                    carry_table.append({
                        "symbol": sym,
                        "near_expiry": near["expiry_date_str"],
                        "far_expiry": far["expiry_date_str"],
                        "near_dte": int(near["dte"]),
                        "far_dte": int(far["dte"]),
                        "dte_spread": int(dte_diff),
                        "near_norm_price": round(float(near["norm_close"]), 2),
                        "far_norm_price": round(float(far["norm_close"]), 2),
                        "spread_inr_g": round(float(price_diff_inr), 2),
                        "implied_annualized_carry_pct": round(float(carry_annualized_pct), 2),
                        "structure": "CONTANGO" if price_diff_inr >= 0 else "BACKWARDATION"
                    })

    return {
        "trade_date": target_date_str,
        "curve_points": curve_points,
        "implied_carry_table": carry_table
    }


def decompose_daily_curve_change(
    df: pd.DataFrame,
    symbol: str,
    expiry_date_str: str
) -> List[Dict[str, Any]]:
    """
    Decomposes daily contract price change into:
    1. Mechanical Roll-Down (carry decay due to passage of time, aging 1 day along the carry slope)
    2. Genuine Curve Shift (parallel shift / macro gold price shift + basis repricing)
    
    Formula:
    Daily Change = P(t, DTE) - P(t-1, DTE+1)
    Roll-Down Component = Theoretical Carry Decay = Carry_Slope * (1 / 365)
    Curve Shift Component = Total Daily Change - Roll-Down Component
    """
    contract_df = df[(df["symbol"] == symbol) & (df["expiry_date_str"] == expiry_date_str)].sort_values("trade_date_str").reset_index(drop=True)
    if len(contract_df) < 2:
        return []

    decomposition = []
    # Standard annualized benchmark carry rate ~6.0% (0.06 / 365 per day)
    annual_carry_rate = 0.06

    for i in range(1, len(contract_df)):
        prev = contract_df.iloc[i - 1]
        curr = contract_df.iloc[i]

        total_change_inr = curr["norm_close"] - prev["norm_close"]
        days_passed = max(1, (curr["trade_date"] - prev["trade_date"]).days)

        # Expected mechanical roll-down decay (carrying cost decreases as DTE decreases)
        roll_down_decay = -(prev["norm_close"] * annual_carry_rate * (days_passed / 365.0))
        real_curve_shift = total_change_inr - roll_down_decay

        decomposition.append({
            "trade_date": curr["trade_date_str"],
            "symbol": symbol,
            "expiry_date": expiry_date_str,
            "dte": int(curr["dte"]),
            "norm_price": round(float(curr["norm_close"]), 2),
            "total_daily_change_inr": round(float(total_change_inr), 3),
            "roll_down_component_inr": round(float(roll_down_decay), 3),
            "curve_shift_component_inr": round(float(real_curve_shift), 3)
        })

    return decomposition


def analyze_contract_lifecycle(df: pd.DataFrame, symbol: str) -> List[Dict[str, Any]]:
    """
    Tracks lifecycle per contract expiry:
    - First trade date
    - Last trade / expiry date
    - Peak liquidity date (max volume and max OI)
    - Avoid zone threshold (tender period)
    """
    sub_df = df[df["symbol"] == symbol].copy()
    if sub_df.empty:
        return []

    lifecycles = []
    avoid_days = CONTRACT_SPECS.get(symbol, DEFAULT_THRESHOLDS).tender_period_days

    for expiry, group in sub_df.groupby("expiry_date_str"):
        group = group.sort_values("trade_date_str")
        first_trade = group.iloc[0]["trade_date_str"]
        last_trade = group.iloc[-1]["trade_date_str"]
        total_days_traded = len(group)
        
        peak_vol_row = group.loc[group["volume"].idxmax()]
        peak_oi_row = group.loc[group["open_interest"].idxmax()]

        # Trajectory series of volume and OI
        trajectory = []
        for _, row in group.iterrows():
            trajectory.append({
                "trade_date": row["trade_date_str"],
                "dte": int(row["dte"]),
                "volume": int(row["volume"]),
                "open_interest": int(row["open_interest"]),
                "is_in_avoid_zone": int(row["dte"]) <= avoid_days
            })

        lifecycles.append({
            "symbol": symbol,
            "expiry_date": expiry,
            "first_trade_date": first_trade,
            "last_trade_date": last_trade,
            "total_days_traded": total_days_traded,
            "peak_volume": int(peak_vol_row["volume"]),
            "peak_volume_date": peak_vol_row["trade_date_str"],
            "peak_oi": int(peak_oi_row["open_interest"]),
            "peak_oi_date": peak_oi_row["trade_date_str"],
            "avoid_zone_cutoff_days": avoid_days,
            "trajectory": trajectory
        })

    return sorted(lifecycles, key=lambda x: x["expiry_date"])
