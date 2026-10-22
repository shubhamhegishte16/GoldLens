import sys
from pathlib import Path
backend_dir = Path(__file__).resolve().parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

"""
Unit and integration tests for actual MCX Bhavcopy data handling,
normalization accuracy across contract purities and lot units,
cross-cycle expiry matching, term structure carry calculations,
data segregation (actual vs sample), and WAF error reporting.
"""

import pytest
import pandas as pd
from unittest.mock import patch, MagicMock

from app.config import CONTRACT_SPECS, TARGET_PURITY
from app.analytics import (
    normalize_price,
    normalize_bhavcopy_records,
    compute_relative_value_spreads,
    build_term_structure_curve,
    decompose_daily_curve_change,
    compute_cheap_expensive_matrix
)
from app.database import (
    query_bhavcopy_records,
    get_data_quality_stats,
    insert_bhavcopy_records
)
from app.validator import (
    validate_bhavcopy_row,
    validate_bhavcopy_dataset
)
from app.fetcher import (
    parse_csv_stream,
    fetch_bhavcopy_for_date,
    import_bhavcopy_csv
)


class TestContractNormalization:
    """Tests canonical price normalization: norm = (price / quote_unit_grams) * (999 / purity)."""

    def test_goldm_purity_normalization(self):
        # GOLDM: 10g quote, 995 fineness
        # Raw price: 85,000 for 10g
        # Normalized: (85000 / 10) * (999 / 995) = 8500 * 1.0040201005 = 8534.1709
        norm = normalize_price(85000.0, "GOLDM")
        expected = round((85000.0 / 10.0) * (999.0 / 995.0), 4)
        assert pytest.approx(norm, 0.001) == expected
        assert norm > 8500.0  # Purity premium applied

    def test_goldten_normalization(self):
        # GOLDTEN: 10g quote, 999 fineness
        # Raw price: 85,300 for 10g
        # Normalized: (85300 / 10) * (999 / 999) = 8530.00
        norm = normalize_price(85300.0, "GOLDTEN")
        assert norm == 8530.0

    def test_goldguinea_normalization(self):
        # GOLDGUINEA: 8g quote, 999 fineness
        # Raw price: 68,240 for 8g
        # Normalized: (68240 / 8) * (999 / 999) = 8530.00
        norm = normalize_price(68240.0, "GOLDGUINEA")
        assert norm == 8530.0

    def test_goldpetal_normalization(self):
        # GOLDPETAL: 1g quote, 999 fineness
        # Raw price: 8,530 for 1g
        # Normalized: (8530 / 1) * (999 / 999) = 8530.00
        norm = normalize_price(8530.0, "GOLDPETAL")
        assert norm == 8530.0

    def test_zero_or_negative_price(self):
        assert normalize_price(0.0, "GOLDTEN") == 0.0
        assert normalize_price(-100.0, "GOLDTEN") == 0.0

    def test_invalid_symbol(self):
        with pytest.raises(ValueError):
            normalize_price(85000.0, "INVALID_CONTRACT")


class TestDataSegregation:
    """Verifies that actual data (is_sample=0) and sample data (is_sample=1) are strictly segregated."""

    def test_actual_vs_sample_query_separation(self):
        actual_records = query_bhavcopy_records(is_sample=0)
        sample_records = query_bhavcopy_records(is_sample=1)

        # Confirm all actual records are is_sample=0
        for r in actual_records:
            assert r["is_sample"] == 0

        # Confirm all sample records are is_sample=1
        for r in sample_records:
            assert r["is_sample"] == 1

        # Confirm no overlap in dataset
        if actual_records and sample_records:
            actual_keys = {(r["trade_date"], r["symbol"], r["expiry_date"]) for r in actual_records}
            sample_keys = {(r["trade_date"], r["symbol"], r["expiry_date"]) for r in sample_records}
            # Dates in actual Q4 2024 vs sample 2025-2026 must be strictly different
            assert len(actual_keys.intersection(sample_keys)) == 0

    def test_data_quality_stats_provenance(self):
        stats = get_data_quality_stats()
        assert "data_mode" in stats
        assert "active_source" in stats
        assert "total_actual_records" in stats
        assert "total_sample_records" in stats
        assert stats["total_actual_records"] >= 388
        assert stats["total_sample_records"] >= 1463
        assert stats["data_mode"] == "ACTUAL"  # Prefers actual when present


class TestTermStructureCarry:
    """Validates positive DTE filtering and annualized carry math."""

    def test_term_structure_excludes_zero_or_negative_dte(self):
        test_df = pd.DataFrame([
            {
                "trade_date": "2024-10-31",
                "symbol": "GOLDTEN",
                "expiry_date": "2024-10-31",  # DTE = 0 (expired today)
                "close_price": 80000.0, "norm_close": 8000.0,
                "volume": 100,
                "open_interest": 500,
                "is_sample": 0
            },
            {
                "trade_date": "2024-10-31",
                "symbol": "GOLDTEN",
                "expiry_date": "2024-11-28",  # DTE = 28 (positive)
                "close_price": 80400.0, "norm_close": 8040.0,
                "volume": 500,
                "open_interest": 2000,
                "is_sample": 0
            },
            {
                "trade_date": "2024-10-31",
                "symbol": "GOLDTEN",
                "expiry_date": "2024-12-31",  # DTE = 61 (positive)
                "close_price": 80800.0, "norm_close": 8080.0,
                "volume": 200,
                "open_interest": 1000,
                "is_sample": 0
            }
        ])
        test_df = normalize_bhavcopy_records(test_df.to_dict(orient="records"))
        curve_data = build_term_structure_curve(test_df, "2024-10-31")

        # Expired contract (DTE <= 0) must be excluded from forward curve
        dtes = [p["dte"] for p in curve_data["curve_points"]]
        assert all(d > 0 for d in dtes)
        assert len(curve_data["curve_points"]) == 2

        # Check implied carry calculation between 28 DTE and 61 DTE
        table = curve_data["implied_carry_table"]
        assert len(table) == 1
        carry_row = table[0]
        assert carry_row["near_expiry"] == "2024-11-28"
        assert carry_row["far_expiry"] == "2024-12-31"
        assert carry_row["structure"] == "CONTANGO"
        assert carry_row["implied_annualized_carry_pct"] > 0


class TestRelativeValueCalculations:
    """Validates rolling Z-score, zero-std protection, and cheap/expensive matrix."""

    def test_zero_std_protection(self):
        # When spread is perfectly constant, std is 0. Z-score should safely evaluate to 0.0, not NaN or error.
        dates = pd.date_range("2024-10-01", periods=10, freq="B").strftime("%Y-%m-%d").tolist()
        records = []
        for d in dates:
            records.append({
                "trade_date": d,
                "symbol": "GOLDTEN",
                "expiry_date": "2024-11-28",
                "open_price": 80000.0,
                "high_price": 80000.0,
                "low_price": 80000.0,
                "close_price": 80000.0,
                "volume": 100,
                "open_interest": 500,
                "is_sample": 0
            })
            records.append({
                "trade_date": d,
                "symbol": "GOLDPETAL",
                "expiry_date": "2024-11-28",
                "open_price": 8000.0,
                "high_price": 8000.0,
                "low_price": 8000.0,
                "close_price": 8000.0,
                "volume": 100,
                "open_interest": 500,
                "is_sample": 0
            })
        df = normalize_bhavcopy_records(records)
        spreads = compute_relative_value_spreads(df, "GOLDTEN", "GOLDPETAL", window=5)
        assert len(spreads) > 0
        for sp in spreads:
            if sp["zscore"] is not None:
                assert not pd.isna(sp["zscore"])
                assert sp["zscore"] == 0.0


class TestOfficialSchemaIngestion:
    """Validates multi-schema Bhavcopy parsing and OPTFUT filtering."""

    def test_udiff_schema_parsing(self):
        csv_udiff = """BizDt,TckrSymb,INST_TYPE,EXPIRY_DT,OpnPric,HghPric,LwPric,ClsPric,TtlTradgVol,OpnIntrst,PrvsClsgPric
2024-10-15,GOLDTEN,FUTCOM,28NOV2024,78500,78900,78400,78750,150,850,78450
2024-10-15,GOLDTEN,OPTFUT,28NOV2024,1200,1400,1100,1300,50,200,1250
"""
        records, report = parse_csv_stream(csv_udiff)
        # OPTFUT should be discarded, FUTCOM preserved
        assert len(records) == 1
        assert records[0]["symbol"] == "GOLDTEN"
        assert records[0]["trade_date"] == "2024-10-15"
        assert records[0]["close_price"] == 78750.0
        assert records[0]["previous_close"] == 78450.0

    def test_honest_waf_403_reporting(self):
        # Mock httpx client response returning 403 Forbidden
        mock_resp = MagicMock()
        mock_resp.status_code = 403
        mock_resp.content = b"<html><head><title>Access Denied - AkamaiGHost</title></head></html>"
        mock_resp.text = "Access Denied"

        with patch("httpx.Client.get", return_value=mock_resp):
            success, msg, records = fetch_bhavcopy_for_date("2024-11-20")
            assert success is False
            assert len(records) == 0
            assert "Akamai" in msg or "403" in msg or "WAF" in msg


class TestBhavCopyDateWiseSchema:
    """
    Regression tests using representative rows from official MCX BhavCopyDateWise CSV files.
    Specifically validates:
    - Date format 'DD Mon YYYY' (e.g. '21 Oct 2026' -> '2026-10-21')
    - Header mapping with spaces and parentheses:
      'Instrument Name', 'Expiry Date', 'Option Type', 'Previous Close',
      'Volume(Lots)', 'Value(Lacs)', 'Open Interest(Lots)'
    - Strict inclusion of 4 gold contracts: GOLDM, GOLDTEN, GOLDGUINEA, GOLDPETAL
    - Filtering of Options (OPTFUT / CE / PE)
    - Filtering of non-target commodities (GOLD institutional 1kg, SILVER, etc.)
    """

    SAMPLE_BHAVCOPY_CSV = (
        "Date,Instrument Name,Symbol,Expiry Date,Option Type,Strike Price,Open,High,Low,Close,Previous Close,Volume(Lots),Volume(In 000's),Value(Lacs),Open Interest(Lots)\n"
        "21 Oct 2026,FUTCOM,GOLDGUINEA,30OCT2026,-,0.00,116800.00,117280.00,116424.00,116648.00,117020.00,5329,42.632,6211.70,13034\n"
        "21 Oct 2026,FUTCOM,GOLDM,05NOV2026,-,0.00,144700.00,145180.00,144400.00,144584.00,145015.00,26349,263.490,380840.40,50749\n"
        "21 Oct 2026,FUTCOM,GOLDPETAL,30OCT2026,-,0.00,14605.00,14644.00,14571.00,14581.00,14627.00,103087,103.087,15019.79,180244\n"
        "21 Oct 2026,FUTCOM,GOLDTEN,30OCT2026,-,0.00,145199.00,145610.00,144888.00,145015.00,145473.00,11545,115.450,16733.29,27919\n"
        "21 Oct 2026,OPTFUT,GOLDM,05NOV2026,CE,145000.00,1100.00,1350.00,950.00,1020.00,1150.00,150,1.500,21.75,320\n"
        "21 Oct 2026,FUTCOM,GOLD,05DEC2026,-,0.00,145000.00,145500.00,144800.00,145100.00,145200.00,1000,100.000,14500.00,2500\n"
        "21 Oct 2026,FUTCOM,SILVER,05DEC2026,-,0.00,98000.00,98500.00,97800.00,98200.00,98100.00,500,15.000,4900.00,1200\n"
    )

    def test_bhavcopy_datewise_parsing(self):
        records, report = parse_csv_stream(self.SAMPLE_BHAVCOPY_CSV)

        # 4 target gold futures contracts must be accepted
        assert len(records) == 4
        symbols = {r["symbol"] for r in records}
        assert symbols == {"GOLDGUINEA", "GOLDM", "GOLDPETAL", "GOLDTEN"}

        # Verify trade date translation for all records
        for r in records:
            assert r["trade_date"] == "2026-10-21"

        # Check GOLDGUINEA record details
        guinea = next(r for r in records if r["symbol"] == "GOLDGUINEA")
        assert guinea["expiry_date"] == "2026-10-30"
        assert guinea["close_price"] == 116648.0
        assert guinea["previous_close"] == 117020.0
        assert guinea["volume"] == 5329
        assert guinea["open_interest"] == 13034
        assert pytest.approx(guinea["value_in_lakhs"], 0.01) == 6211.70

        # Check GOLDM record details
        goldm = next(r for r in records if r["symbol"] == "GOLDM")
        assert goldm["expiry_date"] == "2026-11-05"
        assert goldm["close_price"] == 144584.0
        assert goldm["previous_close"] == 145015.0
        assert goldm["volume"] == 26349
        assert goldm["open_interest"] == 50749
        assert pytest.approx(goldm["value_in_lakhs"], 0.01) == 380840.40

        # Check GOLDPETAL record details
        petal = next(r for r in records if r["symbol"] == "GOLDPETAL")
        assert petal["expiry_date"] == "2026-10-30"
        assert petal["close_price"] == 14581.0
        assert petal["previous_close"] == 14627.0
        assert petal["volume"] == 103087
        assert petal["open_interest"] == 180244
        assert pytest.approx(petal["value_in_lakhs"], 0.01) == 15019.79

        # Check GOLDTEN record details
        goldten = next(r for r in records if r["symbol"] == "GOLDTEN")
        assert goldten["expiry_date"] == "2026-10-30"
        assert goldten["close_price"] == 145015.0
        assert goldten["previous_close"] == 145473.0
        assert goldten["volume"] == 11545
        assert goldten["open_interest"] == 27919
        assert pytest.approx(goldten["value_in_lakhs"], 0.01) == 16733.29

        # Verify skipped items
        skipped = report["skipped_reasons"]
        assert skipped.get("FILTERED_OPTIONS_CONTRACT", 0) == 1
        assert skipped.get("FILTERED_SYMBOL_GOLD", 0) == 1
        assert skipped.get("FILTERED_SYMBOL_SILVER", 0) == 1

    def test_import_bhavcopy_csv_actual_provenance(self):
        success, msg, records, report = import_bhavcopy_csv(
            self.SAMPLE_BHAVCOPY_CSV,
            filename="BhavCopyDateWise_21102026.csv",
            is_sample=0
        )
        assert success is True
        assert len(records) == 4
        assert "Successfully imported 4 records" in msg
        assert "ACTUAL MCX" in msg
