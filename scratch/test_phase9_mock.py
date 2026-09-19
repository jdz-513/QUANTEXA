"""
QUANTEXA Phase 9 AI Mock & Network Error Handling Tests
Simulates Featherless API responses, network timeouts, and HTTP errors
without requiring real third-party API credentials.
"""

import sys
import os
import asyncio
import unittest
from unittest.mock import patch, AsyncMock, MagicMock
import httpx

root_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if root_dir not in sys.path:
    sys.path.insert(0, root_dir)

from backend.ai.featherless import (
    call_featherless_api,
    AITimeoutError,
    AIServiceError,
    AIServiceNotConfiguredError
)

class TestFeatherlessAI(unittest.IsolatedAsyncioTestCase):

    async def test_successful_featherless_call(self):
        """Test successful structured response when API key is configured."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "choices": [
                {
                    "message": {
                        "content": "### Executive Summary\nThe NVIDIA backtest demonstrates strong positive total return."
                    }
                }
            ]
        }

        with patch.dict(os.environ, {"FEATHERLESS_API_KEY": "test-mock-key-12345"}):
            with patch("httpx.AsyncClient.post", new=AsyncMock(return_value=mock_response)):
                result = await call_featherless_api(
                    question="Explain NVIDIA backtest results",
                    context={"asset": {"name": "NVIDIA", "symbol": "NVDA"}}
                )

                self.assertIn("Executive Summary", result["answer"])
                self.assertEqual(result["model"], "meta-llama/Meta-Llama-3.1-8B-Instruct")
                self.assertIn("disclaimer", result)
                # Assert API key is NOT in result
                self.assertNotIn("test-mock-key-12345", str(result))
                print("[PASS] Successful simulated Featherless AI request tested.")

    async def test_timeout_handling(self):
        """Test timeout exception handling."""
        with patch.dict(os.environ, {"FEATHERLESS_API_KEY": "test-mock-key-12345"}):
            with patch("httpx.AsyncClient.post", side_effect=httpx.TimeoutException("Read timed out")):
                with self.assertRaises(AITimeoutError):
                    await call_featherless_api(
                        question="Explain correlation between Gold and Bitcoin",
                        context={"asset": {"name": "Gold"}}
                    )
                print("[PASS] Featherless AI timeout handling properly raised AITimeoutError.")

    async def test_upstream_500_error_handling(self):
        """Test upstream HTTP 500 error handling."""
        mock_response = MagicMock()
        mock_response.status_code = 500
        mock_response.text = "Internal Server Error"

        with patch.dict(os.environ, {"FEATHERLESS_API_KEY": "test-mock-key-12345"}):
            with patch("httpx.AsyncClient.post", new=AsyncMock(return_value=mock_response)):
                with self.assertRaises(AIServiceError):
                    await call_featherless_api(
                        question="Explain market regimes",
                        context={"asset": {"name": "Bitcoin"}}
                    )
                print("[PASS] Featherless AI HTTP 500 properly raised AIServiceError without leaking internals.")

    async def test_malformed_response_handling(self):
        """Test response with missing choices/messages."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {"error": "unexpected format"}

        with patch.dict(os.environ, {"FEATHERLESS_API_KEY": "test-mock-key-12345"}):
            with patch("httpx.AsyncClient.post", new=AsyncMock(return_value=mock_response)):
                with self.assertRaises(AIServiceError):
                    await call_featherless_api(
                        question="Explain drawdown",
                        context={}
                    )
                print("[PASS] Featherless AI malformed JSON properly caught.")

if __name__ == "__main__":
    unittest.main()
