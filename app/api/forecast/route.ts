import { NextResponse } from "next/server";
import forecastData from "@/data/forecast_results.json";
import { yahooDailyCloses } from "@/lib/providers/yahoo";
import { computeAssetForecast } from "@/lib/forecast-engine";
import type { ForecastResults, PortfolioForecast } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const H = 21; // días hábiles (≈ 1 mes)
const N_SIMS = 10_000;
const RF = 0.045; // tasa libre de riesgo anual usada en el Sharpe
const STATIC = forecastData as unknown as ForecastResults;

const dayKey = (t: number) => new Date(t * 1000).toISOString().slice(0, 10);

/**
 * GET /api/forecast
 * Pronóstico ensamblado de los tres portafolios, calculado en cada consulta
 * con los cierres diarios del último año (Yahoo).
 *
 * Los pesos de cada portafolio salen de data/forecast_results.json (la
 * optimización hecha en Colab). Con ellos se arma un índice de valor del
 * portafolio (base 100 en la primera fecha, comprar y mantener) y sobre ese
 * índice corren los cuatro modelos, el ensamble y el Monte Carlo del motor
 * que ya usa /api/asset-forecast.
 *
 * Si Yahoo no entrega algún activo se sirve el JSON estático y se marca en
 * `meta.data_mode` para que la página avise de qué fecha son las cifras.
 */
export async function GET() {
  const symbols = [
    ...new Set(Object.values(STATIC.portfolios).flatMap((p) => Object.keys(p.composition.weights))),
  ];

  const settled = await Promise.allSettled(symbols.map((s) => yahooDailyCloses(s, "1y", "1d")));
  const closes = new Map<string, Map<string, number>>();
  const failed: string[] = [];
  settled.forEach((r, i) => {
    if (r.status === "fulfilled" && r.value.length >= 60) {
      closes.set(symbols[i], new Map(r.value.map((p) => [dayKey(p.t), p.c])));
    } else {
      failed.push(symbols[i]);
    }
  });

  if (failed.length > 0) {
    const body: ForecastResults = {
      ...STATIC,
      meta: { ...STATIC.meta, data_mode: "static", errors: [`Sin histórico: ${failed.join(", ")}`] },
    };
    return NextResponse.json(body, { headers: { "Cache-Control": "s-maxage=60" } });
  }

  const portfolios: Record<string, PortfolioForecast> = {};
  let rows = 0;
  let lastDay = "";

  for (const [name, base] of Object.entries(STATIC.portfolios)) {
    const weights = base.composition.weights;
    const syms = Object.keys(weights);
    // Fechas en las que cotizaron todos los activos del portafolio.
    const days = [...closes.get(syms[0])!.keys()]
      .filter((d) => syms.every((s) => closes.get(s)!.has(d)))
      .sort();
    const first = days[0];
    const index = days.map(
      (d) =>
        100 *
        syms.reduce((acc, s) => acc + weights[s] * (closes.get(s)!.get(d)! / closes.get(s)!.get(first)!), 0)
    );
    const ts = days.map((d) => Math.floor(Date.parse(`${d}T00:00:00Z`) / 1000));
    const fc = computeAssetForecast(index, ts, H, N_SIMS);

    // Retorno y volatilidad anualizados del índice en el último año.
    const rets = index.slice(1).map((v, i) => Math.log(v / index[i]));
    const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
    const sd = Math.sqrt(rets.reduce((a, b) => a + (b - mean) ** 2, 0) / (rets.length - 1));
    const expReturn = mean * 252;
    const expVol = sd * Math.sqrt(252);

    portfolios[name] = {
      composition: {
        weights,
        exp_return: expReturn,
        exp_vol: expVol,
        sharpe: expVol > 0 ? (expReturn - RF) / expVol : 0,
      },
      ensemble: {
        weights: Object.fromEntries(fc.models.map((m) => [m.name, m.weight])),
        backtest_error: Object.fromEntries(fc.models.map((m) => [m.name, { mape: m.backtestMAPE }])),
        horizon: H,
        last_price: fc.last_price,
      },
      ensemble_forecast: fc.ensemble_forecast,
      model_forecasts: Object.fromEntries(fc.models.map((m) => [m.name, m.forecast])),
      monte_carlo: fc.monte_carlo,
    };
    rows = Math.max(rows, days.length);
    if (days[days.length - 1] > lastDay) lastDay = days[days.length - 1];
  }

  const body: ForecastResults = {
    meta: {
      data_mode: "live",
      generated: new Date().toISOString(),
      horizon_days: H,
      n_sims: N_SIMS,
      rows,
      source: "Yahoo Finance",
      last_close: lastDay,
    },
    portfolios,
  };
  return NextResponse.json(body, {
    headers: { "Cache-Control": "s-maxage=900, stale-while-revalidate=900" },
  });
}
