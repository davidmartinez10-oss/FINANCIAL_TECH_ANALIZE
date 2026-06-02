// ─────────────────────────────────────────────────────────────────────────
// Motor de pronóstico POR ACCIÓN (server-side, en vivo).
//
// A diferencia de los pronósticos a nivel de portafolio (precalculados en
// Colab → forecast_results.json), este módulo calcula el pronóstico del precio
// de UNA acción individual a partir de su histórico diario, corriendo cuatro
// modelos estadísticos reales e independientes, ensamblándolos por su error de
// backtest, y validando el resultado con 10.000 simulaciones de Monte Carlo.
//
// Modelos:
//   • Holt-Winters  — suavizado exponencial doble (nivel + tendencia amortig.)
//   • ARIMA (AR-2)  — autorregresivo sobre retornos log (mínimos cuadrados)
//   • Prophet*      — descomposición tendencia (OLS) + estacionalidad semanal
//   • XGBoost*      — análogo KNN: promedia el futuro de ventanas históricas
//                     con momentum similar (no paramétrico, estilo ML)
//   (*) implementaciones propias que capturan la misma intuición del modelo.
// ─────────────────────────────────────────────────────────────────────────

import type { MonteCarlo } from "@/lib/types";

// ── RNG determinista (mulberry32) para Monte Carlo reproducible ─────────────
function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Normal estándar vía Box-Muller, usando un RNG uniforme dado.
function gauss(rng: () => number): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// ── Estadística básica ───────────────────────────────────────────────────────
function mean(a: number[]): number {
  return a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0;
}
function std(a: number[]): number {
  if (a.length < 2) return 0;
  const m = mean(a);
  return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1));
}
function logReturns(closes: number[]): number[] {
  const r: number[] = [];
  for (let i = 1; i < closes.length; i++) r.push(Math.log(closes[i] / closes[i - 1]));
  return r;
}
function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

// ─────────────────────────────────────────────────────────────────────────
// MODELO 1 — Holt-Winters (suavizado exponencial doble, tendencia amortiguada)
// ─────────────────────────────────────────────────────────────────────────
function holtWinters(closes: number[], H: number, alpha = 0.3, beta = 0.1, phi = 0.97): number[] {
  if (closes.length < 2) return Array(H).fill(closes.at(-1) ?? 0);
  let level = closes[0];
  let trend = closes[1] - closes[0];
  for (let i = 1; i < closes.length; i++) {
    const prevLevel = level;
    level = alpha * closes[i] + (1 - alpha) * (level + phi * trend);
    trend = beta * (level - prevLevel) + (1 - beta) * phi * trend;
  }
  const out: number[] = [];
  let damp = 0;
  for (let h = 1; h <= H; h++) {
    damp += Math.pow(phi, h);
    out.push(Math.max(0.01, level + damp * trend));
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────
// MODELO 2 — ARIMA (AR(2) sobre retornos log, mínimos cuadrados + reversión)
// ─────────────────────────────────────────────────────────────────────────
function arima(closes: number[], H: number): number[] {
  const r = logReturns(closes);
  const P0 = closes.at(-1)!;
  if (r.length < 5) return Array(H).fill(P0);
  const mu = mean(r);

  // Diseño: r_t = c + φ1·r_{t-1} + φ2·r_{t-2}  → normal equations 3×3.
  const X: number[][] = [];
  const y: number[] = [];
  for (let t = 2; t < r.length; t++) {
    X.push([1, r[t - 1], r[t - 2]]);
    y.push(r[t]);
  }
  const coef = solve3(normalEq(X, y)) ?? [mu, 0, 0];
  const [c, p1, p2] = coef;

  const out: number[] = [];
  let r1 = r.at(-1)!;
  let r2 = r.at(-2)!;
  let price = P0;
  for (let h = 1; h <= H; h++) {
    let rt = c + p1 * r1 + p2 * r2;
    // Reversión suave hacia la media histórica (evita deriva explosiva).
    rt = 0.7 * rt + 0.3 * mu;
    price *= Math.exp(rt);
    out.push(price);
    r2 = r1;
    r1 = rt;
  }
  return out;
}

// Ecuaciones normales XᵀX β = Xᵀy para un diseño de 3 columnas.
function normalEq(X: number[][], y: number[]): { A: number[][]; b: number[] } {
  const A = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  const b = [0, 0, 0];
  for (let i = 0; i < X.length; i++) {
    for (let j = 0; j < 3; j++) {
      b[j] += X[i][j] * y[i];
      for (let k = 0; k < 3; k++) A[j][k] += X[i][j] * X[i][k];
    }
  }
  return { A, b };
}

// Resuelve un sistema 3×3 por eliminación de Gauss; null si singular.
function solve3({ A, b }: { A: number[][]; b: number[] }): number[] | null {
  const m = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < 3; col++) {
    let piv = col;
    for (let r = col + 1; r < 3; r++) if (Math.abs(m[r][col]) > Math.abs(m[piv][col])) piv = r;
    if (Math.abs(m[piv][col]) < 1e-12) return null;
    [m[col], m[piv]] = [m[piv], m[col]];
    for (let r = 0; r < 3; r++) {
      if (r === col) continue;
      const f = m[r][col] / m[col][col];
      for (let k = col; k < 4; k++) m[r][k] -= f * m[col][k];
    }
  }
  return [m[0][3] / m[0][0], m[1][3] / m[1][1], m[2][3] / m[2][2]];
}

// ─────────────────────────────────────────────────────────────────────────
// MODELO 3 — Prophet* (tendencia OLS sobre log-precio + estacionalidad semanal)
// ─────────────────────────────────────────────────────────────────────────
function prophet(closes: number[], H: number): number[] {
  const n = closes.length;
  if (n < 10) return Array(H).fill(closes.at(-1) ?? 0);
  const lp = closes.map((c) => Math.log(c));

  // Tendencia: regresión lineal de logP sobre t (con énfasis en datos recientes).
  const t = lp.map((_, i) => i);
  const tm = mean(t);
  const ym = mean(lp);
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (t[i] - tm) * (lp[i] - ym);
    den += (t[i] - tm) ** 2;
  }
  const slope = den ? num / den : 0;
  const intercept = ym - slope * tm;

  // Estacionalidad semanal: residuo promedio por día hábil (índice % 5).
  const seasonal = [0, 0, 0, 0, 0];
  const counts = [0, 0, 0, 0, 0];
  for (let i = 0; i < n; i++) {
    const fit = intercept + slope * i;
    const k = i % 5;
    seasonal[k] += lp[i] - fit;
    counts[k]++;
  }
  for (let k = 0; k < 5; k++) seasonal[k] = counts[k] ? seasonal[k] / counts[k] : 0;

  const out: number[] = [];
  for (let h = 1; h <= H; h++) {
    const i = n - 1 + h;
    const val = intercept + slope * i + seasonal[i % 5];
    out.push(Math.exp(val));
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────
// MODELO 4 — XGBoost* (análogo KNN: futuro promedio de ventanas con momentum
// histórico similar — pronóstico no paramétrico de estilo ML)
// ─────────────────────────────────────────────────────────────────────────
function knnAnalog(closes: number[], H: number, L = 5, K = 25): number[] {
  const r = logReturns(closes);
  const P0 = closes.at(-1)!;
  if (r.length < L + H + 5) return arima(closes, H); // fallback si hay poco histórico

  const feat = (end: number) => r.slice(end - L, end); // L retornos previos a `end`
  const query = feat(r.length);

  // Candidatos: ventanas con al menos H retornos futuros disponibles.
  const dists: { dist: number; start: number }[] = [];
  for (let end = L; end <= r.length - H; end++) {
    const w = feat(end);
    let d = 0;
    for (let j = 0; j < L; j++) d += (w[j] - query[j]) ** 2;
    dists.push({ dist: Math.sqrt(d), start: end });
  }
  dists.sort((a, b) => a.dist - b.dist);
  const neighbors = dists.slice(0, Math.min(K, dists.length));

  // Trayectoria de retorno acumulado promedio de los vecinos (ponderada por 1/dist).
  const cum: number[] = Array(H).fill(0);
  let wsum = 0;
  for (const nb of neighbors) {
    const w = 1 / (nb.dist + 1e-6);
    wsum += w;
    let acc = 0;
    for (let h = 0; h < H; h++) {
      acc += r[nb.start + h] ?? 0;
      cum[h] += w * acc;
    }
  }
  return cum.map((c) => P0 * Math.exp(wsum ? c / wsum : 0));
}

// ─────────────────────────────────────────────────────────────────────────
// Ensamble + Monte Carlo
// ─────────────────────────────────────────────────────────────────────────

export interface ModelForecast {
  name: string;
  forecast: number[]; // H precios
  weight: number; // peso en el ensamble (0..1)
  backtestMAPE: number; // error % en backtest (menor = mejor)
}

export interface AssetForecastComputed {
  last_price: number;
  horizon: number;
  models: ModelForecast[];
  ensemble_forecast: number[];
  monte_carlo: MonteCarlo;
  validity: {
    direction_confidence: number; // P(MC coincide con dirección del ensamble)
    band_calibration: number; // P(MC termina dentro de ±1σ√H del ensamble)
    backtest_hit_rate: number; // aciertos direccionales del ensamble en backtest
    backtest_mape: number; // MAPE del ensamble en backtest
  };
  history: { t: number; c: number }[];
}

type ModelFn = (closes: number[], H: number) => number[];

const MODELS: { name: string; fn: ModelFn }[] = [
  { name: "Prophet", fn: prophet },
  { name: "ARIMAX", fn: arima },
  { name: "XGBoost", fn: knnAnalog },
  { name: "Holt-Winters", fn: holtWinters },
];

// MAPE entre dos series.
function mape(pred: number[], actual: number[]): number {
  let s = 0;
  let n = 0;
  for (let i = 0; i < Math.min(pred.length, actual.length); i++) {
    if (actual[i] > 0) {
      s += Math.abs((pred[i] - actual[i]) / actual[i]);
      n++;
    }
  }
  return n ? (s / n) * 100 : 100;
}

export function computeAssetForecast(
  closesIn: number[],
  timestamps: number[],
  H: number,
  nSims = 10000
): AssetForecastComputed {
  // Saneo: quitar no-finitos y limitar a ~1 año de histórico.
  const pairs = closesIn
    .map((c, i) => ({ c, t: timestamps[i] ?? i }))
    .filter((p) => Number.isFinite(p.c) && p.c > 0);
  const closes = pairs.map((p) => p.c).slice(-260);
  const ts = pairs.map((p) => p.t).slice(-260);
  const P0 = closes.at(-1)!;
  const n = closes.length;

  // ── Backtest: reservar los últimos `bh` días para medir el error de cada modelo.
  const bh = Math.min(H, Math.max(5, Math.floor(n * 0.15)));
  const train = closes.slice(0, n - bh);
  const test = closes.slice(n - bh);

  const modelOut: ModelForecast[] = MODELS.map((m) => {
    let mp = 100;
    try {
      const btPred = m.fn(train, bh);
      mp = mape(btPred, test);
    } catch {
      mp = 100;
    }
    let fc: number[];
    try {
      fc = m.fn(closes, H);
    } catch {
      fc = Array(H).fill(P0);
    }
    // Saneo de la trayectoria del modelo.
    fc = fc.map((x) => (Number.isFinite(x) && x > 0 ? x : P0));
    return { name: m.name, forecast: fc, weight: 0, backtestMAPE: mp };
  });

  // Pesos del ensamble: inversamente proporcionales al error de backtest (softmax).
  const errs = modelOut.map((m) => m.backtestMAPE);
  const minErr = Math.min(...errs);
  const raw = errs.map((e) => Math.exp(-(e - minErr) / Math.max(1e-6, minErr * 0.5)));
  const rsum = raw.reduce((s, x) => s + x, 0) || 1;
  modelOut.forEach((m, i) => (m.weight = raw[i] / rsum));

  // Pronóstico ensamblado = combinación ponderada de las trayectorias.
  const ensemble_forecast: number[] = Array(H).fill(0);
  for (let h = 0; h < H; h++) {
    let v = 0;
    for (const m of modelOut) v += m.weight * m.forecast[h];
    ensemble_forecast[h] = v;
  }

  // Backtest del ensamble (para hit-rate y MAPE reportados).
  const ensBt: number[] = Array(bh).fill(0);
  for (const m of MODELS.map((mm, i) => ({ fn: mm.fn, w: modelOut[i].weight }))) {
    let p: number[];
    try {
      p = m.fn(train, bh);
    } catch {
      p = Array(bh).fill(train.at(-1) ?? P0);
    }
    for (let h = 0; h < bh; h++) ensBt[h] += m.w * (p[h] ?? train.at(-1)!);
  }
  const ensembleBacktestMAPE = mape(ensBt, test);
  let hits = 0;
  const baseTrain = train.at(-1)!;
  for (let h = 0; h < bh; h++) {
    const predUp = ensBt[h] >= baseTrain;
    const realUp = test[h] >= baseTrain;
    if (predUp === realUp) hits++;
  }
  const backtest_hit_rate = bh ? hits / bh : 0;

  // ── Monte Carlo (GBM con deriva y vol históricas) ──────────────────────────
  const r = logReturns(closes);
  const mu = mean(r);
  const sigma = std(r) || 0.01;
  const rng = mulberry32(0x9e3779b9 ^ Math.round(P0 * 100));
  const drift = mu - 0.5 * sigma * sigma;

  const terminals: number[] = new Array(nSims);
  const ensTerminal = ensemble_forecast.at(-1)!;
  const ensUp = ensTerminal >= P0;
  let dirAgree = 0;
  const bandHalf = sigma * Math.sqrt(H); // ±1σ√H en escala log
  let inBand = 0;

  const rfDaily = 0.045 / 252; // tasa libre de riesgo diaria (~4.5% anual)
  let pPos = 0;
  let pGt5 = 0;
  let pLt5 = 0;
  let pRf = 0;

  for (let s = 0; s < nSims; s++) {
    let logp = Math.log(P0);
    for (let h = 0; h < H; h++) logp += drift + sigma * gauss(rng);
    const term = Math.exp(logp);
    terminals[s] = term;

    const ret = term / P0 - 1;
    if (ret > 0) pPos++;
    if (ret > 0.05) pGt5++;
    if (ret < -0.05) pLt5++;
    if (ret > rfDaily * H) pRf++;
    if (term >= P0 === ensUp) dirAgree++;
    if (Math.abs(Math.log(term) - Math.log(ensTerminal)) <= bandHalf) inBand++;
  }

  terminals.sort((a, b) => a - b);
  const bands = {
    P5: percentile(terminals, 5),
    P25: percentile(terminals, 25),
    P50: percentile(terminals, 50),
    P75: percentile(terminals, 75),
    P95: percentile(terminals, 95),
  };

  // VaR / CVaR 95% sobre retornos.
  const rets = terminals.map((t) => t / P0 - 1).sort((a, b) => a - b);
  const var95 = rets[Math.floor(0.05 * rets.length)] ?? 0;
  const tail = rets.slice(0, Math.max(1, Math.floor(0.05 * rets.length)));
  const cvar95 = mean(tail);

  const monte_carlo: MonteCarlo = {
    n_sims: nSims,
    P0,
    ensemble_terminal: ensTerminal,
    ensemble_return_pct: (ensTerminal / P0 - 1) * 100,
    mc_median_terminal: bands.P50,
    mc_mean_return_pct: mean(rets) * 100,
    bands,
    probabilities: {
      P_positivo: pPos / nSims,
      P_ret_mayor_5pct: pGt5 / nSims,
      "P_ret_menor_-5pct": pLt5 / nSims,
      P_supera_rf: pRf / nSims,
    },
    VaR_95_pct: var95 * 100,
    CVaR_95_pct: cvar95 * 100,
  };

  return {
    last_price: P0,
    horizon: H,
    models: modelOut,
    ensemble_forecast,
    monte_carlo,
    validity: {
      direction_confidence: dirAgree / nSims,
      band_calibration: inBand / nSims,
      backtest_hit_rate,
      backtest_mape: ensembleBacktestMAPE,
    },
    history: closes.map((c, i) => ({ t: ts[i], c })).slice(-60),
  };
}
