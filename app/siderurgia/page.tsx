"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import CommodityPanel from "@/components/CommodityPanel";
import type {
  SteelFigure,
  SteelInput,
  SteelPrices,
  SteelResponse,
  SteelSource,
  TradeRow,
} from "@/lib/types";
import { fmtMonth, fmtNum, fmtPct, fmtUsd, fmtWeight } from "@/lib/format";
import { AXIS_TICK, INK, SERIES, TOOLTIP_STYLE } from "@/lib/chart-theme";

const DEP_LABEL: Record<SteelInput["dependence"], string> = {
  alta: "Alta",
  media: "Media",
  baja: "Baja",
  nula: "Nula",
};

function SourceLink({ id, sources }: { id: string; sources: Map<string, SteelSource> }) {
  const s = sources.get(id);
  if (!s) return null;
  return (
    <a className="sd-src" href={s.url} target="_blank" rel="noopener noreferrer">
      {s.publisher}
    </a>
  );
}

function FactGrid({ facts, sources }: { facts: SteelFigure[]; sources: Map<string, SteelSource> }) {
  return (
    <div className="sd-facts">
      {facts.map((f, i) => (
        <div key={i} className="sd-fact card">
          <div className="sd-fact-label">{f.label}</div>
          <div className="sd-fact-val">{f.value}</div>
          <div className="sd-fact-period">
            {f.period} · <SourceLink id={f.sourceId} sources={sources} />
          </div>
        </div>
      ))}
    </div>
  );
}

function InputCard({
  input,
  rows,
  year,
  sources,
}: {
  input: SteelInput;
  rows: Map<string, TradeRow>;
  year: number | null;
  sources: Map<string, SteelSource>;
}) {
  const y = String(year ?? "");
  return (
    <article className="sd-input card">
      <header className="sd-input-head">
        <div>
          <div className="sd-input-group">{input.group}</div>
          <h3 className="sd-input-name">{input.name}</h3>
        </div>
        <div className={`sd-dep sd-dep-${input.dependence}`}>
          <span className="sd-dep-label">Dependencia de importaciones</span>
          <span className="sd-dep-val">{DEP_LABEL[input.dependence]}</span>
        </div>
      </header>

      <p className="sd-input-note">{input.dependenceNote}</p>

      <div className="sd-input-cols">
        <div>
          <div className="sd-sub">Oferta nacional</div>
          <p className="sd-text">{input.national}</p>
          {input.figures.length > 0 && (
            <ul className="sd-figs">
              {input.figures.map((f, i) => (
                <li key={i}>
                  <span className="sd-fig-val">{f.value}</span>
                  <span className="sd-fig-label">
                    {f.label} · {f.period} · <SourceLink id={f.sourceId} sources={sources} />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <div className="sd-sub">Comercio exterior {year ?? ""}</div>
          <table className="sd-table sd-mini">
            <thead>
              <tr>
                <th>Partida</th>
                <th className="num">Importaciones</th>
                <th className="num">Exportaciones</th>
              </tr>
            </thead>
            <tbody>
              {input.hs.map((code) => {
                const r = rows.get(code);
                return (
                  <tr key={code}>
                    <td>
                      {r?.label ?? code} <span className="sd-code">{code}</span>
                    </td>
                    <td className="num">
                      {fmtUsd(r?.importsUsd[y])}
                      {r?.importsKg ? <span className="sd-wgt">{fmtWeight(r.importsKg)}</span> : null}
                    </td>
                    <td className="num">
                      {fmtUsd(r?.exportsUsd[y])}
                      {r?.exportsKg ? <span className="sd-wgt">{fmtWeight(r.exportsKg)}</span> : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <dl className="sd-meta">
            <dt>Dónde pesa</dt>
            <dd>{input.routes}</dd>
            <dt>Precio a vigilar</dt>
            <dd>{input.priceRef}</dd>
          </dl>
        </div>
      </div>
    </article>
  );
}

// Color fijo por producto: el mismo en la gráfica y en la tabla.
const FOB_COLOR: Record<string, string> = {
  coque: SERIES.blue,
  metalurgico: SERIES.orange,
  termico: SERIES.aqua,
};

// Partidas con valor unitario útil para una siderúrgica (insumos a granel).
const UNIT_CODES = ["2704", "2701", "2601", "7204", "7202", "2521", "2522"];

function Change({ pct }: { pct: number | null }) {
  if (pct == null) return <span className="sd-flat">—</span>;
  return (
    <span className={pct >= 0 ? "up" : "down"}>
      {pct >= 0 ? "▲" : "▼"} {fmtPct(pct, 1)}
    </span>
  );
}

function PricePanel({
  prices,
  rows,
  year,
  sources,
}: {
  prices: SteelPrices;
  rows: Map<string, TradeRow>;
  year: number | null;
  sources: Map<string, SteelSource>;
}) {
  const { fob, base, trm } = prices;
  const chart = fob.months.map((m, i) => {
    const point: Record<string, string | number | null> = { month: fmtMonth(m) };
    for (const s of fob.series) point[s.name] = s.values[i];
    return point;
  });
  // Eje en múltiplos de 50 que cubre todas las series.
  const all = fob.series.flatMap((s) => s.values.filter((v): v is number => v != null));
  const lo = Math.floor(Math.min(...all) / 50) * 50;
  const hi = Math.ceil(Math.max(...all) / 50) * 50;
  const ticks = Array.from({ length: (hi - lo) / 50 + 1 }, (_, i) => lo + i * 50);
  const groups = [...new Set(base.map((b) => b.group))];
  const unitRows = UNIT_CODES.map((c) => rows.get(c)).filter(
    (r): r is TradeRow => !!r && (r.importsUsdPerTon != null || r.exportsUsdPerTon != null)
  );

  return (
    <>
      <div className="sd-trade">
        <div className="card">
          <div className="cm-bench-title">Coque y carbón colombianos · precio FOB</div>
          <div className="cm-bench-sub">
            {fob.unit} · promedio mensual · <SourceLink id={fob.sourceId} sources={sources} />
          </div>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={chart} margin={{ top: 12, right: 12, bottom: 0, left: 0 }}>
              <CartesianGrid stroke={INK.grid} vertical={false} />
              <XAxis dataKey="month" tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: INK.axis }} />
              <YAxis
                tick={AXIS_TICK}
                tickLine={false}
                axisLine={false}
                width={44}
                domain={[lo, hi]}
                ticks={ticks}
              />
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                cursor={{ stroke: INK.axis }}
                formatter={(v, k) => [`US$${fmtNum(Number(v), 2)}/t`, String(k)]}
              />
              <Legend
                wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
                formatter={(k) => <span style={{ color: INK.secondary }}>{String(k)}</span>}
              />
              {fob.series.map((s) => (
                <Line
                  key={s.id}
                  dataKey={s.name}
                  stroke={FOB_COLOR[s.id] ?? SERIES.violet}
                  strokeWidth={2}
                  dot={{ r: 3, strokeWidth: 0, fill: FOB_COLOR[s.id] ?? SERIES.violet }}
                  activeDot={{ r: 5 }}
                  connectNulls={false}
                  isAnimationActive={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
          <div style={{ overflowX: "auto" }}>
            <table className="sd-table sd-table-tight">
              <thead>
                <tr>
                  <th>Producto</th>
                  {fob.months.map((m) => (
                    <th key={m} className="num">
                      {fmtMonth(m).slice(0, 3)}
                    </th>
                  ))}
                  <th className="num">Var. mes</th>
                </tr>
              </thead>
              <tbody>
                {fob.series.map((s) => {
                  const pts = s.values.filter((v): v is number => v != null);
                  const last = pts[pts.length - 1];
                  const prev = pts[pts.length - 2];
                  return (
                    <tr key={s.id}>
                      <td>
                        <span className="sd-swatch" style={{ background: FOB_COLOR[s.id] }} />
                        {s.name}
                      </td>
                      {s.values.map((v, i) => (
                        <td key={fob.months[i]} className="num">
                          {v == null
                            ? "—"
                            : fmtNum(v, s.roundedUntil && fob.months[i] <= s.roundedUntil ? 0 : 2)}
                        </td>
                      ))}
                      <td className="num">
                        <Change pct={prev ? ((last - prev) / prev) * 100 : null} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="sd-foot">{fob.note}</div>
        </div>

        <div className="card">
          <div className="cm-bench-title">Valor unitario del comercio exterior</div>
          <div className="cm-bench-sub">
            USD por tonelada · {year ?? "—"} · valor declarado dividido por el peso (Comtrade)
          </div>
          {unitRows.length === 0 ? (
            <div className="sd-text" style={{ marginTop: 16 }}>
              La fuente no informó el peso de estas partidas para el último año.
            </div>
          ) : (
            <table className="sd-table sd-table-tight">
              <thead>
                <tr>
                  <th>Partida</th>
                  <th className="num">Importación (CIF)</th>
                  <th className="num">Exportación (FOB)</th>
                </tr>
              </thead>
              <tbody>
                {unitRows.map((r) => (
                  <tr key={r.code}>
                    <td>
                      {r.label} <span className="sd-code">{r.code}</span>
                    </td>
                    <td className="num">
                      {r.importsUsdPerTon == null ? "—" : `US$${fmtNum(r.importsUsdPerTon, 0)}`}
                      {r.importsUsdPerTon != null && <em className="sd-vol">{fmtWeight(r.importsKg)}</em>}
                    </td>
                    <td className="num">
                      {r.exportsUsdPerTon == null ? "—" : `US$${fmtNum(r.exportsUsdPerTon, 0)}`}
                      {r.exportsUsdPerTon != null && <em className="sd-vol">{fmtWeight(r.exportsKg)}</em>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div className="sd-foot">
            Promedio anual de todo lo declarado en la partida, con el volumen debajo. Un valor
            alto con poco volumen indica producto especial, no el precio del granel. Se omite
            cuando el peso no viene informado o es menor de 100 t.
          </div>
        </div>
      </div>

      <div className="card sd-base">
        <div className="cm-bench-title">Precios base de la UPME para regalías</div>
        <div className="cm-bench-sub">
          COP por tonelada en boca de mina · equivalente en USD a la TRM de {fmtNum(trm, 2)} que usa
          la resolución de carbón
        </div>
        <div style={{ overflowX: "auto" }}>
          <table className="sd-table sd-table-tight">
            <thead>
              <tr>
                <th>Mineral</th>
                <th className="num">COP/t</th>
                <th className="num">USD/t</th>
                <th className="num">Var. período</th>
                <th>Vigencia</th>
                <th>Fuente</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => [
                <tr key={g} className="sd-group-row">
                  <td colSpan={6}>{g}</td>
                </tr>,
                ...base
                  .filter((b) => b.group === g)
                  .map((b) => (
                    <tr key={b.product}>
                      <td>{b.product}</td>
                      <td className="num">{fmtNum(b.cop, 0)}</td>
                      <td className="num">{fmtNum(b.cop / trm, 2)}</td>
                      <td className="num">
                        <Change pct={b.prevCop ? ((b.cop - b.prevCop) / b.prevCop) * 100 : null} />
                      </td>
                      <td>{b.period}</td>
                      <td>
                        <SourceLink id={b.sourceId} sources={sources} />
                      </td>
                    </tr>
                  )),
              ])}
            </tbody>
          </table>
        </div>
        <div className="sd-foot">{prices.baseNote}</div>
      </div>
    </>
  );
}

export default function SiderurgiaPage() {
  const [data, setData] = useState<SteelResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [code, setCode] = useState("72");

  useEffect(() => {
    fetch("/api/steel", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);

  const sources = useMemo(
    () => new Map((data?.market.sources ?? []).map((s) => [s.id, s])),
    [data]
  );
  const rows = useMemo(
    () => new Map((data?.trade.rows ?? []).map((r) => [r.code, r])),
    [data]
  );

  if (loading) {
    return (
      <main className="container">
        <div className="skeleton" style={{ height: 120, borderRadius: 16, marginBottom: 24 }} />
        <div className="skeleton" style={{ height: 480, borderRadius: 16 }} />
      </main>
    );
  }
  if (!data) {
    return (
      <main className="container">
        <div className="note">No se pudo cargar el módulo de siderurgia.</div>
      </main>
    );
  }

  const { trade, market } = data;
  const sel = rows.get(code) ?? trade.rows[0];
  const chartData = trade.years.map((y) => ({
    year: String(y),
    Importaciones: sel?.importsUsd[String(y)] != null ? sel.importsUsd[String(y)]! / 1e6 : null,
    Exportaciones: sel?.exportsUsd[String(y)] != null ? sel.exportsUsd[String(y)]! / 1e6 : null,
  }));
  const ly = String(trade.latestYear ?? "");
  const maxOrigin = Math.max(...trade.steelOrigins.map((o) => o.valueUsd), 1);

  return (
    <main className="container">
      <header className="topbar">
        <div>
          <h1>Siderurgia · mercado global y nacional</h1>
          <div className="sub">
            Oferta nacional e importaciones de acero, carbón, minerales, combustibles, gas
            y oxígeno en Colombia, con lectura para una empresa siderúrgica
          </div>
        </div>
        <div className="status">
          <span className={`dot${trade.live ? "" : " stale"}`} />
          {trade.live ? "Comercio exterior en vivo" : "Comercio exterior: instantánea"} · análisis al{" "}
          {market.asOf}
        </div>
      </header>

      <section>
        <h2 className="section-title">Colombia en cuatro cifras</h2>
        <FactGrid facts={market.kpis} sources={sources} />
      </section>

      <section>
        <h2 className="section-title">Mercado global del acero</h2>
        <FactGrid facts={market.globalFacts} sources={sources} />
        <div className="sd-gap" />
        <CommodityPanel />
      </section>

      <section>
        <h2 className="section-title">Precios del coque, el carbón y los minerales siderúrgicos</h2>
        <PricePanel prices={market.prices} rows={rows} year={trade.latestYear} sources={sources} />
      </section>

      <section>
        <h2 className="section-title">Mercado nacional del acero</h2>
        <FactGrid facts={market.nationalFacts} sources={sources} />
      </section>

      <section>
        <h2 className="section-title">Oferta nacional e importaciones por insumo</h2>
        <div className="sd-inputs">
          {market.inputs.map((inp) => (
            <InputCard
              key={inp.id}
              input={inp}
              rows={rows}
              year={trade.latestYear}
              sources={sources}
            />
          ))}
        </div>
        <div className="sd-foot">
          Importaciones en USD CIF y exportaciones en USD FOB ({trade.source}). El peso se
          muestra cuando la fuente lo informa. La partida 2701 agrupa carbón térmico y
          metalúrgico; la 2711 agrupa gas natural y GLP.
        </div>
      </section>

      <section>
        <h2 className="section-title">Comercio exterior por partida arancelaria</h2>
        <div className="sector-tabs" style={{ marginBottom: 14 }}>
          {trade.rows.map((r) => (
            <button
              key={r.code}
              className={`sector-tab${r.code === sel?.code ? " active" : ""}`}
              onClick={() => setCode(r.code)}
            >
              {r.label}
            </button>
          ))}
        </div>
        <div className="sd-trade">
          <div className="card">
            <div className="cm-bench-title">
              {sel?.label} <span className="sd-code">{sel?.code}</span>
            </div>
            <div className="cm-bench-sub">Millones de USD por año · Colombia frente al mundo</div>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={chartData} margin={{ top: 12, right: 8, bottom: 0, left: 0 }} barGap={2}>
                <CartesianGrid stroke={INK.grid} vertical={false} />
                <XAxis dataKey="year" tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: INK.axis }} />
                <YAxis
                  tick={AXIS_TICK}
                  tickLine={false}
                  axisLine={false}
                  width={56}
                  tickFormatter={(v: number) => fmtNum(v, v > 0 && v < 10 ? 1 : 0)}
                />
                <Tooltip
                  contentStyle={TOOLTIP_STYLE}
                  cursor={{ fill: "rgba(255,255,255,0.04)" }}
                  formatter={(v, k) => [`US$${fmtNum(Number(v), 1)} M`, String(k)]}
                />
                <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} formatter={(k) => <span style={{ color: INK.secondary }}>{String(k)}</span>} />
                <Bar dataKey="Importaciones" fill={SERIES.blue} radius={[4, 4, 0, 0]} maxBarSize={36} isAnimationActive={false} />
                <Bar dataKey="Exportaciones" fill={SERIES.orange} radius={[4, 4, 0, 0]} maxBarSize={36} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="card">
            <div className="cm-bench-title">Origen del acero importado</div>
            <div className="cm-bench-sub">Capítulo 72 · {ly} · participación en el valor CIF</div>
            {trade.steelOrigins.length === 0 ? (
              <div className="sd-text" style={{ marginTop: 16 }}>
                El desglose por país solo está disponible con la consulta en vivo a Comtrade.
              </div>
            ) : (
              <ol className="sd-origins">
                {trade.steelOrigins.map((o) => (
                  <li key={o.code} title={`${o.name}: ${fmtUsd(o.valueUsd)}`}>
                    <span className="sd-origin-name">{o.name}</span>
                    <span className="sd-origin-bar">
                      <span style={{ width: `${(o.valueUsd / maxOrigin) * 100}%` }} />
                    </span>
                    <span className="sd-origin-val">
                      {fmtNum(o.sharePct, 1)} % <em>{fmtUsd(o.valueUsd)}</em>
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>

        <details className="sd-details">
          <summary>Ver tabla completa {ly}</summary>
          <div className="card" style={{ marginTop: 12, overflowX: "auto" }}>
            <table className="sd-table">
              <thead>
                <tr>
                  <th>Partida</th>
                  <th>Grupo</th>
                  <th className="num">Importaciones (CIF)</th>
                  <th className="num">Peso</th>
                  <th className="num">Exportaciones (FOB)</th>
                  <th className="num">Peso</th>
                  <th className="num">Balance</th>
                </tr>
              </thead>
              <tbody>
                {trade.rows.map((r) => {
                  const m = r.importsUsd[ly];
                  const x = r.exportsUsd[ly];
                  const bal = m == null && x == null ? null : (x ?? 0) - (m ?? 0);
                  return (
                    <tr key={r.code}>
                      <td>
                        {r.label} <span className="sd-code">{r.code}</span>
                      </td>
                      <td>{r.group}</td>
                      <td className="num">{fmtUsd(m)}</td>
                      <td className="num">{fmtWeight(r.importsKg)}</td>
                      <td className="num">{fmtUsd(x)}</td>
                      <td className="num">{fmtWeight(r.exportsKg)}</td>
                      <td className="num">
                        {bal == null ? "—" : `${bal >= 0 ? "Superávit" : "Déficit"} ${fmtUsd(Math.abs(bal))}`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </details>
        {trade.errors.length > 0 && (
          <div className="note" style={{ marginTop: 14 }}>{trade.errors.join(" · ")}</div>
        )}
      </section>

      <section>
        <h2 className="section-title">Lectura para una empresa siderúrgica</h2>
        <div className="sd-analysis">
          <div className="card">
            <h3 className="sd-h3">Mercado global</h3>
            {market.analysis.global.map((p, i) => (
              <p key={i} className="sd-text">{p}</p>
            ))}
          </div>
          <div className="card">
            <h3 className="sd-h3">Mercado nacional</h3>
            {market.analysis.national.map((p, i) => (
              <p key={i} className="sd-text">{p}</p>
            ))}
          </div>
          <div className="card">
            <h3 className="sd-h3">Oportunidades</h3>
            <ul className="sd-list">
              {market.analysis.opportunities.map((p, i) => (
                <li key={i}>{p}</li>
              ))}
            </ul>
          </div>
          <div className="card">
            <h3 className="sd-h3">Riesgos</h3>
            <ul className="sd-list">
              {market.analysis.risks.map((p, i) => (
                <li key={i}>{p}</li>
              ))}
            </ul>
          </div>
        </div>

        <div className="card" style={{ marginTop: 18, overflowX: "auto" }}>
          <h3 className="sd-h3">Exposición por ruta de producción</h3>
          <table className="sd-table">
            <thead>
              <tr>
                <th>Insumo</th>
                <th>Integrada (alto horno y convertidor)</th>
                <th>Semi-integrada (horno eléctrico)</th>
              </tr>
            </thead>
            <tbody>
              {market.analysis.exposure.map((e) => (
                <tr key={e.input}>
                  <td>{e.input}</td>
                  <td>{e.integrated}</td>
                  <td>{e.eaf}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="card" style={{ marginTop: 18, overflowX: "auto" }}>
          <h3 className="sd-h3">Indicadores a vigilar</h3>
          <table className="sd-table">
            <thead>
              <tr>
                <th>Indicador</th>
                <th>Por qué importa</th>
                <th>Dónde verlo</th>
              </tr>
            </thead>
            <tbody>
              {market.analysis.watchlist.map((w) => (
                <tr key={w.indicator}>
                  <td>{w.indicator}</td>
                  <td>{w.why}</td>
                  <td>{w.where}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="sd-foot">
          La lectura analítica es elaboración propia sobre las cifras citadas, con corte al{" "}
          {market.asOf}. Los precios y el comercio exterior se actualizan solos; las cifras
          de oferta nacional se actualizan editando <code>data/steel_market.json</code>.
        </div>
      </section>

      <section>
        <h2 className="section-title">Fuentes</h2>
        <ul className="sd-sources">
          {market.sources.map((s) => (
            <li key={s.id}>
              <a href={s.url} target="_blank" rel="noopener noreferrer">{s.title}</a>
              <span> · {s.publisher} · {s.date}</span>
            </li>
          ))}
        </ul>
      </section>

      <footer>
        Información pública con fines educativos y de análisis sectorial. No constituye
        asesoría de inversión ni refleja datos internos de ninguna empresa.
      </footer>
    </main>
  );
}
