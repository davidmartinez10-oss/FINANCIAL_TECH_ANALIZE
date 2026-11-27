// Boletín siderúrgico: una edición por mes, cada una en un archivo JSON de
// data/bulletins/AAAA-MM.json. Las páginas /boletin y /boletin/[id] se
// generan al compilar leyendo esa carpeta, así que publicar una edición es
// agregar un archivo y desplegar.
//
// La validación de abajo corre al compilar: una edición incompleta, con una
// cifra sin unidad o con una fuente que no existe, hace fallar el build en
// vez de publicarse a medias.
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

export interface BulletinIndicator {
  label: string;
  value: string; // la cifra, ya formateada (coma decimal)
  unit: string; // obligatorio: USD/tonelada, COP por USD, %, millones de USD…
  change?: string; // variación con su base, p. ej. "+24,3 % frente a agosto"
  period: string; // a qué fecha o período corresponde
  sourceId: string;
}

export interface BulletinSection {
  title: string;
  paragraphs: string[];
}

export interface BulletinWatch {
  what: string;
  when: string;
  why: string;
}

export interface BulletinSource {
  id: string;
  publisher: string;
  title: string;
  date: string;
  url: string;
}

export interface Bulletin {
  id: string; // AAAA-MM, igual al nombre del archivo
  number: number;
  title: string;
  published: string; // AAAA-MM-DD
  cutoff: string; // AAAA-MM-DD: fecha de corte de la información
  headline: string;
  keyPoints: string[];
  indicators: BulletinIndicator[];
  sections: BulletinSection[];
  watch: BulletinWatch[];
  dataNotes: string[]; // límites y vacíos de la información de esta edición
  sources: BulletinSource[];
}

const DIR = path.join(process.cwd(), "data", "bulletins");
const ID_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function validate(b: Bulletin, file: string): Bulletin {
  const fail = (msg: string): never => {
    throw new Error(`Boletín ${file}: ${msg}`);
  };
  const text = (v: unknown, name: string) => {
    if (typeof v !== "string" || v.trim() === "") fail(`falta «${name}»`);
  };
  if (!ID_RE.test(b.id) || `${b.id}.json` !== file) fail("el id debe ser AAAA-MM e igual al nombre del archivo");
  if (!Number.isInteger(b.number) || b.number < 1) fail("«number» debe ser un entero desde 1");
  text(b.title, "title");
  text(b.headline, "headline");
  if (!DATE_RE.test(b.published) || !DATE_RE.test(b.cutoff)) fail("«published» y «cutoff» van como AAAA-MM-DD");
  if (!Array.isArray(b.keyPoints) || b.keyPoints.length < 3) fail("se necesitan al menos 3 puntos clave");
  if (!Array.isArray(b.sections) || b.sections.length < 2) fail("se necesitan al menos 2 secciones");
  if (!Array.isArray(b.indicators) || b.indicators.length < 5) fail("se necesitan al menos 5 cifras");
  if (!Array.isArray(b.sources) || b.sources.length === 0) fail("faltan las fuentes");
  if (!Array.isArray(b.watch) || !Array.isArray(b.dataNotes)) fail("«watch» y «dataNotes» deben ser listas");

  const ids = new Set<string>();
  for (const s of b.sources) {
    for (const k of ["id", "publisher", "title", "date", "url"] as const) text(s[k], `sources.${k}`);
    if (!/^https:\/\//.test(s.url)) fail(`la fuente «${s.id}» no tiene una dirección https`);
    if (ids.has(s.id)) fail(`fuente repetida: ${s.id}`);
    ids.add(s.id);
  }
  for (const i of b.indicators) {
    for (const k of ["label", "value", "unit", "period", "sourceId"] as const) text(i[k], `indicators.${k} (${i.label})`);
    if (!ids.has(i.sourceId)) fail(`la cifra «${i.label}» cita una fuente que no está en la lista: ${i.sourceId}`);
  }
  for (const s of b.sections) {
    text(s.title, "sections.title");
    if (!Array.isArray(s.paragraphs) || s.paragraphs.length === 0) fail(`la sección «${s.title}» no tiene texto`);
  }
  for (const w of b.watch) for (const k of ["what", "when", "why"] as const) text(w[k], `watch.${k}`);
  return b;
}

// Todas las ediciones, de la más reciente a la más antigua.
export function loadBulletins(): Bulletin[] {
  const list = readdirSync(DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => validate(JSON.parse(readFileSync(path.join(DIR, f), "utf8")) as Bulletin, f))
    .sort((a, b) => b.id.localeCompare(a.id));
  const numbers = new Set(list.map((b) => b.number));
  if (numbers.size !== list.length) throw new Error("Boletines: hay dos ediciones con el mismo número");
  return list;
}
