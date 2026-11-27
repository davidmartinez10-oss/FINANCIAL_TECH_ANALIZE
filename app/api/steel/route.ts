// ─────────────────────────────────────────────────────────────────────────
// /api/steel — módulo microeconómico de siderurgia (Colombia).
//
//  · trade  → comercio exterior por partida arancelaria (UN Comtrade, en
//             vivo). Si Comtrade no responde se sirve la instantánea guardada
//             en data/steel_market.json, marcada como `live: false`.
//  · market → oferta nacional, hechos del mercado y análisis, curados con
//             fuente y fecha en data/steel_market.json.
// ─────────────────────────────────────────────────────────────────────────
import {
  fetchComtrade,
  partnerName,
  type ComtradeRecord,
} from "@/lib/providers/comtrade";
import marketJson from "@/data/steel_market.json";
import type {
  SteelResponse,
  SteelMarket,
  SteelTrade,
  TradeRow,
  TradeOrigin,
} from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60; // varias consultas secuenciales a Comtrade con pausas

const HS: { code: string; label: string; group: string }[] = [
  { code: "72", label: "Hierro y acero (cap. 72)", group: "Acero" },
  { code: "73", label: "Manufacturas de acero (cap. 73)", group: "Acero" },
  { code: "2601", label: "Mineral de hierro", group: "Minerales e insumos" },
  { code: "7204", label: "Chatarra ferrosa", group: "Minerales e insumos" },
  { code: "7202", label: "Ferroaleaciones", group: "Minerales e insumos" },
  { code: "2521", label: "Caliza (castina)", group: "Minerales e insumos" },
  { code: "2522", label: "Cal", group: "Minerales e insumos" },
  { code: "854511", label: "Electrodos de grafito", group: "Minerales e insumos" },
  { code: "2701", label: "Carbón (hulla)", group: "Carbón" },
  { code: "2704", label: "Coque", group: "Carbón" },
  { code: "2709", label: "Petróleo crudo", group: "Combustibles" },
  { code: "2710", label: "Combustibles refinados", group: "Combustibles" },
  { code: "2711", label: "Gas (natural y GLP)", group: "Gas" },
  { code: "271111", label: "Gas natural licuado (GNL)", group: "Gas" },
  { code: "280440", label: "Oxígeno", group: "Gases del aire" },
  { code: "280430", label: "Nitrógeno", group: "Gases del aire" },
  { code: "280421", label: "Argón", group: "Gases del aire" },
];

const N_YEARS = 5;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Snapshot {
  year: number;
  retrieved: string;
  imports: Record<string, { usd: number; kg?: number }>;
  exports: Record<string, { usd: number; kg?: number }>;
}

function emptyRows(): Map<string, TradeRow> {
  return new Map(
    HS.map((h) => [
      h.code,
      {
        ...h,
        importsUsd: {},
        exportsUsd: {},
        importsKg: null,
        exportsKg: null,
        importsUsdPerTon: null,
        exportsUsdPerTon: null,
      },
    ])
  );
}

// Valor unitario (USD/t) del último año. Solo con al menos 100 t: por debajo,
// unas pocas operaciones de producto especial distorsionan el promedio.
const MIN_KG = 100_000;
function unitValue(usd: number | null | undefined, kg: number | null) {
  return usd != null && kg != null && kg >= MIN_KG ? usd / (kg / 1000) : null;
}

function addUnitValues(rows: Iterable<TradeRow>, year: number) {
  const y = String(year);
  for (const r of rows) {
    r.importsUsdPerTon = unitValue(r.importsUsd[y], r.importsKg);
    r.exportsUsdPerTon = unitValue(r.exportsUsd[y], r.exportsKg);
  }
}

function fromSnapshot(snap: Snapshot, errors: string[]): SteelTrade {
  const rows = emptyRows();
  const y = String(snap.year);
  for (const row of rows.values()) {
    const m = snap.imports[row.code];
    const x = snap.exports[row.code];
    row.importsUsd[y] = m?.usd ?? null;
    row.exportsUsd[y] = x?.usd ?? null;
    row.importsKg = m?.kg ?? null;
    row.exportsKg = x?.kg ?? null;
  }
  addUnitValues(rows.values(), snap.year);
  return {
    source: `UN Comtrade · instantánea del ${snap.retrieved}`,
    live: false,
    years: [snap.year],
    latestYear: snap.year,
    rows: [...rows.values()],
    steelOrigins: [],
    errors,
  };
}

async function loadTrade(snap: Snapshot): Promise<SteelTrade> {
  const errors: string[] = [];
  const codes = HS.map((h) => h.code);
  const worldTotals = (period: number) =>
    fetchComtrade({ period, cmdCodes: codes, flows: ["M", "X"], partner: 0 });

  // Último año publicado: se prueba el año pasado y, si aún no hay datos, el anterior.
  let latestYear = new Date().getUTCFullYear() - 1;
  let latest: ComtradeRecord[] = [];
  try {
    latest = await worldTotals(latestYear);
    if (latest.length === 0) {
      latestYear -= 1;
      await sleep(1000);
      latest = await worldTotals(latestYear);
    }
  } catch (e) {
    errors.push(String((e as Error).message));
  }
  if (latest.length === 0) {
    errors.push("Comtrade sin datos en vivo; se muestra la instantánea guardada.");
    return fromSnapshot(snap, errors);
  }

  const years: number[] = [];
  for (let y = latestYear - N_YEARS + 1; y <= latestYear; y++) years.push(y);

  const byYear = new Map<number, ComtradeRecord[]>([[latestYear, latest]]);
  // Secuencial y con pausa: el endpoint público limita la frecuencia.
  for (const y of years) {
    if (byYear.has(y)) continue;
    try {
      await sleep(1000);
      byYear.set(y, await worldTotals(y));
    } catch (e) {
      errors.push(`${y}: ${String((e as Error).message)}`);
    }
  }

  const rows = emptyRows();
  for (const y of years) {
    for (const r of byYear.get(y) ?? []) {
      const row = rows.get(r.cmdCode);
      if (!row || r.partnerCode !== 0) continue;
      if (r.flow === "M") {
        row.importsUsd[String(y)] = r.valueUsd;
        if (y === latestYear) row.importsKg = r.netWgtKg;
      } else {
        row.exportsUsd[String(y)] = r.valueUsd;
        if (y === latestYear) row.exportsKg = r.netWgtKg;
      }
    }
  }

  addUnitValues(rows.values(), latestYear);

  // Orígenes de las importaciones de acero (cap. 72), último año.
  let steelOrigins: TradeOrigin[] = [];
  try {
    await sleep(1000);
    const partners = await fetchComtrade({
      period: latestYear,
      cmdCodes: ["72"],
      flows: ["M"],
    });
    const world =
      partners.find((p) => p.partnerCode === 0)?.valueUsd ??
      rows.get("72")?.importsUsd[String(latestYear)] ??
      null;
    steelOrigins = partners
      .filter((p) => p.partnerCode !== 0 && (p.valueUsd ?? 0) > 0)
      .sort((a, b) => (b.valueUsd ?? 0) - (a.valueUsd ?? 0))
      .slice(0, 10)
      .map((p) => ({
        code: p.partnerCode,
        name: partnerName(p.partnerCode),
        valueUsd: p.valueUsd!,
        sharePct: world ? (p.valueUsd! / world) * 100 : 0,
      }));
  } catch (e) {
    errors.push(`Orígenes: ${String((e as Error).message)}`);
  }

  return {
    source: "UN Comtrade (endpoint público)",
    live: true,
    years,
    latestYear,
    rows: [...rows.values()],
    steelOrigins,
    errors,
  };
}

export async function GET() {
  const { tradeSnapshot, ...market } = marketJson as unknown as SteelMarket & {
    tradeSnapshot: Snapshot;
  };
  const trade = await loadTrade(tradeSnapshot);

  const body: SteelResponse = {
    asOf: new Date().toISOString(),
    trade,
    market: market as SteelMarket,
  };
  return Response.json(body, {
    headers: {
      // Datos anuales: 6 h en CDN solo si la respuesta está completa. Si faltó
      // algún año u orígenes (Comtrade limita la frecuencia), caché corta para
      // que la siguiente visita complete lo que falta.
      "Cache-Control":
        trade.live && trade.errors.length === 0
          ? "s-maxage=21600, stale-while-revalidate=86400"
          : "s-maxage=120, stale-while-revalidate=300",
    },
  });
}
