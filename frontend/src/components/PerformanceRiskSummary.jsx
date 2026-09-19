import React, { useState, useEffect } from 'react';
import { 
  TrendingUp, 
  ShieldAlert, 
  Activity, 
  Award, 
  Percent, 
  HelpCircle 
} from 'lucide-react';
import { fetchAnalytics } from '../services/api';

const formatPercent = (val) => {
  if (val === null || val === undefined || isNaN(val)) return '--';
  const num = Number(val);
  const sign = num > 0 ? '+' : '';
  return `${sign}${num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
};

/**
 * PerformanceRiskSummary
 * Shared, reusable institutional quantitative summary component displaying 5 key metrics:
 * 1. PERFORMANCE (Cumulative Return + CAGR)
 * 2. SHARPE RATIO (Sharpe + Annualized 0% Rf)
 * 3. VOLATILITY (Annualized Volatility + Daily σ)
 * 4. MAX DRAWDOWN (Maximum Peak-to-Trough Drawdown)
 * 5. POSITIVE SESSIONS (Win Rate % + Session Count)
 */
export default function PerformanceRiskSummary({
  analyticsData: propAnalyticsData,
  isLoading: propIsLoading,
  error: propError,
  asset,
  startDate,
  endDate
}) {
  const [activeTooltip, setActiveTooltip] = useState(null);

  const assetId = asset?.id || (typeof asset === 'string' ? asset : propAnalyticsData?.asset?.id);

  // Check if propAnalyticsData is present and matches the target asset
  const matchesProp = Boolean(
    propAnalyticsData && 
    propAnalyticsData.summary && 
    (!assetId || propAnalyticsData.asset?.id === assetId)
  );

  const [internalData, setInternalData] = useState(matchesProp ? propAnalyticsData : null);
  const [internalLoading, setInternalLoading] = useState(false);
  const [internalError, setInternalError] = useState(null);

  useEffect(() => {
    if (matchesProp) {
      setInternalData(propAnalyticsData);
      setInternalLoading(false);
      setInternalError(null);
      return;
    }

    if (!assetId || !startDate || !endDate) return;

    let isMounted = true;
    setInternalLoading(true);
    setInternalError(null);

    fetchAnalytics(assetId, startDate, endDate, 20, 50, 20, 0.0)
      .then((data) => {
        if (isMounted) {
          setInternalData(data);
          setInternalLoading(false);
        }
      })
      .catch((err) => {
        if (isMounted) {
          const msg = err.response?.data?.detail || err.message || 'Error loading executive summary metrics';
          setInternalError(msg);
          setInternalLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [assetId, startDate, endDate, propAnalyticsData, matchesProp]);

  const activeData = matchesProp ? propAnalyticsData : internalData;
  const summary = activeData?.summary || {};
  const activeLoading = matchesProp ? propIsLoading : internalLoading;

  const SUMMARY_KPIS = [
    {
      id: 'return',
      label: 'PERFORMANCE',
      val: formatPercent(summary.total_return_pct),
      color: (summary.total_return_pct ?? 0) >= 0 ? 'var(--color-green)' : 'var(--color-red)',
      accentColor: '#16A34A',
      bgIcon: 'rgba(22, 163, 74, 0.08)',
      sub: `CAGR: ${formatPercent(summary.cagr_pct)}`,
      icon: TrendingUp,
      tooltip: 'Cumulative historical return over the selected period.'
    },
    {
      id: 'sharpe',
      label: 'SHARPE RATIO',
      val: summary.sharpe_ratio !== null && summary.sharpe_ratio !== undefined ? summary.sharpe_ratio.toFixed(2) : '--',
      color: (summary.sharpe_ratio ?? 0) >= 1.0 ? 'var(--color-green)' : ((summary.sharpe_ratio ?? 0) >= 0 ? 'var(--text-primary)' : 'var(--color-red)'),
      accentColor: '#0891B2',
      bgIcon: 'rgba(8, 145, 178, 0.08)',
      sub: 'Annualized (0% Rf)',
      icon: Award,
      tooltip: 'Risk-adjusted return using a 0% risk-free rate.'
    },
    {
      id: 'volatility',
      label: 'VOLATILITY',
      val: summary.annualized_volatility_pct !== null && summary.annualized_volatility_pct !== undefined ? `${summary.annualized_volatility_pct.toFixed(2)}%` : '--',
      color: 'var(--text-primary)',
      accentColor: '#2563EB',
      bgIcon: 'rgba(37, 99, 235, 0.08)',
      sub: `Daily σ: ${(summary.daily_volatility_pct ?? 0).toFixed(2)}%`,
      icon: Activity,
      tooltip: 'Annualized variability of historical returns.'
    },
    {
      id: 'drawdown',
      label: 'MAX DRAWDOWN',
      val: summary.max_drawdown_pct !== null && summary.max_drawdown_pct !== undefined ? `${summary.max_drawdown_pct.toFixed(2)}%` : '--',
      color: 'var(--color-red)',
      accentColor: '#DC2626',
      bgIcon: 'rgba(220, 38, 38, 0.08)',
      sub: 'Peak-to-Trough Decline',
      icon: ShieldAlert,
      tooltip: 'Largest peak-to-trough historical decline.'
    },
    {
      id: 'win_rate',
      label: 'POSITIVE SESSIONS',
      val: summary.win_rate_pct !== null && summary.win_rate_pct !== undefined ? `${summary.win_rate_pct.toFixed(1)}%` : '--',
      color: 'var(--text-primary)',
      accentColor: '#2563EB',
      bgIcon: 'rgba(37, 99, 235, 0.08)',
      sub: summary.trading_sessions ? `${(summary.positive_days || 0).toLocaleString()} / ${(summary.trading_sessions || 0).toLocaleString()} sessions` : 'Positive Sessions / Total Sessions',
      icon: Percent,
      tooltip: 'Percentage of sessions with a positive return.'
    }
  ];

  return (
    <section className="perf-summary-section">
      <div className="perf-summary-header">
        <div className="perf-summary-title-wrap">
          <div className="perf-header-accent" />
          <h2 className="perf-summary-title">
            PERFORMANCE &amp; RISK EXECUTIVE SUMMARY
          </h2>
        </div>
        <span className="perf-summary-hint">
          Hover (?) for financial definitions
        </span>
      </div>

      <div className="perf-metrics-grid">
        {SUMMARY_KPIS.map((kpi) => {
          const Icon = kpi.icon;
          const isHovered = activeTooltip === kpi.id;
          return (
            <div 
              key={kpi.id} 
              className="perf-summary-card" 
              style={{ '--card-accent': kpi.accentColor }}
            >
              <div className="perf-card-top">
                <div className="perf-card-meta">
                  <div 
                    className="perf-icon-box"
                    style={{ color: kpi.accentColor, background: kpi.bgIcon }}
                  >
                    <Icon size={14} strokeWidth={2.4} />
                  </div>
                  <span className="perf-card-label">{kpi.label}</span>
                </div>
                <button
                  type="button"
                  className="perf-help-trigger"
                  aria-label={`Definition for ${kpi.label}`}
                  onMouseEnter={() => setActiveTooltip(kpi.id)}
                  onMouseLeave={() => setActiveTooltip(null)}
                  onClick={(e) => {
                    e.stopPropagation();
                    setActiveTooltip(activeTooltip === kpi.id ? null : kpi.id);
                  }}
                >
                  <HelpCircle size={13} />
                </button>
              </div>

              {isHovered && (
                <div className="perf-tooltip-popover" role="tooltip">
                  {kpi.tooltip}
                </div>
              )}

              <div className="perf-card-body">
                <div 
                  className="perf-card-val" 
                  style={{ color: activeLoading && !summary.total_return_pct ? 'var(--text-muted)' : kpi.color }}
                >
                  {activeLoading && !summary.total_return_pct ? '...' : kpi.val}
                </div>
                <div className="perf-card-sub">
                  {kpi.sub}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
