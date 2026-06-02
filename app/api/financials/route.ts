import { fetchQuoteSummary } from "@/lib/providers/yahoo";
import { ASSET_NAMES } from "@/lib/providers/yahoo";
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

const n = (v: any): number | null =>
  v?.raw != null && Number.isFinite(v.raw) ? Number(v.raw) : null;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const symbol = (searchParams.get("symbol") ?? "").toUpperCase();

  if (!symbol) {
    return Response.json({ error: "symbol requerido" }, { status: 400 });
  }

  // FMP (con API key) entrega estados financieros completos desde el servidor.
  if (fmpEnabled()) {
    try {
      const response = await fmpFinancials(symbol);
      return Response.json(response, {
        headers: { "Cache-Control": "s-maxage=300, stale-while-revalidate=600" },
      });
    } catch (err) {
      return Response.json(
        { error: `FMP error: ${(err as Error).message ?? err}` },
        { status: 502 }
      );
    }
  }

  // FMP no configurado: devolver error descriptivo antes de intentar Yahoo
  // (Yahoo Finance bloquea IPs de datacenter/Vercel con 401/403).
  return Response.json(
    {
      error:
        "FMP_API_KEY no está configurada en este servidor. " +
        "Agrégala en Vercel → tu proyecto → Settings → Environment Variables, " +
        "selecciona los tres entornos (Production, Preview, Development) y redespliega. " +
        "Verifica en /api/health que la variable llega al runtime.",
      _debug: {
        fmpEnabled: false,
        nodeEnv: process.env.NODE_ENV,
        keyLength: (process.env.FMP_API_KEY ?? "").length,
      },
    },
    { status: 503 }
  );

  try {
    const data = await fetchQuoteSummary(symbol);

    const sp = data.summaryProfile ?? {};
    const fd = data.financialData ?? {};
    const ks = data.defaultKeyStatistics ?? {};

    const staticProfile = STATIC_PROFILES[symbol] ?? {
      mission: "Información no disponible.",
      vision: "Información no disponible.",
      founded: "N/A",
      hq: "N/A",
      type: "stock",
      tickerType: "Activo financiero",
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

    const income: IncomeStatement = {
      revenue: n(fd.totalRevenue),
      grossProfit: n(fd.grossProfits),
      ebit: n(fd.operatingCashflow), // approx from cashflow when EBIT not directly available
      ebitda: n(fd.ebitda),
      netIncome: null,
      grossMargin: n(fd.grossMargins),
      operatingMargin: n(fd.operatingMargins),
      netMargin: n(fd.profitMargins),
      revenueGrowth: n(fd.revenueGrowth),
      earningsGrowth: n(fd.earningsGrowth),
    };

    // Enrich EBIT from income statement history if available
    const incHist = data.incomeStatementHistory?.incomeStatementHistory ?? [];
    if (incHist.length > 0) {
      const latest = incHist[0];
      income.ebit = n(latest.ebit) ?? income.ebit;
      income.netIncome = n(latest.netIncome);
    }

    const bsHist = data.balanceSheetHistory?.balanceSheetStatements ?? [];
    const latestBS = bsHist[0] ?? {};

    const totalDebt = n(fd.totalDebt);
    const totalCash = n(fd.totalCash);
    const netDebt: number | null =
      totalDebt != null && totalCash != null
        ? (totalDebt as number) - (totalCash as number)
        : null;

    const balanceSheet: BalanceSheet = {
      totalAssets: n(latestBS.totalAssets),
      totalDebt,
      cashAndEquivalents: totalCash,
      netDebt,
      debtToEquity: n(fd.debtToEquity),
      currentRatio: n(fd.currentRatio),
      quickRatio: n(fd.quickRatio),
    };

    const cfHist =
      data.cashflowStatementHistory?.cashflowStatements ?? [];
    const latestCF = cfHist[0] ?? {};

    const cashFlow: CashFlowStatement = {
      operatingCashFlow:
        n(fd.operatingCashflow) ?? n(latestCF.totalCashFromOperatingActivities),
      capitalExpenditures: n(latestCF.capitalExpenditures),
      freeCashFlow: n(fd.freeCashflow),
    };

    const response: FinancialsResponse = {
      symbol,
      name: ASSET_NAMES[symbol] ?? symbol,
      profile,
      keyStats,
      income,
      balanceSheet,
      cashFlow,
      asOf: new Date().toISOString(),
    };

    return Response.json(response, {
      headers: { "Cache-Control": "s-maxage=300, stale-while-revalidate=600" },
    });
  } catch (err) {
    return Response.json(
      { error: String((err as Error).message ?? err) },
      { status: 502 }
    );
  }
}
