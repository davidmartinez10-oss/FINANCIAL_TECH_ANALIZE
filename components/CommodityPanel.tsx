"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { BenchmarkSeries, CommoditiesResponse } from "@/lib/types";
import QuoteTable from "@/components/QuoteTable";
import { fmtMonth, fmtNum, fmtPct } from "@/lib/format";
import { AXIS_TICK, INK, SERIES, TOOLTIP_STYLE } from "@/lib/chart-theme";

const REFRESH_MS = 5 * 60_000;

function Change({ label, v }: { label: string; v: number | null }) {
  return (
    <div className="cm-chg">
      <span className="cm-chg-label">{label}</span>
      <span className={`cm-chg-val ${v == null ? "" : v >= 0 ? "up" : "down"}`}>
        {fmtPct(v, 1)}
      </span>
    </div>
  );
}

function BenchmarkChart({ b }: { b: BenchmarkSeries }) {
  const ticks = useMemo(
    () => b.points.filter((p) => p.d.endsWith("-01")).map((p) => p.d),
    [b]
  );
  return (
    <div className="cm-bench card">
      <div className="cm-bench-top">
        <div>
          <div className="cm-bench-title">{b.name}</div>
          <div className="cm-bench-sub">
            {b.unit} · promedio mensual · {b.origin} vía FRED
          </div>
        </div>
        <div className="cm-bench-stats">
          <div className="cm-stat">
            <span className="cm-chg-label">{fmtMonth(b.lastDate)}</span>
            <span className="cm-stat-val">{fmtNum(b.last, 1)}</span>
          </div>
          <Change label="vs. mes anterior" v={b.change1mPct} />
          <Change label="vs. un año antes" v={b.changeYoYPct} />
        </div>
      </div>
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={b.points} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
          <CartesianGrid stroke={INK.grid} vertical={false} />
          <XAxis
            dataKey="d"
            ticks={ticks}
            tickFormatter={(d: string) => d.slice(0, 4)}
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={{ stroke: INK.axis }}
          />
          <YAxis
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={false}
            width={48}
            domain={["auto", "auto"]}
            tickFormatter={(v: number) => fmtNum(v, 0)}
          />
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            cursor={{ stroke: INK.axis }}
            labelFormatter={(d) => fmtMonth(String(d))}
            formatter={(v) => [`${fmtNum(Number(v), 1)} ${b.unit}`, b.name]}
          />
          <Line
            dataKey="v"
            type="monotone"
            stroke={SERIES.blue}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, stroke: "#14161c", strokeWidth: 2 }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export default function CommodityPanel({
  groups,
  showBenchmarks = true,
}: {
  groups?: string[]; // filtra los grupos de cotizaciones diarias
  showBenchmarks?: boolean;
}) {
  const [data, setData] = useState<CommoditiesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [sel, setSel] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/commodities", { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      setData(await res.json());
      setFailed(false);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, REFRESH_MS);
    return () => clearInterval(id);
  }, [load]);

  if (loading) {
    return (
      <div className="cm-grid">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="skeleton" style={{ height: 170, borderRadius: 8 }} />
        ))}
      </div>
    );
  }
  if (!data) {
    return <div className="note">No se pudieron cargar los precios de commodities.</div>;
  }

  const quotes = groups
    ? data.quotes.filter((q) => groups.includes(q.group))
    : data.quotes;
  const order = [...new Set(quotes.map((q) => q.group))];
  const bench = data.benchmarks.find((b) => b.id === sel) ?? data.benchmarks[0];

  return (
    <div className="cm-wrap">
      {order.map((g) => (
        <div key={g}>
          <div className="cm-group">{g}</div>
          <div className="panel">
            <QuoteTable rows={quotes.filter((q) => q.group === g)} />
          </div>
        </div>
      ))}
      {quotes.length === 0 && (
        <div className="note">
          El proveedor de cotizaciones diarias no respondió. Las referencias mensuales
          siguen disponibles abajo.
        </div>
      )}

      {showBenchmarks && data.benchmarks.length > 0 && bench && (
        <div>
          <div className="cm-group">Referencias mensuales</div>
          <div className="sector-tabs" style={{ marginBottom: 14 }}>
            {data.benchmarks.map((b) => (
              <button
                key={b.id}
                className={`sector-tab${b.id === bench.id ? " active" : ""}`}
                onClick={() => setSel(b.id)}
              >
                {b.name}
              </button>
            ))}
          </div>
          <BenchmarkChart b={bench} />
        </div>
      )}

      {(failed || data.errors.length > 0) && (
        <div className="note">
          {failed && "No se pudo actualizar; se muestran los últimos datos cargados. "}
          {data.errors.length > 0 &&
            `Sin datos para ${data.errors.length} serie(s): ${data.errors
              .map((e) => e.split(":")[0])
              .join(" · ")}.`}
        </div>
      )}
    </div>
  );
}
