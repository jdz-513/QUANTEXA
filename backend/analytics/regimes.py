"""
Market Regime Classification & Strategy Performance by Regime for QUANTEXA.
Quantitatively classifies historical market conditions into Bull, Bear, Neutral,
and High/Low Volatility regimes based on explicit, configurable rolling thresholds.
All warm-up periods remain strictly null to avoid fabricated labels or look-ahead bias.
"""

import math
from typing import Dict, Any, List, Optional
import numpy as np
import pandas as pd

from backend.services.market_data import get_historical_market_data, MarketDataError, validate_date_format
from backend.utils.assets import get_asset
from backend.analytics.engine import (
    calculate_annualized_volatility,
    sanitize_float
)
from backend.backtesting.models import BacktestRequest
from backend.backtesting.engine import run_backtest_simulation

METHODOLOGY_DOC = (
    "Market regimes are rule-based, backward-looking classifications derived strictly from rolling windows: "
    "Bull: rolling return > positive threshold. Bear: rolling return < negative threshold. Neutral: within threshold band. "
    "Volatility is independently classified as High Volatility when annualized rolling return standard deviation exceeds the volatility threshold, "
    "and Low Volatility otherwise. Early warm-up sessions before the window length are left null to prevent look-ahead bias."
)


def compute_market_regimes(
    asset_id: str,
    start_date: str,
    end_date: str,
    return_window: int = 20,
    volatility_window: int = 20,
    positive_return_threshold: float = 2.0,
    negative_return_threshold: float = -2.0,
    volatility_threshold: float = 25.0,
    strategy: Optional[str] = None,
    strategy_parameters: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    """
    Computes chronological rolling market regimes and regime summary statistics.
    Optionally evaluates strategy performance segmented across identified regimes.
    """
    # 1. Validation
    asset_info = get_asset(asset_id)
    if not asset_info:
        raise MarketDataError(f"Unsupported asset '{asset_id}'.", status_code=400)

    start_dt = validate_date_format(start_date, "start_date")
    end_dt = validate_date_format(end_date, "end_date")
    if start_dt >= end_dt:
        raise MarketDataError("start_date must be strictly before end_date.", status_code=400)

    if return_window < 5 or return_window > 250:
        raise MarketDataError("return_window must be between 5 and 250 days.", status_code=400)
    if volatility_window < 5 or volatility_window > 250:
        raise MarketDataError("volatility_window must be between 5 and 250 days.", status_code=400)

    if positive_return_threshold <= 0.0:
        raise MarketDataError("positive_return_threshold must be strictly positive.", status_code=400)
    if negative_return_threshold >= 0.0:
        raise MarketDataError("negative_return_threshold must be strictly negative.", status_code=400)
    if volatility_threshold <= 0.0:
        raise MarketDataError("volatility_threshold must be strictly positive.", status_code=400)

    # 2. Ingest Market Data
    market_payload = get_historical_market_data(
        asset_id=asset_id,
        start_date=start_date,
        end_date=end_date,
        use_cache=True
    )
    records = market_payload.get("data", [])
    if len(records) < max(return_window, volatility_window) + 5:
        raise MarketDataError(
            f"Insufficient historical bars ({len(records)}) for regime analysis with window={max(return_window, volatility_window)}.",
            status_code=400
        )

    df = pd.DataFrame(records)
    for col in ["open", "high", "low", "close"]:
        df[col] = pd.to_numeric(df[col], errors="coerce")
    df = df.dropna(subset=["open", "close"]).reset_index(drop=True)
    df["dt_temp"] = pd.to_datetime(df["date"])
    df = df.sort_values("dt_temp").drop(columns=["dt_temp"]).reset_index(drop=True)

    n_bars = len(df)

    # 3. Vectorized Rolling Return & Volatility Calculation
    daily_returns_pct = df["close"].pct_change() * 100.0

    # Rolling return over return_window (percentage change over window)
    rolling_ret_pct = ((df["close"] - df["close"].shift(return_window)) / df["close"].shift(return_window)) * 100.0

    # Rolling volatility: sample standard deviation over volatility_window, annualized (sqrt(252))
    rolling_vol_ann = daily_returns_pct.rolling(
        window=volatility_window,
        min_periods=volatility_window
    ).std(ddof=1) * math.sqrt(252)

    # 4. Classify Series Chronologically
    series_data = []
    warmup_period = max(return_window, volatility_window)

    for t in range(n_bars):
        d_str = str(df["date"].iloc[t])
        c_price = float(df["close"].iloc[t])
        d_ret = sanitize_float(daily_returns_pct.iloc[t], 4)

        if t < warmup_period:
            # Warm-up phase: strictly None/null
            series_data.append({
                "date": d_str,
                "close": sanitize_float(c_price, 2),
                "daily_return_pct": d_ret,
                "rolling_return_pct": None,
                "rolling_volatility_pct": None,
                "return_regime": None,
                "volatility_regime": None,
                "combined_regime": None
            })
        else:
            r_ret = float(rolling_ret_pct.iloc[t])
            r_vol = float(rolling_vol_ann.iloc[t])

            # Return regime classification
            if r_ret > positive_return_threshold:
                ret_regime = "Bull"
            elif r_ret < negative_return_threshold:
                ret_regime = "Bear"
            else:
                ret_regime = "Neutral"

            # Volatility regime classification
            if r_vol > volatility_threshold:
                vol_regime = "High Volatility"
            else:
                vol_regime = "Low Volatility"

            comb_regime = f"{ret_regime} + {vol_regime}"

            series_data.append({
                "date": d_str,
                "close": sanitize_float(c_price, 2),
                "daily_return_pct": d_ret,
                "rolling_return_pct": sanitize_float(r_ret, 2),
                "rolling_volatility_pct": sanitize_float(r_vol, 2),
                "return_regime": ret_regime,
                "volatility_regime": vol_regime,
                "combined_regime": comb_regime
            })

    # 5. Compute Regime Aggregated Statistics
    valid_pts = [p for p in series_data if p["combined_regime"] is not None]
    n_valid = len(valid_pts)

    def aggregate_regime_stats(pts: List[Dict[str, Any]]) -> Dict[str, Any]:
        count = len(pts)
        if count == 0:
            return {
                "observations": 0,
                "percentage_of_period": 0.0,
                "average_daily_return_pct": 0.0,
                "annualized_volatility_pct": 0.0,
                "cumulative_return_pct": 0.0
            }
        rets = [p["daily_return_pct"] for p in pts if p["daily_return_pct"] is not None]
        avg_ret = float(np.mean(rets)) if rets else 0.0
        vol = float(np.std(rets, ddof=1)) * math.sqrt(252) if len(rets) > 1 else 0.0
        cum_ret = ((math.prod([1.0 + r / 100.0 for r in rets]) - 1.0) * 100.0) if rets else 0.0
        return {
            "observations": count,
            "percentage_of_period": round((count / n_valid * 100.0), 2) if n_valid > 0 else 0.0,
            "average_daily_return_pct": sanitize_float(avg_ret, 3),
            "annualized_volatility_pct": sanitize_float(vol, 2),
            "cumulative_return_pct": sanitize_float(cum_ret, 2)
        }

    return_regimes = ["Bull", "Neutral", "Bear"]
    vol_regimes = ["High Volatility", "Low Volatility"]
    combined_regimes = [
        "Bull + High Volatility", "Bull + Low Volatility",
        "Neutral + High Volatility", "Neutral + Low Volatility",
        "Bear + High Volatility", "Bear + Low Volatility"
    ]

    regime_breakdown = {
        "return_regimes": {
            r: aggregate_regime_stats([p for p in valid_pts if p["return_regime"] == r])
            for r in return_regimes
        },
        "volatility_regimes": {
            v: aggregate_regime_stats([p for p in valid_pts if p["volatility_regime"] == v])
            for v in vol_regimes
        },
        "combined_regimes": {
            c: aggregate_regime_stats([p for p in valid_pts if p["combined_regime"] == c])
            for c in combined_regimes
        }
    }

    # 6. Optional Part C: Strategy Performance by Regime
    strategy_regime_breakdown = None
    if strategy:
        try:
            strat_req = BacktestRequest(
                asset=asset_id,
                strategy=strategy,
                start_date=start_date,
                end_date=end_date,
                initial_capital=100000.0,
                transaction_cost_pct=0.10,
                position_size_pct=100.0,
                parameters=strategy_parameters or {}
            )
            backtest_res = run_backtest_simulation(strat_req)
            eq_map = {pt.date: pt for pt in backtest_res.equity_curve}

            # Map strategy equity daily returns to market regimes
            strat_by_regime = {}
            for r_category, r_names in [("return_regimes", return_regimes), ("volatility_regimes", vol_regimes)]:
                strat_by_regime[r_category] = {}
                for r_name in r_names:
                    matching_eq = []
                    for p in valid_pts:
                        k = p["return_regime"] if r_category == "return_regimes" else p["volatility_regime"]
                        if k == r_name and p["date"] in eq_map:
                            eq_pt = eq_map[p["date"]]
                            if eq_pt.daily_return is not None:
                                matching_eq.append(eq_pt.daily_return)

                    obs_count = len(matching_eq)
                    avg_d = float(np.mean(matching_eq)) if matching_eq else 0.0
                    vol_ann = float(np.std(matching_eq, ddof=1)) * math.sqrt(252) if len(matching_eq) > 1 else 0.0
                    cum_r = ((math.prod([1.0 + r / 100.0 for r in matching_eq]) - 1.0) * 100.0) if matching_eq else 0.0

                    strat_by_regime[r_category][r_name] = {
                        "observations": obs_count,
                        "average_daily_return_pct": sanitize_float(avg_d, 3),
                        "annualized_volatility_pct": sanitize_float(vol_ann, 2),
                        "cumulative_strategy_return_pct": sanitize_float(cum_r, 2)
                    }

            strategy_regime_breakdown = {
                "strategy": strategy,
                "strategy_total_return_pct": backtest_res.performance.total_return_pct,
                "breakdown": strat_by_regime,
                "methodology_note": "Evaluated strictly post-backtest based on daily mark-to-market strategy returns during each identified market regime. No future regime information used in trading signals."
            }
        except Exception:
            strategy_regime_breakdown = None

    return {
        "asset": asset_info,
        "methodology": {
            "description": METHODOLOGY_DOC,
            "return_window": return_window,
            "volatility_window": volatility_window,
            "positive_return_threshold_pct": positive_return_threshold,
            "negative_return_threshold_pct": negative_return_threshold,
            "volatility_threshold_pct": volatility_threshold,
            "warmup_sessions": warmup_period
        },
        "summary": {
            "total_bars": n_bars,
            "warmup_bars": warmup_period,
            "evaluated_bars": n_valid,
            "regimes": regime_breakdown
        },
        "strategy_performance_by_regime": strategy_regime_breakdown,
        "series": series_data
    }
