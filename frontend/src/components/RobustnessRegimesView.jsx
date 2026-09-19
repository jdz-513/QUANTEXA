import React, { useState, useEffect, useCallback } from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine
} from 'recharts';
import {
  Sliders,
  Activity,
  TrendingUp,
  ShieldAlert,
  Layers,
  Calendar,
  RefreshCw,
  Play,
  Info,
  CheckCircle2,
  AlertTriangle,
  Grid,
  Compass,
  BarChart2,
  PieChart
} from 'lucide-react';
import { runRobustnessBacktest, fetchMarketRegimes } from '../services/api';
import { ASSETS, PRESETS } from './AssetBar';
import PerformanceRiskSummary from './PerformanceRiskSummary';
import GlobalAnalysisControls from './GlobalAnalysisControls';

const STRATEGIES = [
  { id: 'sma_crossover', name: 'SMA Crossover', description: 'Fast vs Slow Moving Average Grid' },
  { id: 'ema_trend', name: 'EMA Trend', description: 'Fast vs Slow Exponential Moving Average Grid' },
  { id: 'momentum', name: 'Momentum', description: 'Lookback Period Sensitivity' },
  { id: 'mean_reversion', name: 'Mean Reversion', description: 'SMA Window vs Deviation Threshold Grid' }
];

const formatPercent = (val) => {
  if (val === null || val === undefined || isNaN(val)) return '--';
  const sign = Number(val) > 0 ? '+' : '';
  return `${sign}${Number(val).toFixed(2)}%`;
};

const getCellColor = (val, metric, minVal, maxVal) => {
  if (val === null || val === undefined || isNaN(val)) return 'rgba(0, 0, 0, 0.03)';

  if (metric === 'max_drawdown_pct') {
    // Drawdowns are <= 0. Worse (more negative) = stronger red
    const norm = Math.min(1.0, Math.abs(val) / 50.0);
    return `rgba(220, 38, 38, ${0.12 + norm * 0.45})`;
  }

  if (val >= 0) {
    const norm = maxVal > 0 ? Math.min(1.0, val / maxVal) : 0.5;
    return `rgba(22, 163, 74, ${0.12 + norm * 0.45})`;
  } else {
    const norm = minVal < 0 ? Math.min(1.0, Math.abs(val) / Math.abs(minVal)) : 0.5;
    return `rgba(220, 38, 38, ${0.12 + norm * 0.45})`;
  }
};

export default function RobustnessRegimesView({
  selectedAsset: propSelectedAsset,
  onSelectAsset: propOnSelectAsset,
  datePreset: propDatePreset,
  onSelectPreset: propOnSelectPreset,
  startDate: propStartDate,
  endDate: propEndDate,
  onStartDateChange: propOnStartDateChange,
  onEndDateChange: propOnEndDateChange,
  initialAsset,
  initialStartDate,
  initialEndDate,
  initialPreset,
  analyticsData,
  isLoadingAnalytics,
  analyticsError
}) {
  const [internalAsset, setInternalAsset] = useState(initialAsset || ASSETS[0]);
  const selectedAsset = propSelectedAsset || internalAsset;
  const onSelectAsset = propOnSelectAsset || setInternalAsset;

  const [selectedStrategy, setSelectedStrategy] = useState(STRATEGIES[0].id);

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

  // Economics
  const [initialCapital, setInitialCapital] = useState(100000);
  const [transactionCostPct, setTransactionCostPct] = useState(0.10);
  const [positionSizePct, setPositionSizePct] = useState(100.0);

  // Active View Tab: 'robustness' | 'regimes'
  const [activeSubTab, setActiveSubTab] = useState('robustness');

  // Robustness State
  const [heatmapMetric, setHeatmapMetric] = useState('sharpe_ratio'); // 'total_return_pct' | 'sharpe_ratio' | 'max_drawdown_pct'
  const [hoveredCell, setHoveredCell] = useState(null);
  const [isLoadingRobustness, setIsLoadingRobustness] = useState(false);
  const [robustnessData, setRobustnessData] = useState(null);
  const [robustnessError, setRobustnessError] = useState(null);

  // Market Regime Parameters
  const [returnWindow, setReturnWindow] = useState(20);
  const [volatilityWindow, setVolatilityWindow] = useState(20);
  const [posThreshold, setPosThreshold] = useState(2.0);
  const [negThreshold, setNegThreshold] = useState(-2.0);
  const [volThreshold, setVolThreshold] = useState(25.0);
  const [isLoadingRegimes, setIsLoadingRegimes] = useState(false);
  const [regimesData, setRegimesData] = useState(null);
  const [regimesError, setRegimesError] = useState(null);

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

  // 1. Run Robustness Analysis
  const executeRobustnessAnalysis = useCallback(async () => {
    setIsLoadingRobustness(true);
    setRobustnessError(null);

    const payload = {
      asset: selectedAsset.id,
      strategy: selectedStrategy,
      start_date: startDate,
      end_date: endDate,
      initial_capital: Number(initialCapital),
      transaction_cost_pct: Number(transactionCostPct),
      position_size_pct: Number(positionSizePct),
      parameter_grid: {} // Uses server-side defaults or auto-ranges
    };

    try {
      const data = await runRobustnessBacktest(payload);
      setRobustnessData(data);
    } catch (err) {
      console.error('Robustness execution error:', err);
      const detail = err.response?.data?.detail || err.message || 'Robustness analysis failed.';
      setRobustnessError(typeof detail === 'string' ? detail : JSON.stringify(detail));
    } finally {
      setIsLoadingRobustness(false);
    }
  }, [
    selectedAsset,
    selectedStrategy,
    startDate,
    endDate,
    initialCapital,
    transactionCostPct,
    positionSizePct
  ]);

  // 2. Fetch Market Regimes
  const executeRegimesAnalysis = useCallback(async () => {
    setIsLoadingRegimes(true);
    setRegimesError(null);

    try {
      const data = await fetchMarketRegimes(
        selectedAsset.id,
        startDate,
        endDate,
        Number(returnWindow),
        Number(volatilityWindow),
        Number(posThreshold),
        Number(negThreshold),
        Number(volThreshold),
        selectedStrategy
      );
      setRegimesData(data);
    } catch (err) {
      console.error('Regimes analysis error:', err);
      const detail = err.response?.data?.detail || err.message || 'Market regime analysis failed.';
      setRegimesError(typeof detail === 'string' ? detail : JSON.stringify(detail));
    } finally {
      setIsLoadingRegimes(false);
    }
  }, [
    selectedAsset,
    selectedStrategy,
    startDate,
    endDate,
    returnWindow,
    volatilityWindow,
    posThreshold,
    negThreshold,
    volThreshold
  ]);

  // Initial load
  useEffect(() => {
    executeRobustnessAnalysis();
    executeRegimesAnalysis();
  }, [executeRobustnessAnalysis, executeRegimesAnalysis]);

  // Process Heatmap Structure for 2D Grid
  const results = robustnessData?.results || [];
  const summary = robustnessData?.summary;

  // Extract axes based on strategy
  let xLabels = [];
  let yLabels = [];
  let gridMatrix = {}; // key: "yVal_xVal" -> item

  if (selectedStrategy === 'sma_crossover' || selectedStrategy === 'ema_trend') {
    const fastSet = new Set();
    const slowSet = new Set();
    results.forEach((r) => {
      fastSet.add(r.parameters.fast_period);
      slowSet.add(r.parameters.slow_period);
      const k = `${r.parameters.fast_period}_${r.parameters.slow_period}`;
      gridMatrix[k] = r;
    });
    yLabels = Array.from(fastSet).sort((a, b) => a - b);
    xLabels = Array.from(slowSet).sort((a, b) => a - b);
  } else if (selectedStrategy === 'mean_reversion') {
    const smaSet = new Set();
    const threshSet = new Set();
    results.forEach((r) => {
      smaSet.add(r.parameters.sma_period);
      threshSet.add(r.parameters.threshold_pct);
      const k = `${r.parameters.sma_period}_${r.parameters.threshold_pct}`;
      gridMatrix[k] = r;
    });
    yLabels = Array.from(smaSet).sort((a, b) => a - b);
    xLabels = Array.from(threshSet).sort((a, b) => a - b);
  }

  // Min and max for color normalization
  const metricValues = results.map((r) => r[heatmapMetric]).filter((v) => v !== null && !isNaN(v));
  const minMetric = metricValues.length ? Math.min(...metricValues) : 0;
  const maxMetric = metricValues.length ? Math.max(...metricValues) : 1;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Educational & Non-Prescriptive Guidance Banner with Smooth Marquee */}
      <div className="disclaimer-banner" style={{ margin: 0 }}>
        <div className="disclaimer-left">
          <span className="disclaimer-badge">SENSITIVITY &amp; REGIME FRAMEWORK</span>
          <div 
            className="marquee-container" 
            title="Robustness testing evaluates sensitivity across parameter spaces to diagnose curve-fitting. Regimes are rule-based historical labels, not forecasts."
          >
            <div className="marquee-track" style={{ animationDuration: '22s' }}>
              <span className="marquee-text">
                Robustness testing evaluates sensitivity across parameter spaces to diagnose curve-fitting. Regimes are rule-based historical labels, not forecasts.
              </span>
              <span className="marquee-text" aria-hidden="true">
                &bull;&nbsp;&nbsp;Robustness testing evaluates sensitivity across parameter spaces to diagnose curve-fitting. Regimes are rule-based historical labels, not forecasts.
              </span>
            </div>
          </div>
        </div>
        <div className="disclaimer-rule">
          Strict Rule: Non-Optimization
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

      {/* 3. Global Performance & Risk Executive Summary */}
      <PerformanceRiskSummary 
        analyticsData={analyticsData}
        isLoading={isLoadingAnalytics}
        error={analyticsError}
        asset={selectedAsset}
        startDate={startDate}
        endDate={endDate}
      />

      {/* 4. Control Setup Card */}
      <div className="content-card">
        <div className="card-title-row">
          <span className="card-title">
            <Sliders size={18} color="var(--color-cyan)" />
            Sensitivity &amp; Market Regime Configuration
          </span>
          <span className="card-action-badge">Phase 7 Engine</span>
        </div>

        {/* Strategy Selector Row */}
        <div style={{ marginBottom: '1.25rem', paddingBottom: '1.25rem', borderBottom: '1px solid var(--border-subtle)' }}>
          <label className="lab-label" style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', marginBottom: '0.5rem' }}>
            <Activity size={14} color="var(--color-green)" /> Target Strategy for Robustness
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
                    {strat.description}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Action Row */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
            <button
              type="button"
              className="btn-primary"
              onClick={() => {
                executeRobustnessAnalysis();
                executeRegimesAnalysis();
              }}
              disabled={isLoadingRobustness || isLoadingRegimes}
              style={{ minWidth: '220px' }}
            >
              {isLoadingRobustness || isLoadingRegimes ? (
                <>
                  <RefreshCw size={16} className="spin-animation" />
                  Analyzing Grid &amp; Regimes...
                </>
              ) : (
                <>
                  <Play size={16} fill="white" />
                  RUN ROBUSTNESS &amp; REGIMES
                </>
              )}
            </button>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              Evaluates parameter stability and identifies market regimes with zero forward leakage.
            </span>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              type="button"
              className={`preset-btn ${activeSubTab === 'robustness' ? 'active' : ''}`}
              onClick={() => setActiveSubTab('robustness')}
              style={{ padding: '0.5rem 1rem', fontSize: '0.8rem' }}
            >
              <Grid size={14} style={{ display: 'inline', marginRight: 4, verticalAlign: 'text-bottom' }} />
              Parameter Sensitivity Heatmap
            </button>
            <button
              type="button"
              className={`preset-btn ${activeSubTab === 'regimes' ? 'active' : ''}`}
              onClick={() => setActiveSubTab('regimes')}
              style={{ padding: '0.5rem 1rem', fontSize: '0.8rem' }}
            >
              <Compass size={14} style={{ display: 'inline', marginRight: 4, verticalAlign: 'text-bottom' }} />
              Market Regime Classification
            </button>
          </div>
        </div>
      </div>

      {/* Error Displays */}
      {(robustnessError || regimesError) && (
        <div className="content-card" style={{ borderLeft: '4px solid var(--color-red)', background: 'rgba(239, 68, 68, 0.08)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', color: 'var(--color-red)' }}>
            <AlertTriangle size={20} />
            <div style={{ fontSize: '0.825rem' }}>
              {robustnessError || regimesError}
            </div>
          </div>
        </div>
      )}

      {/* SECTION 1: PARAMETER ROBUSTNESS & STABILITY */}
      {activeSubTab === 'robustness' && (
        <>
          <div style={{ marginBottom: '-0.5rem' }}>
            <div style={{ fontSize: '0.8rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-blue)', marginBottom: '0.2rem' }}>
              ROBUSTNESS &bull; Parameter Testing &bull; Stability &bull; Sensitivity
            </div>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: 0 }}>
              Demonstrates that quantitative strategy performance does not rely on fragile, over-fitted parameters. Evaluates full surface stability and parameter decay.
            </p>
          </div>

          {/* Robustness Summary KPI Cards */}
          {summary && (
            <div className="metrics-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))' }}>
              <div className="metric-card">
                <div className="metric-header">
                  <span className="metric-title">Median Sharpe</span>
                  <Activity size={14} color="var(--color-cyan)" />
                </div>
                <div className={`metric-value ${summary.median_sharpe >= 1.0 ? 'positive' : (summary.median_sharpe < 0 ? 'negative' : '')}`}>
                  {summary.median_sharpe.toFixed(2)}
                </div>
                <div className="metric-subtext">
                  <span>Sensitivity Median Across Grid</span>
                </div>
              </div>

              <div className="metric-card">
                <div className="metric-header">
                  <span className="metric-title">Median Return</span>
                  <TrendingUp size={14} color={summary.median_return_pct >= 0 ? 'var(--color-green)' : 'var(--color-red)'} />
                </div>
                <div className={`metric-value ${summary.median_return_pct >= 0 ? 'positive' : 'negative'}`}>
                  {formatPercent(summary.median_return_pct)}
                </div>
                <div className="metric-subtext">
                  <span>Dispersion: &plusmn;{summary.return_dispersion_std.toFixed(1)}%</span>
                </div>
              </div>

              <div className="metric-card">
                <div className="metric-header">
                  <span className="metric-title">Median Max Drawdown</span>
                  <ShieldAlert size={14} color="var(--color-red)" />
                </div>
                <div className="metric-value negative">
                  {formatPercent(summary.median_drawdown_pct)}
                </div>
                <div className="metric-subtext">
                  <span>Typical Decline Under Grid</span>
                </div>
              </div>

              <div className="metric-card">
                <div className="metric-header">
                  <span className="metric-title">Profitable Regions</span>
                  <CheckCircle2 size={14} color="var(--color-green)" />
                </div>
                <div className="metric-value positive">
                  {summary.positive_return_pct.toFixed(0)}%
                </div>
                <div className="metric-subtext">
                  <span>{summary.positive_sharpe_pct.toFixed(0)}% with Sharpe &gt; 0</span>
                </div>
              </div>

              <div className="metric-card">
                <div className="metric-header">
                  <span className="metric-title">Tested Combinations</span>
                  <Grid size={14} color="var(--color-blue)" />
                </div>
                <div className="metric-value">
                  {summary.valid_combinations}
                </div>
                <div className="metric-subtext">
                  <span>{summary.invalid_combinations} filtered (fast &ge; slow)</span>
                </div>
              </div>
            </div>
          )}

          {/* Heatmap Card */}
          <div className="content-card">
            <div className="card-title-row">
              <span className="card-title">
                <Grid size={18} color="var(--color-cyan)" />
                Parameter Sensitivity Heatmap — {selectedStrategy === 'sma_crossover' ? 'SMA Fast vs Slow Periods' : (selectedStrategy === 'ema_trend' ? 'EMA Fast vs Slow Periods' : (selectedStrategy === 'momentum' ? 'Momentum Lookbacks' : 'Mean Reversion SMA vs Threshold'))}
              </span>

              {/* Metric Toggle */}
              <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Display Metric:</span>
                <button
                  type="button"
                  className={`preset-btn ${heatmapMetric === 'sharpe_ratio' ? 'active' : ''}`}
                  onClick={() => setHeatmapMetric('sharpe_ratio')}
                >
                  Sharpe Ratio
                </button>
                <button
                  type="button"
                  className={`preset-btn ${heatmapMetric === 'total_return_pct' ? 'active' : ''}`}
                  onClick={() => setHeatmapMetric('total_return_pct')}
                >
                  Total Return
                </button>
                <button
                  type="button"
                  className={`preset-btn ${heatmapMetric === 'max_drawdown_pct' ? 'active' : ''}`}
                  onClick={() => setHeatmapMetric('max_drawdown_pct')}
                >
                  Max Drawdown
                </button>
              </div>
            </div>

            {/* Render 2D Grid for SMA, EMA, Mean Reversion */}
            {(selectedStrategy === 'sma_crossover' || selectedStrategy === 'ema_trend' || selectedStrategy === 'mean_reversion') && (
              <div style={{ overflowX: 'auto', width: '100%', padding: '0.5rem 0' }}>
                <table style={{ borderCollapse: 'separate', borderSpacing: '6px', margin: '0 auto', fontSize: '0.8rem' }}>
                  <thead>
                    <tr>
                      <th style={{ padding: '0.5rem', color: 'var(--text-muted)', fontSize: '0.75rem', textAlign: 'right' }}>
                        {selectedStrategy === 'mean_reversion' ? 'SMA Period ↓ / Thresh →' : 'Fast Period ↓ / Slow →'}
                      </th>
                      {xLabels.map((x) => (
                        <th key={x} style={{ padding: '0.5rem', color: 'var(--text-secondary)', textAlign: 'center', fontFamily: 'var(--font-mono)' }}>
                          {selectedStrategy === 'mean_reversion' ? `${x}%` : `${x}d`}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {yLabels.map((y) => (
                      <tr key={y}>
                        <td style={{ padding: '0.5rem', color: 'var(--text-secondary)', fontWeight: 600, textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                          {selectedStrategy === 'mean_reversion' ? `${y}d` : `${y}d`}
                        </td>
                        {xLabels.map((x) => {
                          const k = `${y}_${x}`;
                          const item = gridMatrix[k];
                          if (!item) {
                            return (
                              <td
                                key={x}
                                style={{
                                  background: 'var(--bg-surface)',
                                  border: '1px dashed var(--border-medium)',
                                  borderRadius: 'var(--radius-sm)',
                                  minWidth: '70px',
                                  height: '44px',
                                  textAlign: 'center',
                                  color: 'var(--text-muted)',
                                  fontSize: '0.7rem'
                                }}
                              >
                                &times;
                              </td>
                            );
                          }

                          const val = item[heatmapMetric];
                          const bgColor = getCellColor(val, heatmapMetric, minMetric, maxMetric);

                          return (
                            <td
                              key={x}
                              onMouseEnter={() => setHoveredCell(item)}
                              onMouseLeave={() => setHoveredCell(null)}
                              style={{
                                background: bgColor,
                                border: '1px solid var(--border-subtle)',
                                borderRadius: 'var(--radius-sm)',
                                minWidth: '70px',
                                height: '44px',
                                textAlign: 'center',
                                cursor: 'pointer',
                                fontFamily: 'var(--font-mono)',
                                fontWeight: 700,
                                fontSize: '0.8rem',
                                color: 'var(--text-primary)',
                                transition: 'var(--transition-fast)'
                              }}
                            >
                              {heatmapMetric === 'sharpe_ratio' ? (val !== null ? val.toFixed(2) : '--') : formatPercent(val)}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* 1D Grid for Momentum */}
            {selectedStrategy === 'momentum' && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '1rem', padding: '1rem 0' }}>
                {results.map((r, i) => {
                  const val = r[heatmapMetric];
                  const bgColor = getCellColor(val, heatmapMetric, minMetric, maxMetric);
                  return (
                    <div
                      key={i}
                      onMouseEnter={() => setHoveredCell(r)}
                      onMouseLeave={() => setHoveredCell(null)}
                      style={{
                        background: bgColor,
                        border: '1px solid var(--border-subtle)',
                        borderRadius: 'var(--radius-sm)',
                        padding: '1rem',
                        textAlign: 'center',
                        cursor: 'pointer'
                      }}
                    >
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>
                        Lookback: {r.parameters.lookback_days} Days
                      </div>
                      <div style={{ fontSize: '1.25rem', fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
                        {heatmapMetric === 'sharpe_ratio' ? (val !== null ? val.toFixed(2) : '--') : formatPercent(val)}
                      </div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                        {r.total_trades} trades &bull; {r.win_rate_pct}% win
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Hovered Cell Detail Box */}
            <div style={{ marginTop: '1rem', padding: '0.75rem 1rem', background: 'var(--bg-surface)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', minHeight: '48px' }}>
              {hoveredCell ? (
                <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center', fontSize: '0.8rem', fontFamily: 'var(--font-mono)' }}>
                  <span style={{ color: 'var(--color-cyan)', fontWeight: 600 }}>
                    Parameters: {JSON.stringify(hoveredCell.parameters)}
                  </span>
                  <span>Return: <strong style={{ color: hoveredCell.total_return_pct >= 0 ? 'var(--color-green)' : 'var(--color-red)' }}>{formatPercent(hoveredCell.total_return_pct)}</strong></span>
                  <span>Sharpe: <strong>{hoveredCell.sharpe_ratio?.toFixed(2)}</strong></span>
                  <span>Max DD: <strong style={{ color: 'var(--color-red)' }}>{formatPercent(hoveredCell.max_drawdown_pct)}</strong></span>
                  <span style={{ color: 'var(--text-muted)' }}>Trades: {hoveredCell.total_trades} (Win: {hoveredCell.win_rate_pct}%)</span>
                </div>
              ) : (
                <span style={{ fontSize: '0.775rem', color: 'var(--text-muted)' }}>
                  Hover over any heatmap cell to view exact parameter performance, win rate, and drawdown metrics.
                </span>
              )}

              {summary?.highest_observed_sharpe && (
                <div style={{ fontSize: '0.725rem', color: 'var(--text-secondary)' }}>
                  Highest Observed Sharpe: <strong>{summary.highest_observed_sharpe.sharpe_ratio?.toFixed(2)}</strong> ({JSON.stringify(summary.highest_observed_sharpe.parameters)})
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* SECTION 2: MARKET REGIME CLASSIFICATION */}
      {activeSubTab === 'regimes' && (
        <>
          <div style={{ marginBottom: '-0.5rem' }}>
            <div style={{ fontSize: '0.8rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-blue)', marginBottom: '0.2rem' }}>
              MARKET REGIMES &bull; Bull &bull; Bear &bull; Neutral &bull; Volatility States &bull; Strategy Attribution
            </div>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: 0 }}>
              Classifies market environments into distinct directional (Bull, Bear, Neutral) and volatility regimes to uncover when strategies generate alpha vs suffer drawdowns.
            </p>
          </div>

          {/* Regime Methodology & Threshold Setup */}
          <div className="content-card" style={{ padding: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <Compass size={16} color="var(--color-cyan)" />
                Regime Parameters &amp; Threshold Configuration
              </span>
              <span style={{ fontSize: '0.725rem', color: 'var(--text-muted)' }}>
                Rule-Based Rolling Classification (Zero Look-Ahead)
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.75rem' }}>
              <div className="lab-input-group">
                <label className="lab-label">Return Window (Days)</label>
                <input
                  type="number"
                  className="lab-input"
                  value={returnWindow}
                  onChange={(e) => setReturnWindow(e.target.value)}
                />
              </div>
              <div className="lab-input-group">
                <label className="lab-label">Volatility Window (Days)</label>
                <input
                  type="number"
                  className="lab-input"
                  value={volatilityWindow}
                  onChange={(e) => setVolatilityWindow(e.target.value)}
                />
              </div>
              <div className="lab-input-group">
                <label className="lab-label">Bull Threshold (%)</label>
                <input
                  type="number"
                  step="0.5"
                  className="lab-input"
                  value={posThreshold}
                  onChange={(e) => setPosThreshold(e.target.value)}
                />
              </div>
              <div className="lab-input-group">
                <label className="lab-label">Bear Threshold (%)</label>
                <input
                  type="number"
                  step="0.5"
                  className="lab-input"
                  value={negThreshold}
                  onChange={(e) => setNegThreshold(e.target.value)}
                />
              </div>
              <div className="lab-input-group">
                <label className="lab-label">Volatility Threshold (Ann %)</label>
                <input
                  type="number"
                  step="1.0"
                  className="lab-input"
                  value={volThreshold}
                  onChange={(e) => setVolThreshold(e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Regime Distribution Summary Badges */}
          {regimesData?.summary?.regimes && (
            <div className="content-card">
              <div className="card-title-row">
                <span className="card-title">
                  <PieChart size={18} color="var(--color-blue)" />
                  Market Regime Distribution (% of Historical Sessions)
                </span>
                <span className="card-action-badge">
                  {regimesData.summary.evaluated_bars} Evaluated Sessions ({regimesData.summary.warmup_bars}d Warm-up)
                </span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem' }}>
                {Object.entries(regimesData.summary.regimes.return_regimes).map(([name, stats]) => {
                  const color = name === 'Bull' ? 'var(--color-green)' : (name === 'Bear' ? 'var(--color-red)' : 'var(--color-cyan)');
                  return (
                    <div key={name} style={{ background: 'var(--bg-surface)', padding: '0.85rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                        <span style={{ fontWeight: 600, color }}>{name} Market</span>
                        <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{stats.percentage_of_period}%</span>
                      </div>
                      <div style={{ fontSize: '0.725rem', color: 'var(--text-muted)' }}>
                        {stats.observations} days &bull; Avg daily: {stats.average_daily_return_pct >= 0 ? '+' : ''}{stats.average_daily_return_pct}%
                      </div>
                    </div>
                  );
                })}

                {Object.entries(regimesData.summary.regimes.volatility_regimes).map(([name, stats]) => {
                  const color = name === 'High Volatility' ? 'var(--color-amber)' : 'var(--color-blue)';
                  return (
                    <div key={name} style={{ background: 'var(--bg-surface)', padding: '0.85rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                        <span style={{ fontWeight: 600, color }}>{name}</span>
                        <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{stats.percentage_of_period}%</span>
                      </div>
                      <div style={{ fontSize: '0.725rem', color: 'var(--text-muted)' }}>
                        {stats.observations} days &bull; Realized Vol: {stats.annualized_volatility_pct}%
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Regime Statistics Table */}
          {regimesData?.summary?.regimes?.combined_regimes && (
            <div className="content-card">
              <div className="card-title-row">
                <span className="card-title">
                  <BarChart2 size={18} color="var(--color-green)" />
                  Quantitative Regime Breakdown (Underlying Asset Behavior)
                </span>
                <span className="card-action-badge">Combined Matrix</span>
              </div>

              <div style={{ overflowX: 'auto', width: '100%' }}>
                <table className="stats-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th>Combined Regime State</th>
                      <th>Sessions</th>
                      <th>% Period</th>
                      <th>Avg Daily Return</th>
                      <th>Annualized Volatility</th>
                      <th>Cumulative Return</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(regimesData.summary.regimes.combined_regimes).map(([cName, cStats]) => (
                      <tr key={cName}>
                        <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{cName}</td>
                        <td style={{ fontFamily: 'var(--font-mono)' }}>{cStats.observations}</td>
                        <td style={{ fontFamily: 'var(--font-mono)' }}>{cStats.percentage_of_period}%</td>
                        <td style={{ fontFamily: 'var(--font-mono)', color: cStats.average_daily_return_pct >= 0 ? 'var(--color-green)' : 'var(--color-red)' }}>
                          {formatPercent(cStats.average_daily_return_pct)}
                        </td>
                        <td style={{ fontFamily: 'var(--font-mono)' }}>{cStats.annualized_volatility_pct}%</td>
                        <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: cStats.cumulative_return_pct >= 0 ? 'var(--color-green)' : 'var(--color-red)' }}>
                          {formatPercent(cStats.cumulative_return_pct)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Strategy Regime Breakdown (Part C) */}
          {regimesData?.strategy_performance_by_regime?.breakdown && (
            <div className="content-card">
              <div className="card-title-row">
                <span className="card-title">
                  <Activity size={18} color="var(--color-cyan)" />
                  Strategy Performance Across Market Regimes ({regimesData.strategy_performance_by_regime.strategy})
                </span>
                <span className="card-action-badge" style={{ color: 'var(--color-green)' }}>
                  Post-Backtest Attribution
                </span>
              </div>

              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
                {regimesData.strategy_performance_by_regime.methodology_note}
              </p>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.25rem' }}>
                {/* By Return Regime */}
                <div style={{ background: 'var(--bg-surface)', padding: '1rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
                  <div style={{ fontWeight: 600, fontSize: '0.85rem', marginBottom: '0.75rem', color: 'var(--color-cyan)' }}>
                    Performance by Return Direction
                  </div>
                  <table className="stats-table" style={{ width: '100%' }}>
                    <thead>
                      <tr>
                        <th>Regime</th>
                        <th>Days</th>
                        <th>Avg Daily</th>
                        <th>Cumulative Strategy</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(regimesData.strategy_performance_by_regime.breakdown.return_regimes).map(([rKey, rStat]) => (
                        <tr key={rKey}>
                          <td style={{ fontWeight: 600 }}>{rKey}</td>
                          <td style={{ fontFamily: 'var(--font-mono)' }}>{rStat.observations}</td>
                          <td style={{ fontFamily: 'var(--font-mono)', color: rStat.average_daily_return_pct >= 0 ? 'var(--color-green)' : 'var(--color-red)' }}>
                            {formatPercent(rStat.average_daily_return_pct)}
                          </td>
                          <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: rStat.cumulative_strategy_return_pct >= 0 ? 'var(--color-green)' : 'var(--color-red)' }}>
                            {formatPercent(rStat.cumulative_strategy_return_pct)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* By Volatility Regime */}
                <div style={{ background: 'var(--bg-surface)', padding: '1rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
                  <div style={{ fontWeight: 600, fontSize: '0.85rem', marginBottom: '0.75rem', color: 'var(--color-blue)' }}>
                    Performance by Volatility Regime
                  </div>
                  <table className="stats-table" style={{ width: '100%' }}>
                    <thead>
                      <tr>
                        <th>Regime</th>
                        <th>Days</th>
                        <th>Avg Daily</th>
                        <th>Cumulative Strategy</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(regimesData.strategy_performance_by_regime.breakdown.volatility_regimes).map(([vKey, vStat]) => (
                        <tr key={vKey}>
                          <td style={{ fontWeight: 600 }}>{vKey}</td>
                          <td style={{ fontFamily: 'var(--font-mono)' }}>{vStat.observations}</td>
                          <td style={{ fontFamily: 'var(--font-mono)', color: vStat.average_daily_return_pct >= 0 ? 'var(--color-green)' : 'var(--color-red)' }}>
                            {formatPercent(vStat.average_daily_return_pct)}
                          </td>
                          <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: vStat.cumulative_strategy_return_pct >= 0 ? 'var(--color-green)' : 'var(--color-red)' }}>
                            {formatPercent(vStat.cumulative_strategy_return_pct)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
