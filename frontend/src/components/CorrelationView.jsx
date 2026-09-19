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
  GitBranch, 
  ArrowLeftRight, 
  Info, 
  AlertCircle, 
  RefreshCw,
  TrendingUp,
  Activity
} from 'lucide-react';
import { fetchCorrelationMatrix, fetchCorrelation } from '../services/api';
import PerformanceRiskSummary from './PerformanceRiskSummary';
import GlobalAnalysisControls from './GlobalAnalysisControls';

const ASSET_META = {
  gold: { id: 'gold', name: 'Gold', ticker: 'GC=F', color: '#f59e0b' },
  bitcoin: { id: 'bitcoin', name: 'Bitcoin', ticker: 'BTC-USD', color: '#f97316' },
  nvidia: { id: 'nvidia', name: 'NVIDIA', ticker: 'NVDA', color: '#10b981' },
};

const ROLLING_WINDOWS = [7, 30, 60, 90];

/**
 * Format correlation values strictly to 2 decimal places with sign.
 * Diagonal is always strictly 1.00.
 */
const formatCorrelation = (val, isDiagonal = false) => {
  if (isDiagonal) return '1.00';
  if (val === null || val === undefined || isNaN(val) || !isFinite(val)) return '--';
  const num = Number(val);
  const sign = num > 0 ? '+' : '';
  return `${sign}${num.toFixed(2)}`;
};

/**
 * Professional quantitative heatmap color scale.
 * +1 -> strong positive (green)
 *  0 -> near neutral (slate/light grey)
 * -1 -> strong negative (red/rose)
 * Diagonal -> benchmark blue
 */
const getCorrelationColor = (val, isDiagonal = false) => {
  if (isDiagonal) {
    return { 
      bg: 'rgba(37, 99, 235, 0.08)', 
      text: '#1d4ed8', 
      border: 'rgba(37, 99, 235, 0.3)' 
    };
  }
  if (val === null || val === undefined || isNaN(val) || !isFinite(val)) {
    return { 
      bg: 'var(--bg-surface)', 
      text: 'var(--text-muted)', 
      border: 'var(--border-subtle)' 
    };
  }
  const v = Number(val);
  // Positive correlations (Green)
  if (v >= 0.5) return { bg: 'rgba(22, 163, 74, 0.22)', text: '#14532d', border: 'rgba(22, 163, 74, 0.45)' };
  if (v >= 0.2) return { bg: 'rgba(22, 163, 74, 0.12)', text: '#15803d', border: 'rgba(22, 163, 74, 0.3)' };
  if (v >= 0.05) return { bg: 'rgba(22, 163, 74, 0.06)', text: '#16a34a', border: 'rgba(22, 163, 74, 0.18)' };
  
  // Near-Zero / Independent (-0.05 < v < 0.05) (Neutral Slate)
  if (v > -0.05) return { bg: '#f8fafc', text: '#475569', border: '#e2e8f0' };
  
  // Negative correlations (Red / Amber)
  if (v > -0.2) return { bg: 'rgba(239, 68, 68, 0.06)', text: '#dc2626', border: 'rgba(239, 68, 68, 0.18)' };
  if (v > -0.5) return { bg: 'rgba(239, 68, 68, 0.12)', text: '#b91c1c', border: 'rgba(239, 68, 68, 0.3)' };
  return { bg: 'rgba(239, 68, 68, 0.22)', text: '#7f1d1d', border: 'rgba(239, 68, 68, 0.45)' };
};

const getStrengthLabel = (val) => {
  if (val === null || val === undefined || isNaN(val) || !isFinite(val)) return 'Unknown';
  const v = Number(val);
  if (v >= 0.7) return 'Strong Positive';
  if (v >= 0.3) return 'Moderate Positive';
  if (v >= 0.05) return 'Weak Positive';
  if (v > -0.05) return 'Uncorrelated / Independent';
  if (v > -0.3) return 'Weak Inverse';
  if (v > -0.7) return 'Moderate Inverse';
  return 'Strong Inverse';
};

/**
 * Validate incoming correlation matrix response.
 * Checks structure, asset arrays, matrix rows/cells, and ensures finite numbers (no NaN, no Infinity).
 */
const validateMatrixData = (data) => {
  if (!data || typeof data !== 'object') {
    return { valid: false, error: 'Unable to load correlation data: invalid server response structure.' };
  }
  if (!Array.isArray(data.assets) || data.assets.length === 0) {
    return { valid: false, error: 'Unable to load correlation data: missing asset definitions in response.' };
  }
  if (!data.matrix || typeof data.matrix !== 'object') {
    return { valid: false, error: 'Unable to load correlation data: missing matrix object.' };
  }
  for (const r of data.assets) {
    const row = data.matrix[r];
    if (!row || typeof row !== 'object') {
      return { valid: false, error: `Unable to load correlation data: missing row for ${r}.` };
    }
    for (const c of data.assets) {
      const val = row[c];
      if (val === undefined || val === null || typeof val !== 'number' || isNaN(val) || !isFinite(val)) {
        return { valid: false, error: `Unable to load correlation data: non-numeric value received for ${r} ↔ ${c}.` };
      }
    }
  }
  return { valid: true };
};

const CustomCorrelationTooltip = ({ active, payload, assetAName, assetBName }) => {
  if (active && payload && payload.length) {
    const d = payload[0].payload;
    const r = d.correlation;
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
        <div style={{ fontWeight: 600, color: 'var(--color-blue)', marginBottom: '0.35rem', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.25rem' }}>
          {d.date}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem' }}>
          <span style={{ color: 'var(--text-muted)' }}>{assetAName} ↔ {assetBName}:</span>
          <span style={{ 
            fontWeight: 700, 
            color: r !== null ? (r >= 0 ? 'var(--color-green)' : 'var(--color-red)') : 'var(--text-muted)' 
          }}>
            {r !== null ? (r >= 0 ? `+${r.toFixed(2)}` : r.toFixed(2)) : 'Warmup (null)'}
          </span>
        </div>
      </div>
    );
  }
  return null;
};

export default function CorrelationView({ 
  selectedAsset,
  onSelectAsset,
  datePreset,
  onSelectPreset,
  startDate, 
  endDate,
  onStartDateChange,
  onEndDateChange,
  analyticsData,
  isLoadingAnalytics,
  analyticsError
}) {
  // Active date horizon (using selected period from controls)
  const activeStartDate = startDate || (() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 1);
    return d.toISOString().split('T')[0];
  })();
  const activeEndDate = endDate || new Date().toISOString().split('T')[0];

  // 3x3 Matrix State
  const [matrixData, setMatrixData] = useState(null);
  const [isLoadingMatrix, setIsLoadingMatrix] = useState(true);
  const [matrixError, setMatrixError] = useState(null);

  // Pair & Rolling State
  const [assetA, setAssetA] = useState('gold');
  const [assetB, setAssetB] = useState('bitcoin');
  const [rollingWindow, setRollingWindow] = useState(30);

  const [pairData, setPairData] = useState(null);
  const [isLoadingPair, setIsLoadingPair] = useState(false);
  const [pairError, setPairError] = useState(null);

  // 1. Load 3x3 Correlation Matrix from backend
  const loadMatrix = useCallback(async () => {
    setIsLoadingMatrix(true);
    setMatrixError(null);
    try {
      const res = await fetchCorrelationMatrix(activeStartDate, activeEndDate);
      const validation = validateMatrixData(res);
      if (!validation.valid) {
        setMatrixError(validation.error);
      } else {
        setMatrixData(res);
      }
    } catch (err) {
      console.error('Correlation matrix load error:', err);
      let detail = 'Unable to load correlation data.';
      if (err.code === 'ERR_NETWORK' || !err.response) {
        detail = 'Unable to load correlation data: QUANTEXA backend server is unreachable. Please verify server status.';
      } else if (err.response?.data?.detail) {
        detail = `Unable to load correlation data: ${err.response.data.detail}`;
      } else if (err.message) {
        detail = `Unable to load correlation data: ${err.message}`;
      }
      setMatrixError(detail);
    } finally {
      setIsLoadingMatrix(false);
    }
  }, [activeStartDate, activeEndDate]);

  // 2. Load Pair & Rolling Correlation series from backend
  const loadPairCorrelation = useCallback(async () => {
    if (!assetA || !assetB || assetA === assetB) return;
    setIsLoadingPair(true);
    setPairError(null);
    try {
      const res = await fetchCorrelation(assetA, assetB, activeStartDate, activeEndDate, rollingWindow);
      setPairData(res);
    } catch (err) {
      console.error('Pair correlation load error:', err);
      const detail = err.response?.data?.detail || err.message || 'Failed to compute pair correlation series.';
      setPairError(detail);
    } finally {
      setIsLoadingPair(false);
    }
  }, [assetA, assetB, activeStartDate, activeEndDate, rollingWindow]);

  useEffect(() => {
    loadMatrix();
  }, [loadMatrix]);

  useEffect(() => {
    loadPairCorrelation();
  }, [loadPairCorrelation]);

  const handleSwapAssets = () => {
    const temp = assetA;
    setAssetA(assetB);
    setAssetB(temp);
  };

  const handleSelectPair = (a, b) => {
    if (a === b) return;
    setAssetA(a);
    setAssetB(b);
  };

  const assets = matrixData?.assets || ['gold', 'bitcoin', 'nvidia'];
  const matrix = matrixData?.matrix || {};
  const observations = matrixData?.observations || {};

  const assetAName = ASSET_META[assetA]?.name || assetA;
  const assetBName = ASSET_META[assetB]?.name || assetB;

  // Static Pearson values derived from the verified matrix API response
  const goldBtc = matrix['gold']?.['bitcoin'] ?? matrix['bitcoin']?.['gold'];
  const goldNvda = matrix['gold']?.['nvidia'] ?? matrix['nvidia']?.['gold'];
  const btcNvda = matrix['bitcoin']?.['nvidia'] ?? matrix['nvidia']?.['bitcoin'];

  // Static Pearson value for currently selected pair in inspector
  const currentPairStaticCorr = matrix[assetA]?.[assetB] ?? pairData?.correlation;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* ==================================================
          1. GLOBAL ASSET + RANGE CONTROLS
          ================================================== */}
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

      {/* ==================================================
          2. PERFORMANCE & RISK EXECUTIVE SUMMARY
          ================================================== */}
      <PerformanceRiskSummary 
        analyticsData={analyticsData}
        isLoading={isLoadingAnalytics}
        error={analyticsError}
        asset={selectedAsset}
        startDate={activeStartDate}
        endDate={activeEndDate}
      />

      {/* ==================================================
          2. CORRELATION MATRIX (PROMINENT 3×3 HEATMAP)
          ================================================== */}
      <div className="content-card correlation-matrix-card">
        <div className="card-title-row">
          <span className="card-title">
            <GitBranch size={18} color="var(--color-cyan)" />
            Cross-Asset Pearson Correlation Matrix (3×3)
          </span>
          <span className="card-action-badge">Aligned Daily Returns</span>
        </div>

        {/* Heatmap Color Scale Legend */}
        <div className="corr-legend-bar">
          <span className="corr-legend-title">Heatmap Scale:</span>
          <span className="corr-legend-item">
            <span className="corr-legend-chip corr-chip-pos-strong" />
            <span>Strong Positive ($r \ge +0.50$)</span>
          </span>
          <span className="corr-legend-item">
            <span className="corr-legend-chip corr-chip-pos-mod" />
            <span>Moderate ($+0.20 \le r &lt; +0.50$)</span>
          </span>
          <span className="corr-legend-item">
            <span className="corr-legend-chip corr-chip-neutral" />
            <span>Neutral / Independent ($-0.05 &lt; r &lt; +0.05$)</span>
          </span>
          <span className="corr-legend-item">
            <span className="corr-legend-chip corr-chip-neg" />
            <span>Inverse / Hedging ($r \le -0.20$)</span>
          </span>
          <span className="corr-legend-item">
            <span className="corr-legend-chip corr-chip-diag" />
            <span>Benchmark Diagonal ($1.00$)</span>
          </span>
        </div>

        {/* Loading State */}
        {isLoadingMatrix ? (
          <div className="placeholder-canvas" style={{ height: '240px' }}>
            <div className="status-dot checking" style={{ width: 14, height: 14 }} />
            <p className="placeholder-text" style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
              Loading correlation data...
            </p>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              Aligning calendar dates and calculating 3×3 Pearson matrix across Gold, Bitcoin, and NVIDIA
            </span>
          </div>
        ) : matrixError ? (
          /* Error State with clear message and Retry button */
          <div className="placeholder-canvas" style={{ height: '240px', borderColor: 'rgba(239, 68, 68, 0.3)' }}>
            <AlertCircle size={26} color="var(--color-red)" />
            <h4 style={{ color: 'var(--text-primary)', fontWeight: 600, margin: '0.25rem 0' }}>
              Unable to load correlation data.
            </h4>
            <p className="placeholder-text" style={{ color: 'var(--color-red)', maxWidth: '480px', marginBottom: '0.75rem' }}>
              {matrixError}
            </p>
            <button 
              type="button" 
              className="btn-primary" 
              onClick={loadMatrix} 
              style={{ padding: '0.4rem 0.95rem', fontSize: '0.78rem' }}
            >
              <RefreshCw size={13} /> Retry
            </button>
          </div>
        ) : (
          /* Real Validated Matrix */
          <div className="correlation-matrix-container">
            <table className="correlation-table">
              <thead>
                <tr>
                  <th className="corr-corner">Asset</th>
                  {assets.map((colKey) => {
                    const isSelected = selectedAsset?.id === colKey;
                    return (
                      <th key={colKey} className={`corr-header ${isSelected ? 'selected-asset-header' : ''}`}>
                        <div className="corr-header-name">
                          {ASSET_META[colKey]?.name}
                          {isSelected && <span className="corr-selected-pill">Active</span>}
                        </div>
                        <div className="asset-ticker">{ASSET_META[colKey]?.ticker}</div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {assets.map((rowKey) => {
                  const isSelectedRow = selectedAsset?.id === rowKey;
                  return (
                    <tr key={rowKey} className={isSelectedRow ? 'selected-asset-row' : ''}>
                      <td className="corr-row-header">
                        <div className="corr-header-name">
                          {ASSET_META[rowKey]?.name}
                          {isSelectedRow && <span className="corr-selected-pill">Active</span>}
                        </div>
                        <div className="asset-ticker">{ASSET_META[rowKey]?.ticker}</div>
                      </td>
                      {assets.map((colKey) => {
                        const isDiag = rowKey === colKey;
                        const val = matrix[rowKey]?.[colKey];
                        const colors = getCorrelationColor(val, isDiag);
                        const isCurrentPair = 
                          (assetA === rowKey && assetB === colKey) || 
                          (assetA === colKey && assetB === rowKey);

                        const pairKey1 = `${rowKey}_${colKey}`;
                        const pairKey2 = `${colKey}_${rowKey}`;
                        const obsCount = observations[pairKey1] || observations[pairKey2] || null;

                        return (
                          <td 
                            key={colKey}
                            className={`corr-cell ${isDiag ? 'diagonal' : 'interactive'} ${isCurrentPair ? 'active-pair-cell' : ''}`}
                            style={{ 
                              backgroundColor: colors.bg, 
                              color: colors.text,
                              borderColor: isCurrentPair ? 'var(--color-blue)' : colors.border
                            }}
                            onClick={() => !isDiag && handleSelectPair(rowKey, colKey)}
                            title={isDiag ? 'Self-correlation benchmark: 1.00' : `${ASSET_META[rowKey]?.name} ↔ ${ASSET_META[colKey]?.name}: ${formatCorrelation(val)} (${obsCount || 0} aligned sessions)`}
                          >
                            <div className="corr-cell-value">
                              {formatCorrelation(val, isDiag)}
                            </div>
                            <div className="corr-cell-obs">
                              {isDiag ? 'Benchmark' : (obsCount ? `${obsCount} days` : 'Aligned')}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ==================================================
          3. PAIRWISE / CORRELATION DETAILS
          ================================================== */}
      {/* 3.1 Quick Pair Switchers with Real Matrix Values */}
      <div className="content-card" style={{ padding: '1rem 1.25rem', background: 'var(--bg-card)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '0.75rem' }}>
          <div>
            <div style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-blue)', marginBottom: '0.2rem' }}>
              Pairwise Analysis
            </div>
            <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)' }}>
              How do Gold, Bitcoin, and NVIDIA move relative to each other?
            </h3>
          </div>
          <span className="card-action-badge">Click Pair to Inspect</span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '0.65rem' }}>
          <button
            type="button"
            onClick={() => handleSelectPair('gold', 'bitcoin')}
            className="indicator-toggle"
            style={{
              padding: '0.6rem 0.85rem',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              cursor: 'pointer',
              background: ((assetA === 'gold' && assetB === 'bitcoin') || (assetA === 'bitcoin' && assetB === 'gold')) ? 'rgba(37, 99, 235, 0.08)' : 'var(--bg-surface)',
              borderColor: ((assetA === 'gold' && assetB === 'bitcoin') || (assetA === 'bitcoin' && assetB === 'gold')) ? 'var(--color-blue)' : 'var(--border-subtle)'
            }}
          >
            <div style={{ textAlign: 'left' }}>
              <div style={{ fontWeight: 600, fontSize: '0.82rem', color: 'var(--text-primary)' }}>Gold ↔ Bitcoin</div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{getStrengthLabel(goldBtc)}</div>
            </div>
            <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '0.92rem', color: (goldBtc ?? 0) >= 0 ? 'var(--color-green)' : 'var(--color-red)' }}>
              {formatCorrelation(goldBtc)}
            </span>
          </button>

          <button
            type="button"
            onClick={() => handleSelectPair('bitcoin', 'nvidia')}
            className="indicator-toggle"
            style={{
              padding: '0.6rem 0.85rem',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              cursor: 'pointer',
              background: ((assetA === 'bitcoin' && assetB === 'nvidia') || (assetA === 'nvidia' && assetB === 'bitcoin')) ? 'rgba(37, 99, 235, 0.08)' : 'var(--bg-surface)',
              borderColor: ((assetA === 'bitcoin' && assetB === 'nvidia') || (assetA === 'nvidia' && assetB === 'bitcoin')) ? 'var(--color-blue)' : 'var(--border-subtle)'
            }}
          >
            <div style={{ textAlign: 'left' }}>
              <div style={{ fontWeight: 600, fontSize: '0.82rem', color: 'var(--text-primary)' }}>Bitcoin ↔ NVIDIA</div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{getStrengthLabel(btcNvda)}</div>
            </div>
            <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '0.92rem', color: (btcNvda ?? 0) >= 0 ? 'var(--color-green)' : 'var(--color-red)' }}>
              {formatCorrelation(btcNvda)}
            </span>
          </button>

          <button
            type="button"
            onClick={() => handleSelectPair('gold', 'nvidia')}
            className="indicator-toggle"
            style={{
              padding: '0.6rem 0.85rem',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              cursor: 'pointer',
              background: ((assetA === 'gold' && assetB === 'nvidia') || (assetA === 'nvidia' && assetB === 'gold')) ? 'rgba(37, 99, 235, 0.08)' : 'var(--bg-surface)',
              borderColor: ((assetA === 'gold' && assetB === 'nvidia') || (assetA === 'nvidia' && assetB === 'gold')) ? 'var(--color-blue)' : 'var(--border-subtle)'
            }}
          >
            <div style={{ textAlign: 'left' }}>
              <div style={{ fontWeight: 600, fontSize: '0.82rem', color: 'var(--text-primary)' }}>Gold ↔ NVIDIA</div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{getStrengthLabel(goldNvda)}</div>
            </div>
            <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '0.92rem', color: (goldNvda ?? 0) >= 0 ? 'var(--color-green)' : 'var(--color-red)' }}>
              {formatCorrelation(goldNvda)}
            </span>
          </button>
        </div>
      </div>

      {/* 3.2 Pair Control & Metrics Inspector */}
      <div className="dashboard-grid">
        <div className="content-card">
          <div className="card-title-row">
            <span className="card-title">
              <Activity size={18} color="var(--color-blue)" />
              Pair Correlation Inspector
            </span>
            <span className="card-action-badge">{rollingWindow}D Dynamic Horizon</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem', marginBottom: '1.25rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: '130px' }}>
                <label className="lab-label" style={{ display: 'block', marginBottom: '0.35rem' }}>Asset A</label>
                <div className="asset-selector" style={{ display: 'flex', gap: '0.35rem' }}>
                  {assets.map((aKey) => (
                    <button
                      key={aKey}
                      type="button"
                      className={`asset-btn ${assetA === aKey ? 'active' : ''}`}
                      onClick={() => {
                        if (assetB === aKey) setAssetB(assetA);
                        setAssetA(aKey);
                      }}
                      style={{ padding: '0.35rem 0.6rem', fontSize: '0.75rem' }}
                    >
                      {ASSET_META[aKey]?.name}
                    </button>
                  ))}
                </div>
              </div>

              <button 
                type="button" 
                onClick={handleSwapAssets}
                className="btn-icon-swap"
                title="Swap Asset A and Asset B"
                style={{ marginTop: '1.2rem' }}
              >
                <ArrowLeftRight size={14} />
              </button>

              <div style={{ flex: 1, minWidth: '130px' }}>
                <label className="lab-label" style={{ display: 'block', marginBottom: '0.35rem' }}>Asset B</label>
                <div className="asset-selector" style={{ display: 'flex', gap: '0.35rem' }}>
                  {assets.map((bKey) => (
                    <button
                      key={bKey}
                      type="button"
                      className={`asset-btn ${assetB === bKey ? 'active' : ''}`}
                      onClick={() => {
                        if (assetA === bKey) setAssetA(assetB);
                        setAssetB(bKey);
                      }}
                      style={{ padding: '0.35rem 0.6rem', fontSize: '0.75rem' }}
                    >
                      {ASSET_META[bKey]?.name}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Rolling Window Pills */}
            <div>
              <label className="lab-label" style={{ display: 'block', marginBottom: '0.35rem' }}>
                Rolling Window ($W$)
              </label>
              <div className="date-presets" style={{ display: 'flex', gap: '0.4rem' }}>
                {ROLLING_WINDOWS.map((win) => (
                  <button
                    key={win}
                    type="button"
                    className={`preset-btn ${rollingWindow === win ? 'active' : ''}`}
                    onClick={() => setRollingWindow(win)}
                    style={{ padding: '0.25rem 0.65rem', fontSize: '0.75rem' }}
                  >
                    {win}D
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Current Pair Metrics Box */}
          <div style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-sm)',
            padding: '0.85rem 1rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.65rem',
            fontSize: '0.8rem'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: 'var(--text-muted)' }}>Full Horizon Pearson $r$:</span>
              <span style={{ 
                fontFamily: 'var(--font-mono)', 
                fontWeight: 700, 
                fontSize: '1rem',
                color: (currentPairStaticCorr ?? 0) >= 0 ? 'var(--color-green)' : 'var(--color-red)'
              }}>
                {formatCorrelation(currentPairStaticCorr)}
              </span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-muted)' }}>Historical Relationship:</span>
              <span style={{ fontWeight: 600, color: 'var(--color-cyan)' }}>
                {getStrengthLabel(currentPairStaticCorr)}
              </span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-muted)' }}>Latest {rollingWindow}D Rolling $r$:</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--text-primary)' }}>
                {pairData?.latest_rolling_correlation !== null && pairData?.latest_rolling_correlation !== undefined 
                  ? (pairData.latest_rolling_correlation >= 0 ? `+${pairData.latest_rolling_correlation.toFixed(2)}` : pairData.latest_rolling_correlation.toFixed(2))
                  : '--'}
              </span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--border-subtle)', paddingTop: '0.5rem' }}>
              <span style={{ color: 'var(--text-muted)' }}>Calendar Aligned Sessions:</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                {pairData?.observations ? `${pairData.observations} matching days` : (observations[`${assetA}_${assetB}`] || observations[`${assetB}_${assetA}`] ? `${observations[`${assetA}_${assetB}`] || observations[`${assetB}_${assetA}`]} matching days` : '--')}
              </span>
            </div>
          </div>
        </div>

        {/* 3.3 Dynamic Rolling Correlation Chart */}
        <div className="content-card">
          <div className="card-title-row">
            <span className="card-title">
              <TrendingUp size={18} color="var(--color-green)" />
              {rollingWindow}-Day Rolling Correlation Time Series
            </span>
            <span className="card-action-badge">{assetAName} ↔ {assetBName}</span>
          </div>

          <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>
            Tracking evolving co-movement regime over time. The initial {rollingWindow - 1} observations represent the warm-up window.
          </p>

          {isLoadingPair ? (
            <div className="placeholder-canvas" style={{ height: '220px' }}>
              <div className="status-dot checking" style={{ width: 14, height: 14 }} />
              <p className="placeholder-text" style={{ color: 'var(--text-primary)', fontWeight: 500 }}>
                Calculating {rollingWindow}-day rolling correlation across aligned sessions...
              </p>
            </div>
          ) : pairError ? (
            <div className="placeholder-canvas" style={{ height: '220px', borderColor: 'rgba(239, 68, 68, 0.3)' }}>
              <AlertCircle size={22} color="var(--color-red)" />
              <p className="placeholder-text" style={{ color: 'var(--color-red)' }}>{pairError}</p>
              <button type="button" className="btn-primary" onClick={loadPairCorrelation} style={{ padding: '0.35rem 0.8rem', fontSize: '0.75rem' }}>
                <RefreshCw size={12} /> Retry Query
              </button>
            </div>
          ) : (
            <div style={{ width: '100%', height: 240 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart 
                  data={pairData?.series || []} 
                  margin={{ top: 10, right: 10, left: 15, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="corrGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#0284c7" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="#0284c7" stopOpacity={0.0} />
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
                    domain={[-1.0, 1.0]}
                    ticks={[-1.0, -0.5, 0.0, 0.5, 1.0]}
                    tickLine={false} 
                    axisLine={{ stroke: '#cbd5e1' }}
                    tick={{ fill: '#64748b', fontSize: 11, fontFamily: 'var(--font-mono)' }}
                    tickFormatter={(v) => `${v > 0 ? '+' : ''}${v.toFixed(1)}`}
                    orientation="right"
                  />
                  <Tooltip 
                    content={
                      <CustomCorrelationTooltip 
                        assetAName={assetAName} 
                        assetBName={assetBName} 
                      />
                    } 
                  />
                  <ReferenceLine y={0} stroke="#cbd5e1" strokeDasharray="3 3" />
                  <ReferenceLine y={1.0} stroke="rgba(22, 163, 74, 0.3)" strokeDasharray="2 2" />
                  <ReferenceLine y={-1.0} stroke="rgba(220, 38, 38, 0.3)" strokeDasharray="2 2" />
                  <Area 
                    type="monotone" 
                    dataKey="correlation" 
                    stroke="#0284c7" 
                    strokeWidth={2}
                    fillOpacity={1} 
                    fill="url(#corrGradient)" 
                    isAnimationActive={true}
                    animationDuration={400}
                    connectNulls={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      {/* 3.4 Educational & Platform Disclaimer Card */}
      <div className="content-card" style={{ background: 'var(--bg-card)' }}>
        <div className="card-title-row">
          <span className="card-title" style={{ fontSize: '0.85rem' }}>
            <Info size={16} color="var(--color-blue)" />
            Interpreting Cross-Asset Correlation
          </span>
          <span className="disclaimer-badge">Methodology Standard</span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', margin: '0.5rem 0 1rem', fontSize: '0.8rem' }}>
          <div style={{ background: 'var(--bg-surface)', padding: '0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
            <span style={{ color: 'var(--color-green)', fontWeight: 600, display: 'block', marginBottom: '0.2rem' }}>
              +1.00 Perfect Positive Correlation
            </span>
            <span style={{ color: 'var(--text-secondary)' }}>
              Assets historically moved in the exact same direction. Offers minimal diversification benefit when held together.
            </span>
          </div>

          <div style={{ background: 'var(--bg-surface)', padding: '0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
            <span style={{ color: 'var(--text-primary)', fontWeight: 600, display: 'block', marginBottom: '0.2rem' }}>
              0.00 No Linear Relationship
            </span>
            <span style={{ color: 'var(--text-secondary)' }}>
              Asset returns fluctuated independently with zero detectable historical linear coupling. High diversification potential.
            </span>
          </div>

          <div style={{ background: 'var(--bg-surface)', padding: '0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
            <span style={{ color: 'var(--color-red)', fontWeight: 600, display: 'block', marginBottom: '0.2rem' }}>
              -1.00 Perfect Inverse Correlation
            </span>
            <span style={{ color: 'var(--text-secondary)' }}>
              Assets historically moved in opposite directions. Represents strong historical hedging characteristics.
            </span>
          </div>
        </div>

        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', borderTop: '1px solid var(--border-subtle)', paddingTop: '0.65rem' }}>
          <strong>Important Research Standard</strong>: Correlation describes historical relationships and does not guarantee future behavior. QUANTEXA is strictly a quantitative research and historical backtesting platform, not investment advice.
        </div>
      </div>
    </div>
  );
}
