// ─────────────────────────────────────────────────────────────────────────
// Proveedor de datos: Yahoo Finance (endpoint público v8/chart, sin API key).
// Diseñado como módulo "pluggable": para cambiar de proveedor basta con
// implementar la misma firma `fetchQuote` y reexportarla en lib/providers.
// ─────────────────────────────────────────────────────────────────────────
import type { Quote, SeriesPoint } from "@/lib/types";

const YF_CHART = "https://query1.finance.yahoo.com/v8/finance/chart";

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

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0 Safari/537.36";

export async function fetchQuote(
  symbol: string,
  range = "1d",
  interval = "5m"
): Promise<Quote> {
  const url =
    `${YF_CHART}/${encodeURIComponent(symbol)}` +
    `?range=${range}&interval=${interval}&includePrePost=false`;

  const res = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "application/json" },
    // Cache de borde: evita golpear Yahoo en cada request (anti rate-limit).
    next: { revalidate: 30 },
  });

  if (!res.ok) {
    throw new Error(`Yahoo HTTP ${res.status} para ${symbol}`);
  }

  const json = await res.json();
  const result = json?.chart?.result?.[0];
  if (!result) {
    const desc = json?.chart?.error?.description ?? "respuesta vacía";
    throw new Error(`Yahoo sin datos para ${symbol}: ${desc}`);
  }

  const meta = result.meta ?? {};
  const timestamps: number[] = result.timestamp ?? [];
  const closes: (number | null)[] =
    result.indicators?.quote?.[0]?.close ?? [];

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
    else errors.push({ symbol: symbols[i], message: String(r.reason?.message ?? r.reason) });
  });
  return { quotes, errors };
}
