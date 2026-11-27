import { fetchNewsMulti } from "@/lib/providers/yahoo";
import { fmpEnabled, fmpNews } from "@/lib/providers/fmp";
import type { NewsResponse } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Consultas cortas por canal (un ticker o una palabra cada una). Yahoo no
// devuelve noticias cuando la consulta lleva varias palabras.
const CHANNEL_QUERIES: Record<string, string[]> = {
  portfolio: ["NVDA", "MSFT", "GOOGL", "SMH", "URNM", "SPY"],
  tech: ["semiconductors", "AAPL", "MSFT", "META", "AMZN"],
  ai: ["NVDA", "AMD", "PLTR", "OpenAI", "GOOGL"],
  energy: ["uranium", "CCJ", "XOM", "oil", "solar"],
  economy: ["Fed", "inflation", "Treasury", "economy", "tariffs"],
  latam: ["Colombia", "Ecopetrol", "Brazil", "Mexico", "EWZ"],
  steel: ["steel", "MT", "VALE", "coal", "TX"],
};

// Respaldo FMP (solo si Yahoo no trae nada y hay key válida).
const FMP_TICKERS: Record<string, string> = {
  portfolio: "NVDA,MSFT,GOOGL,SOXX,SMH,TAN,NLR,URNM,SPY,QQQ",
  tech: "AAPL,MSFT,NVDA,GOOGL,META,AMZN",
  ai: "NVDA,MSFT,GOOGL,AMD,PLTR,SMCI",
  energy: "XOM,CVX,NEE,FSLR,CCJ,UEC",
  steel: "MT,VALE,TX,GGB,HCC,BTU",
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const sector = searchParams.get("sector") ?? "portfolio";
  const symbol = (searchParams.get("symbol") ?? "").toUpperCase();

  const queries = symbol ? [symbol] : (CHANNEL_QUERIES[sector] ?? CHANNEL_QUERIES.portfolio);

  try {
    let articles = await fetchNewsMulti(queries, symbol ? 20 : 8);
    let source = "Yahoo Finance";

    if (articles.length === 0 && fmpEnabled()) {
      articles = await fmpNews(symbol || (FMP_TICKERS[sector] ?? ""), 25);
      source = "Financial Modeling Prep";
    }

    const response: NewsResponse = {
      articles: articles.slice(0, 24),
      query: queries.join(", "),
      source,
      asOf: new Date().toISOString(),
    };

    return Response.json(response, {
      headers: { "Cache-Control": "s-maxage=300, stale-while-revalidate=600" },
    });
  } catch (err) {
    return Response.json(
      { error: String((err as Error).message ?? err), articles: [], query: sector },
      { status: 502 }
    );
  }
}
