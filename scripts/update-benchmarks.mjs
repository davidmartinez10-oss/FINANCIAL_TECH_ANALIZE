#!/usr/bin/env node
// Actualiza data/benchmarks_snapshot.json con las series mensuales de FRED.
//
//   node scripts/update-benchmarks.mjs
//
// Lo corre cada mañana el flujo .github/workflows/update-data.yml. También se
// puede correr a mano desde un equipo donde fred.stlouisfed.org responda (los
// servidores de Vercel no): después, commit y push, y Vercel publica.
import { readFileSync, writeFileSync } from "node:fs";

const IDS = ["PCOALAUUSDM", "PIORECRUSDM", "POILBREUSDM", "PNGASEUUSDM", "WPU101"];
const FROM_YEAR = 2016;
const url = `https://fred.stlouisfed.org/graph/fredgraph.csv?id=${IDS.join(",")}`;

const res = await fetch(url, {
  headers: { "User-Agent": "Mozilla/5.0 (compatible; MacroMarkets/1.0)" },
  signal: AbortSignal.timeout(30_000),
});
if (!res.ok) throw new Error(`FRED HTTP ${res.status}`);
const lines = (await res.text()).trim().split(/\r?\n/);
const header = lines[0].split(",");
if (!/^observation_date|^DATE/i.test(header[0])) throw new Error("FRED: la respuesta no es CSV");

const series = Object.fromEntries(IDS.map((id) => [id, []]));
for (const line of lines.slice(1)) {
  const cells = line.split(",");
  if (Number(cells[0].slice(0, 4)) < FROM_YEAR) continue;
  header.slice(1).forEach((id, i) => {
    const raw = cells[i + 1];
    const v = Number(raw);
    if (series[id] && raw !== undefined && raw !== "" && raw !== "." && Number.isFinite(v)) {
      series[id].push([cells[0].slice(0, 7), v]);
    }
  });
}
for (const id of IDS) {
  if (series[id].length < 12) throw new Error(`${id}: solo ${series[id].length} datos; no se guarda`);
}

// Solo se reescribe si los datos cambiaron: así la fecha «retrieved» marca la
// última vez que hubo cifras nuevas y la corrida diaria no genera commits vacíos.
const file = new URL("../data/benchmarks_snapshot.json", import.meta.url);
let previous = null;
try {
  previous = JSON.parse(readFileSync(file, "utf8")).series;
} catch {
  /* primera vez o archivo dañado: se escribe de nuevo */
}
if (previous && JSON.stringify(previous) === JSON.stringify(series)) {
  console.log("Sin cambios: las series ya están al día.");
  process.exit(0);
}

const body =
  `{\n  "retrieved": "${new Date().toISOString().slice(0, 10)}",\n` +
  `  "source": "FRED (FMI Primary Commodity Prices y BLS), descarga CSV pública",\n  "series": {\n` +
  IDS.map((id) => `    "${id}": ${JSON.stringify(series[id])}`).join(",\n") +
  `\n  }\n}\n`;
writeFileSync(file, body);
for (const id of IDS) console.log(id, series[id].length, "datos · último", series[id].at(-1).join(" = "));
