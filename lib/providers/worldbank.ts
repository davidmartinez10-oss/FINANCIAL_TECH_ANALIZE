// ─────────────────────────────────────────────────────────────────────────
// Proveedor: Banco Mundial (World Development Indicators), API v2 pública.
// Sin API key. Datos anuales; la respuesta es `[metadatos, registros]`.
// ─────────────────────────────────────────────────────────────────────────

const WB_BASE = "https://api.worldbank.org/v2";

export interface WbPoint {
  iso3: string;
  year: number;
  value: number | null;
}

export function parseWorldBank(json: any): WbPoint[] {
  if (!Array.isArray(json) || json.length < 2 || !Array.isArray(json[1])) {
    const msg = json?.[0]?.message?.[0]?.value ?? "respuesta inesperada";
    throw new Error(`Banco Mundial: ${msg}`);
  }
  return (json[1] as any[])
    .map((r) => ({
      iso3: String(r.countryiso3code || r.country?.id || ""),
      year: Number(r.date),
      value:
        r.value != null && Number.isFinite(Number(r.value))
          ? Number(r.value)
          : null,
    }))
    .filter((p) => p.iso3 && Number.isFinite(p.year));
}

export async function fetchWorldBank(
  countries: string[],
  indicator: string,
  fromYear: number,
  toYear: number
): Promise<WbPoint[]> {
  const url =
    `${WB_BASE}/country/${countries.join(";")}/indicator/${indicator}` +
    `?format=json&date=${fromYear}:${toYear}&per_page=2000`;
  const res = await fetch(url, { next: { revalidate: 86_400 } });
  if (!res.ok) throw new Error(`Banco Mundial HTTP ${res.status} (${indicator})`);
  return parseWorldBank(await res.json());
}
