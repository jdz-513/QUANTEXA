"""
Cross-Asset Correlation Engine for QUANTEXA.
Computes Pearson cross-asset correlation matrix and dynamic rolling correlation
using strictly calendar-date-aligned daily returns (never raw prices).
"""

import math
import time
from typing import Dict, Any, List, Optional, Tuple
import numpy as np
import pandas as pd

from backend.services.market_data import (
    get_historical_market_data, 
    validate_date_format, 
    MarketDataError
)
from backend.utils.assets import get_asset, is_valid_asset
from backend.analytics.engine import sanitize_float


# In-memory caches with 15-minute TTL
_CORRELATION_MATRIX_CACHE: Dict[str, Tuple[float, Dict[str, Any]]] = {}
_PAIR_CORRELATION_CACHE: Dict[str, Tuple[float, Dict[str, Any]]] = {}
CACHE_TTL_SECONDS = 900

SUPPORTED_ROLLING_WINDOWS = [7, 30, 60, 90]
DEFAULT_ASSETS = ["gold", "bitcoin", "nvidia"]


def clamp_correlation(val: Optional[float], precision: int = 4) -> Optional[float]:
    """
    Sanitize and bound correlation strictly to [-1.0, 1.0].
    Returns None if value is null, NaN, or infinite.
    """
    clean_val = sanitize_float(val, precision=precision)
    if clean_val is None:
        return None
    # Floating-point arithmetic may occasionally yield 1.0000000002
    if clean_val > 1.0:
        return 1.0
    if clean_val < -1.0:
        return -1.0
    return clean_val


def get_asset_daily_returns(
    asset_id: str,
    start_date: str,
    end_date: str,
    use_cache: bool = True
) -> pd.Series:
    """
    Fetch historical prices and compute daily percentage returns indexed by date string.
    Returns:
        pd.Series indexed by 'YYYY-MM-DD' with float daily percentage returns.
    """
    market_payload = get_historical_market_data(
        asset_id=asset_id,
        start_date=start_date,
        end_date=end_date,
        use_cache=use_cache
    )
    records = market_payload.get("data", [])
    if not records or len(records) < 2:
        raise MarketDataError(
            f"Insufficient historical price observations for {asset_id} to calculate returns.",
            status_code=400
        )

    df = pd.DataFrame(records)
    df["close"] = pd.to_numeric(df["close"], errors="coerce")
    df = df.dropna(subset=["close"]).reset_index(drop=True)

    if len(df) < 2:
        raise MarketDataError(
            f"Insufficient valid price points for {asset_id} to compute returns.",
            status_code=400
        )

    # Calculate daily percentage returns: (P_t - P_{t-1}) / P_{t-1} * 100
    df["returns"] = df["close"].pct_change() * 100.0
    
    # Drop first observation (NaN return)
    clean_df = df.dropna(subset=["returns"]).copy()

    # Index by date string YYYY-MM-DD
    series = pd.Series(
        data=clean_df["returns"].values,
        index=clean_df["date"].astype(str).values,
        name=asset_id
    )
    return series


def align_pairwise_returns(
    returns_a: pd.Series,
    returns_b: pd.Series
) -> pd.DataFrame:
    """
    Calendar-date align two asset return series via inner join.
    Bitcoin trades 7 days/week, Gold/Equities ~5 days/week.
    Observations are strictly joined on matching 'YYYY-MM-DD' calendar date.
    No forward filling or positional row matching is performed.
    """
    # Create combined DataFrame on index (calendar date string)
    df = pd.DataFrame({
        "a": returns_a,
        "b": returns_b
    }).dropna()

    # Sort chronologically
    df.sort_index(inplace=True)
    return df


def compute_correlation_matrix(
    start_date: str,
    end_date: str,
    use_cache: bool = True
) -> Dict[str, Any]:
    """
    Computes a symmetric 3x3 Pearson correlation matrix for Gold, Bitcoin, and NVIDIA
    using calendar-date aligned daily returns.
    """
    # 1. Date Validation
    start_dt = validate_date_format(start_date, "start_date")
    end_dt = validate_date_format(end_date, "end_date")
    if start_dt >= end_dt:
        raise MarketDataError(
            f"start_date ({start_date}) must be strictly before end_date ({end_date}).",
            status_code=400
        )

    # 2. Check Cache
    cache_key = f"matrix:{start_date}:{end_date}"
    now = time.time()
    if use_cache and cache_key in _CORRELATION_MATRIX_CACHE:
        cached_time, cached_payload = _CORRELATION_MATRIX_CACHE[cache_key]
        if now - cached_time < CACHE_TTL_SECONDS:
            return cached_payload

    # 3. Fetch daily return series for all 3 assets
    asset_returns: Dict[str, pd.Series] = {}
    for asset_id in DEFAULT_ASSETS:
        asset_returns[asset_id] = get_asset_daily_returns(
            asset_id=asset_id,
            start_date=start_date,
            end_date=end_date,
            use_cache=use_cache
        )

    # 4. Compute pairwise alignments & correlations
    matrix: Dict[str, Dict[str, float]] = {
        a: {b: 0.0 for b in DEFAULT_ASSETS} for a in DEFAULT_ASSETS
    }
    observations: Dict[str, int] = {}

    for i, asset_a in enumerate(DEFAULT_ASSETS):
        matrix[asset_a][asset_a] = 1.0  # Diagonal is always exactly 1.0
        for j in range(i + 1, len(DEFAULT_ASSETS)):
            asset_b = DEFAULT_ASSETS[j]
            aligned = align_pairwise_returns(asset_returns[asset_a], asset_returns[asset_b])
            n_obs = len(aligned)
            pair_key = f"{asset_a}_{asset_b}"
            observations[pair_key] = n_obs

            if n_obs < 2:
                corr_val = 0.0
            else:
                raw_corr = aligned["a"].corr(aligned["b"])
                clean_corr = clamp_correlation(raw_corr, precision=4)
                corr_val = clean_corr if clean_corr is not None else 0.0

            # Enforce symmetry
            matrix[asset_a][asset_b] = corr_val
            matrix[asset_b][asset_a] = corr_val

    payload = {
        "assets": DEFAULT_ASSETS,
        "start_date": start_date,
        "end_date": end_date,
        "matrix": matrix,
        "observations": observations
    }

    if use_cache:
        _CORRELATION_MATRIX_CACHE[cache_key] = (now, payload)

    return payload


def compute_pair_correlation(
    asset_a: str,
    asset_b: str,
    start_date: str,
    end_date: str,
    rolling_window: int = 30,
    use_cache: bool = True
) -> Dict[str, Any]:
    """
    Computes static Pearson correlation and dynamic rolling correlation series
    between asset_a and asset_b over aligned daily returns.
    """
    # 1. Validation
    asset_a_info = get_asset(asset_a)
    asset_b_info = get_asset(asset_b)

    if not asset_a_info:
        raise MarketDataError(
            f"Unsupported asset_a '{asset_a}'. Valid assets: 'gold', 'bitcoin', 'nvidia'.",
            status_code=400
        )
    if not asset_b_info:
        raise MarketDataError(
            f"Unsupported asset_b '{asset_b}'. Valid assets: 'gold', 'bitcoin', 'nvidia'.",
            status_code=400
        )

    if asset_a_info["id"] == asset_b_info["id"]:
        raise MarketDataError(
            "asset_a and asset_b must be different assets.",
            status_code=400
        )

    start_dt = validate_date_format(start_date, "start_date")
    end_dt = validate_date_format(end_date, "end_date")
    if start_dt >= end_dt:
        raise MarketDataError(
            f"start_date ({start_date}) must be strictly before end_date ({end_date}).",
            status_code=400
        )

    if rolling_window not in SUPPORTED_ROLLING_WINDOWS:
        raise MarketDataError(
            f"Unsupported rolling window '{rolling_window}'. Supported windows: {SUPPORTED_ROLLING_WINDOWS}.",
            status_code=400
        )

    # 2. Check Cache
    cache_key = f"pair:{asset_a_info['id']}:{asset_b_info['id']}:{start_date}:{end_date}:{rolling_window}"
    now = time.time()
    if use_cache and cache_key in _PAIR_CORRELATION_CACHE:
        cached_time, cached_payload = _PAIR_CORRELATION_CACHE[cache_key]
        if now - cached_time < CACHE_TTL_SECONDS:
            return cached_payload

    # 3. Fetch returns
    returns_a = get_asset_daily_returns(asset_a_info["id"], start_date, end_date, use_cache=use_cache)
    returns_b = get_asset_daily_returns(asset_b_info["id"], start_date, end_date, use_cache=use_cache)

    # 4. Align on calendar dates
    aligned = align_pairwise_returns(returns_a, returns_b)
    n_obs = len(aligned)

    if n_obs < 2:
        raise MarketDataError(
            f"Insufficient overlapping trading days between {asset_a_info['name']} and {asset_b_info['name']} (found {n_obs}).",
            status_code=400
        )

    # 5. Full Period Static Pearson Correlation
    raw_static_corr = aligned["a"].corr(aligned["b"])
    static_corr = clamp_correlation(raw_static_corr, precision=4)

    # 6. Rolling Correlation Calculation
    # Using window=rolling_window, min_periods=rolling_window ensures initial (window - 1) are NaN -> null
    rolling_corr_series = aligned["a"].rolling(
        window=rolling_window, 
        min_periods=rolling_window
    ).corr(aligned["b"])

    series_data: List[Dict[str, Any]] = []
    dates_list = aligned.index.tolist()
    for idx, d_str in enumerate(dates_list):
        r_val = rolling_corr_series.iloc[idx]
        clean_r = clamp_correlation(r_val, precision=4)
        series_data.append({
            "date": str(d_str),
            "correlation": clean_r  # null for first window - 1 entries
        })

    # Latest available rolling correlation
    valid_rolling = [s["correlation"] for s in series_data if s["correlation"] is not None]
    latest_rolling = valid_rolling[-1] if valid_rolling else None

    payload = {
        "asset_a": asset_a_info,
        "asset_b": asset_b_info,
        "period": {
            "start_date": start_date,
            "end_date": end_date
        },
        "correlation": static_corr if static_corr is not None else 0.0,
        "rolling_window": rolling_window,
        "observations": n_obs,
        "latest_rolling_correlation": latest_rolling,
        "series": series_data
    }

    if use_cache:
        _PAIR_CORRELATION_CACHE[cache_key] = (now, payload)

    return payload
