// Tema común de gráficas (Recharts). Los colores son variables CSS definidas
// en app/globals.css, con un valor para el tema claro y otro para el oscuro,
// de modo que las gráficas cambian con el interruptor sin volver a renderizar.
//
// Paleta categórica en orden fijo, validada en cada superficie (banda de
// luminosidad, separación para daltonismo y contraste ≥ 3:1).
// El color sigue a la entidad: no se reasigna al filtrar series.

export const SERIES = {
  blue: "var(--s-blue)",
  orange: "var(--s-orange)",
  aqua: "var(--s-aqua)",
  yellow: "var(--s-yellow)",
  magenta: "var(--s-magenta)",
  green: "var(--s-green)",
  violet: "var(--s-violet)",
  red: "var(--s-red)",
} as const;

export const INK = {
  primary: "var(--chart-ink)",
  secondary: "var(--chart-ink-2)",
  grid: "var(--chart-grid)",
  axis: "var(--chart-axis)",
  surface: "var(--panel-solid)",
  cursor: "var(--chart-cursor)",
};

export const AXIS_TICK = { fill: INK.secondary, fontSize: 11 };

export const TOOLTIP_STYLE = {
  background: "var(--panel-solid)",
  border: "1px solid var(--hairline-strong)",
  borderRadius: 10,
  fontSize: 12,
  color: INK.primary,
  boxShadow: "var(--shadow-md)",
};
