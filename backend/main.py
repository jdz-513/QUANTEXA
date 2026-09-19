from typing import Optional, Dict, Any
from datetime import datetime, timezone
import sys
import os

# Ensure backend directory is in path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from pydantic import BaseModel
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from backend.utils.assets import get_all_assets
from backend.services.market_data import get_historical_market_data, MarketDataError
from backend.analytics.engine import compute_asset_analytics
from backend.analytics.correlation import compute_correlation_matrix, compute_pair_correlation
from backend.backtesting.models import BacktestRequest, BacktestResponse
from backend.backtesting.engine import run_backtest_simulation
from backend.backtesting.robustness import RobustnessRequest, run_robustness_analysis
from backend.analytics.regimes import compute_market_regimes
from backend.ai.featherless import (
    call_featherless_api,
    is_ai_configured,
    get_featherless_model,
    AIServiceNotConfiguredError,
    AITimeoutError,
    AIServiceError,
)

app = FastAPI(
    title="QUANTEXA API",
    description="Quantitative Multi-Asset Financial Intelligence & Backtesting Platform",
    version="1.0.0"
)

# Configure CORS
origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "*"  # Allow all for development flexibility
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def root():
    """
    Root health check required by specification.
    """
    return {
        "status": "ok",
        "service": "QUANTEXA API"
    }

@app.get("/api/health")
def api_health():
    """
    Extended API health check with system status and timestamp.
    """
    return {
        "status": "ok",
        "service": "QUANTEXA API",
        "version": "1.0.0",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "engine_status": "operational",
        "phase": "phase_3_active",
        "disclaimer": "Quantitative research & historical backtesting platform. Not financial advice."
    }

@app.get("/api/assets")
def get_assets():
    """
    List of supported assets for quantitative analysis and backtesting.
    """
    return get_all_assets()

@app.get("/api/market-data")
def get_market_data(
    asset: str = Query(..., description="Asset identifier: gold, bitcoin, or nvidia"),
    start_date: str = Query(..., description="Start date in YYYY-MM-DD format"),
    end_date: str = Query(..., description="End date in YYYY-MM-DD format")
):
    """
    Fetch, normalize, and return historical OHLCV market data for the selected asset and date range.
    """
    try:
        data = get_historical_market_data(
            asset_id=asset,
            start_date=start_date,
            end_date=end_date
        )
        return data
    except MarketDataError as mde:
        raise HTTPException(status_code=mde.status_code, detail=mde.message)
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Unexpected server error while retrieving market data: {str(exc)}"
        )

@app.get("/api/analytics")
def get_analytics(
    asset: str = Query(..., description="Asset identifier: gold, bitcoin, or nvidia"),
    start_date: str = Query(..., description="Start date in YYYY-MM-DD format"),
    end_date: str = Query(..., description="End date in YYYY-MM-DD format"),
    sma_period: int = Query(20, ge=2, le=500, description="Fast SMA period (default 20)"),
    sma_period_slow: int = Query(50, ge=2, le=500, description="Slow SMA period (default 50)"),
    ema_period: int = Query(20, ge=2, le=500, description="EMA period (default 20)"),
    risk_free_rate: float = Query(0.0, ge=-10.0, le=50.0, description="Annualized risk-free rate percentage (default 0.0%)")
):
    """
    Compute quantitative statistics, risk metrics (volatility, Sharpe, max drawdown),
    and technical indicators (SMA, EMA, returns) for the selected asset and date range.
    """
    try:
        analytics = compute_asset_analytics(
            asset_id=asset,
            start_date=start_date,
            end_date=end_date,
            sma_period=sma_period,
            sma_period_slow=sma_period_slow,
            ema_period=ema_period,
            risk_free_rate=risk_free_rate
        )
        return analytics
    except MarketDataError as mde:
        raise HTTPException(status_code=mde.status_code, detail=mde.message)
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Unexpected server error while computing analytics: {str(exc)}"
        )

@app.get("/api/correlation-matrix")
def get_correlation_matrix(
    start_date: str = Query(..., description="Start date in YYYY-MM-DD format"),
    end_date: str = Query(..., description="End date in YYYY-MM-DD format")
):
    """
    Compute symmetric 3x3 Pearson correlation matrix for Gold, Bitcoin, and NVIDIA
    based on calendar-date aligned daily percentage returns.
    """
    try:
        return compute_correlation_matrix(start_date=start_date, end_date=end_date)
    except MarketDataError as mde:
        raise HTTPException(status_code=mde.status_code, detail=mde.message)
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Unexpected server error while computing correlation matrix: {str(exc)}"
        )

@app.get("/api/correlation")
def get_correlation(
    asset_a: str = Query(..., description="First asset identifier: gold, bitcoin, or nvidia"),
    asset_b: str = Query(..., description="Second asset identifier: gold, bitcoin, or nvidia"),
    start_date: str = Query(..., description="Start date in YYYY-MM-DD format"),
    end_date: str = Query(..., description="End date in YYYY-MM-DD format"),
    rolling_window: int = Query(30, description="Rolling window size in days: 7, 30, 60, or 90")
):
    """
    Compute pairwise Pearson correlation and dynamic rolling correlation time series
    for asset_a and asset_b using calendar-date aligned daily percentage returns.
    """
    try:
        return compute_pair_correlation(
            asset_a=asset_a,
            asset_b=asset_b,
            start_date=start_date,
            end_date=end_date,
            rolling_window=rolling_window
        )
    except MarketDataError as mde:
        raise HTTPException(status_code=mde.status_code, detail=mde.message)
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Unexpected server error while computing pair correlation: {str(exc)}"
        )

@app.post("/api/backtest", response_model=BacktestResponse)
def post_backtest(request: BacktestRequest):
    """
    Execute quantitative backtest simulation with next-session execution (Open[t+1]),
    realistic transaction costs, cash accounting, and comprehensive risk/return analytics.
    """
    try:
        return run_backtest_simulation(request)
    except MarketDataError as mde:
        raise HTTPException(status_code=mde.status_code, detail=mde.message)
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Unexpected server error while executing backtest simulation: {str(exc)}"
        )

@app.post("/api/backtest/robustness")
def post_backtest_robustness(request: RobustnessRequest):
    """
    Execute multi-dimensional parameter robustness analysis across a configurable parameter grid.
    Returns sensitivity metrics, return/Sharpe dispersion, and parameter stability indicators.
    """
    try:
        return run_robustness_analysis(request)
    except MarketDataError as mde:
        raise HTTPException(status_code=mde.status_code, detail=mde.message)
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Unexpected server error while executing robustness analysis: {str(exc)}"
        )

@app.get("/api/market-regimes")
def get_market_regimes(
    asset: str = Query(..., description="Asset identifier: gold, bitcoin, or nvidia"),
    start_date: str = Query(..., description="Start date in YYYY-MM-DD format"),
    end_date: str = Query(..., description="End date in YYYY-MM-DD format"),
    return_window: int = Query(20, ge=5, le=250, description="Rolling return window in trading days"),
    volatility_window: int = Query(20, ge=5, le=250, description="Rolling volatility window in trading days"),
    positive_return_threshold: float = Query(2.0, gt=0.0, description="Bull return threshold percentage"),
    negative_return_threshold: float = Query(-2.0, lt=0.0, description="Bear return threshold percentage"),
    volatility_threshold: float = Query(25.0, gt=0.0, description="High/low annualized volatility threshold percentage"),
    strategy: Optional[str] = Query(None, description="Optional strategy to segment performance by regime")
):
    """
    Quantitatively classify historical market conditions into Bull, Bear, Neutral,
    and High/Low Volatility regimes with transparent threshold-based classification.
    """
    try:
        return compute_market_regimes(
            asset_id=asset,
            start_date=start_date,
            end_date=end_date,
            return_window=return_window,
            volatility_window=volatility_window,
            positive_return_threshold=positive_return_threshold,
            negative_return_threshold=negative_return_threshold,
            volatility_threshold=volatility_threshold,
            strategy=strategy
        )
    except MarketDataError as mde:
        raise HTTPException(status_code=mde.status_code, detail=mde.message)
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Unexpected server error while classifying market regimes: {str(exc)}"
        )

class AIResearchRequest(BaseModel):
    question: str
    context: Optional[Dict[str, Any]] = None

class AIResearchResponse(BaseModel):
    answer: str
    model: str
    disclaimer: str

@app.get("/api/ai/status")
def get_ai_status():
    """
    Check whether the Featherless AI Research Assistant service is configured and ready.
    """
    return {
        "configured": is_ai_configured(),
        "model": get_featherless_model()
    }

@app.post("/api/ai/research", response_model=AIResearchResponse)
async def post_ai_research(request: AIResearchRequest):
    """
    Execute quantitative research explanation using Featherless AI.
    Adheres strictly to the quantitative research mandate: historical explanation only,
    no predictive signals, and no investment recommendations.
    """
    try:
        result = await call_featherless_api(
            question=request.question,
            context=request.context
        )
        return result
    except AIServiceNotConfiguredError:
        raise HTTPException(status_code=503, detail="AI research is not configured.")
    except AITimeoutError:
        raise HTTPException(status_code=504, detail="AI request timed out. Please try again.")
    except AIServiceError as exc:
        raise HTTPException(status_code=502, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Unexpected error in AI research service: {str(exc)}"
        )

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)



