"""
Data models and schemas for the QUANTEXA Backtesting Engine.
Defines request payloads, trade logs, equity points, and performance summaries.
"""

from enum import Enum
from typing import Dict, Any, List, Optional
from pydantic import BaseModel, Field


class StrategyType(str, Enum):
    SMA_CROSSOVER = "sma_crossover"
    EMA_TREND = "ema_trend"
    MOMENTUM = "momentum"
    MEAN_REVERSION = "mean_reversion"


class BacktestRequest(BaseModel):
    asset: str = Field(..., description="Asset identifier: gold, bitcoin, or nvidia")
    strategy: str = Field(..., description="Strategy: sma_crossover, ema_trend, momentum, mean_reversion")
    start_date: str = Field(..., description="Start date in YYYY-MM-DD format")
    end_date: str = Field(..., description="End date in YYYY-MM-DD format")
    initial_capital: float = Field(100000.0, gt=0, description="Starting capital in USD (must be > 0)")
    transaction_cost_pct: float = Field(0.10, ge=0.0, le=10.0, description="Transaction fee percentage per order (e.g. 0.10 for 0.10%)")
    position_size_pct: float = Field(100.0, gt=0.0, le=100.0, description="Position allocation percentage of available cash (1 to 100)")
    parameters: Optional[Dict[str, Any]] = Field(default_factory=dict, description="Strategy-specific parameters")


class TradeRecord(BaseModel):
    trade_id: int
    entry_date: str
    entry_price: float
    exit_date: str
    exit_price: float
    quantity: float
    gross_pnl: float
    transaction_cost: float
    net_pnl: float
    return_pct: float
    entry_reason: str
    exit_reason: str
    holding_period_days: int


class EquityPoint(BaseModel):
    date: str
    cash: float
    position_quantity: float
    position_value: float
    portfolio_value: float
    daily_return: Optional[float] = None
    cumulative_return: float
    drawdown: float
    benchmark_return: Optional[float] = None
    benchmark_value: Optional[float] = None


class BacktestPerformance(BaseModel):
    initial_capital: float
    final_portfolio_value: float
    total_return_pct: float
    cagr_pct: float
    annualized_volatility_pct: float
    sharpe_ratio: float
    max_drawdown_pct: float
    total_trades: int
    winning_trades: int
    losing_trades: int
    win_rate_pct: float
    total_transaction_costs: float
    best_trade_pct: Optional[float] = None
    worst_trade_pct: Optional[float] = None
    avg_trade_return_pct: Optional[float] = None


class BenchmarkPerformance(BaseModel):
    initial_capital: float
    final_portfolio_value: float
    total_return_pct: float
    cagr_pct: float
    annualized_volatility_pct: float
    sharpe_ratio: float
    max_drawdown_pct: float


class BacktestResponse(BaseModel):
    backtest_config: Dict[str, Any]
    execution_convention: str
    performance: BacktestPerformance
    benchmark_performance: Optional[BenchmarkPerformance] = None
    trades: List[TradeRecord]
    equity_curve: List[EquityPoint]
