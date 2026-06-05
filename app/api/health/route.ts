import { fmpEnabled } from "@/lib/providers/fmp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Diagnóstico: confirma si las variables de entorno llegan al runtime SIN
// exponer su valor (solo presencia + longitud + prefijo de las claves).
export async function GET() {
  const fmp = process.env.FMP_API_KEY ?? "";
  const groq = process.env.GROQ_API_KEY ?? "";

  // Prueba en vivo de FMP (1 cotización) para confirmar que la key es válida.
  let fmpLive: { ok: boolean; detail: string } = { ok: false, detail: "no probado" };
  if (fmp) {
    try {
      const res = await fetch(
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

  return Response.json(
    {
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
          : "FMP_API_KEY presente pero la API la rechaza: regenérala o revisa el plan."
        : "FMP_API_KEY no llega al runtime: revísala en Vercel → Settings → Environment Variables y redespliega.",
      asOf: new Date().toISOString(),
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
