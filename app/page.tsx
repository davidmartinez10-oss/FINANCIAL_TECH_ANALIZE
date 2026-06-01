import Link from "next/link";
import QuoteGrid from "@/components/QuoteGrid";
import ForecastPanel from "@/components/ForecastPanel";

export default function Home() {
  return (
    <main className="container">
      <header className="topbar">
        <div>
          <h1>Dashboard · Macro Markets</h1>
          <div className="sub">
            Mercado en tiempo real · Pronósticos ensamblados · Monte Carlo 10.000 sims
          </div>
        </div>
      </header>

      {/* Quick nav cards */}
      <div className="quick-nav">
        <Link href="/company" className="qnav-card">
          <span className="qnav-icon">🏢</span>
          <div>
            <div className="qnav-title">Compañías</div>
            <div className="qnav-sub">NVDA · MSFT · GOOGL + ETFs</div>
          </div>
        </Link>
        <Link href="/macro" className="qnav-card">
          <span className="qnav-icon">🌍</span>
          <div>
            <div className="qnav-title">Macro Global</div>
            <div className="qnav-sub">EE.UU. · China · EU · LatAm</div>
          </div>
        </Link>
        <Link href="/news" className="qnav-card">
          <span className="qnav-icon">📰</span>
          <div>
            <div className="qnav-title">Noticias</div>
            <div className="qnav-sub">Tech · IA · Energía · Economía</div>
          </div>
        </Link>
        <Link href="/assistant" className="qnav-card">
          <span className="qnav-icon">🤖</span>
          <div>
            <div className="qnav-title">Asistente IA</div>
            <div className="qnav-sub">Alex · Elena · Carlos · Pepe</div>
          </div>
        </Link>
      </div>

      <section>
        <h2 className="section-title">Mercado en tiempo real</h2>
        <QuoteGrid />
      </section>

      <ForecastPanel />

      <footer>
        Fuente: Yahoo Finance (público, sin API key). Pronósticos: ensamble Prophet +
        ARIMAX + XGBoost + Holt-Winters validado con 10.000 simulaciones Monte Carlo
        (research/ensemble_forecast.py). · Solo con fines educativos; no constituye
        asesoría de inversión.
      </footer>
    </main>
  );
}
