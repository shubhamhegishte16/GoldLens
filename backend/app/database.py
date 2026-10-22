"""
GoldLens SQLite Storage & Persistence Layer.
Stores raw and validated MCX Bhavcopy records with primary key (date, symbol, expiry_date).
Also tracks data quality metrics, skipped dates, and ingestion audit history.
"""

import sqlite3
import os
from typing import List, Dict, Any, Optional, Tuple
from pathlib import Path

# Database path in /data directory
DB_DIR = Path(__file__).resolve().parent.parent.parent / "data"
DB_PATH = DB_DIR / "goldlens.db"


def get_db_connection() -> sqlite3.Connection:
    """Creates directory if needed and returns a sqlite3 connection with Row factory."""
    DB_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    """Initializes tables for Bhavcopy market data and data quality audit logs."""
    conn = get_db_connection()
    cursor = conn.cursor()

    # Core table: One row per (trade_date, symbol, expiry_date)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS bhavcopy_records (
            trade_date TEXT NOT NULL,         -- YYYY-MM-DD
            symbol TEXT NOT NULL,             -- GOLDM, GOLDTEN, GOLDGUINEA, GOLDPETAL
            expiry_date TEXT NOT NULL,        -- YYYY-MM-DD
            open_price REAL NOT NULL,
            high_price REAL NOT NULL,
            low_price REAL NOT NULL,
            close_price REAL NOT NULL,        -- Official settlement price
            volume INTEGER NOT NULL,          -- Traded lots (NOT market depth)
            open_interest INTEGER NOT NULL,   -- Outstanding lots
            is_sample INTEGER DEFAULT 0,      -- 1 if seeded sample, 0 if live MCX
            ingested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (trade_date, symbol, expiry_date)
        )
    """)

    # Index for fast date-range queries and symbol filtering
    cursor.execute("""
        CREATE INDEX IF NOT EXISTS idx_bhavcopy_date_sym 
        ON bhavcopy_records (trade_date, symbol)
    """)

    # Audit log table for data quality reports
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS ingestion_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            requested_date TEXT,
            returned_date TEXT,
            status TEXT NOT NULL,             -- SUCCESS, HOLIDAY_DISCARDED, MALFORMED, DUPLICATE
            reason TEXT,
            rows_added INTEGER DEFAULT 0,
            source TEXT DEFAULT 'LIVE_FETCH', -- LIVE_FETCH, CSV_UPLOAD, SAMPLE_SEED
            logged_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    conn.commit()
    conn.close()


def insert_bhavcopy_records(records: List[Dict[str, Any]], source: str = "LIVE_FETCH") -> int:
    """
    Inserts or replaces validated records into SQLite.
    Returns count of records inserted.
    """
    if not records:
        return 0

    conn = get_db_connection()
    cursor = conn.cursor()

    inserted_count = 0
    for r in records:
        cursor.execute("""
            INSERT OR REPLACE INTO bhavcopy_records (
                trade_date, symbol, expiry_date,
                open_price, high_price, low_price, close_price,
                volume, open_interest, is_sample
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
            1 if source == "SAMPLE_SEED" else 0
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
    source: str = "LIVE_FETCH"
):
    """Logs an ingestion event or data validation anomaly."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO ingestion_logs (
            requested_date, returned_date, status, reason, rows_added, source
        ) VALUES (?, ?, ?, ?, ?, ?)
    """, (requested_date, returned_date, status, reason, rows_added, source))
    conn.commit()
    conn.close()


def query_bhavcopy_records(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    symbols: Optional[List[str]] = None
) -> List[Dict[str, Any]]:
    """Fetches bhavcopy records matching optional filters ordered by date, symbol, expiry."""
    conn = get_db_connection()
    cursor = conn.cursor()

    query = "SELECT * FROM bhavcopy_records WHERE 1=1"
    params: List[Any] = []

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
    """Computes comprehensive Data Quality metrics across all ingested data."""
    conn = get_db_connection()
    cursor = conn.cursor()

    # Total rows loaded
    cursor.execute("SELECT COUNT(*) FROM bhavcopy_records")
    total_rows = cursor.fetchone()[0]

    # Distinct dates loaded
    cursor.execute("SELECT COUNT(DISTINCT trade_date), MIN(trade_date), MAX(trade_date) FROM bhavcopy_records")
    date_info = cursor.fetchone()
    total_dates = date_info[0]
    min_date = date_info[1]
    max_date = date_info[2]

    # Per-contract coverage
    cursor.execute("""
        SELECT symbol, 
               COUNT(*) as total_rows, 
               COUNT(DISTINCT trade_date) as trade_days,
               MIN(trade_date) as first_date,
               MAX(trade_date) as last_date,
               AVG(volume) as avg_volume,
               AVG(open_interest) as avg_oi
        FROM bhavcopy_records 
        GROUP BY symbol 
        ORDER BY symbol
    """)
    coverage = [dict(r) for r in cursor.fetchall()]

    # Ingestion logs summary (holidays skipped, malformed dates, duplicates)
    cursor.execute("""
        SELECT status, COUNT(*) as count 
        FROM ingestion_logs 
        GROUP BY status
    """)
    status_counts = {r["status"]: r["count"] for r in cursor.fetchall()}

    # Recent anomaly events
    cursor.execute("""
        SELECT requested_date, returned_date, status, reason, source, logged_at 
        FROM ingestion_logs 
        WHERE status != 'SUCCESS' 
        ORDER BY logged_at DESC 
        LIMIT 20
    """)
    recent_anomalies = [dict(r) for r in cursor.fetchall()]

    # Sample vs live data flag
    cursor.execute("SELECT COUNT(*) FROM bhavcopy_records WHERE is_sample = 1")
    sample_rows = cursor.fetchone()[0]

    conn.close()

    return {
        "total_rows": total_rows,
        "total_trading_dates": total_dates,
        "date_range": {
            "start": min_date,
            "end": max_date
        },
        "is_sample_dataset": sample_rows > 0,
        "contract_coverage": coverage,
        "ingestion_status_counts": status_counts,
        "recent_anomalies": recent_anomalies
    }
