import { asc, desc, eq } from "drizzle-orm";

import { SectionRow } from "@/components/ap/atoms";
import { BackButton } from "@/components/ap/inline-form";
import { Icon } from "@/components/ap/icon";
import { ScreenShell } from "@/components/ap/screen-shell";
import { clearChatHistory, sendChatMessage } from "@/app/actions/chat";
import { auth } from "@/auth";
import { db } from "@/db";
import { messages, threads, users } from "@/db/schema";

function formatTime(d: Date | string) {
  return new Date(d).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function ChatPage() {
  const session = await auth();
  if (!session?.user?.id) return null;
  const dbUser = await db.query.users.findFirst({
    where: eq(users.id, session.user.id),
  });
  if (!dbUser?.householdId) return null;

  const thread = await db.query.threads.findFirst({
    where: eq(threads.householdId, dbUser.householdId),
    orderBy: [desc(threads.updatedAt)],
  });

  const msgs = thread
    ? await db.query.messages.findMany({
        where: eq(messages.threadId, thread.id),
        orderBy: [asc(messages.createdAt)],
        limit: 100,
      })
    : [];

  return (
    <ScreenShellChat>
      <div style={{ padding: "0 20px 8px" }}>
        <BackButton href="/" />
      </div>

      <SectionRow
        icon="spark"
        label="Conversa com a AP"
        action={
          msgs.length > 0 ? (
            <form action={clearChatHistory}>
              <button
                type="submit"
                style={{
                  padding: "3px 10px",
                  borderRadius: 999,
                  background: "transparent",
                  color: "var(--muted)",
                  border: "1px solid var(--line-d)",
                  fontSize: 10.5,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                limpar
              </button>
            </form>
          ) : (
            `${msgs.length} mensagens`
          )
        }
      />

      <div
        style={{
          flex: 1,
          padding: "8px 20px",
          display: "flex",
          flexDirection: "column",
          gap: 10,
          minHeight: 200,
        }}
      >
        {msgs.length === 0 ? (
          <div
            style={{
              padding: "30px 20px",
              textAlign: "center",
              color: "var(--muted)",
              fontSize: 13,
              lineHeight: 1.6,
            }}
          >
            <Icon name="spark" size={32} color="var(--accent)" />
            <p style={{ marginTop: 12 }}>
              <b>Conversa com a AP</b>
            </p>
            <p style={{ marginTop: 6, maxWidth: 320, marginInline: "auto" }}>
              Pergunte qualquer coisa sobre as finanças, próximos compromissos,
              sonhos da família, viagens. A AP conhece o contexto de vocês.
            </p>
            <div
              style={{
                marginTop: 16,
                display: "flex",
                flexDirection: "column",
                gap: 6,
                fontSize: 12,
                color: "var(--ink-d)",
              }}
            >
              <SuggestionPill text="Quanto gastamos esse mês?" />
              <SuggestionPill text="O que tem essa semana?" />
              <SuggestionPill text="Quem faz aniversário em breve?" />
            </div>
          </div>
        ) : (
          msgs.map((m) =>
            m.role === "user" ? (
              <div
                key={m.id}
                style={{ display: "flex", justifyContent: "flex-end" }}
              >
                <div
                  style={{
                    maxWidth: "82%",
                    background: "var(--card2)",
                    padding: "10px 14px",
                    borderRadius: 18,
                    borderBottomRightRadius: 6,
                    fontSize: 14,
                    lineHeight: 1.45,
                    color: "var(--ink)",
                  }}
                >
                  {m.content}
                </div>
              </div>
            ) : (
              <div
                key={m.id}
                style={{ display: "flex", justifyContent: "flex-start", gap: 8 }}
              >
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
                <div
                  style={{
                    maxWidth: "82%",
                    background: "var(--card)",
                    padding: "10px 14px",
                    borderRadius: 18,
                    borderBottomLeftRadius: 6,
                    fontSize: 14,
                    lineHeight: 1.5,
                    color: "var(--ink-d)",
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {m.content}
                  <div
                    style={{
                      fontSize: 10,
                      color: "var(--muted)",
                      marginTop: 4,
                    }}
                  >
                    {formatTime(m.createdAt)}
                  </div>
                </div>
              </div>
            )
          )
        )}
      </div>

      {/* Input customizado pro chat (substitui o decorativo) */}
      <div style={{ padding: "8px 20px 16px" }}>
        <form
          action={sendChatMessage}
          style={{ display: "flex", alignItems: "center", gap: 8 }}
        >
          <input
            name="content"
            required
            autoComplete="off"
            placeholder="Pergunte qualquer coisa..."
            style={{
              flex: 1,
              padding: "10px 16px",
              borderRadius: 999,
              background: "var(--card)",
              color: "var(--ink)",
              border: "1px solid var(--line-d)",
              fontSize: 13.5,
              fontFamily: "inherit",
              outline: "none",
            }}
          />
          <button
            type="submit"
            aria-label="Enviar"
            style={{
              width: 38,
              height: 38,
              borderRadius: 19,
              background: "var(--accent)",
              color: "var(--accent-on)",
              border: "none",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        </form>
      </div>
    </ScreenShellChat>
  );
}

function ScreenShellChat({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="mx-auto flex w-full flex-col max-w-[480px] lg:max-w-4xl"
      style={{ minHeight: "100%" }}
    >
      {children}
    </div>
  );
}

function SuggestionPill({ text }: { text: string }) {
  return (
    <span
      style={{
        display: "inline-block",
        padding: "5px 12px",
        borderRadius: 999,
        background: "var(--card)",
        color: "var(--muted-d)",
        fontSize: 11.5,
        border: "1px solid var(--line-d)",
        margin: "0 auto",
      }}
    >
      &ldquo;{text}&rdquo;
    </span>
  );
}
