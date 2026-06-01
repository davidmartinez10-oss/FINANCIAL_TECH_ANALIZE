"use client";

import { useEffect, useState, useCallback } from "react";
import type { MacroResponse, MacroRegion, MacroIndicator } from "@/lib/types";

const REFRESH_MS = 60_000;

function pct(v: number) {
  const s = v >= 0 ? "+" : "";
  return `${s}${v.toFixed(2)}%`;
}

function IndicatorRow({ ind }: { ind: MacroIndicator }) {
  const up = ind.changePct >= 0;
  return (
    <div className="ind-row">
      <div className="ind-info">
        <span className="ind-name">{ind.name}</span>
        <span className="ind-cat">{ind.category}</span>
      </div>
      <div className="ind-right">
        <span className="ind-price">
          {ind.price > 100
            ? ind.price.toLocaleString("en-US", { maximumFractionDigits: 2 })
            : ind.price.toFixed(4)}
        </span>
        <span className={`ind-chg ${up ? "up" : "down"}`}>{pct(ind.changePct)}</span>
      </div>
    </div>
  );
}

function RegionCard({ r }: { r: MacroRegion }) {
  return (
    <div className="region-card card">
      <div className="region-header">
        <span className="region-flag">{r.flag}</span>
        <h3 className="region-label">{r.label}</h3>
      </div>
      {r.indicators.length === 0 ? (
        <div className="note" style={{ margin: "8px 0" }}>
          Sin datos disponibles en este momento.
        </div>
      ) : (
        <div className="ind-list">
          {r.indicators.map((ind) => (
            <IndicatorRow key={ind.symbol} ind={ind} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function MacroPage() {
  const [data, setData] = useState<MacroResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [asOf, setAsOf] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/macro", { cache: "no-store" });
      const json: MacroResponse = await res.json();
      setData(json);
      setAsOf(new Date(json.asOf).toLocaleTimeString("es-CO"));
    } catch {
      // silently retain old data
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
    <main className="container">
      <header className="topbar">
        <div>
          <h1>Análisis Macroeconómico Global</h1>
          <div className="sub">
            Mercados, divisas y commodities por región · Actualización cada minuto
          </div>
        </div>
        {asOf && (
          <div className="status">
            <span className="dot" />
            Actualizado {asOf}
          </div>
        )}
      </header>

      {loading ? (
        <div className="macro-grid">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div
              key={i}
              className="skeleton"
              style={{ height: 280, borderRadius: 12 }}
            />
          ))}
        </div>
      ) : data ? (
        <>
          <div className="macro-grid">
            {data.regions.map((r) => (
              <RegionCard key={r.region} r={r} />
            ))}
          </div>
          {data.errors.length > 0 && (
            <div className="note" style={{ marginTop: 16 }}>
              Algunos símbolos no disponibles: {data.errors.length} errores.
              Ciertos ETFs de mercados restringidos (Rusia) pueden estar suspendidos.
            </div>
          )}
        </>
      ) : (
        <div className="note">No se pudieron cargar los datos macroeconómicos.</div>
      )}

      <footer>
        Fuente: Yahoo Finance (público). Indicadores proxy de mercado para análisis
        macroeconómico. No incluye datos del PIB, inflación o bancos centrales en tiempo
        real. Solo con fines educativos.
      </footer>
    </main>
  );
}
