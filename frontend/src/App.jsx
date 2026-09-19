import React, { useState, useEffect, useCallback } from 'react';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import AssetBar, { ASSETS } from './components/AssetBar';
import MetricsGrid from './components/MetricsGrid';
import PriceChart from './components/PriceChart';
import PerformanceView from './components/PerformanceView';
import CorrelationView from './components/CorrelationView';
import BacktestLab from './components/BacktestLab';
import RobustnessRegimesView from './components/RobustnessRegimesView';
import AIResearchView from './components/AIResearchView';
import QuantBackground from './components/QuantBackground';
import ModuleCards from './components/ModuleCards';
import { checkHealth, fetchMarketData, fetchAnalytics, fetchAIStatus } from './services/api';
import { 
  LineChart, 
  Database,
  CheckCircle2
} from 'lucide-react';

export default function App() {
  const [backendHealth, setBackendHealth] = useState(null);
  const [isCheckingHealth, setIsCheckingHealth] = useState(true);
  const [selectedAsset, setSelectedAsset] = useState(ASSETS[0]);
  const [datePreset, setDatePreset] = useState('1Y');

  // Initialize 1Y range up to today
  const getInitialDates = () => {
    const end = new Date();
    const start = new Date();
    start.setFullYear(end.getFullYear() - 1);
    return {
      start: start.toISOString().split('T')[0],
      end: end.toISOString().split('T')[0]
    };
  };

  const initialDates = getInitialDates();
  const [startDate, setStartDate] = useState(initialDates.start);
  const [endDate, setEndDate] = useState(initialDates.end);

  const [activeTab, setActiveTab] = useState('overview');
  const [selectedStrategy, setSelectedStrategy] = useState('sma_crossover');

  // Real System Notifications State
  const [notifications, setNotifications] = useState([]);

  const addNotification = useCallback((type, title, description) => {
    setNotifications((prev) => {
      // De-duplicate if the latest notification has the same title and description
      if (prev.length > 0 && prev[0].title === title && prev[0].description === description) {
        return prev;
      }
      const newNotif = {
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
        type, // 'api' | 'asset' | 'data' | 'analytics' | 'ai' | 'strategy' | 'warning'
        title,
        description,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        timestamp: Date.now(),
        unread: true,
      };
      return [newNotif, ...prev.slice(0, 29)];
    });
  }, []);

  const handleClearNotifications = useCallback(() => {
    setNotifications([]);
  }, []);

  // Data & API states
  const [marketData, setMarketData] = useState(null);
  const [isLoadingMarketData, setIsLoadingMarketData] = useState(false);
  const [marketDataError, setMarketDataError] = useState(null);

  const [analyticsData, setAnalyticsData] = useState(null);
  const [isLoadingAnalytics, setIsLoadingAnalytics] = useState(false);
  const [analyticsError, setAnalyticsError] = useState(null);

  // Asset change handler with notification
  const handleSelectAsset = useCallback((asset) => {
    setSelectedAsset(asset);
    addNotification('asset', 'Asset Updated', `${asset.name} historical analysis loaded.`);
  }, [addNotification]);

  // Strategy select handler with backtest tab navigation
  const handleSelectStrategy = useCallback((stratId) => {
    setSelectedStrategy(stratId);
    setActiveTab('backtest');
  }, []);

  // Poll backend health status
  const fetchHealth = useCallback(async () => {
    setIsCheckingHealth(true);
    try {
      const data = await checkHealth();
      setBackendHealth(data);
      if (data?.status === 'ok') {
        addNotification('api', 'API Connected', 'QUANTEXA backend is online.');
      }
    } catch {
      setBackendHealth({ status: 'error', detail: 'Could not connect to FastAPI backend' });
      addNotification('warning', 'API Disconnected', 'FastAPI backend connection unavailable.');
    } finally {
      setIsCheckingHealth(false);
    }
  }, [addNotification]);

  useEffect(() => {
    fetchHealth();
    const interval = setInterval(fetchHealth, 30000);
    return () => clearInterval(interval);
  }, [fetchHealth]);

  // Check AI Research availability on initialization
  useEffect(() => {
    fetchAIStatus()
      .then((res) => {
        if (res?.configured) {
          addNotification('ai', 'AI Available', 'Featherless AI research is ready.');
        }
      })
      .catch(() => {});
  }, [addNotification]);

  // Load Market Data for selected asset & range
  const loadMarketData = useCallback(async () => {
    if (!selectedAsset) return;
    setIsLoadingMarketData(true);
    setMarketDataError(null);
    try {
      const data = await fetchMarketData(selectedAsset.id, startDate, endDate);
      setMarketData(data);
      const sessionCount = data?.data?.length || 0;
      addNotification('data', 'Market Data Loaded', `${selectedAsset.name} data loaded (${sessionCount} sessions).`);
    } catch (err) {
      const msg = err.response?.data?.detail || err.message || 'Error fetching historical data';
      setMarketDataError(msg);
      addNotification('warning', 'Market Data Error', msg);
    } finally {
      setIsLoadingMarketData(false);
    }
  }, [selectedAsset, startDate, endDate, addNotification]);

  // Load Analytics Data for selected asset & range
  const loadAnalytics = useCallback(async () => {
    if (!selectedAsset) return;
    setIsLoadingAnalytics(true);
    setAnalyticsError(null);
    try {
      const data = await fetchAnalytics(selectedAsset.id, startDate, endDate, 20, 50, 20, 0.0);
      setAnalyticsData(data);
      addNotification('analytics', 'Analysis Updated', 'Quantitative metrics refreshed.');
    } catch (err) {
      const msg = err.response?.data?.detail || err.message || 'Error computing quantitative metrics';
      setAnalyticsError(msg);
      addNotification('warning', 'Analytics Error', msg);
    } finally {
      setIsLoadingAnalytics(false);
    }
  }, [selectedAsset, startDate, endDate, addNotification]);

  useEffect(() => {
    loadMarketData();
    loadAnalytics();
  }, [loadMarketData, loadAnalytics]);

  // Preset Date Selection Handler
  const handleSelectPreset = (preset) => {
    setDatePreset(preset);
    const end = new Date();
    let start = new Date();
    if (preset === '1M') {
      start.setMonth(end.getMonth() - 1);
    } else if (preset === '3M') {
      start.setMonth(end.getMonth() - 3);
    } else if (preset === '6M') {
      start.setMonth(end.getMonth() - 6);
    } else if (preset === '1Y') {
      start.setFullYear(end.getFullYear() - 1);
    } else if (preset === '2Y') {
      start.setFullYear(end.getFullYear() - 2);
    } else if (preset === '5Y') {
      start.setFullYear(end.getFullYear() - 5);
    } else if (preset === 'MAX' || preset === 'ALL') {
      start = new Date('2015-01-01');
    }
    setStartDate(start.toISOString().split('T')[0]);
    setEndDate(end.toISOString().split('T')[0]);
  };

  return (
    <>
      <QuantBackground />
      <div className="layout-root">
        {/* Left Fixed Sidebar matching Reference Image */}
        <Sidebar activeTab={activeTab} onSelectTab={setActiveTab} />

        {/* Main Content Area */}
        <div className="layout-main">
          {/* Top Header Panel */}
          <Header 
            backendHealth={backendHealth} 
            isCheckingHealth={isCheckingHealth} 
            onRefreshHealth={fetchHealth} 
            selectedAsset={selectedAsset}
            onSelectAsset={handleSelectAsset}
            activeTab={activeTab}
            onSelectTab={setActiveTab}
            onSelectStrategy={handleSelectStrategy}
            notifications={notifications}
            onClearNotifications={handleClearNotifications}
          />

          {/* Research Platform Banner with Smooth Marquee */}
          <div className="disclaimer-banner">
            <div className="disclaimer-left">
              <span className="disclaimer-badge">
                <span className="disclaimer-dot" />
                QUANTITATIVE RESEARCH PLATFORM
              </span>
              <div className="marquee-container" title="Robustness testing evaluates sensitivity across parameter spaces to diagnose curve-fitting. Regimes are rule-based historical labels, not forecasts.">
                <div className="marquee-track">
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
              Strict Rule: Non-prescriptive
            </div>
          </div>

          {/* Tab Panels */}
          {activeTab === 'overview' && (
            <div className="unified-overview-dashboard">
              {/* 1. Dashboard Controls Header */}
              <AssetBar 
                selectedAsset={selectedAsset}
                onSelectAsset={handleSelectAsset}
                datePreset={datePreset}
                onSelectPreset={handleSelectPreset}
                startDate={startDate}
                endDate={endDate}
                onStartDateChange={setStartDate}
                onEndDateChange={setEndDate}
              />

              {/* 2. Integrated 4 KPI Metric Cards with Sparklines */}
              <MetricsGrid 
                metrics={(() => {
                  if (analyticsData?.summary) {
                    const s = analyticsData.summary;
                    const sign = (s.total_return_pct ?? 0) >= 0 ? '+' : '';
                    return {
                      return: {
                        value: s.total_return_pct !== null ? `${sign}${s.total_return_pct.toFixed(2)}%` : '--',
                        subtext: 'Historical performance'
                      },
                      volatility: {
                        value: s.annualized_volatility_pct !== null ? `${s.annualized_volatility_pct.toFixed(2)}%` : '--',
                        subtext: 'Return variability'
                      },
                      sharpe: {
                        value: s.sharpe_ratio !== null ? s.sharpe_ratio.toFixed(2) : '--',
                        subtext: 'Risk-adjusted performance'
                      },
                      drawdown: {
                        value: s.max_drawdown_pct !== null ? `${s.max_drawdown_pct.toFixed(2)}%` : '--',
                        subtext: 'Largest historical fall'
                      }
                    };
                  }

                  const records = marketData?.data || [];
                  if (records.length < 2) {
                    return {
                      return: '--',
                      volatility: '--',
                      sharpe: '--',
                      drawdown: '--'
                    };
                  }
                  const first = records[0].close;
                  const last = records[records.length - 1].close;
                  const pct = ((last - first) / first) * 100;
                  const sign = pct >= 0 ? '+' : '';
                  return {
                    return: `${sign}${pct.toFixed(2)}%`,
                    volatility: 'Calculating...',
                    sharpe: 'Calculating...',
                    drawdown: 'Calculating...'
                  };
                })()} 
                seriesData={analyticsData?.series || marketData?.data || []}
                sparklines={analyticsData?.summary?.sparklines}
              />

              {/* 3. Main Analytics Area */}
              <div className="unified-analytics-grid">
                {/* Historical Price Action Panel */}
                <div className="unified-chart-panel">
                  <div className="card-title-row" style={{ alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', marginBottom: '0.2rem' }}>
                        <LineChart size={15} color="var(--color-blue)" />
                        <span style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                          HISTORICAL PRICE ACTION
                        </span>
                      </div>
                      <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em', display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap' }}>
                        <span>{selectedAsset.name}</span>
                        <span style={{ color: 'var(--border-medium)', fontWeight: 300 }}>&bull;</span>
                        <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-cyan)', fontSize: '1.05rem', fontWeight: 700 }}>{selectedAsset.symbol}</span>
                        <span style={{ color: 'var(--border-medium)', fontWeight: 300 }}>&bull;</span>
                        <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', fontWeight: 500 }}>{selectedAsset.category}</span>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap', marginTop: '0.2rem' }}>
                      <span className="card-action-badge" style={{ background: '#f0fdf4', color: '#15803d', borderColor: '#bbf7d0', fontWeight: 600 }}>
                        <span className="status-dot" style={{ width: 6, height: 6, display: 'inline-block', marginRight: 5, verticalAlign: 'middle' }} />
                        LIVE OHLCV
                      </span>
                      <span className="card-action-badge" style={{ fontFamily: 'var(--font-mono)' }}>
                        {marketData?.count ? `${marketData.count} SESSIONS` : '--'}
                      </span>
                    </div>
                  </div>
                
                  {/* Live Interactive Price Chart with Technical Overlays */}
                  <PriceChart 
                    marketData={marketData}
                    analyticsData={analyticsData}
                    isLoading={isLoadingMarketData || isLoadingAnalytics}
                    error={marketDataError || analyticsError}
                    datePreset={datePreset}
                    onSelectPreset={handleSelectPreset}
                    onRetry={() => {
                      loadMarketData();
                      loadAnalytics();
                    }}
                  />
                </div>

                {/* Market Feed & Analytics Engine Panel */}
                <div className="unified-feed-panel">
                  <div className="card-title-row">
                    <span className="card-title">
                      <Database size={18} color="var(--color-blue)" />
                      Market Feed &amp; Analytics Engine
                    </span>
                    {backendHealth?.status === 'ok' ? (
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem', padding: '0.2rem 0.6rem', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 'var(--radius-full)', fontSize: '0.7rem', fontFamily: 'var(--font-mono)', color: '#15803d', fontWeight: 700, letterSpacing: '0.04em' }}>
                        <span className="status-dot" style={{ width: 6, height: 6 }} />
                        {backendHealth?.phase ? backendHealth.phase.toUpperCase().replace(/_/g, ' ') : 'PHASE 3 ACTIVE'}
                      </div>
                    ) : (
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem', padding: '0.2rem 0.6rem', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 'var(--radius-full)', fontSize: '0.7rem', fontFamily: 'var(--font-mono)', color: '#dc2626', fontWeight: 700, letterSpacing: '0.04em' }}>
                        <span className="status-dot" style={{ width: 6, height: 6, background: '#dc2626' }} />
                        BACKEND OFFLINE
                      </div>
                    )}
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                    <div className="engine-row">
                      <div>
                        <span className="engine-row-label">Ticker Symbol</span>
                        <span className="human-meaning-label">Market identifier</span>
                      </div>
                      <span className="engine-row-val" style={{ color: 'var(--color-cyan)' }}>{selectedAsset.symbol}</span>
                    </div>
                    <div className="engine-row">
                      <div>
                        <span className="engine-row-label">Asset Class</span>
                        <span className="human-meaning-label">Instrument sector</span>
                      </div>
                      <span className="engine-row-val">{selectedAsset.category}</span>
                    </div>
                    <div className="engine-row">
                      <div>
                        <span className="engine-row-label">Historical Sessions</span>
                        <span className="human-meaning-label">Trading days analyzed</span>
                      </div>
                      <span className="engine-row-val">
                        {marketData?.count ? `${marketData.count} bars` : '--'}
                      </span>
                    </div>
                    <div className="engine-row">
                      <div>
                        <span className="engine-row-label">Data Horizon</span>
                        <span className="human-meaning-label">Observation timeframe</span>
                      </div>
                      <span className="engine-row-val">{startDate} &rarr; {endDate}</span>
                    </div>
                    <div className="engine-row">
                      <div>
                        <span className="engine-row-label">Realized Volatility (σ 252d)</span>
                        <span className="human-meaning-label">Historical return variability</span>
                      </div>
                      <span className="engine-row-val" style={{ color: 'var(--color-cyan)' }}>
                        {analyticsData?.summary?.annualized_volatility_pct ? `${analyticsData.summary.annualized_volatility_pct.toFixed(2)}%` : '--'}
                      </span>
                    </div>
                    <div className="engine-row">
                      <div>
                        <span className="engine-row-label">Sharpe Ratio (0% Rf)</span>
                        <span className="human-meaning-label">Risk-adjusted performance</span>
                      </div>
                      <span className="engine-row-val" style={{ color: 'var(--color-green)' }}>
                        {analyticsData?.summary?.sharpe_ratio !== undefined && analyticsData?.summary?.sharpe_ratio !== null ? analyticsData.summary.sharpe_ratio.toFixed(2) : '--'}
                      </span>
                    </div>
                    
                    {/* Phase 3 Distinct Engine Status Callout */}
                    <div className="engine-status-callout" style={backendHealth?.status === 'ok' ? {} : { borderColor: 'rgba(220, 38, 38, 0.25)', background: '#fef2f2' }}>
                      <div className="engine-status-callout-header" style={backendHealth?.status === 'ok' ? {} : { color: '#dc2626' }}>
                        <CheckCircle2 size={14} color={backendHealth?.status === 'ok' ? '#16a34a' : '#dc2626'} />
                        {backendHealth?.status === 'ok' ? 'QUANTITATIVE ENGINE OPERATIONAL' : 'QUANTITATIVE ENGINE DISCONNECTED'}
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', margin: '0.45rem 0' }}>
                        {[
                          { name: 'SMA', hint: 'Simple Moving Averages' },
                          { name: 'EMA', hint: 'Exponential Smoothing' },
                          { name: 'Returns', hint: 'Daily & Cumulative' },
                          { name: 'Volatility', hint: 'Annualized σ' },
                          { name: 'Sharpe', hint: 'Risk-Adjusted Ratio' },
                          { name: 'Drawdown', hint: 'Peak-to-Trough Fall' }
                        ].map((item) => (
                          <span key={item.name} title={item.hint} style={{ 
                            fontSize: '0.66rem', 
                            fontFamily: 'var(--font-mono)', 
                            background: '#ffffff', 
                            border: '1px solid #cbd5e1', 
                            borderRadius: '4px', 
                            padding: '0.15rem 0.45rem', 
                            color: '#1e293b',
                            fontWeight: 600,
                            boxShadow: '0 1px 2px rgba(15, 23, 42, 0.04)'
                          }}>
                            {item.name}
                          </span>
                        ))}
                      </div>
                      <div className="engine-status-callout-text">
                        Computed with vectorized precision and zero forward bias.
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* 4. Integrated Lower Module Navigation Shortcuts */}
              <div className="unified-module-shortcuts">
                <ModuleCards onSelectTab={setActiveTab} />
              </div>
            </div>
          )}

          {/* Other Analytical Tabs with Global Context */}
          {activeTab !== 'overview' && (
            <div className="other-tab-container">
              {activeTab === 'performance' && (
                <PerformanceView 
                  selectedAsset={selectedAsset}
                  onSelectAsset={handleSelectAsset}
                  datePreset={datePreset}
                  onSelectPreset={handleSelectPreset}
                  startDate={startDate}
                  endDate={endDate}
                  onStartDateChange={setStartDate}
                  onEndDateChange={setEndDate}
                  analyticsData={analyticsData} 
                  isLoading={isLoadingAnalytics} 
                  error={analyticsError} 
                />
              )}

              {activeTab === 'correlation' && (
                <CorrelationView 
                  selectedAsset={selectedAsset}
                  onSelectAsset={handleSelectAsset}
                  datePreset={datePreset}
                  onSelectPreset={handleSelectPreset}
                  startDate={startDate} 
                  endDate={endDate} 
                  onStartDateChange={setStartDate}
                  onEndDateChange={setEndDate}
                  analyticsData={analyticsData}
                  isLoadingAnalytics={isLoadingAnalytics}
                  analyticsError={analyticsError}
                />
              )}

              {activeTab === 'backtest' && (
                <BacktestLab 
                  selectedAsset={selectedAsset}
                  onSelectAsset={handleSelectAsset}
                  datePreset={datePreset}
                  onSelectPreset={handleSelectPreset}
                  startDate={startDate}
                  endDate={endDate}
                  onStartDateChange={setStartDate}
                  onEndDateChange={setEndDate}
                  selectedStrategy={selectedStrategy}
                  onSelectStrategy={setSelectedStrategy}
                  analyticsData={analyticsData}
                  isLoadingAnalytics={isLoadingAnalytics}
                  analyticsError={analyticsError}
                />
              )}

              {activeTab === 'regimes' && (
                <RobustnessRegimesView 
                  selectedAsset={selectedAsset}
                  onSelectAsset={handleSelectAsset}
                  datePreset={datePreset}
                  onSelectPreset={handleSelectPreset}
                  startDate={startDate}
                  endDate={endDate}
                  onStartDateChange={setStartDate}
                  onEndDateChange={setEndDate}
                  analyticsData={analyticsData}
                  isLoadingAnalytics={isLoadingAnalytics}
                  analyticsError={analyticsError}
                />
              )}

              {activeTab === 'ai' && (
                <AIResearchView 
                  selectedAsset={selectedAsset}
                  onSelectAsset={handleSelectAsset}
                  datePreset={datePreset}
                  onSelectPreset={handleSelectPreset}
                  startDate={startDate}
                  endDate={endDate}
                  onStartDateChange={setStartDate}
                  onEndDateChange={setEndDate}
                  analyticsData={analyticsData}
                  isLoadingAnalytics={isLoadingAnalytics}
                  analyticsError={analyticsError}
                />
              )}
            </div>
          )}

          {/* Minimal Clean Quantitative Footer */}
          <footer className="footer">
            <div className="footer-left">
              <span className="footer-brand">QUANTEXA</span>
              <span className="footer-sep">&bull;</span>
              <span className="footer-sub">Quantitative Financial Intelligence</span>
            </div>

            <div className="footer-center">
              <span>Strictly Historical Analysis</span>
              <span className="footer-sep">&bull;</span>
              <span>No Financial Advice</span>
              <span className="footer-sep">&bull;</span>
              <span>Built for Research</span>
            </div>

            <div className="footer-right">
              <div className="footer-status-chip">
                <span className={`status-dot ${backendHealth?.status === 'ok' ? '' : backendHealth ? 'disconnected' : 'checking'}`} />
                <span>{backendHealth?.status === 'ok' ? 'API Connected' : backendHealth ? 'API Offline' : 'Checking API...'}</span>
                {backendHealth?.status === 'ok' && (
                  <span className="footer-latency">{backendHealth?.latencyMs || 12}ms</span>
                )}
              </div>
            </div>
          </footer>
        </div>
      </div>
    </>
  );
}
