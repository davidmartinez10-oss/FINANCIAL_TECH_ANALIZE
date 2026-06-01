import forecastData from "@/data/forecast_results.json";
import { ASSET_NAMES } from "@/lib/providers/yahoo";
import { PORTFOLIO_LABELS } from "@/lib/data/company-profiles";
import type {
  ForecastResults,
  AssetForecastResponse,
  AssetForecastEntry,
} from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const symbol = (searchParams.get("symbol") ?? "").toUpperCase();

  if (!symbol) {
    return Response.json({ error: "symbol requerido" }, { status: 400 });
  }

  if (!ASSET_NAMES[symbol]) {
    return Response.json(
      { error: `Símbolo ${symbol} no pertenece al universo de la plataforma` },
      { status: 404 }
    );
  }

  const results = forecastData as unknown as ForecastResults;
  const portfolios = results.portfolios ?? {};

  const forecastEntries: AssetForecastEntry[] = [];
  const foundPortfolios: string[] = [];

  for (const [key, pf] of Object.entries(portfolios)) {
    const weights = pf.composition?.weights ?? {};
    if (!(symbol in weights)) continue;

    foundPortfolios.push(key);
    forecastEntries.push({
      portfolio: key,
      portfolioLabel: PORTFOLIO_LABELS[key] ?? key,
      weight: weights[symbol],
      ensemble_forecast: pf.ensemble_forecast ?? [],
      model_forecasts: pf.model_forecasts ?? {},
      ensemble_weights: pf.ensemble?.weights ?? {},
      horizon: pf.ensemble?.horizon ?? 21,
      last_price: pf.ensemble?.last_price ?? 0,
      monte_carlo: pf.monte_carlo,
    });
  }

  const response: AssetForecastResponse = {
    symbol,
    name: ASSET_NAMES[symbol],
    found_in_portfolios: foundPortfolios,
    forecast_data: forecastEntries,
  };

  return Response.json(response, {
    headers: { "Cache-Control": "s-maxage=300, stale-while-revalidate=600" },
  });
}
