import { fetchNews } from "@/lib/providers/yahoo";
import { fmpEnabled, fmpNews } from "@/lib/providers/fmp";
import type { NewsResponse } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Consulta de texto para Yahoo (búsqueda libre).
const SECTOR_QUERIES: Record<string, string> = {
  tech: "technology stocks semiconductors AI",
  ai: "artificial intelligence AI chips NVIDIA Microsoft Google",
  energy: "energy uranium nuclear solar oil gas",
  economy: "economy fed interest rates inflation market",
  latam: "latin america colombia brazil mexico markets",
  portfolio: "NVDA MSFT GOOGL SOXX SMH TAN NLR URNM SPY QQQ",
};

// Tickers representativos por sector para FMP (/stock_news?tickers=).
// economy/latam quedan sin tickers → últimas noticias generales del mercado.
const SECTOR_TICKERS: Record<string, string> = {
  tech: "AAPL,MSFT,NVDA,GOOGL,META,AMZN",
  ai: "NVDA,MSFT,GOOGL,AMD,PLTR,SMCI",
  energy: "XOM,CVX,NEE,FSLR,CCJ,UEC",
  economy: "",
  latam: "",
  portfolio: "NVDA,MSFT,GOOGL,SOXX,SMH,TAN,NLR,URNM,SPY,QQQ",
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const sector = searchParams.get("sector") ?? "portfolio";
  const symbol = searchParams.get("symbol") ?? "";

  try {
    let articles;
    let query: string;

    if (fmpEnabled()) {
      const tickers = symbol
        ? symbol.toUpperCase()
        : (SECTOR_TICKERS[sector] ?? SECTOR_TICKERS.portfolio);
      query = tickers || sector;
      articles = await fmpNews(tickers, 25);
    } else {
      query = symbol || (SECTOR_QUERIES[sector] ?? SECTOR_QUERIES.portfolio);
      articles = await fetchNews(query, 25);
    }

    const response: NewsResponse = {
      articles: articles.slice(0, 20),
      query,
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
