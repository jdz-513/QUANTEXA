"""
Quantitative Analysis Engine for QUANTEXA.
Vectorized financial calculations using Pandas and NumPy.
Calculates technical indicators and risk-adjusted performance metrics
with strict floating-point sanitization against NaN and Infinity.
"""

import math
import time
from typing import Dict, Any, List, Optional, Tuple
import numpy as np
import pandas as pd

from backend.services.market_data import get_historical_market_data, MarketDataError
from backend.utils.assets import get_asset


# In-memory cache for analytics results: key -> (timestamp, payload)
_ANALYTICS_CACHE: Dict[str, Tuple[float, Dict[str, Any]]] = {}
CACHE_TTL_SECONDS = 900  # 15 minutes


def sanitize_float(val: Any, precision: int = 4) -> Optional[float]:
    """
    Sanitize numeric values to guarantee zero NaN, Infinity, or -Infinity reach JSON serialization.
    Returns None if value is null, NaN, or infinite.
    """
    if val is None or pd.isna(val):
        return None
    try:
        f_val = float(val)
        if math.isnan(f_val) or math.isinf(f_val):
            return None
        return round(f_val, precision)
    except (ValueError, TypeError):
        return None


def calculate_sma(series: pd.Series, period: int) -> pd.Series:
    """
    Calculate Simple Moving Average (SMA) over a given period window.
    Points before `period` will be NaN (sanitized to None in output).
    """
    if period <= 0:
        raise ValueError("SMA period must be a positive integer.")
    return series.rolling(window=period, min_periods=period).mean()


def calculate_ema(series: pd.Series, period: int) -> pd.Series:
    """
    Calculate Exponential Moving Average (EMA) using standard smoothing factor alpha = 2 / (period + 1).
    """
    if period <= 0:
        raise ValueError("EMA period must be a positive integer.")
    return series.ewm(span=period, adjust=False).mean()


def calculate_daily_returns(series: pd.Series) -> pd.Series:
    """
    Calculate percentage daily returns: (P_t - P_{t-1}) / P_{t-1} * 100.
    """
    return series.pct_change() * 100.0


def calculate_cumulative_returns(series: pd.Series) -> pd.Series:
    """
    Calculate cumulative returns relative to inception price:
    ((P_t - P_0) / P_0) * 100.
    """
    if series.empty or series.iloc[0] == 0:
        return pd.Series(0.0, index=series.index)
    first_val = series.iloc[0]
    return ((series - first_val) / first_val) * 100.0


def calculate_historical_volatility(daily_returns_pct: pd.Series) -> float:
    """
    Calculate sample standard deviation of daily percentage returns.
    """
    clean_returns = daily_returns_pct.dropna()
    if len(clean_returns) < 2:
        return 0.0
    vol = float(clean_returns.std(ddof=1))
    return vol if not (math.isnan(vol) or math.isinf(vol)) else 0.0


def calculate_annualized_volatility(
    daily_returns_pct: pd.Series,
    trading_days: int = 252
) -> float:
    """
    Annualize daily return volatility using sqrt(trading_days).
    sigma_ann = sigma_daily * sqrt(252).
    """
    daily_vol = calculate_historical_volatility(daily_returns_pct)
    ann_vol = daily_vol * math.sqrt(trading_days)
    return ann_vol if not (math.isnan(ann_vol) or math.isinf(ann_vol)) else 0.0


def calculate_sharpe_ratio(
    daily_returns_pct: pd.Series,
    risk_free_rate_pct: float = 0.0,
    trading_days: int = 252
) -> float:
    """
    Calculate annualized Sharpe Ratio:
    Sharpe = ((mean(R_d) - R_f_daily) / std(R_d)) * sqrt(trading_days)
    where returns and risk-free rates are given in percentage terms.
    """
    clean_returns = daily_returns_pct.dropna()
    if len(clean_returns) < 2:
        return 0.0

    rf_daily = risk_free_rate_pct / trading_days
    excess_returns = clean_returns - rf_daily
    mean_excess = float(excess_returns.mean())
    std_excess = float(clean_returns.std(ddof=1))

    if std_excess <= 1e-9 or math.isnan(std_excess) or math.isinf(std_excess):
        return 0.0

    sharpe = (mean_excess / std_excess) * math.sqrt(trading_days)
    if math.isnan(sharpe) or math.isinf(sharpe):
        return 0.0
    return float(round(sharpe, 4))


def calculate_drawdown_profile(
    series: pd.Series,
    dates: pd.Series
) -> Tuple[pd.Series, float, Optional[str], Optional[str]]:
    """
    Calculate running peak, underwater drawdown series, maximum drawdown percentage,
    and the peak & trough dates.
    
    Returns:
        (drawdown_pct_series, max_drawdown_pct, peak_date, trough_date)
    """
    if series.empty:
        return pd.Series(dtype=float), 0.0, None, None

    running_peak = series.cummax()
    # Avoid division by zero
    running_peak_safe = running_peak.replace(0, np.nan)
    drawdown_pct = ((series - running_peak_safe) / running_peak_safe) * 100.0
    drawdown_pct = drawdown_pct.fillna(0.0)

    max_dd = float(drawdown_pct.min())
    if math.isnan(max_dd) or math.isinf(max_dd):
        max_dd = 0.0

    # Locate trough and peak date
    if len(series) > 0 and max_dd < 0:
        trough_idx = drawdown_pct.idxmin()
        # Peak prior to or at trough
        sub_series = series.loc[:trough_idx]
        peak_idx = sub_series.idxmax()

        trough_date = str(dates.loc[trough_idx]) if trough_idx in dates.index else None
        peak_date = str(dates.loc[peak_idx]) if peak_idx in dates.index else None
    else:
        peak_date = str(dates.iloc[0]) if len(dates) > 0 else None
        trough_date = peak_date

    return drawdown_pct, round(max_dd, 4), peak_date, trough_date


def compute_asset_analytics(
    asset_id: str,
    start_date: str,
    end_date: str,
    sma_period: int = 20,
    sma_period_slow: int = 50,
    ema_period: int = 20,
    risk_free_rate: float = 0.0,
    use_cache: bool = True
) -> Dict[str, Any]:
    """
    Orchestrates market data retrieval, indicator computation, risk statistics calculation,
    and returns sanitized JSON-ready analytics payload.
    """
    # 1. Validation
    asset_info = get_asset(asset_id)
    if not asset_info:
        raise MarketDataError(
            f"Unsupported asset '{asset_id}'. Valid assets: 'gold', 'bitcoin', 'nvidia'.",
            status_code=400
        )

    if sma_period < 2 or sma_period_slow < 2 or ema_period < 2:
        raise MarketDataError(
            "Moving average periods must be integers >= 2.",
            status_code=400
        )

    # 2. Check in-memory analytics cache
    cache_key = f"{asset_info['id']}:{start_date}:{end_date}:{sma_period}:{sma_period_slow}:{ema_period}:{risk_free_rate}"
    now = time.time()
    if use_cache and cache_key in _ANALYTICS_CACHE:
        cached_time, cached_payload = _ANALYTICS_CACHE[cache_key]
        if now - cached_time < CACHE_TTL_SECONDS:
            return cached_payload

    # 3. Retrieve Historical Market Data
    market_payload = get_historical_market_data(
        asset_id=asset_id,
        start_date=start_date,
        end_date=end_date,
        use_cache=use_cache
    )

    records = market_payload.get("data", [])
    if not records:
        raise MarketDataError(
            f"Insufficient historical data available for {asset_info['name']} to perform analytics.",
            status_code=404
        )

    # 4. Build DataFrame
    df = pd.DataFrame(records)
    df["close"] = pd.to_numeric(df["close"], errors="coerce")
    df = df.dropna(subset=["close"]).reset_index(drop=True)

    if len(df) < 2:
        raise MarketDataError(
            "At least 2 historical price points are required to compute returns and quantitative analytics.",
            status_code=400
        )

    dates = df["date"]
    close_series = df["close"]

    # 5. Calculate Technical Indicators & Returns
    sma_fast_series = calculate_sma(close_series, sma_period)
    sma_slow_series = calculate_sma(close_series, sma_period_slow)
    ema_series = calculate_ema(close_series, ema_period)

    daily_returns_pct = calculate_daily_returns(close_series)
    cumulative_returns_pct = calculate_cumulative_returns(close_series)

    # Volatility and Sharpe
    daily_vol = calculate_historical_volatility(daily_returns_pct)
    ann_vol = calculate_annualized_volatility(daily_returns_pct, trading_days=252)
    sharpe = calculate_sharpe_ratio(daily_returns_pct, risk_free_rate_pct=risk_free_rate, trading_days=252)

    # Drawdown profile
    drawdown_series, max_dd, peak_date, trough_date = calculate_drawdown_profile(close_series, dates)

    # Total Return & CAGR
    first_price = float(close_series.iloc[0])
    last_price = float(close_series.iloc[-1])
    total_return_pct = ((last_price - first_price) / first_price) * 100.0 if first_price > 0 else 0.0

    # CAGR: Compound Annual Growth Rate
    n_days = len(close_series)
    if n_days > 1 and first_price > 0 and last_price > 0:
        years = n_days / 252.0
        cagr_pct = (((last_price / first_price) ** (1.0 / years)) - 1.0) * 100.0 if years > 0 else total_return_pct
    else:
        cagr_pct = total_return_pct

    # Additional distribution statistics
    clean_daily = daily_returns_pct.dropna()
    positive_days = int((clean_daily > 0).sum())
    negative_days = int((clean_daily < 0).sum())
    total_days = len(clean_daily)
    win_rate_pct = (positive_days / total_days * 100.0) if total_days > 0 else 0.0
    best_day_pct = float(clean_daily.max()) if total_days > 0 else 0.0
    worst_day_pct = float(clean_daily.min()) if total_days > 0 else 0.0

    # 6. Build Serialized Time Series with Complete NaN/Inf Protection
    series_records: List[Dict[str, Any]] = []
    for idx in range(len(df)):
        series_records.append({
            "date": str(dates.iloc[idx]),
            "close": sanitize_float(close_series.iloc[idx]),
            "daily_return_pct": sanitize_float(daily_returns_pct.iloc[idx]),
            "cumulative_return_pct": sanitize_float(cumulative_returns_pct.iloc[idx]),
            "sma_fast": sanitize_float(sma_fast_series.iloc[idx]),
            "sma_slow": sanitize_float(sma_slow_series.iloc[idx]),
            "ema": sanitize_float(ema_series.iloc[idx]),
            "drawdown_pct": sanitize_float(drawdown_series.iloc[idx])
        })

    # Downsampled sparkline series (20 points each, 100% derived from real historical data)
    def downsample_series(s: pd.Series, max_pts: int = 20) -> List[Optional[float]]:
        clean = s.dropna()
        if clean.empty:
            return []
        if len(clean) <= max_pts:
            return [sanitize_float(v, 3) for v in clean]
        idx = np.linspace(0, len(clean) - 1, max_pts, dtype=int)
        return [sanitize_float(v, 3) for v in clean.iloc[idx]]

    # Rolling 20d volatility for dynamic sparkline
    rolling_vol = daily_returns_pct.rolling(window=min(20, len(daily_returns_pct)), min_periods=2).std(ddof=1) * math.sqrt(252)
    # Rolling 20d Sharpe for dynamic sparkline
    rf_daily = risk_free_rate / 252.0
    excess_daily = daily_returns_pct - rf_daily
    rolling_mean_excess = excess_daily.rolling(window=min(20, len(excess_daily)), min_periods=2).mean()
    rolling_std_excess = daily_returns_pct.rolling(window=min(20, len(daily_returns_pct)), min_periods=2).std(ddof=1)
    rolling_sharpe = (rolling_mean_excess / rolling_std_excess.replace(0, np.nan)) * math.sqrt(252)

    sparklines = {
        "return_sparkline": downsample_series(cumulative_returns_pct, 20),
        "volatility_sparkline": downsample_series(rolling_vol, 20),
        "sharpe_sparkline": downsample_series(rolling_sharpe, 20),
        "drawdown_sparkline": downsample_series(drawdown_series, 20)
    }

    # 7. Assemble Summary Payload
    summary = {
        "latest_price": sanitize_float(last_price),
        "first_price": sanitize_float(first_price),
        "period_high": sanitize_float(float(close_series.max())),
        "period_low": sanitize_float(float(close_series.min())),
        "total_return_pct": sanitize_float(total_return_pct),
        "cagr_pct": sanitize_float(cagr_pct),
        "daily_volatility_pct": sanitize_float(daily_vol),
        "annualized_volatility_pct": sanitize_float(ann_vol),
        "sharpe_ratio": sanitize_float(sharpe),
        "max_drawdown_pct": sanitize_float(max_dd),
        "max_drawdown_peak_date": peak_date,
        "max_drawdown_trough_date": trough_date,
        "trading_sessions": len(df),
        "positive_days": positive_days,
        "negative_days": negative_days,
        "win_rate_pct": sanitize_float(win_rate_pct),
        "best_day_pct": sanitize_float(best_day_pct),
        "worst_day_pct": sanitize_float(worst_day_pct),
        "sma_period_fast": sma_period,
        "sma_period_slow": sma_period_slow,
        "ema_period": ema_period,
        "risk_free_rate_pct": risk_free_rate,
        "sparklines": sparklines
    }

    payload = {
        "asset": asset_info,
        "start_date": start_date,
        "end_date": end_date,
        "summary": summary,
        "count": len(series_records),
        "series": series_records
    }

    # Save to Cache
    if use_cache:
        _ANALYTICS_CACHE[cache_key] = (now, payload)

    return payload
