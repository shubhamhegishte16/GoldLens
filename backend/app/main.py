"""
GoldLens Backend Service (FastAPI)
Commodity Derivatives Intelligence for MCX Gold Futures.
Endpoints for health, contract specs, Bhavcopy ingestion, data quality audits,
analytics (normalization, RV spreads, term structure carry, decomposition, lifecycles).
"""

from fastapi import FastAPI, Request, Query, HTTPException, Body
from fastapi.middleware.cors import CORSMiddleware
from typing import Optional, List, Dict, Any
from pydantic import BaseModel
import pandas as pd
from datetime import datetime, timedelta

from app.config import CONTRACT_SPECS, DEFAULT_COSTS, DEFAULT_THRESHOLDS, TARGET_PURITY
from app.database import (
    init_db,
    get_data_quality_stats,
    query_bhavcopy_records,
    insert_bhavcopy_records,
    log_ingestion_event
)
from app.fetcher import (
    fetch_bhavcopy_for_date,
    fetch_bhavcopy_date_range,
    parse_csv_stream,
    import_bhavcopy_csv
)
from app.sample_data import load_seed_dataset_into_db
from app.analytics import (
    normalize_bhavcopy_records,
    compute_relative_value_spreads,
    build_term_structure_curve,
    decompose_daily_curve_change,
    analyze_contract_lifecycle,
    compute_cheap_expensive_matrix,
    normalize_price
)

# Initialize database schema on startup
init_db()

app = FastAPI(
    title="GoldLens API",
    description="Commodity Derivatives Intelligence for Multi-Size MCX Gold Futures",
    version="1.0.0"
)

# Enable CORS for Vite frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _parse_mode(mode: Optional[str]) -> Optional[int]:
    """Helper to convert mode parameter string to is_sample integer flag."""
    if not mode:
        return None
    m = mode.strip().lower()
    if m in ("actual", "live", "0", "eod"):
        return 0
    if m in ("sample", "demo", "1"):
        return 1
    return None


@app.get("/api/health")
def health_check():
    """System health check endpoint verifying service status, config, and supported contracts."""
    return {
        "status": "healthy",
        "service": "GoldLens API",
        "version": "1.0.0",
        "supported_contracts": list(CONTRACT_SPECS.keys()),
        "target_purity": TARGET_PURITY,
        "default_cost_params": DEFAULT_COSTS.model_dump(),
        "default_thresholds": DEFAULT_THRESHOLDS.model_dump()
    }


@app.get("/api/config/contracts")
def get_contract_specs():
    """Returns the full specification catalog for GOLDM, GOLDTEN, GOLDGUINEA, GOLDPETAL."""
    return {
        symbol: spec.model_dump() for symbol, spec in CONTRACT_SPECS.items()
    }


# =========================================================================
# DATA INGESTION & QUALITY ENDPOINTS
# =========================================================================

@app.get("/api/data/status")
def get_data_status():
    """Returns current dataset status: actual vs sample counts, date range, staleness, provenance."""
    stats = get_data_quality_stats()
    return {
        "total_records": stats.get("total_active_records", 0),
        "total_trading_dates": stats.get("total_trading_dates", 0),
        "date_range": stats.get("date_range", {"start": None, "end": None}),
        "is_sample_dataset": stats.get("is_sample_dataset", True),
        "dataset_type_badge": stats.get("dataset_type_badge", "SAMPLE DATA (DEMO)"),
        "data_mode": stats.get("data_mode", "SAMPLE"),
        "active_source": stats.get("active_source", "SAMPLE"),
        "total_actual_records": stats.get("total_actual_records", 0),
        "total_sample_records": stats.get("total_sample_records", 0),
        "latest_trading_date": stats.get("latest_trading_date"),
        "is_stale": stats.get("is_stale", False),
        "last_successful_import": stats.get("last_successful_import"),
        "last_import_status": stats.get("last_import_status"),
        "last_import_error": stats.get("last_import_error"),
        "contracts_loaded": [c["symbol"] for c in stats.get("contract_coverage", [])]
    }


@app.get("/api/data/quality")
def get_data_quality_report():
    """Returns full Data Quality audit report."""
    return get_data_quality_stats()


@app.get("/api/data/records")
def get_market_records(
    start_date: Optional[str] = Query(None, description="Start date YYYY-MM-DD"),
    end_date: Optional[str] = Query(None, description="End date YYYY-MM-DD"),
    symbols: Optional[str] = Query(None, description="Comma-separated symbols, e.g. GOLDM,GOLDTEN"),
    mode: Optional[str] = Query(None, description="Data mode: 'actual' or 'sample'")
):
    """Retrieves raw filtered Bhavcopy records."""
    sym_list = [s.strip().upper() for s in symbols.split(",")] if symbols else None
    is_sample = _parse_mode(mode)
    records = query_bhavcopy_records(start_date=start_date, end_date=end_date, symbols=sym_list, is_sample=is_sample)
    return {
        "count": len(records),
        "data_mode": "ACTUAL" if (is_sample == 0 or (is_sample is None and records and records[0].get("is_sample") == 0)) else "SAMPLE",
        "records": records
    }


@app.post("/api/data/fetch-date")
def fetch_single_date(date: str = Query(..., description="Target date in ISO format YYYY-MM-DD")):
    """Attempts live fetch for a single trading date with validation and holiday detection."""
    success, message, records = fetch_bhavcopy_for_date(date)
    return {
        "success": success,
        "message": message,
        "records_count": len(records)
    }


@app.post("/api/data/fetch-range")
def fetch_date_range(
    start_date: str = Query(..., description="Start date YYYY-MM-DD"),
    end_date: str = Query(..., description="End date YYYY-MM-DD")
):
    """Fetches Bhavcopy across a date range with polite rate-limiting and validation."""
    return fetch_bhavcopy_date_range(start_date, end_date)


@app.api_route("/api/data/refresh-latest", methods=["GET", "POST"])
def refresh_latest_data():
    """
    Attempts to fetch the latest available daily Bhavcopy from the official MCX portal.
    Checks backwards from today for recent trading sessions.
    If Akamai EdgeSuite WAF blocks the automated request (HTTP 403), reports the exact
    failure with transparent browser download guidance.
    """
    today = datetime.now().date()
    # Check today and up to 5 business days backwards
    for offset in range(5):
        target_date = (today - timedelta(days=offset)).strftime("%Y-%m-%d")
        success, message, records = fetch_bhavcopy_for_date(target_date)
        if success and records:
            return {
                "success": True,
                "date": target_date,
                "records_count": len(records),
                "message": f"Successfully imported {len(records)} official records for {target_date}"
            }
        elif "403" in message or "WAF" in message or "Akamai" in message:
            return {
                "success": False,
                "date": target_date,
                "records_count": 0,
                "message": message,
                "help": "Official MCX portal employs Akamai WAF and requires interactive browser session. Download the Bhavcopy CSV from https://www.mcxindia.com/market-data/bhavcopy and upload via the GoldLens UI."
            }

    return {
        "success": False,
        "records_count": 0,
        "message": "No new trading session records could be retrieved from the exchange.",
        "help": "Please download Bhavcopy CSV from https://www.mcxindia.com/market-data/bhavcopy and upload using the Import button."
    }


@app.post("/api/data/upload-csv")
async def upload_bhavcopy_csv(
    request: Request,
    filename: Optional[str] = Query("uploaded_bhavcopy.csv")
):
    """
    CSV ingestion endpoint: accepts CSV file content as raw text or JSON payload.
    Validates official MCX columns and stores records as actual MCX data (is_sample=0).
    """
    body_bytes = await request.body()
    try:
        text = body_bytes.decode("utf-8")
    except UnicodeDecodeError:
        text = body_bytes.decode("latin-1")

    # If sent as JSON wrapper {"csv_content": "...", "filename": "..."}
    if text.strip().startswith("{") and "csv_content" in text:
        import json
        try:
            parsed_json = json.loads(text)
            text = parsed_json.get("csv_content", "")
            filename = parsed_json.get("filename", filename)
        except Exception:
            pass

    success, msg, valid_records, report = import_bhavcopy_csv(
        text,
        filename=filename or "uploaded_bhavcopy.csv",
        is_sample=0
    )

    return {
        "success": success,
        "message": msg,
        "valid_rows_inserted": len(valid_records),
        "validation_report": report
    }


@app.post("/api/data/load-sample")
def load_sample_dataset():
    """One-click seed for offline demos. Loads verified dataset tagged with is_sample=1."""
    inserted = load_seed_dataset_into_db()
    return {
        "success": True,
        "records_inserted": inserted,
        "message": "Loaded verified MCX Gold Futures sample dataset. Tagged with SAMPLE DATA (DEMO) badge."
    }


# =========================================================================
# ANALYTICS ENDPOINTS
# =========================================================================

@app.get("/api/analytics/normalized-prices")
def get_normalized_prices(
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    symbols: Optional[str] = Query(None),
    mode: Optional[str] = Query(None, description="'actual' or 'sample'")
):
    """
    Retrieves market data enriched with canonical normalized prices (INR/g @ 999 fineness).
    Formula: norm = (price / quote_unit_grams) * (999 / purity)
    """
    sym_list = [s.strip().upper() for s in symbols.split(",")] if symbols else None
    is_sample = _parse_mode(mode)
    records = query_bhavcopy_records(start_date=start_date, end_date=end_date, symbols=sym_list, is_sample=is_sample)
    if not records:
        return {"count": 0, "records": []}

    df = normalize_bhavcopy_records(records)
    records_out = df[[
        "trade_date_str", "symbol", "expiry_date_str", "dte",
        "open_price", "high_price", "low_price", "close_price",
        "norm_open", "norm_high", "norm_low", "norm_close",
        "volume", "open_interest", "is_sample"
    ]].rename(columns={
        "trade_date_str": "trade_date",
        "expiry_date_str": "expiry_date"
    }).to_dict(orient="records")

    return {
        "count": len(records_out),
        "normalization_formula": "norm = (price / quote_unit_grams) * (999 / purity)",
        "target_unit": "INR / gram @ 999 purity",
        "data_mode": "ACTUAL" if df["is_sample"].iloc[0] == 0 else "SAMPLE",
        "records": records_out
    }


@app.get("/api/analytics/relative-value")
def get_relative_value_spread(
    symbol_a: str = Query("GOLDTEN", description="First contract symbol"),
    symbol_b: str = Query("GOLDPETAL", description="Second contract symbol"),
    window: int = Query(20, description="Rolling lookback window in trading days"),
    z_threshold: float = Query(2.0, description="Abs Z-score entry threshold"),
    min_volume: int = Query(25, description="Min lots volume filter"),
    min_oi: int = Query(50, description="Min lots OI filter"),
    avoid_zone_days: int = Query(5, description="Days before expiry to avoid"),
    mode: Optional[str] = Query(None, description="'actual' or 'sample'")
):
    """
    Computes cross-contract relative value spreads:
    - Normalizes both prices to INR/g @ 999
    - Strictly matches like-for-like expiry cycles (with nearest front fallback for mismatched schedules)
    - Computes rolling Z-Score strictly from historical data with zero-std protection
    - Evaluates liquidity filters & avoid zones
    """
    is_sample = _parse_mode(mode)
    records = query_bhavcopy_records(is_sample=is_sample)
    if not records:
        return {"pair": f"{symbol_a}-{symbol_b}", "spreads": [], "note": "No records found in active database mode."}

    df = normalize_bhavcopy_records(records)
    spreads = compute_relative_value_spreads(
        df, symbol_a=symbol_a, symbol_b=symbol_b,
        window=window, z_threshold=z_threshold,
        min_volume=min_volume, min_oi=min_oi,
        avoid_zone_days=avoid_zone_days
    )

    # Expiry calendar note for user transparency
    expiry_note = "Contracts share the standard month-end expiry cycle (27th-31st)."
    if "GOLDM" in (symbol_a, symbol_b) and (symbol_a != "GOLDM" or symbol_b != "GOLDM"):
        expiry_note = (
            "NOTICE: GOLDM expires in the 3rd-5th cycle whereas other contracts expire at month-end. "
            "Spreads align nearest overlapping months. Mismatched calendar risk should be monitored."
        )

    return {
        "pair": f"{symbol_a}/{symbol_b}",
        "symbol_a": symbol_a,
        "symbol_b": symbol_b,
        "window": window,
        "z_threshold": z_threshold,
        "calendar_note": expiry_note,
        "data_mode": "ACTUAL" if df["is_sample"].iloc[0] == 0 else "SAMPLE",
        "total_datapoints": len(spreads),
        "spreads": spreads
    }


@app.get("/api/analytics/relative-value-matrix")
def get_relative_value_matrix(
    mode: Optional[str] = Query(None, description="'actual' or 'sample'")
):
    """
    Returns 4x4 matrix of normalized spread differences and statistical Z-Scores
    across all active contracts on the latest available trade date.
    """
    is_sample = _parse_mode(mode)
    records = query_bhavcopy_records(is_sample=is_sample)
    if not records:
        return {"date": None, "contracts": ["GOLDTEN", "GOLDGUINEA", "GOLDPETAL", "GOLDM"], "matrix": {}}

    df = normalize_bhavcopy_records(records)
    matrix_res = compute_cheap_expensive_matrix(df)
    matrix_res["data_mode"] = "ACTUAL" if df["is_sample"].iloc[0] == 0 else "SAMPLE"
    return matrix_res


@app.get("/api/analytics/term-structure")
def get_term_structure(
    trade_date: Optional[str] = Query(None, description="Trade date YYYY-MM-DD. Defaults to latest available."),
    mode: Optional[str] = Query(None, description="'actual' or 'sample'")
):
    """Returns futures curve (normalized price vs positive DTE) and implied annualized carry table."""
    is_sample = _parse_mode(mode)
    records = query_bhavcopy_records(is_sample=is_sample)
    if not records:
        return {"trade_date": trade_date, "curve_points": [], "implied_carry_table": []}

    df = normalize_bhavcopy_records(records)
    target_dt = trade_date if trade_date else df["trade_date_str"].max()
    curve_data = build_term_structure_curve(df, target_dt)
    curve_data["data_mode"] = "ACTUAL" if df["is_sample"].iloc[0] == 0 else "SAMPLE"
    return curve_data


@app.get("/api/analytics/carry-decomposition")
def get_carry_decomposition(
    symbol: str = Query("GOLDTEN"),
    expiry_date: Optional[str] = Query(None),
    mode: Optional[str] = Query(None, description="'actual' or 'sample'")
):
    """
    Decomposes daily futures price changes into:
    1. Theoretical Roll-Down Carry Decay (analytical model using 6% annualized financing cost)
    2. Genuine Spot/Basis Curve Shift
    Note: MCX Bhavcopy provides futures settlement prices only; physical OTC spot bullion
    transactions are not published in Bhavcopy.
    """
    is_sample = _parse_mode(mode)
    records = query_bhavcopy_records(symbols=[symbol], is_sample=is_sample)
    if not records:
        return {"symbol": symbol, "decomposition": [], "is_estimate": True}

    df = normalize_bhavcopy_records(records)
    target_expiry = expiry_date if expiry_date else df["expiry_date_str"].min()
    decomp_list = decompose_daily_curve_change(df, symbol=symbol, expiry_date_str=target_expiry)
    return {
        "symbol": symbol,
        "expiry_date": target_expiry,
        "is_estimate": True,
        "disclaimer": "THEORETICAL ESTIMATE: Daily MCX Bhavcopy publishes futures settlement prices only and does not contain physical OTC spot bullion transactions. Roll-down carry decay is estimated using an annualized benchmark carry rate (~6% repo rate), and curve shift is the residual change.",
        "methodology": "Decomposition: Total Change = Roll-Down Carry Decay (analytical model) + Genuine Spot/Basis Curve Shift",
        "data_mode": "ACTUAL" if df["is_sample"].iloc[0] == 0 else "SAMPLE",
        "decomposition": decomp_list
    }


@app.get("/api/analytics/lifecycle")
def get_lifecycle_analytics(
    symbol: str = Query("GOLDTEN"),
    mode: Optional[str] = Query(None, description="'actual' or 'sample'")
):
    """Returns contract inception, liquidity ramp, peak OI, and avoid-zone trajectory."""
    is_sample = _parse_mode(mode)
    records = query_bhavcopy_records(symbols=[symbol], is_sample=is_sample)
    if not records:
        return {"symbol": symbol, "lifecycles": []}

    df = normalize_bhavcopy_records(records)
    lifecycles = analyze_contract_lifecycle(df, symbol=symbol)
    return {
        "symbol": symbol,
        "avoid_zone_days": CONTRACT_SPECS.get(symbol, DEFAULT_THRESHOLDS).tender_period_days,
        "data_mode": "ACTUAL" if df["is_sample"].iloc[0] == 0 else "SAMPLE",
        "lifecycles": lifecycles
    }
