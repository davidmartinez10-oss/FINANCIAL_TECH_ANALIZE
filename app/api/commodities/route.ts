// ─────────────────────────────────────────────────────────────────────────
// /api/commodities — precios de referencia de energía y siderurgia.
//
//  · Diarios  → Yahoo Finance (futuros y acciones); respaldo FMP cuando hay
//               símbolo equivalente y FMP_API_KEY está configurada.
//  · Mensuales → FRED (series FMI/BLS): carbón térmico, mineral de hierro,
//               Brent, gas natural europeo e índice de precios del acero.
//
// Cada fuente falla de forma independiente: lo que no responde se informa en
// `errors` y el resto se entrega igual.
// ─────────────────────────────────────────────────────────────────────────
import { loadDailyQuotes, type QuoteDef } from "@/lib/quotes";
import { fetchFredSeries } from "@/lib/providers/fred";
import type { CommoditiesResponse, BenchmarkSeries } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DAILY: QuoteDef[] = [
  { symbol: "CL=F", fmp: "CLUSD", name: "Petróleo WTI", group: "Energía y acero", unit: "USD/barril" },
  { symbol: "BZ=F", fmp: "BZUSD", name: "Petróleo Brent", group: "Energía y acero", unit: "USD/barril" },
  { symbol: "NG=F", fmp: "NGUSD", name: "Gas natural Henry Hub", group: "Energía y acero", unit: "USD/MMBtu" },
  { symbol: "HRC=F", name: "Acero HRC (EE.UU.)", group: "Energía y acero", unit: "USD/tonelada corta" },
  { symbol: "TIO=F", name: "Mineral de hierro 62 % Fe", group: "Energía y acero", unit: "USD/tonelada" },
  { symbol: "SLX", fmp: "SLX", name: "VanEck Steel ETF (sector acero)", group: "Empresas del sector", unit: "USD por acción" },
  { symbol: "MT", fmp: "MT", name: "ArcelorMittal", group: "Empresas del sector", unit: "USD por acción" },
  { symbol: "TX", fmp: "TX", name: "Ternium (LatAm)", group: "Empresas del sector", unit: "USD por acción" },
  { symbol: "GGB", fmp: "GGB", name: "Gerdau (Brasil · Diaco)", group: "Empresas del sector", unit: "USD por acción" },
  { symbol: "VALE", fmp: "VALE", name: "Vale (mineral de hierro)", group: "Empresas del sector", unit: "USD por acción" },
  { symbol: "HCC", fmp: "HCC", name: "Warrior Met Coal (carbón metalúrgico)", group: "Empresas del sector", unit: "USD por acción" },
  { symbol: "BTU", fmp: "BTU", name: "Peabody (carbón térmico)", group: "Empresas del sector", unit: "USD por acción" },
];

const MONTHLY: { id: string; name: string; unit: string; origin: string }[] = [
  { id: "PCOALAUUSDM", name: "Carbón térmico (Australia)", unit: "USD/tonelada", origin: "FMI" },
  { id: "PIORECRUSDM", name: "Mineral de hierro (CFR China)", unit: "USD/tonelada", origin: "FMI" },
  { id: "POILBREUSDM", name: "Petróleo Brent", unit: "USD/barril", origin: "FMI" },
  { id: "PNGASEUUSDM", name: "Gas natural (Europa)", unit: "USD/MMBtu", origin: "FMI" },
  { id: "WPU101", name: "Hierro y acero · IPP EE.UU.", unit: "índice 1982=100", origin: "BLS" },
];

const pct = (now: number, base: number | undefined) =>
  base && base > 0 ? ((now - base) / base) * 100 : null;

export async function GET() {
  // ── Diarios ────────────────────────────────────────────────────────────
  const { quotes, errors } = await loadDailyQuotes(DAILY);

  // ── Mensuales (FRED) ───────────────────────────────────────────────────
  const fred = await Promise.allSettled(MONTHLY.map((m) => fetchFredSeries(m.id)));
  const benchmarks: BenchmarkSeries[] = [];
  fred.forEach((r, i) => {
    const m = MONTHLY[i];
    if (r.status !== "fulfilled") {
      errors.push(`${m.name} (${m.id}): ${String((r.reason as Error)?.message ?? r.reason)}`);
      return;
    }
    const points = r.value;
    const last = points[points.length - 1];
    benchmarks.push({
      id: m.id,
      name: m.name,
      unit: m.unit,
      origin: m.origin,
      last: last.v,
      lastDate: last.d,
      change1mPct: pct(last.v, points[points.length - 2]?.v),
      changeYoYPct: pct(last.v, points[points.length - 13]?.v),
      points,
    });
  });

  const body: CommoditiesResponse = {
    asOf: new Date().toISOString(),
    quotes,
    benchmarks,
    errors,
  };
  return Response.json(body, {
    headers: { "Cache-Control": "s-maxage=300, stale-while-revalidate=900" },
  });
}
