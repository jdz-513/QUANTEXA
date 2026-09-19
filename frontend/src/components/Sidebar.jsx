import React from 'react';
import { 
  LayoutDashboard, 
  TrendingUp, 
  GitBranch, 
  Play, 
  Sliders, 
  Sparkles 
} from 'lucide-react';

const NAV_ITEMS = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'performance', label: 'Performance & Risk', icon: TrendingUp },
  { id: 'correlation', label: 'Correlation Matrix', icon: GitBranch },
  { id: 'backtest', label: 'Backtesting Lab', icon: Play },
  { id: 'regimes', label: 'Robustness & Regimes', icon: Sliders },
  { id: 'ai', label: 'AI Research', icon: Sparkles },
];

export default function Sidebar({ activeTab, onSelectTab }) {
  return (
    <aside className="app-sidebar">
      {/* Brand Header */}
      <div className="sidebar-brand">
        <div className="sidebar-logo-row">
          <div className="sidebar-logo-3d">
            <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
              <defs>
                <linearGradient id="logoGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#38BDF8" />
                  <stop offset="50%" stopColor="#2563EB" />
                  <stop offset="100%" stopColor="#0F172A" />
                </linearGradient>
                <filter id="logoShadow" x="-20%" y="-20%" width="140%" height="140%">
                  <feDropShadow dx="0" dy="2" stdDeviation="2" floodColor="#2563EB" floodOpacity="0.3" />
                </filter>
              </defs>
              <circle cx="14" cy="14" r="12" fill="url(#logoGrad)" filter="url(#logoShadow)" />
              <circle cx="14" cy="14" r="7" fill="#F7F9FC" />
              <path d="M18 18L23 23" stroke="#2563EB" strokeWidth="3" strokeLinecap="round" />
            </svg>
          </div>
          <div className="sidebar-brand-text">
            <div className="sidebar-title-row">
              <span className="sidebar-brand-name">QUANTEXA</span>
              <span className="sidebar-brand-badge">V1.0 - ALPHA</span>
            </div>
            <span className="sidebar-brand-sub">Quantitative Multi-Asset Financial Intelligence</span>
          </div>
        </div>
      </div>

      {/* Navigation List */}
      <nav className="sidebar-nav">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              className={`sidebar-nav-item ${isActive ? 'active' : ''}`}
              onClick={() => onSelectTab(item.id)}
            >
              <span className="sidebar-nav-icon">
                <Icon size={18} strokeWidth={isActive ? 2.4 : 1.9} />
              </span>
              <span className="sidebar-nav-label">{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* 3D Isometric Decorative Cluster at Bottom */}
      <div className="sidebar-footer-visual">
        <div className="sidebar-3d-cubes" aria-hidden="true">
          <svg width="120" height="95" viewBox="0 0 120 95" fill="none">
            <defs>
              <linearGradient id="cubeTop1" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#E0F2FE" />
                <stop offset="100%" stopColor="#BAE6FD" />
              </linearGradient>
              <linearGradient id="cubeLeft1" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#60A5FA" />
                <stop offset="100%" stopColor="#2563EB" />
              </linearGradient>
              <linearGradient id="cubeRight1" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#38BDF8" />
                <stop offset="100%" stopColor="#0284C7" />
              </linearGradient>
            </defs>

            {/* Cube 1: Main elevated cube */}
            <g transform="translate(15, 30)">
              <polygon points="28,0 56,14 28,28 0,14" fill="url(#cubeTop1)" stroke="#ffffff" strokeWidth="0.8" />
              <polygon points="0,14 28,28 28,56 0,42" fill="url(#cubeLeft1)" opacity="0.85" />
              <polygon points="28,28 56,14 56,42 28,56" fill="url(#cubeRight1)" opacity="0.95" />
            </g>

            {/* Cube 2: Lower offset cube */}
            <g transform="translate(48, 48)">
              <polygon points="22,0 44,11 22,22 0,11" fill="url(#cubeTop1)" stroke="#ffffff" strokeWidth="0.8" />
              <polygon points="0,11 22,22 22,44 0,33" fill="url(#cubeLeft1)" opacity="0.75" />
              <polygon points="22,22 44,11 44,33 22,44" fill="url(#cubeRight1)" opacity="0.9" />
            </g>

            {/* Cube 3: Top small accent cube */}
            <g transform="translate(52, 6)">
              <polygon points="16,0 32,8 16,16 0,8" fill="url(#cubeTop1)" stroke="#ffffff" strokeWidth="0.6" />
              <polygon points="0,8 16,16 16,32 0,24" fill="url(#cubeLeft1)" opacity="0.7" />
              <polygon points="16,16 32,8 32,24 16,32" fill="url(#cubeRight1)" opacity="0.85" />
            </g>
          </svg>
        </div>

        <div className="sidebar-creed">
          <span className="creed-word">DATA</span>
          <span className="creed-word">MODELS</span>
          <span className="creed-word">INSIGHTS</span>
          <span className="creed-word">BETTER DECISIONS</span>
          <div className="creed-line" />
        </div>
      </div>
    </aside>
  );
}
