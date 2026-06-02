import { ASSET_NAMES, yahooDailyCloses } from "@/lib/providers/yahoo";
import { fmpEnabled, fmpDailyCloses } from "@/lib/providers/fmp";
import { computeAssetForecast } from "@/lib/forecast-engine";
import type { LiveAssetForecast } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HMAX = 126;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const symbol = (searchParams.get("symbol") ?? "").toUpperCase();
  const horizon = Math.min(HMAX, Math.max(1, Number(searchParams.get("horizon") ?? 21)));

  if (!symbol) {
    return Response.json({ error: "symbol requerido" }, { status: 400 });
  }
  if (!ASSET_NAMES[symbol]) {
    return Response.json(
      { error: `Símbolo ${symbol} no pertenece al universo de la plataforma` },
      { status: 404 }
    );
  }

  // 1) Histórico diario: FMP (si hay key) → fallback Yahoo.
  let history: { t: number; c: number }[] = [];
  let source = "";
  const errors: string[] = [];

  if (fmpEnabled()) {
    try {
      history = await fmpDailyCloses(symbol, 260);
      source = "FMP";
    } catch (e) {
      errors.push(`FMP: ${(e as Error).message}`);
    }
  }
  if (history.length < 40) {
    try {
      history = await yahooDailyCloses(symbol, "1y", "1d");
      source = "Yahoo";
    } catch (e) {
      errors.push(`Yahoo: ${(e as Error).message}`);
    }
  }

  if (history.length < 40) {
    return Response.json(
      {
        error:
          "No se pudo obtener suficiente histórico para calcular el pronóstico. " +
          (fmpEnabled()
            ? "Verifica que FMP_API_KEY sea válida."
            : "Configura FMP_API_KEY en Vercel (Yahoo bloquea IPs de servidor)."),
        detail: errors.join(" · "),
      },
      { status: 502 }
    );
  }

  // 2) Motor de pronóstico (4 modelos + ensamble + Monte Carlo 10k).
  const closes = history.map((p) => p.c);
  const ts = history.map((p) => p.t);
  const computed = computeAssetForecast(closes, ts, horizon, 10000);

  const response: LiveAssetForecast = {
    symbol,
    name: ASSET_NAMES[symbol],
    last_price: computed.last_price,
    horizon: computed.horizon,
    source,
    asOf: new Date().toISOString(),
    history: computed.history,
    models: computed.models,
    ensemble_forecast: computed.ensemble_forecast,
    monte_carlo: computed.monte_carlo,
    validity: computed.validity,
  };

  return Response.json(response, {
    headers: { "Cache-Control": "s-maxage=300, stale-while-revalidate=600" },
  });
}
