// ─────────────────────────────────────────────────────────────────────────
// /api/indicators — panel de indicadores clave de la plataforma.
//
// Reúne en una sola respuesta lo que se mira primero cada día: mercados y
// riesgo, Colombia, energía y acero, y los activos centrales del portafolio.
// Alimenta la cinta superior y la tabla del Dashboard.
// ─────────────────────────────────────────────────────────────────────────
import { loadDailyQuotes, type QuoteDef } from "@/lib/quotes";
import { fetchFredSeries } from "@/lib/providers/fred";
import type { KeyIndicatorsResponse, CommodityQuote } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const G = {
  markets: "Mercados",
  colombia: "Colombia",
  energy: "Energía y acero",
  portfolio: "Portafolio",
} as const;

const DEFS: QuoteDef[] = [
  { symbol: "^GSPC", fmp: "^GSPC", name: "S&P 500", group: G.markets, unit: "puntos" },
  { symbol: "^IXIC", fmp: "^IXIC", name: "Nasdaq Composite", group: G.markets, unit: "puntos" },
  { symbol: "^VIX", fmp: "^VIX", name: "VIX · volatilidad", group: G.markets, unit: "puntos" },
  { symbol: "^TNX", fmp: "^TNX", name: "Bono EE.UU. 10 años", group: G.markets, unit: "%" },
  { symbol: "DX-Y.NYB", name: "Índice dólar (DXY)", group: G.markets, unit: "puntos" },
  { symbol: "GC=F", fmp: "GCUSD", name: "Oro", group: G.markets, unit: "USD/oz" },
  { symbol: "COP=X", fmp: "USDCOP", name: "Dólar · USD/COP", group: G.colombia, unit: "COP" },
  { symbol: "EC", fmp: "EC", name: "Ecopetrol (ADR)", group: G.colombia, unit: "USD" },
  { symbol: "BZ=F", fmp: "BZUSD", name: "Petróleo Brent", group: G.energy, unit: "USD/barril" },
  { symbol: "CL=F", fmp: "CLUSD", name: "Petróleo WTI", group: G.energy, unit: "USD/barril" },
  { symbol: "NG=F", fmp: "NGUSD", name: "Gas natural Henry Hub", group: G.energy, unit: "USD/MMBtu" },
  { symbol: "HRC=F", name: "Acero HRC (EE.UU.)", group: G.energy, unit: "USD/ton corta" },
  { symbol: "TIO=F", name: "Mineral de hierro 62 % Fe", group: G.energy, unit: "USD/t" },
  { symbol: "NVDA", fmp: "NVDA", name: "NVIDIA", group: G.portfolio, unit: "USD" },
  { symbol: "MSFT", fmp: "MSFT", name: "Microsoft", group: G.portfolio, unit: "USD" },
  { symbol: "SMH", fmp: "SMH", name: "Semiconductores (SMH)", group: G.portfolio, unit: "USD" },
  { symbol: "URNM", fmp: "URNM", name: "Mineras de uranio (URNM)", group: G.portfolio, unit: "USD" },
];

// El carbón térmico no tiene futuro líquido público: entra como referencia mensual.
async function coalRow(): Promise<CommodityQuote> {
  const points = await fetchFredSeries("PCOALAUUSDM");
  const last = points[points.length - 1];
  const prev = points[points.length - 2];
  const yearAgo = points[points.length - 13];
  const pct = prev ? ((last.v - prev.v) / prev.v) * 100 : 0;
  const tail = points.slice(-12);
  const values = tail.map((p) => p.v);
  return {
    symbol: "PCOALAUUSDM",
    name: "Carbón térmico (Australia)",
    group: G.energy,
    unit: "USD/t",
    price: last.v,
    change: prev ? last.v - prev.v : 0,
    changePct: pct,
    change1mPct: pct,
    change3mPct: null,
    asOf: Math.floor(Date.parse(`${last.d}-01T00:00:00Z`) / 1000),
    stale: false,
    source: "FRED",
    series: tail.map((p) => ({
      t: Math.floor(Date.parse(`${p.d}-01T00:00:00Z`) / 1000),
      c: p.v,
    })),
    // Con datos mensuales el "rango de 52 semanas" es el de los últimos 12 meses.
    hi52: yearAgo ? Math.max(...values) : null,
    lo52: yearAgo ? Math.min(...values) : null,
    frequency: "M",
  };
}

export async function GET() {
  const [{ quotes, errors }, coal] = await Promise.all([
    loadDailyQuotes(DEFS),
    coalRow().catch((e) => {
      return String((e as Error).message);
    }),
  ]);

  const rows = [...quotes];
  if (typeof coal === "string") errors.push(`Carbón térmico: ${coal}`);
  else {
    // Va después del gas, antes del acero.
    const i = rows.findIndex((r) => r.symbol === "HRC=F");
    rows.splice(i === -1 ? rows.length : i, 0, coal);
  }

  const body: KeyIndicatorsResponse = {
    asOf: new Date().toISOString(),
    groups: Object.values(G),
    rows,
    errors,
  };
  return Response.json(body, {
    headers: { "Cache-Control": "s-maxage=60, stale-while-revalidate=300" },
  });
}
