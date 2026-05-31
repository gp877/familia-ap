"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import { sendChatMessage } from "@/app/actions/chat";

type Message = {
  id: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  createdAt: string; // ISO string
};

/**
 * Conversation completa: lista de mensagens + input + indicador de
 * pendência. Substituiu o Server Component que tinha bugs:
 *   • permitia double-submit (clicar várias vezes mandava várias)
 *   • input não limpava
 *   • sem optimistic UI → user esperava 5-7s sem feedback
 *   • sem auto-scroll
 *   • sem indicador "AP digitando…"
 */
export function Conversation({
  initialMessages,
}: {
  initialMessages: Message[];
}) {
  const router = useRouter();
  const [draft, setDraft] = useState("");
  const [optimistic, setOptimistic] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  // Guard contra double-submit em fast clicks ANTES da transition começar
  const submittingRef = useRef(false);

  // Auto-scroll pro fim em qualquer mudança visível
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    requestAnimationFrame(() => {
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    });
  }, [initialMessages.length, optimistic, pending]);

  // Limpa optimistic quando uma mensagem nova aparece no server (com mesmo
  // conteúdo da otimista)
  useEffect(() => {
    if (!optimistic) return;
    const lastUser = [...initialMessages].reverse().find((m) => m.role === "user");
    if (lastUser?.content.trim() === optimistic.trim()) {
      setOptimistic(null);
    }
  }, [initialMessages, optimistic]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    submit();
  }

  function submit() {
    const content = draft.trim();
    if (!content) return;
    // Guard duplo: ref síncrona + flag pending
    if (submittingRef.current || pending) return;
    submittingRef.current = true;

    setDraft("");
    setOptimistic(content);
    setError(null);

    startTransition(async () => {
      try {
        const fd = new FormData();
        fd.set("content", content);
        await sendChatMessage(fd);
        // Server revalidatePath dispara, mas precisamos do router.refresh()
        // pra re-buscar as messages no Server Component pai
        router.refresh();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
        // Volta o draft pro user re-tentar se quiser
        setDraft(content);
        setOptimistic(null);
      } finally {
        submittingRef.current = false;
        // Foco volta no input pra próximo turno
        inputRef.current?.focus();
      }
    });
  }

  function handleKey(e: React.KeyboardEvent<HTMLInputElement>) {
    // Enter envia (sem shift)
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }

  const hasContent = initialMessages.length > 0 || optimistic || pending;

  return (
    // CSS GRID interno — replica o pai (chat/page ScreenShellChat usa grid).
    // Rows: scroller (1fr — toma o espaço), error (auto), delay (auto), input (auto).
    // height: 100% ocupa o row 3 (1fr) que o pai grid garante ter altura concreta.
    // min-height: 0 + overflow: hidden contém os filhos sem expandir o container.
    <div
      style={{
        height: "100%",
        minHeight: 0,
        overflow: "hidden",
        display: "grid",
        gridTemplateRows: "minmax(0, 1fr) auto",
      }}
    >
      {/* Scroller das mensagens — row 1 (1fr) */}
      <div
        ref={scrollerRef}
        style={{
          minHeight: 0,
          padding: "8px 20px 20px",
          display: "flex",
          flexDirection: "column",
          gap: 10,
          overflowY: "auto",
        }}
      >
        {!hasContent ? (
          <EmptyState />
        ) : (
          <>
            {initialMessages.map((m) =>
              m.role === "user" ? (
                <UserBubble key={m.id} text={m.content} createdAt={m.createdAt} />
              ) : (
                <ApBubble key={m.id} text={m.content} createdAt={m.createdAt} />
              )
            )}
            {optimistic && <UserBubble text={optimistic} pending />}
            {pending && <TypingBubble />}
          </>
        )}
      </div>

      {/* Row 2 (auto) — agrupa error + delaybar + input num único grid item.
          Isso garante que o input nunca seja empurrado pra fora — ele faz parte
          do row "auto" que sempre ocupa só o espaço necessário. */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          background: "var(--bg)",
        }}
      >
        {/* Erro inline */}
        {error && (
          <div
            style={{
              margin: "0 20px 8px",
              padding: "10px 14px",
              background: "color-mix(in oklab, var(--alert) 12%, var(--card))",
              border: "0.5px solid var(--alert)",
              borderRadius: 12,
              fontSize: 12,
              color: "var(--alert)",
            }}
          >
            {error}
          </div>
        )}

        {/* Barra discreta de tempo — esvazia enquanto AP processa */}
        {pending && <DelayBar />}

        {/* Input — agora SEMPRE visível pq está em row auto do grid pai */}
        <div style={{ padding: "8px 20px 16px" }}>
        <form
          onSubmit={handleSubmit}
          style={{ display: "flex", alignItems: "center", gap: 8 }}
        >
          <input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKey}
            autoComplete="off"
            placeholder={pending ? "Aguardando AP…" : "Pergunte qualquer coisa…"}
            disabled={pending}
            style={{
              flex: 1,
              padding: "12px 18px",
              borderRadius: 999,
              background: "var(--card)",
              color: "var(--ink)",
              border: "1px solid var(--line-d)",
              fontSize: 15,
              fontFamily: "inherit",
              outline: "none",
              opacity: pending ? 0.65 : 1,
              transition: "opacity 0.15s",
            }}
          />
          <button
            type="submit"
            disabled={pending || draft.trim().length === 0}
            aria-label="Enviar"
            style={{
              width: 44,
              height: 44,
              borderRadius: 22,
              background:
                pending || draft.trim().length === 0
                  ? "var(--card2)"
                  : "var(--accent)",
              color:
                pending || draft.trim().length === 0
                  ? "var(--muted)"
                  : "var(--accent-on)",
              border: "none",
              cursor:
                pending
                  ? "wait"
                  : draft.trim().length === 0
                    ? "not-allowed"
                    : "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              transition: "background-color 0.12s, color 0.12s",
            }}
          >
            {pending ? <Spinner /> : <SendIcon />}
          </button>
        </form>
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// UI atoms
// ────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div
      style={{
        padding: "30px 20px",
        textAlign: "center",
        color: "var(--muted)",
        fontSize: 13,
        lineHeight: 1.6,
      }}
    >
      <p style={{ fontWeight: 600, color: "var(--ink-d)" }}>Conversa com a AP</p>
      <p style={{ marginTop: 6, maxWidth: 320, marginInline: "auto" }}>
        Pergunte sobre finanças, próximos compromissos, sonhos, viagens — a AP
        conhece o contexto da família.
      </p>
    </div>
  );
}

function UserBubble({
  text,
  createdAt,
  pending = false,
}: {
  text: string;
  createdAt?: string;
  pending?: boolean;
}) {
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
          opacity: pending ? 0.6 : 1,
        }}
      >
        {text}
        {createdAt && !pending && (
          <div
            style={{
              fontSize: 10,
              color: "color-mix(in oklab, var(--accent-on) 60%, transparent)",
              marginTop: 4,
              fontWeight: 400,
            }}
          >
            {formatTime(createdAt)}
          </div>
        )}
      </div>
    </div>
  );
}

function ApBubble({ text, createdAt }: { text: string; createdAt: string }) {
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
      <Avatar />
      <div
        style={{
          maxWidth: "82%",
          background: "var(--card)",
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
        <div
          style={{
            fontSize: 10,
            color: "var(--muted)",
            marginTop: 4,
          }}
        >
          {formatTime(createdAt)}
        </div>
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
          background: "var(--card)",
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
        @keyframes chat-typing {
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
        animation: `chat-typing 1.2s ease-in-out ${delay}s infinite`,
      }}
    />
  );
}

function Avatar() {
  return (
    <div
      style={{
        width: 26,
        height: 26,
        borderRadius: 13,
        background: "var(--accent)",
        color: "var(--accent-on)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        fontSize: 11,
        fontWeight: 800,
      }}
    >
      ap
    </div>
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
          animation: "chat-spin 0.9s linear infinite",
          transformOrigin: "12px 12px",
        }}
      />
      <style>{`@keyframes chat-spin { to { transform: rotate(360deg); } }`}</style>
    </svg>
  );
}

function formatTime(d: string) {
  return new Date(d).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Barra horizontal discreta que ESVAZIA (right→left) enquanto a AP
 * processa. Indica visualmente que algo está em andamento sem ocupar
 * espaço significativo. Duração ~12s (média de turn com tool calls).
 * Se exceder o tempo, vira pulse infinito pra continuar dando feedback.
 */
function DelayBar() {
  return (
    <div
      aria-hidden
      style={{
        height: 2,
        margin: "0 24px 6px",
        borderRadius: 1,
        background: "color-mix(in oklab, var(--accent) 12%, transparent)",
        overflow: "hidden",
        position: "relative",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "var(--accent)",
          transformOrigin: "right",
          animation:
            "chat-bar-deplete 12s cubic-bezier(0.22, 1, 0.36, 1) forwards, chat-bar-pulse 1.6s ease-in-out 12s infinite",
        }}
      />
      <style>{`
        @keyframes chat-bar-deplete {
          from { transform: scaleX(1); }
          to { transform: scaleX(0); }
        }
        @keyframes chat-bar-pulse {
          0%, 100% { transform: scaleX(0); opacity: 0.3; }
          50% { transform: scaleX(0.18); opacity: 0.8; }
        }
      `}</style>
    </div>
  );
}
