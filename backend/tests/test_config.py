import sys
from pathlib import Path
import pytest

# Ensure backend directory is in sys.path
backend_dir = Path(__file__).resolve().parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from app.config import CONTRACT_SPECS, TARGET_PURITY, DEFAULT_COSTS, DEFAULT_THRESHOLDS

def test_contract_specs_integrity():
    """Verify all 4 contracts exist and have legitimate mechanical specifications."""
    symbols = {"GOLDM", "GOLDTEN", "GOLDGUINEA", "GOLDPETAL"}
    assert set(CONTRACT_SPECS.keys()) == symbols
    
    # Check GOLDM (995 purity, 10g quote unit)
    goldm = CONTRACT_SPECS["GOLDM"]
    assert goldm.purity == 995.0
    assert goldm.quote_unit_grams == 10.0
    assert goldm.trading_unit_grams == 100.0
    assert "3rd-5th" in goldm.expiry_window

    # Check GOLDTEN (999 purity, 10g quote unit, 2025 listing)
    goldten = CONTRACT_SPECS["GOLDTEN"]
    assert goldten.purity == 999.0
    assert goldten.quote_unit_grams == 10.0
    assert goldten.trading_unit_grams == 10.0
    assert goldten.listing_year == 2025

    # Check GOLDGUINEA (999 purity, 8g quote unit)
    goldguinea = CONTRACT_SPECS["GOLDGUINEA"]
    assert goldguinea.purity == 999.0
    assert goldguinea.quote_unit_grams == 8.0
    assert goldguinea.trading_unit_grams == 8.0

    # Check GOLDPETAL (999 purity, 1g quote unit)
    goldpetal = CONTRACT_SPECS["GOLDPETAL"]
    assert goldpetal.purity == 999.0
    assert goldpetal.quote_unit_grams == 1.0
    assert goldpetal.trading_unit_grams == 1.0

def test_normalization_target():
    assert TARGET_PURITY == 999.0

def test_costs_and_thresholds_defaults():
    assert DEFAULT_COSTS.brokerage_per_order_inr == 20.0
    assert DEFAULT_COSTS.exchange_txn_fee_bps == 2.1
    assert DEFAULT_THRESHOLDS.zscore_entry_threshold == 2.0
    assert DEFAULT_THRESHOLDS.rolling_zscore_window == 20
