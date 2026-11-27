// Formateadores compartidos (convención es-CO: punto de miles, coma decimal).

const nf = (max: number, min = 0) =>
  new Intl.NumberFormat("es-CO", {
    maximumFractionDigits: max,
    minimumFractionDigits: min,
  });

export const fmtNum = (v: number | null | undefined, decimals = 2) =>
  v == null || !Number.isFinite(v) ? "—" : nf(decimals, decimals).format(v);

export const fmtPct = (v: number | null | undefined, decimals = 2) =>
  v == null || !Number.isFinite(v)
    ? "—"
    : `${v >= 0 ? "+" : "−"}${nf(decimals, decimals).format(Math.abs(v))} %`;

// USD compacto: 1.814.604.238 → "US$1.815 M"; 31.531 → "US$32 mil".
export function fmtUsd(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  const a = Math.abs(v);
  if (a >= 1e9) return `US$${nf(0).format(v / 1e6)} M`;
  if (a >= 1e6) return `US$${nf(1).format(v / 1e6)} M`;
  if (a >= 1e3) return `US$${nf(0).format(v / 1e3)} mil`;
  return `US$${nf(0).format(v)}`;
}

// PIB en billones de USD (10^12, convención en español): 4,2e11 → "0,42".
export const fmtTrillions = (v: number | null | undefined) =>
  v == null || !Number.isFinite(v) ? "—" : nf(2, 2).format(v / 1e12);

// Peso desde kg: "47,8 Mt", "663 t".
export function fmtWeight(kg: number | null | undefined): string {
  if (kg == null || !Number.isFinite(kg) || kg <= 0) return "—";
  const t = kg / 1000;
  if (t >= 1e6) return `${nf(1).format(t / 1e6)} Mt`;
  if (t >= 1e3) return `${nf(1).format(t / 1e3)} kt`;
  return `${nf(t < 10 ? 1 : 0).format(t)} t`;
}

// Precio con decimales según magnitud.
export const fmtPrice = (v: number) =>
  nf(v >= 1000 ? 0 : v >= 10 ? 2 : 3, v >= 1000 ? 0 : 2).format(v);

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
// "2026-09" → "sep 2026"
export const fmtMonth = (ym: string) => {
  const [y, m] = ym.split("-");
  return `${MONTHS[Number(m) - 1] ?? m} ${y}`;
};
