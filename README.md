# Macro Markets · Plataforma de Análisis de Inversión

Plataforma web de análisis macro/micro y de mercado **en tiempo real** para
decisiones de inversión, con **pronósticos ensamblados** validados por
**Monte Carlo**. Desplegable en **Vercel**.

---

## Arquitectura

```
┌──────────────────────────────────────────────────────────────────────┐
│  CAPA 1 · INVESTIGACIÓN / FORECASTING  (Colab — research/)             │
│  ─ ensemble_forecast.py                                               │
│     Prophet + regresores · ARIMAX + exógenas · XGBoost + exógenas ·   │
│     Holt-Winters (fallback). Pesos por backtest (inverso-RMSE).       │
│     Monte Carlo 10.000 sims → probabilidades de ocurrencia.           │
│  ─ financial_analysis_platform.ipynb  (notebook completo)            │
│         │                                                             │
│         ▼  exporta data/forecast_results.json                        │
├──────────────────────────────────────────────────────────────────────┤
│  CAPA 2 · WEB APP  (Next.js 14 App Router · Vercel)                   │
│  ─ /api/quote     → Yahoo Finance v8/chart (tiempo real, sin key)    │
│  ─ /api/forecast  → sirve los resultados del ensamble + Monte Carlo  │
│  ─ /              → dashboard: cotizaciones live + 3 portafolios      │
└──────────────────────────────────────────────────────────────────────┘
```

El cómputo pesado (Prophet/XGBoost/Monte Carlo) **no** corre en Vercel
serverless: se ejecuta en Colab, se valida, y se exporta como JSON que la web
app consume. Los datos de mercado **sí** son en vivo desde el servidor de Next.

---

## Las tres composiciones de portafolio

Construidas con `PyPortfolioOpt` sobre el universo (NVDA, MSFT, GOOGL, SOXX,
SMH, TAN, NLR, URNM):

| Composición          | Objetivo                          |
|----------------------|-----------------------------------|
| **Mínima Volatilidad** | `min_volatility` (frontera eficiente) |
| **Volatilidad Media**  | `max_sharpe` (cartera de tangencia)   |
| **Máximo Riesgo**      | `max_quadratic_utility` (baja aversión) |

Para cada una se pronostica el NAV con el ensamble y se valida con 10.000
simulaciones Monte Carlo (bootstrap de residuos sobre el drift del ensamble),
produciendo: bandas P5–P95, `P(retorno>0)`, `P(>+5%)`, `P(supera tasa libre de
riesgo)`, VaR/CVaR 95% y el percentil donde cae el pronóstico puntual.

---

## Desarrollo local

```bash
npm install
npm run dev          # http://localhost:3000
```

> Nota: `/api/quote` requiere salida a `query1.finance.yahoo.com`. Funciona en
> local y en Vercel; algunos sandboxes con allowlist la bloquean.

## Regenerar los pronósticos (Colab)

```bash
python research/ensemble_forecast.py     # genera forecast_results.json
cp forecast_results.json data/forecast_results.json
```

En Colab `fetch_prices()` usa Yahoo automáticamente. Sin red, cae a un
generador sintético (GBM correlacionado) para que el pipeline corra igual.

## Despliegue en Vercel

1. Conecta el repo de GitHub en Vercel (framework detectado: Next.js).
2. Sin variables de entorno obligatorias (Yahoo no requiere key).
3. Deploy. Las rutas API corren en el runtime de Node.

---

## Endpoints

| Método | Ruta                                   | Descripción |
|--------|----------------------------------------|-------------|
| GET    | `/api/quote?symbols=NVDA,MSFT&range=1d&interval=5m` | Cotizaciones en vivo (máx. 20 símbolos) |
| GET    | `/api/forecast`                        | Ensamble + Monte Carlo de las 3 carteras |

---

## Roadmap

- [ ] Módulo macro en la web (yield curve, CPI, Fed) vía FRED.
- [ ] Cache Redis / KV en Vercel para cotizaciones.
- [ ] WebSocket para streaming real-time (proveedor de pago).
- [ ] Persistir resultados de Colab vía Vercel KV en lugar de JSON estático.

---

*Solo con fines educativos. No constituye asesoría financiera.*
