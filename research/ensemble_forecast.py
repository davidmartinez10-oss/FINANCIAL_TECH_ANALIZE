"""
ensemble_forecast.py
─────────────────────────────────────────────────────────────────────────────
Motor de pronóstico ENSAMBLADO + Monte Carlo para las 3 composiciones de
portafolio (Mínima Volatilidad / Volatilidad Media / Máximo Riesgo).

Modelos del ensamble (por serie):
    1. Prophet + regresores exógenos
    2. ARIMAX / SARIMAX + exógenas
    3. XGBoost + exógenas (lag features, recursivo)
    4. Holt-Winters  (ExponentialSmoothing)  ── fallback garantizado

Validación:  10.000 simulaciones Monte Carlo sobre el horizonte → distribución
de precios terminales, bandas de confianza y PROBABILIDADES DE OCURRENCIA.

Dual-mode de datos: usa yfinance si la red lo permite; si no, genera una serie
sintética realista (GBM correlacionado) para que el pipeline corra end-to-end.
"""
from __future__ import annotations
import warnings, json
warnings.filterwarnings("ignore")
import numpy as np
import pandas as pd
from datetime import datetime
from dateutil.relativedelta import relativedelta

RNG = np.random.default_rng(42)

# ── Universo ────────────────────────────────────────────────────────────────
PORTFOLIO_TICKERS = ["NVDA", "MSFT", "GOOGL", "SOXX", "SMH", "TAN", "NLR", "URNM"]
BENCHMARKS        = ["SPY", "QQQ"]

# Parámetros sintéticos plausibles (drift anual, vol anual) — solo se usan en
# fallback sin red. Coherentes con el perfil real de cada activo.
SYNTH_PARAMS = {
    "NVDA":  (0.42, 0.50), "MSFT": (0.22, 0.27), "GOOGL": (0.20, 0.30),
    "SOXX":  (0.25, 0.34), "SMH":  (0.28, 0.36), "TAN":   (-0.05, 0.45),
    "NLR":   (0.18, 0.28), "URNM": (0.22, 0.48),
    "SPY":   (0.12, 0.17), "QQQ":  (0.18, 0.22),
}

# ═════════════════════════════════════════════════════════════════════════════
# 1. CAPA DE DATOS
# ═════════════════════════════════════════════════════════════════════════════
def fetch_prices(tickers, start, end):
    """Intenta yfinance; cae a sintético si no hay red. Devuelve (df_close, mode)."""
    try:
        import yfinance as yf
        raw = yf.download(tickers, start=start, end=end, interval="1d",
                          auto_adjust=True, progress=False)
        close = raw["Close"].dropna(how="all")
        if close.shape[0] > 50 and close.notna().sum().sum() > 0:
            return close.dropna(), "yfinance"
    except Exception:
        pass
    return _synthetic_prices(tickers, start, end), "synthetic"


def _synthetic_prices(tickers, start, end):
    """GBM correlacionado con estructura de correlación por bloques sectoriales."""
    days = pd.bdate_range(start=start, end=end)
    n = len(days)
    mu  = np.array([SYNTH_PARAMS.get(t, (0.10, 0.30))[0] for t in tickers]) / 252
    vol = np.array([SYNTH_PARAMS.get(t, (0.10, 0.30))[1] for t in tickers]) / np.sqrt(252)

    # Correlaciones: semis muy correlacionados entre sí y con tech.
    k = len(tickers)
    corr = np.full((k, k), 0.35)
    np.fill_diagonal(corr, 1.0)
    semis = {"NVDA", "SOXX", "SMH", "SMH"}
    for i, ti in enumerate(tickers):
        for j, tj in enumerate(tickers):
            if i == j:
                continue
            if {ti, tj} <= {"NVDA", "SOXX", "SMH"}:
                corr[i, j] = 0.85
            elif {ti, tj} <= {"NLR", "URNM"}:
                corr[i, j] = 0.80
            elif ti in {"SPY", "QQQ"} or tj in {"SPY", "QQQ"}:
                corr[i, j] = 0.70
    corr = (corr + corr.T) / 2
    # Proyección a la matriz PSD más cercana (clipping de eigenvalores)
    vals, vecs = np.linalg.eigh(corr)
    vals = np.clip(vals, 1e-4, None)
    corr = vecs @ np.diag(vals) @ vecs.T
    d = np.sqrt(np.diag(corr))
    corr = corr / np.outer(d, d)
    L = np.linalg.cholesky(corr + np.eye(k) * 1e-8)

    z = RNG.standard_normal((n, k)) @ L.T
    daily = mu + vol * z
    prices = 100 * np.exp(np.cumsum(daily, axis=0))
    # Escalar a niveles de precio realistas por activo
    base = {"NVDA": 120, "MSFT": 420, "GOOGL": 175, "SOXX": 230, "SMH": 250,
            "TAN": 38, "NLR": 90, "URNM": 45, "SPY": 540, "QQQ": 470}
    for i, t in enumerate(tickers):
        prices[:, i] *= base.get(t, 100) / prices[0, i]
    return pd.DataFrame(prices, index=days, columns=tickers)


# ═════════════════════════════════════════════════════════════════════════════
# 2. LAS TRES COMPOSICIONES DE PORTAFOLIO
# ═════════════════════════════════════════════════════════════════════════════
def build_three_portfolios(returns: pd.DataFrame, rf=0.0425):
    """Devuelve dict {nombre: {weights, exp_return, exp_vol, sharpe}} para
    Mínima Volatilidad / Volatilidad Media (max Sharpe) / Máximo Riesgo."""
    mu  = returns.mean() * 252
    cov = returns.cov() * 252
    assets = list(returns.columns)
    out = {}

    try:
        from pypfopt import EfficientFrontier, objective_functions
        # P1 — Mínima volatilidad
        ef = EfficientFrontier(mu, cov, weight_bounds=(0.0, 0.40))
        ef.add_objective(objective_functions.L2_reg, gamma=0.1)
        ef.min_volatility()
        w1 = ef.clean_weights(); p1 = ef.portfolio_performance(risk_free_rate=rf)
        # P2 — Volatilidad media (tangencia / max Sharpe)
        ef = EfficientFrontier(mu, cov, weight_bounds=(0.0, 0.40))
        ef.add_objective(objective_functions.L2_reg, gamma=0.1)
        ef.max_sharpe(risk_free_rate=rf)
        w2 = ef.clean_weights(); p2 = ef.portfolio_performance(risk_free_rate=rf)
        # P3 — Máximo riesgo (utilidad cuadrática con baja aversión)
        ef = EfficientFrontier(mu, cov, weight_bounds=(0.0, 0.60))
        ef.max_quadratic_utility(risk_aversion=0.05)
        w3 = ef.clean_weights(); p3 = ef.portfolio_performance(risk_free_rate=rf)
        comps = [("Min Volatilidad", w1, p1), ("Volatilidad Media", w2, p2),
                 ("Máximo Riesgo", w3, p3)]
        for name, w, perf in comps:
            out[name] = {"weights": {k: round(v, 4) for k, v in w.items() if v > 1e-4},
                         "exp_return": round(perf[0], 4), "exp_vol": round(perf[1], 4),
                         "sharpe": round(perf[2], 4)}
        return out
    except Exception as e:
        # Fallback heurístico por ranking de volatilidad individual
        ind_vol = returns.std() * np.sqrt(252)
        low  = ind_vol.nsmallest(4).index
        high = ind_vol.nlargest(4).index
        heur = {
            "Min Volatilidad":   {t: 0.25 for t in low},
            "Volatilidad Media": {t: 1/len(assets) for t in assets},
            "Máximo Riesgo":     {t: 0.25 for t in high},
        }
        for name, w in heur.items():
            r = pd.Series(w); pr = (mu[r.index] * r).sum()
            pv = np.sqrt(r.values @ cov.loc[r.index, r.index].values @ r.values)
            out[name] = {"weights": {k: round(v, 4) for k, v in w.items()},
                         "exp_return": round(pr, 4), "exp_vol": round(pv, 4),
                         "sharpe": round((pr - rf) / pv, 4)}
        return out


def portfolio_nav(weights: dict, prices: pd.DataFrame, base=100.0):
    """Serie de NAV (base 100) de un portafolio con rebalanceo buy&hold."""
    w = pd.Series(weights); w = w / w.sum()
    rets = prices[w.index].pct_change().fillna(0)
    port_ret = (rets * w).sum(axis=1)
    return base * (1 + port_ret).cumprod()


# ═════════════════════════════════════════════════════════════════════════════
# 3. FEATURES EXÓGENAS
# ═════════════════════════════════════════════════════════════════════════════
def build_exog(nav: pd.Series, market: pd.Series) -> pd.DataFrame:
    """Regresores exógenos: momentum, volatilidad rolling, RSI y factor mercado."""
    df = pd.DataFrame(index=nav.index)
    ret = nav.pct_change()
    df["mom_10"]  = nav.pct_change(10)
    df["vol_21"]  = ret.rolling(21).std()
    df["dist_ma50"] = nav / nav.rolling(50).mean() - 1
    # RSI-14
    delta = nav.diff()
    gain = delta.clip(lower=0).rolling(14).mean()
    loss = (-delta.clip(upper=0)).rolling(14).mean()
    rs = gain / loss.replace(0, np.nan)
    df["rsi_14"] = 100 - 100 / (1 + rs)
    df["mkt_ret_5"] = market.reindex(nav.index).pct_change(5)
    return df.bfill().fillna(0)


# ═════════════════════════════════════════════════════════════════════════════
# 4. MODELOS INDIVIDUALES  (cada uno devuelve forecast de log-precio, horizonte H)
# ═════════════════════════════════════════════════════════════════════════════
def _fit_prophet(y_train, exog_train, exog_future, H):
    from prophet import Prophet
    dfp = pd.DataFrame({"ds": y_train.index, "y": np.log(y_train.values)})
    m = Prophet(daily_seasonality=False, weekly_seasonality=True,
                yearly_seasonality=True, changepoint_prior_scale=0.05)
    regs = ["mom_10", "vol_21", "rsi_14"]
    for r in regs:
        m.add_regressor(r)
        dfp[r] = exog_train[r].values
    m.fit(dfp)
    future = m.make_future_dataframe(periods=H, freq="B")
    fexog = pd.concat([exog_train[regs], exog_future[regs]])
    fexog = fexog.reindex(future["ds"]).ffill().bfill()
    for r in regs:
        future[r] = fexog[r].values
    fc = m.predict(future)
    return np.exp(fc["yhat"].values[-H:])


def _fit_arimax(y_train, exog_train, exog_future, H):
    from statsmodels.tsa.statespace.sarimax import SARIMAX
    regs = ["mom_10", "vol_21", "mkt_ret_5"]
    ly = np.log(y_train.values)
    mod = SARIMAX(ly, exog=exog_train[regs].values, order=(2, 1, 2),
                  enforce_stationarity=False, enforce_invertibility=False)
    res = mod.fit(disp=False, maxiter=200)
    fc = res.forecast(steps=H, exog=exog_future[regs].values)
    return np.exp(fc)


def _fit_xgboost(y_train, exog_train, exog_future, H):
    from xgboost import XGBRegressor
    regs = ["mom_10", "vol_21", "dist_ma50", "rsi_14", "mkt_ret_5"]
    ly = np.log(y_train.values)
    lags = [1, 2, 3, 5, 10]
    feat = exog_train[regs].copy()
    for L in lags:
        feat[f"lag_{L}"] = pd.Series(ly, index=y_train.index).shift(L).values
    feat = feat.dropna()
    target = pd.Series(ly, index=y_train.index).loc[feat.index]
    model = XGBRegressor(n_estimators=300, max_depth=4, learning_rate=0.05,
                         subsample=0.8, colsample_bytree=0.8, random_state=42,
                         verbosity=0)
    model.fit(feat.values, target.values)
    # Forecast recursivo
    hist = list(ly)
    preds = []
    fx = exog_future[regs].reset_index(drop=True)
    for h in range(H):
        row = list(fx.iloc[min(h, len(fx) - 1)].values)
        row += [hist[-L] for L in lags]
        p = model.predict(np.array(row).reshape(1, -1))[0]
        preds.append(p); hist.append(p)
    return np.exp(np.array(preds))


def _fit_holtwinters(y_train, H):
    from statsmodels.tsa.holtwinters import ExponentialSmoothing
    ly = np.log(y_train.values)
    mod = ExponentialSmoothing(ly, trend="add", damped_trend=True,
                               seasonal=None)
    res = mod.fit()
    return np.exp(res.forecast(H))


# ═════════════════════════════════════════════════════════════════════════════
# 5. ENSAMBLE  (backtest → pesos inverso-error)
# ═════════════════════════════════════════════════════════════════════════════
def run_ensemble(nav: pd.Series, market: pd.Series, H=21, val=21):
    """Backtestea cada modelo sobre 'val' días, pondera por 1/RMSE, y produce
    el forecast ensamblado a H días hacia el futuro."""
    exog = build_exog(nav, market)
    y_tr, y_val = nav.iloc[:-val], nav.iloc[-val:]
    ex_tr, ex_val = exog.iloc[:-val], exog.iloc[-val:]

    model_fns = {
        "Prophet":      lambda: _fit_prophet(y_tr, ex_tr, ex_val, val),
        "ARIMAX":       lambda: _fit_arimax(y_tr, ex_tr, ex_val, val),
        "XGBoost":      lambda: _fit_xgboost(y_tr, ex_tr, ex_val, val),
        "Holt-Winters": lambda: _fit_holtwinters(y_tr, val),
    }
    bt_pred, bt_err = {}, {}
    actual = y_val.values
    for name, fn in model_fns.items():
        try:
            pred = np.asarray(fn(), dtype=float)[:val]
            if len(pred) == val and np.all(np.isfinite(pred)):
                rmse = float(np.sqrt(np.mean((pred - actual) ** 2)))
                mape = float(np.mean(np.abs((pred - actual) / actual)) * 100)
                bt_pred[name] = pred
                bt_err[name] = {"rmse": rmse, "mape": mape}
        except Exception as e:
            bt_err[name] = {"error": str(e)[:80]}

    # Holt-Winters como red de seguridad si todo lo demás cae
    if not bt_pred:
        pred = _fit_holtwinters(y_tr, val)
        bt_pred["Holt-Winters"] = pred
        bt_err["Holt-Winters"] = {"rmse": float(np.sqrt(np.mean((pred - actual) ** 2))),
                                  "mape": float(np.mean(np.abs((pred - actual) / actual)) * 100)}

    # Pesos inverso-RMSE
    inv = {k: 1.0 / (bt_err[k]["rmse"] + 1e-9) for k in bt_pred}
    s = sum(inv.values())
    weights = {k: inv[k] / s for k in inv}

    # Forecast futuro real (reentrenar con toda la serie)
    exog_future = _project_exog(exog, H)
    fut = {}
    full_fns = {
        "Prophet":      lambda: _fit_prophet(nav, exog, exog_future, H),
        "ARIMAX":       lambda: _fit_arimax(nav, exog, exog_future, H),
        "XGBoost":      lambda: _fit_xgboost(nav, exog, exog_future, H),
        "Holt-Winters": lambda: _fit_holtwinters(nav, H),
    }
    for name in weights:
        try:
            fut[name] = np.asarray(full_fns[name](), dtype=float)[:H]
        except Exception:
            weights.pop(name, None)
    s = sum(weights.values()) or 1.0
    weights = {k: v / s for k, v in weights.items()}
    ensemble = np.zeros(H)
    for name, w in weights.items():
        ensemble += w * fut[name]

    return {
        "ensemble_forecast": ensemble,
        "model_forecasts": {k: v.tolist() for k, v in fut.items()},
        "weights": {k: round(v, 4) for k, v in weights.items()},
        "backtest_error": bt_err,
        "horizon": H,
        "last_price": float(nav.iloc[-1]),
    }


def _project_exog(exog, H):
    """Proyecta regresores exógenos hacia el futuro (persistencia + media)."""
    last = exog.iloc[-1]
    fut = pd.DataFrame([last.values] * H, columns=exog.columns)
    # suaviza hacia la media histórica
    mean = exog.mean()
    for i in range(H):
        fut.iloc[i] = last * (1 - i / (2 * H)) + mean * (i / (2 * H))
    return fut


# ═════════════════════════════════════════════════════════════════════════════
# 6. MONTE CARLO  (10.000 simulaciones)  → probabilidades de ocurrencia
# ═════════════════════════════════════════════════════════════════════════════
def monte_carlo(nav: pd.Series, ensemble_fc: np.ndarray, H=21,
                n_sims=10_000, rf=0.0425):
    """Simula n_sims trayectorias usando el drift implícito del ensamble + ruido
    bootstrap de los retornos históricos (colas realistas). Devuelve la
    distribución terminal y las probabilidades de ocurrencia."""
    P0 = float(nav.iloc[-1])
    hist_ret = nav.pct_change().dropna().values
    sigma_d = hist_ret.std()

    # Drift diario implícito por el ensamble
    drift_path = np.diff(np.log(np.concatenate([[P0], ensemble_fc])))

    # Bootstrap de residuos centrados para el shock estocástico
    resid = hist_ret - hist_ret.mean()

    sims = np.empty((n_sims, H))
    for h in range(H):
        shocks = RNG.choice(resid, size=n_sims, replace=True)
        if h == 0:
            sims[:, h] = P0 * np.exp(drift_path[h] + shocks)
        else:
            sims[:, h] = sims[:, h - 1] * np.exp(drift_path[h] + shocks)

    terminal = sims[:, -1]
    term_ret = terminal / P0 - 1
    ens_term = float(ensemble_fc[-1])
    ens_ret  = ens_term / P0 - 1
    rf_h = rf * H / 252

    pct = lambda q: float(np.percentile(terminal, q))
    probs = {
        "P_positivo":          float(np.mean(term_ret > 0)),
        "P_ret_mayor_5pct":    float(np.mean(term_ret > 0.05)),
        "P_ret_menor_-5pct":   float(np.mean(term_ret < -0.05)),
        "P_supera_rf":         float(np.mean(term_ret > rf_h)),
        # Validación del pronóstico: ¿cae el punto del ensamble dentro de ±2%?
        "P_cerca_ensamble_2pct": float(np.mean(np.abs(terminal - ens_term) / ens_term < 0.02)),
        "percentil_del_ensamble": float((terminal < ens_term).mean() * 100),
    }
    bands = {f"P{q}": round(pct(q), 2) for q in [5, 25, 50, 75, 95]}
    var95 = float(np.percentile(term_ret, 5))
    cvar95 = float(term_ret[term_ret <= var95].mean())

    return {
        "n_sims": n_sims, "P0": round(P0, 2),
        "ensemble_terminal": round(ens_term, 2),
        "ensemble_return_pct": round(ens_ret * 100, 2),
        "mc_median_terminal": round(float(np.median(terminal)), 2),
        "mc_mean_return_pct": round(float(term_ret.mean() * 100), 2),
        "bands": bands,
        "probabilities": {k: round(v, 4) for k, v in probs.items()},
        "VaR_95_pct": round(var95 * 100, 2),
        "CVaR_95_pct": round(cvar95 * 100, 2),
        "sim_terminal_sample": terminal[:2000].tolist(),  # para histograma
    }


# ═════════════════════════════════════════════════════════════════════════════
# 7. ORQUESTADOR
# ═════════════════════════════════════════════════════════════════════════════
# H=126 días hábiles ≈ 6 meses: cubre de forma nativa todos los horizontes del
# selector de la web (día/semana/mes/3M/6M). La UI hace slicing del pronóstico
# real para horizontes ≤ H; si H fuera menor, extrapola y lo etiqueta como tal.
def run_full_pipeline(H=126, n_sims=10_000, years=3, out_json="forecast_results.json"):
    end = datetime.today().strftime("%Y-%m-%d")
    start = (datetime.today() - relativedelta(years=years + 1)).strftime("%Y-%m-%d")

    all_tickers = PORTFOLIO_TICKERS + BENCHMARKS
    prices, mode = fetch_prices(all_tickers, start, end)
    prices = prices.dropna()
    print(f"[datos] modo={mode}  filas={len(prices)}  activos={list(prices.columns)}")

    returns = prices[PORTFOLIO_TICKERS].pct_change().dropna()
    market = prices["SPY"] if "SPY" in prices else prices.mean(axis=1)

    portfolios = build_three_portfolios(returns)
    results = {"meta": {"data_mode": mode, "generated": end, "horizon_days": H,
                        "n_sims": n_sims, "rows": len(prices)},
               "portfolios": {}}

    for name, comp in portfolios.items():
        print(f"\n[portafolio] {name}  →  {comp['weights']}")
        nav = portfolio_nav(comp["weights"], prices)
        ens = run_ensemble(nav, market, H=H)
        mc  = monte_carlo(nav, ens["ensemble_forecast"], H=H, n_sims=n_sims)
        print(f"   pesos ensamble: {ens['weights']}")
        print(f"   ensamble→{mc['ensemble_return_pct']:+.2f}%  "
              f"P(+)={mc['probabilities']['P_positivo']:.1%}  "
              f"P(>+5%)={mc['probabilities']['P_ret_mayor_5pct']:.1%}  "
              f"VaR95={mc['VaR_95_pct']:.2f}%")
        results["portfolios"][name] = {
            "composition": comp,
            "ensemble": {k: v for k, v in ens.items()
                         if k not in ("model_forecasts", "ensemble_forecast")},
            "ensemble_forecast": ens["ensemble_forecast"].tolist(),
            "model_forecasts": ens["model_forecasts"],
            "monte_carlo": {k: v for k, v in mc.items() if k != "sim_terminal_sample"},
            "mc_sample": mc["sim_terminal_sample"],
        }

    def _native(o):
        if isinstance(o, np.integer):  return int(o)
        if isinstance(o, np.floating): return float(o)
        if isinstance(o, np.bool_):    return bool(o)
        if isinstance(o, np.ndarray):  return o.tolist()
        return str(o)

    with open(out_json, "w") as f:
        json.dump(results, f, indent=2, default=_native)
    print(f"\n[ok] resultados → {out_json}")
    return results


if __name__ == "__main__":
    run_full_pipeline()
