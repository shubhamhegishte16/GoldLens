import sys
from pathlib import Path
backend_dir = Path(__file__).resolve().parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from app.broker_client import (
    get_broker_connection_status,
    generate_broker_session_records,
    sync_broker_feed
)
from app.config import CONTRACT_SPECS


def test_broker_connection_status():
    status = get_broker_connection_status()
    assert "provider" in status
    assert "latency_ms" in status
    assert "waf_bypass_status" in status
    assert "BYPASSED" in status["waf_bypass_status"]
    assert len(status["supported_symbols"]) == 4


def test_generate_broker_session_records():
    target_date = "2026-10-23"
    records = generate_broker_session_records(target_date)
    assert len(records) == 24
    symbols = {r["symbol"] for r in records}
    assert symbols == set(CONTRACT_SPECS.keys())
    for r in records:
        assert r["trade_date"] == target_date
        assert r["close_price"] > 0
        assert r["volume"] >= 0
        assert r["open_interest"] >= 0


def test_sync_broker_feed():
    target_date = "2026-10-23"
    success, msg, count, records = sync_broker_feed(target_date_iso=target_date, is_sample=0)
    assert success is True
    assert count == 24
    assert "WAF Bypassed" in msg
    assert len(records) == 24
