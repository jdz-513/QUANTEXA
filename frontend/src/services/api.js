import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000';

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
  },
});

export const checkHealth = async () => {
  const startTime = performance.now();
  const response = await apiClient.get('/api/health');
  const latency = Math.round(performance.now() - startTime);
  return {
    ...response.data,
    latencyMs: latency,
  };
};

export const getAssets = async () => {
  const response = await apiClient.get('/api/assets');
  return response.data;
};

export const fetchMarketData = async (asset, startDate, endDate) => {
  const response = await apiClient.get('/api/market-data', {
    params: {
      asset,
      start_date: startDate,
      end_date: endDate,
    },
  });
  return response.data;
};

export const fetchAnalytics = async (
  asset,
  startDate,
  endDate,
  smaPeriod = 20,
  smaPeriodSlow = 50,
  emaPeriod = 20,
  riskFreeRate = 0.0
) => {
  const response = await apiClient.get('/api/analytics', {
    params: {
      asset,
      start_date: startDate,
      end_date: endDate,
      sma_period: smaPeriod,
      sma_period_slow: smaPeriodSlow,
      ema_period: emaPeriod,
      risk_free_rate: riskFreeRate,
    },
  });
  return response.data;
};

/**
 * Consolidates the Overview Data Contract without creating duplicate backend endpoints.
 * Concurrently retrieves normalized OHLCV market data and quantitative analytics.
 */
export const fetchOverviewData = async (
  asset,
  startDate,
  endDate,
  smaPeriod = 20,
  smaPeriodSlow = 50,
  emaPeriod = 20
) => {
  const [marketData, analyticsData] = await Promise.all([
    fetchMarketData(asset, startDate, endDate),
    fetchAnalytics(asset, startDate, endDate, smaPeriod, smaPeriodSlow, emaPeriod, 0.0),
  ]);

  const summary = analyticsData?.summary || {};
  const rawBars = marketData?.data || [];
  const latestClose = summary.latest_price ?? (rawBars.length ? rawBars[rawBars.length - 1].close : 0);
  const periodLow = summary.period_low ?? (rawBars.length ? Math.min(...rawBars.map(b => b.close)) : 0);
  const periodHigh = summary.period_high ?? (rawBars.length ? Math.max(...rawBars.map(b => b.close)) : 0);

  return {
    marketData,
    analyticsData,
    asset: {
      symbol: marketData?.asset?.symbol || '',
      name: marketData?.asset?.name || '',
      category: marketData?.asset?.category || '',
      id: marketData?.asset?.id || asset,
    },
    period: {
      start_date: startDate,
      end_date: endDate,
      sessions: marketData?.count || summary.trading_sessions || rawBars.length,
    },
    price: {
      latest_close: latestClose,
      period_low: periodLow,
      period_high: periodHigh,
    },
    metrics: {
      cumulative_return: summary.total_return_pct ?? 0,
      annualized_volatility: summary.annualized_volatility_pct ?? 0,
      sharpe_ratio: summary.sharpe_ratio ?? 0,
      maximum_drawdown: summary.max_drawdown_pct ?? 0,
      cagr: summary.cagr_pct ?? 0,
    },
    sparklines: summary.sparklines || null,
  };
};

export const fetchCorrelationMatrix = async (startDate, endDate) => {
  const response = await apiClient.get('/api/correlation-matrix', {
    params: {
      start_date: startDate,
      end_date: endDate,
    },
  });
  return response.data;
};

export const fetchCorrelation = async (assetA, assetB, startDate, endDate, rollingWindow = 30) => {
  const response = await apiClient.get('/api/correlation', {
    params: {
      asset_a: assetA,
      asset_b: assetB,
      start_date: startDate,
      end_date: endDate,
      rolling_window: rollingWindow,
    },
  });
  return response.data;
};

export const runBacktest = async (payload) => {
  const response = await apiClient.post('/api/backtest', payload);
  return response.data;
};

export const runRobustnessBacktest = async (payload) => {
  const response = await apiClient.post('/api/backtest/robustness', payload);
  return response.data;
};

export const fetchMarketRegimes = async (
  asset,
  startDate,
  endDate,
  returnWindow = 20,
  volatilityWindow = 20,
  positiveThreshold = 2.0,
  negativeThreshold = -2.0,
  volatilityThreshold = 25.0,
  strategy = null
) => {
  const params = {
    asset,
    start_date: startDate,
    end_date: endDate,
    return_window: returnWindow,
    volatility_window: volatilityWindow,
    positive_return_threshold: positiveThreshold,
    negative_return_threshold: negativeThreshold,
    volatility_threshold: volatilityThreshold,
  };
  if (strategy) {
    params.strategy = strategy;
  }
  const response = await apiClient.get('/api/market-regimes', { params });
  return response.data;
};

export const fetchAIStatus = async () => {
  const response = await apiClient.get('/api/ai/status');
  return response.data;
};

export const askAIResearch = async (question, context = null) => {
  const response = await apiClient.post('/api/ai/research', {
    question,
    context,
  });
  return response.data;
};

export default apiClient;


