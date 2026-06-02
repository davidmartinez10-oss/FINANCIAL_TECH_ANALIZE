// Tipos compartidos entre API routes y componentes de UI.

export interface SeriesPoint {
  t: number; // epoch seconds
  c: number; // close
}

export interface Quote {
  symbol: string;
  name: string;
  price: number;
  previousClose: number;
  change: number;
  changePct: number;
  currency: string;
  exchange: string;
  marketState: string;
  marketTime: number;
  dayHigh: number | null;
  dayLow: number | null;
  fiftyTwoWeekHigh: number | null;
  fiftyTwoWeekLow: number | null;
  series: SeriesPoint[];
}

export interface QuoteResponse {
  asOf: string;
  source: string;
  quotes: Quote[];
  errors?: { symbol: string; message: string }[];
}

// ── Forecast (exportado desde Colab por ensemble_forecast.py) ──────────────
export interface MonteCarlo {
  n_sims: number;
  P0: number;
  ensemble_terminal: number;
  ensemble_return_pct: number;
  mc_median_terminal: number;
  mc_mean_return_pct: number;
  bands: Record<string, number>;
  probabilities: Record<string, number>;
  VaR_95_pct: number;
  CVaR_95_pct: number;
}

export interface PortfolioForecast {
  composition: {
    weights: Record<string, number>;
    exp_return: number;
    exp_vol: number;
    sharpe: number;
  };
  ensemble: {
    weights: Record<string, number>;
    backtest_error: Record<string, Record<string, number>>;
    horizon: number;
    last_price: number;
  };
  ensemble_forecast: number[];
  model_forecasts: Record<string, number[]>;
  monte_carlo: MonteCarlo;
  mc_sample?: number[];
}

export interface ForecastResults {
  meta: {
    data_mode: string;
    generated: string;
    horizon_days: number;
    n_sims: number;
    rows: number;
  };
  portfolios: Record<string, PortfolioForecast>;
}

// ── Company Profile ────────────────────────────────────────────────────────
export interface CompanyProfile {
  symbol: string;
  name: string;
  sector: string | null;
  industry: string | null;
  country: string | null;
  website: string | null;
  employees: number | null;
  description: string | null;
  mission: string;
  vision: string;
  founded: string;
  hq: string;
}

export interface KeyStats {
  marketCap: number | null;
  enterpriseValue: number | null;
  peRatio: number | null;
  forwardPE: number | null;
  pbRatio: number | null;
  psRatio: number | null;
  evToEbitda: number | null;
  returnOnEquity: number | null;
  returnOnAssets: number | null;
  beta: number | null;
  dividendYield: number | null;
}

export interface IncomeStatement {
  revenue: number | null;
  grossProfit: number | null;
  ebit: number | null;
  ebitda: number | null;
  netIncome: number | null;
  grossMargin: number | null;
  operatingMargin: number | null;
  netMargin: number | null;
  revenueGrowth: number | null;
  earningsGrowth: number | null;
}

export interface BalanceSheet {
  totalAssets: number | null;
  totalDebt: number | null;
  cashAndEquivalents: number | null;
  netDebt: number | null;
  debtToEquity: number | null;
  currentRatio: number | null;
  quickRatio: number | null;
}

export interface CashFlowStatement {
  operatingCashFlow: number | null;
  capitalExpenditures: number | null;
  freeCashFlow: number | null;
}

export interface FinancialsResponse {
  symbol: string;
  name: string;
  profile: CompanyProfile;
  keyStats: KeyStats;
  income: IncomeStatement;
  balanceSheet: BalanceSheet;
  cashFlow: CashFlowStatement;
  asOf: string;
}

// ── Per-asset forecast ────────────────────────────────────────────────────
export interface AssetForecastEntry {
  portfolio: string;
  portfolioLabel: string;
  weight: number;
  ensemble_forecast: number[];
  model_forecasts: Record<string, number[]>;
  ensemble_weights: Record<string, number>;
  horizon: number;
  last_price: number;
  monte_carlo: MonteCarlo;
}

export interface AssetForecastResponse {
  symbol: string;
  name: string;
  found_in_portfolios: string[];
  forecast_data: AssetForecastEntry[];
}

// ── Live per-asset forecast (motor en vivo por acción) ─────────────────────
export interface LiveModelForecast {
  name: string;
  forecast: number[];
  weight: number;
  backtestMAPE: number;
}

export interface LiveAssetForecast {
  symbol: string;
  name: string;
  last_price: number;
  horizon: number;
  source: string; // "FMP" | "Yahoo"
  asOf: string;
  history: { t: number; c: number }[];
  models: LiveModelForecast[];
  ensemble_forecast: number[];
  monte_carlo: MonteCarlo;
  validity: {
    direction_confidence: number;
    band_calibration: number;
    backtest_hit_rate: number;
    backtest_mape: number;
  };
}

// ── Macro Indicators ─────────────────────────────────────────────────────
export interface MacroIndicator {
  symbol: string;
  name: string;
  price: number;
  changePct: number;
  category: string;
}

export interface MacroRegion {
  region: string;
  label: string;
  flag: string;
  indicators: MacroIndicator[];
}

export interface MacroResponse {
  regions: MacroRegion[];
  asOf: string;
  errors: string[];
}

// ── News ──────────────────────────────────────────────────────────────────
export interface NewsArticle {
  uuid: string;
  title: string;
  summary: string;
  publisher: string;
  link: string;
  publishedAt: number;
  thumbnail?: string;
  relatedSymbols: string[];
}

export interface NewsResponse {
  articles: NewsArticle[];
  query: string;
  asOf: string;
}

// ── AI Chat ───────────────────────────────────────────────────────────────
export type AgentRole = "analyst" | "economist" | "financier" | "fallback";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  agent?: AgentRole;
  timestamp: number;
}
