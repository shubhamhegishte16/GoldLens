"""
GoldLens MCX Bhavcopy Fetcher & Ingestion Service.
Handles:
1. Official live fetch attempts from MCX portal (with honest failure reporting for WAF blocks).
2. Processing and validation of official Bhavcopy CSV files and streams.
3. Folder ingestion for local actual Bhavcopy files.
4. SQLite persistence with strict separation between actual (is_sample=0) and sample data.
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
    format_date_for_mcx_request
)
from app.database import (
    insert_bhavcopy_records,
    log_ingestion_event
)

logger = logging.getLogger("goldlens.fetcher")

# Official MCX Bhavcopy URL endpoints
MCX_BHAVCOPY_URL = "https://www.mcxindia.com/market-data/bhavcopy"
USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 GoldLens/1.0"


def parse_csv_stream(
    csv_content: str, 
    requested_date_iso: Optional[str] = None
) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
    """
    Parses a CSV string, cleans headers, and runs full multi-schema validation.
    Handles varied column naming in official MCX Bhavcopy releases (standard EOD, UDiFF, broker exports).
    """
    reader = csv.DictReader(io.StringIO(csv_content))
    raw_rows = []
    for r in reader:
        clean_row = {str(k).strip(): str(v).strip() for k, v in r.items() if k is not None}
        raw_rows.append(clean_row)

    return validate_bhavcopy_dataset(raw_rows, requested_date_iso=requested_date_iso)


def fetch_bhavcopy_for_date(
    trade_date_iso: str,
    max_retries: int = 2,
    timeout_secs: float = 10.0
) -> Tuple[bool, str, List[Dict[str, Any]]]:
    """
    Attempts to fetch daily Bhavcopy for a specific date from official MCX endpoint.
    
    Security & WAF Notice:
    MCX India protects its public endpoints using Akamai EdgeSuite WAF and ASP.NET ViewState
    postbacks. Non-browser automated requests often receive HTTP 403 Forbidden.
    This function reports the exact network/WAF result honestly and NEVER fabricates data.
    """
    mcx_date_str = format_date_for_mcx_request(trade_date_iso)  # DD/MM/YYYY
    headers = {
        "User-Agent": USER_AGENT,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,text/csv,*/*;q=0.8",
        "Referer": MCX_BHAVCOPY_URL,
        "Accept-Language": "en-US,en;q=0.9"
    }
    params = {
        "Date": mcx_date_str,
        "Commodity": "GOLD"
    }

    last_error = ""
    status_code = 0

    for attempt in range(1, max_retries + 1):
        try:
            with httpx.Client(timeout=timeout_secs, follow_redirects=True) as client:
                resp = client.get(MCX_BHAVCOPY_URL, params=params, headers=headers)
                status_code = resp.status_code

                if resp.status_code == 200 and len(resp.content) > 100:
                    text_content = resp.text
                    # Check if response is valid CSV containing Bhavcopy headers
                    if any(h in text_content for h in ["Symbol", "SYMBOL", "InstrumentName", "EXPIRY_DT", "OpnPric"]):
                        valid_records, report = parse_csv_stream(text_content, requested_date_iso=trade_date_iso)
                        if valid_records:
                            insert_bhavcopy_records(
                                valid_records, 
                                source="MCX_LIVE_FETCH", 
                                is_sample=0,
                                source_filename=f"mcx_{trade_date_iso}.csv"
                            )
                            log_ingestion_event(
                                requested_date=trade_date_iso,
                                returned_date=valid_records[0]["trade_date"],
                                status="SUCCESS",
                                reason=f"Loaded {len(valid_records)} contracts",
                                rows_added=len(valid_records),
                                source="MCX_LIVE_FETCH"
                            )
                            return True, f"Successfully loaded {len(valid_records)} official MCX contracts for {trade_date_iso}", valid_records
                        else:
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
                                source="MCX_LIVE_FETCH"
                            )
                            return False, f"Date {trade_date_iso} skipped: {mismatch_reason}", []
                    else:
                        last_error = "MCX portal returned HTML page without downloadable CSV data"
                elif resp.status_code == 403:
                    last_error = "MCX Web Application Firewall (Akamai EdgeSuite) blocked automated request with HTTP 403 Forbidden. The exchange requires interactive browser access to generate and download Bhavcopy files."
                    break
                else:
                    last_error = f"MCX server returned HTTP {resp.status_code}"

        except Exception as e:
            last_error = f"Network connection error: {str(e)}"
            if attempt < max_retries:
                time.sleep(1.0 * attempt)

    failure_status = "WAF_BLOCKED_403" if status_code == 403 else "FETCH_FAILED"
    log_ingestion_event(
        requested_date=trade_date_iso,
        returned_date=None,
        status=failure_status,
        reason=last_error,
        rows_added=0,
        source="MCX_LIVE_FETCH"
    )
    return False, last_error, []


def import_bhavcopy_csv(
    csv_content: str,
    filename: str = "uploaded_bhavcopy.csv",
    is_sample: int = 0
) -> Tuple[bool, str, List[Dict[str, Any]], Dict[str, Any]]:
    """
    Ingests and validates an official MCX Bhavcopy CSV file.
    Inserts records into SQLite tagged with source provenance and is_sample flag.
    Returns: (success: bool, message: str, records: list, validation_report: dict)
    """
    valid_records, report = parse_csv_stream(csv_content)
    if not valid_records:
        error_msg = f"No valid MCX gold contracts found in {filename}. Scanned {report.get('total_input_rows', 0)} rows."
        log_ingestion_event(
            requested_date=None,
            returned_date=None,
            status="MALFORMED_OR_NO_DATA",
            reason=error_msg,
            rows_added=0,
            source="CSV_IMPORT",
            filename=filename
        )
        return False, error_msg, [], report

    source_tag = "SAMPLE_SEED" if is_sample == 1 else "MCX_BHAVCOPY_OFFICIAL"
    inserted = insert_bhavcopy_records(
        valid_records, 
        source=source_tag, 
        is_sample=is_sample, 
        source_filename=filename
    )

    first_date = valid_records[0]["trade_date"]
    last_date = valid_records[-1]["trade_date"]
    date_summary = first_date if first_date == last_date else f"{first_date} to {last_date}"

    log_ingestion_event(
        requested_date=date_summary,
        returned_date=date_summary,
        status="SUCCESS",
        reason=f"Imported {inserted} records from {filename}",
        rows_added=inserted,
        source=source_tag,
        filename=filename
    )

    msg = f"Successfully imported {inserted} records from {filename} ({date_summary}). Mode: {'SAMPLE' if is_sample == 1 else 'ACTUAL MCX'}."
    return True, msg, valid_records, report


def import_bhavcopy_directory(
    dir_path: Path, 
    is_sample: int = 0
) -> Dict[str, Any]:
    """
    Processes all .csv files within a designated folder and imports valid actual records.
    """
    if not dir_path.exists() or not dir_path.is_dir():
        return {"success": False, "files_processed": 0, "total_records": 0, "message": f"Directory not found: {dir_path}"}

    csv_files = sorted(dir_path.glob("*.csv"))
    total_files = len(csv_files)
    total_records = 0
    file_summaries = []

    for f in csv_files:
        try:
            content = f.read_text(encoding="utf-8", errors="replace")
            success, msg, records, _ = import_bhavcopy_csv(content, filename=f.name, is_sample=is_sample)
            if success:
                total_records += len(records)
                file_summaries.append({"file": f.name, "records": len(records), "status": "SUCCESS"})
            else:
                file_summaries.append({"file": f.name, "records": 0, "status": "SKIPPED", "error": msg})
        except Exception as e:
            file_summaries.append({"file": f.name, "records": 0, "status": "ERROR", "error": str(e)})

    return {
        "success": total_records > 0,
        "files_processed": total_files,
        "total_records_inserted": total_records,
        "details": file_summaries
    }


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
