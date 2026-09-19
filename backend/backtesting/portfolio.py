"""
Portfolio simulation engine for QUANTEXA.
Handles cash, positions, trade execution at Open[t+1], transaction fees,
daily mark-to-market equity curve, and end-of-horizon liquidation.
"""

from typing import List, Dict, Any, Optional, Tuple
import pandas as pd
import numpy as np

from backend.backtesting.models import TradeRecord, EquityPoint
from backend.analytics.engine import sanitize_float


class PortfolioSimulator:
    """
    Simulates portfolio cash, holdings, and execution state chronologically.
    Strictly follows Next-Session Open Execution:
    - Signal calculated using Close[t]
    - Order filled at Open[t+1]
    """

    def __init__(
        self,
        initial_capital: float,
        transaction_cost_pct: float,
        position_size_pct: float
    ):
        self.initial_capital = float(initial_capital)
        self.cash = float(initial_capital)
        self.position_qty = 0.0
        self.transaction_cost_pct = float(transaction_cost_pct)
        self.cost_rate = self.transaction_cost_pct / 100.0
        self.position_size_pct = float(position_size_pct)
        self.size_rate = self.position_size_pct / 100.0

        self.running_peak = self.initial_capital
        self.total_transaction_costs = 0.0
        self.trades: List[TradeRecord] = []
        self.equity_curve: List[EquityPoint] = []
        self.trade_counter = 0

        # Open trade tracking
        self.open_trade: Optional[Dict[str, Any]] = None

    def execute_simulation(
        self,
        df: pd.DataFrame,
        signals: List[int],
        strategy_name: str
    ) -> Tuple[List[TradeRecord], List[EquityPoint]]:
        """
        Runs the day-by-day execution loop across the historical OHLCV series.
        df must contain 'date', 'open', 'close', 'high', 'low'.
        """
        n = len(df)
        pending_signal = 0  # Signal from day t to execute at day t+1

        for t in range(n):
            current_date = str(df["date"].iloc[t])
            open_price = float(df["open"].iloc[t])
            close_price = float(df["close"].iloc[t])

            # 1. Execute any pending signal from previous session (t-1) at today's Open
            if pending_signal == 1 and self.position_qty == 0.0:
                # Execute BUY at Open[t]
                allocated_cash = self.cash * self.size_rate
                if allocated_cash > 0 and open_price > 0:
                    # Quantity accounts for the buy transaction fee to avoid cash overdraft
                    # Outlay = Q * Open * (1 + c) <= Allocated Cash
                    qty = allocated_cash / (open_price * (1.0 + self.cost_rate))
                    trade_value = qty * open_price
                    fee = trade_value * self.cost_rate

                    self.position_qty = qty
                    self.cash = max(0.0, self.cash - (trade_value + fee))
                    self.total_transaction_costs += fee

                    self.open_trade = {
                        "entry_date": current_date,
                        "entry_price": open_price,
                        "quantity": qty,
                        "buy_fee": fee,
                        "buy_value": trade_value,
                        "entry_idx": t,
                        "entry_reason": f"{strategy_name} Entry Signal"
                    }

            elif pending_signal == -1 and self.position_qty > 0.0:
                # Execute SELL / EXIT at Open[t]
                sell_value = self.position_qty * open_price
                fee = sell_value * self.cost_rate
                self.cash += (sell_value - fee)
                self.total_transaction_costs += fee

                # Reconcile completed trade
                if self.open_trade:
                    self.trade_counter += 1
                    buy_fee = self.open_trade["buy_fee"]
                    buy_val = self.open_trade["buy_value"]
                    total_fee = buy_fee + fee
                    gross_pnl = sell_value - buy_val
                    net_pnl = gross_pnl - total_fee
                    total_outlay = buy_val + buy_fee
                    ret_pct = (net_pnl / total_outlay * 100.0) if total_outlay > 0 else 0.0
                    holding_days = t - self.open_trade["entry_idx"]

                    self.trades.append(TradeRecord(
                        trade_id=self.trade_counter,
                        entry_date=self.open_trade["entry_date"],
                        entry_price=round(self.open_trade["entry_price"], 4),
                        exit_date=current_date,
                        exit_price=round(open_price, 4),
                        quantity=round(self.position_qty, 6),
                        gross_pnl=round(gross_pnl, 2),
                        transaction_cost=round(total_fee, 2),
                        net_pnl=round(net_pnl, 2),
                        return_pct=round(ret_pct, 4),
                        entry_reason=self.open_trade["entry_reason"],
                        exit_reason=f"{strategy_name} Exit Signal",
                        holding_period_days=max(1, holding_days)
                    ))
                    self.open_trade = None

                self.position_qty = 0.0

            # 2. Mark-to-market valuation at session Close
            position_val = self.position_qty * close_price
            portfolio_val = self.cash + position_val

            self.running_peak = max(self.running_peak, portfolio_val)
            drawdown = ((portfolio_val - self.running_peak) / self.running_peak * 100.0) if self.running_peak > 0 else 0.0

            prev_port_val = self.equity_curve[-1].portfolio_value if self.equity_curve else self.initial_capital
            daily_ret = ((portfolio_val - prev_port_val) / prev_port_val * 100.0) if prev_port_val > 0 else 0.0
            cum_ret = ((portfolio_val - self.initial_capital) / self.initial_capital * 100.0) if self.initial_capital > 0 else 0.0

            self.equity_curve.append(EquityPoint(
                date=current_date,
                cash=round(self.cash, 2),
                position_quantity=round(self.position_qty, 6),
                position_value=round(position_val, 2),
                portfolio_value=round(portfolio_val, 2),
                daily_return=round(daily_ret, 4) if t > 0 else 0.0,
                cumulative_return=round(cum_ret, 4),
                drawdown=round(drawdown, 4)
            ))

            # 3. Store today's generated signal to execute at next session's Open
            pending_signal = signals[t]

        # 4. Explicit End-of-Horizon Liquidation if position remains open
        if self.position_qty > 0.0 and self.open_trade is not None:
            last_idx = n - 1
            last_date = str(df["date"].iloc[last_idx])
            last_close = float(df["close"].iloc[last_idx])

            sell_value = self.position_qty * last_close
            fee = sell_value * self.cost_rate
            self.cash += (sell_value - fee)
            self.total_transaction_costs += fee

            self.trade_counter += 1
            buy_fee = self.open_trade["buy_fee"]
            buy_val = self.open_trade["buy_value"]
            total_fee = buy_fee + fee
            gross_pnl = sell_value - buy_val
            net_pnl = gross_pnl - total_fee
            total_outlay = buy_val + buy_fee
            ret_pct = (net_pnl / total_outlay * 100.0) if total_outlay > 0 else 0.0
            holding_days = last_idx - self.open_trade["entry_idx"]

            self.trades.append(TradeRecord(
                trade_id=self.trade_counter,
                entry_date=self.open_trade["entry_date"],
                entry_price=round(self.open_trade["entry_price"], 4),
                exit_date=last_date,
                exit_price=round(last_close, 4),
                quantity=round(self.position_qty, 6),
                gross_pnl=round(gross_pnl, 2),
                transaction_cost=round(total_fee, 2),
                net_pnl=round(net_pnl, 2),
                return_pct=round(ret_pct, 4),
                entry_reason=self.open_trade["entry_reason"],
                exit_reason="End of Horizon Liquidation",
                holding_period_days=max(1, holding_days)
            ))
            self.open_trade = None
            self.position_qty = 0.0

            # Update final equity point to match liquidated cash
            final_port_val = round(self.cash, 2)
            self.equity_curve[-1].cash = final_port_val
            self.equity_curve[-1].position_quantity = 0.0
            self.equity_curve[-1].position_value = 0.0
            self.equity_curve[-1].portfolio_value = final_port_val
            cum_ret = ((final_port_val - self.initial_capital) / self.initial_capital * 100.0)
            self.equity_curve[-1].cumulative_return = round(cum_ret, 4)

            self.running_peak = max(self.running_peak, final_port_val)
            self.equity_curve[-1].drawdown = round(
                ((final_port_val - self.running_peak) / self.running_peak * 100.0), 4
            ) if self.running_peak > 0 else 0.0

            prev_val = self.equity_curve[-2].portfolio_value if len(self.equity_curve) > 1 else self.initial_capital
            self.equity_curve[-1].daily_return = round(
                ((final_port_val - prev_val) / prev_val * 100.0), 4
            ) if prev_val > 0 else 0.0

        return self.trades, self.equity_curve
