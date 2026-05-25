"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef } from "react";

import { Icon } from "@/components/ap/icon";
import {
  sendMessageReturn,
  type ChatBarState,
} from "@/app/actions/chat-bar";

const INITIAL: ChatBarState = { messages: [] };

/**
 * Barra de chat funcional sticky no rodapé de todas as páginas.
 * Envia mensagem ao Gemini e mostra resposta inline acima do input.
 * Histórico persiste no DB (visível em /chat).
 */
export function ChatBar() {
  const [state, formAction, isPending] = useActionState<ChatBarState, FormData>(
    sendMessageReturn,
    INITIAL
  );
  const formRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);

  // Limpa o input quando o action completa
  useEffect(() => {
    if (!isPending && formRef.current) {
      formRef.current.reset();
      // Mantém foco
      inputRef.current?.focus();
    }
  }, [isPending, state.messages.length]);

  // Auto-scroll pro fim
  useEffect(() => {
    if (scrollerRef.current) {
      scrollerRef.current.scrollTop = scrollerRef.current.scrollHeight;
    }
  }, [state.messages.length]);

  const hasMessages = state.messages.length > 0;

  return (
    <div
      style={{
        margin: "8px 20px 0",
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      {/* Mensagens recentes (só desta visita) */}
      {hasMessages && (
        <div
          ref={scrollerRef}
          style={{
            background: "var(--card)",
            borderRadius: 16,
            padding: "10px 12px",
            maxHeight: 280,
            overflowY: "auto",
            display: "flex",
            flexDirection: "column",
            gap: 8,
            border: "1px solid var(--line-d)",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              fontSize: 10.5,
              fontWeight: 600,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "var(--muted)",
              paddingBottom: 4,
              borderBottom: "0.5px solid var(--line-d)",
            }}
          >
            <span>Conversa com AP</span>
            <Link
              href="/chat"
              style={{
                color: "var(--accent)",
                textDecoration: "none",
                letterSpacing: "0.04em",
                textTransform: "none",
                fontSize: 11,
                fontWeight: 600,
              }}
            >
              ver tudo →
            </Link>
          </div>
          {state.messages.map((m) =>
            m.role === "user" ? (
              <div key={m.id} style={{ display: "flex", justifyContent: "flex-end" }}>
                <div
                  style={{
                    maxWidth: "82%",
                    background: "var(--card2)",
                    padding: "8px 12px",
                    borderRadius: 14,
                    borderBottomRightRadius: 4,
                    fontSize: 13,
                    lineHeight: 1.4,
                    color: "var(--ink)",
                  }}
                >
                  {m.content}
                </div>
              </div>
            ) : (
              <div
                key={m.id}
                style={{ display: "flex", gap: 6, alignItems: "flex-start" }}
              >
                <div
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 11,
                    background: "var(--accent)",
                    color: "var(--accent-on)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                    fontSize: 9.5,
                    fontWeight: 800,
                    marginTop: 2,
                  }}
                >
                  ap
                </div>
                <div
                  style={{
                    flex: 1,
                    fontSize: 13,
                    lineHeight: 1.45,
                    color: "var(--ink-d)",
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {m.content}
                </div>
              </div>
            )
          )}
          {isPending && (
            <div
              style={{
                display: "flex",
                gap: 6,
                alignItems: "center",
                fontSize: 11,
                color: "var(--muted)",
                fontStyle: "italic",
              }}
            >
              <div
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 11,
                  background: "var(--accent)",
                  color: "var(--accent-on)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 9.5,
                  fontWeight: 800,
                }}
              >
                ap
              </div>
              <span>pensando…</span>
            </div>
          )}
        </div>
      )}

      {/* Input */}
      <form
        ref={formRef}
        action={formAction}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <input
          ref={inputRef}
          name="content"
          required
          autoComplete="off"
          placeholder={hasMessages ? "Continue conversando…" : "Converse com a AP"}
          disabled={isPending}
          style={{
            flex: 1,
            height: 40,
            borderRadius: 20,
            background: "var(--card)",
            color: "var(--ink)",
            border: "1px solid var(--line-d)",
            padding: "0 16px",
            fontSize: 13.5,
            fontFamily: "inherit",
            outline: "none",
          }}
        />
        <button
          type="submit"
          disabled={isPending}
          aria-label="Enviar"
          style={{
            width: 40,
            height: 40,
            borderRadius: 20,
            background: isPending ? "var(--card2)" : "var(--accent)",
            color: isPending ? "var(--muted)" : "var(--accent-on)",
            border: "none",
            cursor: isPending ? "wait" : "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {isPending ? (
            <Spinner />
          ) : (
            <svg
              width={16}
              height={16}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2.4}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          )}
        </button>
      </form>
    </div>
  );
}

function Spinner() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.4" opacity="0.25" />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        style={{
          animation: "spin 0.9s linear infinite",
          transformOrigin: "12px 12px",
        }}
      />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </svg>
  );
}
