import { NextResponse } from "next/server";
import forecastData from "@/data/forecast_results.json";
import type { ForecastResults } from "@/lib/types";

export const runtime = "nodejs";

/**
 * GET /api/forecast
 * Sirve los resultados del ensamble (Prophet + ARIMAX + XGBoost + Holt-Winters)
 * y la simulación Monte Carlo (10.000 trayectorias) generados en Colab por
 * research/ensemble_forecast.py. Para actualizar: regenerar el JSON con datos
 * reales de Yahoo y reemplazar data/forecast_results.json.
 */
export async function GET() {
  const data = forecastData as unknown as ForecastResults;
  return NextResponse.json(data, {
    headers: { "Cache-Control": "s-maxage=300, stale-while-revalidate=600" },
  });
}
