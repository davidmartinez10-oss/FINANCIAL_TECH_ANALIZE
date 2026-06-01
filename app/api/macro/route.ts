import { fetchQuotes } from "@/lib/providers/yahoo";
import type { MacroResponse, MacroRegion, MacroIndicator } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RegionDef {
  region: string;
  label: string;
  flag: string;
  assets: { symbol: string; name: string; category: string }[];
}

const MACRO_REGIONS: RegionDef[] = [
  {
    region: "us",
    label: "Estados Unidos",
    flag: "🇺🇸",
    assets: [
      { symbol: "^GSPC", name: "S&P 500", category: "Mercado" },
      { symbol: "^DJI", name: "Dow Jones", category: "Mercado" },
      { symbol: "^IXIC", name: "Nasdaq Composite", category: "Mercado" },
      { symbol: "^VIX", name: "VIX (Volatilidad)", category: "Riesgo" },
      { symbol: "^TNX", name: "Bono 10 años EE.UU.", category: "Tasas" },
      { symbol: "GC=F", name: "Oro (Futuros)", category: "Commodities" },
      { symbol: "CL=F", name: "Petróleo WTI", category: "Commodities" },
      { symbol: "DX-Y.NYB", name: "Índice USD (DXY)", category: "Divisas" },
    ],
  },
  {
    region: "china",
    label: "China",
    flag: "🇨🇳",
    assets: [
      { symbol: "FXI", name: "iShares China Large-Cap ETF", category: "Mercado" },
      { symbol: "MCHI", name: "MSCI China ETF", category: "Mercado" },
      { symbol: "KWEB", name: "China Internet ETF", category: "Tecnología" },
      { symbol: "CNY=X", name: "Yuan Chino (CNY/USD)", category: "Divisas" },
    ],
  },
  {
    region: "eu",
    label: "Unión Europea",
    flag: "🇪🇺",
    assets: [
      { symbol: "EZU", name: "iShares MSCI Eurozone ETF", category: "Mercado" },
      { symbol: "EURUSD=X", name: "EUR/USD", category: "Divisas" },
      { symbol: "EWG", name: "iShares MSCI Germany ETF", category: "Mercado" },
      { symbol: "EWQ", name: "iShares MSCI France ETF", category: "Mercado" },
    ],
  },
  {
    region: "russia",
    label: "Rusia",
    flag: "🇷🇺",
    assets: [
      { symbol: "RSSX", name: "Rusia (proxy RSSX)", category: "Mercado" },
      { symbol: "RUB=X", name: "Rublo Ruso (RUB/USD)", category: "Divisas" },
      { symbol: "NG=F", name: "Gas Natural (Futuros)", category: "Commodities" },
      { symbol: "URA", name: "Global Uranium ETF", category: "Energía" },
    ],
  },
  {
    region: "colombia",
    label: "Colombia",
    flag: "🇨🇴",
    assets: [
      { symbol: "GXG", name: "Global X MSCI Colombia ETF", category: "Mercado" },
      { symbol: "COP=X", name: "Peso Colombiano (COP/USD)", category: "Divisas" },
      { symbol: "EC", name: "Ecopetrol S.A.", category: "Energía" },
    ],
  },
  {
    region: "latam",
    label: "América Latina",
    flag: "🌎",
    assets: [
      { symbol: "ILF", name: "iShares Latin America 40 ETF", category: "Mercado" },
      { symbol: "EWZ", name: "iShares MSCI Brazil ETF", category: "Mercado" },
      { symbol: "EWW", name: "iShares MSCI Mexico ETF", category: "Mercado" },
      { symbol: "ARGT", name: "Global X MSCI Argentina ETF", category: "Mercado" },
      { symbol: "BRL=X", name: "Real Brasileño (BRL/USD)", category: "Divisas" },
      { symbol: "MXN=X", name: "Peso Mexicano (MXN/USD)", category: "Divisas" },
    ],
  },
];

export async function GET() {
  const allSymbols = MACRO_REGIONS.flatMap((r) => r.assets.map((a) => a.symbol));
  const { quotes, errors } = await fetchQuotes(allSymbols, "1d", "1d");

  const quoteMap = new Map(quotes.map((q) => [q.symbol, q]));

  const regions: MacroRegion[] = MACRO_REGIONS.map((regionDef) => {
    const indicators: MacroIndicator[] = regionDef.assets
      .map((a) => {
        const q = quoteMap.get(a.symbol);
        if (!q) return null;
        return {
          symbol: a.symbol,
          name: a.name,
          price: q.price,
          changePct: q.changePct,
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

  const errorMessages = errors.map((e) => `${e.symbol}: ${e.message}`);

  const response: MacroResponse = {
    regions,
    asOf: new Date().toISOString(),
    errors: errorMessages,
  };

  return Response.json(response, {
    headers: { "Cache-Control": "s-maxage=60, stale-while-revalidate=120" },
  });
}
