import sys
from pathlib import Path
import pytest
from fastapi.testclient import TestClient

backend_dir = Path(__file__).resolve().parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from app.main import app

client = TestClient(app)

def test_health_endpoint():
    res = client.get("/api/health")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "healthy"
    assert "GOLDM" in data["supported_contracts"]

def test_data_status_endpoint():
    res = client.get("/api/data/status")
    assert res.status_code == 200
    data = res.json()
    assert "total_records" in data
    assert "dataset_type_badge" in data
    assert data["total_records"] > 0

def test_data_quality_endpoint():
    res = client.get("/api/data/quality")
    assert res.status_code == 200
    data = res.json()
    assert "contract_coverage" in data
    assert "ingestion_status_counts" in data
    assert len(data["contract_coverage"]) == 4

def test_records_endpoint():
    res = client.get("/api/data/records?symbols=GOLDTEN&start_date=2025-04-01&end_date=2025-04-10")
    assert res.status_code == 200
    data = res.json()
    assert "records" in data
    for r in data["records"]:
        assert r["symbol"] == "GOLDTEN"
