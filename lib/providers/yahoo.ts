// ─────────────────────────────────────────────────────────────────────────
// Proveedor de datos: Yahoo Finance (endpoint público v8/chart, sin API key).
// Diseñado como módulo "pluggable": para cambiar de proveedor basta con
// implementar la misma firma `fetchQuote` y reexportarla en lib/providers.
//
// Robustez para producción (Vercel/datacenter IPs):
//  - Falla sobre múltiples hosts de Yahoo (query1 → query2): Yahoo balancea y
//    a veces bloquea/limita un rango de IPs; rotar host recupera la respuesta.
//  - Reintento con backoff en 429/5xx (rate-limit transitorio).
//  - Headers de navegador para reducir el bloqueo a clientes automatizados.
// ─────────────────────────────────────────────────────────────────────────
import type { Quote, SeriesPoint } from "@/lib/types";

const YF_HOSTS = [
  "https://query1.finance.yahoo.com",
  "https://query2.finance.yahoo.com",
];

// Nombres legibles del universo de la plataforma.
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

/**
 * Descarga el JSON del chart de Yahoo intentando varios hosts y reintentando
 * ante rate-limit. Lanza si todos los intentos fallan.
 */
async function fetchChartJson(
  symbol: string,
  range: string,
  interval: string
): Promise<any> {
  const path =
    `/v8/finance/chart/${encodeURIComponent(symbol)}` +
    `?range=${range}&interval=${interval}&includePrePost=false`;

  let lastErr: unknown = null;
  for (const host of YF_HOSTS) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await fetch(host + path, {
          headers: BROWSER_HEADERS,
          // Cache de borde: evita golpear Yahoo en cada request (anti rate-limit).
          next: { revalidate: 30 },
        });
        if (res.ok) return await res.json();
        // 429 / 5xx → reintentar (otro host o tras backoff); 4xx duros → cortar.
        if (res.status === 429 || res.status >= 500) {
          lastErr = new Error(`Yahoo HTTP ${res.status} (${host})`);
          await sleep(250 * (attempt + 1));
          continue;
        }
        lastErr = new Error(`Yahoo HTTP ${res.status} (${host})`);
        break; // 401/403/404: cambiar de host, no insistir en este
      } catch (e) {
        lastErr = e;
        await sleep(200);
      }
    }
  }
  throw lastErr ?? new Error(`Yahoo: sin respuesta para ${symbol}`);
}

export async function fetchQuote(
  symbol: string,
  range = "1d",
  interval = "5m"
): Promise<Quote> {
  const json = await fetchChartJson(symbol, range, interval);

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
