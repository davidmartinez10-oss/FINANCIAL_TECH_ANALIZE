// ─────────────────────────────────────────────────────────────────────────
// /api/indicators — panel de indicadores clave de la plataforma.
//
// Reúne en una sola respuesta lo que se mira primero cada día: mercados y
// riesgo, Colombia, energía y acero, y los activos centrales del portafolio.
// Alimenta la cinta superior y la tabla del Dashboard.
// ─────────────────────────────────────────────────────────────────────────
import { loadDailyQuotes, type QuoteDef } from "@/lib/quotes";
import { fetchFredSeries } from "@/lib/providers/fred";
import { fetchTrm } from "@/lib/providers/datosgov";
import marketJson from "@/data/steel_market.json";
import type { KeyIndicatorsResponse, CommodityQuote, SteelPrices } from "@/lib/types";

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
  { symbol: "^TNX", fmp: "^TNX", name: "Bono EE.UU. 10 años", group: G.markets, unit: "% anual" },
  { symbol: "DX-Y.NYB", name: "Índice dólar (DXY)", group: G.markets, unit: "índice" },
  { symbol: "GC=F", fmp: "GCUSD", name: "Oro", group: G.markets, unit: "USD/onza troy" },
  { symbol: "COP=X", fmp: "USDCOP", name: "Dólar · mercado (USD/COP)", group: G.colombia, unit: "COP por USD" },
  { symbol: "EC", fmp: "EC", name: "Ecopetrol (ADR)", group: G.colombia, unit: "USD por acción" },
  { symbol: "BZ=F", fmp: "BZUSD", name: "Petróleo Brent", group: G.energy, unit: "USD/barril" },
  { symbol: "CL=F", fmp: "CLUSD", name: "Petróleo WTI", group: G.energy, unit: "USD/barril" },
  { symbol: "NG=F", fmp: "NGUSD", name: "Gas natural Henry Hub", group: G.energy, unit: "USD/MMBtu" },
  { symbol: "HRC=F", name: "Acero HRC (EE.UU.)", group: G.energy, unit: "USD/tonelada corta" },
  { symbol: "TIO=F", name: "Mineral de hierro 62 % Fe", group: G.energy, unit: "USD/tonelada" },
  { symbol: "NVDA", fmp: "NVDA", name: "NVIDIA", group: G.portfolio, unit: "USD por acción" },
  { symbol: "MSFT", fmp: "MSFT", name: "Microsoft", group: G.portfolio, unit: "USD por acción" },
  { symbol: "SMH", fmp: "SMH", name: "Semiconductores (SMH)", group: G.portfolio, unit: "USD por acción" },
  { symbol: "URNM", fmp: "URNM", name: "Mineras de uranio (URNM)", group: G.portfolio, unit: "USD por acción" },
];

// TRM oficial (Superfinanciera, vía datos.gov.co): la tasa con la que se
// liquidan impuestos y contratos en Colombia. Va junto al dólar de mercado.
async function trmRow(): Promise<CommodityQuote> {
  const pts = await fetchTrm(260);
  const last = pts[pts.length - 1];
  const prev = pts[pts.length - 2];
  const monthAgo = [...pts].reverse().find((p) => p.t <= last.t - 30 * 86400);
  const values = pts.map((p) => p.v);
  return {
    symbol: "TRM",
    name: "TRM oficial",
    group: G.colombia,
    unit: "COP por USD",
    price: last.v,
    change: prev ? last.v - prev.v : 0,
    changePct: prev ? ((last.v - prev.v) / prev.v) * 100 : 0,
    change1mPct: monthAgo ? ((last.v - monthAgo.v) / monthAgo.v) * 100 : null,
    change3mPct: null,
    asOf: last.until + 12 * 3600, // mediodía UTC: la fecha no se corre al mostrarla en hora de Colombia
    stale: false,
    source: "Superfinanciera · datos.gov.co",
    series: pts.slice(-64).map((p) => ({ t: p.t, c: p.v })),
    hi52: Math.max(...values),
    lo52: Math.min(...values),
    frequency: "D",
    dateOnly: true,
  };
}

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
    unit: "USD/tonelada",
    price: last.v,
    change: prev ? last.v - prev.v : 0,
    changePct: pct,
    change1mPct: pct,
    change3mPct: null,
    asOf: Math.floor(Date.parse(`${last.d}-01T00:00:00Z`) / 1000),
    stale: false,
    source: "FMI vía FRED",
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

// Coque y carbón colombianos (FOB): cifras mensuales del boletín UPME-ANM,
// guardadas en data/steel_market.json. No hay API: se actualizan a mano.
function colombiaFobRows(): CommodityQuote[] {
  const { fob } = (marketJson as unknown as { prices: SteelPrices }).prices;
  const ts = (ym: string) => Math.floor(Date.parse(`${ym}-01T00:00:00Z`) / 1000);
  return fob.series.flatMap((s) => {
    const pts = s.values
      .map((v, i) => ({ t: ts(fob.months[i]), c: v }))
      .filter((p): p is { t: number; c: number } => p.c != null);
    if (pts.length === 0) return [];
    const last = pts[pts.length - 1];
    const prev = pts[pts.length - 2];
    const pct = prev ? ((last.c - prev.c) / prev.c) * 100 : 0;
    return [
      {
        symbol: `CO-FOB-${s.id}`,
        name: `${s.name} · FOB Colombia`,
        group: G.energy,
        unit: "USD/tonelada",
        price: last.c,
        change: prev ? last.c - prev.c : 0,
        changePct: pct,
        change1mPct: pct,
        change3mPct: null,
        asOf: last.t,
        stale: false,
        source: "UPME-ANM",
        series: pts,
        hi52: null,
        lo52: null,
        frequency: "M" as const,
      },
    ];
  });
}

export async function GET() {
  const [{ quotes, errors }, coal, trm] = await Promise.all([
    loadDailyQuotes(DEFS),
    coalRow().catch((e) => {
      return String((e as Error).message);
    }),
    trmRow().catch((e) => String((e as Error).message)),
  ]);

  const rows = [...quotes];
  if (typeof trm === "string") errors.push(`TRM oficial: ${trm}`);
  else {
    // Primera fila del grupo Colombia, antes del dólar de mercado.
    const k = rows.findIndex((r) => r.group === G.colombia);
    rows.splice(k === -1 ? rows.length : k, 0, trm);
  }
  if (typeof coal === "string") errors.push(`Carbón térmico: ${coal}`);
  else {
    // Va después del gas, antes del acero.
    const i = rows.findIndex((r) => r.symbol === "HRC=F");
    rows.splice(i === -1 ? rows.length : i, 0, coal);
  }

  // Coque y carbón colombianos: después del carbón de referencia internacional.
  const fobRows = colombiaFobRows();
  const j = rows.findIndex((r) => r.symbol === "HRC=F");
  rows.splice(j === -1 ? rows.length : j, 0, ...fobRows);

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
