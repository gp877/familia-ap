"use server";

import { GoogleGenAI } from "@google/genai";
import { asc, desc, eq, gte } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import {
  aniversarios,
  compromissos,
  messages,
  sonhos,
  threads,
  transactions,
  viagens,
} from "@/db/schema";
import { requireUserAndHousehold } from "@/lib/auth-helpers";

if (!process.env.GEMINI_API_KEY) {
  throw new Error("GEMINI_API_KEY not set");
}

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export type ChatBarMessage = {
  role: "user" | "assistant";
  content: string;
  id: string;
};

export type ChatBarState = {
  messages: ChatBarMessage[];
  error?: string;
};

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

async function buildContext(householdId: string): Promise<string> {
  const todayStr = new Date().toISOString().slice(0, 10);

  const recentTx = await db.query.transactions.findMany({
    where: eq(transactions.householdId, householdId),
    orderBy: [desc(transactions.occurredOn)],
    with: { category: true },
    limit: 8,
  });

  const upcoming = await db.query.compromissos.findMany({
    where: (c, { and: a }) =>
      a(eq(c.householdId, householdId), gte(c.occurredOn, todayStr)),
    orderBy: [asc(compromissos.occurredOn)],
    limit: 5,
  });

  const nextTrip = await db.query.viagens.findFirst({
    where: (v, { and: a, ne }) =>
      a(eq(v.householdId, householdId), ne(v.status, "past")),
    orderBy: [asc(viagens.startDate)],
  });

  const activeSonhos = await db.query.sonhos.findMany({
    where: (s, { and: a }) =>
      a(eq(s.householdId, householdId), eq(s.status, "active")),
    limit: 5,
  });

  const allAniv = await db.query.aniversarios.findMany({
    where: eq(aniversarios.householdId, householdId),
  });

  const parts: string[] = [];
  if (recentTx.length > 0) {
    parts.push("Últimas transações:");
    for (const t of recentTx) {
      parts.push(
        `  - ${new Date(t.occurredOn).toLocaleDateString("pt-BR")} · ${t.kind === "debit" ? "-" : "+"}R$${t.amount} · ${t.description} (${t.category?.name ?? "sem categoria"})`
      );
    }
  } else {
    parts.push("Sem transações registradas ainda.");
  }
  if (upcoming.length > 0) {
    parts.push("\nPróximos compromissos:");
    for (const c of upcoming.slice(0, 3)) {
      parts.push(
        `  - ${c.occurredOn}${c.time ? ` ${c.time}` : ""}: ${c.title}${c.who ? ` (${c.who})` : ""}`
      );
    }
  }
  if (nextTrip) {
    parts.push(
      `\nPróxima viagem: ${nextTrip.title}${nextTrip.startDate ? ` (saída ${nextTrip.startDate})` : ""}${nextTrip.ticketsBought ? " · passagens compradas" : ""}.`
    );
  }
  if (activeSonhos.length > 0) {
    parts.push(`\nSonhos ativos: ${activeSonhos.map((s) => s.title).join(", ")}.`);
  }
  if (allAniv.length > 0) {
    parts.push(
      `\nAniversários: ${allAniv.map((a) => `${a.name} (${a.monthDay})`).join(", ")}.`
    );
  }
  return parts.join("\n");
}

const SYSTEM_PROMPT = `Você é AP, assistente da família Família AP (Augusto + Marília + Francisco).

Tom: conversacional, íntimo, português brasileiro, primeira pessoa do plural quando relevante ("vocês", "a gente"). Curto e útil. Cite números específicos. NUNCA emoji. Nunca formal. Nunca empolgado.

Você tem acesso ao contexto financeiro e pessoal da família via um sumário. Responda usando esse contexto. Se faltar dado, fale qual tela usar pra cadastrar.

Rotas: /, /financeiro/{upload,transacoes,dre,faturas,contas,orcamento,categorias}, /compromissos, /finais-de-semana, /aniversarios, /viagens, /sonhos, /supermercado, /saude-{exames,peso}, /configuracoes.`;

/**
 * Server action pra ChatBar: salva mensagem do user, chama Gemini, retorna
 * estado atualizado pra useActionState atualizar a UI inline.
 */
export async function sendMessageReturn(
  prevState: ChatBarState,
  formData: FormData
): Promise<ChatBarState> {
  const content = (formData.get("content") as string)?.trim();
  if (!content) return prevState;

  let context: ChatBarState;
  try {
    const { householdId, userId } = await requireUserAndHousehold();
    const thread = await getOrCreateMainThread(householdId, userId);

    // Salva user message
    const [userMsg] = await db
      .insert(messages)
      .values({
        threadId: thread.id,
        householdId,
        userId,
        role: "user",
        content,
      })
      .returning();

    // Histórico completo da thread pra contexto (últimas 20)
    const allMessages = await db.query.messages.findMany({
      where: eq(messages.threadId, thread.id),
      orderBy: [desc(messages.createdAt)],
      limit: 20,
    });

    const summary = await buildContext(householdId);

    const history = allMessages.reverse().map((m) => ({
      role: m.role === "assistant" ? ("model" as const) : ("user" as const),
      parts: [{ text: m.content }],
    }));

    const response = await ai.models.generateContent({
      model: "gemini-flash-latest",
      contents: history,
      config: {
        systemInstruction:
          SYSTEM_PROMPT +
          "\n\n## Contexto atual da família (auto-gerado):\n\n" +
          summary,
        temperature: 0.4,
        maxOutputTokens: 600,
      },
    });

    const assistantText =
      response.text?.trim() || "(sem resposta — tente reformular)";

    const [assistantMsg] = await db
      .insert(messages)
      .values({
        threadId: thread.id,
        householdId,
        role: "assistant",
        content: assistantText,
      })
      .returning();

    await db
      .update(threads)
      .set({ updatedAt: new Date() })
      .where(eq(threads.id, thread.id));

    revalidatePath("/chat");

    context = {
      messages: [
        ...prevState.messages,
        { role: "user", content: userMsg.content, id: userMsg.id },
        { role: "assistant", content: assistantMsg.content, id: assistantMsg.id },
      ],
    };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    context = {
      messages: [
        ...prevState.messages,
        { role: "user", content, id: `local-${Date.now()}` },
        {
          role: "assistant",
          content: `(erro: ${errMsg})`,
          id: `local-err-${Date.now()}`,
        },
      ],
      error: errMsg,
    };
  }

  return context;
}
