import Anthropic from "@anthropic-ai/sdk";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
Responde siempre en español. Sé conciso pero completo. Máximo 400 palabras por respuesta.`;

const TOOLS: Anthropic.Tool[] = [
  {
    name: "get_platform_summary",
    description:
      "Obtiene un resumen de los datos actuales de la plataforma: portafolios, activos, condiciones de mercado.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
];

async function handleToolCall(
  toolName: string,
  _toolInput: Record<string, unknown>
): Promise<string> {
  if (toolName === "get_platform_summary") {
    return JSON.stringify({
      portfolios: ["Min Volatilidad", "Volatilidad Media", "Máximo Riesgo"],
      assets: [
        "NVDA (NVIDIA) - Semiconductores/IA",
        "MSFT (Microsoft) - Software/Nube",
        "GOOGL (Google) - Internet/IA",
        "SOXX - ETF Semiconductores iShares",
        "SMH - ETF Semiconductores VanEck",
        "TAN - ETF Solar Invesco",
        "NLR - ETF Nuclear/Uranio VanEck",
        "URNM - ETF Minería Uranio Sprott",
        "SPY - SPDR S&P 500 ETF",
        "QQQ - Invesco Nasdaq-100 ETF",
      ],
      models: ["Prophet", "ARIMAX", "XGBoost", "Holt-Winters"],
      horizon: "21 días hábiles (aprox. 1 mes)",
      simulations: "10,000 Monte Carlo",
      macro_regions: [
        "Estados Unidos",
        "China",
        "Unión Europea",
        "Rusia",
        "Colombia",
        "América Latina",
      ],
    });
  }
  return "{}";
}

export async function POST(request: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return Response.json(
      {
        error:
          "ANTHROPIC_API_KEY no configurada. Agrégala en las variables de entorno de Vercel.",
      },
      { status: 503 }
    );
  }

  let body: { messages: { role: string; content: string }[] };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "JSON inválido" }, { status: 400 });
  }

  const userMessages = (body.messages ?? []).filter(
    (m) => m.role === "user" || m.role === "assistant"
  );

  if (!userMessages.length) {
    return Response.json({ error: "messages vacío" }, { status: 400 });
  }

  const client = new Anthropic({ apiKey });

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const enqueue = (data: object) =>
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(data)}\n\n`)
        );

      try {
        const messages: Anthropic.MessageParam[] = userMessages.map((m) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        }));

        // Agentic loop: allow up to 3 rounds for tool calls
        let currentMessages = [...messages];
        for (let round = 0; round < 3; round++) {
          const response = await client.messages.create({
            model: "claude-opus-4-8",
            max_tokens: 1024,
            thinking: { type: "adaptive" },
            system: SYSTEM_PROMPT,
            messages: currentMessages,
            tools: TOOLS,
          });

          // Stream text content
          for (const block of response.content) {
            if (block.type === "text") {
              // Stream word by word for smooth UX
              const words = block.text.split(" ");
              for (const word of words) {
                enqueue({ text: word + " " });
                await new Promise((r) => setTimeout(r, 15));
              }
            }
          }

          if (response.stop_reason !== "tool_use") break;

          // Handle tool calls
          const toolUseBlocks = response.content.filter(
            (b) => b.type === "tool_use"
          ) as Anthropic.ToolUseBlock[];

          if (!toolUseBlocks.length) break;

          const toolResults: Anthropic.ToolResultBlockParam[] = await Promise.all(
            toolUseBlocks.map(async (tu) => ({
              type: "tool_result" as const,
              tool_use_id: tu.id,
              content: await handleToolCall(
                tu.name,
                tu.input as Record<string, unknown>
              ),
            }))
          );

          currentMessages = [
            ...currentMessages,
            { role: "assistant" as const, content: response.content },
            { role: "user" as const, content: toolResults },
          ];
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
