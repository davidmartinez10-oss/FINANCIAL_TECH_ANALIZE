// Datos Abiertos Colombia (datos.gov.co, API Socrata, sin key).
// TRM certificada por la Superintendencia Financiera: conjunto 32sa-8pi3.
// Cada fila trae el valor y el rango de fechas en el que rige (los fines de
// semana y festivos comparten una sola fila).

const TRM_URL =
  "https://www.datos.gov.co/resource/32sa-8pi3.json?$order=vigenciadesde%20DESC&$limit=";

export interface TrmPoint {
  t: number; // epoch s del inicio de vigencia
  v: number; // COP por USD
  until: number; // epoch s del fin de vigencia
}

export function parseTrm(rows: unknown): TrmPoint[] {
  if (!Array.isArray(rows)) throw new Error("TRM: respuesta inesperada de datos.gov.co");
  const out: TrmPoint[] = [];
  for (const r of rows as Record<string, string>[]) {
    const v = Number(r.valor);
    const t = Date.parse(`${String(r.vigenciadesde).slice(0, 10)}T00:00:00Z`);
    const until = Date.parse(`${String(r.vigenciahasta).slice(0, 10)}T00:00:00Z`);
    if (!Number.isFinite(v) || v <= 0 || !Number.isFinite(t)) continue;
    out.push({ t: t / 1000, v, until: (Number.isFinite(until) ? until : t) / 1000 });
  }
  if (out.length === 0) throw new Error("TRM: sin datos");
  return out.sort((a, b) => a.t - b.t); // ascendente
}

// Último año de TRM (≈ 250 filas hábiles).
export async function fetchTrm(limit = 260): Promise<TrmPoint[]> {
  const res = await fetch(TRM_URL + limit, {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`datos.gov.co HTTP ${res.status}`);
  return parseTrm(await res.json());
}
