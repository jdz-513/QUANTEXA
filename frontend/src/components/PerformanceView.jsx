import React, { useState, useMemo } from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  LineChart,
  Line,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine
} from 'recharts';
import { 
  TrendingUp, 
  ShieldAlert, 
  Activity, 
  Award, 
  Calendar, 
  BarChart2, 
  Percent, 
  HelpCircle,
  Clock,
  Layers,
  CheckCircle2
} from 'lucide-react';
import PerformanceRiskSummary from './PerformanceRiskSummary';
import GlobalAnalysisControls from './GlobalAnalysisControls';

const formatPercent = (val) => {
  if (val === null || val === undefined || isNaN(val)) return '--';
  const num = Number(val);
  const sign = num > 0 ? '+' : '';
  return `${sign}${num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
};

const formatCurrency = (val) => {
  if (val === null || val === undefined || isNaN(val)) return '--';
  return '$' + Number(val).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const CustomPerformanceTooltip = ({ active, payload }) => {
  if (active && payload && payload.length) {
    const d = payload[0].payload;
    const cumRet = d.cumulative_return_pct;
    const dailyRet = d.daily_return_pct;
    const dd = d.drawdown_pct;

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
          <span style={{ color: 'var(--text-muted)' }}>Close Price:</span>
          <span style={{ fontWeight: 600, color: '#0f172a' }}>{formatCurrency(d.close)}</span>

          <span style={{ color: 'var(--text-muted)' }}>Cumulative Return:</span>
          <span style={{ fontWeight: 700, color: cumRet >= 0 ? 'var(--color-green)' : 'var(--color-red)' }}>
            {formatPercent(cumRet)}
          </span>

          <span style={{ color: 'var(--text-muted)' }}>Daily Return:</span>
          <span style={{ color: dailyRet >= 0 ? 'var(--color-green)' : 'var(--color-red)' }}>
            {formatPercent(dailyRet)}
          </span>

          <span style={{ color: 'var(--text-muted)' }}>Peak Drawdown:</span>
          <span style={{ color: 'var(--color-red)', fontWeight: 600 }}>
            {formatPercent(dd)}
          </span>
        </div>
      </div>
    );
  }
  return null;
};

const CustomRollingTooltip = ({ active, payload, rollingWindow }) => {
  if (active && payload && payload.length) {
    const d = payload[0].payload;
    return (
      <div style={{
        background: '#ffffff',
        border: '1px solid #e2e8f0',
        borderRadius: '6px',
        padding: '0.75rem 1rem',
        boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1)',
        fontSize: '0.75rem',
        fontFamily: 'var(--font-mono)',
        color: '#0f172a',
      }}>
        <div style={{ fontWeight: 600, color: 'var(--color-blue)', marginBottom: '0.4rem', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.25rem' }}>
          {d.date}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'auto auto', gap: '0.25rem 0.75rem' }}>
          <span style={{ color: 'var(--text-muted)' }}>{rollingWindow}D Rolling Return:</span>
          <span style={{ fontWeight: 700, color: (d.rolling_return ?? 0) >= 0 ? 'var(--color-green)' : 'var(--color-red)' }}>
            {d.rolling_return !== null ? formatPercent(d.rolling_return) : 'Warmup'}
          </span>
          <span style={{ color: 'var(--text-muted)' }}>{rollingWindow}D Rolling Vol (ann):</span>
          <span style={{ fontWeight: 600, color: 'var(--color-blue)' }}>
            {d.rolling_vol !== null ? `${d.rolling_vol.toFixed(2)}%` : 'Warmup'}
          </span>
        </div>
      </div>
    );
  }
  return null;
};

export default function PerformanceView({
  selectedAsset,
  onSelectAsset,
  datePreset,
  onSelectPreset,
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
  analyticsData,
  isLoading,
  error
}) {
  const [activeChartMode, setActiveChartMode] = useState('cumulative'); // 'cumulative' | 'daily'
  const [rollingWindow, setRollingWindow] = useState(20); // 20 | 30 | 60 | 90
  const [activeTab, setActiveTab] = useState('returns');

  // Compute rolling return and rolling annualized volatility dynamically from daily series
  const seriesWithRolling = useMemo(() => {
    const raw = analyticsData?.series;
    if (!raw || raw.length === 0) return [];
    const w = Number(rollingWindow);

    return raw.map((item, idx) => {
      let rollingRet = null;
      if (idx >= w) {
        const pCurrent = item.close;
        const pPast = raw[idx - w].close;
        if (pPast > 0) {
          rollingRet = ((pCurrent - pPast) / pPast) * 100;
        }
      }

      // Rolling annualized volatility: std(daily_return_pct) * sqrt(252)
      const windowDaily = [];
      for (let i = idx - w + 1; i <= idx; i++) {
        const ret = raw[i]?.daily_return_pct;
        if (ret !== null && ret !== undefined && !isNaN(ret)) {
          windowDaily.push(ret);
        }
      }

      let rollingVol = 0.0;
      if (windowDaily.length >= 2) {
        const mean = windowDaily.reduce((acc, v) => acc + v, 0) / windowDaily.length;
        const variance = windowDaily.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / (windowDaily.length - 1);
        const stdDaily = Math.sqrt(variance);
        rollingVol = stdDaily * Math.sqrt(252);
      }

      return {
        ...item,
        rolling_return: rollingRet,
        rolling_vol: rollingVol
      };
    });
  }, [analyticsData, rollingWindow]);

  const series = seriesWithRolling;
  const summary = analyticsData?.summary || {};
  const isCumulativePositive = (summary.total_return_pct ?? 0) >= 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* 1. GLOBAL ASSET + RANGE CONTROLS */}
      <GlobalAnalysisControls 
        selectedAsset={selectedAsset}
        onSelectAsset={onSelectAsset}
        datePreset={datePreset}
        onSelectPreset={onSelectPreset}
        startDate={startDate}
        endDate={endDate}
        onStartDateChange={onStartDateChange}
        onEndDateChange={onEndDateChange}
      />

      {/* 2. PERFORMANCE & RISK EXECUTIVE SUMMARY DASHBOARD */}
      <PerformanceRiskSummary 
        analyticsData={analyticsData} 
        isLoading={isLoading} 
        error={error} 
        asset={selectedAsset || analyticsData?.asset}
        startDate={startDate}
        endDate={endDate}
      />

      {/* 3. PERFORMANCE CHART: CUMULATIVE VS DAILY */}
      <div className="content-card">
        <div className="card-title-row" style={{ flexWrap: 'wrap', gap: '0.75rem' }}>
          <span className="card-title">
            <TrendingUp size={18} color="var(--color-green)" />
            3. Performance Dynamics — {selectedAsset?.name || analyticsData?.asset?.name || 'Asset'}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <button 
              type="button" 
              className={`indicator-toggle ${activeChartMode === 'cumulative' ? 'active-ema' : ''}`}
              onClick={() => setActiveChartMode('cumulative')}
            >
              Cumulative Return (%)
            </button>
            <button 
              type="button" 
              className={`indicator-toggle ${activeChartMode === 'daily' ? 'active-sma-fast' : ''}`}
              onClick={() => setActiveChartMode('daily')}
            >
              Daily Fluctuations (%)
            </button>
            <span className="card-action-badge">Vectorized Returns</span>
          </div>
        </div>

        <div style={{ width: '100%', height: 320, marginTop: '0.5rem' }}>
          <ResponsiveContainer width="100%" height="100%">
            {activeChartMode === 'cumulative' ? (
              <AreaChart data={series} margin={{ top: 10, right: 10, left: 15, bottom: 0 }}>
                <defs>
                  <linearGradient id="cumRetGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop 
                      offset="5%" 
                      stopColor={isCumulativePositive ? 'var(--color-green)' : 'var(--color-red)'} 
                      stopOpacity={0.15} 
                    />
                    <stop 
                      offset="95%" 
                      stopColor={isCumulativePositive ? 'var(--color-green)' : 'var(--color-red)'} 
                      stopOpacity={0.0} 
                    />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis 
                  dataKey="date" 
                  tickLine={false} 
                  axisLine={{ stroke: '#cbd5e1' }}
                  tick={{ fill: '#64748b', fontSize: 11, fontFamily: 'var(--font-mono)' }}
                  minTickGap={40}
                />
                <YAxis 
                  tickLine={false} 
                  axisLine={{ stroke: '#cbd5e1' }}
                  tick={{ fill: '#64748b', fontSize: 11, fontFamily: 'var(--font-mono)' }}
                  tickFormatter={(v) => `${v > 0 ? '+' : ''}${v.toFixed(1)}%`}
                  orientation="right"
                />
                <Tooltip content={<CustomPerformanceTooltip />} />
                <ReferenceLine y={0} stroke="#cbd5e1" strokeDasharray="2 2" />
                <Area 
                  type="monotone" 
                  dataKey="cumulative_return_pct" 
                  stroke={isCumulativePositive ? 'var(--color-green)' : 'var(--color-red)'} 
                  strokeWidth={2}
                  fillOpacity={1} 
                  fill="url(#cumRetGradient)" 
                  isAnimationActive={true}
                  animationDuration={400}
                />
              </AreaChart>
            ) : (
              <BarChart data={series} margin={{ top: 10, right: 10, left: 15, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis 
                  dataKey="date" 
                  tickLine={false} 
                  axisLine={{ stroke: '#cbd5e1' }}
                  tick={{ fill: '#64748b', fontSize: 11, fontFamily: 'var(--font-mono)' }}
                  minTickGap={40}
                />
                <YAxis 
                  tickLine={false} 
                  axisLine={{ stroke: '#cbd5e1' }}
                  tick={{ fill: '#64748b', fontSize: 11, fontFamily: 'var(--font-mono)' }}
                  tickFormatter={(v) => `${v > 0 ? '+' : ''}${v.toFixed(1)}%`}
                  orientation="right"
                />
                <Tooltip content={<CustomPerformanceTooltip />} />
                <ReferenceLine y={0} stroke="#cbd5e1" />
                <Bar dataKey="daily_return_pct">
                  {series.map((entry, index) => (
                    <Cell 
                      key={`cell-${index}`} 
                      fill={(entry.daily_return_pct ?? 0) >= 0 ? 'var(--color-green)' : 'var(--color-red)'} 
                    />
                  ))}
                </Bar>
              </BarChart>
            )}
          </ResponsiveContainer>
        </div>
      </div>

      {/* 3. ROLLING PERFORMANCE & VOLATILITY */}
      <div className="content-card">
        <div className="card-title-row" style={{ flexWrap: 'wrap', gap: '0.75rem' }}>
          <div>
            <span className="card-title">
              <Clock size={18} color="var(--color-blue)" />
              3. Rolling Performance &amp; Realized Volatility ({rollingWindow}-Session Window)
            </span>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
              Tracks evolving return momentum and localized volatility regimes across time.
            </div>
          </div>
          <div style={{ display: 'flex', gap: '0.35rem' }}>
            {[30, 60, 90].map((w) => (
              <button
                key={w}
                type="button"
                className={`preset-btn ${rollingWindow === w ? 'active' : ''}`}
                onClick={() => setRollingWindow(w)}
                style={{ padding: '0.25rem 0.65rem', fontSize: '0.75rem' }}
              >
                {w}D Window
              </button>
            ))}
          </div>
        </div>

        <div style={{ width: '100%', height: 280, marginTop: '0.5rem' }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={series} margin={{ top: 10, right: 10, left: 15, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis 
                dataKey="date" 
                tickLine={false} 
                axisLine={{ stroke: '#cbd5e1' }}
                tick={{ fill: '#64748b', fontSize: 11, fontFamily: 'var(--font-mono)' }}
                minTickGap={40}
              />
              <YAxis 
                tickLine={false} 
                axisLine={{ stroke: '#cbd5e1' }}
                tick={{ fill: '#64748b', fontSize: 11, fontFamily: 'var(--font-mono)' }}
                tickFormatter={(v) => `${v > 0 ? '+' : ''}${v.toFixed(0)}%`}
                orientation="right"
              />
              <Tooltip content={<CustomRollingTooltip rollingWindow={rollingWindow} />} />
              <ReferenceLine y={0} stroke="#cbd5e1" strokeDasharray="3 3" />
              <Line 
                type="monotone" 
                dataKey="rolling_return" 
                name={`${rollingWindow}D Return`} 
                stroke="#16a34a" 
                strokeWidth={2}
                dot={false}
                connectNulls={false}
              />
              <Line 
                type="monotone" 
                dataKey="rolling_vol" 
                name={`${rollingWindow}D Volatility (Ann)`} 
                stroke="#2563eb" 
                strokeWidth={1.8}
                strokeDasharray="4 4"
                dot={false}
                connectNulls={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div style={{ display: 'flex', gap: '1.5rem', justifyContent: 'center', marginTop: '0.5rem', fontSize: '0.75rem', fontFamily: 'var(--font-mono)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <div style={{ width: 12, height: 3, background: '#16a34a', borderRadius: 2 }} />
            <span>{rollingWindow}-Day Rolling Return (%)</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <div style={{ width: 12, height: 3, background: '#2563eb', borderRadius: 2 }} />
            <span>{rollingWindow}-Day Annualized Volatility (%)</span>
          </div>
        </div>
      </div>

      {/* 4 & 5: RISK METRICS TABLE + DRAWDOWN VISUALIZATION */}
      <div className="dashboard-grid">
        {/* 4. QUANTITATIVE RISK METRICS TABLE */}
        <div className="content-card">
          <div className="card-title-row">
            <span className="card-title">
              <Activity size={18} color="var(--color-blue)" />
              4. Quantitative Risk &amp; Distribution Profile
            </span>
            <span className="card-action-badge">252 Trading Days Basis</span>
          </div>

          <table className="stats-table" style={{ marginTop: '0.5rem' }}>
            <thead>
              <tr>
                <th>Statistical Metric</th>
                <th style={{ textAlign: 'right' }}>Calculated Value</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="stat-label">Cumulative Return</td>
                <td className="stat-value" style={{ color: (summary.total_return_pct ?? 0) >= 0 ? 'var(--color-green)' : 'var(--color-red)' }}>
                  {formatPercent(summary.total_return_pct)}
                </td>
              </tr>
              <tr>
                <td className="stat-label">CAGR (Compound Annual Growth)</td>
                <td className="stat-value" style={{ color: (summary.cagr_pct ?? 0) >= 0 ? 'var(--color-green)' : 'var(--color-red)' }}>
                  {formatPercent(summary.cagr_pct)}
                </td>
              </tr>
              <tr>
                <td className="stat-label">Daily Volatility (σ daily)</td>
                <td className="stat-value" style={{ color: 'var(--text-primary)' }}>
                  {summary.daily_volatility_pct !== null ? `${summary.daily_volatility_pct.toFixed(2)}%` : '--'}
                </td>
              </tr>
              <tr>
                <td className="stat-label">Annualized Volatility (σ × √252)</td>
                <td className="stat-value" style={{ color: 'var(--color-blue)' }}>
                  {summary.annualized_volatility_pct !== null ? `${summary.annualized_volatility_pct.toFixed(2)}%` : '--'}
                </td>
              </tr>
              <tr>
                <td className="stat-label">Sharpe Ratio (0% Risk-Free)</td>
                <td className="stat-value" style={{ color: (summary.sharpe_ratio ?? 0) >= 1 ? 'var(--color-green)' : ((summary.sharpe_ratio ?? 0) >= 0 ? 'var(--text-primary)' : 'var(--color-red)') }}>
                  {summary.sharpe_ratio !== null ? summary.sharpe_ratio.toFixed(2) : '--'}
                </td>
              </tr>
              <tr>
                <td className="stat-label">Maximum Peak-to-Trough Drawdown</td>
                <td className="stat-value" style={{ color: 'var(--color-red)' }}>
                  {summary.max_drawdown_pct !== null ? `${summary.max_drawdown_pct.toFixed(2)}%` : '--'}
                </td>
              </tr>
              <tr>
                <td className="stat-label">Win Rate (% Positive Sessions)</td>
                <td className="stat-value" style={{ color: 'var(--text-primary)' }}>
                  {summary.win_rate_pct !== null ? `${summary.win_rate_pct.toFixed(1)}%` : '--'}
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginLeft: 6 }}>
                    ({summary.positive_days}/{summary.trading_sessions})
                  </span>
                </td>
              </tr>
              <tr>
                <td className="stat-label">Best Single Session Return</td>
                <td className="stat-value" style={{ color: 'var(--color-green)' }}>
                  {formatPercent(summary.best_day_pct)}
                </td>
              </tr>
              <tr>
                <td className="stat-label">Worst Single Session Return</td>
                <td className="stat-value" style={{ color: 'var(--color-red)' }}>
                  {formatPercent(summary.worst_day_pct)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* 5. DRAWDOWN VISUALIZATION */}
        <div className="content-card">
          <div className="card-title-row">
            <span className="card-title">
              <ShieldAlert size={18} color="var(--color-red)" />
              5. Underwater Drawdown Profile
            </span>
            <span className="card-action-badge">Peak-to-Trough Decline</span>
          </div>

          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '0.6rem 0.85rem',
            background: 'var(--bg-surface)',
            borderRadius: 'var(--radius-sm)',
            margin: '0.5rem 0 1rem',
            border: '1px solid var(--border-subtle)',
            fontSize: '0.78rem',
            fontFamily: 'var(--font-mono)'
          }}>
            <div>
              <span style={{ color: 'var(--text-muted)', marginRight: 6 }}>Max Drawdown:</span>
              <span style={{ fontWeight: 700, color: 'var(--color-red)' }}>
                {summary.max_drawdown_pct !== null ? `${summary.max_drawdown_pct.toFixed(2)}%` : '--'}
              </span>
            </div>
            <div style={{ color: 'var(--text-muted)' }}>
              Peak: <span style={{ color: 'var(--text-primary)' }}>{summary.max_drawdown_peak_date || '--'}</span>
              {' → '}
              Trough: <span style={{ color: 'var(--color-red)' }}>{summary.max_drawdown_trough_date || '--'}</span>
            </div>
          </div>

          <div style={{ width: '100%', height: 260 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={series} margin={{ top: 10, right: 10, left: 15, bottom: 0 }}>
                <defs>
                  <linearGradient id="drawdownGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#dc2626" stopOpacity={0.0} />
                    <stop offset="95%" stopColor="#dc2626" stopOpacity={0.25} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis 
                  dataKey="date" 
                  tickLine={false} 
                  axisLine={{ stroke: '#cbd5e1' }}
                  tick={{ fill: '#64748b', fontSize: 11, fontFamily: 'var(--font-mono)' }}
                  minTickGap={40}
                />
                <YAxis 
                  domain={['dataMin', 0]}
                  tickLine={false} 
                  axisLine={{ stroke: '#cbd5e1' }}
                  tick={{ fill: '#64748b', fontSize: 11, fontFamily: 'var(--font-mono)' }}
                  tickFormatter={(v) => `${v.toFixed(1)}%`}
                  orientation="right"
                />
                <Tooltip content={<CustomPerformanceTooltip />} />
                <ReferenceLine y={0} stroke="#cbd5e1" />
                <Area 
                  type="monotone" 
                  dataKey="drawdown_pct" 
                  stroke="#dc2626" 
                  strokeWidth={1.8} 
                  fillOpacity={1} 
                  fill="url(#drawdownGradient)" 
                  isAnimationActive={true}
                  animationDuration={400}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
