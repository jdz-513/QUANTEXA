import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { 
  Search, 
  Bell, 
  X, 
  CheckCircle2, 
  AlertTriangle, 
  Activity, 
  Sparkles, 
  Layers, 
  TrendingUp, 
  Play, 
  Sliders, 
  GitBranch, 
  LayoutDashboard,
  Cpu,
  Info,
  ChevronRight,
  RefreshCw
} from 'lucide-react';

// Canonical search entities covering ASSETS, STRATEGIES, and MODULES
const SEARCH_ENTITIES = [
  // ASSETS
  {
    type: 'asset',
    group: 'ASSETS',
    id: 'gold',
    title: 'Gold',
    subtitle: 'GC=F • Commodity',
    icon: Layers,
    keywords: ['gold', 'xau', 'gc=f', 'commodity', 'precious metal'],
    assetObj: { id: 'gold', symbol: 'GC=F', name: 'Gold', category: 'Commodity' }
  },
  {
    type: 'asset',
    group: 'ASSETS',
    id: 'bitcoin',
    title: 'Bitcoin',
    subtitle: 'BTC-USD • Crypto',
    icon: Layers,
    keywords: ['bitcoin', 'btc', 'btc-usd', 'crypto', 'cryptocurrency'],
    assetObj: { id: 'bitcoin', symbol: 'BTC-USD', name: 'Bitcoin', category: 'Crypto' }
  },
  {
    type: 'asset',
    group: 'ASSETS',
    id: 'nvidia',
    title: 'NVIDIA',
    subtitle: 'NVDA • Equity',
    icon: Layers,
    keywords: ['nvidia', 'nvda', 'equity', 'tech', 'semiconductor', 'stock'],
    assetObj: { id: 'nvidia', symbol: 'NVDA', name: 'NVIDIA', category: 'Equity' }
  },

  // STRATEGIES
  {
    type: 'strategy',
    group: 'STRATEGIES',
    id: 'sma_crossover',
    title: 'SMA Crossover',
    subtitle: 'Moving Average Trend Following',
    icon: TrendingUp,
    keywords: ['sma', 'crossover', 'moving average', 'trend', 'sma crossover', 'backtest']
  },
  {
    type: 'strategy',
    group: 'STRATEGIES',
    id: 'ema_trend',
    title: 'EMA Trend',
    subtitle: 'Exponential Moving Average Filter',
    icon: TrendingUp,
    keywords: ['ema', 'trend', 'exponential', 'filter', 'ema trend', 'backtest']
  },
  {
    type: 'strategy',
    group: 'STRATEGIES',
    id: 'momentum',
    title: 'Momentum',
    subtitle: 'Rate-of-Change Breakout',
    icon: Play,
    keywords: ['momentum', 'roc', 'rate of change', 'breakout', 'backtest']
  },
  {
    type: 'strategy',
    group: 'STRATEGIES',
    id: 'mean_reversion',
    title: 'Mean Reversion',
    subtitle: 'Statistical Band Dip-Buyer',
    icon: Activity,
    keywords: ['mean reversion', 'dip', 'reversion', 'bands', 'statistical', 'backtest']
  },

  // MODULES
  {
    type: 'module',
    group: 'MODULES',
    id: 'overview',
    title: 'Overview',
    subtitle: 'Unified quantitative research dashboard',
    icon: LayoutDashboard,
    keywords: ['overview', 'dashboard', 'home', 'kpi', 'summary', 'main']
  },
  {
    type: 'module',
    group: 'MODULES',
    id: 'performance',
    title: 'Performance & Risk',
    subtitle: 'Comprehensive portfolio metrics & risk analytics',
    icon: TrendingUp,
    keywords: ['performance', 'risk', 'sharpe', 'drawdown', 'volatility', 'analytics', 'var']
  },
  {
    type: 'module',
    group: 'MODULES',
    id: 'correlation',
    title: 'Correlation Matrix',
    subtitle: 'Cross-asset statistical correlation engine',
    icon: GitBranch,
    keywords: ['correlation', 'matrix', 'cross-asset', 'pearson', 'heatmap']
  },
  {
    type: 'module',
    group: 'MODULES',
    id: 'backtest',
    title: 'Backtesting Lab',
    subtitle: 'Test and validate strategies',
    icon: Play,
    keywords: ['backtest', 'backtesting', 'lab', 'strategy', 'simulation', 'equity curve']
  },
  {
    type: 'module',
    group: 'MODULES',
    id: 'regimes',
    title: 'Robustness & Regimes',
    subtitle: 'Sensitivity diagnostics & market regimes',
    icon: Sliders,
    keywords: ['robustness', 'regimes', 'regime', 'sensitivity', 'parameter', 'diagnostics']
  },
  {
    type: 'module',
    group: 'MODULES',
    id: 'ai',
    title: 'AI Research',
    subtitle: 'DeepSeek-R1 powered quantitative intelligence',
    icon: Sparkles,
    keywords: ['ai', 'ai research', 'featherless', 'deepseek', 'llm', 'intelligence', 'synthesis']
  }
];

// Helper to highlight matching text substring
function HighlightMatch({ text, query }) {
  if (!query || !text) return <>{text}</>;
  const q = query.trim().toLowerCase();
  const lower = text.toLowerCase();
  const index = lower.indexOf(q);
  if (index === -1) return <>{text}</>;

  const before = text.slice(0, index);
  const match = text.slice(index, index + q.length);
  const after = text.slice(index + q.length);

  return (
    <>
      {before}
      <span className="search-match-highlight">{match}</span>
      {after}
    </>
  );
}

export default function Header({ 
  backendHealth, 
  isCheckingHealth, 
  onRefreshHealth,
  selectedAsset,
  onSelectAsset,
  activeTab,
  onSelectTab,
  onSelectStrategy,
  notifications = [],
  onClearNotifications
}) {
  const isOnline = backendHealth?.status === 'ok';
  const latency = backendHealth?.latencyMs || 12;

  // Search State
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(0);

  // Notification State
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const [hasUnread, setHasUnread] = useState(false);

  // Profile Modal State
  const [isProfileOpen, setIsProfileOpen] = useState(false);

  // Container refs for outside clicks
  const searchContainerRef = useRef(null);
  const searchInputRef = useRef(null);
  const notifContainerRef = useRef(null);
  const profileContainerRef = useRef(null);

  // Update unread flag when new notifications arrive
  useEffect(() => {
    if (notifications.some(n => n.unread)) {
      setHasUnread(true);
    }
  }, [notifications]);

  // Outside click listener
  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target)) {
        setIsSearchOpen(false);
      }
      if (notifContainerRef.current && !notifContainerRef.current.contains(e.target)) {
        setIsNotifOpen(false);
      }
      if (profileContainerRef.current && !profileContainerRef.current.contains(e.target)) {
        setIsProfileOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  // Helper to score match relevance
  const getMatchScore = (item, q) => {
    const title = item.title.toLowerCase();
    const subtitle = item.subtitle.toLowerCase();
    
    if (title === q) return 100;
    if (title.startsWith(q)) return 80;
    const titleWords = title.split(/\s+/);
    if (titleWords.some(w => w.startsWith(q))) return 70;
    if (item.keywords?.some(k => k.toLowerCase() === q)) return 65;
    if (item.keywords?.some(k => k.toLowerCase().startsWith(q))) return 55;
    if (subtitle.split(/\s+/).some(w => w.startsWith(q))) return 45;
    if (title.includes(q)) return 40;
    if (subtitle.includes(q)) return 30;
    if (item.keywords?.some(k => k.toLowerCase().includes(q))) return 20;
    return 0;
  };

  // Filter and rank entities based on query
  const filteredResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];
    const matches = SEARCH_ENTITIES.filter(item => {
      const matchTitle = item.title.toLowerCase().includes(q);
      const matchSubtitle = item.subtitle.toLowerCase().includes(q);
      const matchKeywords = item.keywords?.some(k => k.toLowerCase().includes(q));
      return matchTitle || matchSubtitle || matchKeywords;
    });

    return matches.sort((a, b) => getMatchScore(b, q) - getMatchScore(a, q));
  }, [searchQuery]);

  // Grouped results
  const groupedResults = useMemo(() => {
    const assets = filteredResults.filter(i => i.group === 'ASSETS');
    const strategies = filteredResults.filter(i => i.group === 'STRATEGIES');
    const modules = filteredResults.filter(i => i.group === 'MODULES');
    return { assets, strategies, modules };
  }, [filteredResults]);

  // Flattened list for keyboard navigation
  const flatResults = useMemo(() => {
    return [
      ...groupedResults.assets,
      ...groupedResults.strategies,
      ...groupedResults.modules
    ];
  }, [groupedResults]);

  // Reset focus index when results change
  useEffect(() => {
    setFocusedIndex(0);
  }, [searchQuery]);

  // Handle entity selection
  const handleSelectEntity = useCallback((item) => {
    if (!item) return;

    if (item.type === 'asset' && item.assetObj && onSelectAsset) {
      onSelectAsset(item.assetObj);
    } else if (item.type === 'strategy') {
      if (onSelectStrategy) onSelectStrategy(item.id);
      if (onSelectTab) onSelectTab('backtest');
    } else if (item.type === 'module' && onSelectTab) {
      onSelectTab(item.id);
    }

    setSearchQuery('');
    setIsSearchOpen(false);
    if (searchInputRef.current) {
      searchInputRef.current.blur();
    }
  }, [onSelectAsset, onSelectStrategy, onSelectTab]);

  // Keyboard navigation
  const handleKeyDown = (e) => {
    if (!isSearchOpen || flatResults.length === 0) {
      if (e.key === 'Escape') {
        setIsSearchOpen(false);
        searchInputRef.current?.blur();
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setFocusedIndex(prev => (prev + 1) % flatResults.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setFocusedIndex(prev => (prev - 1 + flatResults.length) % flatResults.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const target = flatResults[focusedIndex] || flatResults[0];
      if (target) handleSelectEntity(target);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setIsSearchOpen(false);
      searchInputRef.current?.blur();
    }
  };

  const handleClearSearch = (e) => {
    e.stopPropagation();
    setSearchQuery('');
    setIsSearchOpen(false);
    searchInputRef.current?.focus();
  };

  // Market Line responsive coloring based on active asset
  const marketLineStroke = useMemo(() => {
    if (selectedAsset?.id === 'gold') return '#F59E0B'; // Amber / Gold
    if (selectedAsset?.id === 'bitcoin') return '#F97316'; // Orange / Bitcoin
    if (selectedAsset?.id === 'nvidia') return '#10B981'; // Emerald / Tech
    return '#38BDF8';
  }, [selectedAsset]);

  const toggleNotifPanel = () => {
    const nextState = !isNotifOpen;
    setIsNotifOpen(nextState);
    if (nextState) {
      setHasUnread(false);
    }
  };

  return (
    <header className="top-header-panel">
      {/* Center Mission Motto with Market Wave Decoration */}
      <div className="header-motto-container">
        <div className="header-motto-decor" aria-hidden="true">
          <svg width="240" height="34" viewBox="0 0 240 34" fill="none">
            <path 
              d="M0 24 Q 40 10 80 20 T 160 8 T 240 18" 
              stroke={marketLineStroke} 
              strokeWidth="1.6" 
              strokeOpacity="0.55" 
              fill="none" 
              className="market-wave-curve"
            />
            <circle cx="80" cy="20" r="2.5" fill={marketLineStroke} fillOpacity="0.85" />
            <circle cx="160" cy="8" r="2.5" fill={marketLineStroke} fillOpacity="0.85" />
            <circle cx="210" cy="14" r="2" fill={marketLineStroke} fillOpacity="0.65" />
          </svg>
        </div>

        <div className="header-motto-title-row">
          <div className="motto-accent-bar" style={{ background: marketLineStroke }} />
          <h1 className="header-motto-title">
            <strong>Markets Move.</strong> Data Speaks. We Analyze.
          </h1>
        </div>
        <p className="header-motto-sub">
          HISTORICAL DATA &bull; <span className="highlight-text">QUANTITATIVE MODELS</span> &bull; NO EMOTIONS
        </p>
      </div>

      {/* Right Controls: API Status + Global Search + Notifications + User Profile */}
      <div className="header-right-group">
        {/* Live Backend Status Badge */}
        <div 
          className={`header-api-badge ${isOnline ? 'online' : backendHealth ? 'offline' : 'checking'}`}
          onClick={onRefreshHealth}
          title={isOnline ? `QUANTEXA Backend Online (${latency}ms latency) - Click to verify` : 'Backend checking - Click to re-ping'}
          role="button"
          tabIndex={0}
        >
          <span className={`status-dot ${isOnline ? '' : backendHealth ? 'disconnected' : 'checking'}`} />
          <span className="api-badge-label">
            {isCheckingHealth ? 'Connecting...' : isOnline ? 'API Online' : 'API Offline'}
          </span>
          {isOnline && (
            <span className="api-badge-latency">{latency}ms</span>
          )}
        </div>

        {/* Global Search Bar */}
        <div className="header-search-wrapper" ref={searchContainerRef}>
          <div 
            className={`header-search-bar ${isSearchOpen && searchQuery ? 'focused' : ''}`}
            onClick={() => searchInputRef.current?.focus()}
          >
            <Search size={14} className="search-icon" />
            <input 
              ref={searchInputRef}
              type="text" 
              placeholder="Search assets, strategies..." 
              className="search-input"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setIsSearchOpen(true);
              }}
              onFocus={() => {
                if (searchQuery.trim()) setIsSearchOpen(true);
              }}
              onKeyDown={handleKeyDown}
              id="global-search-input"
              aria-label="Search assets, strategies, and modules"
              autoComplete="off"
            />
            {searchQuery && (
              <button 
                type="button" 
                className="search-clear-btn"
                onClick={handleClearSearch}
                aria-label="Clear search query"
              >
                <X size={13} />
              </button>
            )}
          </div>

          {/* Search Results Dropdown */}
          {isSearchOpen && searchQuery.trim() && (
            <div className="search-dropdown-menu" role="listbox">
              {flatResults.length === 0 ? (
                <div className="search-empty-state">
                  <span className="search-empty-title">No entities matched "{searchQuery}"</span>
                  <span className="search-empty-sub">Search Gold, Bitcoin, NVIDIA, SMA, Momentum, Correlation, AI</span>
                </div>
              ) : (
                <div className="search-results-list">
                  {/* Group 1: ASSETS */}
                  {groupedResults.assets.length > 0 && (
                    <div className="search-group-block">
                      <div className="search-group-header">
                        <span>ASSETS</span>
                        <span className="search-group-count">{groupedResults.assets.length}</span>
                      </div>
                      {groupedResults.assets.map((item) => {
                        const globalIdx = flatResults.indexOf(item);
                        const isFocused = globalIdx === focusedIndex;
                        const isCurrent = selectedAsset?.id === item.id;
                        return (
                          <div 
                            key={item.id}
                            className={`search-result-row ${isFocused ? 'focused' : ''} ${isCurrent ? 'current-active' : ''}`}
                            onClick={() => handleSelectEntity(item)}
                            onMouseEnter={() => setFocusedIndex(globalIdx)}
                            role="option"
                            aria-selected={isFocused}
                          >
                            <div className="search-row-icon-box asset-box">
                              <Layers size={13} />
                            </div>
                            <div className="search-row-details">
                              <div className="search-row-title-row">
                                <span className="search-row-title">
                                  <HighlightMatch text={item.title} query={searchQuery} />
                                </span>
                                {isCurrent && <span className="search-current-pill">Active</span>}
                              </div>
                              <span className="search-row-subtitle">
                                <HighlightMatch text={item.subtitle} query={searchQuery} />
                              </span>
                            </div>
                            <span className="search-action-hint">Select Asset</span>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Group 2: STRATEGIES */}
                  {groupedResults.strategies.length > 0 && (
                    <div className="search-group-block">
                      <div className="search-group-header">
                        <span>STRATEGIES</span>
                        <span className="search-group-count">{groupedResults.strategies.length}</span>
                      </div>
                      {groupedResults.strategies.map((item) => {
                        const globalIdx = flatResults.indexOf(item);
                        const isFocused = globalIdx === focusedIndex;
                        const Icon = item.icon;
                        return (
                          <div 
                            key={item.id}
                            className={`search-result-row ${isFocused ? 'focused' : ''}`}
                            onClick={() => handleSelectEntity(item)}
                            onMouseEnter={() => setFocusedIndex(globalIdx)}
                            role="option"
                            aria-selected={isFocused}
                          >
                            <div className="search-row-icon-box strategy-box">
                              <Icon size={13} />
                            </div>
                            <div className="search-row-details">
                              <div className="search-row-title-row">
                                <span className="search-row-title">
                                  <HighlightMatch text={item.title} query={searchQuery} />
                                </span>
                              </div>
                              <span className="search-row-subtitle">
                                <HighlightMatch text={item.subtitle} query={searchQuery} />
                              </span>
                            </div>
                            <span className="search-action-hint">Backtest Lab</span>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Group 3: MODULES */}
                  {groupedResults.modules.length > 0 && (
                    <div className="search-group-block">
                      <div className="search-group-header">
                        <span>MODULES</span>
                        <span className="search-group-count">{groupedResults.modules.length}</span>
                      </div>
                      {groupedResults.modules.map((item) => {
                        const globalIdx = flatResults.indexOf(item);
                        const isFocused = globalIdx === focusedIndex;
                        const Icon = item.icon;
                        const isCurrentTab = activeTab === item.id;
                        return (
                          <div 
                            key={item.id}
                            className={`search-result-row ${isFocused ? 'focused' : ''} ${isCurrentTab ? 'current-active' : ''}`}
                            onClick={() => handleSelectEntity(item)}
                            onMouseEnter={() => setFocusedIndex(globalIdx)}
                            role="option"
                            aria-selected={isFocused}
                          >
                            <div className="search-row-icon-box module-box">
                              <Icon size={13} />
                            </div>
                            <div className="search-row-details">
                              <div className="search-row-title-row">
                                <span className="search-row-title">
                                  <HighlightMatch text={item.title} query={searchQuery} />
                                </span>
                                {isCurrentTab && <span className="search-current-pill">Current</span>}
                              </div>
                              <span className="search-row-subtitle">
                                <HighlightMatch text={item.subtitle} query={searchQuery} />
                              </span>
                            </div>
                            <span className="search-action-hint">Navigate</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Keyboard Footer Hint */}
              <div className="search-footer-hint">
                <span><kbd>↑</kbd><kbd>↓</kbd> Navigate</span>
                <span><kbd>↵</kbd> Select</span>
                <span><kbd>ESC</kbd> Close</span>
              </div>
            </div>
          )}
        </div>

        {/* Real Notification Bell Button */}
        <div className="header-notif-wrapper" ref={notifContainerRef}>
          <button 
            type="button"
            className={`header-icon-btn ${isNotifOpen ? 'active' : ''}`}
            onClick={toggleNotifPanel}
            title="System Notifications"
            aria-label="View system notifications"
            id="notification-bell-btn"
          >
            <Bell size={16} />
            {hasUnread && <span className="notification-dot" />}
          </button>

          {/* Notification Popover Panel */}
          {isNotifOpen && (
            <div className="header-popover-panel notif-popover">
              <div className="popover-header">
                <div className="popover-title-group">
                  <Bell size={14} className="popover-header-icon" />
                  <span className="popover-title">System Notifications</span>
                  <span className="popover-badge">{notifications.length}</span>
                </div>
                {notifications.length > 0 && (
                  <button 
                    type="button" 
                    className="popover-clear-btn"
                    onClick={onClearNotifications}
                  >
                    Clear all
                  </button>
                )}
              </div>

              <div className="notif-list">
                {notifications.length === 0 ? (
                  <div className="notif-empty">
                    <CheckCircle2 size={24} className="notif-empty-icon" />
                    <span className="notif-empty-title">All systems quiet</span>
                    <span className="notif-empty-sub">Real system events will appear here as you analyze assets and execute strategies.</span>
                  </div>
                ) : (
                  notifications.map((n) => {
                    let IconComponent = CheckCircle2;
                    let iconClass = 'notif-type-system';

                    if (n.type === 'asset') {
                      IconComponent = Layers;
                      iconClass = 'notif-type-asset';
                    } else if (n.type === 'analytics') {
                      IconComponent = TrendingUp;
                      iconClass = 'notif-type-analytics';
                    } else if (n.type === 'data') {
                      IconComponent = Activity;
                      iconClass = 'notif-type-data';
                    } else if (n.type === 'ai') {
                      IconComponent = Sparkles;
                      iconClass = 'notif-type-ai';
                    } else if (n.type === 'warning' || n.type === 'error') {
                      IconComponent = AlertTriangle;
                      iconClass = 'notif-type-warning';
                    } else if (n.type === 'strategy') {
                      IconComponent = Play;
                      iconClass = 'notif-type-strategy';
                    }

                    return (
                      <div key={n.id} className="notif-row">
                        <div className={`notif-icon-bubble ${iconClass}`}>
                          <IconComponent size={13} />
                        </div>
                        <div className="notif-content">
                          <div className="notif-title-row">
                            <span className="notif-title">{n.title}</span>
                            <span className="notif-time">{n.time}</span>
                          </div>
                          <p className="notif-desc">{n.description}</p>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              <div className="popover-footer">
                <span className="footer-status-tag">Real-Time Event Stream</span>
                <span className="footer-status-tag">Strictly Non-Synthetic</span>
              </div>
            </div>
          )}
        </div>

        {/* Researcher Profile Pill */}
        <div className="header-profile-wrapper" ref={profileContainerRef}>
          <div 
            className={`header-user-pill ${isProfileOpen ? 'active' : ''}`}
            onClick={() => setIsProfileOpen(prev => !prev)}
            role="button"
            tabIndex={0}
            title="Jai - Quant Researcher Context"
            id="researcher-profile-pill"
          >
            <div className="user-avatar">J</div>
            <div className="user-info">
              <span className="user-name">Jai</span>
              <span className="user-role">Quant Researcher</span>
            </div>
          </div>

          {/* Profile Informational Panel */}
          {isProfileOpen && (
            <div className="header-popover-panel profile-popover">
              <div className="popover-header">
                <div className="popover-title-group">
                  <div className="profile-badge-avatar">J</div>
                  <div>
                    <div className="popover-title">Jai</div>
                    <div className="profile-badge-role">Quant Researcher</div>
                  </div>
                </div>
                <button 
                  type="button" 
                  className="popover-close-btn"
                  onClick={() => setIsProfileOpen(false)}
                >
                  <X size={14} />
                </button>
              </div>

              <div className="profile-context-body">
                <div className="profile-banner-info">
                  <strong>QUANTEXA</strong>
                  <span>Quantitative Research Platform</span>
                </div>

                <div className="profile-data-grid">
                  <div className="profile-data-item">
                    <span className="data-key">Mode:</span>
                    <span className="data-val highlight">Historical Analysis</span>
                  </div>
                  <div className="profile-data-item">
                    <span className="data-key">Data:</span>
                    <span className="data-val">Multi-Asset Feed</span>
                  </div>
                  <div className="profile-data-item">
                    <span className="data-key">Active Asset:</span>
                    <span className="data-val">{selectedAsset?.name || 'Gold'} ({selectedAsset?.symbol || 'GC=F'})</span>
                  </div>
                  <div className="profile-data-item">
                    <span className="data-key">Status:</span>
                    <span className="data-val">
                      <span className={`status-dot ${isOnline ? '' : 'disconnected'}`} style={{ display: 'inline-block', marginRight: '4px' }} />
                      {isOnline ? `API Connected (${latency}ms)` : 'API Offline'}
                    </span>
                  </div>
                  <div className="profile-data-item">
                    <span className="data-key">AI Engine:</span>
                    <span className="data-val">Featherless AI (Llama-3.1-8B)</span>
                  </div>
                  <div className="profile-data-item">
                    <span className="data-key">Discipline:</span>
                    <span className="data-val">Non-Prescriptive Research</span>
                  </div>
                </div>
              </div>

              <div className="popover-footer profile-footer">
                <span>Session: Local Research Environment</span>
                <span>V1.0 Alpha</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
