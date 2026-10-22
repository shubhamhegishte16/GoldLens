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


def test_relative_value_matrix_endpoint():
    res = client.get("/api/analytics/relative-value-matrix")
    assert res.status_code == 200
    data = res.json()
    assert "contracts" in data
    assert "matrix" in data
    assert len(data["contracts"]) == 4
    assert "GOLDTEN" in data["matrix"]


def test_term_structure_endpoint():
    res = client.get("/api/analytics/term-structure")
    assert res.status_code == 200
    data = res.json()
    assert "curve_points" in data
    assert "implied_carry_table" in data
    assert "carry_methodology" in data
    # Ensure all curve points have dte > 0
    for p in data["curve_points"]:
        assert p["dte"] > 0


def test_carry_decomposition_endpoint():
    res = client.get("/api/analytics/carry-decomposition?symbol=GOLDTEN")
    assert res.status_code == 200
    data = res.json()
    assert "decomposition" in data
    assert "is_estimate" in data
    assert data["is_estimate"] is True
    assert "disclaimer" in data


def test_csv_upload_endpoint():
    csv_sample = """BizDt,TckrSymb,INST_TYPE,EXPIRY_DT,OpnPric,HghPric,LwPric,ClsPric,TtlTradgVol,OpnIntrst,PrvsClsgPric
2024-11-05,GOLDTEN,FUTCOM,28NOV2024,79200,79500,79000,79350,220,1100,79100
"""
    res = client.post("/api/data/upload-csv", content=csv_sample, headers={"Content-Type": "text/plain"})
    assert res.status_code == 200
    data = res.json()
    assert data["success"] is True
    assert data["valid_rows_inserted"] == 1
