// ─────────────────────────────────────────────────────────────────────────
// Proveedor de datos en vivo: Financial Modeling Prep (FMP).
//
// A diferencia de Yahoo (que bloquea IPs de datacenter), FMP funciona desde
// servidores con una API key. Se activa automáticamente cuando la variable de
// entorno FMP_API_KEY está presente; si no, las rutas caen a Yahoo.
//
// Plan gratuito (~250 llamadas/día): cubre cotizaciones, histórico, estados
// financieros completos, ratios, perfil y noticias.
// ─────────────────────────────────────────────────────────────────────────
import type {
  Quote,
  SeriesPoint,
  NewsArticle,
  FinancialsResponse,
  CompanyProfile,
  KeyStats,
  IncomeStatement,
  BalanceSheet,
  CashFlowStatement,
} from "@/lib/types";
import { ASSET_NAMES } from "@/lib/providers/yahoo";
import { STATIC_PROFILES } from "@/lib/data/company-profiles";

const FMP_BASE = "https://financialmodelingprep.com/api/v3";

export function fmpEnabled(): boolean {
  return !!process.env.FMP_API_KEY;
}

function key(): string {
  return process.env.FMP_API_KEY ?? "";
}

async function fmpGet(path: string, revalidate = 60): Promise<any> {
  const sep = path.includes("?") ? "&" : "?";
  const url = `${FMP_BASE}${path}${sep}apikey=${key()}`;
  const res = await fetch(url, { next: { revalidate } });
  if (!res.ok) throw new Error(`FMP HTTP ${res.status} (${path.split("?")[0]})`);
  const json = await res.json();
  if (json && typeof json === "object" && "Error Message" in json) {
    throw new Error(`FMP: ${json["Error Message"]}`);
  }
  return json;
}

const num = (v: any): number | null =>
  v != null && Number.isFinite(Number(v)) ? Number(v) : null;

// ── Series históricas ──────────────────────────────────────────────────────

function rangeToDays(range: string): number {
  switch (range) {
    case "1d":
      return 1;
    case "5d":
      return 5;
    case "1mo":
      return 22;
    case "3mo":
      return 66;
    case "6mo":
      return 132;
    case "1y":
      return 252;
    default:
      return 66;
  }
}

async function fetchSeries(symbol: string, range: string, interval: string): Promise<SeriesPoint[]> {
  try {
    // Intradía (intervalos en minutos) → velas de 5min; si no, histórico diario.
    if (interval.includes("m")) {
      const rows: any[] = await fmpGet(
        `/historical-chart/5min/${encodeURIComponent(symbol)}`,
        30
      );
      return (rows ?? [])
        .slice(0, 78) // ~1 sesión
        .reverse()
        .map((r) => ({
          t: Math.floor(new Date(r.date.replace(" ", "T") + "Z").getTime() / 1000),
          c: Number(r.close),
        }))
        .filter((p): p is SeriesPoint => Number.isFinite(p.c));
    }
    const days = rangeToDays(range);
    const data = await fmpGet(
      `/historical-price-full/${encodeURIComponent(symbol)}?serietype=line&timeseries=${days}`,
      300
    );
    const hist: any[] = data?.historical ?? [];
    return hist
      .slice(0, days)
      .reverse()
      .map((r) => ({
        t: Math.floor(new Date(r.date + "T00:00:00Z").getTime() / 1000),
        c: Number(r.close),
      }))
      .filter((p): p is SeriesPoint => Number.isFinite(p.c));
  } catch {
    return [];
  }
}

// Histórico diario (cierres) para el motor de pronóstico por acción.
export async function fmpDailyCloses(
  symbol: string,
  days = 260
): Promise<{ t: number; c: number }[]> {
  const data = await fmpGet(
    `/historical-price-full/${encodeURIComponent(symbol)}?serietype=line&timeseries=${days}`,
    600
  );
  const hist: any[] = data?.historical ?? [];
  return hist
    .slice(0, days)
    .reverse()
    .map((r) => ({
      t: Math.floor(new Date(r.date + "T00:00:00Z").getTime() / 1000),
      c: Number(r.close),
    }))
    .filter((p) => Number.isFinite(p.c) && p.c > 0);
}

// ── Cotizaciones ────────────────────────────────────────────────────────────

export async function fmpFetchQuotes(
  symbols: string[],
  range = "1d",
  interval = "5m"
): Promise<{ quotes: Quote[]; errors: { symbol: string; message: string }[] }> {
  const errors: { symbol: string; message: string }[] = [];
  let raw: any[] = [];
  try {
    raw = await fmpGet(`/quote/${symbols.map(encodeURIComponent).join(",")}`, 30);
  } catch (e) {
    return {
      quotes: [],
      errors: symbols.map((s) => ({ symbol: s, message: String((e as Error).message) })),
    };
  }

  const bySym = new Map<string, any>((raw ?? []).map((q) => [q.symbol, q]));

  // Series: solo para consultas de un símbolo (evita agotar la cuota en grids).
  const single = symbols.length === 1;

  const quotes: Quote[] = [];
  for (const s of symbols) {
    const q = bySym.get(s);
    if (!q) {
      errors.push({ symbol: s, message: "sin datos FMP" });
      continue;
    }
    const series = single ? await fetchSeries(s, range, interval) : [];
    quotes.push({
      symbol: s,
      name: ASSET_NAMES[s] ?? q.name ?? s,
      price: Number(q.price ?? 0),
      previousClose: Number(q.previousClose ?? q.price ?? 0),
      change: Number(q.change ?? 0),
      changePct: Number(q.changesPercentage ?? 0),
      currency: "USD",
      exchange: q.exchange ?? "",
      marketState: "REGULAR",
      marketTime: Number(q.timestamp ?? 0),
      dayHigh: num(q.dayHigh),
      dayLow: num(q.dayLow),
      fiftyTwoWeekHigh: num(q.yearHigh),
      fiftyTwoWeekLow: num(q.yearLow),
      series,
    });
  }
  return { quotes, errors };
}

// ── Cotizaciones genéricas (macro): precio + % por símbolo FMP ──────────────

export async function fmpBatchQuote(
  fmpSymbols: string[]
): Promise<Map<string, { price: number; changePct: number }>> {
  const out = new Map<string, { price: number; changePct: number }>();
  try {
    const raw: any[] = await fmpGet(
      `/quote/${fmpSymbols.map(encodeURIComponent).join(",")}`,
      60
    );
    for (const q of raw ?? []) {
      out.set(q.symbol, {
        price: Number(q.price ?? 0),
        changePct: Number(q.changesPercentage ?? 0),
      });
    }
  } catch {
    /* devuelve lo que haya */
  }
  return out;
}

// ── Estados financieros ──────────────────────────────────────────────────────

export async function fmpFinancials(symbol: string): Promise<FinancialsResponse> {
  const [
    profileArr,
    quoteArr,
    incomeArr,
    balanceArr,
    cashArr,
    keyMetricsArr,
    ratiosArr,
    growthArr,
  ] = await Promise.all([
    fmpGet(`/profile/${symbol}`, 600).catch(() => []),
    fmpGet(`/quote/${symbol}`, 60).catch(() => []), // gratis: pe, eps, marketCap, shares
    fmpGet(`/income-statement/${symbol}?period=annual&limit=1`, 600).catch(() => []),
    fmpGet(`/balance-sheet-statement/${symbol}?period=annual&limit=1`, 600).catch(() => []),
    fmpGet(`/cash-flow-statement/${symbol}?period=annual&limit=1`, 600).catch(() => []),
    fmpGet(`/key-metrics-ttm/${symbol}`, 600).catch(() => []),
    fmpGet(`/ratios-ttm/${symbol}`, 600).catch(() => []),
    fmpGet(`/income-statement-growth/${symbol}?limit=1`, 600).catch(() => []),
  ]);

  const pr = profileArr?.[0] ?? {};
  const qt = quoteArr?.[0] ?? {};
  const inc = incomeArr?.[0] ?? {};
  const bs = balanceArr?.[0] ?? {};
  const cf = cashArr?.[0] ?? {};
  const km = keyMetricsArr?.[0] ?? {};
  const ra = ratiosArr?.[0] ?? {};
  const gr = growthArr?.[0] ?? {};

  const sp = STATIC_PROFILES[symbol] ?? {
    mission: "Información no disponible.",
    vision: "Información no disponible.",
    founded: "N/A",
    hq: "N/A",
  };

  const profile: CompanyProfile = {
    symbol,
    name: ASSET_NAMES[symbol] ?? pr.companyName ?? qt.name ?? symbol,
    sector: pr.sector || null,
    industry: pr.industry || null,
    country: pr.country || null,
    website: pr.website || null,
    employees: num(pr.fullTimeEmployees),
    description: pr.description || null,
    mission: sp.mission,
    vision: sp.vision,
    founded: pr.ipoDate ? String(pr.ipoDate).slice(0, 4) : sp.founded,
    hq:
      pr.city && pr.country
        ? `${pr.city}${pr.state ? ", " + pr.state : ""}, ${pr.country}`
        : sp.hq,
  };

  // Valores base que el plan gratuito sí entrega de forma fiable.
  const marketCap = num(pr.mktCap) ?? num(km.marketCapTTM) ?? num(qt.marketCap);
  const totalDebt = num(bs.totalDebt);
  const cash = num(bs.cashAndCashEquivalents) ?? num(bs.cashAndShortTermInvestments);
  const netDebt = totalDebt != null && cash != null ? totalDebt - cash : num(bs.netDebt);
  const equity = num(bs.totalStockholdersEquity);
  const revenue = num(inc.revenue);
  const ebitda = num(inc.ebitda);

  // Enterprise Value derivado si no viene precalculado.
  const enterpriseValue =
    num(km.enterpriseValueTTM) ??
    (marketCap != null && totalDebt != null && cash != null
      ? marketCap + totalDebt - cash
      : null);

  // Ratios: usa el valor del proveedor; si no, lo deriva de cifras base.
  const div = (a: number | null, b: number | null): number | null =>
    a != null && b != null && b !== 0 ? a / b : null;

  const keyStats: KeyStats = {
    marketCap,
    enterpriseValue,
    peRatio: num(km.peRatioTTM) ?? num(qt.pe) ?? num(pr.pe),
    forwardPE: null,
    pbRatio: num(km.pbRatioTTM) ?? div(marketCap, equity),
    psRatio: num(km.priceToSalesRatioTTM) ?? div(marketCap, revenue),
    evToEbitda: num(km.enterpriseValueOverEBITDATTM) ?? div(enterpriseValue, ebitda),
    returnOnEquity: num(ra.returnOnEquityTTM) ?? div(num(inc.netIncome), equity),
    returnOnAssets: num(ra.returnOnAssetsTTM) ?? div(num(inc.netIncome), num(bs.totalAssets)),
    beta: num(pr.beta),
    dividendYield:
      num(km.dividendYieldTTM) ?? div(num(pr.lastDiv), num(qt.price) ?? num(pr.price)),
  };

  const income: IncomeStatement = {
    revenue,
    grossProfit: num(inc.grossProfit),
    ebit: num(inc.operatingIncome),
    ebitda,
    netIncome: num(inc.netIncome),
    grossMargin: num(inc.grossProfitRatio) ?? div(num(inc.grossProfit), revenue),
    operatingMargin: num(inc.operatingIncomeRatio) ?? div(num(inc.operatingIncome), revenue),
    netMargin: num(inc.netIncomeRatio) ?? div(num(inc.netIncome), revenue),
    revenueGrowth: num(gr.growthRevenue),
    earningsGrowth: num(gr.growthNetIncome),
  };

  const balanceSheet: BalanceSheet = {
    totalAssets: num(bs.totalAssets),
    totalDebt,
    cashAndEquivalents: cash,
    netDebt,
    debtToEquity: num(ra.debtEquityRatioTTM) ?? div(totalDebt, equity),
    currentRatio: num(ra.currentRatioTTM) ?? div(num(bs.totalCurrentAssets), num(bs.totalCurrentLiabilities)),
    quickRatio: num(ra.quickRatioTTM),
  };

  const cashFlow: CashFlowStatement = {
    operatingCashFlow: num(cf.operatingCashFlow),
    capitalExpenditures: num(cf.capitalExpenditure),
    freeCashFlow: num(cf.freeCashFlow),
  };

  return {
    symbol,
    name: profile.name,
    profile,
    keyStats,
    income,
    balanceSheet,
    cashFlow,
    asOf: new Date().toISOString(),
  };
}

// ── Noticias ──────────────────────────────────────────────────────────────

export async function fmpNews(tickers: string, count = 20): Promise<NewsArticle[]> {
  try {
    const path = tickers
      ? `/stock_news?tickers=${encodeURIComponent(tickers)}&limit=${count}`
      : `/stock_news?limit=${count}`;
    const raw: any[] = await fmpGet(path, 300);
    return (raw ?? []).map((n: any) => ({
      uuid: n.url ?? String(Math.random()),
      title: n.title ?? "",
      summary: n.text ?? "",
      publisher: n.site ?? "",
      link: n.url ?? "",
      publishedAt: n.publishedDate
        ? Math.floor(new Date(n.publishedDate.replace(" ", "T") + "Z").getTime() / 1000)
        : 0,
      thumbnail: n.image || undefined,
      relatedSymbols: n.symbol ? [n.symbol] : [],
    }));
  } catch {
    return [];
  }
}
