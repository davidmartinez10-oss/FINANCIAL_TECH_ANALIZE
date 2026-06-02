"use client";

import { useEffect, useState, useCallback } from "react";
import type { NewsResponse, NewsArticle } from "@/lib/types";

const SECTORS = [
  { key: "portfolio", label: "Portafolio" },
  { key: "tech", label: "Tecnología" },
  { key: "ai", label: "IA" },
  { key: "energy", label: "Energía" },
  { key: "economy", label: "Economía" },
  { key: "latam", label: "LatAm" },
];

function timeAgo(ts: number): string {
  const diff = Date.now() / 1000 - ts;
  if (diff < 3600) return `hace ${Math.round(diff / 60)}min`;
  if (diff < 86400) return `hace ${Math.round(diff / 3600)}h`;
  return `hace ${Math.round(diff / 86400)}d`;
}

function NewsCard({ a }: { a: NewsArticle }) {
  return (
    <a
      href={a.link}
      target="_blank"
      rel="noopener noreferrer"
      className="news-card"
    >
      {a.thumbnail && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={a.thumbnail} alt="" className="news-thumb" loading="lazy" />
      )}
      <div className="news-body">
        <div className="news-meta">
          <span className="news-pub">{a.publisher}</span>
          <span className="news-time">{timeAgo(a.publishedAt)}</span>
        </div>
        <h3 className="news-title">{a.title}</h3>
        {a.summary && <p className="news-summary">{a.summary}</p>}
        {a.relatedSymbols.length > 0 && (
          <div className="news-tickers">
            {a.relatedSymbols.map((s) => (
              <span key={s} className="chip">{s}</span>
            ))}
          </div>
        )}
      </div>
    </a>
  );
}

export default function NewsPage() {
  const [sector, setSector] = useState("portfolio");
  const [data, setData] = useState<NewsResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (s: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/news?sector=${s}`, { cache: "no-store" });
      const json: NewsResponse = await res.json();
      setData(json);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(sector);
  }, [sector, load]);

  return (
    <main className="container">
      <header className="topbar">
        <div>
          <h1>Noticias Financieras</h1>
          <div className="sub">
            Macro y micro · Por sector · Fuente: Yahoo Finance
          </div>
        </div>
      </header>

      <div className="sector-tabs">
        {SECTORS.map((s) => (
          <button
            key={s.key}
            className={`sector-tab${sector === s.key ? " active" : ""}`}
            onClick={() => setSector(s.key)}
          >
            {s.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="news-grid">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div
              key={i}
              className="skeleton"
              style={{ height: 200, borderRadius: 12 }}
            />
          ))}
        </div>
      ) : !data || data.articles.length === 0 ? (
        <div className="note" style={{ marginTop: 24 }}>
          No se encontraron noticias para esta categoría en este momento.
          Yahoo Finance puede limitar resultados según el servidor.
        </div>
      ) : (
        <div className="news-grid">
          {data.articles.map((a) => (
            <NewsCard key={a.uuid} a={a} />
          ))}
        </div>
      )}

      <footer>
        Noticias vía Yahoo Finance (búsqueda pública). Actualización manual por categoría.
        Solo con fines informativos; no constituye asesoría de inversión.
      </footer>
    </main>
  );
}
