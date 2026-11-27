// Carga de cotizaciones diarias para los paneles de indicadores.
// Yahoo primero (trae serie, variaciones y rango de 52 semanas); FMP como
// respaldo cuando existe símbolo equivalente y FMP_API_KEY está configurada.
import { fetchDailyQuote } from "@/lib/providers/yahoo";
import { fmpEnabled, fmpBatchQuote } from "@/lib/providers/fmp";
import type { CommodityQuote } from "@/lib/types";

export interface QuoteDef {
  symbol: string; // Yahoo
  fmp?: string;
  name: string;
  group: string;
  unit: string;
}

export async function loadDailyQuotes(
  defs: QuoteDef[]
): Promise<{ quotes: CommodityQuote[]; errors: string[] }> {
  const errors: string[] = [];
  const settled = await Promise.allSettled(defs.map((d) => fetchDailyQuote(d.symbol)));
  const quotes: CommodityQuote[] = [];
  const missing: QuoteDef[] = [];

  settled.forEach((r, i) => {
    const d = defs[i];
    if (r.status !== "fulfilled") {
      missing.push(d);
      return;
    }
    const q = r.value;
    quotes.push({
      symbol: d.symbol,
      name: d.name,
      group: d.group,
      unit: d.unit,
      price: q.price,
      change: q.price - q.previousClose,
      changePct: q.changePct,
      change1mPct: q.change1mPct,
      change3mPct: q.change3mPct,
      asOf: q.asOf,
      stale: q.stale,
      source: "Yahoo",
      series: q.series,
      hi52: q.hi52,
      lo52: q.lo52,
      frequency: "D",
    });
  });

  if (missing.length > 0 && fmpEnabled()) {
    const withFmp = missing.filter((d) => d.fmp);
    const map = await fmpBatchQuote(withFmp.map((d) => d.fmp!));
    for (const d of withFmp) {
      const v = map.get(d.fmp!);
      if (!v || !(v.price > 0)) continue;
      quotes.push({
        symbol: d.symbol,
        name: d.name,
        group: d.group,
        unit: d.unit,
        price: v.price,
        change: v.price - v.price / (1 + v.changePct / 100),
        changePct: v.changePct,
        change1mPct: null,
        change3mPct: null,
        asOf: Math.floor(Date.now() / 1000),
        stale: false,
        source: "FMP",
        series: [],
        hi52: null,
        lo52: null,
        frequency: "D",
      });
    }
  }

  const got = new Set(quotes.map((q) => q.symbol));
  defs
    .filter((d) => !got.has(d.symbol))
    .forEach((d) => errors.push(`${d.name} (${d.symbol}): sin datos del proveedor`));
  quotes.sort(
    (a, b) =>
      defs.findIndex((d) => d.symbol === a.symbol) -
      defs.findIndex((d) => d.symbol === b.symbol)
  );
  return { quotes, errors };
}
