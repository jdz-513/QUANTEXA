import React from 'react';
import { Layers, Calendar } from 'lucide-react';

export const ASSETS = [
  { id: 'gold', symbol: 'GC=F', name: 'Gold', category: 'Commodity' },
  { id: 'bitcoin', symbol: 'BTC-USD', name: 'Bitcoin', category: 'Crypto' },
  { id: 'nvidia', symbol: 'NVDA', name: 'NVIDIA', category: 'Equity' },
];

export const PRESETS = [
  { id: '1Y', label: '1Y' },
  { id: '2Y', label: '2Y' },
  { id: '5Y', label: '5Y' },
  { id: 'MAX', label: 'MAX' },
];

export default function AssetBar({ 
  selectedAsset, 
  onSelectAsset, 
  datePreset, 
  onSelectPreset,
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange
}) {
  return (
    <div className="control-bar">
      {/* 1. ASSET SECTION */}
      <div className="control-section">
        <div className="control-tag-with-icon">
          <Layers size={13} className="control-icon" />
          <span className="control-tag">ASSET</span>
        </div>
        <div className="segmented-group">
          {ASSETS.map((asset) => {
            const isSelected = selectedAsset.id === asset.id;
            return (
              <button
                key={asset.id}
                type="button"
                className={`segment-btn ${isSelected ? 'selected' : ''}`}
                onClick={() => onSelectAsset(asset)}
              >
                <span className="segment-name">{asset.name}</span>
                {isSelected && <span className="segment-symbol">{asset.symbol}</span>}
              </button>
            );
          })}
        </div>
      </div>

      <div className="control-divider" aria-hidden="true" />

      {/* 2. RANGE SECTION */}
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
                onClick={() => onSelectPreset(p.id)}
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
              value={startDate}
              onChange={(e) => onStartDateChange(e.target.value)}
              aria-label="Start date"
            />
          </div>
          <span className="date-arrow">to</span>
          <div className="date-input-wrap">
            <input
              type="date"
              className="compact-date-input"
              value={endDate}
              onChange={(e) => onEndDateChange(e.target.value)}
              aria-label="End date"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
