import React, { useState, useEffect, useCallback } from 'react';
import { 
  Sparkles, 
  Send, 
  AlertTriangle, 
  RefreshCw, 
  FileText,
  ChevronDown,
  ChevronUp,
  Layers
} from 'lucide-react';
import { ASSETS } from './AssetBar';
import { 
  fetchAIStatus, 
  askAIResearch, 
  fetchAnalytics, 
  runBacktest, 
  fetchMarketRegimes, 
  fetchCorrelation 
} from '../services/api';
import PerformanceRiskSummary from './PerformanceRiskSummary';
import GlobalAnalysisControls from './GlobalAnalysisControls';

const QUICK_QUESTIONS = [
  'Explain the backtest',
  'Compare strategy vs Buy & Hold',
  'What does Sharpe mean?',
  'Explain the maximum drawdown',
  'What market regimes occurred?'
];

export default function AIResearchView({ 
  selectedAsset: propSelectedAsset,
  onSelectAsset: propOnSelectAsset,
  datePreset: propDatePreset,
  onSelectPreset: propOnSelectPreset,
  startDate: propStartDate,
  endDate: propEndDate,
  onStartDateChange: propOnStartDateChange,
  onEndDateChange: propOnEndDateChange,
  initialAsset = ASSETS[0], 
  initialStartDate, 
  initialEndDate,
  analyticsData,
  isLoadingAnalytics,
  analyticsError
}) {
  const [internalAsset, setInternalAsset] = useState(initialAsset);
  const selectedAsset = propSelectedAsset || internalAsset;
  const onSelectAsset = propOnSelectAsset || setInternalAsset;

  const [internalPreset, setInternalPreset] = useState('1Y');
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

  const [question, setQuestion] = useState(QUICK_QUESTIONS[0]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingContext, setLoadingContext] = useState(false);
  const [error, setError] = useState(null);
  const [validationError, setValidationError] = useState(null);
  const [aiStatus, setAiStatus] = useState(null);
  const [aiResult, setAiResult] = useState(null);
  const [showContext, setShowContext] = useState(false);

  // Authoritative Quantitative Context loaded from backend
  const [contextData, setContextData] = useState(null);

  // Check AI configuration status on mount
  const checkStatus = useCallback(async () => {
    try {
      const status = await fetchAIStatus();
      setAiStatus(status);
    } catch {
      setAiStatus({ configured: false, model: 'unknown' });
    }
  }, []);

  useEffect(() => {
    checkStatus();
  }, [checkStatus]);

  // Load Authoritative Quantitative Context from backend
  const loadAssetContext = useCallback(async (asset) => {
    setLoadingContext(true);
    try {
      const analytics = await fetchAnalytics(asset.id, startDate, endDate, 20, 50, 20, 0.0);
      const backtest = await runBacktest({
        asset: asset.id,
        strategy: 'sma_crossover',
        start_date: startDate,
        end_date: endDate,
        initial_capital: 100000,
        transaction_cost_pct: 0.10,
        position_size_pct: 100,
        parameters: { fast_period: 20, slow_period: 50 }
      });
      const regimes = await fetchMarketRegimes(asset.id, startDate, endDate, 20, 20, 2.0, -2.0, 25.0);
      const peerId = asset.id === 'gold' ? 'bitcoin' : 'gold';
      const correlation = await fetchCorrelation(asset.id, peerId, startDate, endDate, 30);

      setContextData({
        asset: {
          id: asset.id,
          name: asset.name,
          symbol: asset.symbol,
          category: asset.category
        },
        period: `${startDate} to ${endDate}`,
        analytics: analytics,
        backtest: backtest,
        benchmark: backtest?.benchmark,
        regimes: regimes,
        correlation: correlation
      });
    } catch (err) {
      console.warn('Could not populate quantitative research context:', err);
    } finally {
      setLoadingContext(false);
    }
  }, [startDate, endDate]);

  useEffect(() => {
    loadAssetContext(selectedAsset);
  }, [selectedAsset, loadAssetContext]);

  // Execute AI Research Query
  const handleRunAnalysis = async (customQuestion) => {
    const q = (customQuestion || question || '').trim();
    if (!q) {
      setValidationError('Please enter a question or select a prompt.');
      return;
    }
    setValidationError(null);
    setError(null);
    setIsLoading(true);

    try {
      const response = await askAIResearch(q, contextData);
      setAiResult(response);
    } catch (err) {
      console.error('AI Research request error:', err);
      const status = err.response?.status;
      const detail = err.response?.data?.detail;

      if (status === 503 || (detail && detail.includes('not configured'))) {
        setError('AI research is not configured.');
      } else if (status === 504 || (detail && detail.includes('timed out'))) {
        setError('AI request timed out. Please try again.');
      } else if (status === 502 || status === 500) {
        setError('AI service temporarily unavailable.');
      } else if (detail) {
        setError(detail);
      } else {
        setError('AI service temporarily unavailable.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectQuick = (q) => {
    setQuestion(q);
    setValidationError(null);
    handleRunAnalysis(q);
  };

  // Helper to format structured AI response cleanly
  const renderStructuredAnswer = (answerText) => {
    if (!answerText) return null;

    // Split on markdown headings like ### 1. DIRECT ANSWER or **1. DIRECT ANSWER**
    const parts = answerText.split(/(?=###\s+\d*\.?\s*[A-Z\s\/]+|\*\*\d*\.?\s*[A-Z\s\/]+\*\*)/g);

    if (parts.length <= 1) {
      return (
        <div style={{ whiteSpace: 'pre-wrap', lineHeight: '1.65', fontSize: '0.9rem', color: 'var(--text-primary)' }}>
          {answerText}
        </div>
      );
    }

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
        {parts.map((p, idx) => {
          const raw = p.trim();
          if (!raw) return null;

          const match = raw.match(/^(?:###|\*\*)\s*(\d*\.?\s*[A-Z\s\/]+?)(?:\*\*|\n|$)/);
          const rawTitle = match ? match[1].trim() : null;
          const body = match ? raw.slice(match[0].length).trim() : raw;

          // Map title to human-friendly clean labels
          let displayTitle = rawTitle;
          let titleColor = 'var(--text-secondary)';
          let accentBg = 'var(--bg-surface)';
          let accentBorder = 'var(--border-subtle)';

          if (rawTitle) {
            if (rawTitle.includes('DIRECT') || rawTitle.includes('SUMMARY')) {
              displayTitle = 'Summary';
              titleColor = 'var(--color-blue)';
              accentBg = 'rgba(37, 99, 235, 0.03)';
              accentBorder = 'rgba(37, 99, 235, 0.2)';
            } else if (rawTitle.includes('METRICS')) {
              displayTitle = 'Key Metrics';
              titleColor = 'var(--color-cyan)';
            } else if (rawTitle.includes('MEANS')) {
              displayTitle = 'What It Means';
              titleColor = 'var(--text-primary)';
            } else if (rawTitle.includes('RISK') || rawTitle.includes('LIMIT')) {
              displayTitle = 'Risk / Limitation';
              titleColor = 'var(--color-amber)';
              accentBg = 'rgba(217, 119, 6, 0.03)';
              accentBorder = 'rgba(217, 119, 6, 0.2)';
            } else if (rawTitle.includes('TAKEAWAY')) {
              displayTitle = 'Key Takeaway';
              titleColor = 'var(--color-green)';
              accentBg = 'rgba(22, 163, 74, 0.03)';
              accentBorder = 'rgba(22, 163, 74, 0.2)';
            }
          }

          const isMetrics = displayTitle === 'Key Metrics';

          return (
            <div 
              key={idx}
              style={{
                background: accentBg,
                border: `1px solid ${accentBorder}`,
                borderRadius: 'var(--radius-sm)',
                padding: '0.85rem 1.1rem'
              }}
            >
              {displayTitle && (
                <div style={{
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  color: titleColor,
                  marginBottom: '0.4rem'
                }}>
                  {displayTitle}
                </div>
              )}
              <div style={{
                fontSize: '0.875rem',
                color: 'var(--text-primary)',
                lineHeight: '1.6',
                whiteSpace: 'pre-wrap',
                fontFamily: isMetrics ? 'var(--font-mono)' : 'inherit'
              }}>
                {body}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', maxWidth: '1000px', margin: '0 auto' }}>
      {/* 1. Header: Clean, Simple, Professional */}
      <div className="content-card" style={{ padding: '1rem 1.25rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', marginBottom: '0.2rem' }}>
              <div 
                className="icon-badge-3d" 
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 7,
                  background: 'linear-gradient(180deg, #ffffff 0%, #f1f5f9 100%)',
                  boxShadow: '0 1px 3px rgba(15, 23, 42, 0.08), inset 0 1px 0 #ffffff',
                  border: '1px solid var(--border-subtle)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--color-blue)',
                  flexShrink: 0
                }}
              >
                <Sparkles size={16} />
              </div>
              <h2 style={{ fontSize: '1.2rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                QUANTEXA AI Research Assistant
              </h2>
              <span 
                className="card-action-badge" 
                style={{ 
                  color: aiStatus?.configured ? 'var(--color-green)' : 'var(--color-amber)',
                  borderColor: aiStatus?.configured ? 'var(--color-green)' : 'var(--color-amber)',
                  fontSize: '0.68rem',
                  padding: '0.15rem 0.45rem'
                }}
              >
                {aiStatus?.configured ? 'AI Active' : 'AI Offline'}
              </span>
            </div>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.825rem', margin: 0 }}>
              Ask questions about your quantitative analysis and get clear, data-grounded explanations.
            </p>
          </div>
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

      {/* 2. Primary Question Area: Main Visual Focus */}
      <div className="content-card" style={{ padding: '1.25rem' }}>
        {/* 4. Quick Questions Chips (Compact) */}
        <div style={{ marginBottom: '0.85rem' }}>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600, marginBottom: '0.4rem' }}>
            Suggested Questions:
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
            {QUICK_QUESTIONS.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => handleSelectQuick(q)}
                disabled={isLoading}
                className="indicator-toggle"
                style={{
                  padding: '0.3rem 0.65rem',
                  fontSize: '0.76rem',
                  cursor: 'pointer',
                  borderColor: question === q ? 'var(--color-blue)' : 'var(--border-subtle)',
                  color: question === q ? 'var(--color-blue)' : 'var(--text-secondary)',
                  background: question === q ? 'rgba(37, 99, 235, 0.06)' : 'var(--bg-surface)',
                  fontWeight: question === q ? 600 : 400
                }}
              >
                {q}
              </button>
            ))}
          </div>
        </div>

        {/* Large Textarea & Run Analysis Action */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <textarea
            rows={4}
            value={question}
            onChange={(e) => {
              setQuestion(e.target.value);
              setValidationError(null);
            }}
            placeholder="Ask about your analysis..."
            style={{
              width: '100%',
              background: '#ffffff',
              border: validationError ? '1px solid var(--color-red)' : '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--text-primary)',
              padding: '0.85rem 1rem',
              fontSize: '0.9rem',
              fontFamily: 'inherit',
              lineHeight: '1.5',
              resize: 'vertical',
              outline: 'none',
              boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04), inset 0 1px 2px rgba(15, 23, 42, 0.03)'
            }}
          />

          {validationError && (
            <span style={{ color: 'var(--color-red)', fontSize: '0.75rem', marginTop: '-0.35rem' }}>
              {validationError}
            </span>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
            {/* 5. Collapsible Quantitative Context Link */}
            <button
              type="button"
              onClick={() => setShowContext(!showContext)}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--text-secondary)',
                fontSize: '0.78rem',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem',
                padding: '0.35rem 0',
                transition: 'var(--transition-fast)'
              }}
            >
              <Layers size={14} color="var(--color-blue)" />
              <span style={{ fontWeight: 500 }}>
                {showContext ? 'Hide quantitative context' : 'View quantitative context'}
              </span>
              {showContext ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                ({selectedAsset.name} &bull; {selectedAsset.symbol})
              </span>
            </button>

            {/* Run Analysis Button */}
            <button
              type="button"
              className="btn-primary"
              onClick={() => handleRunAnalysis()}
              disabled={isLoading || loadingContext}
              style={{ padding: '0.65rem 1.4rem', fontSize: '0.85rem', fontWeight: 600, minWidth: '150px' }}
            >
              {isLoading ? (
                <>
                  <RefreshCw size={15} className="spin-animation" />
                  <span>Analyzing...</span>
                </>
              ) : (
                <>
                  <Send size={15} />
                  <span>Run Analysis</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Expandable Quantitative Context Panel */}
        {showContext && (
          <div style={{
            marginTop: '1rem',
            paddingTop: '0.85rem',
            borderTop: '1px solid var(--border-subtle)',
            animation: 'fadeIn 0.2s ease-in-out'
          }}>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600, marginBottom: '0.5rem' }}>
              Authoritative Backend Metrics ({selectedAsset.name} &bull; {startDate} → {endDate})
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.65rem' }}>
              <div style={{ background: 'var(--bg-surface)', padding: '0.65rem 0.8rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
                <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Asset Return</div>
                <div style={{ fontSize: '1rem', fontWeight: 700, color: (contextData?.analytics?.summary?.total_return_pct ?? 0) >= 0 ? 'var(--color-green)' : 'var(--color-red)', fontFamily: 'var(--font-mono)' }}>
                  {contextData?.analytics?.summary?.total_return_pct !== undefined ? `${contextData.analytics.summary.total_return_pct.toFixed(2)}%` : '--'}
                </div>
                <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
                  CAGR: {contextData?.analytics?.summary?.cagr_pct !== undefined ? `${contextData.analytics.summary.cagr_pct.toFixed(2)}%` : '--'}
                </div>
              </div>

              <div style={{ background: 'var(--bg-surface)', padding: '0.65rem 0.8rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
                <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Volatility &amp; Sharpe</div>
                <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--color-blue)', fontFamily: 'var(--font-mono)' }}>
                  {contextData?.analytics?.summary?.annualized_volatility_pct !== undefined ? `${contextData.analytics.summary.annualized_volatility_pct.toFixed(2)}%` : '--'}
                </div>
                <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
                  Sharpe: {contextData?.analytics?.summary?.sharpe_ratio !== undefined ? contextData.analytics.summary.sharpe_ratio.toFixed(2) : '--'}
                </div>
              </div>

              <div style={{ background: 'var(--bg-surface)', padding: '0.65rem 0.8rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
                <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Max Drawdown</div>
                <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--color-red)', fontFamily: 'var(--font-mono)' }}>
                  {contextData?.analytics?.summary?.max_drawdown_pct !== undefined ? `${contextData.analytics.summary.max_drawdown_pct.toFixed(2)}%` : '--'}
                </div>
                <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
                  Peak-to-Trough Drop
                </div>
              </div>

              <div style={{ background: 'var(--bg-surface)', padding: '0.65rem 0.8rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
                <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Benchmark (B&amp;H)</div>
                <div style={{ fontSize: '1rem', fontWeight: 700, color: (contextData?.benchmark?.total_return_pct ?? 0) >= 0 ? 'var(--color-green)' : 'var(--color-red)', fontFamily: 'var(--font-mono)' }}>
                  {contextData?.benchmark?.total_return_pct !== undefined ? `${contextData.benchmark.total_return_pct.toFixed(2)}%` : '--'}
                </div>
                <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
                  Trades: {contextData?.backtest?.performance?.trades_count ?? '--'} | Win: {contextData?.backtest?.performance?.win_rate_pct !== undefined ? `${contextData.backtest.performance.win_rate_pct.toFixed(1)}%` : '--'}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 8. Empty State: Shown before the first analysis */}
      {!aiResult && !isLoading && !error && (
        <div className="content-card" style={{ textAlign: 'center', padding: '2.5rem 1.5rem' }}>
          <div style={{
            width: 44,
            height: 44,
            borderRadius: '50%',
            background: 'rgba(37, 99, 235, 0.08)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 0.75rem',
            color: 'var(--color-blue)'
          }}>
            <Sparkles size={22} />
          </div>
          <h3 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.35rem' }}>
            Ready for Quantitative Research
          </h3>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', maxWidth: '440px', margin: '0 auto' }}>
            Ask a question about the selected asset to explore your quantitative results.
          </p>
        </div>
      )}

      {/* Loading State Banner */}
      {isLoading && (
        <div className="content-card" style={{ textAlign: 'center', padding: '2.5rem 1.5rem' }}>
          <RefreshCw size={26} className="spin-animation" color="var(--color-blue)" style={{ margin: '0 auto 0.75rem' }} />
          <div style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-primary)' }}>
            Analyzing quantitative results...
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.35rem' }}>
            Compiling structured quantitative context for Featherless AI inference.
          </div>
        </div>
      )}

      {/* Error & Unconfigured State Banner */}
      {error && !isLoading && (
        <div className="content-card" style={{ borderLeft: '4px solid var(--color-amber)', background: 'rgba(217, 119, 6, 0.04)' }}>
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
            <AlertTriangle size={20} color="var(--color-amber)" style={{ flexShrink: 0, marginTop: '0.15rem' }} />
            <div>
              <div style={{ fontSize: '0.92rem', fontWeight: 600, color: 'var(--color-amber)', marginBottom: '0.25rem' }}>
                {error}
              </div>
              {error.includes('not configured') && (
                <div style={{ fontSize: '0.825rem', color: 'var(--text-secondary)', lineHeight: '1.4' }}>
                  The Featherless AI service requires an API key in your <code>backend/.env</code> file.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 6 & 7. Prominent AI Result Card with Clean Sections */}
      {aiResult && !isLoading && (
        <div className="content-card" style={{ padding: '1.25rem' }}>
          <div className="card-title-row" style={{ borderBottom: '1px solid var(--border-subtle)', paddingBottom: '0.75rem', marginBottom: '1rem' }}>
            <span className="card-title">
              <FileText size={18} color="var(--color-blue)" />
              Research Explanation
            </span>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
              Model: {aiResult.model || 'Featherless AI'}
            </span>
          </div>

          {/* Dynamic Structured Response */}
          {renderStructuredAnswer(aiResult.answer)}

          {/* Regulatory Disclaimer */}
          <div style={{
            marginTop: '1.25rem',
            paddingTop: '0.75rem',
            borderTop: '1px solid var(--border-subtle)',
            fontSize: '0.725rem',
            color: 'var(--text-muted)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem'
          }}>
            <span style={{ fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', fontSize: '0.68rem', letterSpacing: '0.04em' }}>
              Disclaimer:
            </span>
            <span>
              {aiResult.disclaimer || 'QUANTEXA AI Research Assistant is strictly for historical analytical and research purposes. No financial advice.'}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
