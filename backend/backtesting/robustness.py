"""
Parameter Robustness & Sensitivity Analysis Engine for QUANTEXA.
Evaluates strategy performance stability across multi-dimensional parameter grids.
Reuses existing backtesting engine and portfolio simulator without look-ahead bias.
"""

import math
from typing import Dict, Any, List, Optional, Tuple
import numpy as np
import pandas as pd
from pydantic import BaseModel, Field

from backend.services.market_data import get_historical_market_data, MarketDataError, validate_date_format
from backend.utils.assets import get_asset
from backend.analytics.engine import (
    calculate_annualized_volatility,
    calculate_sharpe_ratio,
    sanitize_float
)
from backend.backtesting.strategies import generate_strategy_signals
from backend.backtesting.portfolio import PortfolioSimulator

MAX_GRID_COMBINATIONS = 200


class RobustnessRequest(BaseModel):
    asset: str = Field(..., description="Asset identifier: gold, bitcoin, or nvidia")
    strategy: str = Field(..., description="Strategy: sma_crossover, ema_trend, momentum, mean_reversion")
    start_date: str = Field(..., description="Start date in YYYY-MM-DD format")
    end_date: str = Field(..., description="End date in YYYY-MM-DD format")
    initial_capital: float = Field(100000.0, gt=0, description="Starting capital in USD")
    transaction_cost_pct: float = Field(0.10, ge=0.0, le=10.0, description="Transaction fee percentage")
    position_size_pct: float = Field(100.0, gt=0.0, le=100.0, description="Position sizing percentage")
    parameter_grid: Optional[Dict[str, Any]] = Field(default_factory=dict, description="Custom parameter grid values")


def build_parameter_grid(strategy: str, user_grid: Dict[str, Any]) -> Tuple[List[Dict[str, Any]], int, int]:
    """
    Constructs the list of valid parameter combinations based on strategy type.
    Rejects invalid combinations (e.g. fast_period >= slow_period) without swapping.
    Returns: (valid_combinations, valid_count, invalid_count)
    """
    strat = strategy.strip().lower()
    valid_combos = []
    invalid_count = 0

    if strat in ["sma_crossover", "ema_trend"]:
        fast_periods = user_grid.get("fast_periods") or [5, 10, 15, 20, 25, 30]
        slow_periods = user_grid.get("slow_periods") or [30, 40, 50, 60, 70, 80, 90, 100]

        # Type conversion & validation
        try:
            fast_list = sorted(list(set(int(x) for x in fast_periods if int(x) >= 2)))
            slow_list = sorted(list(set(int(x) for x in slow_periods if int(x) >= 2)))
        except (ValueError, TypeError):
            raise MarketDataError("Grid periods must be valid integers >= 2.", status_code=400)

        if not fast_list or not slow_list:
            raise MarketDataError("Fast and slow periods lists cannot be empty.", status_code=400)

        for s in slow_list:
            for f in fast_list:
                if f < s:
                    valid_combos.append({"fast_period": f, "slow_period": s})
                else:
                    invalid_count += 1

    elif strat == "momentum":
        lookbacks = user_grid.get("lookbacks") or [5, 10, 15, 20, 30, 60]
        try:
            lookback_list = sorted(list(set(int(x) for x in lookbacks if int(x) >= 2)))
        except (ValueError, TypeError):
            raise MarketDataError("Momentum lookbacks must be valid integers >= 2.", status_code=400)

        if not lookback_list:
            raise MarketDataError("Lookbacks list cannot be empty.", status_code=400)

        for lb in lookback_list:
            valid_combos.append({"lookback_days": lb})

    elif strat == "mean_reversion":
        sma_periods = user_grid.get("sma_periods") or [10, 20, 30, 50]
        threshold_pcts = user_grid.get("threshold_pcts") or [0.5, 1.0, 2.0, 3.0, 5.0]

        try:
            sma_list = sorted(list(set(int(x) for x in sma_periods if int(x) >= 2)))
            thresh_list = sorted(list(set(float(x) for x in threshold_pcts if 0.0 <= float(x) <= 50.0)))
        except (ValueError, TypeError):
            raise MarketDataError("Mean reversion parameters must be numeric and in valid bounds.", status_code=400)

        if not sma_list or not thresh_list:
            raise MarketDataError("SMA periods and threshold percentages cannot be empty.", status_code=400)

        for p in sma_list:
            for t in thresh_list:
                valid_combos.append({"sma_period": p, "threshold_pct": round(t, 2)})

    else:
        raise MarketDataError(
            f"Unsupported strategy '{strategy}' for robustness analysis. Supported: 'sma_crossover', 'ema_trend', 'momentum', 'mean_reversion'.",
            status_code=400
        )

    return valid_combos, len(valid_combos), invalid_count


def run_robustness_analysis(request: RobustnessRequest) -> Dict[str, Any]:
    """
    Executes a complete parameter sweep across valid combinations using cached historical market data.
    """
    # 1. Validation
    asset_id = request.asset.strip().lower()
    asset_info = get_asset(asset_id)
    if not asset_info:
        raise MarketDataError(f"Unsupported asset '{request.asset}'.", status_code=400)

    start_dt = validate_date_format(request.start_date, "start_date")
    end_dt = validate_date_format(request.end_date, "end_date")
    if start_dt >= end_dt:
        raise MarketDataError("start_date must be strictly before end_date.", status_code=400)

    # 2. Build parameter grid
    valid_combos, valid_count, invalid_count = build_parameter_grid(
        strategy=request.strategy,
        user_grid=request.parameter_grid or {}
    )

    if valid_count == 0:
        raise MarketDataError("No valid parameter combinations could be evaluated.", status_code=400)

    if valid_count > MAX_GRID_COMBINATIONS:
        raise MarketDataError(
            f"Parameter grid generated {valid_count} combinations, exceeding maximum allowable limit of {MAX_GRID_COMBINATIONS}. Please narrow your parameter ranges.",
            status_code=400
        )

    # 3. Fetch market data ONCE to avoid redundant network/disk calls
    market_payload = get_historical_market_data(
        asset_id=asset_id,
        start_date=request.start_date,
        end_date=request.end_date,
        use_cache=True
    )
    records = market_payload.get("data", [])
    if len(records) < 15:
        raise MarketDataError("Insufficient historical bars to perform robustness analysis.", status_code=400)

    df = pd.DataFrame(records)
    for col in ["open", "high", "low", "close"]:
        df[col] = pd.to_numeric(df[col], errors="coerce")
    df = df.dropna(subset=["open", "close"]).reset_index(drop=True)
    df["dt_temp"] = pd.to_datetime(df["date"])
    df = df.sort_values("dt_temp").drop(columns=["dt_temp"]).reset_index(drop=True)

    n_days = len(df)
    years = n_days / 252.0 if n_days > 1 else 1.0

    # 4. Sweep execution loop
    results = []
    strat_key = request.strategy.strip().lower()

    for params in valid_combos:
        # Generate signals
        try:
            signals, resolved_params = generate_strategy_signals(
                strategy=strat_key,
                close_series=df["close"],
                parameters=params
            )
        except Exception:
            continue

        # Simulate execution
        simulator = PortfolioSimulator(
            initial_capital=request.initial_capital,
            transaction_cost_pct=request.transaction_cost_pct,
            position_size_pct=request.position_size_pct
        )
        trades, equity_curve = simulator.execute_simulation(
            df=df,
            signals=signals,
            strategy_name=resolved_params.get("strategy_name", request.strategy)
        )

        final_val = equity_curve[-1].portfolio_value if equity_curve else request.initial_capital
        init_val = request.initial_capital
        tot_ret = ((final_val - init_val) / init_val * 100.0) if init_val > 0 else 0.0

        if years > 0 and final_val > 0 and init_val > 0:
            cagr = (((final_val / init_val) ** (1.0 / years)) - 1.0) * 100.0
        else:
            cagr = tot_ret

        daily_returns_list = [pt.daily_return for pt in equity_curve[1:] if pt.daily_return is not None]
        eq_returns_series = pd.Series(daily_returns_list)
        ann_vol = calculate_annualized_volatility(eq_returns_series, trading_days=252)
        sharpe = calculate_sharpe_ratio(eq_returns_series, risk_free_rate_pct=0.0, trading_days=252)

        drawdowns = [pt.drawdown for pt in equity_curve]
        max_dd = float(min(drawdowns)) if drawdowns else 0.0

        total_trades = len(trades)
        winning_trades = sum(1 for t in trades if t.net_pnl > 0)
        win_rate = (winning_trades / total_trades * 100.0) if total_trades > 0 else 0.0

        results.append({
            "parameters": params,
            "total_return_pct": sanitize_float(tot_ret, 2),
            "cagr_pct": sanitize_float(cagr, 2),
            "sharpe_ratio": sanitize_float(sharpe, 2),
            "max_drawdown_pct": sanitize_float(max_dd, 2),
            "annualized_volatility_pct": sanitize_float(ann_vol, 2),
            "total_trades": total_trades,
            "win_rate_pct": sanitize_float(win_rate, 1)
        })

    # 5. Robustness Summary Statistics (Sensitivity & Dispersion)
    if not results:
        raise MarketDataError("No results generated from parameter grid.", status_code=400)

    returns = [r["total_return_pct"] for r in results if r["total_return_pct"] is not None]
    sharpes = [r["sharpe_ratio"] for r in results if r["sharpe_ratio"] is not None]
    drawdowns = [r["max_drawdown_pct"] for r in results if r["max_drawdown_pct"] is not None]

    med_return = float(np.median(returns)) if returns else 0.0
    med_sharpe = float(np.median(sharpes)) if sharpes else 0.0
    med_dd = float(np.median(drawdowns)) if drawdowns else 0.0

    pct_positive_return = (sum(1 for x in returns if x > 0) / len(returns) * 100.0) if returns else 0.0
    pct_positive_sharpe = (sum(1 for x in sharpes if x > 0) / len(sharpes) * 100.0) if sharpes else 0.0
    dispersion_std = float(np.std(returns)) if len(returns) > 1 else 0.0

    # Parameter stability metric (percentage of combinations with Sharpe >= 0.5)
    stable_count = sum(1 for s in sharpes if s >= 0.5)
    stability_pct = (stable_count / len(sharpes) * 100.0) if sharpes else 0.0

    # Highest observed (neutral phrasing)
    highest_ret_item = max(results, key=lambda x: x["total_return_pct"] if x["total_return_pct"] is not None else -9999)
    highest_sharpe_item = max(results, key=lambda x: x["sharpe_ratio"] if x["sharpe_ratio"] is not None else -9999)

    summary = {
        "valid_combinations": valid_count,
        "invalid_combinations": invalid_count,
        "median_return_pct": sanitize_float(med_return, 2),
        "median_sharpe": sanitize_float(med_sharpe, 2),
        "median_drawdown_pct": sanitize_float(med_dd, 2),
        "positive_return_pct": sanitize_float(pct_positive_return, 1),
        "positive_sharpe_pct": sanitize_float(pct_positive_sharpe, 1),
        "return_dispersion_std": sanitize_float(dispersion_std, 2),
        "parameter_stability_pct": sanitize_float(stability_pct, 1),
        "highest_observed_return": {
            "parameters": highest_ret_item["parameters"],
            "total_return_pct": highest_ret_item["total_return_pct"],
            "sharpe_ratio": highest_ret_item["sharpe_ratio"]
        },
        "highest_observed_sharpe": {
            "parameters": highest_sharpe_item["parameters"],
            "total_return_pct": highest_sharpe_item["total_return_pct"],
            "sharpe_ratio": highest_sharpe_item["sharpe_ratio"]
        }
    }

    return {
        "configuration": {
            "asset": asset_info,
            "strategy": strat_key,
            "start_date": request.start_date,
            "end_date": request.end_date,
            "initial_capital": request.initial_capital,
            "transaction_cost_pct": request.transaction_cost_pct,
            "position_size_pct": request.position_size_pct,
            "trading_sessions": n_days
        },
        "summary": summary,
        "results": results
    }
