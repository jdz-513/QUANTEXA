import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
} from 'recharts';
import { 
  AlertCircle, 
  RefreshCw, 
  BarChart2, 
  RotateCcw, 
  ZoomIn, 
  Maximize2,
  MoveHorizontal,
  Sliders,
  Calendar
} from 'lucide-react';

const formatCurrency = (val) => {
  if (val === null || val === undefined || isNaN(val)) return '--';
  const num = Number(val);
  if (num >= 1000) {
    return '$' + num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  return '$' + num.toFixed(2);
};

const formatVolume = (val) => {
  if (!val || isNaN(val)) return '0';
  if (val >= 1e9) return (val / 1e9).toFixed(2) + 'B';
  if (val >= 1e6) return (val / 1e6).toFixed(2) + 'M';
  if (val >= 1e3) return (val / 1e3).toFixed(1) + 'K';
  return Number(val).toLocaleString();
};

const formatDisplayDate = (dateStr) => {
  if (!dateStr) return '--';
  const parts = String(dateStr).split('T')[0].split('-');
  if (parts.length === 3) {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const month = months[parseInt(parts[1], 10) - 1] || parts[1];
    const day = parseInt(parts[2], 10);
    const year = parts[0];
    return `${month} ${day}, ${year}`;
  }
  return dateStr;
};

// High-readability Quantitative Crosshair Tooltip
const CustomChartTooltip = ({ 
  active, 
  payload, 
  smaPeriodFast, 
  smaPeriodSlow, 
  emaPeriod,
  showPrice,
  showSmaFast,
  showSmaSlow,
  showEma
}) => {
  if (!active || !payload || !payload.length) return null;
  const d = payload[0]?.payload;
  if (!d) return null;

  return (
    <div className="quant-crosshair-tooltip">
      <div className="tooltip-header-date">
        {formatDisplayDate(d.date)}
      </div>

      <div className="tooltip-data-grid">
        {/* Open */}
        {d.open != null && (
          <div className="tooltip-row">
            <span className="tooltip-label">Open</span>
            <span className="tooltip-val">{formatCurrency(d.open)}</span>
          </div>
        )}

        {/* High */}
        {d.high != null && (
          <div className="tooltip-row">
            <span className="tooltip-label">High</span>
            <span className="tooltip-val val-green">{formatCurrency(d.high)}</span>
          </div>
        )}

        {/* Low */}
        {d.low != null && (
          <div className="tooltip-row">
            <span className="tooltip-label">Low</span>
            <span className="tooltip-val val-red">{formatCurrency(d.low)}</span>
          </div>
        )}

        {/* Close */}
        {d.close != null && (
          <div className="tooltip-row highlight-row">
            <span className="tooltip-label font-bold">Close</span>
            <span className="tooltip-val font-bold">{formatCurrency(d.close)}</span>
          </div>
        )}

        {/* Volume */}
        {d.volume != null && d.volume > 0 && (
          <div className="tooltip-row">
            <span className="tooltip-label">Volume</span>
            <span className="tooltip-val">{formatVolume(d.volume)}</span>
          </div>
        )}

        {/* Moving Averages */}
        {showSmaFast && d.sma_fast != null && (
          <div className="tooltip-row indicator-row sma-fast">
            <span className="tooltip-label">SMA {smaPeriodFast}</span>
            <span className="tooltip-val">{formatCurrency(d.sma_fast)}</span>
          </div>
        )}

        {showSmaSlow && d.sma_slow != null && (
          <div className="tooltip-row indicator-row sma-slow">
            <span className="tooltip-label">SMA {smaPeriodSlow}</span>
            <span className="tooltip-val">{formatCurrency(d.sma_slow)}</span>
          </div>
        )}

        {showEma && d.ema != null && (
          <div className="tooltip-row indicator-row ema">
            <span className="tooltip-label">EMA {emaPeriod}</span>
            <span className="tooltip-val">{formatCurrency(d.ema)}</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default function PriceChart({ 
  marketData, 
  analyticsData,
  isLoading, 
  error, 
  onRetry,
  datePreset = '1Y',
  onSelectPreset
}) {
  // Indicator Visibility Toggles
  const [showPrice, setShowPrice] = useState(true);
  const [showSmaFast, setShowSmaFast] = useState(true);
  const [showSmaSlow, setShowSmaSlow] = useState(false);
  const [showEma, setShowEma] = useState(false);

  // Timeframe / View Range State
  const [activeRangePreset, setActiveRangePreset] = useState('ALL');
  const [viewRange, setViewRange] = useState({ start: 0, end: 0 });

  // Dragging & Interaction State
  const [isDragging, setIsDragging] = useState(false);
  const isDraggingRef = useRef(false);
  const dragStartXRef = useRef(0);
  const dragStartRangeRef = useRef({ start: 0, end: 0 });

  const chartContainerRef = useRef(null);

  const smaPeriodFast = analyticsData?.summary?.sma_period_fast || 20;
  const smaPeriodSlow = analyticsData?.summary?.sma_period_slow || 50;
  const emaPeriod = analyticsData?.summary?.ema_period || 20;

  // Merge raw market data records with analytics technical series
  const data = useMemo(() => {
    const raw = marketData?.data || [];
    if (!analyticsData?.series || analyticsData.series.length === 0) {
      return raw;
    }
    const analyticsMap = new Map();
    for (const item of analyticsData.series) {
      analyticsMap.set(item.date, item);
    }
    return raw.map(bar => {
      const a = analyticsMap.get(bar.date);
      return {
        ...bar,
        sma_fast: a?.sma_fast ?? null,
        sma_slow: a?.sma_slow ?? null,
        ema: a?.ema ?? null,
        daily_return_pct: a?.daily_return_pct ?? null,
        cumulative_return_pct: a?.cumulative_return_pct ?? null,
        drawdown_pct: a?.drawdown_pct ?? null,
      };
    });
  }, [marketData, analyticsData]);

  // Initialize or reset view range when underlying data changes
  useEffect(() => {
    if (data.length > 0) {
      setViewRange({ start: 0, end: data.length - 1 });
      setActiveRangePreset('ALL');
    }
  }, [data]);

  // Visible window slice of the data
  const visibleData = useMemo(() => {
    if (!data.length) return [];
    const start = Math.max(0, Math.min(viewRange.start, data.length - 1));
    const end = Math.max(start, Math.min(viewRange.end, data.length - 1));
    return data.slice(start, end + 1);
  }, [data, viewRange]);

  // Is chart currently zoomed in?
  const isZoomed = useMemo(() => {
    if (!data.length) return false;
    return viewRange.start > 0 || viewRange.end < data.length - 1;
  }, [data.length, viewRange]);

  // Auto-Scale Y-axis dynamically strictly matching visible data
  const { yMin, yMax, visibleMin, visibleMax } = useMemo(() => {
    if (!visibleData.length) return { yMin: 0, yMax: 100, visibleMin: 0, visibleMax: 100 };

    const prices = [];
    visibleData.forEach(d => {
      if (showPrice) {
        if (d.close != null) prices.push(d.close);
        if (d.high != null) prices.push(d.high);
        if (d.low != null) prices.push(d.low);
      }
      if (showSmaFast && d.sma_fast != null) prices.push(d.sma_fast);
      if (showSmaSlow && d.sma_slow != null) prices.push(d.sma_slow);
      if (showEma && d.ema != null) prices.push(d.ema);
    });

    if (!prices.length) {
      // Fallback to raw closes if all indicators hidden
      visibleData.forEach(d => { if (d.close != null) prices.push(d.close); });
    }

    const minP = prices.length ? Math.min(...prices) : 0;
    const maxP = prices.length ? Math.max(...prices) : 100;
    const span = maxP - minP;
    const pad = span > 0 ? span * 0.04 : minP * 0.03 || 1;

    return {
      yMin: Math.max(0, minP - pad),
      yMax: maxP + pad,
      visibleMin: minP,
      visibleMax: maxP
    };
  }, [visibleData, showPrice, showSmaFast, showSmaSlow, showEma]);

  // Reset Zoom handler
  const handleResetZoom = useCallback(() => {
    if (!data.length) return;
    setViewRange({ start: 0, end: data.length - 1 });
    setActiveRangePreset('ALL');
  }, [data.length]);

  // Timeframe preset selector (Controls visible chart range)
  const handleSelectTimeRange = useCallback((rangeId) => {
    if (!data.length) return;
    setActiveRangePreset(rangeId);

    const totalBars = data.length;
    let targetCount = totalBars;

    if (rangeId === '1M') {
      targetCount = 22; // ~1 trading month
    } else if (rangeId === '3M') {
      targetCount = 66; // ~1 quarter
    } else if (rangeId === '6M') {
      targetCount = 132; // ~half year
    } else if (rangeId === '1Y') {
      targetCount = 252; // ~1 trading year
    } else if (rangeId === 'ALL') {
      targetCount = totalBars;
    }

    const start = Math.max(0, totalBars - targetCount);
    setViewRange({ start, end: totalBars - 1 });
  }, [data.length]);

  // Wheel Zoom Listener (with e.preventDefault to prevent page scroll)
  useEffect(() => {
    const el = chartContainerRef.current;
    if (!el) return;

    const handleWheel = (e) => {
      if (!data.length || data.length < 6) return;
      e.preventDefault(); // Stop window scroll while zooming

      const rect = el.getBoundingClientRect();
      const clientX = e.clientX;
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left - 20) / (rect.width - 40)));

      setViewRange(prev => {
        const curLen = prev.end - prev.start + 1;
        const pivot = prev.start + Math.round(curLen * ratio);

        // Zoom factor: wheel up is negative delta (zoom in)
        const zoomIn = e.deltaY < 0;
        const factor = zoomIn ? 0.82 : 1.25;
        const newLen = Math.max(6, Math.min(data.length, Math.round(curLen * factor)));

        if (newLen === curLen) return prev;

        let newStart = Math.round(pivot - newLen * ratio);
        let newEnd = newStart + newLen - 1;

        if (newStart < 0) {
          newStart = 0;
          newEnd = Math.min(data.length - 1, newLen - 1);
        }
        if (newEnd >= data.length) {
          newEnd = data.length - 1;
          newStart = Math.max(0, data.length - newLen);
        }

        return { start: newStart, end: newEnd };
      });

      setActiveRangePreset('CUSTOM');
    };

    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, [data.length]);

  // Mouse Drag / Pan Handlers
  const handleMouseDown = (e) => {
    if (e.button !== 0 || !data.length) return;
    isDraggingRef.current = true;
    dragStartXRef.current = e.clientX;
    dragStartRangeRef.current = { ...viewRange };
    setIsDragging(true);
  };

  const handleTouchStart = (e) => {
    if (e.touches.length === 1 && data.length) {
      isDraggingRef.current = true;
      dragStartXRef.current = e.touches[0].clientX;
      dragStartRangeRef.current = { ...viewRange };
    }
  };

  useEffect(() => {
    const handleGlobalMouseMove = (e) => {
      if (!isDraggingRef.current || !data.length) return;
      const el = chartContainerRef.current;
      if (!el) return;

      const rect = el.getBoundingClientRect();
      const dx = e.clientX - dragStartXRef.current;
      const startRange = dragStartRangeRef.current;
      const curLen = startRange.end - startRange.start + 1;
      const barsDelta = Math.round((dx / (rect.width - 40)) * curLen);

      if (barsDelta === 0) return;

      let newStart = startRange.start - barsDelta;
      let newEnd = startRange.end - barsDelta;

      if (newStart < 0) {
        const shift = 0 - newStart;
        newStart = 0;
        newEnd = Math.min(data.length - 1, newEnd + shift);
      }
      if (newEnd >= data.length) {
        const shift = newEnd - (data.length - 1);
        newEnd = data.length - 1;
        newStart = Math.max(0, newStart - shift);
      }

      setViewRange({ start: newStart, end: newEnd });
      setActiveRangePreset('CUSTOM');
    };

    const handleGlobalMouseUp = () => {
      if (isDraggingRef.current) {
        isDraggingRef.current = false;
        setIsDragging(false);
      }
    };

    const handleGlobalTouchMove = (e) => {
      if (!isDraggingRef.current || e.touches.length !== 1 || !data.length) return;
      const el = chartContainerRef.current;
      if (!el) return;

      const rect = el.getBoundingClientRect();
      const dx = e.touches[0].clientX - dragStartXRef.current;
      const startRange = dragStartRangeRef.current;
      const curLen = startRange.end - startRange.start + 1;
      const barsDelta = Math.round((dx / rect.width) * curLen);

      if (barsDelta === 0) return;

      let newStart = startRange.start - barsDelta;
      let newEnd = startRange.end - barsDelta;

      if (newStart < 0) {
        const shift = 0 - newStart;
        newStart = 0;
        newEnd = Math.min(data.length - 1, newEnd + shift);
      }
      if (newEnd >= data.length) {
        const shift = newEnd - (data.length - 1);
        newEnd = data.length - 1;
        newStart = Math.max(0, newStart - shift);
      }

      setViewRange({ start: newStart, end: newEnd });
      setActiveRangePreset('CUSTOM');
    };

    window.addEventListener('mousemove', handleGlobalMouseMove);
    window.addEventListener('mouseup', handleGlobalMouseUp);
    window.addEventListener('touchmove', handleGlobalTouchMove);
    window.addEventListener('touchend', handleGlobalMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleGlobalMouseMove);
      window.removeEventListener('mouseup', handleGlobalMouseUp);
      window.removeEventListener('touchmove', handleGlobalTouchMove);
      window.removeEventListener('touchend', handleGlobalMouseUp);
    };
  }, [data.length]);

  if (isLoading) {
    return (
      <div className="placeholder-canvas" style={{ height: '400px' }}>
        <div className="status-dot checking" style={{ width: 14, height: 14 }} />
        <p className="placeholder-text" style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
          Ingesting historical market data from Yahoo Finance...
        </p>
        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
          Retrieving real OHLCV series &amp; computing quantitative indicators
        </span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="placeholder-canvas" style={{ height: '400px', borderColor: 'rgba(239, 68, 68, 0.3)' }}>
        <div className="placeholder-icon" style={{ background: 'var(--color-red-soft)', color: 'var(--color-red)' }}>
          <AlertCircle size={24} />
        </div>
        <h4 style={{ color: 'var(--text-primary)', fontWeight: 600 }}>Market Data Error</h4>
        <p className="placeholder-text" style={{ color: 'var(--color-red)' }}>
          {error}
        </p>
        {onRetry && (
          <button 
            type="button" 
            className="btn-primary" 
            style={{ marginTop: '0.5rem', padding: '0.4rem 0.9rem', fontSize: '0.75rem' }}
            onClick={onRetry}
          >
            <RefreshCw size={14} /> Retry Query
          </button>
        )}
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="placeholder-canvas" style={{ height: '400px' }}>
        <div className="placeholder-icon">
          <BarChart2 size={24} />
        </div>
        <h4 style={{ color: 'var(--text-primary)', fontWeight: 600 }}>No Historical Data</h4>
        <p className="placeholder-text">
          No records found for the selected asset and date range. Please select another interval.
        </p>
      </div>
    );
  }

  const latestPrice = data[data.length - 1].close;
  const firstPrice = data[0].close;
  const isUp = latestPrice >= firstPrice;
  const strokeColor = isUp ? '#16A34A' : '#DC2626';
  const gradientId = isUp ? 'priceGradientGreen' : 'priceGradientRed';

  return (
    <div className="quant-interactive-chart-wrapper">
      {/* Top Stat Summary & Multi-Asset Metrics */}
      <div className="chart-meta-bar">
        <div className="chart-stat-blocks-row">
          {/* Latest Close */}
          <div className="market-stat-block" style={{ borderLeft: `3px solid ${strokeColor}` }}>
            <span className="stat-block-label">Latest Close</span>
            <div className="stat-block-value-row">
              <span className="stat-block-val" style={{ color: strokeColor }}>
                {formatCurrency(latestPrice)}
              </span>
              <span style={{ fontSize: '0.65rem', color: strokeColor, fontWeight: 700 }}>
                {isUp ? '▲' : '▼'}
              </span>
            </div>
            <span className="stat-block-meaning">Recent session close</span>
          </div>

          {/* Visible Period Low */}
          <div className="market-stat-block">
            <span className="stat-block-label">{isZoomed ? 'Visible Low' : 'Period Low'}</span>
            <span className="stat-block-val">{formatCurrency(visibleMin)}</span>
            <span className="stat-block-meaning">Lowest in range</span>
          </div>

          {/* Visible Period High */}
          <div className="market-stat-block">
            <span className="stat-block-label">{isZoomed ? 'Visible High' : 'Period High'}</span>
            <span className="stat-block-val">{formatCurrency(visibleMax)}</span>
            <span className="stat-block-meaning">Highest in range</span>
          </div>

          {/* Visible Sessions */}
          <div className="market-stat-block">
            <span className="stat-block-label">Visible Sessions</span>
            <div className="stat-block-val" style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <span>{visibleData.length}</span>
              {isZoomed && (
                <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 500 }}>
                  of {data.length}
                </span>
              )}
            </div>
            <span className="stat-block-meaning">Active view window</span>
          </div>
        </div>

        {/* Zoomed Indicator Badge */}
        {isZoomed && (
          <div className="chart-zoom-badge">
            <ZoomIn size={12} />
            <span>Zoom Active ({visibleData.length} bars)</span>
          </div>
        )}
      </div>

      {/* Interactive Control Header: Indicators + View Range Pills + Reset Zoom */}
      <div className="chart-toolbar-row">
        {/* Left: Indicator Toggles */}
        <div className="indicator-toggle-group">
          {/* Price Toggle */}
          <button
            type="button"
            className={`overlay-toggle-chip ${showPrice ? 'active-price' : ''}`}
            onClick={() => setShowPrice(prev => !prev)}
            title="Toggle Close Price Line & Area"
          >
            <span className="overlay-indicator-dot" style={{ background: strokeColor }} />
            Price
          </button>

          {/* SMA Fast */}
          <button 
            type="button" 
            className={`overlay-toggle-chip ${showSmaFast ? 'active-sma-fast' : ''}`}
            onClick={() => setShowSmaFast(prev => !prev)}
            title={`Toggle ${smaPeriodFast}-day Simple Moving Average`}
          >
            <span className="overlay-indicator-dot" style={{ background: '#f59e0b' }} />
            SMA {smaPeriodFast}
          </button>

          {/* SMA Slow */}
          <button 
            type="button" 
            className={`overlay-toggle-chip ${showSmaSlow ? 'active-sma-slow' : ''}`}
            onClick={() => setShowSmaSlow(prev => !prev)}
            title={`Toggle ${smaPeriodSlow}-day Simple Moving Average`}
          >
            <span className="overlay-indicator-dot" style={{ background: '#a855f7' }} />
            SMA {smaPeriodSlow}
          </button>

          {/* EMA */}
          <button 
            type="button" 
            className={`overlay-toggle-chip ${showEma ? 'active-ema' : ''}`}
            onClick={() => setShowEma(prev => !prev)}
            title={`Toggle ${emaPeriod}-day Exponential Moving Average`}
          >
            <span className="overlay-indicator-dot" style={{ background: '#06b6d4' }} />
            EMA {emaPeriod}
          </button>
        </div>

        {/* Right: Chart View Range Selector & Reset Button */}
        <div className="chart-range-group">
          {/* Chart View Range Pills */}
          <div className="chart-timeframe-pills" title="Adjust visible chart range without changing underlying analytics interval">
            {['1M', '3M', '6M', '1Y', 'ALL'].map((tf) => {
              const isActive = activeRangePreset === tf;
              return (
                <button
                  key={tf}
                  type="button"
                  className={`chart-tf-pill ${isActive ? 'active' : ''}`}
                  onClick={() => handleSelectTimeRange(tf)}
                >
                  {tf}
                </button>
              );
            })}
          </div>

          {/* Reset Zoom Control */}
          <button
            type="button"
            className={`chart-reset-btn ${isZoomed ? 'highlighted' : ''}`}
            onClick={handleResetZoom}
            title="Reset chart view to full selected range"
          >
            <RotateCcw size={12} />
            <span>Reset</span>
          </button>
        </div>
      </div>

      {/* Main Interactive Plot Canvas with Crosshair & Pan / Zoom Container */}
      <div 
        ref={chartContainerRef}
        className={`chart-canvas-container ${isDragging ? 'dragging' : ''} ${isZoomed ? 'zoomed' : ''}`}
        onMouseDown={handleMouseDown}
        onTouchStart={handleTouchStart}
        style={{ width: '100%', height: 410, position: 'relative' }}
      >
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart 
            data={visibleData} 
            margin={{ top: 12, right: 14, left: 14, bottom: 6 }}
          >
            <defs>
              <linearGradient id="priceGradientGreen" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#16a34a" stopOpacity={0.16} />
                <stop offset="95%" stopColor="#16a34a" stopOpacity={0.0} />
              </linearGradient>
              <linearGradient id="priceGradientRed" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#dc2626" stopOpacity={0.16} />
                <stop offset="95%" stopColor="#dc2626" stopOpacity={0.0} />
              </linearGradient>
            </defs>

            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />

            {/* X-Axis with clean date format */}
            <XAxis 
              dataKey="date" 
              tickLine={false} 
              axisLine={{ stroke: '#cbd5e1' }}
              tick={{ fill: '#64748b', fontSize: 11, fontFamily: 'var(--font-mono)' }}
              tickFormatter={(v) => {
                if (!v) return '';
                const parts = String(v).split('T')[0].split('-');
                if (parts.length === 3) {
                  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                  const m = months[parseInt(parts[1], 10) - 1] || parts[1];
                  // If zoomed in close, show month and day
                  if (visibleData.length < 90) return `${m} ${parts[2]}`;
                  return `${m} '${parts[0].slice(2)}`;
                }
                return v;
              }}
              minTickGap={35}
            />

            {/* Y-Axis Auto-Scaled to Visible Window */}
            <YAxis 
              domain={[yMin, yMax]}
              tickLine={false} 
              axisLine={{ stroke: '#cbd5e1' }}
              tick={{ fill: '#64748b', fontSize: 11, fontFamily: 'var(--font-mono)' }}
              tickFormatter={(v) => {
                if (v >= 1000) return `$${(v / 1000).toFixed(1)}k`;
                if (v >= 1) return `$${v.toFixed(1)}`;
                return `$${v}`;
              }}
              orientation="right"
              scale="linear"
            />

            {/* Crosshair & Detailed OHLCV + Indicators Tooltip */}
            <Tooltip 
              cursor={{
                stroke: '#64748b',
                strokeWidth: 1.2,
                strokeDasharray: '3 3'
              }}
              content={
                <CustomChartTooltip 
                  smaPeriodFast={smaPeriodFast} 
                  smaPeriodSlow={smaPeriodSlow} 
                  emaPeriod={emaPeriod} 
                  showPrice={showPrice}
                  showSmaFast={showSmaFast}
                  showSmaSlow={showSmaSlow}
                  showEma={showEma}
                />
              } 
              isAnimationActive={false}
            />

            {/* Subtle latest-price reference line for active level */}
            <ReferenceLine 
              y={latestPrice} 
              stroke={strokeColor} 
              strokeDasharray="3 3" 
              strokeOpacity={0.35} 
            />

            {/* Primary Price Action Area */}
            {showPrice && (
              <Area 
                type="monotone" 
                dataKey="close" 
                stroke={strokeColor} 
                strokeWidth={2}
                fillOpacity={1} 
                fill={`url(#${gradientId})`} 
                isAnimationActive={false}
              />
            )}

            {/* SMA 20 */}
            {showSmaFast && (
              <Line 
                type="monotone" 
                dataKey="sma_fast" 
                stroke="#f59e0b" 
                strokeWidth={1.8} 
                dot={false} 
                isAnimationActive={false} 
              />
            )}

            {/* SMA 50 */}
            {showSmaSlow && (
              <Line 
                type="monotone" 
                dataKey="sma_slow" 
                stroke="#a855f7" 
                strokeWidth={1.8} 
                dot={false} 
                isAnimationActive={false} 
              />
            )}

            {/* EMA 20 */}
            {showEma && (
              <Line 
                type="monotone" 
                dataKey="ema" 
                stroke="#06b6d4" 
                strokeWidth={1.8} 
                dot={false} 
                isAnimationActive={false} 
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>

        {/* Floating User Navigation Guide Hint */}
        <div className="chart-navigation-hint">
          <span>Scroll to zoom &bull; Drag to pan &bull; Hover for OHLCV crosshair</span>
        </div>
      </div>
    </div>
  );
}
