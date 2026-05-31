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

function ScreenShellChat({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="mx-auto flex w-full flex-col max-w-[480px] lg:max-w-4xl"
      style={{
        // 100dvh respeita a UI dinâmica do browser (URL bar em mobile);
        // overflow hidden trava o scroll do body — só o scroller interno
        // do Conversation rola. Sem isso, o input afundava abaixo da fold
        // em desktop.
        height: "100dvh",
        overflow: "hidden",
      }}
    >
      {children}
    </div>
  );
}
