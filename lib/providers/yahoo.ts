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

// Sin caché de datos de Next: con `revalidate`, la primera visita tras horas
// sin tráfico recibía la respuesta vieja (precios de días atrás) mientras se
// refrescaba en segundo plano. La caché corta la pone el CDN (Cache-Control
// de cada ruta), que sí tiene un tope de antigüedad.
async function fetchYF(path: string): Promise<any> {
  let lastErr: unknown = null;
  for (const host of YF_HOSTS) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await fetch(host + path, {
          headers: BROWSER_HEADERS,
          cache: "no-store",
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

  const json = await fetchYF(path);
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

// Histórico diario (cierres) para el motor de pronóstico por acción.
export async function yahooDailyCloses(
  symbol: string,
  range = "1y",
  interval = "1d"
): Promise<{ t: number; c: number }[]> {
  const path =
    `/v8/finance/chart/${encodeURIComponent(symbol)}` +
    `?range=${range}&interval=${interval}&includePrePost=false`;
  const json = await fetchYF(path);
  const result = json?.chart?.result?.[0];
  if (!result) throw new Error(`Yahoo sin histórico para ${symbol}`);
  const timestamps: number[] = result.timestamp ?? [];
  const closes: (number | null)[] = result.indicators?.quote?.[0]?.close ?? [];
  return timestamps
    .map((t, i) => ({ t, c: closes[i] }))
    .filter((p): p is { t: number; c: number } => p.c != null && Number.isFinite(p.c) && p.c > 0);
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

  const json = await fetchYF(path);
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
    const json = await fetchYF(path);
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

// La búsqueda de Yahoo solo trae noticias con consultas cortas (un ticker o
// una palabra): con varias palabras devuelve cero. Por eso cada canal lanza
// varias consultas cortas y aquí se unen, se quitan repetidas y se ordenan
// de la más reciente a la más antigua.
export async function fetchNewsMulti(
  queries: string[],
  perQuery = 8
): Promise<NewsArticle[]> {
  const settled = await Promise.all(queries.map((q) => fetchNews(q, perQuery)));
  const seen = new Set<string>();
  const out: NewsArticle[] = [];
  for (const a of settled.flat()) {
    const key = a.link || a.uuid;
    if (!a.title || seen.has(key)) continue;
    seen.add(key);
    out.push(a);
  }
  return out.sort((a, b) => b.publishedAt - a.publishedAt);
}

// ── Cotización diaria robusta (futuros de commodities) ─────────────────────
// Varios futuros poco líquidos (mineral de hierro TIO=F, acero HRC=F) traen
// en `meta` un precio de mercado desactualizado mientras la serie de cierres
// sí está al día. Esta función decide cuál usar según la antigüedad de cada
// dato y calcula variaciones a 1 día, 1 mes y 3 meses sobre cierres diarios.
export interface DailyQuote {
  symbol: string;
  shortName: string;
  currency: string;
  price: number;
  previousClose: number;
  changePct: number;
  change1mPct: number | null;
  change3mPct: number | null;
  asOf: number;
  stale: boolean;
  hi52: number | null; // máximo de 52 semanas (solo con meta vigente)
  lo52: number | null;
  series: SeriesPoint[];
}

const DAY = 86_400;

export function buildDailyQuote(
  symbol: string,
  result: any,
  nowS = Date.now() / 1000
): DailyQuote {
  const meta = result?.meta ?? {};
  const timestamps: number[] = result?.timestamp ?? [];
  const closes: (number | null)[] = result?.indicators?.quote?.[0]?.close ?? [];
  const series: SeriesPoint[] = timestamps
    .map((t, i) => ({ t, c: closes[i] }))
    .filter(
      (p): p is SeriesPoint => p.c != null && Number.isFinite(p.c) && p.c > 0
    );

  const metaPrice = Number(meta.regularMarketPrice);
  const metaTime = Number(meta.regularMarketTime ?? 0);
  const metaFresh =
    Number.isFinite(metaPrice) && metaPrice > 0 && nowS - metaTime < 7 * DAY;
  const last = series.at(-1);

  if (!metaFresh && (!last || nowS - last.t > 15 * DAY)) {
    throw new Error(`Yahoo sin datos recientes para ${symbol}`);
  }

  let price: number;
  let previousClose: number;
  let asOf: number;

  if (metaFresh) {
    // Cierre anterior = último cierre de un día (hora de la bolsa) previo al
    // de la última operación.
    const off = Number(meta.gmtoffset ?? 0);
    const dayOf = (t: number) => Math.floor((t + off) / DAY);
    const prior = series.filter((p) => dayOf(p.t) < dayOf(metaTime)).at(-1);
    price = metaPrice;
    asOf = metaTime;
    // Si Yahoo informa la variación del día se usa esa (respeta festivos y
    // liquidaciones que no aparecen en la serie); si no, se deduce de la serie.
    const metaPct = Number(meta.regularMarketChangePercent);
    previousClose =
      meta.regularMarketChangePercent != null && Number.isFinite(metaPct) && metaPct > -100
        ? price / (1 + metaPct / 100)
        : prior?.c ?? Number(meta.chartPreviousClose ?? price);
  } else {
    price = last!.c;
    asOf = last!.t;
    previousClose = series.at(-2)?.c ?? price;
  }

  const pctFrom = (base: number | undefined) =>
    base && base > 0 ? ((price - base) / base) * 100 : null;
  const at = (daysAgo: number) =>
    series.filter((p) => p.t <= asOf - daysAgo * DAY).at(-1)?.c;
  const first = series[0];

  return {
    symbol: meta.symbol ?? symbol,
    shortName: meta.shortName ?? symbol,
    currency: meta.currency ?? "USD",
    price,
    previousClose,
    changePct: pctFrom(previousClose) ?? 0,
    change1mPct: pctFrom(at(30)),
    // 3 meses solo si la serie realmente cubre ~3 meses.
    change3mPct: first && asOf - first.t >= 80 * DAY ? pctFrom(first.c) : null,
    asOf,
    stale: nowS - asOf > 4 * DAY,
    hi52: metaFresh && Number(meta.fiftyTwoWeekHigh) > 0 ? Number(meta.fiftyTwoWeekHigh) : null,
    lo52: metaFresh && Number(meta.fiftyTwoWeekLow) > 0 ? Number(meta.fiftyTwoWeekLow) : null,
    series,
  };
}

export async function fetchDailyQuote(
  symbol: string,
  range = "3mo"
): Promise<DailyQuote> {
  const path =
    `/v8/finance/chart/${encodeURIComponent(symbol)}` +
    `?range=${range}&interval=1d&includePrePost=false`;
  const json = await fetchYF(path);
  const result = json?.chart?.result?.[0];
  if (!result) {
    const desc = json?.chart?.error?.description ?? "respuesta vacía";
    throw new Error(`Yahoo sin datos para ${symbol}: ${desc}`);
  }
  return buildDailyQuote(symbol, result);
}
