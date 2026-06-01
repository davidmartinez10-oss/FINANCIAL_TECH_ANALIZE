"use client";

import { useEffect, useState } from "react";
import {
  AreaChart,
  Area,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import type { ForecastResults, PortfolioForecast } from "@/lib/types";

const PROB_LABELS: Record<string, string> = {
  P_positivo: "Prob. retorno positivo",
  P_ret_mayor_5pct: "Prob. > +5%",
  "P_ret_menor_-5pct": "Prob. < −5%",
  P_supera_rf: "Prob. supera tasa libre de riesgo",
};

function pct(x: number) {
  return `${(x * 100).toFixed(1)}%`;
}

function ForecastChart({ p }: { p: PortfolioForecast }) {
  const P0 = p.ensemble.last_price;
  const fc = p.ensemble_forecast;
  const p5 = p.monte_carlo.bands["P5"];
  const p25 = p.monte_carlo.bands["P25"];
  const p75 = p.monte_carlo.bands["P75"];
  const p95 = p.monte_carlo.bands["P95"];

  // Serie: día 0 = precio actual, luego horizonte. Las bandas MC (P5–P95 y
  // el rango intercuartílico P25–P75) se interpolan desde P0 hacia los
  // percentiles terminales → envolvente de incertidumbre creciente.
  //
  // Render correcto de banda: se apilan áreas (stackId="band") sobre una base
  // invisible `lo`, de modo que la banda "flota" sin pintar el fondo de la
  // tarjeta (evita el desajuste de color con --panel).
  const H = fc.length;
  const data = [
    { d: 0, ens: P0, lo: P0, outer: 0, iqr: 0 },
  ];
  for (let i = 0; i < H; i++) {
    const frac = (i + 1) / H;
    const lo = P0 + (p5 - P0) * frac;
    const hi = P0 + (p95 - P0) * frac;
    const q1 = P0 + (p25 - P0) * frac;
    const q3 = P0 + (p75 - P0) * frac;
    data.push({
      d: i + 1,
      ens: fc[i],
      lo, // base invisible
      outer: hi - lo, // banda P5–P95
      iqr: q3 - q1, // ancho intercuartílico (informativo en tooltip)
    });
  }

  return (
    <ResponsiveContainer width="100%" height={180}>
      <AreaChart data={data} margin={{ top: 8, right: 10, left: -16, bottom: 0 }}>
        <defs>
          <linearGradient id="bandGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#4c8dff" stopOpacity={0.22} />
            <stop offset="100%" stopColor="#4c8dff" stopOpacity={0.04} />
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
        {/* Base invisible que posiciona la banda */}
        <Area
          dataKey="lo"
          stackId="band"
          stroke="none"
          fill="none"
          isAnimationActive={false}
          legendType="none"
        />
        {/* Banda P5–P95 (incertidumbre Monte Carlo) */}
        <Area
          dataKey="outer"
          stackId="band"
          stroke="none"
          fill="url(#bandGrad)"
          isAnimationActive={false}
        />
        {/* Línea del ensamble */}
        <Line
          type="monotone"
          dataKey="ens"
          stroke="#2ec16e"
          strokeWidth={2.5}
          dot={false}
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

function PortfolioCard({ name, p }: { name: string; p: PortfolioForecast }) {
  const mc = p.monte_carlo;
  const up = mc.ensemble_return_pct >= 0;
  const probs = mc.probabilities;

  return (
    <div className="card fc-card">
      <div className="fc-head">
        <h3>{name}</h3>
        <span className="badge">Sharpe {p.composition.sharpe.toFixed(2)}</span>
      </div>

      <ForecastChart p={p} />

      <div className="metrics">
        <div className="metric">
          <div className="label">Ensamble {p.ensemble.horizon}d</div>
          <div className={`val ${up ? "up" : "down"}`}>
            {up ? "+" : ""}
            {mc.ensemble_return_pct.toFixed(2)}%
          </div>
        </div>
        <div className="metric">
          <div className="label">VaR 95%</div>
          <div className="val down">{mc.VaR_95_pct.toFixed(1)}%</div>
        </div>
        <div className="metric">
          <div className="label">CVaR 95%</div>
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
              <span style={{ width: `${Math.min(100, probs[k] * 100)}%` }} />
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
        {data.meta.n_sims.toLocaleString()} simulaciones Monte Carlo · horizonte{" "}
        {data.meta.horizon_days}d
      </h2>
      <div className="fc-grid">
        {Object.entries(data.portfolios).map(([name, p]) => (
          <PortfolioCard key={name} name={name} p={p} />
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
