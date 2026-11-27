"use client";

import { useIndicators } from "@/lib/use-indicators";
import { Delta } from "@/components/QuoteTable";
import { fmtPrice } from "@/lib/format";

// Cinta superior: lo esencial de un vistazo, en todas las páginas.
const PICK: [string, string][] = [
  ["COP=X", "USD/COP"],
  ["BZ=F", "Brent"],
  ["CL=F", "WTI"],
  ["HRC=F", "Acero HRC"],
  ["TIO=F", "Mineral Fe"],
  ["^GSPC", "S&P 500"],
  ["^IXIC", "Nasdaq"],
  ["^VIX", "VIX"],
  ["DX-Y.NYB", "DXY"],
  ["GC=F", "Oro"],
  ["NVDA", "NVDA"],
];

export default function TickerBar() {
  const { data } = useIndicators();
  const bySym = new Map((data?.rows ?? []).map((r) => [r.symbol, r]));
  const items = PICK.map(([s, label]) => ({ label, q: bySym.get(s) })).filter((x) => x.q);

  return (
    <div className="ticker" aria-label="Cotizaciones principales">
      <div className="ticker-inner">
        {items.length === 0 ? (
          <span className="ticker-empty">Cargando cotizaciones…</span>
        ) : (
          items.map(({ label, q }) => (
            <span key={label} className="ticker-item">
              <span className="ticker-name">{label}</span>
              <span className="ticker-price">{fmtPrice(q!.price)}</span>
              <Delta v={q!.changePct} />
            </span>
          ))
        )}
      </div>
    </div>
  );
}
