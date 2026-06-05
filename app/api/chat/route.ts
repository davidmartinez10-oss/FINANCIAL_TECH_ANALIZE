// ─────────────────────────────────────────────────────────────────────────
// Asistente IA — orquestador multi-agente impulsado por GROQ.
//
// GROQ expone una API compatible con OpenAI (chat/completions con streaming
// SSE), así que se consume con `fetch` nativo sin SDK adicional. Es muy rápido
// (inferencia en LPU) y funciona desde IPs de datacenter/Vercel.
//
// Requiere GROQ_API_KEY en variables de entorno. El modelo se puede ajustar
// con GROQ_MODEL (por defecto llama-3.3-70b-versatile).
// ─────────────────────────────────────────────────────────────────────────

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const DEFAULT_MODEL = "openai/gpt-oss-120b";

// Resumen de la plataforma inyectado como contexto (antes era un tool).
const PLATFORM_CONTEXT = `Datos actuales de la plataforma:
- Portafolios: Min Volatilidad, Volatilidad Media, Máximo Riesgo
- Activos cubiertos: NVDA (NVIDIA, semiconductores/IA), MSFT (Microsoft, software/nube), GOOGL (Google/Alphabet, internet/IA), SOXX (ETF semiconductores iShares), SMH (ETF semiconductores VanEck), TAN (ETF solar Invesco), NLR (ETF nuclear/uranio VanEck), URNM (ETF minería uranio Sprott), SPY (SPDR S&P 500), QQQ (Invesco Nasdaq-100)
- Modelos de pronóstico: Prophet, ARIMAX, XGBoost, Holt-Winters (ensamblados)
- Validación: 10,000 simulaciones Monte Carlo
- Horizonte base: 21 días hábiles (~1 mes), configurable
- Regiones macro: Estados Unidos, China, Unión Europea, Rusia, Colombia, América Latina`;

const SYSTEM_PROMPT = `Eres el Orquestador de Macro Markets, una plataforma de análisis financiero que cubre:
- Pronósticos de portafolios (Min Volatilidad, Volatilidad Media, Máximo Riesgo) con modelos ensamblados Prophet, ARIMAX, XGBoost y Holt-Winters validados con 10,000 simulaciones Monte Carlo
- Análisis de activos: NVDA (NVIDIA), MSFT (Microsoft), GOOGL (Google/Alphabet), SOXX, SMH (semiconductores), TAN (solar), NLR, URNM (nuclear/uranio), SPY (S&P 500), QQQ (Nasdaq-100)
- Estados financieros: ingresos, márgenes, flujo de caja, EBIT, EBITDA, deuda, ratios de valoración
- Condiciones macroeconómicas: EE.UU., China, Unión Europea, Rusia, Colombia, América Latina
- Noticias financieras por sector: tecnología, IA, energía, economía global

Tienes acceso a tres agentes especializados que debes invocar según el tipo de pregunta:

**ALEX - Analista de Datos**: Especialista en análisis técnico, estadísticas, pronósticos cuantitativos, métricas de riesgo (VaR, CVaR), rendimiento de modelos, backtesting. Usa cuando pregunten sobre datos, gráficas, números específicos, probabilidades, Monte Carlo, pesos del ensamble.

**ELENA - Economista**: Experta en macroeconomía global, política monetaria (Fed, BCE, PBOC), ciclos económicos, geopolítica, tasas de interés, inflación, balanza comercial, mercados emergentes, Colombia y América Latina. Usa cuando pregunten sobre macro, economía, política, tipos de cambio, commodities.

**CARLOS - Financista**: Experto en valoración de empresas (DCF, múltiplos EV/EBITDA, P/E), construcción de portafolios (Markowitz, Sharpe), gestión de riesgo, estados financieros, ratios financieros, estrategia de inversión. Usa cuando pregunten sobre valoración, finanzas corporativas, estrategia de inversión.

**PEPE - Agente Comodín**: Para preguntas COMPLETAMENTE fuera del ámbito financiero. Responde con humor inteligente y amable, hace referencias financieras divertidas, e invita al usuario a preguntar sobre mercados. SOLO usar si la pregunta no tiene NINGUNA relación con finanzas, mercados, economía o inversiones.

IMPORTANTE: Siempre identifícate al inicio como uno de los agentes. Formato: "**[Nombre del agente]**: [respuesta]"
Si la pregunta involucra múltiples dominios, puedes combinar perspectivas pero elige el agente principal.
Responde siempre en español. Sé conciso pero completo. Máximo 400 palabras por respuesta.

${PLATFORM_CONTEXT}`;

type ChatRole = "user" | "assistant" | "system";
interface InMsg {
  role: string;
  content: string;
}

export async function POST(request: Request) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return Response.json(
      {
        error:
          "GROQ_API_KEY no configurada. Agrégala en Vercel → Settings → " +
          "Environment Variables (los 3 entornos) y redespliega. " +
          "Obtén tu clave gratis en https://console.groq.com/keys",
      },
      { status: 503 }
    );
  }

  let body: { messages: InMsg[] };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "JSON inválido" }, { status: 400 });
  }

  const history = (body.messages ?? [])
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({ role: m.role as ChatRole, content: m.content }));

  if (!history.length) {
    return Response.json({ error: "messages vacío" }, { status: 400 });
  }

  const model = process.env.GROQ_MODEL || DEFAULT_MODEL;
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  const stream = new ReadableStream({
    async start(controller) {
      const enqueue = (data: object) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));

      try {
        const upstream = await fetch(GROQ_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model,
            messages: [
              { role: "system", content: SYSTEM_PROMPT },
              ...history,
            ],
            temperature: 0.6,
            max_tokens: 1024,
            stream: true,
          }),
        });

        if (!upstream.ok || !upstream.body) {
          const detail = await upstream.text().catch(() => "");
          let msg = `GROQ HTTP ${upstream.status}`;
          try {
            const j = JSON.parse(detail);
            msg = j?.error?.message ?? msg;
          } catch {
            /* texto plano */
          }
          enqueue({ error: msg });
          enqueue({ done: true });
          controller.close();
          return;
        }

        // GROQ devuelve SSE estilo OpenAI: data: {choices:[{delta:{content}}]}
        const reader = upstream.body.getReader();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? ""; // conservar línea incompleta

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith("data:")) continue;
            const payload = trimmed.slice(5).trim();
            if (payload === "[DONE]") continue;
            try {
              const json = JSON.parse(payload);
              const delta: string = json?.choices?.[0]?.delta?.content ?? "";
              if (delta) enqueue({ text: delta });
            } catch {
              /* fragmento incompleto, se ignora */
            }
          }
        }

        enqueue({ done: true });
      } catch (err) {
        enqueue({ error: String((err as Error).message ?? err) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
