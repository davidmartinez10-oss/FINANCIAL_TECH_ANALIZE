import { fetchT } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Sonda por proveedor: una consulta mínima a cada fuente externa, con límite de
// tiempo, para saber desde el propio servidor cuál responde y en cuánto.
const PROBES: { name: string; url: string; headers?: Record<string, string> }[] = [
  {
    name: "Yahoo · precios",
    url: "https://query1.finance.yahoo.com/v8/finance/chart/NVDA?range=5d&interval=1d",
    headers: { "User-Agent": "Mozilla/5.0" },
  },
  {
    name: "Yahoo · noticias",
    url: "https://query1.finance.yahoo.com/v1/finance/search?q=NVDA&quotesCount=0&newsCount=3",
    headers: { "User-Agent": "Mozilla/5.0" },
  },
  {
    name: "FRED · no se usa en ejecución (se sirve instantánea)",
    url: "https://fred.stlouisfed.org/graph/fredgraph.csv?id=PCOALAUUSDM",
    headers: { "User-Agent": "Mozilla/5.0 (compatible; MacroMarkets/1.0)" },
  },
  {
    name: "Banco Mundial · PIB",
    url: "https://api.worldbank.org/v2/country/COL/indicator/NY.GDP.MKTP.CD?format=json&mrv=1",
  },
  {
    name: "UN Comtrade · comercio",
    url: "https://comtradeapi.un.org/public/v1/preview/C/A/HS?reporterCode=170&period=2025&cmdCode=72&flowCode=M&partnerCode=0",
  },
  {
    name: "datos.gov.co · TRM",
    url: "https://www.datos.gov.co/resource/32sa-8pi3.json?$order=vigenciadesde%20DESC&$limit=1",
  },
];

async function probe(p: (typeof PROBES)[number]) {
  const t0 = Date.now();
  try {
    const res = await fetchT(p.url, { headers: p.headers, cache: "no-store" }, 8000);
    const body = await res.text();
    return { name: p.name, ok: res.ok, status: res.status, ms: Date.now() - t0, bytes: body.length };
  } catch (e) {
    return { name: p.name, ok: false, status: 0, ms: Date.now() - t0, error: String((e as Error).message) };
  }
}

// Diagnóstico: confirma si las variables de entorno llegan al runtime SIN
// exponer su valor (solo presencia + longitud + prefijo de las claves).
export async function GET() {
  const fmp = process.env.FMP_API_KEY ?? "";
  const groq = process.env.GROQ_API_KEY ?? "";

  // Prueba en vivo de FMP (1 cotización) para confirmar que la key es válida.
  let fmpLive: { ok: boolean; detail: string } = { ok: false, detail: "no probado" };
  if (fmp) {
    try {
      const res = await fetchT(
        `https://financialmodelingprep.com/api/v3/quote/AAPL?apikey=${fmp}`,
        { cache: "no-store" }
      );
      const json = await res.json();
      if (Array.isArray(json) && json[0]?.price) {
        fmpLive = { ok: true, detail: `AAPL=$${json[0].price}` };
      } else {
        fmpLive = {
          ok: false,
          detail:
            json?.["Error Message"] ?? `respuesta inesperada (HTTP ${res.status})`,
        };
      }
    } catch (e) {
      fmpLive = { ok: false, detail: String((e as Error).message) };
    }
  }

  const providers = await Promise.all(PROBES.map(probe));

  return Response.json(
    {
      providers,
      env: {
        FMP_API_KEY: {
          present: !!fmp,
          length: fmp.length,
        },
        GROQ_API_KEY: {
          present: !!groq,
          length: groq.length,
          validPrefix: groq.startsWith("gsk_"),
        },
      },
      fmpLiveCheck: fmpLive,
      hint: fmp
        ? fmpLive.ok
          ? "FMP operativo."
          : "FMP rechaza la key (las cuentas posteriores a ago-2025 no tienen los endpoints /api/v3). No bloquea la plataforma: Yahoo es la fuente principal y FMP solo un respaldo."
        : "Sin FMP_API_KEY. No hace falta: Yahoo es la fuente principal y FMP solo un respaldo opcional.",
      asOf: new Date().toISOString(),
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
