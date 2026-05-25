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

/**
 * Monta um sumário curto do contexto da família pro Gemini saber do que falar.
 */
async function buildContext(householdId: string): Promise<string> {
  const todayStr = new Date().toISOString().slice(0, 10);

  // últimas 10 transações
  const recentTx = await db.query.transactions.findMany({
    where: eq(transactions.householdId, householdId),
    orderBy: [desc(transactions.occurredOn)],
    with: { category: true },
    limit: 10,
  });

  // próximos compromissos
  const upcoming = await db.query.compromissos.findMany({
    where: (c, { and: a }) =>
      a(eq(c.householdId, householdId), gte(c.occurredOn, todayStr)),
    orderBy: [asc(compromissos.occurredOn)],
    limit: 5,
  });

  // próxima viagem
  const nextTrip = await db.query.viagens.findFirst({
    where: (v, { and: a, ne }) =>
      a(eq(v.householdId, householdId), ne(v.status, "past")),
    orderBy: [asc(viagens.startDate)],
  });

  // sonhos ativos
  const activeSonhos = await db.query.sonhos.findMany({
    where: (s, { and: a }) =>
      a(eq(s.householdId, householdId), eq(s.status, "active")),
    limit: 5,
  });

  // aniversários próximos (qualquer um, ordenado por proximidade)
  const allAniv = await db.query.aniversarios.findMany({
    where: eq(aniversarios.householdId, householdId),
  });

  const parts: string[] = [];

  if (recentTx.length > 0) {
    parts.push("Últimas transações:");
    for (const t of recentTx.slice(0, 5)) {
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
      parts.push(`  - ${c.occurredOn}${c.time ? ` ${c.time}` : ""}: ${c.title}${c.who ? ` (${c.who})` : ""}`);
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
    parts.push(`\nAniversários cadastrados: ${allAniv.map((a) => `${a.name} (${a.monthDay})`).join(", ")}.`);
  }

  return parts.join("\n");
}

const SYSTEM_PROMPT = `Você é AP, assistente pessoal da família Família AP (Augusto + Marília + Francisco, filho).

Tom:
- Conversacional, íntimo, em português brasileiro.
- Primeira pessoa do plural quando relevante ("vocês", "a gente").
- Curto e útil. Cite números específicos quando possível.
- NUNCA usa emoji.
- Nunca formal, nunca empolgado.

Você tem acesso ao contexto financeiro e pessoal da família via um sumário no início. Responda perguntas usando esse contexto. Se não tiver dado pra responder algo específico, fale que ainda não foi cadastrado e sugira como cadastrar (qual tela do sistema).

Páginas disponíveis no sistema (caso queira sugerir):
- / (Início)
- /financeiro (hub) · /financeiro/upload · /financeiro/transacoes · /financeiro/dre · /financeiro/faturas · /financeiro/contas · /financeiro/orcamento · /financeiro/categorias
- /compromissos · /finais-de-semana · /aniversarios · /viagens · /sonhos · /supermercado · /saude-exames · /saude-peso · /configuracoes`;

export async function sendChatMessage(formData: FormData) {
  const { householdId, userId } = await requireUserAndHousehold();
  const content = (formData.get("content") as string)?.trim();
  if (!content) return;

  const thread = await getOrCreateMainThread(householdId, userId);

  // Salva mensagem do usuário
  await db.insert(messages).values({
    threadId: thread.id,
    householdId,
    userId,
    role: "user",
    content,
  });

  // Pega últimas 10 mensagens pra contexto
  const recentMessages = await db.query.messages.findMany({
    where: eq(messages.threadId, thread.id),
    orderBy: [desc(messages.createdAt)],
    limit: 10,
  });

  // Constrói contexto + histórico
  const context = await buildContext(householdId);

  const history = recentMessages
    .reverse()
    .map((m) => ({
      role: m.role === "assistant" ? ("model" as const) : ("user" as const),
      parts: [{ text: m.content }],
    }));

  try {
    const response = await ai.models.generateContent({
      model: "gemini-flash-latest",
      contents: history,
      config: {
        systemInstruction:
          SYSTEM_PROMPT +
          "\n\n## Contexto atual da família (auto-gerado, atualizado em cada mensagem):\n\n" +
          context,
        temperature: 0.4,
        maxOutputTokens: 800,
      },
    });

    const assistantText =
      response.text?.trim() ||
      "(sem resposta — tente reformular a pergunta)";

    await db.insert(messages).values({
      threadId: thread.id,
      householdId,
      role: "assistant",
      content: assistantText,
    });

    await db
      .update(threads)
      .set({ updatedAt: new Date() })
      .where(eq(threads.id, thread.id));
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    await db.insert(messages).values({
      threadId: thread.id,
      householdId,
      role: "assistant",
      content: `(erro ao chamar a IA: ${errMsg})`,
    });
  }

  revalidatePath("/chat");
}

export async function clearChatHistory() {
  const { householdId, userId } = await requireUserAndHousehold();
  const thread = await getOrCreateMainThread(householdId, userId);
  await db.delete(messages).where(eq(messages.threadId, thread.id));
  revalidatePath("/chat");
}
