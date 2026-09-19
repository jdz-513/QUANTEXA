# QUANTEXA — Quantitative Multi-Asset Financial Intelligence & Backtesting Platform

A quantitative research and historical backtesting platform for Gold, Bitcoin, and NVIDIA with institutional analytics, parameter sensitivity testing, rule-based market regimes, and an AI-powered Quant Research Assistant.

> **Important Regulatory & Product Rule**:
> QUANTEXA is strictly a quantitative research and historical backtesting tool. It does **not** provide direct financial advice, investment recommendations, price predictions, or guaranteed return projections. All performance metrics are based on historical data.

---

## Tech Stack

- **Frontend**: React 18/19, Vite, JavaScript, Axios, Recharts, Lucide-React, Custom CSS (FinTech Dark Theme)
- **Backend**: Python 3.13, FastAPI, Uvicorn, Pandas, NumPy, yfinance, httpx
- **AI Inference**: Featherless AI (OpenAI-compatible LLM inference for quantitative explanation)
- **Architecture**: Decoupled Client-Server with CORS and REST API

---

## Project Structure

```
QUANTEXA/
├── backend/
│   ├── main.py               # FastAPI application & REST endpoints
│   ├── requirements.txt       # Dependencies (fastapi, uvicorn, pandas, numpy, yfinance, httpx)
│   ├── .env.example          # Environment variable template
│   ├── venv/                 # Python virtual environment
│   ├── ai/                   # AI Research Assistant (Featherless AI integration)
│   │   ├── __init__.py
│   │   └── featherless.py    # Service wrapper, context compaction & safety guardrails
│   ├── services/             # Data fetching and service layers
│   ├── analytics/            # Quantitative statistics, risk metrics & market regimes
│   │   ├── engine.py         # Indicators and summary stats
│   │   ├── correlation.py    # Cross-asset matrix & rolling correlation
│   │   └── regimes.py        # Bull/Bear & High/Low volatility classification
│   ├── backtesting/          # Simulation engine, strategies & parameter robustness
│   │   ├── models.py         # Pydantic data contracts
│   │   ├── strategies.py     # SMA, EMA, Momentum, Mean Reversion
│   │   ├── portfolio.py      # Next-session Open[t+1] portfolio simulator
│   │   ├── engine.py         # Master backtesting runner & benchmark
│   │   └── robustness.py     # Parameter sensitivity grid sweep & stability metrics
│   └── utils/                # Normalization and helper utilities
│
└── frontend/
    ├── src/
    │   ├── components/       # Header, AssetBar, MetricsGrid, NavTabs, Charts, Labs
    │   │   ├── PriceChart.jsx
    │   │   ├── PerformanceView.jsx
    │   │   ├── CorrelationView.jsx
    │   │   ├── BacktestLab.jsx
    │   │   ├── RobustnessRegimesView.jsx
    │   │   └── AIResearchView.jsx
    │   ├── services/         # Axios API client (api.js)
    │   ├── styles/           # Custom FinTech dark theme CSS (index.css)
    │   ├── App.jsx           # Main dashboard container & view routing
    │   └── main.jsx          # React DOM entry point
    ├── index.html            # App entry point with Inter & JetBrains Mono
    ├── vite.config.js        # Vite config
    └── package.json          # Dependencies (axios, recharts, lucide-react)
```

---

## AI Quant Research Assistant (Featherless AI)

### Architecture
The AI Research Assistant is designed strictly as an **explanation and quantitative research assistant**. The AI does **not** independently calculate financial figures, generate trading signals, or forecast market prices. The backend quantitative engines remain the authoritative source of truth:

```
Market Data (OHLCV)
       ↓
Analytics Engine (Returns, Volatility, Sharpe, Drawdown)
       ↓
Backtesting Engine (Open[t+1] Execution, Cash Accounting, Benchmarks)
       ↓
Robustness Testing & Market Regime Analysis
       ↓
Compact Research Context (Summarized Authoritative Metrics)
       ↓
Featherless AI (Inference via System Directives & Safety Guardrails)
       ↓
Quantitative Explanation Only (No Signals, No Predictions)
```

### Environment Configuration
The assistant connects to Featherless AI via server-side environment variables:

```bash
# In backend/.env or system environment:
FEATHERLESS_API_KEY="your_featherless_api_key_here"
FEATHERLESS_MODEL="meta-llama/Meta-Llama-3.1-8B-Instruct"
FEATHERLESS_BASE_URL="https://api.featherless.ai/v1"
```

*Note*: If `FEATHERLESS_API_KEY` is omitted, the application starts normally. The AI Research Assistant gracefully reports that the service is not configured, while all charts, analytics, backtests, and regime analyses remain 100% operational.

### API Endpoints
- **`GET /api/ai/status`**: Returns whether the AI service is configured (`{"configured": bool, "model": str}`).
- **`POST /api/ai/research`**: Accepts `{ "question": str, "context": dict }` and returns `{ "answer": str, "model": str, "disclaimer": str }`.

### Security Implementation
- **Zero Client Exposure**: The API key is stored strictly on the server and is never passed to Vite, React, network headers in the browser, or API responses.
- **Context Compaction**: Raw tick/bar series are automatically stripped from outgoing context; only compact summary metrics are supplied to protect token limits.
- **Prompt Injection Defense**: User queries are treated as untrusted input enclosed in structured delimiters. Queries attempting to reveal system instructions, extract keys, or override safety constraints are neutralized.
- **Compliance Guardrails**: Intercepts requests for direct buy/sell advice, market timing signals, or price predictions, returning compliant educational quantitative guidance.

### AI Limitations
1. **Historical Only**: AI explanations interpret past quantitative output and do not guarantee or predict future performance.
2. **Authoritative Backend**: In any discrepancy, the numbers computed by the backend analytics and backtesting engines take absolute precedence.
3. **Non-Prescriptive**: Under no circumstances should AI explanations be construed as personalized investment advice.

---

## Quickstart & Running Locally

### 1. Backend (FastAPI)
```bash
cd backend
python -m venv venv
.\venv\Scripts\activate
pip install -r requirements.txt
python -m uvicorn main:app --host 127.0.0.1 --port 8000 --reload
```
API runs at `http://127.0.0.1:8000`
- `GET /` — Root health check (`{"status": "ok", "service": "QUANTEXA API"}`)
- `GET /api/health` — Detailed health check
- `GET /api/assets` — Supported assets catalogue (Gold, Bitcoin, NVIDIA)
- `GET /api/market-data` — Cleaned OHLCV historical prices
- `GET /api/analytics` — Quantitative indicators (SMA, EMA, Returns, Volatility, Sharpe, Drawdown)
- `GET /api/correlation-matrix` — 3x3 Pearson cross-asset correlation matrix
- `GET /api/correlation` — Pairwise Pearson & dynamic rolling correlation time series
- `POST /api/backtest` — Next-session backtest simulation with Buy & Hold benchmark
- `POST /api/backtest/robustness` — Multi-dimensional parameter sensitivity grid sweep
- `GET /api/market-regimes` — Rule-based Bull/Bear & Volatility regime classification
- `GET /api/ai/status` — AI Research Assistant readiness status
- `POST /api/ai/research` — AI-powered quantitative explanation

### 2. Frontend (React + Vite)
```bash
cd frontend
npm install
npm run dev
```
Dashboard runs at `http://localhost:5173/`

---

## Production Build & Verification
```bash
# Frontend build
cd frontend
npm run build

# Frontend linting
npx oxlint --ignore-pattern "node_modules/**"

# Run automated backend test suites
cd ..
.\backend\venv\Scripts\python.exe .\scratch\test_phase9_audit.py
.\backend\venv\Scripts\python.exe .\scratch\test_phase9_mock.py
```

---

## Platform Status (Phases 1–9 Complete)
- [x] Phase 1: Project structure, FastAPI backend, React+Vite frontend, CORS, and Health endpoints.
- [x] Phase 2: Historical Market Data via yfinance (OHLCV for Gold, Bitcoin, NVIDIA).
- [x] Phase 3: Quantitative Analytics Engine (SMA, EMA, Volatility, Sharpe, Drawdown).
- [x] Phase 4: Correlation Engine (Cross-asset matrix & rolling correlation).
- [x] Phase 5: Quantitative Backtesting Engine (Next-session Open[t+1] fills, fees, trade log).
- [x] Phase 6: Buy & Hold Benchmark Integration & Fair Comparison.
- [x] Phase 7: Parameter Robustness Testing & Market Regime Analysis.
- [x] Phase 8: Unified Dashboard Navigation & Cross-View Integration.
- [x] Phase 9: Featherless AI Quant Research Assistant (Institutional explanations, prompt security, compliance guardrails).
