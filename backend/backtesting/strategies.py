"""
Quantitative Strategy Signal Generators for QUANTEXA Backtesting Engine.
Contains signal logic for:
1. SMA Crossover
2. EMA Trend
3. Momentum
4. Mean Reversion

Strict Rule: Signals are generated at the CLOSE of trading day t.
Zero look-ahead bias: only observations up to day t are evaluated.
Signals returned as a list of integers: 1 (BUY), -1 (SELL/EXIT), 0 (HOLD).
"""

from typing import Dict, Any, List, Tuple
import pandas as pd
import numpy as np

from backend.analytics.engine import calculate_sma, calculate_ema
from backend.services.market_data import MarketDataError


def generate_sma_crossover_signals(
    close_series: pd.Series,
    parameters: Dict[str, Any]
) -> Tuple[List[int], Dict[str, Any]]:
    """
    SMA Crossover Strategy:
    BUY when Fast SMA crosses above Slow SMA.
    SELL when Fast SMA crosses below Slow SMA.
    """
    try:
        fast_period = int(parameters.get("fast_period", 20))
    except (ValueError, TypeError):
        raise MarketDataError("fast_period must be an integer >= 2.", status_code=400)

    try:
        slow_period = int(parameters.get("slow_period", 50))
    except (ValueError, TypeError):
        raise MarketDataError("slow_period must be an integer >= 2.", status_code=400)

    if fast_period < 2:
        raise MarketDataError("fast_period must be an integer >= 2.", status_code=400)
    if slow_period < 2:
        raise MarketDataError("slow_period must be an integer >= 2.", status_code=400)
    if fast_period >= slow_period:
        raise MarketDataError(
            f"fast_period ({fast_period}) must be strictly less than slow_period ({slow_period}).",
            status_code=400
        )
    if slow_period >= len(close_series):
        raise MarketDataError(
            f"slow_period ({slow_period}) exceeds available historical bars ({len(close_series)}).",
            status_code=400
        )

    sma_fast = calculate_sma(close_series, fast_period)
    sma_slow = calculate_sma(close_series, slow_period)

    n = len(close_series)
    signals = [0] * n
    position = 0  # 0: flat, 1: long

    for t in range(1, n):
        # We need both fast and slow SMA to be valid at t and t-1
        if pd.isna(sma_fast.iloc[t]) or pd.isna(sma_slow.iloc[t]) or \
           pd.isna(sma_fast.iloc[t-1]) or pd.isna(sma_slow.iloc[t-1]):
            continue

        f_curr, s_curr = sma_fast.iloc[t], sma_slow.iloc[t]
        f_prev, s_prev = sma_fast.iloc[t-1], sma_slow.iloc[t-1]

        # Bullish crossover
        if position == 0 and f_curr > s_curr and f_prev <= s_prev:
            signals[t] = 1
            position = 1
        # Bearish crossover
        elif position == 1 and f_curr < s_curr and f_prev >= s_prev:
            signals[t] = -1
            position = 0

    resolved_params = {
        "fast_period": fast_period,
        "slow_period": slow_period,
        "strategy_name": "SMA Crossover",
        "description": f"Long when {fast_period}-day SMA crosses above {slow_period}-day SMA; Exit on reverse cross."
    }
    return signals, resolved_params


def generate_ema_trend_signals(
    close_series: pd.Series,
    parameters: Dict[str, Any]
) -> Tuple[List[int], Dict[str, Any]]:
    """
    EMA Trend Strategy:
    BUY when Fast EMA crosses above Slow EMA.
    SELL when Fast EMA crosses below Slow EMA.
    """
    try:
        fast_period = int(parameters.get("fast_period", 20))
    except (ValueError, TypeError):
        raise MarketDataError("fast_period must be an integer >= 2.", status_code=400)

    try:
        slow_period = int(parameters.get("slow_period", 50))
    except (ValueError, TypeError):
        raise MarketDataError("slow_period must be an integer >= 2.", status_code=400)

    if fast_period < 2:
        raise MarketDataError("fast_period must be an integer >= 2.", status_code=400)
    if slow_period < 2:
        raise MarketDataError("slow_period must be an integer >= 2.", status_code=400)
    if fast_period >= slow_period:
        raise MarketDataError(
            f"fast_period ({fast_period}) must be strictly less than slow_period ({slow_period}).",
            status_code=400
        )
    if slow_period >= len(close_series):
        raise MarketDataError(
            f"slow_period ({slow_period}) exceeds available historical bars ({len(close_series)}).",
            status_code=400
        )

    ema_fast = calculate_ema(close_series, fast_period)
    ema_slow = calculate_ema(close_series, slow_period)

    n = len(close_series)
    signals = [0] * n
    position = 0

    for t in range(1, n):
        f_curr, s_curr = ema_fast.iloc[t], ema_slow.iloc[t]
        f_prev, s_prev = ema_fast.iloc[t-1], ema_slow.iloc[t-1]

        if pd.isna(f_curr) or pd.isna(s_curr) or pd.isna(f_prev) or pd.isna(s_prev):
            continue

        if position == 0 and f_curr > s_curr and f_prev <= s_prev:
            signals[t] = 1
            position = 1
        elif position == 1 and f_curr < s_curr and f_prev >= s_prev:
            signals[t] = -1
            position = 0

    resolved_params = {
        "fast_period": fast_period,
        "slow_period": slow_period,
        "strategy_name": "EMA Trend",
        "description": f"Long when {fast_period}-day EMA crosses above {slow_period}-day EMA; Exit on reverse cross."
    }
    return signals, resolved_params


def generate_momentum_signals(
    close_series: pd.Series,
    parameters: Dict[str, Any]
) -> Tuple[List[int], Dict[str, Any]]:
    """
    Momentum Strategy:
    BUY when Close[t] > Close[t - lookback_days] and currently flat.
    EXIT when Close[t] <= Close[t - lookback_days] and currently long.
    """
    try:
        lookback = int(parameters.get("lookback_days", 20))
    except (ValueError, TypeError):
        raise MarketDataError("lookback_days must be an integer >= 2.", status_code=400)

    if lookback < 2:
        raise MarketDataError("lookback_days must be an integer >= 2.", status_code=400)
    if lookback >= len(close_series):
        raise MarketDataError(
            f"lookback_days ({lookback}) exceeds available historical bars ({len(close_series)}).",
            status_code=400
        )

    n = len(close_series)
    signals = [0] * n
    position = 0

    for t in range(lookback, n):
        p_curr = close_series.iloc[t]
        p_lookback = close_series.iloc[t - lookback]

        if pd.isna(p_curr) or pd.isna(p_lookback):
            continue

        if position == 0 and p_curr > p_lookback:
            signals[t] = 1
            position = 1
        elif position == 1 and p_curr <= p_lookback:
            signals[t] = -1
            position = 0

    resolved_params = {
        "lookback_days": lookback,
        "strategy_name": "Momentum",
        "description": f"Long when Close[t] > Close[t - {lookback}]; Exit when Close[t] <= Close[t - {lookback}]."
    }
    return signals, resolved_params


def generate_mean_reversion_signals(
    close_series: pd.Series,
    parameters: Dict[str, Any]
) -> Tuple[List[int], Dict[str, Any]]:
    """
    Mean Reversion Strategy (Long-Only):
    BUY when Close[t] is depressed below its SMA by more than threshold_pct:
      Close[t] < SMA[t] * (1 - threshold_pct / 100).
    EXIT when Close[t] recovers to or above its SMA:
      Close[t] >= SMA[t].
    """
    try:
        sma_period = int(parameters.get("sma_period", 20))
    except (ValueError, TypeError):
        raise MarketDataError("sma_period must be an integer >= 2.", status_code=400)

    try:
        threshold_pct = float(parameters.get("threshold_pct", 2.0))
    except (ValueError, TypeError):
        raise MarketDataError("threshold_pct must be a number between 0.0 and 50.0%.", status_code=400)

    if sma_period < 2:
        raise MarketDataError("sma_period must be an integer >= 2.", status_code=400)
    if sma_period >= len(close_series):
        raise MarketDataError(
            f"sma_period ({sma_period}) exceeds available historical bars ({len(close_series)}).",
            status_code=400
        )
    if threshold_pct < 0.0 or threshold_pct > 50.0:
        raise MarketDataError("threshold_pct must be a number between 0.0 and 50.0%.", status_code=400)

    sma = calculate_sma(close_series, sma_period)
    n = len(close_series)
    signals = [0] * n
    position = 0

    threshold_mult = 1.0 - (threshold_pct / 100.0)

    for t in range(sma_period - 1, n):
        sma_val = sma.iloc[t]
        if pd.isna(sma_val):
            continue

        p_curr = close_series.iloc[t]
        if pd.isna(p_curr):
            continue

        lower_band = sma_val * threshold_mult

        if position == 0 and p_curr < lower_band:
            signals[t] = 1
            position = 1
        elif position == 1 and p_curr >= sma_val:
            signals[t] = -1
            position = 0

    resolved_params = {
        "sma_period": sma_period,
        "threshold_pct": threshold_pct,
        "strategy_name": "Mean Reversion",
        "description": f"Long when Close[t] is {threshold_pct}% below {sma_period}-day SMA; Exit when price mean-reverts to SMA."
    }
    return signals, resolved_params


def generate_strategy_signals(
    strategy: str,
    close_series: pd.Series,
    parameters: Dict[str, Any]
) -> Tuple[List[int], Dict[str, Any]]:
    """
    Dispatcher routing request to corresponding strategy signal generator.
    """
    if not strategy or not isinstance(strategy, str):
        raise MarketDataError("Strategy name is required.", status_code=400)

    strat_key = strategy.strip().lower()
    if strat_key == "sma_crossover":
        return generate_sma_crossover_signals(close_series, parameters)
    elif strat_key == "ema_trend":
        return generate_ema_trend_signals(close_series, parameters)
    elif strat_key == "momentum":
        return generate_momentum_signals(close_series, parameters)
    elif strat_key == "mean_reversion":
        return generate_mean_reversion_signals(close_series, parameters)
    else:
        raise MarketDataError(
            f"Unsupported strategy '{strategy}'. Supported: 'sma_crossover', 'ema_trend', 'momentum', 'mean_reversion'.",
            status_code=400
        )
