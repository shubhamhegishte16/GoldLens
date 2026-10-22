"""
GoldLens MCX Bhavcopy Fetcher & Ingestion Service.
Supports:
1. Live daily Bhavcopy retrieval with polite rate limiting and exponential backoff retries.
2. Holiday/closure detection (discards MCX's habit of returning latest trading day for holidays).
3. CSV file upload and parsing.
4. Offline caching in SQLite.
"""

import time
import io
import csv
import logging
from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional, Tuple
from pathlib import Path
import httpx

from app.validator import (
    validate_bhavcopy_dataset,
    format_date_for_mcx_request,
    parse_trade_date_to_iso
)
from app.database import (
    insert_bhavcopy_records,
    log_ingestion_event,
    get_db_connection
)

logger = logging.getLogger("goldlens.fetcher")

# Official MCX Bhavcopy URLs and endpoints
MCX_BHAVCOPY_URL = "https://www.mcxindia.com/market-data/bhavcopy"
MCX_BHAVCOPY_CSV_URL = "https://www.mcxindia.com/backoffice/Common_cpr.aspx"

USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 GoldLens/1.0"


def parse_csv_stream(csv_content: str, requested_date_iso: Optional[str] = None) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
    """
    Parses a CSV string, cleans headers, and runs full validation.
    Handles varied column naming in MCX Bhavcopy releases.
    """
    reader = csv.DictReader(io.StringIO(csv_content))
    raw_rows = []
    for r in reader:
        # Strip header keys and values
        clean_row = {str(k).strip(): str(v).strip() for k, v in r.items() if k is not None}
        raw_rows.append(clean_row)

    return validate_bhavcopy_dataset(raw_rows, requested_date_iso=requested_date_iso)


def fetch_bhavcopy_for_date(
    trade_date_iso: str,
    max_retries: int = 2,
    timeout_secs: float = 10.0
) -> Tuple[bool, str, List[Dict[str, Any]]]:
    """
    Fetches daily Bhavcopy for a specific date from MCX.
    Validates requested date against returned date to catch holiday fallback.
    Returns: (success: bool, message: str, valid_records: List[Dict])
    """
    mcx_date_str = format_date_for_mcx_request(trade_date_iso)  # DD/MM/YYYY
    headers = {
        "User-Agent": USER_AGENT,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,text/csv,*/*;q=0.8",
        "Referer": "https://www.mcxindia.com/market-data/bhavcopy"
    }
    params = {
        "Date": mcx_date_str,
        "Commodity": "GOLD"
    }

    last_error = ""
    for attempt in range(1, max_retries + 1):
        try:
            with httpx.Client(timeout=timeout_secs, follow_redirects=True) as client:
                resp = client.get(MCX_BHAVCOPY_CSV_URL, params=params, headers=headers)
                
                if resp.status_code == 200 and len(resp.content) > 100:
                    text_content = resp.text
                    # Check if response is valid CSV
                    if "Symbol" in text_content or "InstrumentName" in text_content:
                        valid_records, report = parse_csv_stream(text_content, requested_date_iso=trade_date_iso)
                        if valid_records:
                            insert_bhavcopy_records(valid_records, source="LIVE_FETCH")
                            log_ingestion_event(
                                requested_date=trade_date_iso,
                                returned_date=valid_records[0]["trade_date"],
                                status="SUCCESS",
                                reason=f"Loaded {len(valid_records)} contracts",
                                rows_added=len(valid_records),
                                source="LIVE_FETCH"
                            )
                            return True, f"Successfully loaded {len(valid_records)} contracts for {trade_date_iso}", valid_records
                        else:
                            # Might be holiday or date mismatch
                            mismatch_reason = next(
                                (r for r in report["skipped_reasons"].keys() if "DATE_MISMATCH" in r), 
                                "NO_VALID_GOLD_CONTRACTS"
                            )
                            log_ingestion_event(
                                requested_date=trade_date_iso,
                                returned_date=None,
                                status="HOLIDAY_DISCARDED" if "DATE_MISMATCH" in mismatch_reason else "NO_DATA",
                                reason=mismatch_reason,
                                rows_added=0,
                                source="LIVE_FETCH"
                            )
                            return False, f"Date {trade_date_iso} skipped: {mismatch_reason}", []
                    else:
                        last_error = "Response did not contain valid Bhavcopy headers"
                else:
                    last_error = f"HTTP {resp.status_code}"

        except Exception as e:
            last_error = str(e)
            time.sleep(1.0 * attempt)

    log_ingestion_event(
        requested_date=trade_date_iso,
        returned_date=None,
        status="FETCH_FAILED",
        reason=last_error,
        rows_added=0,
        source="LIVE_FETCH"
    )
    return False, f"Live fetch failed for {trade_date_iso}: {last_error}", []


def fetch_bhavcopy_date_range(
    start_date_iso: str,
    end_date_iso: str,
    rate_limit_delay_secs: float = 0.5
) -> Dict[str, Any]:
    """
    Fetches Bhavcopy across a date range with polite rate limiting.
    Skips weekends and logs holidays.
    """
    start_dt = datetime.strptime(start_date_iso, "%Y-%m-%d")
    end_dt = datetime.strptime(end_date_iso, "%Y-%m-%d")

    curr = start_dt
    days_processed = 0
    success_days = 0
    skipped_days = 0
    total_records = 0

    while curr <= end_dt:
        # Skip Saturday (5) and Sunday (6)
        if curr.weekday() in (5, 6):
            curr += timedelta(days=1)
            continue

        date_str = curr.strftime("%Y-%m-%d")
        success, msg, records = fetch_bhavcopy_for_date(date_str)
        days_processed += 1
        if success:
            success_days += 1
            total_records += len(records)
        else:
            skipped_days += 1

        time.sleep(rate_limit_delay_secs)
        curr += timedelta(days=1)

    return {
        "start_date": start_date_iso,
        "end_date": end_date_iso,
        "days_processed": days_processed,
        "success_days": success_days,
        "skipped_days": skipped_days,
        "total_records_inserted": total_records
    }
