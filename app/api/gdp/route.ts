// ─────────────────────────────────────────────────────────────────────────
// /api/gdp — PIB de Colombia frente a las principales potencias y pares
// regionales. Fuente: Banco Mundial (WDI), datos anuales.
//
//   NY.GDP.MKTP.CD     PIB a precios corrientes (USD)
//   NY.GDP.MKTP.KD.ZG  Crecimiento real del PIB (% anual)
//   NY.GDP.PCAP.CD     PIB per cápita (USD corrientes)
// ─────────────────────────────────────────────────────────────────────────
import { fetchWorldBank, type WbPoint } from "@/lib/providers/worldbank";
import type { GdpResponse, GdpCountry } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COUNTRIES: Pick<GdpCountry, "iso3" | "name" | "flag" | "role">[] = [
  { iso3: "COL", name: "Colombia", flag: "🇨🇴", role: "base" },
  { iso3: "USA", name: "Estados Unidos", flag: "🇺🇸", role: "potencia" },
  { iso3: "CHN", name: "China", flag: "🇨🇳", role: "potencia" },
  { iso3: "EUU", name: "Unión Europea", flag: "🇪🇺", role: "potencia" },
  { iso3: "JPN", name: "Japón", flag: "🇯🇵", role: "potencia" },
  { iso3: "DEU", name: "Alemania", flag: "🇩🇪", role: "potencia" },
  { iso3: "IND", name: "India", flag: "🇮🇳", role: "potencia" },
  { iso3: "GBR", name: "Reino Unido", flag: "🇬🇧", role: "potencia" },
  { iso3: "RUS", name: "Rusia", flag: "🇷🇺", role: "potencia" },
  { iso3: "BRA", name: "Brasil", flag: "🇧🇷", role: "par" },
  { iso3: "MEX", name: "México", flag: "🇲🇽", role: "par" },
];

const FROM_YEAR = 2000;

type Table = Map<string, Map<number, number>>; // iso3 → año → valor

function toTable(points: WbPoint[]): Table {
  const t: Table = new Map();
  for (const p of points) {
    if (p.value == null) continue;
    if (!t.has(p.iso3)) t.set(p.iso3, new Map());
    t.get(p.iso3)!.set(p.year, p.value);
  }
  return t;
}

// Último dato disponible de un país en o antes de `year`.
function latest(t: Table, iso3: string, year: number) {
  const m = t.get(iso3);
  if (!m) return null;
  for (let y = year; y >= FROM_YEAR; y--) {
    const v = m.get(y);
    if (v != null) return { year: y, value: v };
  }
  return null;
}

export async function GET() {
  const errors: string[] = [];
  const iso = COUNTRIES.map((c) => c.iso3);
  const toYear = new Date().getUTCFullYear();

  const [gdpR, growthR, pcR] = await Promise.allSettled([
    fetchWorldBank(iso, "NY.GDP.MKTP.CD", FROM_YEAR, toYear),
    fetchWorldBank(iso, "NY.GDP.MKTP.KD.ZG", FROM_YEAR, toYear),
    fetchWorldBank(iso, "NY.GDP.PCAP.CD", FROM_YEAR, toYear),
  ]);
  const unwrap = (r: PromiseSettledResult<WbPoint[]>, label: string): Table => {
    if (r.status === "fulfilled") return toTable(r.value);
    errors.push(`${label}: ${String((r.reason as Error)?.message ?? r.reason)}`);
    return new Map();
  };
  const gdp = unwrap(gdpR, "PIB corriente");
  const growth = unwrap(growthR, "Crecimiento real");
  const perCap = unwrap(pcR, "PIB per cápita");

  // Año de referencia = último año con PIB de Colombia.
  const colYears = [...(gdp.get("COL")?.keys() ?? [])];
  const latestYear = colYears.length ? Math.max(...colYears) : null;
  const colGdp = latestYear ? gdp.get("COL")!.get(latestYear)! : null;

  const countries: GdpCountry[] = COUNTRIES.map((c) => {
    const g = latestYear ? latest(gdp, c.iso3, latestYear) : null;
    const gr = latestYear ? latest(growth, c.iso3, latestYear) : null;
    const pc = latestYear ? latest(perCap, c.iso3, latestYear) : null;
    // La razón contra Colombia solo es válida si ambos datos son del mismo año.
    const sameYear = g != null && g.year === latestYear && colGdp != null;
    return {
      ...c,
      year: g?.year ?? latestYear ?? 0,
      gdpUsd: g?.value ?? null,
      growthPct: gr?.value ?? null,
      perCapitaUsd: pc?.value ?? null,
      colombiaSharePct: sameYear ? (colGdp! / g!.value) * 100 : null,
      multiple: sameYear ? g!.value / colGdp! : null,
    };
  });

  const years: number[] = [];
  if (latestYear) for (let y = FROM_YEAR; y <= latestYear; y++) years.push(y);

  const growthSeries = years.map((y) => {
    const row: Record<string, number | null> = { year: y };
    for (const c of COUNTRIES) row[c.iso3] = growth.get(c.iso3)?.get(y) ?? null;
    return row;
  });
  const ratioSeries = years.map((y) => {
    const row: Record<string, number | null> = { year: y };
    const col = gdp.get("COL")?.get(y);
    for (const c of COUNTRIES) {
      if (c.iso3 === "COL") continue;
      const other = gdp.get(c.iso3)?.get(y);
      row[c.iso3] = col != null && other ? (col / other) * 100 : null;
    }
    return row;
  });

  const body: GdpResponse = {
    asOf: new Date().toISOString(),
    source: "Banco Mundial · World Development Indicators",
    latestYear,
    countries,
    growthSeries,
    ratioSeries,
    errors,
  };
  return Response.json(body, {
    headers: { "Cache-Control": "s-maxage=21600, stale-while-revalidate=86400" },
  });
}
