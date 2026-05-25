"use server";

import { desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { messages, threads } from "@/db/schema";
import { requireUserAndHousehold } from "@/lib/auth-helpers";
import { processChatTurnWithTools } from "@/app/actions/chat-bar";

async function getOrCreateMainThread(householdId: string, userId: string) {
  let thread = await db.query.threads.findFirst({
    where: eq(threads.householdId, householdId),
    orderBy: [desc(threads.updatedAt)],
  });
  if (!thread) {
    const [created] = await db
      .insert(threads)
      .values({
        householdId,
        createdById: userId,
        title: "Conversa principal",
      })
      .returning();
    thread = created;
  }
  return thread;
}

export async function sendChatMessage(formData: FormData) {
  const { householdId, userId } = await requireUserAndHousehold();
  const content = (formData.get("content") as string)?.trim();
  if (!content) return;

  try {
    await processChatTurnWithTools(content, householdId, userId);
  } catch (err) {
    const thread = await getOrCreateMainThread(householdId, userId);
    const errMsg = err instanceof Error ? err.message : String(err);
    await db.insert(messages).values({
      threadId: thread.id,
      householdId,
      role: "assistant",
      content: `(erro ao chamar a IA: ${errMsg})`,
    });
    revalidatePath("/chat");
  }
}

export async function clearChatHistory() {
  const { householdId, userId } = await requireUserAndHousehold();
  const thread = await getOrCreateMainThread(householdId, userId);
  await db.delete(messages).where(eq(messages.threadId, thread.id));
  revalidatePath("/chat");
}
