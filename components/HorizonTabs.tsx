"use client";

import { HORIZONS } from "@/lib/forecast";

export default function HorizonTabs({
  value,
  onChange,
}: {
  value: number;
  onChange: (days: number) => void;
}) {
  return (
    <div className="horizon-tabs" role="tablist" aria-label="Horizonte del pronóstico">
      {HORIZONS.map((h) => (
        <button
          key={h.key}
          role="tab"
          aria-selected={value === h.days}
          className={`horizon-tab${value === h.days ? " active" : ""}`}
          onClick={() => onChange(h.days)}
        >
          {h.label}
        </button>
      ))}
    </div>
  );
}
