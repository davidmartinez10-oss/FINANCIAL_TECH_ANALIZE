import { fetchQuoteSummary, ASSET_NAMES } from "@/lib/providers/yahoo";
import { fmpEnabled, fmpFinancials } from "@/lib/providers/fmp";
import { STATIC_PROFILES } from "@/lib/data/company-profiles";
import type {
  FinancialsResponse,
  CompanyProfile,
  KeyStats,
  IncomeStatement,
  BalanceSheet,
  CashFlowStatement,
} from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CACHE = { headers: { "Cache-Control": "s-maxage=300, stale-while-revalidate=600" } };

// Yahoo Finance wraps numbers as { raw: number }
const n = (v: any): number | null =>
  v?.raw != null && Number.isFinite(v.raw) ? Number(v.raw) : null;

// Count populated key metrics — used to decide which source wins.
function quality(r: FinancialsResponse): number {
  return [
    r.keyStats.marketCap,
    r.keyStats.peRatio,
    r.keyStats.pbRatio,
    r.income.revenue,
    r.income.netIncome,
    r.income.ebitda,
    r.balanceSheet.totalAssets,
    r.cashFlow.operatingCashFlow,
  ].filter((v) => v != null).length;
}

function buildFromYahoo(symbol: string, data: any): FinancialsResponse {
  const sp = data.summaryProfile ?? {};
  const fd = data.financialData ?? {};
  const ks = data.defaultKeyStatistics ?? {};
  const staticProfile = STATIC_PROFILES[symbol] ?? {
    mission: "Información no disponible.",
    vision: "Información no disponible.",
    founded: "N/A",
    hq: "N/A",
  };

  const profile: CompanyProfile = {
    symbol,
    name: ASSET_NAMES[symbol] ?? symbol,
    sector: sp.sector ?? null,
    industry: sp.industry ?? null,
    country: sp.country ?? null,
    website: sp.website ?? null,
    employees: sp.fullTimeEmployees ?? null,
    description: sp.longBusinessSummary ?? null,
    mission: staticProfile.mission,
    vision: staticProfile.vision,
    founded: staticProfile.founded,
    hq: staticProfile.hq,
  };

  const keyStats: KeyStats = {
    marketCap: n(ks.marketCap),
    enterpriseValue: n(ks.enterpriseValue),
    peRatio: n(ks.trailingPE),
    forwardPE: n(ks.forwardPE),
    pbRatio: n(ks.priceToBook),
    psRatio: n(ks.priceToSalesTrailing12Months),
    evToEbitda: n(ks.enterpriseToEbitda),
    returnOnEquity: n(fd.returnOnEquity),
    returnOnAssets: n(fd.returnOnAssets),
    beta: n(ks.beta),
    dividendYield: n(ks.dividendYield),
  };

  const incHist = data.incomeStatementHistory?.incomeStatementHistory ?? [];
  const latestInc = incHist[0] ?? {};

  const income: IncomeStatement = {
    revenue: n(fd.totalRevenue),
    grossProfit: n(fd.grossProfits),
    ebit: n(latestInc.ebit),
    ebitda: n(fd.ebitda),
    netIncome: n(latestInc.netIncome),
    grossMargin: n(fd.grossMargins),
    operatingMargin: n(fd.operatingMargins),
    netMargin: n(fd.profitMargins),
    revenueGrowth: n(fd.revenueGrowth),
    earningsGrowth: n(fd.earningsGrowth),
  };

  const bsHist = data.balanceSheetHistory?.balanceSheetStatements ?? [];
  const latestBS = bsHist[0] ?? {};
  const totalDebt = n(fd.totalDebt);
  const totalCash = n(fd.totalCash);

  const balanceSheet: BalanceSheet = {
    totalAssets: n(latestBS.totalAssets),
    totalDebt,
    cashAndEquivalents: totalCash,
    netDebt: totalDebt != null && totalCash != null ? totalDebt - totalCash : null,
    debtToEquity: n(fd.debtToEquity),
    currentRatio: n(fd.currentRatio),
    quickRatio: n(fd.quickRatio),
  };

  const cfHist = data.cashflowStatementHistory?.cashflowStatements ?? [];
  const latestCF = cfHist[0] ?? {};

  const cashFlow: CashFlowStatement = {
    operatingCashFlow:
      n(fd.operatingCashflow) ?? n(latestCF.totalCashFromOperatingActivities),
    capitalExpenditures: n(latestCF.capitalExpenditures),
    freeCashFlow: n(fd.freeCashflow),
  };

  return {
    symbol,
    name: ASSET_NAMES[symbol] ?? symbol,
    profile,
    keyStats,
    income,
    balanceSheet,
    cashFlow,
    asOf: new Date().toISOString(),
  };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const symbol = (searchParams.get("symbol") ?? "").toUpperCase();

  if (!symbol) {
    return Response.json({ error: "symbol requerido" }, { status: 400 });
  }

  let fmpResult: FinancialsResponse | null = null;
  let fmpErr = "";

  // ── 1. FMP (si está configurado) ──────────────────────────────────────────
  if (fmpEnabled()) {
    try {
      fmpResult = await fmpFinancials(symbol);
      // Devolver de inmediato si hay datos suficientes (≥3 métricas clave).
      // Para ETFs, FMP devuelve [] en estados financieros → quality < 3 → cae a Yahoo.
      if (quality(fmpResult) >= 3) {
        return Response.json(fmpResult, CACHE);
      }
    } catch (err) {
      fmpErr = (err as Error).message ?? String(err);
    }
  }

  // ── 2. Yahoo Finance quoteSummary como respaldo ────────────────────────────
  // Funciona para acciones individuales y devuelve marketCap/beta/yield para ETFs.
  // Puede fallar en IPs de datacenter con 401; en ese caso se devuelve lo que haya de FMP.
  try {
    const raw = await fetchQuoteSummary(symbol);
    const yahooResult = buildFromYahoo(symbol, raw);

    // Si FMP devolvió algo (aunque sea parcial), usar el que tenga más datos.
    if (fmpResult && quality(fmpResult) >= quality(yahooResult)) {
      return Response.json(fmpResult, CACHE);
    }

    return Response.json(yahooResult, CACHE);
  } catch (yahooErr) {
    // Ambas fuentes fallaron → devolver datos parciales de FMP o error descriptivo.
    if (fmpResult) {
      return Response.json(fmpResult, CACHE);
    }

    const errorMsg = !fmpEnabled()
      ? "FMP_API_KEY no está configurada en este servidor. " +
        "Agrégala en Vercel → tu proyecto → Settings → Environment Variables, " +
        "selecciona los tres entornos (Production, Preview, Development) y redespliega. " +
        "Verifica en /api/health que la variable llega al runtime."
      : fmpErr
      ? `FMP error: ${fmpErr}. Yahoo Finance también falló desde este servidor.`
      : `Datos no disponibles desde este servidor: ${(yahooErr as Error).message}`;

    return Response.json(
      {
        error: errorMsg,
        _debug: {
          fmpEnabled: fmpEnabled(),
          nodeEnv: process.env.NODE_ENV,
          keyLength: (process.env.FMP_API_KEY ?? "").length,
          yahooError: (yahooErr as Error).message,
          fmpError: fmpErr || undefined,
        },
      },
      { status: 503 }
    );
  }
}
