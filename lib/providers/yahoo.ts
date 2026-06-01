// ─────────────────────────────────────────────────────────────────────────
// Proveedor de datos: Yahoo Finance (endpoints públicos, sin API key).
// Módulo pluggable: para cambiar de proveedor implementar la misma firma
// y reexportarla en lib/providers.
//
// Robustez para producción (Vercel/datacenter IPs):
//  - Falla sobre múltiples hosts (query1 → query2).
//  - Reintento con backoff en 429/5xx.
//  - Headers de navegador para reducir bloqueo.
// ─────────────────────────────────────────────────────────────────────────
import type { Quote, SeriesPoint, NewsArticle } from "@/lib/types";

const YF_HOSTS = [
  "https://query1.finance.yahoo.com",
  "https://query2.finance.yahoo.com",
];

export const ASSET_NAMES: Record<string, string> = {
  NVDA: "NVIDIA Corporation",
  MSFT: "Microsoft Corporation",
  GOOGL: "Alphabet Inc. (Google)",
  SOXX: "iShares Semiconductor ETF",
  SMH: "VanEck Semiconductor ETF",
  TAN: "Invesco Solar ETF",
  NLR: "VanEck Uranium+Nuclear ETF",
  URNM: "Sprott Uranium Miners ETF",
  SPY: "SPDR S&P 500 ETF",
  QQQ: "Invesco Nasdaq-100 ETF",
};

const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept: "application/json,text/plain,*/*",
  "Accept-Language": "en-US,en;q=0.9",
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchYF(
  path: string,
  revalidate = 30
): Promise<any> {
  let lastErr: unknown = null;
  for (const host of YF_HOSTS) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await fetch(host + path, {
          headers: BROWSER_HEADERS,
          next: { revalidate },
        });
        if (res.ok) return await res.json();
        if (res.status === 429 || res.status >= 500) {
          lastErr = new Error(`Yahoo HTTP ${res.status} (${host})`);
          await sleep(300 * (attempt + 1));
          continue;
        }
        lastErr = new Error(`Yahoo HTTP ${res.status} (${host})`);
        break;
      } catch (e) {
        lastErr = e;
        await sleep(200);
      }
    }
  }
  throw lastErr ?? new Error(`Yahoo: sin respuesta`);
}

// ── Chart (precios históricos e intradía) ──────────────────────────────────

export async function fetchQuote(
  symbol: string,
  range = "1d",
  interval = "5m"
): Promise<Quote> {
  const path =
    `/v8/finance/chart/${encodeURIComponent(symbol)}` +
    `?range=${range}&interval=${interval}&includePrePost=false`;

  const json = await fetchYF(path, 30);
  const result = json?.chart?.result?.[0];
  if (!result) {
    const desc = json?.chart?.error?.description ?? "respuesta vacía";
    throw new Error(`Yahoo sin datos para ${symbol}: ${desc}`);
  }

  const meta = result.meta ?? {};
  const timestamps: number[] = result.timestamp ?? [];
  const closes: (number | null)[] = result.indicators?.quote?.[0]?.close ?? [];

  const series: SeriesPoint[] = timestamps
    .map((t, i) => ({ t, c: closes[i] }))
    .filter((p): p is SeriesPoint => p.c != null && Number.isFinite(p.c));

  const price = Number(meta.regularMarketPrice ?? series.at(-1)?.c ?? 0);
  const prevClose = Number(
    meta.chartPreviousClose ?? meta.previousClose ?? price
  );
  const change = price - prevClose;
  const changePct = prevClose ? (change / prevClose) * 100 : 0;

  return {
    symbol: meta.symbol ?? symbol,
    name: ASSET_NAMES[symbol] ?? meta.shortName ?? symbol,
    price,
    previousClose: prevClose,
    change,
    changePct,
    currency: meta.currency ?? "USD",
    exchange: meta.exchangeName ?? meta.fullExchangeName ?? "",
    marketState: meta.marketState ?? "UNKNOWN",
    marketTime: Number(meta.regularMarketTime ?? 0),
    dayHigh: meta.regularMarketDayHigh ?? null,
    dayLow: meta.regularMarketDayLow ?? null,
    fiftyTwoWeekHigh: meta.fiftyTwoWeekHigh ?? null,
    fiftyTwoWeekLow: meta.fiftyTwoWeekLow ?? null,
    series,
  };
}

export async function fetchQuotes(
  symbols: string[],
  range = "1d",
  interval = "5m"
): Promise<{ quotes: Quote[]; errors: { symbol: string; message: string }[] }> {
  const settled = await Promise.allSettled(
    symbols.map((s) => fetchQuote(s, range, interval))
  );
  const quotes: Quote[] = [];
  const errors: { symbol: string; message: string }[] = [];
  settled.forEach((r, i) => {
    if (r.status === "fulfilled") quotes.push(r.value);
    else
      errors.push({
        symbol: symbols[i],
        message: String((r.reason as Error)?.message ?? r.reason),
      });
  });
  return { quotes, errors };
}

// ── QuoteSummary (fundamentales de empresa) ────────────────────────────────

export async function fetchQuoteSummary(symbol: string): Promise<any> {
  const modules = [
    "summaryProfile",
    "financialData",
    "defaultKeyStatistics",
    "incomeStatementHistory",
    "cashflowStatementHistory",
    "balanceSheetHistory",
  ].join(",");

  const path =
    `/v10/finance/quoteSummary/${encodeURIComponent(symbol)}` +
    `?modules=${encodeURIComponent(modules)}&lang=en-US&region=US`;

  const json = await fetchYF(path, 300);
  const result = json?.quoteSummary?.result?.[0];
  if (!result) {
    const err = json?.quoteSummary?.error?.description ?? "sin datos";
    throw new Error(`Yahoo quoteSummary ${symbol}: ${err}`);
  }
  return result;
}

// ── Noticias financieras ───────────────────────────────────────────────────

export async function fetchNews(
  query: string,
  count = 20
): Promise<NewsArticle[]> {
  const path =
    `/v1/finance/search?q=${encodeURIComponent(query)}` +
    `&quotesCount=0&newsCount=${count}&lang=en-US&region=US`;

  try {
    const json = await fetchYF(path, 300);
    const raw: any[] = json?.news ?? [];
    return raw.map((n: any) => ({
      uuid: n.uuid ?? String(Math.random()),
      title: n.title ?? "",
      summary: n.summary ?? "",
      publisher: n.publisher ?? "",
      link: n.link ?? "",
      publishedAt: Number(n.providerPublishTime ?? 0),
      thumbnail:
        n.thumbnail?.resolutions?.[0]?.url ??
        n.thumbnail?.resolutions?.[1]?.url ??
        undefined,
      relatedSymbols: (n.relatedTickers ?? []).slice(0, 5),
    }));
  } catch {
    return [];
  }
}
