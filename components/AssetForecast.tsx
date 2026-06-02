"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  ReferenceLine,
  Legend,
} from "recharts";
import type { LiveAssetForecast } from "@/lib/types";
import HorizonTabs from "@/components/HorizonTabs";

const MODEL_COLORS: Record<string, string> = {
  Prophet: "#c084fc",
  ARIMAX: "#4c8dff",
  XGBoost: "#f5c451",
  "Holt-Winters": "#2dd4bf",
};

function pct(x: number, d = 1) {
  return `${(x * 100).toFixed(d)}%`;
}
function money(x: number) {
  return `$${x.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}

function buildChartData(f: LiveAssetForecast) {
  const hist = f.history;
  const H = f.horizon;
  const P0 = f.last_price;
  const b = f.monte_carlo.bands;
  const relHi = b.P50 > 0 ? b.P95 / b.P50 : 1;
  const relLo = b.P50 > 0 ? b.P5 / b.P50 : 1;

  type Row = Record<string, number | null> & { x: number };
  const rows: Row[] = [];

  hist.forEach((p, i) => {
    rows.push({
      x: i,
      hist: p.c,
      ens: null,
      Prophet: null,
      ARIMAX: null,
      XGBoost: null,
      "Holt-Winters": null,
      bandLo: null,
      bandHi: null,
    } as Row);
  });

  const boundary = hist.length - 1;
  // Punto de unión: el día 0 del pronóstico = último precio real.
  if (rows.length) {
    const last = rows[rows.length - 1];
    last.ens = P0;
    last.Prophet = P0;
    last.ARIMAX = P0;
    last.XGBoost = P0;
    last["Holt-Winters"] = P0;
    last.bandLo = P0;
    last.bandHi = P0;
  }

  for (let h = 1; h <= H; h++) {
    const s = Math.sqrt(h / H);
    const ens = f.ensemble_forecast[h - 1] ?? P0;
    const hi = ens * Math.pow(relHi, s);
    const lo = ens * Math.pow(relLo, s);
    const row: Row = {
      x: boundary + h,
      hist: null,
      ens,
      bandLo: lo,
      bandHi: hi,
    } as Row;
    for (const m of f.models) row[m.name] = m.forecast[h - 1] ?? null;
    rows.push(row);
  }
  return { rows, boundary };
}

function MetricBlock({
  label,
  value,
  tone,
  sub,
}: {
  label: string;
  value: string;
  tone?: "up" | "down" | "accent";
  sub?: string;
}) {
  return (
    <div className="metric">
      <div className="label">{label}</div>
      <div className={`val ${tone ?? ""}`}>{value}</div>
      {sub && <div className="metric-sub">{sub}</div>}
    </div>
  );
}

export default function AssetForecast({ symbol }: { symbol: string }) {
  const [data, setData] = useState<LiveAssetForecast | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [horizon, setHorizon] = useState(21);

  useEffect(() => {
    if (!symbol) return;
    setLoading(true);
    setError(null);
    fetch(`/api/asset-forecast?symbol=${symbol}&horizon=${horizon}`)
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error ?? "Error de pronóstico");
        return j as LiveAssetForecast;
      })
      .then((d) => setData(d))
      .catch((e) => {
        setData(null);
        setError(String(e.message ?? e));
      })
      .finally(() => setLoading(false));
  }, [symbol, horizon]);

  const chart = useMemo(() => (data ? buildChartData(data) : null), [data]);

  if (loading && !data) {
    return (
      <section>
        <h2 className="section-title">Pronóstico del precio · modelos individuales + Monte Carlo</h2>
        <div className="card skeleton" style={{ height: 460 }} />
      </section>
    );
  }

  if (error || !data || !chart) {
    return (
      <section>
        <h2 className="section-title">Pronóstico del precio</h2>
        <div className="note">
          No se pudo calcular el pronóstico de <strong>{symbol}</strong>.{" "}
          {error ?? "Datos insuficientes."}
        </div>
      </section>
    );
  }

  const mc = data.monte_carlo;
  const v = data.validity;
  const endRet = mc.ensemble_return_pct;
  const up = endRet >= 0;
  const probs = mc.probabilities;

  return (
    <section className="asset-fc">
      <div className="afc-header">
        <div>
          <h2 className="section-title" style={{ margin: 0 }}>
            Pronóstico del precio de {symbol}
          </h2>
          <p className="afc-sub">
            4 modelos independientes · ensamble ponderado por backtest · {mc.n_sims.toLocaleString()}{" "}
            simulaciones Monte Carlo · datos {data.source}
          </p>
        </div>
        <HorizonTabs value={horizon} onChange={setHorizon} />
      </div>

      <div className="card afc-chart-card">
        <div className="afc-chart-top">
          <div>
            <span className="afc-price-label">Último precio</span>
            <span className="afc-price">{money(data.last_price)}</span>
          </div>
          <div className="afc-proj">
            <span className="afc-price-label">Proyección ensamble · {horizon}d</span>
            <span className={`afc-price ${up ? "up" : "down"}`}>
              {money(mc.ensemble_terminal)}{" "}
              <small>
                ({up ? "+" : ""}
                {endRet.toFixed(2)}%)
              </small>
            </span>
          </div>
        </div>

        <ResponsiveContainer width="100%" height={300}>
          <ComposedChart data={chart.rows} margin={{ top: 10, right: 14, left: -8, bottom: 0 }}>
            <defs>
              <linearGradient id="mcBand" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#4c8dff" stopOpacity={0.32} />
                <stop offset="100%" stopColor="#4c8dff" stopOpacity={0.06} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="rgba(255,255,255,0.05)" strokeDasharray="2 6" vertical={false} />
            <XAxis
              dataKey="x"
              tick={{ fill: "#8b90a0", fontSize: 10 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(x) => {
                const d = x - chart.boundary;
                return d === 0 ? "hoy" : d > 0 ? `+${d}` : `${d}`;
              }}
              interval="preserveStartEnd"
            />
            <YAxis
              tick={{ fill: "#8b90a0", fontSize: 10 }}
              tickLine={false}
              axisLine={false}
              domain={["auto", "auto"]}
              width={52}
              tickFormatter={(y) => `$${Math.round(y)}`}
            />
            <Tooltip
              contentStyle={{
                background: "rgba(16,18,24,0.94)",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 12,
                fontSize: 12,
                backdropFilter: "blur(10px)",
              }}
              labelFormatter={(x: number) => {
                const d = x - chart.boundary;
                return d === 0 ? "Hoy" : d > 0 ? `Día +${d}` : `Día ${d}`;
              }}
              formatter={(val: number, name: string) => {
                if (val == null) return null as unknown as [string, string];
                const labels: Record<string, string> = {
                  hist: "Histórico",
                  ens: "Ensamble",
                  bandLo: "Banda P5",
                  bandHi: "Banda P95",
                };
                if (name === "bandLo" || name === "bandHi")
                  return [money(val), labels[name]];
                return [money(val), labels[name] ?? name];
              }}
            />
            <Legend
              wrapperStyle={{ fontSize: 11, paddingTop: 4 }}
              iconType="plainline"
              formatter={(value) => (value === "hist" ? "Histórico" : value === "ens" ? "Ensamble" : value)}
            />
            <ReferenceLine x={chart.boundary} stroke="rgba(255,255,255,0.18)" strokeDasharray="3 3" />

            {/* Banda Monte Carlo P5–P95 */}
            <Area
              dataKey="bandHi"
              stroke="none"
              fill="url(#mcBand)"
              legendType="none"
              connectNulls
              isAnimationActive={false}
            />
            <Area
              dataKey="bandLo"
              stroke="none"
              fill="#14161c"
              legendType="none"
              connectNulls
              isAnimationActive={false}
            />

            {/* Líneas por modelo (finas) */}
            {data.models.map((m) => (
              <Line
                key={m.name}
                type="monotone"
                dataKey={m.name}
                stroke={MODEL_COLORS[m.name] ?? "#888"}
                strokeWidth={1.3}
                strokeOpacity={0.65}
                dot={false}
                connectNulls
                isAnimationActive={false}
              />
            ))}

            {/* Histórico */}
            <Line
              type="monotone"
              dataKey="hist"
              stroke="#e6e8ee"
              strokeWidth={2}
              dot={false}
              connectNulls
              isAnimationActive={false}
            />
            {/* Ensamble (destacado) */}
            <Line
              type="monotone"
              dataKey="ens"
              stroke="#2ec16e"
              strokeWidth={2.6}
              dot={false}
              connectNulls
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Tarjetas por modelo */}
      <div className="afc-models">
        {data.models.map((m) => {
          const term = m.forecast[m.forecast.length - 1] ?? data.last_price;
          const ret = (term / data.last_price - 1) * 100;
          const mUp = ret >= 0;
          return (
            <div className="card afc-model" key={m.name}>
              <div className="afc-model-head">
                <span className="afc-dot" style={{ background: MODEL_COLORS[m.name] }} />
                <span className="afc-model-name">{m.name}</span>
                <span className="afc-weight">{pct(m.weight, 0)}</span>
              </div>
              <div className={`afc-model-ret ${mUp ? "up" : "down"}`}>
                {mUp ? "+" : ""}
                {ret.toFixed(2)}%
              </div>
              <div className="afc-model-foot">
                <span>Objetivo {money(term)}</span>
                <span>Error backtest {m.backtestMAPE.toFixed(1)}%</span>
              </div>
              <div className="afc-weight-bar">
                <span
                  style={{
                    transform: `scaleX(${Math.min(1, m.weight)})`,
                    background: MODEL_COLORS[m.name],
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Validación Monte Carlo */}
      <div className="card afc-mc">
        <div className="afc-mc-title">
          Validación Monte Carlo · {mc.n_sims.toLocaleString()} trayectorias
        </div>
        <div className="metrics afc-mc-grid">
          <MetricBlock
            label="Confianza direccional"
            value={pct(v.direction_confidence, 0)}
            tone="accent"
            sub="MC coincide con el ensamble"
          />
          <MetricBlock
            label="Calibración de banda"
            value={pct(v.band_calibration, 0)}
            tone="accent"
            sub="dentro de ±1σ√H"
          />
          <MetricBlock
            label="Aciertos backtest"
            value={pct(v.backtest_hit_rate, 0)}
            tone={v.backtest_hit_rate >= 0.5 ? "up" : "down"}
            sub="dirección correcta"
          />
          <MetricBlock
            label="Error backtest"
            value={`${v.backtest_mape.toFixed(1)}%`}
            sub="MAPE del ensamble"
          />
          <MetricBlock label="VaR 95%" value={`${mc.VaR_95_pct.toFixed(1)}%`} tone="down" />
          <MetricBlock label="CVaR 95%" value={`${mc.CVaR_95_pct.toFixed(1)}%`} tone="down" />
        </div>

        <div className="afc-probs">
          {[
            ["P_positivo", "Prob. retorno positivo"],
            ["P_ret_mayor_5pct", "Prob. > +5%"],
            ["P_ret_menor_-5pct", "Prob. < −5%"],
            ["P_supera_rf", "Prob. supera tasa libre de riesgo"],
          ].map(([k, label]) =>
            probs[k] != null ? (
              <div className="prob-bar" key={k}>
                <div className="label">
                  <span>{label}</span>
                  <span>{pct(probs[k])}</span>
                </div>
                <div className="bar">
                  <span style={{ transform: `scaleX(${Math.min(1, Math.max(0, probs[k]))})` }} />
                </div>
              </div>
            ) : null
          )}
        </div>
      </div>

      <div className="note afc-disclaimer">
        Pronóstico del <strong>precio de {symbol}</strong> calculado en vivo desde su histórico
        diario ({data.source}). Cada modelo (Prophet, ARIMAX, XGBoost, Holt-Winters) genera una
        trayectoria independiente; el ensamble las pondera según su error de backtest. La banda y las
        probabilidades provienen de {mc.n_sims.toLocaleString()} simulaciones Monte Carlo (GBM con
        deriva y volatilidad históricas). No constituye asesoría de inversión.
      </div>
    </section>
  );
}
