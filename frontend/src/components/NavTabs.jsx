import React from 'react';
import { LineChart, BarChart3, GitCompare, Cpu, Sliders, Sparkles } from 'lucide-react';

const TABS = [
  { id: 'overview', label: 'Overview', icon: LineChart },
  { id: 'performance', label: 'Performance & Risk', icon: BarChart3 },
  { id: 'correlation', label: 'Correlation Matrix', icon: GitCompare },
  { id: 'backtest', label: 'Backtesting Lab', icon: Cpu },
  { id: 'regimes', label: 'Robustness & Regimes', icon: Sliders },
  { id: 'ai', label: 'AI Research', icon: Sparkles },
];

export default function NavTabs({ activeTab, onSelectTab }) {
  return (
    <nav className="nav-bar-container" aria-label="Main Navigation">
      <div className="nav-tabs" role="tablist">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              className={`tab-btn ${isActive ? 'active' : ''}`}
              onClick={() => onSelectTab(tab.id)}
            >
              <Icon size={15} strokeWidth={isActive ? 2.2 : 1.8} className="tab-icon" />
              <span className="tab-label">{tab.label}</span>
              {isActive && <span className="tab-active-indicator" aria-hidden="true" />}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
