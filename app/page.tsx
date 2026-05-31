import QuoteGrid from "@/components/QuoteGrid";
import ForecastPanel from "@/components/ForecastPanel";

export default function Home() {
  return (
    <main className="container">
      <header className="topbar">
        <div>
          <h1>Macro Markets · Análisis de Inversión</h1>
          <div className="sub">
            Mercado en tiempo real · Semiconductores, energía solar/nuclear e
            índices · Pronósticos ensamblados con validación Monte Carlo
          </div>
        </div>
      </header>

      <section>
        <h2 className="section-title">Mercado en tiempo real</h2>
        <QuoteGrid />
      </section>

      <ForecastPanel />

      <footer>
        Fuente de mercado: Yahoo Finance (público, sin API key). Pronósticos:
        ensamble Prophet + ARIMAX + XGBoost + Holt-Winters validado con 10.000
        simulaciones Monte Carlo (research/ensemble_forecast.py). · Solo con
        fines educativos; no constituye asesoría de inversión.
      </footer>
    </main>
  );
}
