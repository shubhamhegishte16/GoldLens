"""
GoldLens Analytics Engine.
Performs:
1. Normalization: Canonical formula norm = (price / quote_unit_grams) * (999 / purity)
2. Cross-contract Relative Value: Like-for-like expiry pairing (with fallback front-contract alignment
   for differing delivery cycles like GOLDM), strictly historical rolling mean & std (Z-Score),
   safe handling of zero standard deviation, and statistical signal indicators.
3. Term Structure & Carry: Futures curves (normalized price vs positive DTE), annualized implied carry,
   and theoretical daily carry decomposition with clear documentation.
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
      norm = (85,000 / 10) * (999 / 995) = 8,500 * 1.0040201005 = 8,534.1709 INR/g
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
    Transforms raw Bhavcopy records into an enriched pandas DataFrame with
    normalized OHLC prices (INR/g @ 999), previous close, and days-to-expiry (DTE).
    Preserves raw exchange quotes alongside canonical normalized values.
    """
    if not records:
        return pd.DataFrame()

    df = pd.DataFrame(records)
    df["trade_date"] = pd.to_datetime(df["trade_date"])
    df["expiry_date"] = pd.to_datetime(df["expiry_date"])
    
    # Days to expiry
    df["dte"] = (df["expiry_date"] - df["trade_date"]).dt.days

    # Apply canonical normalization to Open, High, Low, Close, Previous Close defensively
    if "norm_close" not in df.columns or df["norm_close"].isnull().any():
        df["norm_close"] = df.apply(lambda r: normalize_price(r.get("close_price", 0.0), r["symbol"]), axis=1)
    if "norm_open" not in df.columns:
        df["norm_open"] = df.apply(lambda r: normalize_price(r.get("open_price", r.get("close_price", 0.0)), r["symbol"]), axis=1)
    if "norm_high" not in df.columns:
        df["norm_high"] = df.apply(lambda r: normalize_price(r.get("high_price", r.get("close_price", 0.0)), r["symbol"]), axis=1)
    if "norm_low" not in df.columns:
        df["norm_low"] = df.apply(lambda r: normalize_price(r.get("low_price", r.get("close_price", 0.0)), r["symbol"]), axis=1)
    if "norm_prev_close" not in df.columns:
        if "previous_close" in df.columns:
            df["norm_prev_close"] = df.apply(lambda r: normalize_price(r["previous_close"], r["symbol"]), axis=1)
        else:
            df["norm_prev_close"] = df["norm_close"]

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
    - Standard month-end contracts (GOLDTEN, GOLDGUINEA, GOLDPETAL) strictly match like-for-like expiry dates.
    - If comparing differing delivery cycles (e.g. GOLDM 5th expiry vs month-end), aligns nearest front contracts per date.
    - Calculates rolling Z-score using STRICTLY historical data [t-W, t]. NO LOOK-AHEAD.
    - Handles zero or near-zero standard deviation safely without division by zero.
    """
    if df.empty:
        return []

    df_a = df[df["symbol"] == symbol_a].copy()
    df_b = df[df["symbol"] == symbol_b].copy()

    if df_a.empty or df_b.empty:
        return []

    # First attempt like-for-like matching on trade_date and expiry_date
    merged = pd.merge(
        df_a, df_b,
        on=["trade_date_str", "expiry_date_str"],
        suffixes=("_a", "_b")
    ).sort_values("trade_date_str")

    is_cross_cycle = False
    # Fallback for differing delivery cycles (e.g. GOLDM 5th vs Month-End 27th-31st)
    if merged.empty:
        is_cross_cycle = True
        # For each date, pick front contract (lowest DTE) for each symbol
        front_a = df_a.sort_values(["trade_date", "dte"]).groupby("trade_date_str").first().reset_index()
        front_b = df_b.sort_values(["trade_date", "dte"]).groupby("trade_date_str").first().reset_index()

        merged = pd.merge(
            front_a, front_b,
            on="trade_date_str",
            suffixes=("_a", "_b")
        ).sort_values("trade_date_str")

    if merged.empty:
        return []

    results: List[Dict[str, Any]] = []

    # Group by expiry or process as continuous front-contract curve
    groups = merged.groupby("expiry_date_str_a" if is_cross_cycle else "expiry_date_str")

    for expiry_key, group in groups:
        group = group.sort_values("trade_date_str").reset_index(drop=True)

        # Normalized spread: Spread = NormPrice(A) - NormPrice(B) in INR/g
        spread_inr = group["norm_close_a"] - group["norm_close_b"]
        spread_pct = (spread_inr / group["norm_close_b"]) * 100.0

        # Rolling mean and standard deviation strictly historical (min_periods=5)
        rolling_mean = spread_inr.rolling(window=window, min_periods=5).mean()
        rolling_std = spread_inr.rolling(window=window, min_periods=5).std()

        for idx, row in group.iterrows():
            mean_val = rolling_mean.iloc[idx]
            std_val = rolling_std.iloc[idx]
            spr_val = spread_inr.iloc[idx]

            # Safe Z-Score calculation with zero-std protection
            z_val = None
            if pd.notna(mean_val) and pd.notna(std_val):
                if float(std_val) > 1e-6:
                    z_val = round(float((spr_val - mean_val) / std_val), 2)
                else:
                    z_val = 0.0

            vol_a = int(row["volume_a"])
            vol_b = int(row["volume_b"])
            oi_a = int(row["open_interest_a"])
            oi_b = int(row["open_interest_b"])
            dte_a = int(row["dte_a"])
            dte_b = int(row.get("dte_b", dte_a))

            liquid = (vol_a >= min_volume and vol_b >= min_volume and oi_a >= min_oi and oi_b >= min_oi)
            in_avoid_zone = dte_a <= avoid_zone_days or dte_b <= avoid_zone_days

            # Statistical deviation signal (clearly distinct from guaranteed arbitrage)
            signal = "NEUTRAL"
            if z_val is not None and not in_avoid_zone and liquid:
                if z_val >= z_threshold:
                    signal = f"STAT_RICH_{symbol_a}_CHEAP_{symbol_b}"
                elif z_val <= -z_threshold:
                    signal = f"STAT_CHEAP_{symbol_a}_RICH_{symbol_b}"

            results.append({
                "trade_date": row["trade_date_str"],
                "expiry_date": row["expiry_date_str_a"] if is_cross_cycle else row["expiry_date_str"],
                "expiry_date_b": row["expiry_date_str_b"] if is_cross_cycle else row["expiry_date_str"],
                "is_cross_cycle": is_cross_cycle,
                "symbol_a": symbol_a,
                "symbol_b": symbol_b,
                "price_a_raw": float(row["close_price_a"]),
                "price_b_raw": float(row["close_price_b"]),
                "norm_price_a": round(float(row["norm_close_a"]), 2),
                "norm_price_b": round(float(row["norm_close_b"]), 2),
                "spread_inr_g": round(float(spr_val), 3),
                "spread_pct": round(float(spread_pct.iloc[idx]), 4),
                "rolling_mean": round(float(mean_val), 3) if pd.notna(mean_val) else None,
                "rolling_std": round(float(std_val), 3) if pd.notna(std_val) else None,
                "zscore": z_val,
                "volume_a": vol_a,
                "volume_b": vol_b,
                "oi_a": oi_a,
                "oi_b": oi_b,
                "dte": dte_a,
                "is_liquid": liquid,
                "in_avoid_zone": in_avoid_zone,
                "signal": signal,
                "sample_count": idx + 1
            })

    return sorted(results, key=lambda x: (x["trade_date"], x["expiry_date"]))


def build_term_structure_curve(df: pd.DataFrame, target_date_str: str) -> Dict[str, Any]:
    """
    Constructs the futures term structure curve for a specific trade date:
    - Points: Normalized price vs Days To Expiry (DTE) for each active contract with DTE > 0.
    - Annualized Carry calculation between adjacent expiries:
      Carry_annualized = ((F2 - F1) / F1) * (365 / (DTE2 - DTE1)) * 100%
      Assumes linear money market annualized basis.
    """
    methodology = "Annualized Implied Carry = [((F_far - F_near) / F_near) * (365 / (DTE_far - DTE_near))] * 100%. Assumes linear annualized money market basis between active contract expiries."

    if df.empty:
        return {"trade_date": target_date_str, "curve_points": [], "implied_carry_table": [], "carry_methodology": methodology}

    day_df = df[(df["trade_date_str"] == target_date_str) & (df["dte"] > 0)].copy()
    if day_df.empty:
        return {"trade_date": target_date_str, "curve_points": [], "implied_carry_table": [], "carry_methodology": methodology}

    curve_points = []
    for _, row in day_df.sort_values("dte").iterrows():
        curve_points.append({
            "symbol": row["symbol"],
            "expiry_date": row["expiry_date_str"],
            "dte": int(row["dte"]),
            "raw_close": float(row["close_price"]) if "close_price" in row else float(row.get("norm_close", 0.0)),
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
        "implied_carry_table": carry_table,
        "carry_methodology": methodology
    }


def decompose_daily_curve_change(
    df: pd.DataFrame,
    symbol: str,
    expiry_date_str: str
) -> List[Dict[str, Any]]:
    """
    Decomposes daily contract price change into theoretical roll-down carry vs curve shift.
    
    Methodology Disclaimer:
    Daily Bhavcopy reports futures settlement prices; it does NOT publish physical OTC spot bullion transactions.
    The roll-down carry component is an analytical model estimate based on carry decay along the futures slope (~6% repo rate benchmark),
    and curve shift represents the residual market repricing.
    """
    contract_df = df[(df["symbol"] == symbol) & (df["expiry_date_str"] == expiry_date_str)].sort_values("trade_date_str").reset_index(drop=True)
    if len(contract_df) < 2:
        return []

    decomposition = []
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


def compute_cheap_expensive_matrix(df: pd.DataFrame) -> Dict[str, Any]:
    """
    Computes cheap/expensive matrix across all 4 contracts on the latest available trade date.
    Returns: { date, contracts, matrix: { row: { col: { spread, zscore, signal } } } }
    """
    symbols = ["GOLDTEN", "GOLDGUINEA", "GOLDPETAL", "GOLDM"]
    if df.empty:
        return {"date": None, "contracts": symbols, "matrix": {}}

    latest_date = df["trade_date_str"].max()
    day_df = df[df["trade_date_str"] == latest_date].copy()

    # Front contract per symbol on latest date
    front_map = {}
    for s in symbols:
        sub = day_df[day_df["symbol"] == s].sort_values("dte")
        if not sub.empty:
            front_map[s] = sub.iloc[0]

    matrix: Dict[str, Dict[str, Any]] = {}
    for s1 in symbols:
        matrix[s1] = {}
        for s2 in symbols:
            if s1 == s2:
                matrix[s1][s2] = {"spread_inr_g": 0.0, "zscore": 0.0, "status": "FAIR_VALUE"}
            else:
                p1 = front_map.get(s1)
                p2 = front_map.get(s2)
                if p1 is not None and p2 is not None:
                    spr = round(p1["norm_close"] - p2["norm_close"], 2)
                    # Quick Z evaluation
                    sp_res = compute_relative_value_spreads(df, s1, s2, window=20)
                    z_val = sp_res[-1]["zscore"] if (sp_res and sp_res[-1]["zscore"] is not None) else None
                    matrix[s1][s2] = {
                        "spread_inr_g": spr,
                        "zscore": z_val,
                        "status": "EXPENSIVE" if (z_val and z_val >= 1.5) else ("CHEAP" if (z_val and z_val <= -1.5) else "FAIR_VALUE")
                    }
                else:
                    matrix[s1][s2] = {"spread_inr_g": None, "zscore": None, "status": "NO_DATA"}

    return {
        "date": latest_date,
        "contracts": symbols,
        "matrix": matrix
    }


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
