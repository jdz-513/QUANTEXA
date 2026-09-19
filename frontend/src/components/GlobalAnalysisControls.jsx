import React from 'react';
import { Layers, Calendar } from 'lucide-react';
import { ASSETS, PRESETS } from './AssetBar';

export { ASSETS, PRESETS };

/**
 * GlobalAnalysisControls
 * Unified single source of truth for Asset + Range Controls across all analytical pages:
 * - Overview
 * - Performance & Risk
 * - Correlation Matrix
 * - Backtesting Lab
 * - Robustness & Regimes
 * - AI Research
 */
export default function GlobalAnalysisControls({
  selectedAsset,
  onSelectAsset,
  datePreset,
  onSelectPreset,
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
  className = ''
}) {
  const currentAssetId = selectedAsset?.id || (typeof selectedAsset === 'string' ? selectedAsset : 'gold');

  return (
    <div className={`control-bar ${className}`.trim()} role="region" aria-label="Global Analysis Controls">
      {/* 1. ASSET SELECTOR */}
      <div className="control-section">
        <div className="control-tag-with-icon">
          <Layers size={13} className="control-icon" />
          <span className="control-tag">ASSET</span>
        </div>
        <div className="segmented-group">
          {ASSETS.map((asset) => {
            const isSelected = currentAssetId === asset.id;
            return (
              <button
                key={asset.id}
                type="button"
                className={`segment-btn ${isSelected ? 'selected' : ''}`}
                onClick={() => onSelectAsset && onSelectAsset(asset)}
                aria-pressed={isSelected}
              >
                <span className="segment-name">{asset.name}</span>
                {isSelected && <span className="segment-symbol">{asset.symbol}</span>}
              </button>
            );
          })}
        </div>
      </div>

      <div className="control-divider" aria-hidden="true" />

      {/* 2. RANGE PRESETS + DATE PICKERS */}
      <div className="control-section">
        <div className="control-tag-with-icon">
          <Calendar size={13} className="control-icon" />
          <span className="control-tag">RANGE</span>
        </div>
        <div className="segmented-group">
          {PRESETS.map((p) => {
            const isSelected = datePreset === p.id;
            return (
              <button
                key={p.id}
                type="button"
                className={`segment-btn mini ${isSelected ? 'selected' : ''}`}
                onClick={() => onSelectPreset && onSelectPreset(p.id)}
                aria-pressed={isSelected}
              >
                {p.label}
              </button>
            );
          })}
        </div>

        {/* Inline Date Horizon Input */}
        <div className="date-range-inline">
          <div className="date-input-wrap">
            <input
              type="date"
              className="compact-date-input"
              value={startDate || ''}
              onChange={(e) => onStartDateChange && onStartDateChange(e.target.value)}
              aria-label="Start date"
            />
          </div>
          <span className="date-arrow" aria-hidden="true">&rarr;</span>
          <div className="date-input-wrap">
            <input
              type="date"
              className="compact-date-input"
              value={endDate || ''}
              onChange={(e) => onEndDateChange && onEndDateChange(e.target.value)}
              aria-label="End date"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
