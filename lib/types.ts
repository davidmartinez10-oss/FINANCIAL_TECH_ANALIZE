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
