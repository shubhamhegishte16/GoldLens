# GoldLens: Architecture & Data Flow

Commodity Derivatives Intelligence for Multi-Size MCX Gold Futures (`GOLDM`, `GOLDTEN`, `GOLDGUINEA`, `GOLDPETAL`).

---

## 1. System Overview

```
 +---------------------------------------------------------------------------------------+
 |                                MCX Public Data Portal                                 |
 |                    Daily Bhavcopy (CSV/HTML) via official endpoint                    |
 +-------------------------------------------+-------------------------------------------+
                                             |
                                             v  [HTTP Fetch with rate-limiting & retries]
 +---------------------------------------------------------------------------------------+
 |                                  Ingestion & Validation                               |
 |   - Date validation: requested DD/MM/YYYY vs returned MM/DD/YYYY                      |
 |   - Holiday / malformed date detection (discard latest-date carryover)                |
 |   - Expiry parsing (e.g. 04SEP2026 -> 2026-09-04) & Symbol trim                      |
 |   - Filter target symbols (GOLDM, GOLDTEN, GOLDGUINEA, GOLDPETAL)                     |
 |   - CSV fallback upload / pre-seeded dataset loader                                   |
 +-------------------------------------------+-------------------------------------------+
                                             |
                                             v
 +---------------------------------------------------------------------------------------+
 |                              Storage Layer (SQLite / Parquet)                         |
 |   - Primary key: (Date, Symbol, ExpiryDate)                                           |
 |   - Raw fields: Open, High, Low, Close (Settlement), Volume, OpenInterest             |
 |   - Cleaned & audited records with quality metadata                                   |
 +-------------------------------------------+-------------------------------------------+
                                             |
                                             v
 +---------------------------------------------------------------------------------------+
 |                                 Analytics Engine                                      |
 |   1. Normalization: norm = (Price / QuoteGrams) * (999 / Purity)                      |
 |   2. Cross-Contract RV: Same-cycle paired spreads, rolling historical Z-Scores        |
 |   3. Term Structure & Carry: Futures curves, roll-down vs real-shift decomposition    |
 |   4. Contract Lifecycle: Liquidity ramp, avoid zones (tender/delivery risk)           |
 +-------------------------------------------+-------------------------------------------+
                                             |
                      +----------------------+----------------------+
                      |                                             |
                      v                                             v
 +------------------------------------------+  +-----------------------------------------+
 |         Walk-Forward Backtesting         |  |         Alert & Intelligence Engine     |
 | - Replay day-by-day (No look-ahead)      |  | - Fire only when |Z| > threshold &      |
 | - Signal on Close(t) -> Fill Open(t+1)   |  |   liquidity passes & not in avoid zone  |
 | - Realistic friction: Brokerage, STT,    |  |   & edge > round-trip friction          |
 |   Exchange txn charges, GST, Slippage    |  | - First-class "All Quiet" state         |
 | - Spread vs Gold price attribution       |  | - Full audit trail & outcome tracking   |
 | - "No persistent edge" honest verdict    |  |                                         |
 +--------------------+---------------------+  +--------------------+--------------------+
                      |                                             |
                      +----------------------+----------------------+
                                             |
                                             v  [FastAPI JSON REST Endpoints]
 +---------------------------------------------------------------------------------------+
 |                            Frontend (React + Vite + TypeScript)                       |
 |   - Theme: Bespoke Warm Cream (#FAF6EC), Gold (#B8892B), Deep Navy, Sage              |
 |   - Navigation: Overview, Relative Value, Term Structure, Backtest Lab, Alerts,      |
 |                 Contract Calendar, Methodology & Data Quality                         |
 |   - Interactive: Parameter sliders, Walk-forward run, Guided tour, CSV/PNG exports   |
 +---------------------------------------------------------------------------------------+
```

---

## 2. Monorepo Structure

```
├── backend/
│   ├── app/
│   │   ├── __init__.py
│   │   ├── config.py           # Typed contracts, fees, model thresholds
│   │   ├── database.py         # SQLite schema & session management
│   │   ├── fetcher.py          # MCX Bhavcopy scraper & validator
│   │   ├── normalizer.py       # Purity & unit normalization
│   │   ├── analytics.py        # Spreads, Z-scores, carry, curve decomposition
│   │   ├── backtest.py         # Walk-forward backtester & cost engine
│   │   ├── alerts.py           # Trade candidate alert rules & logging
│   │   └── main.py             # FastAPI entrypoint and routes
│   ├── tests/
│   │   ├── test_config.py
│   │   ├── test_validation.py
│   │   ├── test_normalization.py
│   │   └── test_backtest.py
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── components/         # Navigation, layout, UI widgets, chart cards
│   │   ├── pages/              # Overview, RelativeValue, Curves, Backtest, etc.
│   │   ├── services/           # API clients
│   │   ├── types/              # TypeScript models
│   │   └── index.css           # Cream design tokens and typography
│   └── package.json
├── data/
│   ├── raw_bhavcopy/           # Cached CSV downloads
│   ├── sample_seed/            # Pre-seeded verified historical dataset
│   └── goldlens.db             # Local SQLite database
├── docs/
│   ├── ARCHITECTURE.md
│   ├── METHODOLOGY.md
│   └── JUDGES_GUIDE.md
├── run.bat                     # One-click Windows launch
└── README.md
```

---

## 3. Core Contract Mechanics & Normalization

Target unit: **INR per gram of 999 fine gold**.

$$\text{Normalized Price} = \left(\frac{\text{Price}}{\text{Quote Unit Grams}}\right) \times \left(\frac{999}{\text{Purity}}\right)$$

| Symbol | Trading Lot | Quote Unit | Purity | Expiry Cycle | Description |
|---|---|---|---|---|---|
| **GOLDM** | 100 g | 10 g | 995 | 3rd–5th of month | Mini contract, standard retail benchmark |
| **GOLDTEN** | 10 g | 10 g | 999 | 27th–31st of month | 10-gram pure bar (launched 2025) |
| **GOLDGUINEA**| 8 g | 8 g | 999 | 27th–31st of month | Traditional 1-sovereign / 8g coin |
| **GOLDPETAL** | 1 g | 1 g | 999 | 27th–31st of month | Micro 1g contract for SIP / retail |

---

## 4. Rigorous Design Safeguards

1. **Anti Look-Ahead**: At any historical date $t$, rolling metrics use strict $[t-W, t]$ lookback. Backtest signals at Close($t$) execute at Open($t+1$).
2. **Contract Roll Jump Separation**: Series are tracked by `(symbol, expiry)`. No artificial continuous contracts are created.
3. **Execution Friction**: Slippage scales up when contracts display lower volume or open interest. Total costs include exchange turnover fee (2.1 bps), brokerage (₹20/order), GST (18%), and stamp duty.
4. **Honest Attribution**: Total return is decomposed into Strategy Spread Edge vs Pure Gold Beta Exposure.
