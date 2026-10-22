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

from app.config import CONTRACT_SPECS, DEFAULT_COSTS, DEFAULT_THRESHOLDS, TARGET_PURITY
from app.database import (
    init_db,
    get_data_quality_stats,
    query_bhavcopy_records,
    insert_bhavcopy_records,
    log_ingestion_event
)
from app.fetcher import fetch_bhavcopy_for_date, fetch_bhavcopy_date_range, parse_csv_stream
from app.sample_data import load_seed_dataset_into_db
from app.analytics import (
    normalize_bhavcopy_records,
    compute_relative_value_spreads,
    build_term_structure_curve,
    decompose_daily_curve_change,
    analyze_contract_lifecycle,
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
# DATA INGESTION & QUALITY ENDPOINTS (PHASE 1)
# =========================================================================

@app.get("/api/data/status")
def get_data_status():
    """Returns current dataset status: total rows, date range, and whether sample or live data."""
    stats = get_data_quality_stats()
    return {
        "total_records": stats["total_rows"],
        "total_trading_dates": stats["total_trading_dates"],
        "date_range": stats["date_range"],
        "is_sample_dataset": stats["is_sample_dataset"],
        "dataset_type_badge": "SAMPLE DATA" if stats["is_sample_dataset"] else "LIVE MCX DATA",
        "contracts_loaded": [c["symbol"] for c in stats["contract_coverage"]]
    }


@app.get("/api/data/quality")
def get_data_quality_report():
    """Returns full Data Quality audit report."""
    return get_data_quality_stats()


@app.get("/api/data/records")
def get_market_records(
    start_date: Optional[str] = Query(None, description="Start date YYYY-MM-DD"),
    end_date: Optional[str] = Query(None, description="End date YYYY-MM-DD"),
    symbols: Optional[str] = Query(None, description="Comma-separated symbols, e.g. GOLDM,GOLDTEN")
):
    """Retrieves raw filtered Bhavcopy records."""
    sym_list = [s.strip().upper() for s in symbols.split(",")] if symbols else None
    records = query_bhavcopy_records(start_date=start_date, end_date=end_date, symbols=sym_list)
    return {
        "count": len(records),
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


@app.post("/api/data/upload-csv")
async def upload_bhavcopy_csv(request: Request):
    """CSV fallback endpoint: accepts CSV string payload or raw text body."""
    body_bytes = await request.body()
    try:
        text = body_bytes.decode("utf-8")
    except UnicodeDecodeError:
        text = body_bytes.decode("latin-1")

    if text.strip().startswith("{") and "csv_content" in text:
        import json
        try:
            parsed_json = json.loads(text)
            text = parsed_json.get("csv_content", "")
        except Exception:
            pass

    valid_records, report = parse_csv_stream(text)
    if valid_records:
        inserted = insert_bhavcopy_records(valid_records, source="CSV_UPLOAD")
        log_ingestion_event(
            requested_date="CSV_UPLOAD",
            returned_date=valid_records[0]["trade_date"] if valid_records else None,
            status="SUCCESS",
            reason=f"Uploaded CSV: {len(valid_records)} rows validated",
            rows_added=inserted,
            source="CSV_UPLOAD"
        )
    return {
        "valid_rows_inserted": len(valid_records),
        "validation_report": report
    }


@app.post("/api/data/load-sample")
def load_sample_dataset():
    """One-click seed for offline hackathon demos. Loads verified 2025-2026 dataset."""
    inserted = load_seed_dataset_into_db()
    return {
        "success": True,
        "records_inserted": inserted,
        "message": "Loaded verified MCX Gold Futures dataset (2025-2026). Tagged with SAMPLE DATA badge."
    }


# =========================================================================
# ANALYTICS ENDPOINTS (PHASE 2)
# =========================================================================

@app.get("/api/analytics/normalized-prices")
def get_normalized_prices(
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    symbols: Optional[str] = Query(None)
):
    """Retrieves all market data enriched with canonical normalized prices (INR/g @ 999)."""
    sym_list = [s.strip().upper() for s in symbols.split(",")] if symbols else None
    records = query_bhavcopy_records(start_date=start_date, end_date=end_date, symbols=sym_list)
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
    avoid_zone_days: int = Query(5, description="Days before expiry to avoid")
):
    """
    Computes cross-contract relative value spreads:
    - Normalizes both prices to INR/g @ 999
    - Strictly matches like-for-like expiry cycles
    - Computes rolling Z-Score strictly from historical data
    - Evaluates liquidity filters & avoid zones
    """
    records = query_bhavcopy_records()
    if not records:
        return {"pair": f"{symbol_a}-{symbol_b}", "spreads": [], "note": "No data in database. Load sample dataset first."}

    df = normalize_bhavcopy_records(records)
    spreads = compute_relative_value_spreads(
        df, symbol_a=symbol_a, symbol_b=symbol_b,
        window=window, z_threshold=z_threshold,
        min_volume=min_volume, min_oi=min_oi,
        avoid_zone_days=avoid_zone_days
    )

    # Expiry calendar note for user transparency
    expiry_note = "Contracts share the same month-end expiry cycle (27th-31st)."
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
        "total_datapoints": len(spreads),
        "spreads": spreads
    }


@app.get("/api/analytics/term-structure")
def get_term_structure(
    trade_date: Optional[str] = Query(None, description="Trade date YYYY-MM-DD. Defaults to latest available.")
):
    """Returns futures curve (normalized price vs DTE) and implied annualized carry table."""
    records = query_bhavcopy_records()
    if not records:
        return {"trade_date": trade_date, "curve_points": [], "implied_carry_table": []}

    df = normalize_bhavcopy_records(records)
    target_dt = trade_date if trade_date else df["trade_date_str"].max()
    curve_data = build_term_structure_curve(df, target_dt)
    return curve_data


@app.get("/api/analytics/carry-decomposition")
def get_carry_decomposition(
    symbol: str = Query("GOLDTEN"),
    expiry_date: Optional[str] = Query(None)
):
    """
    Decomposes daily price changes into:
    1. Mechanical Roll-Down (carry decay along the curve)
    2. Genuine Curve Shift (underlying gold spot/basis repricing)
    """
    records = query_bhavcopy_records(symbols=[symbol])
    if not records:
        return {"symbol": symbol, "decomposition": []}

    df = normalize_bhavcopy_records(records)
    target_expiry = expiry_date if expiry_date else df["expiry_date_str"].min()
    decomp = decompose_daily_curve_change(df, symbol=symbol, expiry_date_str=target_expiry)
    return {
        "symbol": symbol,
        "expiry_date": target_expiry,
        "methodology": "Decomposition: Total Change = Roll-Down Carry Decay + Genuine Curve Shift",
        "decomposition": decomp
    }


@app.get("/api/analytics/lifecycle")
def get_lifecycle_analytics(symbol: str = Query("GOLDTEN")):
    """Returns contract inception, liquidity ramp, peak OI, and avoid-zone trajectory."""
    records = query_bhavcopy_records(symbols=[symbol])
    if not records:
        return {"symbol": symbol, "lifecycles": []}

    df = normalize_bhavcopy_records(records)
    lifecycles = analyze_contract_lifecycle(df, symbol=symbol)
    return {
        "symbol": symbol,
        "avoid_zone_days": CONTRACT_SPECS.get(symbol, DEFAULT_THRESHOLDS).tender_period_days,
        "lifecycles": lifecycles
    }
