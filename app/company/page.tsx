import Link from "next/link";
import { fetchQuotes } from "@/lib/providers/yahoo";
import { ASSET_NAMES } from "@/lib/providers/yahoo";
import { STATIC_PROFILES } from "@/lib/data/company-profiles";

export const dynamic = "force-dynamic";
export const revalidate = 60;

const ALL_SYMBOLS = Object.keys(ASSET_NAMES);

function fmt(n: number) {
  return n >= 0
    ? `+${n.toFixed(2)}%`
    : `${n.toFixed(2)}%`;
}

export default async function CompanyListPage() {
  const { quotes } = await fetchQuotes(ALL_SYMBOLS, "1d", "1d");
  const quoteMap = new Map(quotes.map((q) => [q.symbol, q]));

  const stocks = ALL_SYMBOLS.filter(
    (s) => STATIC_PROFILES[s]?.type === "stock"
  );
  const etfs = ALL_SYMBOLS.filter((s) => STATIC_PROFILES[s]?.type === "etf");

  const renderGroup = (symbols: string[], title: string) => (
    <section>
      <h2 className="section-title">{title}</h2>
      <div className="company-grid">
        {symbols.map((sym) => {
          const q = quoteMap.get(sym);
          const profile = STATIC_PROFILES[sym];
          const up = (q?.changePct ?? 0) >= 0;
          return (
            <Link key={sym} href={`/company/${sym}`} className="company-card">
              <div className="cc-header">
                <div>
                  <span className="cc-sym">{sym}</span>
                  <span className="cc-type">{profile?.tickerType ?? ""}</span>
                </div>
                {q && (
                  <span className={`cc-chg ${up ? "up" : "down"}`}>
                    {fmt(q.changePct)}
                  </span>
                )}
              </div>
              <div className="cc-name">{ASSET_NAMES[sym]}</div>
              {q && (
                <div className="cc-price">
                  ${q.price.toFixed(2)}{" "}
                  <span className="cc-currency">{q.currency}</span>
                </div>
              )}
              <p className="cc-mission">
                {profile?.mission.slice(0, 120)}...
              </p>
              <span className="cc-link">Ver análisis →</span>
            </Link>
          );
        })}
      </div>
    </section>
  );

  return (
    <main className="container">
      <header className="topbar">
        <div>
          <h1>Compañías del Portafolio</h1>
          <div className="sub">
            Análisis detallado · Estados financieros · Tiempo real
          </div>
        </div>
      </header>

      {renderGroup(stocks, "Acciones individuales")}
      {renderGroup(etfs, "ETFs del portafolio")}

      <footer>
        Datos de mercado: Yahoo Finance · Estados financieros TTM (últimos 12 meses).
        Solo con fines educativos; no constituye asesoría de inversión.
      </footer>
    </main>
  );
}
