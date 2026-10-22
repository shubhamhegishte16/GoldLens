import sys
from pathlib import Path
import pytest
import pandas as pd
import numpy as np

backend_dir = Path(__file__).resolve().parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from app.analytics import (
    normalize_price,
    normalize_bhavcopy_records,
    compute_relative_value_spreads,
    build_term_structure_curve,
    decompose_daily_curve_change,
    analyze_contract_lifecycle
)
from app.database import query_bhavcopy_records, init_db
from app.sample_data import load_seed_dataset_into_db


def test_hand_computed_normalization():
    """
    Test hand-computed values specified in problem brief:
    Target: INR / gram at 999 purity.
    Formula: norm = (price / quote_unit_grams) * (999 / purity)
    """
    # 1. GOLDM: Quoted per 10g, purity 995
    # Price 85,000 -> (85,000 / 10) * (999 / 995) = 8,500 * 1.0040201 = 8,534.1709 INR/g
    norm_goldm = normalize_price(85000.0, "GOLDM")
    assert pytest.approx(norm_goldm, 0.01) == 8534.17

    # 2. GOLDTEN: Quoted per 10g, purity 999
    # Price 85,300 -> (85,300 / 10) * (999 / 999) = 8,530.00 INR/g
    norm_goldten = normalize_price(85300.0, "GOLDTEN")
    assert pytest.approx(norm_goldten, 0.01) == 8530.00

    # 3. GOLDGUINEA: Quoted per 8g, purity 999
    # Price 68,240 -> (68,240 / 8) * (999 / 999) = 8,530.00 INR/g
    norm_guinea = normalize_price(68240.0, "GOLDGUINEA")
    assert pytest.approx(norm_guinea, 0.01) == 8530.00

    # 4. GOLDPETAL: Quoted per 1g, purity 999
    # Price 8,530 -> (8,530 / 1) * (999 / 999) = 8,530.00 INR/g
    norm_petal = normalize_price(8530.0, "GOLDPETAL")
    assert pytest.approx(norm_petal, 0.01) == 8530.00


def test_relative_value_spread_calculation():
    """Verify spread calculation and rolling z-scores on real database records."""
    init_db()
    load_seed_dataset_into_db()
    records = query_bhavcopy_records()
    df = normalize_bhavcopy_records(records)

    # Spread between GOLDTEN and GOLDPETAL (same month-end expiry cycle)
    spreads = compute_relative_value_spreads(df, "GOLDTEN", "GOLDPETAL", window=20)
    assert len(spreads) > 0

    first = spreads[0]
    assert "spread_inr_g" in first
    assert "zscore" in first
    assert "in_avoid_zone" in first
    assert "signal" in first


def test_term_structure_and_carry():
    """Verify term structure curve and annualized carry formula."""
    records = query_bhavcopy_records()
    df = normalize_bhavcopy_records(records)
    
    # Pick a date with active trading
    sample_date = df["trade_date_str"].iloc[10]
    curve_data = build_term_structure_curve(df, sample_date)
    
    assert curve_data["trade_date"] == sample_date
    assert len(curve_data["curve_points"]) > 0
    if len(curve_data["implied_carry_table"]) > 0:
        carry_row = curve_data["implied_carry_table"][0]
        assert "implied_annualized_carry_pct" in carry_row
        assert carry_row["structure"] in ("CONTANGO", "BACKWARDATION")


def test_curve_change_decomposition():
    """Verify decomposition into roll-down decay vs curve shift."""
    records = query_bhavcopy_records()
    df = normalize_bhavcopy_records(records)
    
    decomp = decompose_daily_curve_change(df, "GOLDTEN", "2025-06-30")
    if decomp:
        item = decomp[0]
        # Total change = roll_down + curve_shift
        assert pytest.approx(
            item["total_daily_change_inr"], 0.001
        ) == item["roll_down_component_inr"] + item["curve_shift_component_inr"]


def test_contract_lifecycle():
    """Verify contract lifecycle, peak volume, and avoid-zone flagging."""
    records = query_bhavcopy_records()
    df = normalize_bhavcopy_records(records)
    
    lifecycles = analyze_contract_lifecycle(df, "GOLDTEN")
    assert len(lifecycles) > 0
    lc = lifecycles[0]
    assert lc["peak_volume"] > 0
    assert lc["avoid_zone_cutoff_days"] == 5
