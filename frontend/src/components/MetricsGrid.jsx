import React, { useState, useEffect } from 'react';
import { HelpCircle, TrendingUp, Activity, BarChart2, ShieldAlert } from 'lucide-react';

const METRIC_DEFINITIONS = [
  {
    id: 'return',
    title: 'RETURN',
    defaultValue: '--',
    icon: TrendingUp,
    colorClass: 'color-positive',
    subtext: 'Historical performance',
    explanation: 'Total historical capital return across the selected observation window.',
    accentColor: '#16A34A',
    sparklineColor: '#16A34A',
    bgIcon: 'rgba(22, 163, 74, 0.08)'
  },
  {
    id: 'volatility',
    title: 'VOLATILITY',
    defaultValue: '--',
    icon: Activity,
    colorClass: 'color-navy',
    subtext: 'Return variability',
    explanation: 'Annualized sample dispersion of daily returns (daily σ × √252).',
    accentColor: '#2563EB',
    sparklineColor: '#2563EB',
    bgIcon: 'rgba(37, 99, 235, 0.08)'
  },
  {
    id: 'sharpe',
    title: 'SHARPE',
    defaultValue: '--',
    icon: BarChart2,
    colorClass: 'color-navy',
    subtext: 'Risk-adjusted performance',
    explanation: 'Excess return generated per unit of realized volatility (assuming 0% risk-free rate).',
    accentColor: '#0891B2',
    sparklineColor: '#0891B2',
    bgIcon: 'rgba(8, 145, 178, 0.08)'
  },
  {
    id: 'drawdown',
    title: 'MAX DRAWDOWN',
    defaultValue: '--',
    icon: ShieldAlert,
    colorClass: 'color-negative',
    subtext: 'Largest historical fall',
    explanation: 'Maximum observed peak-to-trough decline before reaching a new peak.',
    accentColor: '#DC2626',
    sparklineColor: '#DC2626',
    bgIcon: 'rgba(220, 38, 38, 0.08)'
  },
];

// Helper to generate a normalized SVG path from real price points
function generateSparkline(dataPoints, width = 75, height = 30) {
  if (!dataPoints || dataPoints.length < 2) {
    return 'M 0 20 Q 20 15 40 22 T 75 12';
  }
  // Sample up to 20 points
  const step = Math.max(1, Math.floor(dataPoints.length / 20));
  const sampled = [];
  for (let i = 0; i < dataPoints.length; i += step) {
    sampled.push(dataPoints[i]);
  }
  if (sampled[sampled.length - 1] !== dataPoints[dataPoints.length - 1]) {
    sampled.push(dataPoints[dataPoints.length - 1]);
  }

  const min = Math.min(...sampled);
  const max = Math.max(...sampled);
  const range = max - min || 1;

  const points = sampled.map((val, idx) => {
    const x = (idx / (sampled.length - 1)) * width;
    const y = height - ((val - min) / range) * (height - 6) - 3;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  return `M ${points.join(' L ')}`;
}

export default function MetricsGrid({ metrics = {}, seriesData = [], sparklines = null }) {
  const [activeTooltip, setActiveTooltip] = useState(null);

  useEffect(() => {
    const handleOutsideClick = () => setActiveTooltip(null);
    window.addEventListener('click', handleOutsideClick);
    return () => window.removeEventListener('click', handleOutsideClick);
  }, []);

  // Extract series arrays from seriesData or backend sparklines
  const returnSeries = sparklines?.return_sparkline || (seriesData?.length ? seriesData.map(d => d.cumulative_return_pct ?? d.close ?? 0) : null);
  const volSeries = sparklines?.volatility_sparkline || (seriesData?.length ? seriesData.map(d => Math.abs(d.daily_return_pct ?? 0)) : null);
  const sharpeSeries = sparklines?.sharpe_sparkline || (seriesData?.length ? seriesData.map(d => (d.daily_return_pct ?? 0)) : null);
  const ddSeries = sparklines?.drawdown_sparkline || (seriesData?.length ? seriesData.map(d => d.drawdown_pct ?? 0) : null);

  return (
    <div className="metrics-strip">
      {METRIC_DEFINITIONS.map((def) => {
        const IconComponent = def.icon;
        const metricData = metrics[def.id];
        
        let displayVal = def.defaultValue;
        let colorClass = def.colorClass;
        let subtext = def.subtext;

        if (metricData !== undefined && metricData !== null) {
          if (typeof metricData === 'object' && metricData.value !== undefined) {
            displayVal = metricData.value;
            if (metricData.subtext) subtext = metricData.subtext;
            if (def.id === 'return') {
              colorClass = displayVal.startsWith('+') ? 'color-positive' : (displayVal.startsWith('-') ? 'color-negative' : 'color-positive');
            } else if (def.id === 'drawdown') {
              colorClass = 'color-negative';
            }
          } else {
            displayVal = String(metricData);
            if (def.id === 'return') {
              colorClass = displayVal.startsWith('+') ? 'color-positive' : (displayVal.startsWith('-') ? 'color-negative' : '');
            } else if (def.id === 'drawdown') {
              colorClass = 'color-negative';
            }
          }
        }

        const isHovered = activeTooltip === def.id;

        // Distinct sparkline paths strictly derived from real data
        let currentSeries = null;
        if (def.id === 'return') currentSeries = returnSeries;
        else if (def.id === 'volatility') currentSeries = volSeries;
        else if (def.id === 'sharpe') currentSeries = sharpeSeries;
        else if (def.id === 'drawdown') currentSeries = ddSeries;

        const sparkPath = (currentSeries && currentSeries.length >= 2) 
          ? generateSparkline(currentSeries, 75, 28) 
          : 'M 0 15 L 75 15';

        return (
          <div 
            key={def.id} 
            className="kpi-card"
            style={{ '--card-accent': def.accentColor }}
          >
            <div className="kpi-card-top">
              <div className="kpi-meta">
                <span className="kpi-icon-badge" style={{ color: def.accentColor, background: def.bgIcon }}>
                  <IconComponent size={14} strokeWidth={2.4} />
                </span>
                <span className="kpi-label">{def.title}</span>
              </div>
              <button
                type="button"
                className="kpi-help-btn"
                aria-label={`Definition for ${def.title}`}
                onMouseEnter={() => setActiveTooltip(def.id)}
                onMouseLeave={() => setActiveTooltip(null)}
                onClick={(e) => {
                  e.stopPropagation();
                  setActiveTooltip(activeTooltip === def.id ? null : def.id);
                }}
              >
                <HelpCircle size={13} />
              </button>
            </div>

            {isHovered && (
              <div className="kpi-tooltip-popover" role="tooltip">
                {def.explanation}
              </div>
            )}

            <div className="kpi-body-row">
              <div>
                <div className={`kpi-val ${colorClass}`}>
                  {displayVal}
                </div>
                <div className="kpi-sub">
                  {subtext}
                </div>
              </div>

              {/* Mini Sparkline Graph */}
              <div className="kpi-sparkline" aria-hidden="true">
                <svg width="75" height="30" viewBox="0 0 75 30" fill="none">
                  <path 
                    d={sparkPath} 
                    stroke={def.sparklineColor} 
                    strokeWidth="1.8" 
                    strokeLinecap="round" 
                    strokeLinejoin="round" 
                  />
                </svg>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
