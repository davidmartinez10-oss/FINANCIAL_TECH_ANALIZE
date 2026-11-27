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
    // Yahoo primero: responde desde Vercel y trae serie intradía. FMP queda de
    // respaldo para los símbolos que Yahoo no entregue (si hay key válida).
    let { quotes, errors } = await fetchQuotes(symbols, range, interval);
    let source = "yahoo-finance/v8-chart";
    if (errors.length > 0 && fmpEnabled()) {
      const missing = errors.map((e) => e.symbol);
      const fb = await fmpFetchQuotes(missing, range, interval);
      if (fb.quotes.length > 0) {
        quotes = [...quotes, ...fb.quotes];
        errors = fb.errors;
        source += " + financial-modeling-prep";
      }
    }
    const body: QuoteResponse = {
      asOf: new Date().toISOString(),
      source,
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
