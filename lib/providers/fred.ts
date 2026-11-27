// ─────────────────────────────────────────────────────────────────────────
// Referencias MENSUALES de commodities sin futuro líquido en Yahoo (carbón
// térmico, mineral de hierro spot) y de energía, más el índice de precios del
// acero. Las series de precios son del FMI (Primary Commodity Prices)
// redistribuidas por FRED; el índice es del BLS de EE.UU.
//
// FRED no responde desde los servidores de Vercel (medido el 27-nov-2026 en
// /api/health: sin respuesta en 8 s), así que en ejecución NO se consulta. Las
// series se leen de data/benchmarks_snapshot.json, que se actualiza con
// `node scripts/update-benchmarks.mjs` desde cualquier equipo donde FRED sí
// responda. Son datos mensuales: basta refrescarlos una vez al mes.
// ─────────────────────────────────────────────────────────────────────────
import snapshot from "@/data/benchmarks_snapshot.json";
import type { BenchmarkPoint } from "@/lib/types";

const SNAP = snapshot as unknown as {
  retrieved: string; // YYYY-MM-DD de la última descarga
  series: Record<string, [string, number][]>;
};

// Fecha de corte de la instantánea, para mostrarla junto a las cifras.
export const BENCHMARKS_RETRIEVED = SNAP.retrieved;

// Serie mensual desde la instantánea. Asíncrona para no cambiar a quien la usa.
export async function fetchFredSeries(id: string, fromYear = 2016): Promise<BenchmarkPoint[]> {
  const rows = SNAP.series[id];
  if (!rows || rows.length === 0) throw new Error(`sin datos guardados para ${id}`);
  return rows
    .filter(([d]) => Number(d.slice(0, 4)) >= fromYear)
    .map(([d, v]) => ({ d, v }));
}
