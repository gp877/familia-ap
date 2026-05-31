import { asc, desc, eq } from "drizzle-orm";

import { SectionRow } from "@/components/ap/atoms";
import { BackButton } from "@/components/ap/inline-form";
import { ScreenShell } from "@/components/ap/screen-shell";
import { clearChatHistory } from "@/app/actions/chat";
import { auth } from "@/auth";
import { db } from "@/db";
import { messages, threads, users } from "@/db/schema";
import { Conversation } from "./conversation";

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

  const initialMessages = msgs.map((m) => ({
    id: m.id,
    role: m.role,
    content: m.content,
    createdAt: m.createdAt.toISOString(),
  }));

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

      <Conversation initialMessages={initialMessages} />
    </ScreenShellChat>
  );
}

/**
 * Shell do /chat — REFEITO COM CSS GRID em vez de flex column.
 *
 * Flex column com min-height:0 nos filhos tinha um bug crônico em produção
 * onde o filho com flex:1 + overflow:auto não respeitava o shrink e o
 * input acabava empurrado abaixo do viewport. Tentei 3 vezes corrigir
 * com flex e não resolvia.
 *
 * CSS Grid resolve por contrato:
 * - row 1 (auto): BackButton
 * - row 2 (auto): SectionRow
 * - row 3 (minmax 0 1fr): Conversation — altura concreta = viewport - rows 1 e 2
 *
 * O 1fr de grid é altura CALCULADA pelo browser antes do paint, não
 * negociada como no flex. Filhos com height:100% dentro funcionam direto.
 *
 * position:fixed ancora no viewport — escapa de qualquer growth do main.
 * Em desktop (lg+), fica à direita do sidebar de 240px. Em mobile, full.
 */
function ScreenShellChat({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="lg:!left-[240px]"
      style={{
        position: "fixed",
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
        background: "var(--bg)",
        overflow: "hidden",
        zIndex: 1,
        display: "flex",
        justifyContent: "center",
      }}
    >
      <div
        className="w-full max-w-[480px] lg:max-w-4xl"
        style={{
          display: "grid",
          gridTemplateRows: "auto auto minmax(0, 1fr)",
          height: "100%",
          overflow: "hidden",
        }}
      >
        {children}
      </div>
    </div>
  );
}
