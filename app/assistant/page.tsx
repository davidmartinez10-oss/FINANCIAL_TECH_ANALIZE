"use client";

import { useEffect, useRef, useState } from "react";
import type { ChatMessage, AgentRole } from "@/lib/types";

const AGENT_COLORS: Record<AgentRole, string> = {
  analyst: "#4c8dff",
  economist: "#2ec16e",
  financier: "#f5c451",
  fallback: "#ff9f43",
};

const AGENT_LABELS: Record<AgentRole, string> = {
  analyst: "Alex · Analista",
  economist: "Elena · Economista",
  financier: "Carlos · Financista",
  fallback: "Pepe · Comodín",
};

const SUGGESTIONS = [
  "¿Cuál es el portafolio con mejor Sharpe ratio?",
  "Analiza las condiciones macroeconómicas de China y su impacto en semiconductores.",
  "¿Cuál es el VaR del portafolio de mínima volatilidad?",
  "Compara NVDA y MSFT como inversión a largo plazo.",
  "¿Cómo afecta la tasa de la Fed a los ETFs de energía?",
  "¿Qué es el EBITDA y por qué importa para valorar empresas?",
];

function detectAgent(text: string): AgentRole {
  const low = text.toLowerCase();
  if (low.includes("alex") || low.includes("analista")) return "analyst";
  if (low.includes("elena") || low.includes("economista")) return "economist";
  if (low.includes("carlos") || low.includes("financista")) return "financier";
  if (low.includes("pepe") || low.includes("comodín")) return "fallback";
  return "analyst";
}

export default function AssistantPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      content:
        "**Bienvenido a Macro Markets AI** 👋\n\nSoy el orquestador inteligente de tu plataforma de análisis financiero. Puedo conectarte con:\n\n- **Alex** (Analista de Datos): pronósticos, Monte Carlo, métricas de riesgo\n- **Elena** (Economista): macro global, política monetaria, divisas\n- **Carlos** (Financista): valoración, estados financieros, estrategia\n\nPregúntame sobre portafolios, activos, condiciones macroeconómicas, noticias financieras o cualquier tema de inversión.",
      agent: "analyst",
      timestamp: Date.now(),
    },
  ]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function send(text?: string) {
    const userText = (text ?? input).trim();
    if (!userText || streaming) return;
    setInput("");

    const userMsg: ChatMessage = {
      role: "user",
      content: userText,
      timestamp: Date.now(),
    };
    setMessages((prev) => [...prev, userMsg]);

    const history = [...messages, userMsg]
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => ({ role: m.role, content: m.content }));

    setStreaming(true);
    const placeholderTs = Date.now();
    setMessages((prev) => [
      ...prev,
      {
        role: "assistant",
        content: "",
        agent: "analyst",
        timestamp: placeholderTs,
      },
    ]);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history }),
      });

      if (!res.body) throw new Error("Sin stream");

      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let accumulated = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = dec.decode(value);
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const raw = line.slice(6);
          if (raw === "[DONE]") continue;
          try {
            const parsed = JSON.parse(raw);
            if (parsed.error) {
              accumulated = `⚠️ Error: ${parsed.error}`;
            } else if (parsed.text) {
              accumulated += parsed.text;
            }
          } catch {
            // skip malformed
          }
        }

        const detectedAgent = detectAgent(accumulated);
        setMessages((prev) =>
          prev.map((m) =>
            m.timestamp === placeholderTs
              ? { ...m, content: accumulated, agent: detectedAgent }
              : m
          )
        );
      }
    } catch (err) {
      setMessages((prev) =>
        prev.map((m) =>
          m.timestamp === placeholderTs
            ? {
                ...m,
                content: `⚠️ Error de conexión: ${String((err as Error).message ?? err)}`,
              }
            : m
        )
      );
    } finally {
      setStreaming(false);
    }
  }

  function formatContent(text: string) {
    // Basic markdown-like formatting
    return text
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*(.+?)\*/g, "<em>$1</em>")
      .replace(/\n/g, "<br/>");
  }

  return (
    <main className="container">
      <header className="topbar">
        <div>
          <h1>Asistente IA · Orquestador</h1>
          <div className="sub">
            Alex · Elena · Carlos · Pepe · Integrado con pronósticos, macro y noticias
          </div>
        </div>
        <div className="agent-legend">
          {(Object.entries(AGENT_LABELS) as [AgentRole, string][]).map(([k, v]) => (
            <span
              key={k}
              className="agent-pill"
              style={{ borderColor: AGENT_COLORS[k] }}
            >
              {v}
            </span>
          ))}
        </div>
      </header>

      {/* Suggestions */}
      {messages.length <= 1 && (
        <div className="suggestions">
          <div className="section-title">Preguntas sugeridas</div>
          <div className="sugg-grid">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                className="sugg-btn"
                onClick={() => send(s)}
                disabled={streaming}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Messages */}
      <div className="chat-messages">
        {messages.map((m, i) => (
          <div key={i} className={`chat-msg ${m.role}`}>
            {m.role === "assistant" && m.agent && (
              <div
                className="agent-badge"
                style={{ color: AGENT_COLORS[m.agent] }}
              >
                {AGENT_LABELS[m.agent]}
              </div>
            )}
            {m.content ? (
              <div
                className="msg-content"
                dangerouslySetInnerHTML={{
                  __html: formatContent(m.content),
                }}
              />
            ) : (
              <div className="typing-indicator">
                <span />
                <span />
                <span />
              </div>
            )}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="chat-input-bar">
        <textarea
          ref={textareaRef}
          className="chat-textarea"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          placeholder="Pregunta sobre portafolios, activos, macro o cualquier tema financiero…"
          rows={2}
          disabled={streaming}
        />
        <button
          className="chat-send"
          onClick={() => send()}
          disabled={streaming || !input.trim()}
        >
          {streaming ? "…" : "Enviar"}
        </button>
      </div>

      <div style={{ height: 16 }} />
      <div
        className="note"
        style={{ fontSize: 11 }}
      >
        Requiere <code>ANTHROPIC_API_KEY</code> configurada en variables de entorno de Vercel.
        Las respuestas son generadas por IA y no constituyen asesoría de inversión.
      </div>
    </main>
  );
}
