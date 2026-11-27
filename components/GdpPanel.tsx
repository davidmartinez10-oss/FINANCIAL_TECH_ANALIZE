"use client";

import { useEffect, useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { GdpResponse } from "@/lib/types";
import { fmtNum, fmtPct, fmtTrillions } from "@/lib/format";
import { AXIS_TICK, INK, SERIES, TOOLTIP_STYLE } from "@/lib/chart-theme";

// Color fijo por entidad (no cambia al filtrar). Colombia, la serie de
// referencia, usa la tinta principal en lugar de un tono.
const COLOR: Record<string, string> = {
  USA: SERIES.blue,
  CHN: SERIES.orange,
  EUU: SERIES.aqua,
  JPN: SERIES.yellow,
  DEU: SERIES.magenta,
  IND: SERIES.green,
  GBR: SERIES.violet,
  RUS: SERIES.red,
};
const DEFAULT_SEL = ["USA", "CHN", "EUU", "IND"];

// Etiqueta directa en el último punto de cada línea.
function endLabel(name: string, lastIndex: number) {
  // eslint-disable-next-line react/display-name
  return (props: any) => {
    if (props.index !== lastIndex || props.value == null) return <g />;
    return (
      <text x={props.x + 8} y={props.y} dy={4} fill={INK.primary} fontSize={11}>
        {name}
      </text>
    );
  };
}

export default function GdpPanel() {
  const [data, setData] = useState<GdpResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [sel, setSel] = useState<string[]>(DEFAULT_SEL);

  useEffect(() => {
    fetch("/api/gdp", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="skeleton" style={{ height: 420, borderRadius: 16 }} />;
  }
  if (!data || data.latestYear == null) {
    return (
      <div className="note">
        No se pudo consultar el Banco Mundial en este momento.
        {data?.errors?.length ? ` (${data.errors[0]})` : ""}
      </div>
    );
  }

  const name = (iso: string) => data.countries.find((c) => c.iso3 === iso)?.name ?? iso;
  const powers = data.countries.filter((c) => c.role === "potencia");
  const active = powers.filter((c) => sel.includes(c.iso3));
  const toggle = (iso: string) =>
    setSel((s) => (s.includes(iso) ? s.filter((x) => x !== iso) : [...s, iso]));
  const lastGrowth = data.growthSeries.length - 1;
  const col = data.countries.find((c) => c.iso3 === "COL");

  return (
    <div className="gdp-wrap">
      <div className="card gdp-table-card">
        <table className="sd-table gdp-table">
          <thead>
            <tr>
              <th>Economía</th>
              <th className="num">PIB {data.latestYear} · billones de USD</th>
              <th className="num">Crecimiento real</th>
              <th className="num">PIB per cápita</th>
              <th className="num">Veces el PIB de Colombia</th>
              <th className="num">Colombia como % de su PIB</th>
            </tr>
          </thead>
          <tbody>
            {data.countries.map((c) => (
              <tr key={c.iso3} className={c.role === "base" ? "gdp-base" : ""}>
                <td>
                  <span className="gdp-flag">{c.flag}</span> {c.name}
                  {c.role === "par" && <span className="gdp-tag">par regional</span>}
                  {c.year !== data.latestYear && c.gdpUsd != null && (
                    <span className="gdp-tag">dato {c.year}</span>
                  )}
                </td>
                <td className="num">{fmtTrillions(c.gdpUsd)}</td>
                <td className={`num ${c.growthPct == null ? "" : c.growthPct >= 0 ? "up" : "down"}`}>
                  {fmtPct(c.growthPct, 1)}
                </td>
                <td className="num">
                  {c.perCapitaUsd == null ? "—" : `US$${fmtNum(c.perCapitaUsd, 0)}`}
                </td>
                <td className="num">
                  {c.role === "base" || c.multiple == null ? "—" : `${fmtNum(c.multiple, 1)}×`}
                </td>
                <td className="num">
                  {c.role === "base" || c.colombiaSharePct == null
                    ? "—"
                    : `${fmtNum(c.colombiaSharePct, 2)} %`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="sector-tabs" style={{ margin: "18px 0 14px" }} role="group" aria-label="Potencias a graficar">
        {powers.map((c) => (
          <button
            key={c.iso3}
            className={`sector-tab${sel.includes(c.iso3) ? " active" : ""}`}
            aria-pressed={sel.includes(c.iso3)}
            onClick={() => toggle(c.iso3)}
          >
            <span className="gdp-key" style={{ background: COLOR[c.iso3] }} />
            {c.name}
          </button>
        ))}
      </div>

      <div className="gdp-charts">
        <div className="card">
          <div className="cm-bench-title">PIB de Colombia como % del PIB de cada potencia</div>
          <div className="cm-bench-sub">USD corrientes · una línea que sube indica que Colombia gana tamaño relativo · último valor en la tabla</div>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={data.ratioSeries} margin={{ top: 12, right: 16, bottom: 0, left: 0 }}>
              <CartesianGrid stroke={INK.grid} vertical={false} />
              <XAxis dataKey="year" tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: INK.axis }} />
              <YAxis
                tick={AXIS_TICK}
                tickLine={false}
                axisLine={false}
                width={52}
                tickFormatter={(v: number) => `${fmtNum(v, 1)} %`}
              />
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                cursor={{ stroke: INK.axis }}
                formatter={(v, k) => [`${fmtNum(Number(v), 2)} %`, name(String(k))]}
              />
              <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} formatter={(k) => <span style={{ color: INK.secondary }}>{name(String(k))}</span>} iconType="plainline" />
              {active.map((c) => (
                <Line
                  key={c.iso3}
                  dataKey={c.iso3}
                  type="monotone"
                  stroke={COLOR[c.iso3]}
                  strokeWidth={2}
                  dot={false}
                  connectNulls
                  isAnimationActive={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="card">
          <div className="cm-bench-title">Crecimiento real del PIB</div>
          <div className="cm-bench-sub">% anual · Colombia en blanco como referencia</div>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={data.growthSeries} margin={{ top: 12, right: 80, bottom: 0, left: 0 }}>
              <CartesianGrid stroke={INK.grid} vertical={false} />
              <XAxis dataKey="year" tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: INK.axis }} />
              <YAxis
                tick={AXIS_TICK}
                tickLine={false}
                axisLine={false}
                width={44}
                tickFormatter={(v: number) => `${fmtNum(v, 0)} %`}
              />
              <ReferenceLine y={0} stroke={INK.axis} />
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                cursor={{ stroke: INK.axis }}
                formatter={(v, k) => [fmtPct(Number(v), 1), name(String(k))]}
              />
              <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} formatter={(k) => <span style={{ color: INK.secondary }}>{name(String(k))}</span>} iconType="plainline" />
              {active.map((c) => (
                <Line
                  key={c.iso3}
                  dataKey={c.iso3}
                  type="monotone"
                  stroke={COLOR[c.iso3]}
                  strokeWidth={1.5}
                  dot={false}
                  connectNulls
                  isAnimationActive={false}
                />
              ))}
              <Line
                dataKey="COL"
                type="monotone"
                stroke={INK.primary}
                strokeWidth={2.5}
                dot={false}
                connectNulls
                isAnimationActive={false}
                label={endLabel("Colombia", lastGrowth)}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="sd-foot">
        Fuente: {data.source}. Último año con dato para Colombia: {data.latestYear}
        {col?.gdpUsd ? ` (US$${fmtTrillions(col.gdpUsd)} billones)` : ""}. Un billón = 10¹².
        La comparación usa dólares corrientes, por lo que también refleja la tasa de cambio.
        {data.errors.length > 0 && ` Series no disponibles: ${data.errors.join(" · ")}.`}
      </div>
    </div>
  );
}
