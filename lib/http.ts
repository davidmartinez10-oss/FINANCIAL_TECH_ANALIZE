// fetch con límite de tiempo. Ninguna llamada a un proveedor externo debe ir
// sin él: si un proveedor acepta la conexión y no responde, la ruta entera se
// queda colgada hasta que Vercel la corta y la página no muestra nada. Con el
// límite, ese proveedor se convierte en un error visible y el resto se sirve.
export const DEFAULT_TIMEOUT_MS = 8000;

export async function fetchT(
  url: string,
  init: RequestInit & { next?: { revalidate?: number } } = {},
  ms = DEFAULT_TIMEOUT_MS
): Promise<Response> {
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(ms) });
  } catch (e) {
    const name = (e as Error)?.name;
    if (name === "TimeoutError" || name === "AbortError") {
      throw new Error(`sin respuesta en ${Math.round(ms / 1000)} s (${new URL(url).hostname})`);
    }
    throw e;
  }
}
