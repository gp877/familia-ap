"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";

import {
  sendMessageReturn,
  type ChatBarMessage,
} from "@/app/actions/chat-bar";

/**
 * Barra de chat sticky no rodapé de todas as páginas.
 *
 * UX:
 * - Mensagem do usuário aparece IMEDIATAMENTE (optimistic) — não fica
 *   parado enquanto o Gemini processa.
 * - Indicador "AP digitando…" enquanto a server action roda.
 * - Mensagens em bubble style, max-height generoso, auto-scroll.
 * - Botão "limpar" esvazia só a sessão local (mantém o histórico no /chat).
 */
export function ChatBar() {
  const [messages, setMessages] = useState<ChatBarMessage[]>([]);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);

  function send(rawContent: string) {
    const content = rawContent.trim();
    if (!content || pending) return;
    if (inputRef.current) inputRef.current.value = "";
    setError(null);

    const tempId = `t-${Date.now()}`;
    // Optimistic: user vê a própria mensagem na hora
    setMessages((prev) => [
      ...prev,
      { role: "user", content, id: tempId },
    ]);

    startTransition(async () => {
      try {
        const fd = new FormData();
        fd.set("content", content);
        // Passa state vazio — recebemos os 2 novos messages (user + assistant)
        // do server e reconciliamos com nossa state local
        const next = await sendMessageReturn({ messages: [] }, fd);
        setMessages((current) => {
          const withoutTemp = current.filter((m) => m.id !== tempId);
          return [...withoutTemp, ...next.messages];
        });
        if (next.error) setError(next.error);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
        setMessages((current) => [
          ...current,
          {
            role: "assistant",
            content: `(erro: ${msg.slice(0, 200)})`,
            id: `err-${Date.now()}`,
          },
        ]);
      } finally {
        inputRef.current?.focus();
      }
    });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    send(inputRef.current?.value ?? "");
  }

  function clearLocal() {
    setMessages([]);
    setError(null);
    inputRef.current?.focus();
  }

  // Auto-scroll pro fim sempre que mensagens crescem ou começa a "pensar"
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages.length, pending]);

  const hasMessages = messages.length > 0 || pending;

  return (
    <div
      style={{
        margin: "8px 16px 0",
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      {/* Painel de conversa — só aparece quando há mensagens ou está pensando */}
      {hasMessages && (
        <div
          style={{
            background: "var(--card)",
            borderRadius: 18,
            border: "0.5px solid var(--line-d)",
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
          }}
        >
          {/* Header */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "10px 14px",
              borderBottom: "0.5px solid var(--line-d)",
              background: "var(--surf)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Avatar />
              <span
                style={{
                  fontSize: 10.5,
                  fontWeight: 800,
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                  color: "var(--muted-d)",
                }}
              >
                conversa com AP
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <Link
                href="/chat"
                style={{
                  fontSize: 11,
                  color: "var(--accent)",
                  fontWeight: 700,
                  textDecoration: "none",
                  padding: "4px 8px",
                }}
              >
                ver tudo →
              </Link>
              <button
                type="button"
                onClick={clearLocal}
                aria-label="Limpar conversa"
                title="Limpar conversa"
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 14,
                  background: "transparent",
                  color: "var(--muted)",
                  border: "0.5px solid var(--line-d)",
                  fontSize: 14,
                  fontWeight: 700,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                ×
              </button>
            </div>
          </div>

          {/* Mensagens */}
          <div
            ref={scrollerRef}
            style={{
              padding: "12px 14px",
              display: "flex",
              flexDirection: "column",
              gap: 10,
              maxHeight: "min(60vh, 480px)",
              overflowY: "auto",
              overscrollBehavior: "contain",
            }}
          >
            {messages.map((m) =>
              m.role === "user" ? <UserBubble key={m.id} text={m.content} /> : <ApBubble key={m.id} text={m.content} />
            )}
            {pending && <TypingBubble />}
          </div>

          {error && (
            <div
              style={{
                padding: "8px 14px",
                fontSize: 11,
                color: "var(--alert)",
                background: "var(--surf)",
                borderTop: "0.5px solid var(--line-d)",
              }}
            >
              {error}
            </div>
          )}
        </div>
      )}

      {/* Input */}
      <form
        onSubmit={handleSubmit}
        style={{ display: "flex", alignItems: "center", gap: 8 }}
      >
        <input
          ref={inputRef}
          name="content"
          required
          autoComplete="off"
          placeholder={hasMessages ? "Continue conversando…" : "Converse com a AP"}
          disabled={pending}
          style={{
            flex: 1,
            height: 44,
            borderRadius: 22,
            background: "var(--card)",
            color: "var(--ink)",
            border: "1px solid var(--line-d)",
            padding: "0 18px",
            fontSize: 15,
            fontFamily: "inherit",
            outline: "none",
            opacity: pending ? 0.6 : 1,
          }}
        />
        <button
          type="submit"
          disabled={pending}
          aria-label="Enviar"
          style={{
            width: 44,
            height: 44,
            borderRadius: 22,
            background: pending ? "var(--card2)" : "var(--accent)",
            color: pending ? "var(--muted)" : "var(--accent-on)",
            border: "none",
            cursor: pending ? "wait" : "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            transition: "transform 0.12s ease, background-color 0.12s ease",
          }}
        >
          {pending ? <Spinner /> : <SendIcon />}
        </button>
      </form>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Sub-components
// ────────────────────────────────────────────────────────────

function Avatar() {
  return (
    <div
      style={{
        width: 24,
        height: 24,
        borderRadius: 12,
        background: "var(--accent)",
        color: "var(--accent-on)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 10,
        fontWeight: 800,
        letterSpacing: "-0.02em",
      }}
    >
      ap
    </div>
  );
}

function UserBubble({ text }: { text: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "flex-end" }}>
      <div
        style={{
          maxWidth: "82%",
          background: "var(--accent)",
          color: "var(--accent-on)",
          padding: "10px 14px",
          borderRadius: 18,
          borderBottomRightRadius: 4,
          fontSize: 14,
          lineHeight: 1.45,
          fontWeight: 500,
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
        }}
      >
        {text}
      </div>
    </div>
  );
}

function ApBubble({ text }: { text: string }) {
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
      <Avatar />
      <div
        style={{
          flex: 1,
          maxWidth: "82%",
          background: "var(--card2)",
          color: "var(--ink-d)",
          padding: "10px 14px",
          borderRadius: 18,
          borderBottomLeftRadius: 4,
          fontSize: 14,
          lineHeight: 1.5,
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
        }}
      >
        {text}
      </div>
    </div>
  );
}

function TypingBubble() {
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
      <Avatar />
      <div
        style={{
          background: "var(--card2)",
          color: "var(--muted-d)",
          padding: "12px 16px",
          borderRadius: 18,
          borderBottomLeftRadius: 4,
          display: "flex",
          gap: 4,
          alignItems: "center",
        }}
        aria-label="AP digitando"
      >
        <Dot delay={0} />
        <Dot delay={0.18} />
        <Dot delay={0.36} />
      </div>
      <style>{`
        @keyframes ap-typing {
          0%, 80%, 100% { opacity: 0.3; transform: translateY(0); }
          40% { opacity: 1; transform: translateY(-2px); }
        }
      `}</style>
    </div>
  );
}

function Dot({ delay }: { delay: number }) {
  return (
    <span
      style={{
        width: 6,
        height: 6,
        borderRadius: 3,
        background: "var(--muted-d)",
        display: "inline-block",
        animation: `ap-typing 1.2s ease-in-out ${delay}s infinite`,
      }}
    />
  );
}

function SendIcon() {
  return (
    <svg
      width={18}
      height={18}
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
  );
}

function Spinner() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.4" opacity="0.25" />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        style={{
          animation: "ap-spin 0.9s linear infinite",
          transformOrigin: "12px 12px",
        }}
      />
      <style>{`@keyframes ap-spin { to { transform: rotate(360deg); } }`}</style>
    </svg>
  );
}
