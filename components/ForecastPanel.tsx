"use client";

import { useEffect, useState } from "react";
import {
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import type { ForecastResults, PortfolioForecast } from "@/lib/types";
import { buildForecastSeries } from "@/lib/forecast";
import HorizonTabs from "@/components/HorizonTabs";

const PROB_LABELS: Record<string, string> = {
  P_positivo: "Prob. retorno positivo",
  P_ret_mayor_5pct: "Prob. > +5%",
  "P_ret_menor_-5pct": "Prob. < −5%",
  P_supera_rf: "Prob. supera tasa libre de riesgo",
};

function pct(x: number) {
  return `${(x * 100).toFixed(1)}%`;
}

function ForecastChart({ p, horizon }: { p: PortfolioForecast; horizon: number }) {
  const { data } = buildForecastSeries(
    p.ensemble.last_price,
    p.ensemble_forecast,
    p.monte_carlo.bands,
    horizon
  );
  // hi = lo + outer (upper bound of uncertainty band)
  const chartData = data.map((pt) => ({ ...pt, hi: pt.lo + pt.outer }));

  return (
    <ResponsiveContainer width="100%" height={180}>
      <ComposedChart data={chartData} margin={{ top: 8, right: 10, left: -16, bottom: 0 }}>
        <defs>
          <linearGradient id="bandGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#4c8dff" stopOpacity={0.4} />
            <stop offset="100%" stopColor="#4c8dff" stopOpacity={0.08} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="rgba(255,255,255,0.05)" strokeDasharray="2 5" vertical={false} />
        <XAxis
          dataKey="d"
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
          width={48}
          tickFormatter={(v) => `$${Math.round(v)}`}
        />
        <Tooltip
          contentStyle={{
            background: "rgba(20,22,28,0.92)",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 10,
            fontSize: 12,
            backdropFilter: "blur(8px)",
          }}
          labelFormatter={(d) => `Día +${d}`}
          formatter={(v: number, n) => {
            if (n === "ens") return [`$${v.toFixed(2)}`, "Ensamble"];
            return null as unknown as [string, string];
          }}
        />
        {/* hi area with gradient — renders behind (full band from baseline to hi) */}
        <Area dataKey="hi" stroke="none" fill="url(#bandGrad)" legendType="none" isAnimationActive={false} />
        {/* lo area covers baseline-to-lo with card color, leaving only the band visible */}
        <Area dataKey="lo" stroke="none" fill="#14161c" legendType="none" isAnimationActive={false} />
        {/* Ensemble line on top */}
        <Line type="monotone" dataKey="ens" stroke="#2ec16e" strokeWidth={2.5} dot={false} isAnimationActive={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

function PortfolioCard({
  name,
  p,
  horizon,
}: {
  name: string;
  p: PortfolioForecast;
  horizon: number;
}) {
  const mc = p.monte_carlo;
  const probs = mc.probabilities;
  const series = buildForecastSeries(
    p.ensemble.last_price,
    p.ensemble_forecast,
    p.monte_carlo.bands,
    horizon
  );
  const up = series.endpointReturnPct >= 0;

  return (
    <div className="card fc-card">
      <div className="fc-head">
        <h3>{name}</h3>
        <span className="badge">Sharpe {p.composition.sharpe.toFixed(2)}</span>
      </div>

      <ForecastChart p={p} horizon={horizon} />

      {series.isExtrapolated && (
        <div className="fc-extrap-tag">
          Pronóstico del modelo: {series.modelHorizon}d · más allá = proyección
          extendida (extrapolación)
        </div>
      )}

      <div className="metrics">
        <div className="metric">
          <div className="label">Ensamble {horizon}d</div>
          <div className={`val ${up ? "up" : "down"}`}>
            {up ? "+" : ""}
            {series.endpointReturnPct.toFixed(2)}%
          </div>
        </div>
        <div className="metric">
          <div className="label">VaR 95% · 21d</div>
          <div className="val down">{mc.VaR_95_pct.toFixed(1)}%</div>
        </div>
        <div className="metric">
          <div className="label">CVaR 95% · 21d</div>
          <div className="val down">{mc.CVaR_95_pct.toFixed(1)}%</div>
        </div>
      </div>

      {["P_positivo", "P_ret_mayor_5pct", "P_supera_rf"].map((k) =>
        probs[k] != null ? (
          <div className="prob-bar" key={k}>
            <div className="label">
              <span>{PROB_LABELS[k] ?? k}</span>
              <span>{pct(probs[k])}</span>
            </div>
            <div className="bar">
              <span
                style={{ transform: `scaleX(${Math.min(1, Math.max(0, probs[k]))})` }}
              />
            </div>
          </div>
        ) : null
      )}

      <div className="weights">
        {Object.entries(p.ensemble.weights).map(([m, w]) => (
          <span className="chip" key={m}>
            {m} {(w * 100).toFixed(0)}%
          </span>
        ))}
      </div>
      <div className="weights">
        {Object.entries(p.composition.weights).map(([t, w]) => (
          <span className="chip" key={t} style={{ color: "var(--text)" }}>
            {t} {(w * 100).toFixed(0)}%
          </span>
        ))}
      </div>
    </div>
  );
}

export default function ForecastPanel() {
  const [data, setData] = useState<ForecastResults | null>(null);
  const [horizon, setHorizon] = useState(21); // Mes por defecto

  useEffect(() => {
    fetch("/api/forecast")
      .then((r) => r.json())
      .then(setData)
      .catch(() => setData(null));
  }, []);

  if (!data) {
    return (
      <section>
        <h2 className="section-title">
          Pronósticos ensamblados · validación Monte Carlo
        </h2>
        <div className="fc-grid">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="card skeleton" style={{ height: 420 }} />
          ))}
        </div>
      </section>
    );
  }

  return (
    <section>
      <h2 className="section-title">
        Pronósticos ensamblados (Prophet · ARIMAX · XGBoost · Holt-Winters) ·{" "}
        {data.meta.n_sims.toLocaleString()} simulaciones Monte Carlo
      </h2>
      <div className="fc-toolbar">
        <span className="fc-toolbar-label">Horizonte del pronóstico</span>
        <HorizonTabs value={horizon} onChange={setHorizon} />
      </div>
      <div className="fc-grid">
        {Object.entries(data.portfolios).map(([name, p]) => (
          <PortfolioCard key={name} name={name} p={p} horizon={horizon} />
        ))}
      </div>
      {data.meta.data_mode === "synthetic" && (
        <div className="note" style={{ marginTop: 16 }}>
          ⚠️ Datos de demostración generados con un modelo sintético (GBM
          correlacionado), porque el entorno de build no tiene acceso a Yahoo.
          Para datos reales: ejecuta <code>research/ensemble_forecast.py</code> en
          Colab y reemplaza <code>data/forecast_results.json</code>.
        </div>
      )}
    </section>
  );
}
