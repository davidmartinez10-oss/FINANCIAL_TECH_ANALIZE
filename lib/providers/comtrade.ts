// ─────────────────────────────────────────────────────────────────────────
// Proveedor: UN Comtrade, endpoint público de vista previa (sin API key).
//
// Límites del endpoint público: un solo período por llamada y hasta 500
// registros. Por eso se consulta año por año y se guarda en memoria el
// resultado (los datos anuales cambian muy poco).
//
// Valores: importaciones en USD CIF, exportaciones en USD FOB. El peso neto
// (kg) no siempre viene informado a nivel de capítulo.
// ─────────────────────────────────────────────────────────────────────────

const COMTRADE = "https://comtradeapi.un.org/public/v1/preview/C/A/HS";
export const COLOMBIA = 170;

export interface ComtradeRecord {
  year: number;
  flow: "M" | "X";
  cmdCode: string;
  partnerCode: number;
  valueUsd: number | null;
  netWgtKg: number | null;
}

export function parseComtrade(json: any): ComtradeRecord[] {
  if (!json || !Array.isArray(json.data)) {
    throw new Error(`Comtrade: ${json?.error || "respuesta inesperada"}`);
  }
  return (json.data as any[]).map((r) => {
    const value = r.primaryValue ?? r.cifvalue ?? r.fobvalue;
    const wgt = Number(r.netWgt);
    return {
      year: Number(r.refYear ?? r.period),
      flow: r.flowCode === "X" ? "X" : "M",
      cmdCode: String(r.cmdCode),
      partnerCode: Number(r.partnerCode),
      valueUsd: value != null && Number.isFinite(Number(value)) ? Number(value) : null,
      netWgtKg: Number.isFinite(wgt) && wgt > 0 ? wgt : null,
    } satisfies ComtradeRecord;
  });
}

const cache = new Map<string, { at: number; data: ComtradeRecord[] }>();
const TTL_MS = 12 * 3600 * 1000;

export async function fetchComtrade(opts: {
  period: number;
  cmdCodes: string[];
  flows: ("M" | "X")[];
  partner?: number; // 0 = mundo; sin definir = todos los socios
  reporter?: number;
}): Promise<ComtradeRecord[]> {
  const params = new URLSearchParams({
    reporterCode: String(opts.reporter ?? COLOMBIA),
    period: String(opts.period),
    cmdCode: opts.cmdCodes.join(","),
    flowCode: opts.flows.join(","),
  });
  if (opts.partner !== undefined) params.set("partnerCode", String(opts.partner));
  const url = `${COMTRADE}?${params.toString()}`;

  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.data;

  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    next: { revalidate: 86_400 },
  });
  if (!res.ok) throw new Error(`Comtrade HTTP ${res.status} (${opts.period})`);
  const data = parseComtrade(await res.json());
  cache.set(url, { at: Date.now(), data });
  return data;
}

// Códigos de socio de Comtrade (M49, con las particularidades de Comtrade:
// 842 EE.UU., 699 India, 251 Francia, 757 Suiza, 579 Noruega, 490 Otros Asia).
export const PARTNER_NAMES: Record<number, string> = {
  12: "Argelia", 32: "Argentina", 36: "Australia", 40: "Austria",
  48: "Baréin", 56: "Bélgica", 68: "Bolivia", 76: "Brasil",
  100: "Bulgaria", 124: "Canadá", 152: "Chile", 156: "China",
  188: "Costa Rica", 203: "Chequia", 208: "Dinamarca",
  214: "Rep. Dominicana", 218: "Ecuador", 222: "El Salvador",
  246: "Finlandia", 251: "Francia", 276: "Alemania", 300: "Grecia",
  320: "Guatemala", 340: "Honduras", 344: "Hong Kong", 348: "Hungría",
  360: "Indonesia", 364: "Irán", 372: "Irlanda", 376: "Israel",
  380: "Italia", 392: "Japón", 398: "Kazajistán", 404: "Kenia",
  410: "Corea del Sur", 442: "Luxemburgo", 458: "Malasia", 484: "México",
  490: "Otros Asia (Taiwán)", 504: "Marruecos", 512: "Omán",
  528: "Países Bajos", 554: "Nueva Zelanda", 566: "Nigeria", 579: "Noruega",
  586: "Pakistán", 591: "Panamá", 600: "Paraguay", 604: "Perú",
  608: "Filipinas", 616: "Polonia", 620: "Portugal", 634: "Catar",
  642: "Rumania", 643: "Rusia", 682: "Arabia Saudita", 688: "Serbia",
  699: "India", 702: "Singapur", 703: "Eslovaquia", 704: "Vietnam",
  705: "Eslovenia", 710: "Sudáfrica", 724: "España", 752: "Suecia",
  757: "Suiza", 764: "Tailandia", 780: "Trinidad y Tobago", 784: "Emiratos Árabes",
  792: "Turquía", 804: "Ucrania", 818: "Egipto", 826: "Reino Unido",
  838: "Zonas francas", 842: "Estados Unidos", 858: "Uruguay", 862: "Venezuela",
  899: "No especificado",
};

export const partnerName = (code: number) =>
  PARTNER_NAMES[code] ?? `Código ${code}`;
