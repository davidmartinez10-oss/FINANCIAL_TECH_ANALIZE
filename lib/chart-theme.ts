// Tema común de gráficas (Recharts) sobre la superficie oscura de la app.
// Paleta categórica en orden fijo, validada contra la superficie #14161c
// (banda de luminosidad, separación para daltonismo y contraste ≥ 3:1).
// El color sigue a la entidad: no se reasigna al filtrar series.

export const SERIES = {
  blue: "#338ced",
  orange: "#e76624",
  aqua: "#00a888",
  yellow: "#d28e05",
  magenta: "#e24d8b",
  green: "#0aac23",
  violet: "#9887ef",
  red: "#eb6263",
} as const;

export const INK = {
  primary: "#f0f2f6",
  secondary: "#9aa1b2",
  grid: "rgba(255,255,255,0.06)",
  axis: "rgba(255,255,255,0.18)",
};

export const AXIS_TICK = { fill: INK.secondary, fontSize: 11 };

export const TOOLTIP_STYLE = {
  background: "#14161c",
  border: "1px solid rgba(255,255,255,0.14)",
  borderRadius: 10,
  fontSize: 12,
  color: INK.primary,
  boxShadow: "0 8px 28px -8px rgba(4,8,20,0.7)",
};
