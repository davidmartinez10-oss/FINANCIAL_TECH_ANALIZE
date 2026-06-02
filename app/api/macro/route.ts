import { fetchQuotes } from "@/lib/providers/yahoo";
import { fmpEnabled, fmpBatchQuote } from "@/lib/providers/fmp";
import type { MacroResponse, MacroRegion, MacroIndicator } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface MacroAsset {
  symbol: string; // símbolo Yahoo
  fmp?: string; // equivalente FMP (si difiere / está disponible)
  name: string;
  category: string;
}

interface RegionDef {
  region: string;
  label: string;
  flag: string;
  assets: MacroAsset[];
}

const MACRO_REGIONS: RegionDef[] = [
  {
    region: "us",
    label: "Estados Unidos",
    flag: "🇺🇸",
    assets: [
      { symbol: "^GSPC", fmp: "^GSPC", name: "S&P 500", category: "Mercado" },
      { symbol: "^DJI", fmp: "^DJI", name: "Dow Jones", category: "Mercado" },
      { symbol: "^IXIC", fmp: "^IXIC", name: "Nasdaq Composite", category: "Mercado" },
      { symbol: "^VIX", fmp: "^VIX", name: "VIX (Volatilidad)", category: "Riesgo" },
      { symbol: "^TNX", fmp: "^TNX", name: "Bono 10 años EE.UU.", category: "Tasas" },
      { symbol: "GC=F", fmp: "GCUSD", name: "Oro (Futuros)", category: "Commodities" },
      { symbol: "CL=F", fmp: "CLUSD", name: "Petróleo WTI", category: "Commodities" },
      { symbol: "DX-Y.NYB", name: "Índice USD (DXY)", category: "Divisas" },
    ],
  },
  {
    region: "china",
    label: "China",
    flag: "🇨🇳",
    assets: [
      { symbol: "FXI", fmp: "FXI", name: "iShares China Large-Cap ETF", category: "Mercado" },
      { symbol: "MCHI", fmp: "MCHI", name: "MSCI China ETF", category: "Mercado" },
      { symbol: "KWEB", fmp: "KWEB", name: "China Internet ETF", category: "Tecnología" },
      { symbol: "CNY=X", fmp: "USDCNY", name: "Yuan (USD/CNY)", category: "Divisas" },
    ],
  },
  {
    region: "eu",
    label: "Unión Europea",
    flag: "🇪🇺",
    assets: [
      { symbol: "EZU", fmp: "EZU", name: "iShares MSCI Eurozone ETF", category: "Mercado" },
      { symbol: "EURUSD=X", fmp: "EURUSD", name: "EUR/USD", category: "Divisas" },
      { symbol: "EWG", fmp: "EWG", name: "iShares MSCI Germany ETF", category: "Mercado" },
      { symbol: "EWQ", fmp: "EWQ", name: "iShares MSCI France ETF", category: "Mercado" },
    ],
  },
  {
    region: "russia",
    label: "Rusia",
    flag: "🇷🇺",
    assets: [
      { symbol: "RUB=X", fmp: "USDRUB", name: "Rublo (USD/RUB)", category: "Divisas" },
      { symbol: "NG=F", fmp: "NGUSD", name: "Gas Natural (Futuros)", category: "Commodities" },
      { symbol: "URA", fmp: "URA", name: "Global Uranium ETF", category: "Energía" },
    ],
  },
  {
    region: "colombia",
    label: "Colombia",
    flag: "🇨🇴",
    assets: [
      { symbol: "GXG", fmp: "GXG", name: "Global X MSCI Colombia ETF", category: "Mercado" },
      { symbol: "COP=X", fmp: "USDCOP", name: "Peso (USD/COP)", category: "Divisas" },
      { symbol: "EC", fmp: "EC", name: "Ecopetrol S.A.", category: "Energía" },
    ],
  },
  {
    region: "latam",
    label: "América Latina",
    flag: "🌎",
    assets: [
      { symbol: "ILF", fmp: "ILF", name: "iShares Latin America 40 ETF", category: "Mercado" },
      { symbol: "EWZ", fmp: "EWZ", name: "iShares MSCI Brazil ETF", category: "Mercado" },
      { symbol: "EWW", fmp: "EWW", name: "iShares MSCI Mexico ETF", category: "Mercado" },
      { symbol: "ARGT", fmp: "ARGT", name: "Global X MSCI Argentina ETF", category: "Mercado" },
      { symbol: "BRL=X", fmp: "USDBRL", name: "Real (USD/BRL)", category: "Divisas" },
      { symbol: "MXN=X", fmp: "USDMXN", name: "Peso Méx. (USD/MXN)", category: "Divisas" },
    ],
  },
];

export async function GET() {
  const useFmp = fmpEnabled();
  const errorMessages: string[] = [];

  // priceFor(asset) → { price, changePct } | null
  let lookup: (a: MacroAsset) => { price: number; changePct: number } | null;

  if (useFmp) {
    const fmpSymbols = MACRO_REGIONS.flatMap((r) =>
      r.assets.map((a) => a.fmp).filter((x): x is string => !!x)
    );
    const map = await fmpBatchQuote(fmpSymbols);
    lookup = (a) => (a.fmp ? map.get(a.fmp) ?? null : null);
  } else {
    const allSymbols = MACRO_REGIONS.flatMap((r) => r.assets.map((a) => a.symbol));
    const { quotes, errors } = await fetchQuotes(allSymbols, "1d", "1d");
    errors.forEach((e) => errorMessages.push(`${e.symbol}: ${e.message}`));
    const qmap = new Map(quotes.map((q) => [q.symbol, q]));
    lookup = (a) => {
      const q = qmap.get(a.symbol);
      return q ? { price: q.price, changePct: q.changePct } : null;
    };
  }

  const regions: MacroRegion[] = MACRO_REGIONS.map((regionDef) => {
    const indicators: MacroIndicator[] = regionDef.assets
      .map((a) => {
        const v = lookup(a);
        if (!v) return null;
        return {
          symbol: a.symbol,
          name: a.name,
          price: v.price,
          changePct: v.changePct,
          category: a.category,
        } satisfies MacroIndicator;
      })
      .filter((i): i is MacroIndicator => i !== null);

    return {
      region: regionDef.region,
      label: regionDef.label,
      flag: regionDef.flag,
      indicators,
    };
  });

  const response: MacroResponse = {
    regions,
    asOf: new Date().toISOString(),
    errors: errorMessages,
  };

  return Response.json(response, {
    headers: { "Cache-Control": "s-maxage=60, stale-while-revalidate=120" },
  });
}
