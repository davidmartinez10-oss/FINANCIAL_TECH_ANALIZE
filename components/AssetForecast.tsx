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
import type { AssetForecastResponse, AssetForecastEntry } from "@/lib/types";
import { buildForecastSeries } from "@/lib/forecast";
import HorizonTabs from "@/components/HorizonTabs";

function EntryChart({ e, horizon }: { e: AssetForecastEntry; horizon: number }) {
  const { data } = buildForecastSeries(
    e.last_price,
    e.ensemble_forecast,
    e.monte_carlo.bands,
    horizon
  );

  return (
    <ResponsiveContainer width="100%" height={160}>
      <AreaChart data={data} margin={{ top: 8, right: 10, left: -16, bottom: 0 }}>
        <defs>
          <linearGradient id={`ag-${e.portfolio}`} x1="0" y1="0" x2="0" y2="1">
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
          formatter={(v: number, n) =>
            n === "ens"
              ? [`$${v.toFixed(2)}`, "Ensamble"]
              : (null as unknown as [string, string])
          }
        />
        <Area dataKey="lo" stackId="b" stroke="none" fill="none" isAnimationActive={false} />
        <Area
          dataKey="outer"
          stackId="b"
          stroke="none"
          fill={`url(#ag-${e.portfolio})`}
          isAnimationActive={false}
        />
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

function EntryCard({ e, horizon }: { e: AssetForecastEntry; horizon: number }) {
  const mc = e.monte_carlo;
  const probPos = mc.probabilities["P_positivo"];
  const series = buildForecastSeries(
    e.last_price,
    e.ensemble_forecast,
    e.monte_carlo.bands,
    horizon
  );
  const up = series.endpointReturnPct >= 0;

  return (
    <div className="card fc-card reveal">
      <div className="fc-head">
        <h3>{e.portfolioLabel}</h3>
        <span className="badge">Peso {(e.weight * 100).toFixed(1)}%</span>
      </div>

      <EntryChart e={e} horizon={horizon} />

      {series.isExtrapolated && (
        <div className="fc-extrap-tag">
          Modelo: {series.modelHorizon}d · más allá = proyección extendida
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
          <div className="label">Prob. + · 21d</div>
          <div className="val accent">
            {probPos != null ? `${(probPos * 100).toFixed(0)}%` : "N/A"}
          </div>
        </div>
      </div>

      <div className="weights">
        {Object.entries(e.ensemble_weights).map(([m, w]) => (
          <span className="chip" key={m}>
            {m} {(w * 100).toFixed(0)}%
          </span>
        ))}
      </div>
    </div>
  );
}

export default function AssetForecast({ symbol }: { symbol: string }) {
  const [data, setData] = useState<AssetForecastResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [horizon, setHorizon] = useState(21);

  useEffect(() => {
    if (!symbol) return;
    setLoading(true);
    fetch(`/api/asset-forecast?symbol=${symbol}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setData(d))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [symbol]);

  if (loading) {
    return (
      <section>
        <h2 className="section-title">Pronóstico del activo en los portafolios</h2>
        <div className="fc-grid">
          {[1, 2].map((i) => (
            <div key={i} className="card skeleton" style={{ height: 340 }} />
          ))}
        </div>
      </section>
    );
  }

  if (!data || data.forecast_data.length === 0) {
    return (
      <section>
        <h2 className="section-title">Pronóstico del activo en los portafolios</h2>
        <div className="note">
          {symbol} no forma parte de la composición optimizada de ningún
          portafolio en el ejercicio actual, por lo que no tiene un pronóstico
          ensamblado asociado. Los pronósticos se calculan a nivel de portafolio
          (NAV ponderado) en <code>research/ensemble_forecast.py</code>.
        </div>
      </section>
    );
  }

  return (
    <section>
      <h2 className="section-title">
        Pronóstico del activo · presente en {data.forecast_data.length}{" "}
        {data.forecast_data.length === 1 ? "portafolio" : "portafolios"}
      </h2>
      <div className="fc-toolbar">
        <span className="fc-toolbar-label">Horizonte del pronóstico</span>
        <HorizonTabs value={horizon} onChange={setHorizon} />
      </div>
      <div className="fc-grid">
        {data.forecast_data.map((e) => (
          <EntryCard key={e.portfolio} e={e} horizon={horizon} />
        ))}
      </div>
      <div className="note" style={{ marginTop: 14 }}>
        Estos pronósticos reflejan la trayectoria del NAV del portafolio donde{" "}
        {symbol} participa con el peso indicado, no del precio aislado del activo.
        Ensamble Prophet · ARIMAX · XGBoost · Holt-Winters validado con 10.000
        simulaciones Monte Carlo.
      </div>
    </section>
  );
}
