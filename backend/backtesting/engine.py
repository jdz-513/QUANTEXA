"""
Master Backtesting Engine for QUANTEXA.
Orchestrates market data ingestion, strategy signal generation,
portfolio trade simulation, and performance metrics computation.
"""

import math
from typing import Dict, Any, List, Optional
import numpy as np
import pandas as pd

from backend.services.market_data import get_historical_market_data, MarketDataError, validate_date_format
from backend.utils.assets import get_asset, is_valid_asset
from backend.analytics.engine import (
    calculate_historical_volatility, 
    calculate_annualized_volatility, 
    calculate_sharpe_ratio,
    sanitize_float
)
from backend.backtesting.models import (
    BacktestRequest,
    BacktestResponse,
    BacktestPerformance,
    BenchmarkPerformance,
    TradeRecord,
    EquityPoint
)
from backend.backtesting.strategies import generate_strategy_signals
from backend.backtesting.portfolio import PortfolioSimulator


EXECUTION_CONVENTION_DOC = (
    "Signal calculated from Close[t] using historical information up to session t. "
    "Trade executed at Open[t+1] of the next available trading session with realistic transaction fees. "
    "Unclosed positions at the horizon boundary are liquidated at the final session's Close[T] without look-ahead bias."
)


def run_backtest_simulation(request: BacktestRequest) -> BacktestResponse:
    """
    Executes a complete historical backtest based on the given request parameters.
    """
    # 1. Validation
    asset_id = request.asset.strip().lower()
    asset_info = get_asset(asset_id)
    if not asset_info:
        raise MarketDataError(
            f"Unsupported asset '{request.asset}'. Valid assets: 'gold', 'bitcoin', 'nvidia'.",
            status_code=400
        )

    start_dt = validate_date_format(request.start_date, "start_date")
    end_dt = validate_date_format(request.end_date, "end_date")
    if start_dt >= end_dt:
        raise MarketDataError(
            f"start_date ({request.start_date}) must be strictly before end_date ({request.end_date}).",
            status_code=400
        )

    if request.initial_capital <= 0:
        raise MarketDataError("initial_capital must be greater than 0.", status_code=400)
    if request.transaction_cost_pct < 0.0 or request.transaction_cost_pct > 10.0:
        raise MarketDataError("transaction_cost_pct must be between 0.0% and 10.0%.", status_code=400)
    if request.position_size_pct <= 0.0 or request.position_size_pct > 100.0:
        raise MarketDataError("position_size_pct must be between 1.0% and 100.0%.", status_code=400)

    # 2. Ingest Historical Market Data
    market_payload = get_historical_market_data(
        asset_id=asset_id,
        start_date=request.start_date,
        end_date=request.end_date,
        use_cache=True
    )
    records = market_payload.get("data", [])
    if len(records) < 10:
        raise MarketDataError(
            f"Insufficient historical data ({len(records)} bars found) to perform backtest for {asset_info['name']}.",
            status_code=400
        )

    df = pd.DataFrame(records)
    for col in ["open", "high", "low", "close"]:
        df[col] = pd.to_numeric(df[col], errors="coerce")
    df = df.dropna(subset=["open", "close"]).reset_index(drop=True)

    # Ensure strictly chronological sort
    df["dt_temp"] = pd.to_datetime(df["date"])
    df = df.sort_values("dt_temp").drop(columns=["dt_temp"]).reset_index(drop=True)

    if len(df) < 10:
        raise MarketDataError("Insufficient valid price records after cleaning.", status_code=400)

    # 3. Generate Strategy Signals
    signals, resolved_strategy_params = generate_strategy_signals(
        strategy=request.strategy,
        close_series=df["close"],
        parameters=request.parameters or {}
    )

    # 4. Simulate Portfolio Execution
    simulator = PortfolioSimulator(
        initial_capital=request.initial_capital,
        transaction_cost_pct=request.transaction_cost_pct,
        position_size_pct=request.position_size_pct
    )

    trades, equity_curve = simulator.execute_simulation(
        df=df,
        signals=signals,
        strategy_name=resolved_strategy_params.get("strategy_name", request.strategy)
    )

    # 5. Compute Buy & Hold Benchmark Simulation
    init_val = request.initial_capital
    cost_rate = request.transaction_cost_pct / 100.0
    first_open = float(df["open"].iloc[0])
    bm_qty = init_val / (first_open * (1.0 + cost_rate)) if first_open > 0 else 0.0
    bm_cash = max(0.0, init_val - bm_qty * first_open * (1.0 + cost_rate))

    bm_values = []
    bm_peak = init_val
    bm_drawdowns = []

    for idx, pt in enumerate(equity_curve):
        c_price = float(df["close"].iloc[idx])
        curr_bm_val = bm_cash + (bm_qty * c_price)
        bm_cum_ret = ((curr_bm_val - init_val) / init_val * 100.0) if init_val > 0 else 0.0
        pt.benchmark_return = round(bm_cum_ret, 4)
        pt.benchmark_value = round(curr_bm_val, 2)
        bm_values.append(curr_bm_val)

        bm_peak = max(bm_peak, curr_bm_val)
        bm_dd = ((curr_bm_val - bm_peak) / bm_peak * 100.0) if bm_peak > 0 else 0.0
        bm_drawdowns.append(bm_dd)

    # Benchmark end liquidation
    last_c_price = float(df["close"].iloc[-1])
    bm_sell_val = bm_qty * last_c_price
    bm_exit_fee = bm_sell_val * cost_rate
    bm_final_val = round(bm_cash + bm_sell_val - bm_exit_fee, 2)
    bm_tot_ret = round(((bm_final_val - init_val) / init_val * 100.0), 4)

    n_days = len(equity_curve)
    if n_days > 1 and bm_final_val > 0 and init_val > 0:
        bm_years = n_days / 252.0
        bm_cagr = (((bm_final_val / init_val) ** (1.0 / bm_years)) - 1.0) * 100.0 if bm_years > 0 else bm_tot_ret
    else:
        bm_cagr = bm_tot_ret

    bm_val_series = pd.Series(bm_values)
    bm_daily_rets = bm_val_series.pct_change() * 100.0
    bm_ann_vol = calculate_annualized_volatility(bm_daily_rets, trading_days=252)
    bm_sharpe = calculate_sharpe_ratio(bm_daily_rets, risk_free_rate_pct=0.0, trading_days=252)
    bm_max_dd = float(min(bm_drawdowns)) if bm_drawdowns else 0.0

    benchmark_performance = BenchmarkPerformance(
        initial_capital=round(init_val, 2),
        final_portfolio_value=round(bm_final_val, 2),
        total_return_pct=round(bm_tot_ret, 4),
        cagr_pct=round(bm_cagr, 4),
        annualized_volatility_pct=round(bm_ann_vol, 4),
        sharpe_ratio=round(bm_sharpe, 4),
        max_drawdown_pct=round(bm_max_dd, 4)
    )

    # 6. Compute Strategy Backtest Performance Metrics
    final_val = equity_curve[-1].portfolio_value if equity_curve else init_val
    total_return_pct = ((final_val - init_val) / init_val * 100.0) if init_val > 0 else 0.0

    if n_days > 1 and final_val > 0 and init_val > 0:
        years = n_days / 252.0
        cagr_pct = (((final_val / init_val) ** (1.0 / years)) - 1.0) * 100.0 if years > 0 else total_return_pct
    else:
        cagr_pct = total_return_pct

    # Annualized Volatility & Sharpe of strategy equity curve
    daily_returns_list = [pt.daily_return for pt in equity_curve[1:] if pt.daily_return is not None]
    eq_returns_series = pd.Series(daily_returns_list)
    ann_vol = calculate_annualized_volatility(eq_returns_series, trading_days=252)
    sharpe = calculate_sharpe_ratio(eq_returns_series, risk_free_rate_pct=0.0, trading_days=252)

    # Max Drawdown
    drawdowns = [pt.drawdown for pt in equity_curve]
    max_dd = float(min(drawdowns)) if drawdowns else 0.0

    # Trade statistics
    total_trades = len(trades)
    winning_trades = sum(1 for t in trades if t.net_pnl > 0)
    losing_trades = sum(1 for t in trades if t.net_pnl < 0)
    win_rate_pct = (winning_trades / total_trades * 100.0) if total_trades > 0 else 0.0

    trade_returns = [t.return_pct for t in trades]
    best_trade = float(max(trade_returns)) if trade_returns else None
    worst_trade = float(min(trade_returns)) if trade_returns else None
    avg_trade = float(np.mean(trade_returns)) if trade_returns else None

    # Assemble performance object with float sanitization
    performance = BacktestPerformance(
        initial_capital=round(init_val, 2),
        final_portfolio_value=round(final_val, 2),
        total_return_pct=round(total_return_pct, 4),
        cagr_pct=round(cagr_pct, 4),
        annualized_volatility_pct=round(ann_vol, 4),
        sharpe_ratio=round(sharpe, 4),
        max_drawdown_pct=round(max_dd, 4),
        total_trades=total_trades,
        winning_trades=winning_trades,
        losing_trades=losing_trades,
        win_rate_pct=round(win_rate_pct, 2),
        total_transaction_costs=round(simulator.total_transaction_costs, 2),
        best_trade_pct=round(best_trade, 4) if best_trade is not None else None,
        worst_trade_pct=round(worst_trade, 4) if worst_trade is not None else None,
        avg_trade_return_pct=round(avg_trade, 4) if avg_trade is not None else None
    )

    backtest_config = {
        "asset": asset_info,
        "strategy": resolved_strategy_params.get("strategy_name", request.strategy),
        "strategy_key": request.strategy,
        "parameters": resolved_strategy_params,
        "start_date": request.start_date,
        "end_date": request.end_date,
        "initial_capital": request.initial_capital,
        "transaction_cost_pct": request.transaction_cost_pct,
        "position_size_pct": request.position_size_pct,
        "trading_sessions": n_days
    }

    return BacktestResponse(
        backtest_config=backtest_config,
        execution_convention=EXECUTION_CONVENTION_DOC,
        performance=performance,
        benchmark_performance=benchmark_performance,
        trades=trades,
        equity_curve=equity_curve
    )
