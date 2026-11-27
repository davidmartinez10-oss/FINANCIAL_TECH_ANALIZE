"use client";

import { useState } from "react";
import QuoteTable from "@/components/QuoteTable";
import { useIndicators } from "@/lib/use-indicators";

const ALL = "Todos";

export default function KeyIndicators() {
  const { data, loading } = useIndicators();
  const [tab, setTab] = useState(ALL);

  if (loading) {
    return <div className="skeleton" style={{ height: 420, borderRadius: 8 }} />;
  }
  if (!data || data.rows.length === 0) {
    return <div className="note">No se pudieron cargar los indicadores clave.</div>;
  }

  const tabs = [ALL, ...data.groups.filter((g) => data.rows.some((r) => r.group === g))];
  const rows = tab === ALL ? data.rows : data.rows.filter((r) => r.group === tab);
  const time = new Date(data.asOf).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit", hour12: false });

  return (
    <div className="panel">
      <div className="panel-head">
        <div className="tabs" role="tablist" aria-label="Grupo de indicadores">
          {tabs.map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={t === tab}
              className={`tab${t === tab ? " active" : ""}`}
              onClick={() => setTab(t)}
            >
              {t}
            </button>
          ))}
        </div>
        <div className="panel-meta">
          <span className="dot" /> Actualizado {time}
        </div>
      </div>
      <QuoteTable rows={rows} showGroup={tab === ALL} />
      {data.errors.length > 0 && (
        <div className="panel-foot">
          Sin datos en este momento: {data.errors.map((e) => e.split(" (")[0]).join(" · ")}.
        </div>
      )}
    </div>
  );
}
