// ─────────────────────────────────────────────────────────────────────────
// Proveedor: FRED (Federal Reserve Bank of St. Louis), descarga CSV pública.
// No requiere API key y responde desde IPs de servidor. Se usa para precios
// de referencia MENSUALES de commodities que no tienen un futuro líquido en
// Yahoo (carbón térmico, mineral de hierro spot) y como respaldo de energía.
//
// Las series de precios son del FMI (Primary Commodity Prices) redistribuidas
// por FRED; el índice de precios del acero es del BLS de EE.UU.
// ─────────────────────────────────────────────────────────────────────────
import type { BenchmarkPoint } from "@/lib/types";

const FRED_CSV = "https://fred.stlouisfed.org/graph/fredgraph.csv";

// CSV: "observation_date,<ID>\n2026-09-01,153.84\n..." (celdas vacías = sin dato)
export function parseFredCsv(csv: string, fromYear = 2016): BenchmarkPoint[] {
  const lines = csv.trim().split(/\r?\n/);
  if (lines.length < 2 || !/^observation_date|^DATE/i.test(lines[0])) {
    throw new Error("FRED: respuesta no es CSV");
  }
  const out: BenchmarkPoint[] = [];
  for (const line of lines.slice(1)) {
    const [date, raw] = line.split(",");
    const v = Number(raw);
    if (!date || raw === undefined || raw === "" || raw === "." || !Number.isFinite(v)) {
      continue;
    }
    if (Number(date.slice(0, 4)) < fromYear) continue;
    out.push({ d: date.slice(0, 7), v });
  }
  return out;
}

export async function fetchFredSeries(
  id: string,
  fromYear = 2016
): Promise<BenchmarkPoint[]> {
  const res = await fetch(`${FRED_CSV}?id=${encodeURIComponent(id)}`, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; MacroMarkets/1.0)" },
    next: { revalidate: 43_200 },
  });
  if (!res.ok) throw new Error(`FRED HTTP ${res.status} (${id})`);
  const points = parseFredCsv(await res.text(), fromYear);
  if (points.length === 0) throw new Error(`FRED sin datos para ${id}`);
  return points;
}
