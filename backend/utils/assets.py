"""
Centralized asset configuration for QUANTEXA.
Defines supported tickers, names, categories, and helper lookup methods.
"""

from typing import Dict, List, Optional

ASSETS: Dict[str, Dict[str, str]] = {
    "gold": {
        "id": "gold",
        "name": "Gold Futures",
        "symbol": "GC=F",
        "category": "Commodity / Safe Haven",
        "currency": "USD"
    },
    "bitcoin": {
        "id": "bitcoin",
        "name": "Bitcoin",
        "symbol": "BTC-USD",
        "category": "Digital Asset / Crypto",
        "currency": "USD"
    },
    "nvidia": {
        "id": "nvidia",
        "name": "NVIDIA Corporation",
        "symbol": "NVDA",
        "category": "Equities / Tech AI",
        "currency": "USD"
    }
}

def get_asset(asset_id: str) -> Optional[Dict[str, str]]:
    """Look up an asset by its unique identifier (case-insensitive)."""
    if not asset_id:
        return None
    return ASSETS.get(asset_id.strip().lower())

def is_valid_asset(asset_id: str) -> bool:
    """Check if an asset identifier is supported."""
    if not asset_id:
        return False
    return asset_id.strip().lower() in ASSETS

def get_all_assets() -> List[Dict[str, str]]:
    """Return a list of all registered assets."""
    return list(ASSETS.values())
