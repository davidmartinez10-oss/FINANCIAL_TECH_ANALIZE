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
  const p95 = p.monte_carlo.bands["P95"];
  const p50 = p.monte_carlo.bands["P50"];

  // Construye la serie: día 0 = precio actual, luego horizonte de forecast.
  // Las bandas MC se interpolan linealmente desde P0 hasta los percentiles
  // terminales para dar una envolvente de incertidumbre creciente.
  const H = fc.length;
  const data = [{ d: 0, ens: P0, lo: P0, hi: P0 }];
  for (let i = 0; i < H; i++) {
    const frac = (i + 1) / H;
    data.push({
      d: i + 1,
      ens: fc[i],
      lo: P0 + (p5 - P0) * frac,
      hi: P0 + (p95 - P0) * frac,
    });
  }

  return (
    <ResponsiveContainer width="100%" height={170}>
      <AreaChart data={data} margin={{ top: 6, right: 8, left: -18, bottom: 0 }}>
        <CartesianGrid stroke="#262a35" strokeDasharray="2 4" />
        <XAxis
          dataKey="d"
          tick={{ fill: "#8b90a0", fontSize: 10 }}
          tickLine={false}
          label={{ value: "días", position: "insideBottomRight", fill: "#8b90a0", fontSize: 10 }}
        />
        <YAxis
          tick={{ fill: "#8b90a0", fontSize: 10 }}
          tickLine={false}
          domain={["auto", "auto"]}
          width={48}
        />
        <Tooltip
          contentStyle={{
            background: "#14161c",
            border: "1px solid #262a35",
            borderRadius: 8,
            fontSize: 12,
          }}
          labelFormatter={(d) => `Día +${d}`}
          formatter={(v: number, n) => [
            v.toFixed(2),
            n === "ens" ? "Ensamble" : n === "hi" ? "P95 (MC)" : "P5 (MC)",
          ]}
        />
        <Area
          dataKey="hi"
          stroke="none"
          fill="#4c8dff"
          fillOpacity={0.08}
          isAnimationActive={false}
        />
        <Area
          dataKey="lo"
          stroke="none"
          fill="#0a0b0e"
          fillOpacity={1}
          isAnimationActive={false}
        />
        <Line
          dataKey="ens"
          stroke="#2ec16e"
          strokeWidth={2}
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
