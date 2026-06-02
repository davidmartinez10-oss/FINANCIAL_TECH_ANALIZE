"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import AssetForecast from "@/components/AssetForecast";
import { ASSET_NAMES } from "@/lib/providers/yahoo";
import { STATIC_PROFILES } from "@/lib/data/company-profiles";
import type { FinancialsResponse, Quote } from "@/lib/types";

function fmt$(n: number | null, suffix = ""): string {
  if (n == null) return "N/A";
  const abs = Math.abs(n);
  if (abs >= 1e12) return `$${(n / 1e12).toFixed(2)}T${suffix}`;
  if (abs >= 1e9) return `$${(n / 1e9).toFixed(2)}B${suffix}`;
  if (abs >= 1e6) return `$${(n / 1e6).toFixed(2)}M${suffix}`;
  return `$${n.toFixed(2)}${suffix}`;
}

function fmtPct(n: number | null): string {
  if (n == null) return "N/A";
  return `${(n * 100).toFixed(1)}%`;
}

function fmtX(n: number | null): string {
  if (n == null) return "N/A";
  return `${n.toFixed(2)}x`;
}

function StatCard({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color?: "green" | "red" | "accent";
}) {
  return (
    <div className="stat-card">
      <div className="stat-label">{label}</div>
      <div className={`stat-val ${color ?? ""}`}>{value}</div>
    </div>
  );
}

export default function CompanyPage() {
  const params = useParams();
  const symbol = ((params?.symbol as string) ?? "").toUpperCase();

  const [financials, setFinancials] = useState<FinancialsResponse | null>(null);
  const [finError, setFinError] = useState<string | null>(null);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [history, setHistory] = useState<{ t: number; c: number }[]>([]);
  const [loading, setLoading] = useState(true);

  // Datos estáticos (siempre disponibles, no dependen de la red).
  const staticProfile = STATIC_PROFILES[symbol];
  const staticName = ASSET_NAMES[symbol] ?? symbol;

  useEffect(() => {
    if (!symbol) return;
    setLoading(true);
    setFinError(null);
    setFinancials(null);
    setQuote(null);
    setHistory([]);

    // Cada fuente falla de forma independiente: un error en financieros NO
    // debe ocultar la gráfica de precio ni el pronóstico (que son autónomos).
    const finP = fetch(`/api/financials?symbol=${symbol}`)
      .then((r) => r.json())
      .then((fin) => {
        if (fin.error) throw new Error(fin.error);
        setFinancials(fin as FinancialsResponse);
      })
      .catch((e) => setFinError(String(e.message ?? e)));

    const quoteP = fetch(`/api/quote?symbols=${symbol}&range=3mo&interval=1d`, {
      cache: "no-store",
    })
      .then((r) => r.json())
      .then((q) => {
        const qdata = q?.quotes?.[0] ?? null;
        setQuote(qdata);
        setHistory(qdata?.series ?? []);
      })
      .catch(() => {
        /* la gráfica simplemente no se mostrará */
      });

    Promise.allSettled([finP, quoteP]).finally(() => setLoading(false));
  }, [symbol]);

  if (loading) {
    return (
      <main className="container">
        <div className="skeleton" style={{ height: 200, marginTop: 24 }} />
        <div className="skeleton" style={{ height: 120, marginTop: 16 }} />
        <div className="skeleton" style={{ height: 300, marginTop: 16 }} />
      </main>
    );
  }

  // Perfil: usa datos en vivo si llegaron, si no cae al perfil estático.
  const profile = financials?.profile;
  const up = (quote?.changePct ?? 0) >= 0;

  const chartData = history.map((p) => ({
    t: new Date(p.t * 1000).toLocaleDateString("es-CO", {
      month: "short",
      day: "numeric",
    }),
    price: p.c,
  }));

  return (
    <main className="container">
      <div style={{ marginBottom: 8 }}>
        <Link href="/company" className="back-link">
          ← Compañías
        </Link>
      </div>

      {/* Header */}
      <div className="company-header card">
        <div className="ch-left">
          <div className="ch-sym">{symbol}</div>
          <div className="ch-name">{financials?.name ?? staticName}</div>
          {profile?.sector ? (
            <div className="ch-meta">
              {profile.sector}
              {profile.industry ? ` · ${profile.industry}` : ""}
              {profile.country ? ` · ${profile.country}` : ""}
            </div>
          ) : staticProfile ? (
            <div className="ch-meta">{staticProfile.tickerType}</div>
          ) : null}
          {profile?.website && (
            <a
              href={profile.website}
              target="_blank"
              rel="noopener noreferrer"
              className="ch-web"
            >
              {profile.website}
            </a>
          )}
        </div>
        {quote && (
          <div className="ch-right">
            <div className="ch-price">${quote.price.toFixed(2)}</div>
            <div className={`ch-change ${up ? "up" : "down"}`}>
              {up ? "+" : ""}
              {quote.change.toFixed(2)} ({up ? "+" : ""}
              {quote.changePct.toFixed(2)}%)
            </div>
            <div className="ch-state">{quote.marketState} · {quote.exchange}</div>
          </div>
        )}
      </div>

      {/* Price chart */}
      <section>
        <h2 className="section-title">Precio histórico (3 meses)</h2>
        {chartData.length > 0 ? (
          <div className="card" style={{ padding: "16px 8px 8px" }}>
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="cg" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#4c8dff" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#4c8dff" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="t"
                  tick={{ fill: "#8b90a0", fontSize: 10 }}
                  tickLine={false}
                  axisLine={false}
                  interval="preserveStartEnd"
                />
                <YAxis
                  tick={{ fill: "#8b90a0", fontSize: 10 }}
                  tickLine={false}
                  axisLine={false}
                  domain={["auto", "auto"]}
                  tickFormatter={(v) => `$${v.toFixed(0)}`}
                  width={55}
                />
                <Tooltip
                  contentStyle={{
                    background: "#14161c",
                    border: "1px solid #262a35",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                  formatter={(v: number) => [`$${v.toFixed(2)}`, "Precio"]}
                />
                <Area
                  type="monotone"
                  dataKey="price"
                  stroke="#4c8dff"
                  strokeWidth={2}
                  fill="url(#cg)"
                  dot={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="note">
            No hay datos de precio en vivo disponibles ahora mismo. La cotización en
            tiempo real requiere <code>FMP_API_KEY</code> configurada en Vercel
            (Yahoo bloquea las IPs de servidor). El pronóstico de abajo y el perfil
            no se ven afectados.
          </div>
        )}
      </section>

      {/* Per-asset forecast across portfolios (datos estáticos, siempre disponible) */}
      <AssetForecast symbol={symbol} />

      {/* Estados financieros en vivo (solo si la fuente respondió) */}
      {finError && (
        <div className="note fin-error-note">
          {finError.includes("FMP_API_KEY no está configurada") ? (
            <>
              <strong>FMP_API_KEY no llega al servidor.</strong> Pasos para arreglarlo:
              <ol style={{ margin: "8px 0 0", paddingLeft: 20, lineHeight: 1.8 }}>
                <li>Ve a <strong>Vercel → tu proyecto → Settings → Environment Variables</strong></li>
                <li>Agrega <code>FMP_API_KEY</code> con tu clave de financialmodelingprep.com</li>
                <li>Marca los <strong>3 entornos</strong>: Production, Preview, Development</li>
                <li>Guarda y redespliega (<strong>Deployments → ⋯ → Redeploy</strong>)</li>
                <li>Verifica en <code>/api/health</code> que la clave llega y funciona</li>
              </ol>
            </>
          ) : (
            <>
              Estados financieros de <strong>{symbol}</strong> no disponibles.{" "}
              <span style={{ opacity: 0.7 }}>{finError}</span>
            </>
          )}
        </div>
      )}

      {financials && (() => {
        const { keyStats, income, balanceSheet, cashFlow } = financials;
        return (
      <>
      {/* Key Stats */}
      <section>
        <h2 className="section-title">Métricas clave</h2>
        <div className="stats-grid">
          <StatCard label="Cap. de Mercado" value={fmt$(keyStats.marketCap)} />
          <StatCard label="Valor Empresa (EV)" value={fmt$(keyStats.enterpriseValue)} />
          <StatCard label="P/E (trailing)" value={fmtX(keyStats.peRatio)} />
          <StatCard label="P/E (forward)" value={fmtX(keyStats.forwardPE)} />
          <StatCard label="P/B" value={fmtX(keyStats.pbRatio)} />
          <StatCard label="P/S" value={fmtX(keyStats.psRatio)} />
          <StatCard label="EV/EBITDA" value={fmtX(keyStats.evToEbitda)} />
          <StatCard label="Beta" value={keyStats.beta != null ? keyStats.beta.toFixed(2) : "N/A"} />
          <StatCard
            label="ROE"
            value={fmtPct(keyStats.returnOnEquity)}
            color={
              keyStats.returnOnEquity != null
                ? keyStats.returnOnEquity > 0
                  ? "green"
                  : "red"
                : undefined
            }
          />
          <StatCard
            label="ROA"
            value={fmtPct(keyStats.returnOnAssets)}
            color={
              keyStats.returnOnAssets != null
                ? keyStats.returnOnAssets > 0
                  ? "green"
                  : "red"
                : undefined
            }
          />
          <StatCard label="Dividend Yield" value={keyStats.dividendYield != null ? fmtPct(keyStats.dividendYield) : "N/A"} />
          {financials.profile.employees != null && (
            <StatCard
              label="Empleados"
              value={financials.profile.employees.toLocaleString("es-CO")}
            />
          )}
        </div>
      </section>

      {/* Income Statement */}
      <section>
        <h2 className="section-title">Estado de Resultados (TTM)</h2>
        <div className="stats-grid">
          <StatCard label="Ingresos" value={fmt$(income.revenue)} />
          <StatCard label="Utilidad Bruta" value={fmt$(income.grossProfit)} />
          <StatCard label="EBIT" value={fmt$(income.ebit)} />
          <StatCard label="EBITDA" value={fmt$(income.ebitda)} />
          <StatCard label="Utilidad Neta" value={fmt$(income.netIncome)} />
          <StatCard
            label="Margen Bruto"
            value={fmtPct(income.grossMargin)}
            color={income.grossMargin != null ? "green" : undefined}
          />
          <StatCard
            label="Margen Operativo"
            value={fmtPct(income.operatingMargin)}
            color={
              income.operatingMargin != null
                ? income.operatingMargin > 0
                  ? "green"
                  : "red"
                : undefined
            }
          />
          <StatCard
            label="Margen Neto"
            value={fmtPct(income.netMargin)}
            color={
              income.netMargin != null
                ? income.netMargin > 0
                  ? "green"
                  : "red"
                : undefined
            }
          />
          <StatCard
            label="Crecimiento Ingresos"
            value={fmtPct(income.revenueGrowth)}
            color={
              income.revenueGrowth != null
                ? income.revenueGrowth > 0
                  ? "green"
                  : "red"
                : undefined
            }
          />
          <StatCard
            label="Crecimiento Utilidad"
            value={fmtPct(income.earningsGrowth)}
            color={
              income.earningsGrowth != null
                ? income.earningsGrowth > 0
                  ? "green"
                  : "red"
                : undefined
            }
          />
        </div>
      </section>

      {/* Balance Sheet */}
      <section>
        <h2 className="section-title">Balance General</h2>
        <div className="stats-grid">
          <StatCard label="Activos Totales" value={fmt$(balanceSheet.totalAssets)} />
          <StatCard label="Deuda Total" value={fmt$(balanceSheet.totalDebt)} />
          <StatCard label="Efectivo y Equiv." value={fmt$(balanceSheet.cashAndEquivalents)} />
          <StatCard
            label="Deuda Neta"
            value={fmt$(balanceSheet.netDebt)}
            color={
              balanceSheet.netDebt != null
                ? balanceSheet.netDebt < 0
                  ? "green"
                  : "red"
                : undefined
            }
          />
          <StatCard label="Razón de Deuda/Equity" value={balanceSheet.debtToEquity != null ? balanceSheet.debtToEquity.toFixed(2) : "N/A"} />
          <StatCard label="Razón Corriente" value={fmtX(balanceSheet.currentRatio)} />
          <StatCard label="Razón Rápida" value={fmtX(balanceSheet.quickRatio)} />
        </div>
      </section>

      {/* Cash Flow */}
      <section>
        <h2 className="section-title">Flujo de Caja (TTM)</h2>
        <div className="stats-grid">
          <StatCard label="FCO (Operativo)" value={fmt$(cashFlow.operatingCashFlow)} color="green" />
          <StatCard label="CAPEX" value={fmt$(cashFlow.capitalExpenditures)} />
          <StatCard
            label="Flujo de Caja Libre"
            value={fmt$(cashFlow.freeCashFlow)}
            color={
              cashFlow.freeCashFlow != null
                ? cashFlow.freeCashFlow > 0
                  ? "green"
                  : "red"
                : undefined
            }
          />
        </div>
      </section>
      </>
        );
      })()}

      {/* Mission & Vision (datos estáticos: siempre disponible) */}
      {(() => {
        const mission = profile?.mission ?? staticProfile?.mission;
        const vision = profile?.vision ?? staticProfile?.vision;
        const founded = profile?.founded ?? staticProfile?.founded;
        const hq = profile?.hq ?? staticProfile?.hq;
        if (!mission && !vision) return null;
        return (
          <section>
            <h2 className="section-title">Perfil corporativo</h2>
            <div className="profile-grid">
              <div className="profile-card card">
                <div className="profile-icon">🎯</div>
                <h3>Misión</h3>
                <p>{mission}</p>
              </div>
              <div className="profile-card card">
                <div className="profile-icon">🔭</div>
                <h3>Visión</h3>
                <p>{vision}</p>
              </div>
            </div>
            {profile?.description && (
              <div className="card" style={{ marginTop: 16, padding: 20 }}>
                <div className="section-title" style={{ marginBottom: 10 }}>
                  Descripción de la empresa
                </div>
                <p style={{ fontSize: 13, lineHeight: 1.7, color: "var(--text-dim)", margin: 0 }}>
                  {profile.description}
                </p>
              </div>
            )}
            <div className="card" style={{ marginTop: 16, padding: 16 }}>
              <div className="chips-row">
                {founded && founded !== "N/A" && (
                  <span className="chip">📅 Fundada: {founded}</span>
                )}
                {hq && hq !== "N/A" && <span className="chip">📍 {hq}</span>}
                {profile?.sector && <span className="chip">🏭 {profile.sector}</span>}
                {profile?.industry && (
                  <span className="chip">⚙️ {profile.industry}</span>
                )}
              </div>
            </div>
          </section>
        );
      })()}

      <footer>
        Datos en vivo: Financial Modeling Prep (o Yahoo Finance como respaldo) ·
        Financieros TTM (últimos 12 meses) · Pronósticos: ensamble validado con
        Monte Carlo · Solo con fines educativos, no constituye asesoría de inversión.
      </footer>
    </main>
  );
}
