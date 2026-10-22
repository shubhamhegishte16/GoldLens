import sys
from pathlib import Path
import pytest

# Ensure backend directory is in sys.path
backend_dir = Path(__file__).resolve().parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from app.validator import (
    parse_mcx_expiry_date,
    parse_trade_date_to_iso,
    format_date_for_mcx_request,
    validate_bhavcopy_row,
    validate_bhavcopy_dataset
)
from app.database import init_db, insert_bhavcopy_records, get_data_quality_stats
from app.sample_data import load_seed_dataset_into_db


def test_mcx_expiry_date_parsing():
    """Validates compact MCX expiry parsing (e.g. 04SEP2026 -> 2026-09-04)."""
    assert parse_mcx_expiry_date("04SEP2026") == "2026-09-04"
    assert parse_mcx_expiry_date("27FEB2025") == "2025-02-27"
    assert parse_mcx_expiry_date("5AUG2025") == "2025-08-05"
    assert parse_mcx_expiry_date("2025-10-31") == "2025-10-31"
    assert parse_mcx_expiry_date("31-Dec-2025") == "2025-12-31"
    assert parse_mcx_expiry_date("") is None
    assert parse_mcx_expiry_date("INVALID") is None


def test_trade_date_parsing_and_formatting():
    """Validates trade date translation between MCX formats and ISO standard."""
    # US format MM/DD/YYYY to ISO
    assert parse_trade_date_to_iso("04/25/2025") == "2025-04-25"
    # ISO to MCX request format DD/MM/YYYY
    assert format_date_for_mcx_request("2025-04-25") == "25/04/2025"


def test_symbol_trimming_and_filtering():
    """Validates symbol whitespace stripping and filtering to 4 permitted contracts."""
    # Permitted symbol with extra whitespace
    row_goldm = {
        "Symbol": "  GOLDM   ",
        "Date": "2025-05-15",
        "ExpiryDate": "05JUN2025",
        "Open": "82000",
        "High": "82500",
        "Low": "81800",
        "Close": "82200",
        "Volume": "150",
        "OpenInterest": "1200"
    }
    cleaned, err = validate_bhavcopy_row(row_goldm)
    assert err is None
    assert cleaned["symbol"] == "GOLDM"
    assert cleaned["trade_date"] == "2025-05-15"
    assert cleaned["expiry_date"] == "2025-06-05"

    # Non-gold symbol should be discarded
    row_silver = {
        "Symbol": "SILVERM",
        "Date": "2025-05-15",
        "ExpiryDate": "05JUN2025",
        "Close": "90000"
    }
    cleaned, err = validate_bhavcopy_row(row_silver)
    assert cleaned is None
    assert "FILTERED_SYMBOL_SILVERM" in err


def test_holiday_date_mismatch_detection():
    """
    MCX returns the latest prior trading day when requested on a weekend/holiday.
    Ensure our validator flags and discards date mismatches.
    """
    row_holiday_mismatch = {
        "Symbol": "GOLDTEN",
        "Date": "2025-04-17", # Prior day returned by MCX
        "ExpiryDate": "30APR2025",
        "Close": "82500",
        "Volume": "50",
        "OpenInterest": "400"
    }
    # Requested date is Good Friday (2025-04-18)
    cleaned, err = validate_bhavcopy_row(row_holiday_mismatch, requested_date_iso="2025-04-18")
    assert cleaned is None
    assert "DATE_MISMATCH" in err


def test_deduplication_and_dataset_validation():
    """Validates duplicate rejection on identical (trade_date, symbol, expiry_date)."""
    rows = [
        {"Symbol": "GOLDTEN", "Date": "2025-06-10", "ExpiryDate": "30JUN2025", "Close": "83000", "Volume": "100", "OpenInterest": "500"},
        {"Symbol": "GOLDTEN", "Date": "2025-06-10", "ExpiryDate": "30JUN2025", "Close": "83000", "Volume": "100", "OpenInterest": "500"}, # duplicate
        {"Symbol": "GOLDPETAL", "Date": "2025-06-10", "ExpiryDate": "30JUN2025", "Close": "8300", "Volume": "80", "OpenInterest": "300"},
    ]
    valid_records, report = validate_bhavcopy_dataset(rows)
    assert len(valid_records) == 2
    assert report["duplicates_skipped"] == 1


def test_database_and_quality_report():
    """Validates SQLite ingestion and statistical summary computation."""
    init_db()
    inserted = load_seed_dataset_into_db()
    assert inserted > 0

    stats = get_data_quality_stats()
    assert stats["total_sample_records"] >= inserted
    assert stats["data_mode"] in ("ACTUAL", "SAMPLE")
    assert len(stats["contract_coverage"]) == 4
