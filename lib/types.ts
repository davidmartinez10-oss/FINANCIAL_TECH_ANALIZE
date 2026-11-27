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
    source?: string;
    last_close?: string; // YYYY-MM-DD del último cierre usado
    errors?: string[];
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
  unit: string; // p. ej. "puntos", "USD", "COP por USD"
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
  source?: string;
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

// ── Commodities: energía y siderurgia ────────────────────────────────────
export interface CommodityQuote {
  symbol: string;
  name: string;
  group: string; // "Energía y acero" | "Empresas del sector"
  unit: string;
  price: number;
  change: number; // variación absoluta del día
  changePct: number; // variación diaria (o mensual si frequency = "M")
  change1mPct: number | null;
  change3mPct: number | null;
  asOf: number; // epoch seconds del último dato
  stale: boolean; // true si el último precio no es de la sesión actual
  source: string; // "Yahoo" | "FMP" | "FRED"
  series: SeriesPoint[]; // cierres diarios (~3 meses)
  hi52: number | null; // rango de 52 semanas
  lo52: number | null;
  frequency: "D" | "M";
  dateOnly?: boolean; // el dato rige por día (TRM): mostrar fecha, no hora // diaria, o referencia mensual
}

export interface KeyIndicatorsResponse {
  asOf: string;
  groups: string[];
  rows: CommodityQuote[];
  errors: string[];
}

export interface BenchmarkPoint {
  d: string; // YYYY-MM
  v: number;
}

export interface BenchmarkSeries {
  id: string; // id de la serie en FRED
  name: string;
  unit: string;
  origin: string; // fuente primaria (FMI, BLS)
  last: number;
  lastDate: string; // YYYY-MM
  change1mPct: number | null;
  changeYoYPct: number | null;
  points: BenchmarkPoint[];
}

export interface CommoditiesResponse {
  asOf: string;
  quotes: CommodityQuote[];
  benchmarks: BenchmarkSeries[];
  errors: string[];
}

// ── PIB: Colombia frente a las potencias (Banco Mundial) ─────────────────
export interface GdpCountry {
  iso3: string;
  name: string;
  flag: string;
  role: "base" | "potencia" | "par";
  year: number; // año del último dato disponible
  gdpUsd: number | null; // PIB a precios corrientes (USD)
  growthPct: number | null; // crecimiento real anual
  perCapitaUsd: number | null;
  colombiaSharePct: number | null; // PIB de Colombia como % del PIB de este país
  multiple: number | null; // cuántas veces el PIB de Colombia
}

export interface GdpResponse {
  asOf: string;
  source: string;
  latestYear: number | null;
  countries: GdpCountry[];
  // Una fila por año; claves = iso3.
  growthSeries: Record<string, number | null>[]; // crecimiento real %
  ratioSeries: Record<string, number | null>[]; // PIB COL / PIB país, %
  errors: string[];
}

// ── Siderurgia: comercio exterior (UN Comtrade) + mercado (curado) ───────
export interface TradeRow {
  code: string; // partida / subpartida SA
  label: string;
  group: string;
  importsUsd: Record<string, number | null>; // año → USD CIF
  exportsUsd: Record<string, number | null>; // año → USD FOB
  importsKg: number | null; // último año
  exportsKg: number | null; // último año
  importsUsdPerTon: number | null; // valor unitario del último año (si hay peso)
  exportsUsdPerTon: number | null;
}

export interface TradeOrigin {
  code: number;
  name: string;
  valueUsd: number;
  sharePct: number;
}

export interface SteelTrade {
  source: string;
  live: boolean; // false → instantánea guardada en el repositorio
  years: number[];
  latestYear: number | null;
  rows: TradeRow[];
  steelOrigins: TradeOrigin[]; // orígenes de las importaciones del capítulo 72
  errors: string[];
}

export interface SteelFigure {
  label: string;
  value: string;
  period: string;
  sourceId: string;
}

export interface SteelInput {
  id: string;
  name: string;
  group: string;
  hs: string[];
  dependence: "alta" | "media" | "baja" | "nula";
  dependenceNote: string;
  national: string;
  figures: SteelFigure[];
  routes: string; // rutas siderúrgicas a las que afecta
  priceRef: string; // precio de referencia a vigilar
}

export interface SteelSource {
  id: string;
  title: string;
  publisher: string;
  date: string;
  url: string;
}

export interface SteelFobSeries {
  id: string;
  name: string;
  values: (number | null)[]; // una por mes de `months`
  roundedUntil?: string; // YYYY-MM: hasta ese mes la fuente solo publica enteros
}

export interface SteelBasePrice {
  group: string;
  product: string;
  cop: number; // COP por tonelada
  prevCop: number | null; // período anterior
  period: string;
  sourceId: string;
}

export interface SteelPrices {
  fob: {
    unit: string;
    sourceId: string;
    note: string;
    months: string[]; // YYYY-MM
    series: SteelFobSeries[];
  };
  trm: number; // COP por USD usada por la UPME
  base: SteelBasePrice[];
  baseNote: string;
}

export interface SteelMarket {
  asOf: string;
  prices: SteelPrices;
  kpis: SteelFigure[];
  globalFacts: SteelFigure[];
  nationalFacts: SteelFigure[];
  inputs: SteelInput[];
  analysis: {
    global: string[];
    national: string[];
    opportunities: string[];
    risks: string[];
    watchlist: { indicator: string; why: string; where: string }[];
    exposure: {
      input: string;
      integrated: string;
      eaf: string;
    }[];
  };
  sources: SteelSource[];
}

export interface SteelResponse {
  asOf: string;
  trade: SteelTrade;
  market: SteelMarket;
}
