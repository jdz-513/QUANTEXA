import React from 'react';
import { 
  BarChart2, 
  LayoutGrid, 
  FlaskConical, 
  Sliders, 
  Sparkles, 
  ChevronRight 
} from 'lucide-react';

const MODULES = [
  {
    id: 'performance',
    title: 'Performance & Risk',
    description: 'Returns, risk metrics and drawdowns',
    icon: BarChart2,
    accent: '#2563EB',
    bg: 'rgba(37, 99, 235, 0.08)'
  },
  {
    id: 'correlation',
    title: 'Correlation Matrix',
    description: 'Multi-asset correlation analysis',
    icon: LayoutGrid,
    accent: '#0891B2',
    bg: 'rgba(8, 145, 178, 0.08)'
  },
  {
    id: 'backtest',
    title: 'Backtesting Lab',
    description: 'Test and validate strategies',
    icon: FlaskConical,
    accent: '#7C3AED',
    bg: 'rgba(124, 58, 237, 0.08)'
  },
  {
    id: 'regimes',
    title: 'Robustness & Regimes',
    description: 'Parameter sensitivity & market regimes',
    icon: Sliders,
    accent: '#2563EB',
    bg: 'rgba(37, 99, 235, 0.08)'
  },
  {
    id: 'ai',
    title: 'AI Research',
    description: 'Get AI-powered insights',
    icon: Sparkles,
    accent: '#0284C7',
    bg: 'rgba(2, 132, 199, 0.08)'
  }
];

export default function ModuleCards({ onSelectTab }) {
  return (
    <div className="module-cards-grid">
      {MODULES.map((mod) => {
        const Icon = mod.icon;
        return (
          <button
            key={mod.id}
            type="button"
            className="module-card-btn"
            onClick={() => onSelectTab(mod.id)}
            title={`Navigate to ${mod.title}`}
          >
            <div className="module-card-top">
              <div 
                className="module-icon-box"
                style={{ color: mod.accent, background: mod.bg }}
              >
                <Icon size={16} strokeWidth={2.2} />
              </div>
              <div className="module-card-arrow">
                <ChevronRight size={15} />
              </div>
            </div>
            <div className="module-card-body">
              <div className="module-card-title">{mod.title}</div>
              <div className="module-card-desc">{mod.description}</div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
