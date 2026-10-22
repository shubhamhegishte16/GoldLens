"""
GoldLens Ingestion Validator.
Applies non-negotiable data cleansing and validation rules for MCX Bhavcopy feeds:
1. Parsing and standardizing dates (DD/MM/YYYY request vs MM/DD/YYYY response vs ISO YYYY-MM-DD).
2. Holiday & carry-over date detection: checks if returned trading date matches the requested date.
3. Expiry date translation (e.g. '04SEP2026' -> '2026-09-04').
4. Symbol trimming and space-padding removal.
5. Strict contract filtering (only GOLDM, GOLDTEN, GOLDGUINEA, GOLDPETAL).
6. Duplicate detection on (trade_date, symbol, expiry_date).
"""

import re
from datetime import datetime
from typing import Dict, Any, List, Optional, Tuple
from app.config import CONTRACT_SPECS

# Target symbols permitted in GoldLens
ALLOWED_SYMBOLS = set(CONTRACT_SPECS.keys())

# Month mapping for compact MCX expiry dates (e.g., '04SEP2026')
MONTH_MAP = {
    "JAN": "01", "FEB": "02", "MAR": "03", "APR": "04",
    "MAY": "05", "JUN": "06", "JUL": "07", "AUG": "08",
    "SEP": "09", "OCT": "10", "NOV": "11", "DEC": "12"
}


def parse_mcx_expiry_date(expiry_str: str) -> Optional[str]:
    """
    Parses MCX compact expiry format like '04SEP2026' or '27FEB2025' or '2026-09-04'
    into standard ISO format 'YYYY-MM-DD'.
    """
    if not expiry_str:
        return None
    s = str(expiry_str).strip().upper()
    
    # Check if already ISO format YYYY-MM-DD
    if re.match(r"^\d{4}-\d{2}-\d{2}$", s):
        return s

    # Regex for standard MCX compact format: DDMMMYYYY (e.g. 05AUG2025 or 4SEP2026)
    m = re.match(r"^(\d{1,2})([A-Z]{3})(\d{4})$", s)
    if m:
        day = m.group(1).zfill(2)
        mon_str = m.group(2)
        year = m.group(3)
        if mon_str in MONTH_MAP:
            return f"{year}-{MONTH_MAP[mon_str]}-{day}"

    # Try standard datetime fallback
    for fmt in ("%d-%b-%Y", "%d/%m/%Y", "%m/%d/%Y", "%Y/%m/%d"):
        try:
            return datetime.strptime(s, fmt).strftime("%Y-%m-%d")
        except ValueError:
            continue

    return None


def parse_trade_date_to_iso(date_str: str, assumed_source_format: Optional[str] = None) -> Optional[str]:
    """
    Translates various MCX response formats to standard ISO 'YYYY-MM-DD'.
    MCX requests use DD/MM/YYYY, but responses often use MM/DD/YYYY or DD-Mon-YYYY.
    """
    if not date_str:
        return None
    s = str(date_str).strip()
    if re.match(r"^\d{4}-\d{2}-\d{2}$", s):
        return s

    formats = []
    if assumed_source_format:
        formats.append(assumed_source_format)
    # Common MCX Bhavcopy date headers
    formats.extend(["%m/%d/%Y", "%d/%m/%Y", "%d-%b-%Y", "%d-%m-%Y", "%Y/%m/%d"])

    for fmt in formats:
        try:
            return datetime.strptime(s, fmt).strftime("%Y-%m-%d")
        except ValueError:
            continue
    return None


def format_date_for_mcx_request(iso_date: str) -> str:
    """Converts ISO 'YYYY-MM-DD' to MCX request format 'DD/MM/YYYY'."""
    dt = datetime.strptime(iso_date, "%Y-%m-%d")
    return dt.strftime("%d/%m/%Y")


def validate_bhavcopy_row(
    raw_row: Dict[str, Any],
    requested_date_iso: Optional[str] = None
) -> Tuple[Optional[Dict[str, Any]], Optional[str]]:
    """
    Validates a single Bhavcopy row.
    Returns: (cleaned_dict, error_reason)
    If row is invalid or belongs to another commodity, returns (None, reason).
    """
    # 1. Clean and trim Symbol
    raw_symbol = str(raw_row.get("Symbol") or raw_row.get("symbol") or raw_row.get("InstrumentName") or "").strip().upper()
    if not raw_symbol:
        return None, "EMPTY_SYMBOL"

    # Filter strictly to target MCX gold futures
    if raw_symbol not in ALLOWED_SYMBOLS:
        return None, f"FILTERED_SYMBOL_{raw_symbol}"

    # 2. Parse Trade Date
    raw_date = raw_row.get("Date") or raw_row.get("trade_date") or raw_row.get("Date_Time")
    trade_date_iso = parse_trade_date_to_iso(str(raw_date))
    if not trade_date_iso:
        return None, f"INVALID_DATE_{raw_date}"

    # 3. Check requested vs returned date (detect holiday/weekend latest-day fallback)
    if requested_date_iso and trade_date_iso != requested_date_iso:
        return None, f"DATE_MISMATCH_REQUESTED_{requested_date_iso}_GOT_{trade_date_iso}"

    # 4. Parse Expiry Date
    raw_expiry = raw_row.get("ExpiryDate") or raw_row.get("expiry_date") or raw_row.get("Expiry_Date")
    expiry_date_iso = parse_mcx_expiry_date(str(raw_expiry))
    if not expiry_date_iso:
        return None, f"INVALID_EXPIRY_{raw_expiry}"

    # 5. Extract and validate prices & volumes
    try:
        open_price = float(raw_row.get("Open") or raw_row.get("open_price") or 0.0)
        high_price = float(raw_row.get("High") or raw_row.get("high_price") or 0.0)
        low_price = float(raw_row.get("Low") or raw_row.get("low_price") or 0.0)
        # In MCX Bhavcopy, Close is typically the official Settlement Price
        close_price = float(
            raw_row.get("Close") or raw_row.get("close_price") or 
            raw_row.get("SettlementPrice") or raw_row.get("settlement_price") or 0.0
        )
        volume = int(float(raw_row.get("Volume") or raw_row.get("volume") or raw_row.get("VolumeInLots") or 0))
        open_interest = int(float(raw_row.get("OpenInterest") or raw_row.get("open_interest") or raw_row.get("OI") or 0))
    except (ValueError, TypeError) as e:
        return None, f"NUMERIC_CONVERSION_ERROR_{str(e)}"

    # Settlement price must be positive for valid contracts
    if close_price <= 0:
        return None, "ZERO_OR_NEGATIVE_CLOSE_PRICE"

    cleaned_record = {
        "trade_date": trade_date_iso,
        "symbol": raw_symbol,
        "expiry_date": expiry_date_iso,
        "open_price": open_price if open_price > 0 else close_price,
        "high_price": high_price if high_price > 0 else close_price,
        "low_price": low_price if low_price > 0 else close_price,
        "close_price": close_price,
        "volume": volume,
        "open_interest": open_interest
    }

    return cleaned_record, None


def validate_bhavcopy_dataset(
    rows: List[Dict[str, Any]],
    requested_date_iso: Optional[str] = None
) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
    """
    Validates a list of Bhavcopy rows.
    Enforces deduplication on (trade_date, symbol, expiry_date).
    Produces detailed validation report summary.
    """
    valid_records = []
    seen_keys = set()
    skipped_reasons: Dict[str, int] = {}
    duplicates_count = 0

    for r in rows:
        cleaned, error = validate_bhavcopy_row(r, requested_date_iso=requested_date_iso)
        if error:
            skipped_reasons[error] = skipped_reasons.get(error, 0) + 1
            continue

        key = (cleaned["trade_date"], cleaned["symbol"], cleaned["expiry_date"])
        if key in seen_keys:
            duplicates_count += 1
            skipped_reasons["DUPLICATE_ROW"] = skipped_reasons.get("DUPLICATE_ROW", 0) + 1
            continue

        seen_keys.add(key)
        valid_records.append(cleaned)

    report = {
        "total_input_rows": len(rows),
        "valid_rows_accepted": len(valid_records),
        "duplicates_skipped": duplicates_count,
        "skipped_reasons": skipped_reasons
    }

    return valid_records, report
