"""
GoldLens Ingestion Validator.
Applies strict data cleansing and validation rules for official MCX Bhavcopy feeds:
1. Multi-schema parsing (Standard MCX EOD CSV, UDiFF layout, broker CSV exports).
2. Date standardizations (DD-Mon-YYYY, DD/MM/YYYY, MM/DD/YYYY, YYYY-MM-DD).
3. Expiry date translation (e.g., '05-Nov-2024', '04SEP2026', '2026-09-04').
4. Instrument filtering: strictly retains Commodity Futures (FUTCOM / FUTURES); discards Options (OPTFUT).
5. Symbol normalization and whitespace trimming (GOLDM, GOLDTEN, GOLDGUINEA, GOLDPETAL).
6. Non-negotiable price validation (positive settlement price, non-negative volume and OI).
7. Deduplication on (trade_date, symbol, expiry_date).
"""

import re
from datetime import datetime
from typing import Dict, Any, List, Optional, Tuple
from app.config import CONTRACT_SPECS

# Target symbols permitted in GoldLens
ALLOWED_SYMBOLS = set(CONTRACT_SPECS.keys())

# Month mapping for compact MCX expiry dates (e.g., '04SEP2026' or '05-Nov-2024')
MONTH_MAP = {
    "JAN": "01", "FEB": "02", "MAR": "03", "APR": "04",
    "MAY": "05", "JUN": "06", "JUL": "07", "AUG": "08",
    "SEP": "09", "OCT": "10", "NOV": "11", "DEC": "12"
}


def parse_mcx_expiry_date(expiry_str: str) -> Optional[str]:
    """
    Parses MCX compact expiry format:
    - '05-Nov-2024' -> '2024-11-05'
    - '04SEP2026' -> '2026-09-04'
    - '27FEB2025' -> '2025-02-27'
    - '2026-09-04' -> '2026-09-04'
    - '05/11/2024' -> '2024-11-05'
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

    # Regex for hyphenated DD-Mon-YYYY (e.g. 05-NOV-2024 or 5-Nov-2024)
    m2 = re.match(r"^(\d{1,2})-([A-Z]{3})-(\d{4})$", s)
    if m2:
        day = m2.group(1).zfill(2)
        mon_str = m2.group(2)
        year = m2.group(3)
        if mon_str in MONTH_MAP:
            return f"{year}-{MONTH_MAP[mon_str]}-{day}"

    # Fallback to standard datetime formats
    for fmt in ("%d-%b-%Y", "%d/%m/%Y", "%m/%d/%Y", "%Y/%m/%d", "%d-%m-%Y"):
        try:
            return datetime.strptime(s, fmt).strftime("%Y-%m-%d")
        except ValueError:
            continue

    return None


def parse_trade_date_to_iso(date_str: str) -> Optional[str]:
    """
    Translates various exchange trade date representations to standard ISO 'YYYY-MM-DD'.
    Handles DD-Mon-YYYY, DD/MM/YYYY, MM/DD/YYYY, YYYYMMDD, and YYYY-MM-DD.
    """
    if not date_str:
        return None
    s = str(date_str).strip()

    if re.match(r"^\d{4}-\d{2}-\d{2}$", s):
        return s

    # Compact YYYYMMDD
    if re.match(r"^\d{8}$", s):
        try:
            return datetime.strptime(s, "%Y%m%d").strftime("%Y-%m-%d")
        except ValueError:
            pass

    # Standard date formats used across MCX Bhavcopy layouts
    formats = [
        "%d-%b-%Y", "%d-%B-%Y",
        "%d/%m/%Y", "%m/%d/%Y",
        "%d-%m-%Y", "%Y/%m/%d"
    ]

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


def extract_field_value(row: Dict[str, Any], candidate_keys: List[str]) -> Optional[Any]:
    """Extracts value using case-insensitive search across alternative header candidate names."""
    # Build lower-cased lookup map for robustness
    norm_row = {str(k).strip().upper(): v for k, v in row.items() if k is not None}
    for candidate in candidate_keys:
        cand_upper = candidate.strip().upper()
        if cand_upper in norm_row:
            val = norm_row[cand_upper]
            if val is not None and str(val).strip() != "":
                return val
    return None


def validate_bhavcopy_row(
    raw_row: Dict[str, Any],
    requested_date_iso: Optional[str] = None
) -> Tuple[Optional[Dict[str, Any]], Optional[str]]:
    """
    Validates a single Bhavcopy row across official MCX schema variations.
    Returns: (cleaned_dict, error_reason)
    """
    # 1. Filter out Options (OPTFUT) if INSTRUMENT column is present
    instrument = extract_field_value(raw_row, ["INSTRUMENT", "InstrumentName", "INST_TYPE"])
    if instrument:
        inst_str = str(instrument).strip().upper()
        if "OPT" in inst_str:
            return None, "FILTERED_OPTIONS_CONTRACT"

    # 2. Clean and trim Symbol
    raw_symbol = extract_field_value(
        raw_row, 
        ["SYMBOL", "Symbol", "TckrSymb", "COMMODITY", "Commodity", "InstrumentName"]
    )
    if not raw_symbol:
        return None, "EMPTY_SYMBOL"

    symbol_str = str(raw_symbol).strip().upper()
    if symbol_str not in ALLOWED_SYMBOLS:
        return None, f"FILTERED_SYMBOL_{symbol_str}"

    # 3. Parse Trade Date
    raw_date = extract_field_value(
        raw_row,
        ["Date", "TRADE_DATE", "TradDt", "BizDt", "Date_Time", "trade_date"]
    )
    if not raw_date and requested_date_iso:
        trade_date_iso = requested_date_iso
    else:
        trade_date_iso = parse_trade_date_to_iso(str(raw_date)) if raw_date else None

    if not trade_date_iso:
        return None, f"INVALID_DATE_{raw_date}"

    # Verify requested date vs returned date (detect holiday/weekend fallback in exchange responses)
    if requested_date_iso and trade_date_iso != requested_date_iso:
        return None, f"DATE_MISMATCH_REQUESTED_{requested_date_iso}_GOT_{trade_date_iso}"

    # 4. Parse Expiry Date
    raw_expiry = extract_field_value(
        raw_row,
        ["ExpiryDate", "EXPIRY_DT", "Expiry_Date", "XpryDt", "Expiry Date", "expiry_date"]
    )
    expiry_date_iso = parse_mcx_expiry_date(str(raw_expiry)) if raw_expiry else None
    if not expiry_date_iso:
        return None, f"INVALID_EXPIRY_{raw_expiry}"

    # 5. Extract and validate prices & volumes
    try:
        raw_open = extract_field_value(raw_row, ["Open", "OPEN", "OpnPric", "open_price"])
        raw_high = extract_field_value(raw_row, ["High", "HIGH", "HghPric", "high_price"])
        raw_low = extract_field_value(raw_row, ["Low", "LOW", "LowPric", "low_price"])
        raw_close = extract_field_value(
            raw_row, 
            ["SETTLE_PR", "SettlementPrice", "Close", "CLOSE", "ClsPric", "close_price", "SettlePrice"]
        )
        raw_prev = extract_field_value(
            raw_row,
            ["PreviousClose", "PREV_CLOSE", "PrvsClsPric", "PrvsClsgPric", "previous_close", "PrevClose", "PREV_CLS_PRIC"]
        )
        raw_vol = extract_field_value(
            raw_row,
            ["Volume", "VOLUME", "CONTRACTS", "VolumeInLots", "TtlTradgVol", "volume", "TradedQty"]
        )
        raw_oi = extract_field_value(
            raw_row,
            ["OpenInterest", "OPEN_INTEREST", "OPEN_INT", "OI", "OpnIntrst", "open_interest"]
        )
        raw_val = extract_field_value(
            raw_row,
            ["VAL_IN_LAKH", "ValueInLakhs", "Value", "value_in_lakhs", "Turnover"]
        )

        close_price = float(raw_close or 0.0)
        open_price = float(raw_open or close_price)
        high_price = float(raw_high or max(open_price, close_price))
        low_price = float(raw_low or min(open_price, close_price))
        prev_close = float(raw_prev or close_price)
        volume = int(float(raw_vol or 0))
        open_interest = int(float(raw_oi or 0))
        val_lakhs = float(raw_val or 0.0)
    except (ValueError, TypeError) as e:
        return None, f"NUMERIC_CONVERSION_ERROR_{str(e)}"

    # Settlement/Close price must be strictly positive for active contracts
    if close_price <= 0:
        return None, "ZERO_OR_NEGATIVE_CLOSE_PRICE"

    cleaned_record = {
        "trade_date": trade_date_iso,
        "symbol": symbol_str,
        "expiry_date": expiry_date_iso,
        "open_price": open_price if open_price > 0 else close_price,
        "high_price": high_price if high_price > 0 else close_price,
        "low_price": low_price if low_price > 0 else close_price,
        "close_price": close_price,
        "previous_close": prev_close,
        "volume": max(0, volume),
        "open_interest": max(0, open_interest),
        "value_in_lakhs": max(0.0, val_lakhs)
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
