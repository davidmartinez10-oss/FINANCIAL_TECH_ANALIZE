import { fetchNews } from "@/lib/providers/yahoo";
import type { NewsResponse } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SECTOR_QUERIES: Record<string, string> = {
  tech: "technology stocks semiconductors AI",
  ai: "artificial intelligence AI chips NVIDIA Microsoft Google",
  energy: "energy uranium nuclear solar oil gas",
  economy: "economy fed interest rates inflation market",
  latam: "latin america colombia brazil mexico markets",
  portfolio: "NVDA MSFT GOOGL SOXX SMH TAN NLR URNM SPY QQQ",
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const sector = searchParams.get("sector") ?? "portfolio";
  const symbol = searchParams.get("symbol") ?? "";

  const query = symbol
    ? symbol
    : (SECTOR_QUERIES[sector] ?? SECTOR_QUERIES.portfolio);

  try {
    const articles = await fetchNews(query, 25);

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
      { error: String((err as Error).message ?? err), articles: [], query },
      { status: 502 }
    );
  }
}
