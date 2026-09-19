"""
Historical Market Data Service for QUANTEXA.
Fetches, cleans, normalizes, and caches OHLCV data from Yahoo Finance via yfinance.
"""

import time
from datetime import datetime, date
from typing import Dict, Any, List, Optional, Tuple
import requests
import pandas as pd
import numpy as np
import yfinance as yf

from backend.utils.assets import get_asset, is_valid_asset

# Custom HTTP session with realistic User-Agent to prevent 429 / blocking from Yahoo Finance
_SESSION = requests.Session()
_SESSION.headers.update({
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept": "application/json,text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
})

# In-memory cache: key -> (cached_timestamp, response_data)
# TTL = 900 seconds (15 minutes)
_CACHE: Dict[str, Tuple[float, Dict[str, Any]]] = {}
CACHE_TTL_SECONDS = 900


class MarketDataError(Exception):
    """Base exception for market data errors."""
    def __init__(self, message: str, status_code: int = 400):
        super().__init__(message)
        self.message = message
        self.status_code = status_code


def validate_date_format(date_str: str, field_name: str) -> date:
    """Validate ISO date string YYYY-MM-DD."""
    try:
        parsed = datetime.strptime(date_str, "%Y-%m-%d").date()
        return parsed
    except (ValueError, TypeError):
        raise MarketDataError(
            f"Invalid {field_name} format: '{date_str}'. Expected ISO format 'YYYY-MM-DD'.",
            status_code=400
        )


def get_historical_market_data(
    asset_id: str,
    start_date: str,
    end_date: str,
    use_cache: bool = True
) -> Dict[str, Any]:
    """
    Fetches, cleans, and normalizes historical OHLCV data for the given asset and date range.
    
    Args:
        asset_id: One of 'gold', 'bitcoin', 'nvidia'
        start_date: 'YYYY-MM-DD'
        end_date: 'YYYY-MM-DD'
        use_cache: Whether to check and write to the in-memory cache
        
    Returns:
        Structured dictionary with asset details, date range, count, and normalized data records.
    """
    # 1. Validate Asset
    asset_info = get_asset(asset_id)
    if not asset_info:
        raise MarketDataError(
            f"Unsupported asset '{asset_id}'. Valid assets: 'gold', 'bitcoin', 'nvidia'.",
            status_code=400
        )
    
    # 2. Validate Dates
    start_dt = validate_date_format(start_date, "start_date")
    end_dt = validate_date_format(end_date, "end_date")
    
    if start_dt >= end_dt:
        raise MarketDataError(
            f"start_date ({start_date}) must be strictly before end_date ({end_date}).",
            status_code=400
        )
        
    if start_dt < date(2000, 1, 1):
        raise MarketDataError(
            "start_date cannot be earlier than 2000-01-01.",
            status_code=400
        )
        
    today = date.today()
    if start_dt > today:
        raise MarketDataError(
            f"start_date ({start_date}) cannot be in the future.",
            status_code=400
        )

    # 3. Check In-Memory Cache
    cache_key = f"{asset_info['id']}:{start_date}:{end_date}"
    now = time.time()
    if use_cache and cache_key in _CACHE:
        cached_time, cached_payload = _CACHE[cache_key]
        if now - cached_time < CACHE_TTL_SECONDS:
            return cached_payload

    # 4. Fetch from Yahoo Finance
    symbol = asset_info["symbol"]
    try:
        ticker = yf.Ticker(symbol, session=_SESSION)
        # Fetch data with start and end (inclusive/exclusive handled by yfinance)
        df: pd.DataFrame = ticker.history(
            start=start_date,
            end=end_date,
            auto_adjust=False,
            actions=False,
            raise_errors=True
        )
    except Exception as exc:
        raise MarketDataError(
            f"Upstream provider error fetching data for {symbol}: {str(exc)}",
            status_code=502
        )

    if df is None or df.empty:
        raise MarketDataError(
            f"No historical market data found for {asset_info['name']} ({symbol}) between {start_date} and {end_date}.",
            status_code=404
        )

    # 5. Data Normalization & Quality Assurance
    try:
        # Normalize index to timezone-naive datetime
        if hasattr(df.index, "tz") and df.index.tz is not None:
            df.index = df.index.tz_convert(None)
        
        # Ensure index has proper date formatting
        df["date_str"] = df.index.strftime("%Y-%m-%d")
        
        # Deduplicate on date, keeping the latest record
        df = df.drop_duplicates(subset=["date_str"], keep="last")
        
        # Sort chronologically ascending
        df = df.sort_index(ascending=True)

        # Ensure required columns exist
        required_cols = ["Open", "High", "Low", "Close"]
        for col in required_cols:
            if col not in df.columns:
                raise MarketDataError(
                    f"Missing expected price column '{col}' in provider data.",
                    status_code=502
                )

        # Drop any row where core price fields are null or NaN
        df = df.dropna(subset=required_cols)
        
        if "Volume" not in df.columns:
            df["Volume"] = 0
        else:
            df["Volume"] = df["Volume"].fillna(0)

        # Build clean JSON-safe records
        records: List[Dict[str, Any]] = []
        for _, row in df.iterrows():
            # Guarantee numeric safety (no NaN / inf / numpy types in JSON output)
            open_val = float(round(row["Open"], 4)) if pd.notna(row["Open"]) else 0.0
            high_val = float(round(row["High"], 4)) if pd.notna(row["High"]) else 0.0
            low_val = float(round(row["Low"], 4)) if pd.notna(row["Low"]) else 0.0
            close_val = float(round(row["Close"], 4)) if pd.notna(row["Close"]) else 0.0
            volume_val = int(row["Volume"]) if pd.notna(row["Volume"]) else 0

            records.append({
                "date": str(row["date_str"]),
                "open": open_val,
                "high": high_val,
                "low": low_val,
                "close": close_val,
                "volume": volume_val
            })

        if not records:
            raise MarketDataError(
                f"No valid price records remained after cleaning for {asset_info['name']} between {start_date} and {end_date}.",
                status_code=404
            )

        payload = {
            "asset": asset_info,
            "start_date": start_date,
            "end_date": end_date,
            "count": len(records),
            "data": records
        }

        # Save to Cache
        if use_cache:
            _CACHE[cache_key] = (now, payload)

        return payload

    except MarketDataError:
        raise
    except Exception as exc:
        raise MarketDataError(
            f"Failed to process and normalize market data: {str(exc)}",
            status_code=500
        )
