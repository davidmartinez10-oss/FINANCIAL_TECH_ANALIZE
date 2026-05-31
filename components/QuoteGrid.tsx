"use client";

import { useEffect, useState, useCallback } from "react";
import type { Quote, QuoteResponse } from "@/lib/types";

const REFRESH_MS = 30_000;

function Sparkline({ data, up }: { data: number[]; up: boolean }) {
  if (data.length < 2) return <div className="spark" />;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;
  const w = 100;
  const h = 36;
  const pts = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * w;
      const y = h - ((v - min) / span) * h;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const color = up ? "var(--green)" : "var(--red)";
  return (
    <svg className="spark" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
      <polyline
        points={pts}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

function QuoteCard({ q }: { q: Quote }) {
  const up = q.change >= 0;
  return (
    <div className="card qcard">
      <div className="row1">
        <span className="sym">{q.symbol}</span>
        <span className={up ? "up" : "down"} style={{ fontSize: 13 }}>
          {up ? "▲" : "▼"}
        </span>
      </div>
      <div className="name">{q.name}</div>
      <div className="price">
        {q.price.toLocaleString("en-US", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}
      </div>
      <div className={`chg ${up ? "up" : "down"}`}>
        {up ? "+" : ""}
        {q.change.toFixed(2)} ({up ? "+" : ""}
        {q.changePct.toFixed(2)}%)
      </div>
      <Sparkline data={q.series.map((s) => s.c)} up={up} />
    </div>
  );
}

export default function QuoteGrid() {
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [asOf, setAsOf] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [stale, setStale] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/quote", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: QuoteResponse = await res.json();
      setQuotes(data.quotes);
      setAsOf(data.asOf);
      setStale(false);
      setErr(null);
    } catch (e) {
      setStale(true);
      setErr(String((e as Error).message));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, REFRESH_MS);
    return () => clearInterval(id);
  }, [load]);

  return (
    <section>
      <div className="status" style={{ marginBottom: 12 }}>
        <span className={`dot ${stale ? "stale" : ""}`} />
        {loading
          ? "Cargando mercado…"
          : stale
          ? `Datos en caché — reintentando (${err ?? "error"})`
          : `En vivo · actualizado ${new Date(asOf).toLocaleTimeString("es")}`}
      </div>

      {loading ? (
        <div className="grid">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="card skeleton" style={{ height: 150 }} />
          ))}
        </div>
      ) : (
        <div className="grid">
          {quotes.map((q) => (
            <QuoteCard key={q.symbol} q={q} />
          ))}
        </div>
      )}
    </section>
  );
}
