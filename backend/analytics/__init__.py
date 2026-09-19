"""
Analytics package for quantitative statistics and risk metrics.
"""

from backend.analytics.engine import (
    compute_asset_analytics,
    calculate_sma,
    calculate_ema,
    calculate_daily_returns,
    calculate_cumulative_returns,
    calculate_historical_volatility,
    calculate_annualized_volatility,
    calculate_sharpe_ratio,
    calculate_drawdown_profile,
    sanitize_float
)
from backend.analytics.correlation import (
    compute_correlation_matrix,
    compute_pair_correlation
)

__all__ = [
    "compute_asset_analytics",
    "calculate_sma",
    "calculate_ema",
    "calculate_daily_returns",
    "calculate_cumulative_returns",
    "calculate_historical_volatility",
    "calculate_annualized_volatility",
    "calculate_sharpe_ratio",
    "calculate_drawdown_profile",
    "sanitize_float",
    "compute_correlation_matrix",
    "compute_pair_correlation"
]

