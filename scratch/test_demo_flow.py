"""
QUANTEXA Final Demo Flow Test
Simulates a real hackathon judge flow step-by-step:
1. Open application (Health check)
2. View dashboard (Supported assets)
3. Select NVIDIA (Market data)
4. Inspect historical metrics (Analytics)
5. Open correlation (Correlation matrix & pair)
6. Run SMA backtest (Backtest simulation)
7. Compare against Buy & Hold (Benchmark metrics)
8. Open Robustness & Regimes (Regimes endpoint)
9. Run parameter sensitivity (Robustness sweep)
10. Inspect market regimes (Regime distribution)
11. Open AI Research (AI Status)
12. Ask: 'Explain the NVIDIA backtest and compare it with the benchmark.'
13. Receive AI explanation (Live Featherless AI response)
"""

import sys
import os
import json
from fastapi.testclient import TestClient

root_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if root_dir not in sys.path:
    sys.path.insert(0, root_dir)

from backend.main import app

client = TestClient(app)

def test_demo_flow():
    print("=" * 70)
    print("SIMULATING COMPLETE HACKATHON JUDGE DEMO FLOW (STEPS 1-13)")
    print("=" * 70)

    # Step 1: Open application / Health
    h = client.get("/api/health")
    assert h.status_code == 200
    print("[STEP 1] Open application / Health: 200 OK")

    # Step 2: View catalogue / assets
    assets = client.get("/api/assets").json()
    assert len(assets) == 3
    print(f"[STEP 2] Assets catalogue loaded: {[a['name'] for a in assets]}")

    # Step 3: Select NVIDIA
    nvda_data = client.get("/api/market-data?asset=nvidia&start_date=2024-01-01&end_date=2025-01-01").json()
    assert len(nvda_data["data"]) > 200
    print(f"[STEP 3] NVIDIA Market Data loaded: {len(nvda_data['data'])} trading bars")

    # Step 4: Inspect historical metrics
    nvda_an = client.get("/api/analytics?asset=nvidia&start_date=2024-01-01&end_date=2025-01-01").json()
    s = nvda_an["summary"]
    print(f"[STEP 4] NVIDIA Metrics: Return={s['total_return_pct']:.2f}%, Vol={s['annualized_volatility_pct']:.2f}%, Sharpe={s['sharpe_ratio']:.2f}, MaxDD={s['max_drawdown_pct']:.2f}%")

    # Step 5: Open correlation
    corr_mat = client.get("/api/correlation-matrix?start_date=2024-01-01&end_date=2025-01-01").json()
    print(f"[STEP 5] Cross-Asset Correlation Matrix: NVDA-Gold={corr_mat['matrix']['nvidia']['gold']:.2f}, NVDA-BTC={corr_mat['matrix']['nvidia']['bitcoin']:.2f}")

    # Step 6: Run SMA backtest
    bt_res = client.post("/api/backtest", json={
        "asset": "nvidia", "strategy": "sma_crossover", "start_date": "2024-01-01", "end_date": "2025-01-01",
        "initial_capital": 100000, "transaction_cost_pct": 0.10, "position_size_pct": 100,
        "parameters": {"fast_period": 20, "slow_period": 50}
    }).json()
    perf = bt_res["performance"]
    print(f"[STEP 6] SMA Backtest executed: Trades={perf['total_trades']}, Return={perf['total_return_pct']:.2f}%, WinRate={perf['win_rate_pct']:.1f}%")

    # Step 7: Compare against Buy & Hold
    bm = bt_res["benchmark_performance"]
    alpha = perf["total_return_pct"] - bm["total_return_pct"]
    print(f"[STEP 7] Buy & Hold Benchmark Comparison: Benchmark Return={bm['total_return_pct']:.2f}%, Strategy Alpha={alpha:.2f}%")

    # Step 8: Open Robustness & Regimes
    reg_res = client.get("/api/market-regimes?asset=nvidia&start_date=2024-01-01&end_date=2025-01-01").json()
    print(f"[STEP 8] Market Regimes loaded: {reg_res['summary']['evaluated_bars']} evaluated sessions")

    # Step 9: Run parameter sensitivity
    rob_res = client.post("/api/backtest/robustness", json={
        "asset": "nvidia", "strategy": "sma_crossover", "start_date": "2024-01-01", "end_date": "2025-01-01",
        "initial_capital": 100000, "transaction_cost_pct": 0.10, "position_size_pct": 100,
        "parameter_grid": {"fast_periods": [10, 20], "slow_periods": [40, 50]}
    }).json()
    rob_sum = rob_res["summary"]
    print(f"[STEP 9] Robustness Sensitivity: Valid Combinations={rob_sum['valid_combinations']}, Median Sharpe={rob_sum['median_sharpe']}, Stability={rob_sum['parameter_stability_pct']}%")

    # Step 10: Inspect market regimes
    dist = reg_res["summary"]["regimes"]["return_regimes"]
    print(f"[STEP 10] Regime Distribution: Bull={dist['Bull']['percentage_of_period']}%, Neutral={dist['Neutral']['percentage_of_period']}%, Bear={dist['Bear']['percentage_of_period']}%")

    # Step 11: Open AI Research
    ai_stat = client.get("/api/ai/status").json()
    assert ai_stat["configured"] is True
    print(f"[STEP 11] AI Research ready: Model={ai_stat['model']}")

    # Step 12: Ask explanation query
    judge_q = "Explain the NVIDIA backtest and compare it with the benchmark."
    ai_res = client.post("/api/ai/research", json={
        "question": judge_q,
        "context": {
            "asset": {"id": "nvidia", "name": "NVIDIA", "symbol": "NVDA"},
            "period": "2024-01-01 to 2025-01-01",
            "analytics": nvda_an,
            "backtest": bt_res,
            "benchmark": bm,
            "robustness": rob_res,
            "regimes": reg_res
        }
    })
    assert ai_res.status_code == 200
    ai_ans = ai_res.json()

    # Step 13: Receive explanation
    assert len(ai_ans["answer"]) > 200
    print(f"[STEP 12-13] Received AI Explanation ({len(ai_ans['answer'])} chars):\n")
    print(ai_ans["answer"][:400] + "...\n")
    print("=" * 70)
    print("DEMO FLOW VERIFIED 100% COMPLETE & OPERATIONAL!")
    print("=" * 70)

if __name__ == "__main__":
    test_demo_flow()
