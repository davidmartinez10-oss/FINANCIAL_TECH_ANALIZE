"use client";

import type { CommodityQuote } from "@/lib/types";
import { fmtMonth, fmtNum, fmtPrice } from "@/lib/format";
import { SERIES } from "@/lib/chart-theme";

// Variación con signo, flecha y color: nunca solo color.
export function Delta({ v, decimals = 2, suffix = " %" }: { v: number | null; decimals?: number; suffix?: string }) {
  if (v == null || !Number.isFinite(v)) return <span className="qt-flat">—</span>;
  const up = v >= 0;
  return (
    <span className={`qt-delta ${up ? "up" : "down"}`}>
      <span aria-hidden="true">{up ? "▲" : "▼"}</span>{" "}
      {up ? "+" : "−"}
      {fmtNum(Math.abs(v), decimals)}
      {suffix}
    </span>
  );
}

function Spark({ q }: { q: CommodityQuote }) {
  const pts = q.series;
  if (pts.length < 5) return <span className="qt-flat">—</span>;
  const W = 96;
  const H = 26;
  const vals = pts.map((p) => p.c);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const span = max - min || 1;
  const d = vals
    .map((v, i) => {
      const x = (i / (vals.length - 1)) * (W - 2) + 1;
      const y = H - 2 - ((v - min) / span) * (H - 4);
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg className="qt-spark" width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
      <path d={d} fill="none" stroke={SERIES.blue} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function Range52({ q }: { q: CommodityQuote }) {
  if (q.hi52 == null || q.lo52 == null || q.hi52 <= q.lo52) {
    return <span className="qt-flat">—</span>;
  }
  const pos = Math.min(1, Math.max(0, (q.price - q.lo52) / (q.hi52 - q.lo52)));
  const label = `Mínimo ${fmtPrice(q.lo52)} · máximo ${fmtPrice(q.hi52)} · actual en el ${fmtNum(pos * 100, 0)} % del rango`;
  return (
    <span className="qt-range" title={label} role="img" aria-label={label}>
      <span className="qt-range-lo">{fmtPrice(q.lo52)}</span>
      <span className="qt-range-track">
        <span className="qt-range-dot" style={{ left: `${pos * 100}%` }} />
      </span>
      <span className="qt-range-hi">{fmtPrice(q.hi52)}</span>
    </span>
  );
}

function when(q: CommodityQuote) {
  if (q.frequency === "M") {
    const d = new Date(q.asOf * 1000);
    return fmtMonth(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  const d = new Date(q.asOf * 1000);
  const today = new Date().toDateString() === d.toDateString();
  return today
    ? d.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit", hour12: false })
    : d.toLocaleDateString("es-CO", { day: "numeric", month: "short" });
}

// Tabla densa de cotizaciones: una fila por instrumento.
export default function QuoteTable({ rows, showGroup = false }: { rows: CommodityQuote[]; showGroup?: boolean }) {
  return (
    <div className="qt-scroll">
      <table className="qt">
        <thead>
          <tr>
            <th>Nombre</th>
            <th className="num">Último</th>
            <th className="num qt-col-abs">Var.</th>
            <th className="num">Var. %</th>
            <th className="num">1 mes</th>
            <th className="qt-col-range">Rango 52 semanas</th>
            <th className="qt-col-spark">Tendencia</th>
            <th className="num">Hora</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((q) => (
            <tr key={q.symbol}>
              <td>
                <span className="qt-name">{q.name}</span>
                <span className="qt-sub">
                  {showGroup ? `${q.group} · ` : ""}
                  {q.unit}
                  {q.frequency === "M" && <span className="qt-tag">mensual</span>}
                  {q.stale && <span className="qt-tag">dato anterior</span>}
                </span>
              </td>
              <td className="num qt-last">{fmtPrice(q.price)}</td>
              <td className="num qt-col-abs">
                <Delta v={q.change} decimals={Math.abs(q.price) >= 1000 ? 1 : Math.abs(q.price) >= 10 ? 2 : 3} suffix="" />
              </td>
              <td className="num">
                <Delta v={q.changePct} />
              </td>
              <td className="num">
                {q.frequency === "M" ? <span className="qt-flat">—</span> : <Delta v={q.change1mPct} decimals={1} />}
              </td>
              <td className="qt-col-range">
                <Range52 q={q} />
              </td>
              <td className="qt-col-spark">
                <Spark q={q} />
              </td>
              <td className="num qt-time">{when(q)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
