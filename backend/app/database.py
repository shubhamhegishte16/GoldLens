"""
GoldLens SQLite Storage & Persistence Layer.
Stores raw and validated MCX Bhavcopy records with strict provenance:
- is_sample = 0: Official MCX Bhavcopy end-of-day exchange data
- is_sample = 1: Seeded offline hackathon demo data
Tracks data quality metrics, skipped dates, ingestion audit history, and source staleness.
Never silently mixes actual and sample records in the same query.
"""

import sqlite3
import os
from typing import List, Dict, Any, Optional, Tuple
from datetime import datetime, timedelta
from pathlib import Path

# Database path in /data directory
DB_DIR = Path(__file__).resolve().parent.parent.parent / "data"
DB_PATH = DB_DIR / "goldlens.db"

_db_initialized = False

def get_db_connection() -> sqlite3.Connection:
    """Creates directory if needed and returns a sqlite3 connection with Row factory."""
    global _db_initialized
    DB_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    if not _db_initialized:
        _db_initialized = True
        _run_migrations(conn)
    return conn

def _run_migrations(conn: sqlite3.Connection):
    """Ensures tables and all required columns exist."""
    cursor = conn.cursor()
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS bhavcopy_records (
            trade_date TEXT NOT NULL,         -- YYYY-MM-DD
            symbol TEXT NOT NULL,             -- GOLDM, GOLDTEN, GOLDGUINEA, GOLDPETAL
            expiry_date TEXT NOT NULL,        -- YYYY-MM-DD
            open_price REAL NOT NULL,
            high_price REAL NOT NULL,
            low_price REAL NOT NULL,
            close_price REAL NOT NULL,        -- Official settlement price (EOD)
            volume INTEGER NOT NULL,          -- Traded lots (contracts)
            open_interest INTEGER NOT NULL,   -- Outstanding lots (OI)
            previous_close REAL DEFAULT 0.0,  -- Previous session settlement price
            value_in_lakhs REAL DEFAULT 0.0,  -- Turnover in INR Lakhs
            is_sample INTEGER DEFAULT 0,      -- 0 if actual MCX, 1 if seeded sample
            source TEXT DEFAULT 'MCX_BHAVCOPY', -- MCX_BHAVCOPY, CSV_UPLOAD, SAMPLE_SEED
            source_filename TEXT,
            ingested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (trade_date, symbol, expiry_date, is_sample)
        )
    """)

    # Safe migrations for existing databases lacking newer columns
    for col_def in [
        "previous_close REAL DEFAULT 0.0",
        "value_in_lakhs REAL DEFAULT 0.0",
        "source TEXT DEFAULT 'MCX_BHAVCOPY'",
        "source_filename TEXT"
    ]:
        try:
            cursor.execute(f"ALTER TABLE bhavcopy_records ADD COLUMN {col_def}")
        except sqlite3.OperationalError:
            pass

    cursor.execute("""
        CREATE INDEX IF NOT EXISTS idx_bhavcopy_date_sym_mode 
        ON bhavcopy_records (is_sample, trade_date, symbol)
    """)

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS ingestion_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            requested_date TEXT,
            returned_date TEXT,
            status TEXT NOT NULL,
            reason TEXT,
            rows_added INTEGER DEFAULT 0,
            source TEXT DEFAULT 'LIVE_FETCH',
            filename TEXT,
            logged_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    try:
        cursor.execute("ALTER TABLE ingestion_logs ADD COLUMN filename TEXT")
    except sqlite3.OperationalError:
        pass

    conn.commit()

def init_db():
    """Initializes tables for Bhavcopy market data and data quality audit logs."""
    conn = get_db_connection()
    conn.close()


def insert_bhavcopy_records(
    records: List[Dict[str, Any]], 
    source: str = "LIVE_FETCH",
    is_sample: int = 0,
    source_filename: Optional[str] = None
) -> int:
    """
    Inserts or replaces validated records into SQLite.
    Guarantees that actual records (is_sample=0) and sample records (is_sample=1)
    are tracked with proper provenance.
    """
    if not records:
        return 0

    conn = get_db_connection()
    cursor = conn.cursor()

    inserted_count = 0
    for r in records:
        prev_close = float(r.get("previous_close") or r.get("prev_close") or 0.0)
        val_lakhs = float(r.get("value_in_lakhs") or r.get("val_in_lakh") or 0.0)

        cursor.execute("""
            INSERT OR REPLACE INTO bhavcopy_records (
                trade_date, symbol, expiry_date,
                open_price, high_price, low_price, close_price,
                volume, open_interest, previous_close, value_in_lakhs,
                is_sample, source, source_filename, ingested_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        """, (
            r["trade_date"],
            r["symbol"],
            r["expiry_date"],
            float(r["open_price"]),
            float(r["high_price"]),
            float(r["low_price"]),
            float(r["close_price"]),
            int(r["volume"]),
            int(r["open_interest"]),
            prev_close,
            val_lakhs,
            is_sample,
            source,
            source_filename
        ))
        inserted_count += 1

    conn.commit()
    conn.close()
    return inserted_count


def log_ingestion_event(
    requested_date: Optional[str],
    returned_date: Optional[str],
    status: str,
    reason: str,
    rows_added: int = 0,
    source: str = "LIVE_FETCH",
    filename: Optional[str] = None
):
    """Logs an ingestion event or data validation anomaly with provenance."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO ingestion_logs (
            requested_date, returned_date, status, reason, rows_added, source, filename, logged_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    """, (requested_date, returned_date, status, reason, rows_added, source, filename))
    conn.commit()
    conn.close()


def query_bhavcopy_records(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    symbols: Optional[List[str]] = None,
    is_sample: Optional[int] = None
) -> List[Dict[str, Any]]:
    """
    Fetches bhavcopy records matching optional filters ordered by date, symbol, expiry.
    
    Data Mode Logic:
    - If is_sample is explicitly 0: Queries ACTUAL MCX records only.
    - If is_sample is explicitly 1: Queries SAMPLE records only.
    - If is_sample is None: Automatically prefers ACTUAL records if any exist in the database;
      falls back to SAMPLE records if no actual data has been imported yet.
    NEVER silently mixes actual and sample records together.
    """
    conn = get_db_connection()
    cursor = conn.cursor()

    # Determine mode if not explicitly supplied
    target_mode = is_sample
    if target_mode is None:
        cursor.execute("SELECT COUNT(*) FROM bhavcopy_records WHERE is_sample = 0")
        actual_count = cursor.fetchone()[0]
        target_mode = 0 if actual_count > 0 else 1

    query = "SELECT * FROM bhavcopy_records WHERE is_sample = ?"
    params: List[Any] = [target_mode]

    if start_date:
        query += " AND trade_date >= ?"
        params.append(start_date)
    if end_date:
        query += " AND trade_date <= ?"
        params.append(end_date)
    if symbols:
        placeholders = ",".join("?" for _ in symbols)
        query += f" AND symbol IN ({placeholders})"
        params.extend(symbols)

    query += " ORDER BY trade_date ASC, symbol ASC, expiry_date ASC"
    cursor.execute(query, params)
    rows = [dict(r) for r in cursor.fetchall()]
    conn.close()
    return rows


def get_data_quality_stats() -> Dict[str, Any]:
    """
    Computes comprehensive Data Quality and Provenance metrics:
    - Distinguishes actual MCX Bhavcopy records from sample records.
    - Tracks latest trading date, staleness, and last successful import.
    """
    conn = get_db_connection()
    cursor = conn.cursor()

    # Check actual vs sample counts
    cursor.execute("SELECT COUNT(*) FROM bhavcopy_records WHERE is_sample = 0")
    actual_rows = cursor.fetchone()[0]

    cursor.execute("SELECT COUNT(*) FROM bhavcopy_records WHERE is_sample = 1")
    sample_rows = cursor.fetchone()[0]

    # Active dataset mode: prefers actual data if present
    active_is_sample = 0 if actual_rows > 0 else 1
    active_source = "OFFICIAL MCX BHAVCOPY (EOD)" if actual_rows > 0 else "SAMPLE DATASET (OFFLINE DEMO)"

    # Active dataset date info
    cursor.execute("""
        SELECT COUNT(DISTINCT trade_date), MIN(trade_date), MAX(trade_date), COUNT(*)
        FROM bhavcopy_records 
        WHERE is_sample = ?
    """, (active_is_sample,))
    date_info = cursor.fetchone()
    total_dates = date_info[0] or 0
    min_date = date_info[1]
    max_date = date_info[2]
    total_active_rows = date_info[3] or 0

    # Per-contract coverage in active dataset
    cursor.execute("""
        SELECT symbol, 
               COUNT(*) as total_rows, 
               COUNT(DISTINCT trade_date) as trade_days,
               MIN(trade_date) as first_date,
               MAX(trade_date) as last_date,
               AVG(volume) as avg_volume,
               AVG(open_interest) as avg_oi
        FROM bhavcopy_records 
        WHERE is_sample = ?
        GROUP BY symbol 
        ORDER BY symbol
    """, (active_is_sample,))
    coverage = [dict(r) for r in cursor.fetchall()]

    # Last successful import timestamp from ingestion_logs
    cursor.execute("""
        SELECT logged_at, source, requested_date, returned_date, rows_added 
        FROM ingestion_logs 
        WHERE status = 'SUCCESS' 
        ORDER BY logged_at DESC 
        LIMIT 1
    """)
    last_success_row = cursor.fetchone()
    last_successful_import = dict(last_success_row) if last_success_row else None

    # Latest ingestion log event (success or failure)
    cursor.execute("""
        SELECT status, reason, source, logged_at 
        FROM ingestion_logs 
        ORDER BY logged_at DESC 
        LIMIT 1
    """)
    last_log_row = cursor.fetchone()
    last_log = dict(last_log_row) if last_log_row else None

    # Ingestion logs summary counts
    cursor.execute("""
        SELECT status, COUNT(*) as count 
        FROM ingestion_logs 
        GROUP BY status
    """)
    status_counts = {r["status"]: r["count"] for r in cursor.fetchall()}

    # Recent anomaly events
    cursor.execute("""
        SELECT requested_date, returned_date, status, reason, source, filename, logged_at 
        FROM ingestion_logs 
        WHERE status != 'SUCCESS' 
        ORDER BY logged_at DESC 
        LIMIT 15
    """)
    recent_anomalies = [dict(r) for r in cursor.fetchall()]

    conn.close()

    # Staleness check: If latest trading date is older than 3 business days relative to today
    is_stale = False
    if max_date:
        try:
            latest_dt = datetime.strptime(max_date, "%Y-%m-%d")
            # Calculate calendar distance
            now = datetime.now()
            # Stale if more than 4 calendar days (covers a weekend + holiday)
            if (now - latest_dt).days > 4:
                is_stale = True
        except Exception:
            pass

    return {
        "active_source": active_source,
        "data_mode": "ACTUAL" if active_is_sample == 0 else "SAMPLE",
        "is_sample_dataset": active_is_sample == 1,
        "dataset_type_badge": "ACTUAL MCX DATA (EOD)" if active_is_sample == 0 else "SAMPLE DATA (DEMO)",
        "total_rows": total_active_rows,
        "total_active_records": total_active_rows,
        "total_actual_records": actual_rows,
        "total_sample_records": sample_rows,
        "total_trading_dates": total_dates,
        "date_range": {
            "start": min_date,
            "end": max_date
        },
        "latest_trading_date": max_date,
        "is_stale": is_stale,
        "last_successful_import": last_successful_import,
        "last_import_status": last_log["status"] if last_log else "NO_LOGS",
        "last_import_error": last_log["reason"] if last_log and last_log["status"] != "SUCCESS" else None,
        "contract_coverage": coverage,
        "ingestion_status_counts": status_counts,
        "recent_anomalies": recent_anomalies
    }
