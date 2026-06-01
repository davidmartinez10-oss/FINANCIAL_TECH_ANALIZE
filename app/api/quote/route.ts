import { NextRequest, NextResponse } from "next/server";
import { fetchQuotes } from "@/lib/providers/yahoo";
import { fmpEnabled, fmpFetchQuotes } from "@/lib/providers/fmp";
import type { QuoteResponse } from "@/lib/types";

// Yahoo necesita el runtime de Node (fetch con headers personalizados).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_SYMBOLS = [
  "NVDA", "MSFT", "GOOGL", "SOXX", "SMH",
  "TAN", "NLR", "URNM", "SPY", "QQQ",
];

const MAX_SYMBOLS = 20;

/**
 * GET /api/quote?symbols=NVDA,MSFT&range=1d&interval=5m
 * Devuelve cotizaciones en (casi) tiempo real desde Yahoo Finance.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);

  const raw = searchParams.get("symbols");
  const symbols = (raw ? raw.split(",") : DEFAULT_SYMBOLS)
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean)
    .slice(0, MAX_SYMBOLS);

  const range = searchParams.get("range") ?? "1d";
  const interval = searchParams.get("interval") ?? "5m";

  try {
    // FMP (con API key) funciona desde servidores; Yahoo es el fallback.
    const useFmp = fmpEnabled();
    const { quotes, errors } = useFmp
      ? await fmpFetchQuotes(symbols, range, interval)
      : await fetchQuotes(symbols, range, interval);
    const body: QuoteResponse = {
      asOf: new Date().toISOString(),
      source: useFmp ? "financial-modeling-prep" : "yahoo-finance/v8-chart",
      quotes,
      ...(errors.length ? { errors } : {}),
    };
    return NextResponse.json(body, {
      headers: { "Cache-Control": "s-maxage=30, stale-while-revalidate=60" },
    });
  } catch (err) {
    return NextResponse.json(
      { error: String((err as Error).message ?? err) },
      { status: 502 }
    );
  }
}
