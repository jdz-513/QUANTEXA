import React, { useState, useEffect, useCallback } from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine
} from 'recharts';
import {
  Play,
  TrendingUp,
  ShieldAlert,
  Activity,
  Award,
  Layers,
  Calendar,
  Percent,
  RefreshCw,
  Sliders,
  CheckCircle2,
  AlertTriangle,
  FileText,
  Info,
  HelpCircle
} from 'lucide-react';
import { runBacktest } from '../services/api';
import { ASSETS, PRESETS } from './AssetBar';
import PerformanceRiskSummary from './PerformanceRiskSummary';
import GlobalAnalysisControls from './GlobalAnalysisControls';

const STRATEGIES = [
  {
    id: 'sma_crossover',
    name: 'SMA Crossover',
    tagline: 'Moving Average Trend Following',
    description: 'Long when Fast SMA crosses above Slow SMA; Exits on reverse cross.'
  },
  {
    id: 'ema_trend',
    name: 'EMA Trend',
    tagline: 'Exponential Moving Average Filter',
    description: 'Long when Fast EMA crosses above Slow EMA; Exits on reverse cross.'
  },
  {
    id: 'momentum',
    name: 'Momentum',
    tagline: 'Rate-of-Change Breakout',
    description: 'Long when Close[t] > Close[t - Lookback]; Exits when price falls below historical level.'
  },
  {
    id: 'mean_reversion',
    name: 'Mean Reversion',
    tagline: 'Statistical Band Dip-Buyer',
    description: 'Long when price dips below SMA by threshold %; Exits when price mean-reverts back to SMA.'
  }
];

const formatPercent = (val) => {
  if (val === null || val === undefined || isNaN(val)) return '--';
  const sign = Number(val) > 0 ? '+' : '';
  return `${sign}${Number(val).toFixed(2)}%`;
};

const formatCurrency = (val) => {
  if (val === null || val === undefined || isNaN(val)) return '--';
  return `$${Number(val).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const CustomEquityTooltip = ({ active, payload }) => {
  if (active && payload && payload.length) {
    const d = payload[0].payload;
    const stratVal = d.portfolio_value;
    const bmVal = d.benchmark_value;
    const stratRet = d.cumulative_return;
    const bmRet = d.benchmark_return;
    const dd = d.drawdown;
    const cash = d.cash;

    return (
      <div style={{
        background: '#ffffff',
        border: '1px solid #e2e8f0',
        borderRadius: '6px',
        padding: '0.75rem 1rem',
        boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1), 0 8px 10px -6px rgba(0,0,0,0.05)',
        fontSize: '0.75rem',
        fontFamily: 'var(--font-mono)',
        color: '#0f172a',
      }}>
        <div style={{ fontWeight: 600, color: 'var(--color-blue)', marginBottom: '0.4rem', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.25rem' }}>
          {d.date}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'auto auto', gap: '0.25rem 0.75rem' }}>
          <span style={{ color: 'var(--text-muted)' }}>Strategy Equity:</span>
          <span style={{ fontWeight: 700, color: 'var(--color-blue)' }}>{formatCurrency(stratVal)}</span>

          <span style={{ color: 'var(--text-muted)' }}>Strategy Return:</span>
          <span style={{ fontWeight: 600, color: stratRet >= 0 ? 'var(--color-green)' : 'var(--color-red)' }}>
            {formatPercent(stratRet)}
          </span>

          {bmVal !== undefined && bmVal !== null && (
            <>
              <span style={{ color: 'var(--text-muted)' }}>Benchmark (B&amp;H):</span>
              <span style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>{formatCurrency(bmVal)}</span>

              <span style={{ color: 'var(--text-muted)' }}>Benchmark Return:</span>
              <span style={{ color: bmRet >= 0 ? 'var(--color-green)' : 'var(--color-red)' }}>
                {formatPercent(bmRet)}
              </span>
            </>
          )}

          <span style={{ color: 'var(--text-muted)' }}>Drawdown:</span>
          <span style={{ color: 'var(--color-red)' }}>{formatPercent(dd)}</span>

          <span style={{ color: 'var(--text-muted)' }}>Unallocated Cash:</span>
          <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{formatCurrency(cash)}</span>
        </div>
      </div>
    );
  }
  return null;
};

const CustomDrawdownTooltip = ({ active, payload }) => {
  if (active && payload && payload.length) {
    const d = payload[0].payload;
    return (
      <div style={{
        background: '#ffffff',
        border: '1px solid #fecaca',
        borderRadius: '6px',
        padding: '0.5rem 0.85rem',
        boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1), 0 8px 10px -6px rgba(0,0,0,0.05)',
        fontSize: '0.75rem',
        fontFamily: 'var(--font-mono)',
        color: '#0f172a',
      }}>
        <div style={{ color: 'var(--text-muted)', marginBottom: '0.25rem' }}>{d.date}</div>
        <div style={{ color: 'var(--color-red)', fontWeight: 700, fontSize: '0.9rem' }}>
          Drawdown: {formatPercent(d.drawdown)}
        </div>
        <div style={{ color: 'var(--text-secondary)', fontSize: '0.7rem' }}>
          Portfolio Value: {formatCurrency(d.portfolio_value)}
        </div>
      </div>
    );
  }
  return null;
};

export default function BacktestLab({
  selectedAsset: propSelectedAsset,
  onSelectAsset: propOnSelectAsset,
  datePreset: propDatePreset,
  onSelectPreset: propOnSelectPreset,
  startDate: propStartDate,
  endDate: propEndDate,
  onStartDateChange: propOnStartDateChange,
  onEndDateChange: propOnEndDateChange,
  selectedStrategy: propSelectedStrategy,
  onSelectStrategy: propOnSelectStrategy,
  initialAsset,
  initialStartDate,
  initialEndDate,
  initialPreset,
  initialStrategy,
  analyticsData,
  isLoadingAnalytics,
  analyticsError
}) {
  const [internalAsset, setInternalAsset] = useState(initialAsset || ASSETS[0]);
  const selectedAsset = propSelectedAsset || internalAsset;
  const onSelectAsset = propOnSelectAsset || setInternalAsset;

  const [internalStrategy, setInternalStrategy] = useState(initialStrategy || STRATEGIES[0].id);
  const selectedStrategy = propSelectedStrategy || internalStrategy;
  const setSelectedStrategy = (stratId) => {
    setInternalStrategy(stratId);
    if (propOnSelectStrategy) propOnSelectStrategy(stratId);
  };

  // Active definition tooltip for Backtest KPIs
  const [activeKpiTooltip, setActiveKpiTooltip] = useState(null);

  // Strategy parameters
  const [fastPeriod, setFastPeriod] = useState(20);
  const [slowPeriod, setSlowPeriod] = useState(50);
  const [lookbackDays, setLookbackDays] = useState(20);
  const [smaPeriodMR, setSmaPeriodMR] = useState(20);
  const [thresholdPct, setThresholdPct] = useState(2.0);

  // Portfolio settings
  const [initialCapital, setInitialCapital] = useState(100000);
  const [transactionCostPct, setTransactionCostPct] = useState(0.10);
  const [positionSizePct, setPositionSizePct] = useState(100.0);

  // Horizon
  const [internalPreset, setInternalPreset] = useState(initialPreset || '1Y');
  const datePreset = propDatePreset || internalPreset;

  const [internalStartDate, setInternalStartDate] = useState(initialStartDate || (() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 1);
    return d.toISOString().split('T')[0];
  })());
  const startDate = propStartDate || internalStartDate;
  const setStartDate = propOnStartDateChange || setInternalStartDate;

  const [internalEndDate, setInternalEndDate] = useState(initialEndDate || new Date().toISOString().split('T')[0]);
  const endDate = propEndDate || internalEndDate;
  const setEndDate = propOnEndDateChange || setInternalEndDate;

  // Execution & Output State
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState(null);
  const [backtestData, setBacktestData] = useState(null);
  const [activeResultTab, setActiveResultTab] = useState('equity'); // 'equity' | 'drawdown' | 'trades'
  const [tradePage, setTradePage] = useState(1);
  const tradesPerPage = 10;

  const handleSelectPreset = (preset) => {
    if (propOnSelectPreset) {
      propOnSelectPreset(preset);
      return;
    }
    setInternalPreset(preset);
    const end = new Date();
    let start = new Date();
    if (preset === '1Y') {
      start.setFullYear(end.getFullYear() - 1);
    } else if (preset === '2Y') {
      start.setFullYear(end.getFullYear() - 2);
    } else if (preset === '5Y') {
      start.setFullYear(end.getFullYear() - 5);
    } else if (preset === 'MAX') {
      start = new Date('2015-01-01');
    }
    setInternalStartDate(start.toISOString().split('T')[0]);
    setInternalEndDate(end.toISOString().split('T')[0]);
  };

  // Build parameters payload based on active strategy
  const getStrategyParams = () => {
    if (selectedStrategy === 'sma_crossover' || selectedStrategy === 'ema_trend') {
      return {
        fast_period: Number(fastPeriod),
        slow_period: Number(slowPeriod)
      };
    } else if (selectedStrategy === 'momentum') {
      return {
        lookback_days: Number(lookbackDays)
      };
    } else if (selectedStrategy === 'mean_reversion') {
      return {
        sma_period: Number(smaPeriodMR),
        threshold_pct: Number(thresholdPct)
      };
    }
    return {};
  };

  const handleRunBacktest = useCallback(async () => {
    setIsRunning(true);
    setError(null);

    const payload = {
      asset: selectedAsset.id,
      strategy: selectedStrategy,
      start_date: startDate,
      end_date: endDate,
      initial_capital: Number(initialCapital),
      transaction_cost_pct: Number(transactionCostPct),
      position_size_pct: Number(positionSizePct),
      parameters: getStrategyParams()
    };

    try {
      const result = await runBacktest(payload);
      setBacktestData(result);
      setTradePage(1);
    } catch (err) {
      console.error('Backtest error:', err);
      const detail = err.response?.data?.detail || err.message || 'Backtest simulation failed.';
      setError(typeof detail === 'string' ? detail : JSON.stringify(detail));
    } finally {
      setIsRunning(false);
    }
  }, [
    selectedAsset,
    selectedStrategy,
    startDate,
    endDate,
    initialCapital,
    transactionCostPct,
    positionSizePct,
    fastPeriod,
    slowPeriod,
    lookbackDays,
    smaPeriodMR,
    thresholdPct
  ]);

  // Run automatically on first mount
  useEffect(() => {
    handleRunBacktest();
  }, [handleRunBacktest]);

  const perf = backtestData?.performance;
  const bmPerf = backtestData?.benchmark_performance;
  const trades = backtestData?.trades || [];
  const equityCurve = backtestData?.equity_curve || [];

  const BACKTEST_KPIS = [
    {
      id: 'return',
      label: 'STRATEGY RETURN',
      primaryVal: formatPercent(perf?.total_return_pct),
      color: (perf?.total_return_pct ?? 0) >= 0 ? 'var(--color-green)' : 'var(--color-red)',
      accentColor: (perf?.total_return_pct ?? 0) >= 0 ? '#16A34A' : '#DC2626',
      bgIcon: (perf?.total_return_pct ?? 0) >= 0 ? 'rgba(22, 163, 74, 0.08)' : 'rgba(220, 38, 38, 0.08)',
      icon: TrendingUp,
      tooltip: 'Total cumulative return of the strategy over the evaluation horizon, net of trading fees and transaction costs.',
      subLabel: 'Final Value',
      subVal: formatCurrency(perf?.final_portfolio_value),
      benchLabel: 'B&H Return',
      benchVal: formatPercent(bmPerf?.total_return_pct)
    },
    {
      id: 'cagr',
      label: 'CAGR',
      primaryVal: formatPercent(perf?.cagr_pct),
      color: (perf?.cagr_pct ?? 0) >= 0 ? 'var(--color-green)' : 'var(--color-red)',
      accentColor: (perf?.cagr_pct ?? 0) >= 0 ? '#16A34A' : '#DC2626',
      bgIcon: (perf?.cagr_pct ?? 0) >= 0 ? 'rgba(22, 163, 74, 0.08)' : 'rgba(220, 38, 38, 0.08)',
      icon: Activity,
      tooltip: 'Compound Annual Growth Rate — the geometric annualized rate of return over the evaluated period.',
      subLabel: 'Compounded annual growth',
      subVal: null,
      benchLabel: 'B&H CAGR',
      benchVal: formatPercent(bmPerf?.cagr_pct)
    },
    {
      id: 'sharpe',
      label: 'SHARPE RATIO',
      primaryVal: perf?.sharpe_ratio !== null && perf?.sharpe_ratio !== undefined ? perf.sharpe_ratio.toFixed(2) : '--',
      color: (perf?.sharpe_ratio ?? 0) >= 1.0 ? 'var(--color-green)' : ((perf?.sharpe_ratio ?? 0) >= 0 ? 'var(--color-blue)' : 'var(--color-red)'),
      accentColor: (perf?.sharpe_ratio ?? 0) >= 0 ? '#0891B2' : '#DC2626',
      bgIcon: (perf?.sharpe_ratio ?? 0) >= 0 ? 'rgba(8, 145, 178, 0.08)' : 'rgba(220, 38, 38, 0.08)',
      icon: Award,
      tooltip: 'Risk-adjusted return per unit of volatility, evaluated against a 0% risk-free rate benchmark.',
      subLabel: 'Risk-adjusted performance',
      subVal: null,
      benchLabel: 'B&H Sharpe',
      benchVal: bmPerf?.sharpe_ratio !== null && bmPerf?.sharpe_ratio !== undefined ? bmPerf.sharpe_ratio.toFixed(2) : '--'
    },
    {
      id: 'drawdown',
      label: 'MAX DRAWDOWN',
      primaryVal: formatPercent(perf?.max_drawdown_pct),
      color: 'var(--color-red)',
      accentColor: '#DC2626',
      bgIcon: 'rgba(220, 38, 38, 0.08)',
      icon: ShieldAlert,
      tooltip: 'The maximum peak-to-trough historical decline in strategy equity before reaching a new peak.',
      subLabel: 'Largest historical fall',
      subVal: null,
      benchLabel: 'B&H Max DD',
      benchVal: formatPercent(bmPerf?.max_drawdown_pct)
    },
    {
      id: 'volatility',
      label: 'VOLATILITY',
      primaryVal: formatPercent(perf?.annualized_volatility_pct),
      color: 'var(--color-blue)',
      accentColor: '#2563EB',
      bgIcon: 'rgba(37, 99, 235, 0.08)',
      icon: Activity,
      tooltip: 'Annualized standard deviation of daily strategy returns, measuring investment risk and dispersion.',
      subLabel: 'Return variability',
      subVal: null,
      benchLabel: 'B&H Vol.',
      benchVal: formatPercent(bmPerf?.annualized_volatility_pct)
    }
  ];

  // Trade table pagination
  const totalTradePages = Math.ceil(trades.length / tradesPerPage) || 1;
  const currentTrades = trades.slice((tradePage - 1) * tradesPerPage, tradePage * tradesPerPage);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Institutional Simulation Engine Banner with Continuous Center Marquee */}
      <div className="disclaimer-banner institutional-sim-banner" style={{ margin: 0 }}>
        <span className="disclaimer-badge">
          <span className="disclaimer-dot" />
          INSTITUTIONAL SIMULATION ENGINE
        </span>

        <div 
          className="marquee-container" 
          title="Strict Next-Session Execution at Open[t+1] with trade fees, realistic cash accounting, and end-of-horizon liquidation. Real results only."
        >
          <div className="marquee-track" style={{ animationDuration: '26s' }}>
            <div className="marquee-track-half">
              <span className="marquee-text">
                Strict Next-Session Execution at Open[t+1] with trade fees, realistic cash accounting, and end-of-horizon liquidation. Real results only.
              </span>
              <span className="marquee-bullet" aria-hidden="true">&bull;</span>
              <span className="marquee-text">
                Strict Next-Session Execution at Open[t+1] with trade fees, realistic cash accounting, and end-of-horizon liquidation. Real results only.
              </span>
              <span className="marquee-bullet" aria-hidden="true">&bull;</span>
              <span className="marquee-text">
                Strict Next-Session Execution at Open[t+1] with trade fees, realistic cash accounting, and end-of-horizon liquidation. Real results only.
              </span>
              <span className="marquee-bullet" aria-hidden="true">&bull;</span>
            </div>
            <div className="marquee-track-half" aria-hidden="true">
              <span className="marquee-text">
                Strict Next-Session Execution at Open[t+1] with trade fees, realistic cash accounting, and end-of-horizon liquidation. Real results only.
              </span>
              <span className="marquee-bullet">&bull;</span>
              <span className="marquee-text">
                Strict Next-Session Execution at Open[t+1] with trade fees, realistic cash accounting, and end-of-horizon liquidation. Real results only.
              </span>
              <span className="marquee-bullet">&bull;</span>
              <span className="marquee-text">
                Strict Next-Session Execution at Open[t+1] with trade fees, realistic cash accounting, and end-of-horizon liquidation. Real results only.
              </span>
              <span className="marquee-bullet">&bull;</span>
            </div>
          </div>
        </div>

        <div className="disclaimer-rule">
          Zero Look-Ahead Bias
        </div>
      </div>

      {/* 2. Global Asset + Range Controls */}
      <GlobalAnalysisControls 
        selectedAsset={selectedAsset}
        onSelectAsset={onSelectAsset}
        datePreset={datePreset}
        onSelectPreset={handleSelectPreset}
        startDate={startDate}
        endDate={endDate}
        onStartDateChange={setStartDate}
        onEndDateChange={setEndDate}
      />

      {/* 3. Global Performance & Risk Executive Summary for Selected Asset Context */}
      <PerformanceRiskSummary 
        analyticsData={analyticsData}
        isLoading={isLoadingAnalytics}
        error={analyticsError}
        asset={selectedAsset}
        startDate={startDate}
        endDate={endDate}
      />

      {/* 4. SECTION 1: Strategy Selection & Setup */}
      <div className="content-card">
        <div className="card-title-row">
          <span className="card-title">
            <Sliders size={18} color="var(--color-cyan)" />
            1. Strategy Selection &amp; Simulation Setup
          </span>
          <span className="card-action-badge">Interactive Setup</span>
        </div>

        {/* Strategy Selector Row */}
        <div style={{ marginBottom: '1.25rem', paddingBottom: '1.25rem', borderBottom: '1px solid var(--border-subtle)' }}>
          <label className="lab-label" style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', marginBottom: '0.5rem' }}>
            <Award size={14} color="var(--color-green)" /> Strategy Signal Model
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem' }}>
            {STRATEGIES.map((strat) => {
              const isSelected = selectedStrategy === strat.id;
              return (
                <div
                  key={strat.id}
                  onClick={() => setSelectedStrategy(strat.id)}
                  style={{
                    background: isSelected ? 'rgba(37, 99, 235, 0.05)' : '#ffffff',
                    border: `1px solid ${isSelected ? 'var(--color-blue)' : 'var(--border-subtle)'}`,
                    borderRadius: 'var(--radius-sm)',
                    padding: '0.75rem 1rem',
                    cursor: 'pointer',
                    transition: 'var(--transition-fast)',
                    boxShadow: isSelected ? '0 0 0 1px var(--color-blue)' : 'var(--shadow-sm)'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                    <span style={{ fontWeight: 600, color: isSelected ? 'var(--color-blue)' : 'var(--text-primary)', fontSize: '0.85rem' }}>
                      {strat.name}
                    </span>
                    {isSelected && <CheckCircle2 size={14} color="var(--color-blue)" />}
                  </div>
                  <div style={{ fontSize: '0.725rem', color: 'var(--text-secondary)' }}>
                    {strat.tagline}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Dynamic Strategy Parameters & Portfolio Economics Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
          {/* Strategy Specific Inputs */}
          {(selectedStrategy === 'sma_crossover' || selectedStrategy === 'ema_trend') && (
            <>
              <div className="lab-input-group">
                <label className="lab-label">Fast Period (Days)</label>
                <input
                  type="number"
                  min="2"
                  max="200"
                  className="lab-input"
                  value={fastPeriod}
                  onChange={(e) => setFastPeriod(e.target.value)}
                />
              </div>
              <div className="lab-input-group">
                <label className="lab-label">Slow Period (Days)</label>
                <input
                  type="number"
                  min="3"
                  max="500"
                  className="lab-input"
                  value={slowPeriod}
                  onChange={(e) => setSlowPeriod(e.target.value)}
                />
              </div>
            </>
          )}

          {selectedStrategy === 'momentum' && (
            <div className="lab-input-group">
              <label className="lab-label">Lookback Horizon (Days)</label>
              <input
                type="number"
                min="2"
                max="250"
                className="lab-input"
                value={lookbackDays}
                onChange={(e) => setLookbackDays(e.target.value)}
              />
            </div>
          )}

          {selectedStrategy === 'mean_reversion' && (
            <>
              <div className="lab-input-group">
                <label className="lab-label">Base SMA Period</label>
                <input
                  type="number"
                  min="2"
                  max="200"
                  className="lab-input"
                  value={smaPeriodMR}
                  onChange={(e) => setSmaPeriodMR(e.target.value)}
                />
              </div>
              <div className="lab-input-group">
                <label className="lab-label">Deviation Threshold (%)</label>
                <input
                  type="number"
                  step="0.1"
                  min="0.1"
                  max="25.0"
                  className="lab-input"
                  value={thresholdPct}
                  onChange={(e) => setThresholdPct(e.target.value)}
                />
              </div>
            </>
          )}

          {/* Portfolio Settings */}
          <div className="lab-input-group">
            <label className="lab-label">Initial Capital ($)</label>
            <input
              type="number"
              min="1000"
              step="1000"
              className="lab-input"
              value={initialCapital}
              onChange={(e) => setInitialCapital(e.target.value)}
            />
          </div>

          <div className="lab-input-group">
            <label className="lab-label">Transaction Fee (%)</label>
            <input
              type="number"
              step="0.01"
              min="0.0"
              max="5.0"
              className="lab-input"
              value={transactionCostPct}
              onChange={(e) => setTransactionCostPct(e.target.value)}
            />
          </div>

          <div className="lab-input-group">
            <label className="lab-label">Position Sizing (%)</label>
            <input
              type="number"
              min="5"
              max="100"
              className="lab-input"
              value={positionSizePct}
              onChange={(e) => setPositionSizePct(e.target.value)}
            />
          </div>
        </div>

        {/* Action Button & Execution Protocol */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <button
              type="button"
              className="btn-primary"
              onClick={handleRunBacktest}
              disabled={isRunning}
              style={{
                minWidth: '180px',
                opacity: isRunning ? 0.7 : 1,
                cursor: isRunning ? 'not-allowed' : 'pointer'
              }}
            >
              {isRunning ? (
                <>
                  <RefreshCw size={16} className="spin-animation" />
                  Simulating...
                </>
              ) : (
                <>
                  <Play size={16} fill="white" />
                  RUN BACKTEST
                </>
              )}
            </button>
            <span style={{ fontSize: '0.775rem', color: 'var(--text-muted)' }}>
              Fill Open[t+1] &bull; Fees on Buy &amp; Sell &bull; Auto Liquidation at End
            </span>
          </div>

          {backtestData?.backtest_config && (
            <div style={{ fontSize: '0.725rem', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
              Evaluated {backtestData.backtest_config.trading_sessions} Sessions &bull; Currency: USD
            </div>
          )}
        </div>
      </div>

      {/* Error Alert Box */}
      {error && (
        <div className="content-card" style={{ borderLeft: '4px solid var(--color-red)', background: 'rgba(239, 68, 68, 0.08)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', color: 'var(--color-red)' }}>
            <AlertTriangle size={20} />
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>Backtest Simulation Validation Error</div>
              <div style={{ fontSize: '0.775rem', color: 'var(--text-primary)', marginTop: '0.2rem' }}>{error}</div>
            </div>
            <button
              type="button"
              className="preset-btn"
              style={{ borderColor: 'var(--color-red)', color: 'var(--color-red)' }}
              onClick={handleRunBacktest}
            >
              Retry
            </button>
          </div>
        </div>
      )}

      {/* Loading Skeleton */}
      {isRunning && !backtestData && (
        <div className="placeholder-canvas" style={{ height: '360px' }}>
          <div className="status-dot checking" style={{ width: 16, height: 16 }} />
          <p className="placeholder-text" style={{ color: 'var(--text-primary)', fontWeight: 500 }}>
            Executing chronological trade simulation across historical market bars...
          </p>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            Calculating next-session fills, transaction costs, mark-to-market valuations, and risk metrics
          </span>
        </div>
      )}

      {/* Results Section */}
      {backtestData && (
        <>
          {/* SECTION 2: BACKTEST RESULTS (KEY PERFORMANCE INDICATORS) */}
          <div className="bk-results-section">
            <div className="bk-results-header">
              <div className="bk-header-left">
                <div className="bk-header-accent" />
                <h2 className="bk-results-title">
                  2. Backtest Results (Key Performance Indicators)
                </h2>
              </div>
              <div className="bk-header-right">
                <span className="bk-session-badge">
                  Evaluated {backtestData?.backtest_config?.trading_sessions || '--'} Sessions
                </span>
              </div>
            </div>

            {/* 5 Premium Compact KPI Cards in One Row */}
            <div className="bk-kpi-grid">
              {BACKTEST_KPIS.map((kpi) => {
                const Icon = kpi.icon;
                const isHovered = activeKpiTooltip === kpi.id;
                return (
                  <div 
                    key={kpi.id} 
                    className="bk-kpi-card" 
                    style={{ '--card-accent': kpi.accentColor }}
                  >
                    <div className="bk-card-top">
                      <div className="bk-card-meta">
                        <div 
                          className="bk-icon-box"
                          style={{ color: kpi.accentColor, background: kpi.bgIcon }}
                        >
                          <Icon size={13} strokeWidth={2.4} />
                        </div>
                        <span className="bk-card-label">{kpi.label}</span>
                      </div>
                      <button
                        type="button"
                        className="bk-help-trigger"
                        aria-label={`Definition for ${kpi.label}`}
                        onMouseEnter={() => setActiveKpiTooltip(kpi.id)}
                        onMouseLeave={() => setActiveKpiTooltip(null)}
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveKpiTooltip(activeKpiTooltip === kpi.id ? null : kpi.id);
                        }}
                      >
                        <HelpCircle size={13} />
                      </button>
                    </div>

                    {isHovered && (
                      <div className="bk-tooltip-popover" role="tooltip">
                        {kpi.tooltip}
                      </div>
                    )}

                    <div className="bk-card-body">
                      <div className="bk-card-val" style={{ color: kpi.color }}>
                        {kpi.primaryVal}
                      </div>
                      <div className="bk-card-footer">
                        <div className="bk-sub-row">
                          <span className="bk-sub-label">{kpi.subLabel}</span>
                          {kpi.subVal && <span className="bk-sub-val">{kpi.subVal}</span>}
                        </div>
                        <div className="bk-bench-row">
                          <div className="bk-bench-title-group">
                            <span className="bk-vs-badge">STRATEGY vs B&amp;H</span>
                            <span className="bk-bench-name">{kpi.benchLabel}</span>
                          </div>
                          <span className="bk-bench-val">
                            {kpi.benchVal}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* SECTION 3: Strategy vs Buy & Hold Benchmark Comparison */}
          {bmPerf && (
            <div className="content-card">
              <div className="card-title-row">
                <span className="card-title">
                  <Layers size={18} color="var(--color-blue)" />
                  3. Benchmark Comparison (Strategy vs. Buy &amp; Hold)
                </span>
                <span 
                  className="card-action-badge" 
                  style={{ 
                    color: ((perf?.total_return_pct ?? 0) - (bmPerf?.total_return_pct ?? 0)) >= 0 ? 'var(--color-green)' : 'var(--color-red)' 
                  }}
                >
                  Alpha: {formatPercent((perf?.total_return_pct ?? 0) - (bmPerf?.total_return_pct ?? 0))}
                </span>
              </div>

              <div style={{ overflowX: 'auto', width: '100%', marginTop: '0.5rem' }}>
                <table className="stats-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th>Metric</th>
                      <th>Tested Strategy ({STRATEGIES.find(s => s.id === selectedStrategy)?.name})</th>
                      <th>Buy &amp; Hold Benchmark ({selectedAsset.name})</th>
                      <th>Difference / Outperformance</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="stat-label">Total Cumulative Return</td>
                      <td className="stat-value" style={{ color: (perf?.total_return_pct ?? 0) >= 0 ? 'var(--color-green)' : 'var(--color-red)' }}>
                        {formatPercent(perf?.total_return_pct)}
                      </td>
                      <td className="stat-value" style={{ color: (bmPerf?.total_return_pct ?? 0) >= 0 ? 'var(--color-green)' : 'var(--color-red)' }}>
                        {formatPercent(bmPerf?.total_return_pct)}
                      </td>
                      <td className="stat-value" style={{ fontWeight: 700, color: ((perf?.total_return_pct ?? 0) - (bmPerf?.total_return_pct ?? 0)) >= 0 ? 'var(--color-green)' : 'var(--color-red)' }}>
                        {formatPercent((perf?.total_return_pct ?? 0) - (bmPerf?.total_return_pct ?? 0))}
                      </td>
                    </tr>
                    <tr>
                      <td className="stat-label">CAGR (Annualized Growth)</td>
                      <td className="stat-value" style={{ color: (perf?.cagr_pct ?? 0) >= 0 ? 'var(--color-green)' : 'var(--color-red)' }}>
                        {formatPercent(perf?.cagr_pct)}
                      </td>
                      <td className="stat-value" style={{ color: (bmPerf?.cagr_pct ?? 0) >= 0 ? 'var(--color-green)' : 'var(--color-red)' }}>
                        {formatPercent(bmPerf?.cagr_pct)}
                      </td>
                      <td className="stat-value" style={{ fontWeight: 700, color: ((perf?.cagr_pct ?? 0) - (bmPerf?.cagr_pct ?? 0)) >= 0 ? 'var(--color-green)' : 'var(--color-red)' }}>
                        {formatPercent((perf?.cagr_pct ?? 0) - (bmPerf?.cagr_pct ?? 0))}
                      </td>
                    </tr>
                    <tr>
                      <td className="stat-label">Sharpe Ratio (0% Rf)</td>
                      <td className="stat-value">
                        {perf?.sharpe_ratio !== null ? perf.sharpe_ratio.toFixed(2) : '--'}
                      </td>
                      <td className="stat-value">
                        {bmPerf?.sharpe_ratio !== null ? bmPerf.sharpe_ratio.toFixed(2) : '--'}
                      </td>
                      <td className="stat-value" style={{ fontWeight: 700, color: ((perf?.sharpe_ratio ?? 0) - (bmPerf?.sharpe_ratio ?? 0)) >= 0 ? 'var(--color-green)' : 'var(--color-red)' }}>
                        {perf?.sharpe_ratio !== null && bmPerf?.sharpe_ratio !== null ? `${((perf.sharpe_ratio - bmPerf.sharpe_ratio) >= 0 ? '+' : '')}${(perf.sharpe_ratio - bmPerf.sharpe_ratio).toFixed(2)}` : '--'}
                      </td>
                    </tr>
                    <tr>
                      <td className="stat-label">Maximum Drawdown</td>
                      <td className="stat-value" style={{ color: 'var(--color-red)' }}>
                        {formatPercent(perf?.max_drawdown_pct)}
                      </td>
                      <td className="stat-value" style={{ color: 'var(--color-red)' }}>
                        {formatPercent(bmPerf?.max_drawdown_pct)}
                      </td>
                      <td className="stat-value" style={{ fontWeight: 700, color: ((perf?.max_drawdown_pct ?? 0) >= (bmPerf?.max_drawdown_pct ?? 0)) ? 'var(--color-green)' : 'var(--color-red)' }}>
                        {perf?.max_drawdown_pct !== null && bmPerf?.max_drawdown_pct !== null ? `${((perf.max_drawdown_pct - bmPerf.max_drawdown_pct) >= 0 ? '+' : '')}${(perf.max_drawdown_pct - bmPerf.max_drawdown_pct).toFixed(2)}% (lower risk)` : '--'}
                      </td>
                    </tr>
                    <tr>
                      <td className="stat-label">Annualized Volatility</td>
                      <td className="stat-value" style={{ color: 'var(--color-blue)' }}>
                        {formatPercent(perf?.annualized_volatility_pct)}
                      </td>
                      <td className="stat-value" style={{ color: 'var(--color-blue)' }}>
                        {formatPercent(bmPerf?.annualized_volatility_pct)}
                      </td>
                      <td className="stat-value">
                        {perf?.annualized_volatility_pct !== null && bmPerf?.annualized_volatility_pct !== null ? `${((perf.annualized_volatility_pct - bmPerf.annualized_volatility_pct) >= 0 ? '+' : '')}${(perf.annualized_volatility_pct - bmPerf.annualized_volatility_pct).toFixed(2)}%` : '--'}
                      </td>
                    </tr>
                    <tr>
                      <td className="stat-label">Final Portfolio Value</td>
                      <td className="stat-value" style={{ fontWeight: 600 }}>
                        {formatCurrency(perf?.final_portfolio_value)}
                      </td>
                      <td className="stat-value" style={{ fontWeight: 600 }}>
                        {formatCurrency(bmPerf?.final_portfolio_value)}
                      </td>
                      <td className="stat-value" style={{ fontWeight: 700, color: ((perf?.final_portfolio_value ?? 0) - (bmPerf?.final_portfolio_value ?? 0)) >= 0 ? 'var(--color-green)' : 'var(--color-red)' }}>
                        {formatCurrency((perf?.final_portfolio_value ?? 0) - (bmPerf?.final_portfolio_value ?? 0))}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Results Navigation Bar */}
          <div className="content-card" style={{ padding: '0.5rem 1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  type="button"
                  className={`preset-btn ${activeResultTab === 'equity' ? 'active' : ''}`}
                  onClick={() => setActiveResultTab('equity')}
                  style={{ padding: '0.5rem 1rem', fontSize: '0.8rem' }}
                >
                  <TrendingUp size={14} style={{ display: 'inline', marginRight: 4, verticalAlign: 'text-bottom' }} />
                  4. Equity Curve vs Benchmark
                </button>
                <button
                  type="button"
                  className={`preset-btn ${activeResultTab === 'drawdown' ? 'active' : ''}`}
                  onClick={() => setActiveResultTab('drawdown')}
                  style={{ padding: '0.5rem 1rem', fontSize: '0.8rem' }}
                >
                  <ShieldAlert size={14} style={{ display: 'inline', marginRight: 4, verticalAlign: 'text-bottom' }} />
                  5. Underwater Drawdown
                </button>
                <button
                  type="button"
                  className={`preset-btn ${activeResultTab === 'trades' ? 'active' : ''}`}
                  onClick={() => setActiveResultTab('trades')}
                  style={{ padding: '0.5rem 1rem', fontSize: '0.8rem' }}
                >
                  <FileText size={14} style={{ display: 'inline', marginRight: 4, verticalAlign: 'text-bottom' }} />
                  6. Trade Execution Log ({trades.length})
                </button>
              </div>

              {perf && (
                <div style={{ display: 'flex', gap: '1rem', fontSize: '0.75rem', fontFamily: 'var(--font-mono)' }}>
                  {perf.best_trade_pct !== null && (
                    <span style={{ color: 'var(--color-green)' }}>Best: +{perf.best_trade_pct.toFixed(2)}%</span>
                  )}
                  {perf.worst_trade_pct !== null && (
                    <span style={{ color: 'var(--color-red)' }}>Worst: {perf.worst_trade_pct.toFixed(2)}%</span>
                  )}
                  {perf.avg_trade_return_pct !== null && (
                    <span style={{ color: 'var(--color-cyan)' }}>Avg: {formatPercent(perf.avg_trade_return_pct)}</span>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* TAB 1: Equity Curve vs Benchmark */}
          {activeResultTab === 'equity' && (
            <div className="content-card">
              <div className="card-title-row">
                <span className="card-title">
                  <TrendingUp size={18} color="var(--color-cyan)" />
                  Portfolio Mark-to-Market Equity vs Buy &amp; Hold Benchmark
                </span>
                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', fontSize: '0.75rem', fontFamily: 'var(--font-mono)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <div style={{ width: 12, height: 3, background: '#38bdf8', borderRadius: 2 }} />
                    <span>Strategy ({perf?.total_return_pct >= 0 ? '+' : ''}{perf?.total_return_pct.toFixed(1)}%)</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <div style={{ width: 12, height: 3, background: '#94a3b8', borderRadius: 2 }} />
                    <span>Buy &amp; Hold ({bmPerf?.total_return_pct >= 0 ? '+' : ''}{bmPerf?.total_return_pct.toFixed(1)}%)</span>
                  </div>
                </div>
              </div>

              <div style={{ width: '100%', height: 360 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={equityCurve} margin={{ top: 10, right: 20, left: 15, bottom: 5 }}>
                    <defs>
                      <linearGradient id="stratAreaGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#2563eb" stopOpacity={0.15} />
                        <stop offset="95%" stopColor="#2563eb" stopOpacity={0.0} />
                      </linearGradient>
                      <linearGradient id="bmAreaGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#94a3b8" stopOpacity={0.08} />
                        <stop offset="95%" stopColor="#94a3b8" stopOpacity={0.0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis
                      dataKey="date"
                      tick={{ fill: '#64748b', fontSize: 11 }}
                      axisLine={{ stroke: '#cbd5e1' }}
                      tickLine={{ stroke: '#cbd5e1' }}
                      minTickGap={30}
                    />
                    <YAxis
                      domain={['auto', 'auto']}
                      tick={{ fill: '#64748b', fontSize: 11, fontFamily: 'var(--font-mono)' }}
                      axisLine={{ stroke: '#cbd5e1' }}
                      tickLine={{ stroke: '#cbd5e1' }}
                      tickFormatter={(val) => `$${(val / 1000).toFixed(0)}k`}
                      width={60}
                    />
                    <Tooltip content={<CustomEquityTooltip />} />
                    {/* Benchmark curve */}
                    <Area
                      type="monotone"
                      dataKey="benchmark_value"
                      name="Benchmark"
                      stroke="#94a3b8"
                      strokeWidth={1.5}
                      strokeDasharray="4 4"
                      fillOpacity={1}
                      fill="url(#bmAreaGrad)"
                    />
                    {/* Strategy curve */}
                    <Area
                      type="monotone"
                      dataKey="portfolio_value"
                      name="Strategy"
                      stroke="#2563eb"
                      strokeWidth={2.5}
                      fillOpacity={1}
                      fill="url(#stratAreaGrad)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* TAB 2: Underwater Drawdown Profile */}
          {activeResultTab === 'drawdown' && (
            <div className="content-card">
              <div className="card-title-row">
                <span className="card-title">
                  <ShieldAlert size={18} color="var(--color-red)" />
                  Strategy Underwater Drawdown Series
                </span>
                <span className="card-action-badge" style={{ color: 'var(--color-red)' }}>
                  Max Historical Peak-to-Trough: {formatPercent(perf?.max_drawdown_pct)}
                </span>
              </div>

              <div style={{ width: '100%', height: 320 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={equityCurve} margin={{ top: 10, right: 20, left: 15, bottom: 5 }}>
                    <defs>
                      <linearGradient id="drawdownGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#dc2626" stopOpacity={0.25} />
                        <stop offset="95%" stopColor="#dc2626" stopOpacity={0.0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis
                      dataKey="date"
                      tick={{ fill: '#64748b', fontSize: 11 }}
                      axisLine={{ stroke: '#cbd5e1' }}
                      tickLine={{ stroke: '#cbd5e1' }}
                      minTickGap={30}
                    />
                    <YAxis
                      domain={['auto', 0]}
                      tick={{ fill: '#64748b', fontSize: 11, fontFamily: 'var(--font-mono)' }}
                      axisLine={{ stroke: '#cbd5e1' }}
                      tickLine={{ stroke: '#cbd5e1' }}
                      tickFormatter={(val) => `${val.toFixed(0)}%`}
                      width={50}
                    />
                    <Tooltip content={<CustomDrawdownTooltip />} />
                    <ReferenceLine y={0} stroke="#cbd5e1" strokeWidth={1} />
                    <Area
                      type="monotone"
                      dataKey="drawdown"
                      name="Drawdown"
                      stroke="#dc2626"
                      strokeWidth={2}
                      fillOpacity={1}
                      fill="url(#drawdownGrad)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* TAB 3: Chronological Trade Execution Log Table */}
          {activeResultTab === 'trades' && (
            <div className="content-card">
              <div className="card-title-row">
                <span className="card-title">
                  <FileText size={18} color="var(--color-blue)" />
                  Chronological Trade Log ({trades.length} Total Executions)
                </span>
                <span className="card-action-badge">
                  Total Fees Paid: {formatCurrency(perf?.total_transaction_costs)}
                </span>
              </div>

              {trades.length === 0 ? (
                <div className="placeholder-canvas" style={{ height: '200px' }}>
                  <Info size={28} color="var(--text-muted)" />
                  <p className="placeholder-text">
                    No trades were triggered for the given parameters and historical horizon.
                  </p>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    Try reducing moving average periods or adjusting threshold parameters.
                  </span>
                </div>
              ) : (
                <>
                  <div style={{ overflowX: 'auto', width: '100%' }}>
                    <table className="stats-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr>
                          <th>#</th>
                          <th>Entry Date</th>
                          <th>Entry Fill</th>
                          <th>Exit Date</th>
                          <th>Exit Fill</th>
                          <th>Qty</th>
                          <th>Holding</th>
                          <th>Gross P&amp;L</th>
                          <th>Fees</th>
                          <th>Net P&amp;L</th>
                          <th>Return</th>
                          <th>Exit Reason</th>
                        </tr>
                      </thead>
                      <tbody>
                        {currentTrades.map((t) => {
                          const isProfit = t.net_pnl > 0;
                          const isLoss = t.net_pnl < 0;
                          const isLiquidation = t.exit_reason === 'End of Horizon Liquidation';

                          return (
                            <tr key={t.trade_id} style={{ background: isLiquidation ? 'rgba(245, 158, 11, 0.04)' : 'transparent' }}>
                              <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{t.trade_id}</td>
                              <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>{t.entry_date}</td>
                              <td style={{ fontFamily: 'var(--font-mono)' }}>${t.entry_price.toLocaleString()}</td>
                              <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>{t.exit_date}</td>
                              <td style={{ fontFamily: 'var(--font-mono)' }}>${t.exit_price.toLocaleString()}</td>
                              <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>{t.quantity.toFixed(4)}</td>
                              <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>{t.holding_period_days}d</td>
                              <td style={{ fontFamily: 'var(--font-mono)', color: t.gross_pnl >= 0 ? 'var(--color-green)' : 'var(--color-red)' }}>
                                {formatCurrency(t.gross_pnl)}
                              </td>
                              <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                                -${t.transaction_cost.toFixed(2)}
                              </td>
                              <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: isProfit ? 'var(--color-green)' : (isLoss ? 'var(--color-red)' : 'inherit') }}>
                                {formatCurrency(t.net_pnl)}
                              </td>
                              <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: isProfit ? 'var(--color-green)' : (isLoss ? 'var(--color-red)' : 'inherit') }}>
                                {formatPercent(t.return_pct)}
                              </td>
                              <td>
                                {isLiquidation ? (
                                  <span style={{
                                    background: 'rgba(245, 158, 11, 0.15)',
                                    color: 'var(--color-amber)',
                                    padding: '0.15rem 0.4rem',
                                    borderRadius: '4px',
                                    fontSize: '0.7rem',
                                    fontFamily: 'var(--font-mono)',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '0.25rem'
                                  }}>
                                    <AlertTriangle size={10} /> Horizon Liquidation
                                  </span>
                                ) : (
                                  <span style={{ color: 'var(--text-secondary)', fontSize: '0.725rem' }}>
                                    {t.exit_reason}
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Pagination Controls */}
                  {totalTradePages > 1 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border-subtle)' }}>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        Showing {((tradePage - 1) * tradesPerPage) + 1}–{Math.min(tradePage * tradesPerPage, trades.length)} of {trades.length} trades
                      </span>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button
                          type="button"
                          className="preset-btn"
                          disabled={tradePage === 1}
                          onClick={() => setTradePage((p) => Math.max(1, p - 1))}
                          style={{ opacity: tradePage === 1 ? 0.4 : 1 }}
                        >
                          Previous
                        </button>
                        <span style={{ display: 'flex', alignItems: 'center', padding: '0 0.5rem', fontSize: '0.75rem', fontFamily: 'var(--font-mono)' }}>
                          {tradePage} / {totalTradePages}
                        </span>
                        <button
                          type="button"
                          className="preset-btn"
                          disabled={tradePage === totalTradePages}
                          onClick={() => setTradePage((p) => Math.min(totalTradePages, p + 1))}
                          style={{ opacity: tradePage === totalTradePages ? 0.4 : 1 }}
                        >
                          Next
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
