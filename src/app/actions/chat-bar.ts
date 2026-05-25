"use server";

import {
  FunctionCallingConfigMode,
  GoogleGenAI,
  Type,
  type FunctionCall,
  type FunctionDeclaration,
  type Tool,
} from "@google/genai";
import { asc, desc, eq, gte, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import {
  aniversarios,
  compromissos,
  finsDeSemana,
  messages,
  pesagens,
  sonhos,
  supermercadoItens,
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

  const parts: string[] = [`Data de hoje: ${todayStr} (${new Date().toLocaleDateString("pt-BR", { weekday: "long" })})`];

  if (recentTx.length > 0) {
    parts.push("\nÚltimas transações:");
    for (const t of recentTx) {
      parts.push(
        `  - ${new Date(t.occurredOn).toLocaleDateString("pt-BR")} · ${t.kind === "debit" ? "-" : "+"}R$${t.amount} · ${t.description} (${t.category?.name ?? "sem categoria"})`
      );
    }
  } else {
    parts.push("\nSem transações registradas.");
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

Você tem ferramentas pra CRIAR dados no sistema. Use proativamente quando o usuário pedir pra adicionar/cadastrar/criar algo. Pode usar várias ferramentas na mesma resposta se necessário.

Resolva datas relativas: "amanhã", "próxima sexta", "daqui a 3 dias" — converta pra YYYY-MM-DD usando a data de hoje no contexto.

Depois de criar algo, confirme brevemente o que foi feito (sem emoji).

Se não tem ferramenta pra algo, sugira a tela: /financeiro/upload pra subir extrato, /sonhos pra cadastrar sonhos completos, etc.`;

// ── Tool declarations ──────────────────────────────────────
const functionDeclarations: FunctionDeclaration[] = [
      {
        name: "criar_compromisso",
        description:
          "Cria um compromisso/evento na agenda. Use quando o usuário pedir pra agendar, marcar, lembrar de algo numa data específica.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING, description: "Título curto, ex: 'Aula de natação do Francisco'" },
            date: { type: Type.STRING, description: "Data no formato YYYY-MM-DD" },
            time: { type: Type.STRING, description: "Hora opcional HH:MM" },
            who: { type: Type.STRING, description: "Quem está envolvido: Augusto, Marília, Francisco, Casal, Família" },
            location: { type: Type.STRING, description: "Local opcional" },
            notes: { type: Type.STRING, description: "Observações opcionais" },
            recurring: {
              type: Type.STRING,
              enum: ["once", "weekly", "biweekly", "monthly"],
              description: "Se repete: once=só uma vez (padrão), weekly=semanal (12x), biweekly=quinzenal (6x), monthly=mensal (12x)",
            },
          },
          required: ["title", "date"],
        },
      },
      {
        name: "criar_sonho",
        description: "Cria um sonho da família na lista de sonhos.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            description: { type: Type.STRING },
            imageUrl: { type: Type.STRING, description: "URL de imagem inspiração (opcional)" },
          },
          required: ["title"],
        },
      },
      {
        name: "criar_pesagem",
        description: "Registra uma pesagem (peso) de alguém da família.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            who: { type: Type.STRING, description: "Augusto, Marília, Francisco" },
            weightKg: { type: Type.STRING, description: "Peso em kg, ex: '83.4'" },
            date: { type: Type.STRING, description: "Data YYYY-MM-DD (padrão hoje)" },
            notes: { type: Type.STRING },
          },
          required: ["who", "weightKg"],
        },
      },
      {
        name: "criar_aniversario",
        description: "Cadastra um aniversário (nome + data MM-DD + ano de nascimento opcional).",
        parameters: {
          type: Type.OBJECT,
          properties: {
            name: { type: Type.STRING, description: "Nome da pessoa" },
            monthDay: { type: Type.STRING, description: "MM-DD, ex: '08-11' = 11 de agosto" },
            birthYear: { type: Type.NUMBER, description: "Ano de nascimento (opcional)" },
            relation: { type: Type.STRING, description: "Relação, ex: 'avó da Marília', 'sobrinho'" },
            notes: { type: Type.STRING },
          },
          required: ["name", "monthDay"],
        },
      },
      {
        name: "criar_item_supermercado",
        description: "Cadastra um item no estoque do supermercado.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            name: { type: Type.STRING },
            category: { type: Type.STRING, description: "ex: padaria, limpeza, frutas, mercado" },
            unit: { type: Type.STRING, description: "un, kg, L, pct, …" },
            defaultQty: { type: Type.STRING, description: "Quantidade habitual, ex: '2'" },
            estimatedPrice: { type: Type.STRING, description: "Preço estimado por unidade" },
          },
          required: ["name"],
        },
      },
      {
        name: "criar_fim_de_semana",
        description: "Adiciona uma programação a um sábado ou domingo específico.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            date: { type: Type.STRING, description: "YYYY-MM-DD (idealmente sex/sáb/dom)" },
            title: { type: Type.STRING },
            notes: { type: Type.STRING },
          },
          required: ["date", "title"],
        },
      },
      {
        name: "consultar_gastos_mes",
        description: "Retorna o total de gastos (despesas) de um mês específico.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            month: { type: Type.STRING, description: "YYYY-MM. Se omitido, usa mês atual." },
          },
        },
      },
];
const tools: Tool[] = [{ functionDeclarations }];

async function executeToolCall(
  call: FunctionCall,
  householdId: string,
  userId: string
): Promise<{ name: string; result: string }> {
  const name = call.name ?? "";
  const args = (call.args ?? {}) as Record<string, unknown>;
  try {
    switch (name) {
      case "criar_compromisso": {
        const seriesId =
          args.recurring && args.recurring !== "once" ? crypto.randomUUID() : null;
        const dates: string[] = [args.date as string];
        if (args.recurring === "weekly") {
          for (let i = 1; i < 12; i++) dates.push(addDays(args.date as string, 7 * i));
        } else if (args.recurring === "biweekly") {
          for (let i = 1; i < 6; i++) dates.push(addDays(args.date as string, 14 * i));
        } else if (args.recurring === "monthly") {
          for (let i = 1; i < 12; i++) dates.push(addMonths(args.date as string, i));
        }
        await db.insert(compromissos).values(
          dates.map((date) => ({
            householdId,
            createdById: userId,
            occurredOn: date,
            title: args.title as string,
            time: (args.time as string) || null,
            who: (args.who as string) || null,
            location: (args.location as string) || null,
            notes: (args.notes as string) || null,
            recurringRule: (args.recurring as string) === "once" ? null : (args.recurring as string) || null,
            seriesId,
          }))
        );
        revalidatePath("/compromissos");
        revalidatePath("/");
        return {
          name,
          result: `Criado: "${args.title}" em ${args.date}${args.time ? ` às ${args.time}` : ""}${dates.length > 1 ? ` (${dates.length} ocorrências, ${args.recurring})` : ""}.`,
        };
      }
      case "criar_sonho": {
        await db.insert(sonhos).values({
          householdId,
          createdById: userId,
          title: args.title as string,
          description: (args.description as string) || null,
          imageUrl: (args.imageUrl as string) || null,
          status: "active",
        });
        revalidatePath("/sonhos");
        revalidatePath("/");
        return { name, result: `Sonho cadastrado: "${args.title}".` };
      }
      case "criar_pesagem": {
        await db.insert(pesagens).values({
          householdId,
          createdById: userId,
          who: args.who as string,
          weighedOn: (args.date as string) || new Date().toISOString().slice(0, 10),
          weightKg: args.weightKg as string,
          notes: (args.notes as string) || null,
        });
        revalidatePath("/saude-peso");
        return {
          name,
          result: `Pesagem registrada: ${args.who} · ${args.weightKg} kg.`,
        };
      }
      case "criar_aniversario": {
        const md = String(args.monthDay).slice(0, 5); // MM-DD
        await db.insert(aniversarios).values({
          householdId,
          createdById: userId,
          name: args.name as string,
          monthDay: md,
          birthYear: args.birthYear ? Number(args.birthYear) : null,
          relation: (args.relation as string) || null,
          notes: (args.notes as string) || null,
        });
        revalidatePath("/aniversarios");
        return {
          name,
          result: `Aniversário cadastrado: ${args.name} em ${md}.`,
        };
      }
      case "criar_item_supermercado": {
        await db.insert(supermercadoItens).values({
          householdId,
          name: args.name as string,
          category: (args.category as string) || null,
          unit: (args.unit as string) || "un",
          defaultQty: (args.defaultQty as string) || null,
          estimatedPrice: (args.estimatedPrice as string) || null,
        });
        revalidatePath("/supermercado");
        return { name, result: `Item adicionado: "${args.name}".` };
      }
      case "criar_fim_de_semana": {
        await db.insert(finsDeSemana).values({
          householdId,
          createdById: userId,
          weekendDate: args.date as string,
          title: args.title as string,
          notes: (args.notes as string) || null,
        });
        revalidatePath("/finais-de-semana");
        return { name, result: `Programação salva em ${args.date}: "${args.title}".` };
      }
      case "consultar_gastos_mes": {
        const now = new Date();
        const monthStr = (args.month as string) || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
        const [y, m] = monthStr.split("-").map(Number);
        const start = new Date(y, m - 1, 1);
        const end = new Date(y, m, 1);
        const r = await db
          .select({
            total: sql<string>`coalesce(sum(${transactions.amount}::numeric), 0)::text`,
            count: sql<number>`count(*)::int`,
          })
          .from(transactions)
          .where(
            sql`${transactions.householdId} = ${householdId} AND ${transactions.kind} = 'debit' AND ${transactions.status} != 'ignored' AND ${transactions.occurredOn} >= ${start.toISOString()} AND ${transactions.occurredOn} < ${end.toISOString()}`
          )
          .then((rows) => rows[0]);
        return {
          name,
          result: `Gastos de ${monthStr}: R$ ${parseFloat(r?.total ?? "0").toFixed(2)} em ${r?.count ?? 0} transações.`,
        };
      }
      default:
        return { name, result: `Função "${name}" não reconhecida.` };
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { name, result: `Erro ao executar: ${msg}` };
  }
}

function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}
function addMonths(dateStr: string, months: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, m - 1 + months, d);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

/**
 * Núcleo compartilhado: processa uma mensagem do usuário, executa tools se
 * necessário, persiste user+assistant no DB e retorna ambos os registros.
 * Usado tanto pelo ChatBar (rodapé global, retorna state) quanto pelo /chat
 * (form action direta, retorna void).
 */
export async function processChatTurnWithTools(
  content: string,
  householdId: string,
  userId: string
): Promise<{
  userMsg: typeof messages.$inferSelect;
  assistantMsg: typeof messages.$inferSelect;
}> {
  const thread = await getOrCreateMainThread(householdId, userId);

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

  let response = await ai.models.generateContent({
    model: "gemini-flash-latest",
    contents: history,
    config: {
      systemInstruction:
        SYSTEM_PROMPT +
        "\n\n## Contexto atual da família (auto-gerado):\n\n" +
        summary,
      temperature: 0.4,
      maxOutputTokens: 600,
      tools,
      toolConfig: {
        functionCallingConfig: { mode: FunctionCallingConfigMode.AUTO },
      },
    },
  });

  const fnCalls: FunctionCall[] = response.functionCalls ?? [];
  let assistantText = response.text?.trim() ?? "";

  if (fnCalls.length > 0) {
    const toolResults = await Promise.all(
      fnCalls.map((call) => executeToolCall(call, householdId, userId))
    );

    const fnResponses = toolResults.map((r) => ({
      functionResponse: {
        name: r.name,
        response: { result: r.result },
      },
    }));

    response = await ai.models.generateContent({
      model: "gemini-flash-latest",
      contents: [
        ...history,
        {
          role: "model",
          parts: fnCalls.map((c) => ({ functionCall: c })),
        },
        {
          role: "user",
          parts: fnResponses,
        },
      ],
      config: {
        systemInstruction:
          SYSTEM_PROMPT +
          "\n\n## Contexto atual da família (auto-gerado):\n\n" +
          summary,
        temperature: 0.3,
        maxOutputTokens: 400,
      },
    });

    assistantText =
      response.text?.trim() ?? toolResults.map((r) => r.result).join(" ");
  }

  if (!assistantText) {
    assistantText = "(sem resposta — tente reformular)";
  }

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

  return { userMsg, assistantMsg };
}

export async function sendMessageReturn(
  prevState: ChatBarState,
  formData: FormData
): Promise<ChatBarState> {
  const content = (formData.get("content") as string)?.trim();
  if (!content) return prevState;

  try {
    const { householdId, userId } = await requireUserAndHousehold();
    const { userMsg, assistantMsg } = await processChatTurnWithTools(
      content,
      householdId,
      userId
    );

    return {
      messages: [
        ...prevState.messages,
        { role: "user", content: userMsg.content, id: userMsg.id },
        { role: "assistant", content: assistantMsg.content, id: assistantMsg.id },
      ],
    };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    return {
      messages: [
        ...prevState.messages,
        { role: "user", content, id: `local-${Date.now()}` },
        { role: "assistant", content: `(erro: ${errMsg})`, id: `local-err-${Date.now()}` },
      ],
      error: errMsg,
    };
  }
}
