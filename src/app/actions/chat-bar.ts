"use server";

import {
  FunctionCallingConfigMode,
  GoogleGenAI,
  Type,
  type Content,
  type FunctionCall,
  type FunctionDeclaration,
  type Tool,
} from "@google/genai";
import { and, asc, desc, eq, gte, ilike, lte, ne, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import {
  aniversarios,
  cardapioEntries,
  categories,
  compromissos,
  exames,
  invoices,
  memories,
  messages,
  pesagens,
  receitas,
  sonhos,
  supermercadoItens,
  threads,
  transactions,
  users,
  viagens,
} from "@/db/schema";
import { extrairReceitaDeUrl } from "@/app/actions/cardapio";
import { requireUserAndHousehold } from "@/lib/auth-helpers";

// ────────────────────────────────────────────────────────────
// Cliente Gemini — lazy: erro só dispara no momento da chamada,
// não no import (evita route inteira quebrar em build).
// ────────────────────────────────────────────────────────────
const MODEL = "gemini-flash-latest";

function getAI(): GoogleGenAI {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    throw new Error(
      "GEMINI_API_KEY não está configurada. Defina em .env.local (dev) ou em Project Settings → Environment Variables (Vercel)."
    );
  }
  return new GoogleGenAI({ apiKey: key });
}

export type ChatBarMessage = {
  role: "user" | "assistant";
  content: string;
  id: string;
};

export type ChatBarState = {
  messages: ChatBarMessage[];
  error?: string;
};

// ────────────────────────────────────────────────────────────
// Thread
// ────────────────────────────────────────────────────────────
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

// ────────────────────────────────────────────────────────────
// Contexto inicial — slim. Tools fazem o deep dive.
// ────────────────────────────────────────────────────────────
async function buildContext(householdId: string, currentUserId: string, currentUserName: string | null) {
  const todayStr = new Date().toISOString().slice(0, 10);
  const weekday = new Date().toLocaleDateString("pt-BR", { weekday: "long" });

  const householdUsers = await db.query.users.findMany({
    where: eq(users.householdId, householdId),
  });
  const peopleList = householdUsers
    .map((u) => `${u.name ?? u.email}${u.id === currentUserId ? " (você fala com ele/ela agora)" : ""}`)
    .join(", ");

  // 20 memórias mais recentes do household (todos os usuários)
  const mems = await db.query.memories.findMany({
    where: eq(memories.householdId, householdId),
    orderBy: [desc(memories.updatedAt)],
    limit: 20,
  });
  const memById = new Map(householdUsers.map((u) => [u.id, u.name ?? u.email ?? "?"]));
  const memSection =
    mems.length > 0
      ? mems
          .map(
            (m) =>
              `  - [${m.kind}] ${m.content}${m.createdByUserId ? ` (anotado por ${memById.get(m.createdByUserId) ?? "?"})` : ""}`
          )
          .join("\n")
      : "  (sem memórias salvas ainda)";

  const parts: string[] = [
    `Data de hoje: ${todayStr} (${weekday})`,
    `Família AP — membros: ${peopleList}.`,
    `Você está conversando com: ${currentUserName ?? "usuário"}.`,
    "\nMemórias salvas sobre a família (use pra personalizar respostas):",
    memSection,
  ];

  return parts.join("\n");
}

const SYSTEM_PROMPT = `Você é AP, assistente da família Família AP (Gabriel + Marília + Francisco).

Tom: conversacional, íntimo, português brasileiro. Primeira pessoa do plural quando fizer sentido ("vocês", "a gente"). Curto, útil, direto. Cite números específicos quando tiver. NUNCA use emoji. Nunca seja formal. Nunca seja empolgado.

Você tem ferramentas pra LER (consultar_*) e ESCREVER (criar_*) dados do sistema da família. Use proativamente:
- Se a pessoa perguntar algo factual ("qual foi o saldo de abril?", "quantos exames a Marília tem?"), CHAME a tool de consulta antes de responder — não invente.
- Se a pessoa pedir pra criar/agendar/registrar algo, CHAME a tool de criação.
- Pode encadear várias tools numa mesma resposta se precisar.

Memória: use \`salvar_memoria\` quando aprender algo importante e durável sobre a família (preferências, fatos, metas, eventos relevantes). Não salve fofoca trivial. Use \`esquecer_memoria\` se a pessoa pedir pra apagar.

Datas relativas: "amanhã", "próxima sexta", "daqui a 3 dias" — converta pra YYYY-MM-DD usando a data de hoje no contexto.

Depois de criar algo, confirme brevemente o que foi feito (sem emoji).

Se algo não tem ferramenta, oriente a tela: /financeiro/upload (subir extrato), /sonhos, /compromissos, /cardapio, etc.

Cardápio + Receitas: se o usuário mandar um link (Instagram, YouTube, blog) e pedir pra cadastrar/registrar/salvar receita, chame \`importar_receita_de_url\`. Depois, se ele quiser agendar pra um dia, chame \`agendar_almoco\` com o receitaId retornado. Sempre confirme com 1 linha o que foi feito.`;

// ────────────────────────────────────────────────────────────
// Tool declarations
// ────────────────────────────────────────────────────────────
const functionDeclarations: FunctionDeclaration[] = [
  // ── WRITE ──────────────────────────────────────────────────
  {
    name: "criar_compromisso",
    description: "Cria compromisso/evento na agenda.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        title: { type: Type.STRING, description: "Ex: 'Aula de natação do Francisco'" },
        date: { type: Type.STRING, description: "YYYY-MM-DD" },
        time: { type: Type.STRING, description: "HH:MM opcional" },
        who: { type: Type.STRING, description: "Gabriel, Marília, Francisco, Casal, Família" },
        location: { type: Type.STRING },
        notes: { type: Type.STRING },
        recurring: {
          type: Type.STRING,
          enum: ["once", "weekly", "biweekly", "monthly"],
          description: "once=1x, weekly=semanal 12x, biweekly=quinzenal 6x, monthly=mensal 12x",
        },
      },
      required: ["title", "date"],
    },
  },
  {
    name: "criar_sonho",
    description: "Cadastra um sonho da família.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        title: { type: Type.STRING },
        description: { type: Type.STRING },
        imageUrl: { type: Type.STRING },
      },
      required: ["title"],
    },
  },
  {
    name: "criar_pesagem",
    description: "Registra pesagem (peso e/ou altura).",
    parameters: {
      type: Type.OBJECT,
      properties: {
        who: { type: Type.STRING, description: "Gabriel, Marília ou Francisco" },
        weightKg: { type: Type.STRING, description: "Ex: '83.4'" },
        heightCm: { type: Type.STRING, description: "Ex: '178' — útil pra Francisco (bebê)" },
        date: { type: Type.STRING, description: "YYYY-MM-DD (padrão hoje)" },
        notes: { type: Type.STRING },
      },
      required: ["who", "weightKg"],
    },
  },
  {
    name: "criar_aniversario",
    description: "Cadastra aniversário.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        name: { type: Type.STRING },
        monthDay: { type: Type.STRING, description: "MM-DD (ex: 08-11)" },
        birthYear: { type: Type.NUMBER },
        relation: { type: Type.STRING },
        notes: { type: Type.STRING },
      },
      required: ["name", "monthDay"],
    },
  },
  {
    name: "criar_item_supermercado",
    description: "Cadastra item no estoque do supermercado.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        name: { type: Type.STRING },
        category: { type: Type.STRING },
        unit: { type: Type.STRING },
        defaultQty: { type: Type.STRING },
        estimatedPrice: { type: Type.STRING },
      },
      required: ["name"],
    },
  },
  {
    name: "criar_viagem",
    description: "Cadastra uma viagem (planejada, em curso ou já realizada).",
    parameters: {
      type: Type.OBJECT,
      properties: {
        title: { type: Type.STRING, description: "Ex: 'Lisboa + Porto'" },
        destinationCity: { type: Type.STRING },
        destinationCountry: { type: Type.STRING, description: "Sigla 2 letras" },
        startDate: { type: Type.STRING, description: "YYYY-MM-DD" },
        endDate: { type: Type.STRING, description: "YYYY-MM-DD" },
        status: {
          type: Type.STRING,
          enum: ["planned", "in_progress", "past"],
        },
        notes: { type: Type.STRING },
      },
      required: ["title"],
    },
  },
  {
    name: "criar_transacao",
    description: "Lança uma transação manual (despesa ou receita).",
    parameters: {
      type: Type.OBJECT,
      properties: {
        description: { type: Type.STRING },
        amount: { type: Type.STRING, description: "Valor absoluto, ex: '120.50'" },
        kind: { type: Type.STRING, enum: ["debit", "credit"], description: "debit=despesa, credit=receita" },
        date: { type: Type.STRING, description: "YYYY-MM-DD" },
        category: { type: Type.STRING, description: "Nome da categoria (será matched por nome)" },
      },
      required: ["description", "amount", "kind"],
    },
  },
  {
    name: "salvar_memoria",
    description:
      "Salva algo durável sobre a família ou o usuário: preferências, fatos, metas, eventos relevantes. Use proativamente quando aprender algo que vai querer lembrar em conversas futuras.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        content: { type: Type.STRING, description: "Texto curto e específico, 1ª pessoa do usuário não, 3ª pessoa." },
        kind: {
          type: Type.STRING,
          enum: ["fact", "preference", "goal", "event"],
          description: "fact=fato; preference=preferência; goal=objetivo; event=evento marcante",
        },
      },
      required: ["content", "kind"],
    },
  },
  {
    name: "esquecer_memoria",
    description: "Apaga uma memória específica pelo ID (use após consultar_memorias).",
    parameters: {
      type: Type.OBJECT,
      properties: { memoryId: { type: Type.STRING } },
      required: ["memoryId"],
    },
  },

  // ── READ ───────────────────────────────────────────────────
  {
    name: "consultar_compromissos",
    description: "Lista compromissos da agenda. Por padrão retorna próximos 10.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        fromDate: { type: Type.STRING, description: "YYYY-MM-DD (inclusive). Default: hoje" },
        toDate: { type: Type.STRING, description: "YYYY-MM-DD (inclusive)." },
        who: { type: Type.STRING, description: "Filtra por pessoa envolvida" },
        searchText: { type: Type.STRING, description: "Busca no título (case-insensitive)" },
        limit: { type: Type.NUMBER, description: "Default 10" },
      },
    },
  },
  {
    name: "consultar_pesagens",
    description: "Lista pesagens de uma pessoa, mais recentes primeiro.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        who: { type: Type.STRING },
        limit: { type: Type.NUMBER, description: "Default 10" },
      },
      required: ["who"],
    },
  },
  {
    name: "consultar_exames",
    description: "Lista exames de uma pessoa, mais recentes primeiro.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        who: { type: Type.STRING },
        limit: { type: Type.NUMBER, description: "Default 10" },
      },
      required: ["who"],
    },
  },
  {
    name: "consultar_viagens",
    description: "Lista viagens.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        status: { type: Type.STRING, enum: ["planned", "in_progress", "past"] },
        limit: { type: Type.NUMBER, description: "Default 10" },
      },
    },
  },
  {
    name: "consultar_sonhos",
    description: "Lista sonhos ativos da família.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        status: { type: Type.STRING, enum: ["active", "realized", "paused"] },
        limit: { type: Type.NUMBER },
      },
    },
  },
  {
    name: "consultar_aniversarios",
    description: "Lista aniversários, ordenados por proximidade.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        proximosDias: { type: Type.NUMBER, description: "Filtra aniversários nos próximos N dias. Default 365." },
        limit: { type: Type.NUMBER },
      },
    },
  },
  {
    name: "consultar_estoque",
    description: "Lista itens do estoque do supermercado, com estoque atual e mínimo.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        somenteFaltando: { type: Type.BOOLEAN, description: "Se true, retorna só itens com estoque abaixo do mínimo" },
        limit: { type: Type.NUMBER },
      },
    },
  },
  {
    name: "consultar_transacoes",
    description: "Lista transações (despesas/receitas) com filtros.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        mes: { type: Type.STRING, description: "YYYY-MM. Se omitido, último mês." },
        kind: { type: Type.STRING, enum: ["debit", "credit"] },
        busca: { type: Type.STRING, description: "Busca na descrição (case-insensitive)" },
        limit: { type: Type.NUMBER, description: "Default 15" },
      },
    },
  },
  {
    name: "consultar_dre",
    description: "DRE (saldo, receitas, despesas) de um mês ou ano.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        mes: { type: Type.STRING, description: "YYYY-MM para visão mensal" },
        ano: { type: Type.NUMBER, description: "YYYY para visão anual" },
      },
    },
  },
  {
    name: "consultar_faturas",
    description: "Lista faturas de cartão de crédito.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        status: { type: Type.STRING, enum: ["open", "scheduled", "paid"] },
        limit: { type: Type.NUMBER },
      },
    },
  },
  {
    name: "consultar_memorias",
    description: "Lista memórias salvas sobre a família.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        kind: { type: Type.STRING, enum: ["fact", "preference", "goal", "event"] },
        limit: { type: Type.NUMBER },
      },
    },
  },

  // ── Cardápio + Receitas ─────────────────────────────────────
  {
    name: "criar_receita",
    description:
      "Cria uma receita no livro. Use quando o usuário ditar a receita ou pedir pra cadastrar manualmente. Pra importar de um link use `importar_receita_de_url`.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        title: { type: Type.STRING },
        description: { type: Type.STRING, description: "Resumo de 1 linha" },
        ingredients: { type: Type.STRING, description: "1 ingrediente por linha, com hífen no começo" },
        steps: { type: Type.STRING, description: "1 passo por linha, numerado (1., 2., 3...)" },
        prepTimeMin: { type: Type.NUMBER },
        servings: { type: Type.NUMBER },
        tags: { type: Type.STRING, description: "CSV: 'rápido,vegetariano,frango'" },
        sourceUrl: { type: Type.STRING },
        imageUrl: { type: Type.STRING },
      },
      required: ["title"],
    },
  },
  {
    name: "importar_receita_de_url",
    description:
      "Baixa o conteúdo de um link (Instagram, YouTube, blog) e extrai a receita automaticamente. Use quando o usuário compartilhar um link e pedir pra cadastrar.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        url: { type: Type.STRING, description: "URL completa" },
      },
      required: ["url"],
    },
  },
  {
    name: "agendar_almoco",
    description:
      "Define o almoço de uma data. Pode passar receitaId (vincula receita) ou title (texto livre). Substitui o almoço existente daquele dia.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        date: { type: Type.STRING, description: "YYYY-MM-DD" },
        receitaId: { type: Type.STRING, description: "ID da receita (use consultar_receitas pra achar)" },
        title: { type: Type.STRING, description: "Texto livre se não tem receita vinculada" },
        notes: { type: Type.STRING },
      },
      required: ["date"],
    },
  },
  {
    name: "consultar_cardapio",
    description: "Lista os almoços planejados num intervalo. Por padrão a semana corrente.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        fromDate: { type: Type.STRING, description: "YYYY-MM-DD inclusive" },
        toDate: { type: Type.STRING, description: "YYYY-MM-DD inclusive" },
      },
    },
  },
  {
    name: "consultar_receitas",
    description: "Lista receitas do livro, opcionalmente filtrando por texto.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        busca: { type: Type.STRING, description: "Texto no título (case-insensitive)" },
        somenteFavoritas: { type: Type.BOOLEAN },
        limit: { type: Type.NUMBER, description: "Default 20" },
      },
    },
  },
];
const tools: Tool[] = [{ functionDeclarations }];

// ────────────────────────────────────────────────────────────
// Helpers de data
// ────────────────────────────────────────────────────────────
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
function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}
function formatBRL(n: number): string {
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ────────────────────────────────────────────────────────────
// Executor de tools
// ────────────────────────────────────────────────────────────
async function executeToolCall(
  call: FunctionCall,
  householdId: string,
  userId: string
): Promise<{ name: string; result: string }> {
  const name = call.name ?? "";
  const args = (call.args ?? {}) as Record<string, unknown>;

  try {
    switch (name) {
      // ─── WRITE ──────────────────────────────────────────────
      case "criar_compromisso": {
        const recurring = (args.recurring as string) || "once";
        const seriesId = recurring !== "once" ? crypto.randomUUID() : null;
        const dates: string[] = [args.date as string];
        if (recurring === "weekly") for (let i = 1; i < 12; i++) dates.push(addDays(args.date as string, 7 * i));
        else if (recurring === "biweekly") for (let i = 1; i < 6; i++) dates.push(addDays(args.date as string, 14 * i));
        else if (recurring === "monthly") for (let i = 1; i < 12; i++) dates.push(addMonths(args.date as string, i));
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
            recurringRule: recurring === "once" ? null : recurring,
            seriesId,
          }))
        );
        revalidatePath("/compromissos");
        revalidatePath("/");
        return {
          name,
          result: `Criado: "${args.title}" em ${args.date}${args.time ? ` às ${args.time}` : ""}${dates.length > 1 ? ` (${dates.length} ocorrências, ${recurring})` : ""}.`,
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
        return { name, result: `Sonho cadastrado: "${args.title}".` };
      }
      case "criar_pesagem": {
        await db.insert(pesagens).values({
          householdId,
          createdById: userId,
          who: args.who as string,
          weighedOn: (args.date as string) || todayISO(),
          weightKg: args.weightKg as string,
          heightCm: (args.heightCm as string) || null,
          notes: (args.notes as string) || null,
        });
        revalidatePath("/saude-peso");
        return {
          name,
          result: `Pesagem registrada: ${args.who} · ${args.weightKg} kg${args.heightCm ? ` · ${args.heightCm} cm` : ""}.`,
        };
      }
      case "criar_aniversario": {
        const md = String(args.monthDay).slice(0, 5);
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
        return { name, result: `Aniversário cadastrado: ${args.name} em ${md}.` };
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
      case "criar_viagem": {
        const status = ((args.status as string) || "planned") as "planned" | "in_progress" | "past";
        const startDate = (args.startDate as string) || null;
        const endDate = (args.endDate as string) || null;
        const nights =
          startDate && endDate
            ? Math.max(
                0,
                Math.round(
                  (new Date(endDate).getTime() - new Date(startDate).getTime()) / 86_400_000
                )
              )
            : null;
        await db.insert(viagens).values({
          householdId,
          createdById: userId,
          title: args.title as string,
          destinationCity: (args.destinationCity as string) || null,
          destinationCountry: (args.destinationCountry as string)?.toUpperCase() || null,
          startDate,
          endDate,
          nights,
          status,
          notes: (args.notes as string) || null,
        });
        revalidatePath("/viagens");
        return { name, result: `Viagem criada: "${args.title}" (${status}).` };
      }
      case "criar_transacao": {
        const cat = args.category
          ? await db.query.categories.findFirst({
              where: and(
                eq(categories.householdId, householdId),
                ilike(categories.name, args.category as string)
              ),
            })
          : null;
        const dateStr = (args.date as string) || todayISO();
        const occurredOn = new Date(`${dateStr}T12:00:00`);
        await db.insert(transactions).values({
          householdId,
          createdById: userId,
          occurredOn,
          amount: args.amount as string,
          kind: args.kind as "debit" | "credit",
          description: args.description as string,
          rawDescription: args.description as string,
          categoryId: cat?.id ?? null,
          status: "confirmed",
        });
        revalidatePath("/financeiro/transacoes");
        revalidatePath("/financeiro/dre");
        revalidatePath("/");
        return {
          name,
          result: `Lançado ${args.kind === "debit" ? "débito" : "crédito"}: R$ ${args.amount} · "${args.description}"${cat ? ` em ${cat.name}` : ""}.`,
        };
      }
      case "salvar_memoria": {
        const kind = ((args.kind as string) || "fact") as "fact" | "preference" | "goal" | "event";
        const [m] = await db
          .insert(memories)
          .values({
            householdId,
            createdByUserId: userId,
            kind,
            content: args.content as string,
          })
          .returning();
        return { name, result: `Memória salva [${kind}]: "${m.content}" (id ${m.id.slice(0, 8)}).` };
      }
      case "esquecer_memoria": {
        const id = args.memoryId as string;
        const existing = await db.query.memories.findFirst({ where: eq(memories.id, id) });
        if (!existing || existing.householdId !== householdId) {
          return { name, result: "Memória não encontrada." };
        }
        await db.delete(memories).where(eq(memories.id, id));
        return { name, result: `Memória apagada: "${existing.content}".` };
      }

      // ─── READ ───────────────────────────────────────────────
      case "consultar_compromissos": {
        const fromDate = (args.fromDate as string) || todayISO();
        const toDate = args.toDate as string | undefined;
        const limit = Math.min(Number(args.limit ?? 10), 50);
        const conditions = [eq(compromissos.householdId, householdId), gte(compromissos.occurredOn, fromDate)];
        if (toDate) conditions.push(lte(compromissos.occurredOn, toDate));
        if (args.who) conditions.push(eq(compromissos.who, args.who as string));
        if (args.searchText) conditions.push(ilike(compromissos.title, `%${args.searchText}%`));
        const rows = await db.query.compromissos.findMany({
          where: and(...conditions),
          orderBy: [asc(compromissos.occurredOn), asc(compromissos.time)],
          limit,
        });
        if (rows.length === 0) return { name, result: "Nenhum compromisso encontrado nesse filtro." };
        return {
          name,
          result: rows
            .map(
              (c) =>
                `${c.occurredOn}${c.time ? ` ${c.time}` : ""} · ${c.title}${c.who ? ` (${c.who})` : ""}${c.location ? ` em ${c.location}` : ""}`
            )
            .join("\n"),
        };
      }
      case "consultar_pesagens": {
        const limit = Math.min(Number(args.limit ?? 10), 50);
        const rows = await db.query.pesagens.findMany({
          where: and(eq(pesagens.householdId, householdId), eq(pesagens.who, args.who as string)),
          orderBy: [desc(pesagens.weighedOn)],
          limit,
        });
        if (rows.length === 0) return { name, result: `Sem pesagens de ${args.who}.` };
        return {
          name,
          result: rows
            .map((p) => `${p.weighedOn} · ${p.weightKg} kg${p.heightCm ? ` · ${p.heightCm} cm` : ""}`)
            .join("\n"),
        };
      }
      case "consultar_exames": {
        const limit = Math.min(Number(args.limit ?? 10), 50);
        const rows = await db.query.exames.findMany({
          where: and(eq(exames.householdId, householdId), eq(exames.who, args.who as string)),
          orderBy: [desc(exames.examDate)],
          limit,
        });
        if (rows.length === 0) return { name, result: `Sem exames de ${args.who}.` };
        return {
          name,
          result: rows
            .map((e) => `${e.examDate} · ${e.name} (${e.status})${e.doctor ? ` · ${e.doctor}` : ""}`)
            .join("\n"),
        };
      }
      case "consultar_viagens": {
        const limit = Math.min(Number(args.limit ?? 10), 50);
        const conditions = [eq(viagens.householdId, householdId)];
        if (args.status) conditions.push(eq(viagens.status, args.status as "planned" | "in_progress" | "past"));
        const rows = await db.query.viagens.findMany({
          where: and(...conditions),
          orderBy: [desc(viagens.startDate)],
          limit,
        });
        if (rows.length === 0) return { name, result: "Sem viagens." };
        return {
          name,
          result: rows
            .map(
              (v) =>
                `${v.title}${v.destinationCity ? ` (${v.destinationCity})` : ""}${v.startDate ? ` · saída ${v.startDate}` : ""} · ${v.status}`
            )
            .join("\n"),
        };
      }
      case "consultar_sonhos": {
        const limit = Math.min(Number(args.limit ?? 10), 50);
        const conditions = [eq(sonhos.householdId, householdId)];
        if (args.status) conditions.push(eq(sonhos.status, args.status as "active" | "realized" | "paused"));
        const rows = await db.query.sonhos.findMany({
          where: and(...conditions),
          orderBy: [desc(sonhos.createdAt)],
          limit,
        });
        if (rows.length === 0) return { name, result: "Sem sonhos cadastrados." };
        return {
          name,
          result: rows
            .map((s) => `${s.title} (${s.status})${s.description ? ` · ${s.description}` : ""}`)
            .join("\n"),
        };
      }
      case "consultar_aniversarios": {
        const dias = Number(args.proximosDias ?? 365);
        const limit = Math.min(Number(args.limit ?? 30), 100);
        const all = await db.query.aniversarios.findMany({
          where: eq(aniversarios.householdId, householdId),
        });
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const enriched = all.map((a) => {
          const [mm, dd] = a.monthDay.split("-").map(Number);
          let target = new Date(today.getFullYear(), mm - 1, dd);
          if (target < today) target = new Date(today.getFullYear() + 1, mm - 1, dd);
          const daysUntil = Math.round((target.getTime() - today.getTime()) / 86_400_000);
          return { ...a, daysUntil };
        });
        const filtered = enriched
          .filter((a) => a.daysUntil <= dias)
          .sort((a, b) => a.daysUntil - b.daysUntil)
          .slice(0, limit);
        if (filtered.length === 0) return { name, result: `Nenhum aniversário nos próximos ${dias} dias.` };
        return {
          name,
          result: filtered
            .map(
              (a) =>
                `${a.monthDay} · ${a.name}${a.relation ? ` (${a.relation})` : ""} · em ${a.daysUntil}d${a.birthYear ? ` · faz ${today.getFullYear() - a.birthYear + (a.daysUntil > 0 ? 1 : 0)}` : ""}`
            )
            .join("\n"),
        };
      }
      case "consultar_estoque": {
        const limit = Math.min(Number(args.limit ?? 30), 100);
        const rows = await db.query.supermercadoItens.findMany({
          where: eq(supermercadoItens.householdId, householdId),
          orderBy: [asc(supermercadoItens.name)],
        });
        const filtered = args.somenteFaltando
          ? rows.filter((it) => {
              const cur = parseFloat(it.currentStock ?? "0");
              const min = parseFloat(it.minStock ?? "0");
              return min > 0 && cur < min;
            })
          : rows;
        const display = filtered.slice(0, limit);
        if (display.length === 0) {
          return { name, result: args.somenteFaltando ? "Tudo abastecido." : "Estoque vazio." };
        }
        return {
          name,
          result: display
            .map(
              (it) =>
                `${it.name}${it.category ? ` (${it.category})` : ""} · estoque ${it.currentStock ?? "0"}${it.unit ? ` ${it.unit}` : ""}${it.minStock ? ` (mín ${it.minStock})` : ""}`
            )
            .join("\n"),
        };
      }
      case "consultar_transacoes": {
        const limit = Math.min(Number(args.limit ?? 15), 60);
        const monthStr = (args.mes as string) || todayISO().slice(0, 7);
        const [y, m] = monthStr.split("-").map(Number);
        const start = new Date(y, m - 1, 1);
        const end = new Date(y, m, 1);
        const conditions = [
          eq(transactions.householdId, householdId),
          ne(transactions.status, "ignored" as const),
          gte(transactions.occurredOn, start),
          lte(transactions.occurredOn, end),
        ];
        if (args.kind) conditions.push(eq(transactions.kind, args.kind as "debit" | "credit"));
        if (args.busca) conditions.push(ilike(transactions.description, `%${args.busca}%`));
        const rows = await db.query.transactions.findMany({
          where: and(...conditions),
          orderBy: [desc(transactions.occurredOn)],
          with: { category: true },
          limit,
        });
        if (rows.length === 0) return { name, result: `Sem transações em ${monthStr}.` };
        return {
          name,
          result: rows
            .map(
              (t) =>
                `${new Date(t.occurredOn).toISOString().slice(0, 10)} · ${t.kind === "debit" ? "-" : "+"}R$${t.amount} · ${t.description} (${t.category?.name ?? "sem categoria"})`
            )
            .join("\n"),
        };
      }
      case "consultar_dre": {
        const now = new Date();
        const monthStr = (args.mes as string) || null;
        const ano = args.ano ? Number(args.ano) : monthStr ? Number(monthStr.split("-")[0]) : now.getFullYear();
        let start: Date, end: Date, label: string;
        if (monthStr) {
          const [y, m] = monthStr.split("-").map(Number);
          start = new Date(y, m - 1, 1);
          end = new Date(y, m, 1);
          label = monthStr;
        } else {
          start = new Date(ano, 0, 1);
          end = new Date(ano + 1, 0, 1);
          label = String(ano);
        }
        const r = await db
          .select({
            debit: sql<string>`coalesce(sum(case when ${transactions.kind} = 'debit' then ${transactions.amount}::numeric else 0 end), 0)::text`,
            credit: sql<string>`coalesce(sum(case when ${transactions.kind} = 'credit' then ${transactions.amount}::numeric else 0 end), 0)::text`,
            count: sql<number>`count(*)::int`,
          })
          .from(transactions)
          .where(
            sql`${transactions.householdId} = ${householdId} AND ${transactions.status} != 'ignored' AND ${transactions.occurredOn} >= ${start.toISOString()} AND ${transactions.occurredOn} < ${end.toISOString()}`
          )
          .then((rows) => rows[0]);
        const debit = parseFloat(r?.debit ?? "0");
        const credit = parseFloat(r?.credit ?? "0");
        const saldo = credit - debit;
        return {
          name,
          result: `DRE ${label}: receitas R$ ${formatBRL(credit)} · despesas R$ ${formatBRL(debit)} · saldo R$ ${formatBRL(saldo)} (${r?.count ?? 0} transações).`,
        };
      }
      case "consultar_faturas": {
        const limit = Math.min(Number(args.limit ?? 10), 50);
        const conditions = [eq(invoices.householdId, householdId)];
        if (args.status) conditions.push(eq(invoices.status, args.status as "open" | "scheduled" | "paid"));
        const rows = await db.query.invoices.findMany({
          where: and(...conditions),
          orderBy: [desc(invoices.referenceMonth)],
          with: { bankAccount: true },
          limit,
        });
        if (rows.length === 0) return { name, result: "Sem faturas cadastradas." };
        return {
          name,
          result: rows
            .map(
              (i) =>
                `${i.bankAccount?.name ?? "?"} · ${i.referenceMonth} · R$ ${i.totalAmount} · ${i.status}${i.dueDate ? ` · vence ${i.dueDate}` : ""}`
            )
            .join("\n"),
        };
      }
      case "consultar_memorias": {
        const limit = Math.min(Number(args.limit ?? 20), 100);
        const conditions = [eq(memories.householdId, householdId)];
        if (args.kind) conditions.push(eq(memories.kind, args.kind as "fact" | "preference" | "goal" | "event"));
        const rows = await db.query.memories.findMany({
          where: and(...conditions),
          orderBy: [desc(memories.updatedAt)],
          limit,
        });
        if (rows.length === 0) return { name, result: "Sem memórias salvas." };
        return {
          name,
          result: rows
            .map((m) => `[${m.kind}] ${m.id.slice(0, 8)} · ${m.content}`)
            .join("\n"),
        };
      }

      // ── Cardápio + Receitas ────────────────────────────────
      case "criar_receita": {
        const [r] = await db
          .insert(receitas)
          .values({
            householdId,
            createdById: userId,
            title: args.title as string,
            description: (args.description as string) || null,
            sourceUrl: (args.sourceUrl as string) || null,
            imageUrl: (args.imageUrl as string) || null,
            prepTimeMin: args.prepTimeMin ? Number(args.prepTimeMin) : null,
            servings: args.servings ? Number(args.servings) : null,
            ingredients: (args.ingredients as string) || null,
            steps: (args.steps as string) || null,
            tags: (args.tags as string) || null,
          })
          .returning();
        revalidatePath("/cardapio/receitas");
        return {
          name,
          result: `Receita criada: "${r.title}" (id ${r.id.slice(0, 8)}).`,
        };
      }
      case "importar_receita_de_url": {
        const url = (args.url as string) || "";
        if (!url) return { name, result: "URL obrigatória." };
        const extracted = await extrairReceitaDeUrl(url);
        const [r] = await db
          .insert(receitas)
          .values({
            householdId,
            createdById: userId,
            title: extracted.title,
            description: extracted.description,
            sourceUrl: url,
            imageUrl: extracted.imageUrl,
            prepTimeMin: extracted.prepTimeMin,
            servings: extracted.servings,
            ingredients: extracted.ingredients,
            steps: extracted.steps,
            tags: extracted.tags,
          })
          .returning();
        revalidatePath("/cardapio/receitas");
        return {
          name,
          result: `Receita importada de ${url}: "${r.title}" (id ${r.id.slice(0, 8)})${r.prepTimeMin ? ` · ${r.prepTimeMin}min` : ""}${r.servings ? ` · ${r.servings} porções` : ""}.`,
        };
      }
      case "agendar_almoco": {
        const date = args.date as string;
        const receitaId = ((args.receitaId as string) || "").trim() || null;
        const titleRaw = ((args.title as string) || "").trim();
        const notes = ((args.notes as string) || "").trim() || null;
        let titleFinal = titleRaw || null;
        if (receitaId) {
          const r = await db.query.receitas.findFirst({ where: eq(receitas.id, receitaId) });
          if (!r || r.householdId !== householdId) {
            return { name, result: "Receita não encontrada." };
          }
          titleFinal = r.title;
        }
        if (!receitaId && !titleFinal) {
          return { name, result: "Precisa de receitaId ou title." };
        }
        const existing = await db.query.cardapioEntries.findFirst({
          where: and(
            eq(cardapioEntries.householdId, householdId),
            eq(cardapioEntries.mealDate, date)
          ),
        });
        if (existing) {
          await db
            .update(cardapioEntries)
            .set({ receitaId, title: titleFinal, notes })
            .where(eq(cardapioEntries.id, existing.id));
        } else {
          await db.insert(cardapioEntries).values({
            householdId,
            createdById: userId,
            mealDate: date,
            receitaId,
            title: titleFinal,
            notes,
          });
        }
        revalidatePath("/cardapio");
        return { name, result: `Almoço de ${date}: ${titleFinal}.` };
      }
      case "consultar_cardapio": {
        const today = todayISO();
        const fromDate = (args.fromDate as string) || today;
        const toDate = (args.toDate as string) || addDays(today, 7);
        const rows = await db.query.cardapioEntries.findMany({
          where: and(
            eq(cardapioEntries.householdId, householdId),
            gte(cardapioEntries.mealDate, fromDate),
            lte(cardapioEntries.mealDate, toDate)
          ),
          with: { receita: true },
          orderBy: [asc(cardapioEntries.mealDate)],
        });
        if (rows.length === 0) {
          return { name, result: `Sem almoços agendados de ${fromDate} a ${toDate}.` };
        }
        return {
          name,
          result: rows
            .map(
              (e) =>
                `${e.mealDate} · ${e.receita?.title ?? e.title ?? "(sem título)"}${e.notes ? ` · ${e.notes}` : ""}`
            )
            .join("\n"),
        };
      }
      case "consultar_receitas": {
        const limit = Math.min(Number(args.limit ?? 20), 80);
        const conditions = [eq(receitas.householdId, householdId)];
        if (args.somenteFavoritas) conditions.push(eq(receitas.isFavorite, true));
        if (args.busca) conditions.push(ilike(receitas.title, `%${args.busca}%`));
        const rows = await db.query.receitas.findMany({
          where: and(...conditions),
          orderBy: [desc(receitas.isFavorite), desc(receitas.updatedAt)],
          limit,
        });
        if (rows.length === 0) return { name, result: "Nenhuma receita encontrada." };
        return {
          name,
          result: rows
            .map(
              (r) =>
                `${r.id.slice(0, 8)} · ${r.title}${r.isFavorite ? " ★" : ""}${r.prepTimeMin ? ` · ${r.prepTimeMin}min` : ""}${r.tags ? ` [${r.tags}]` : ""}`
            )
            .join("\n"),
        };
      }

      default:
        return { name, result: `Função "${name}" não reconhecida.` };
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[chat-bar tool error] ${name}:`, err);
    return { name, result: `Erro ao executar ${name}: ${msg}` };
  }
}

// ────────────────────────────────────────────────────────────
// Núcleo: processa 1 turno do chat (user msg → assistant msg)
// Usado pelo ChatBar (rodapé), /chat (página), e webhook do WhatsApp.
// ────────────────────────────────────────────────────────────
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

  const currentUser = await db.query.users.findFirst({
    where: eq(users.id, userId),
  });
  const summary = await buildContext(householdId, userId, currentUser?.name ?? null);

  const history: Content[] = allMessages.reverse().map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));

  const ai = getAI();

  let response;
  try {
    response = await ai.models.generateContent({
      model: MODEL,
      contents: history,
      config: {
        systemInstruction: SYSTEM_PROMPT + "\n\n## Contexto atual:\n\n" + summary,
        temperature: 0.4,
        maxOutputTokens: 800,
        tools,
        toolConfig: {
          functionCallingConfig: { mode: FunctionCallingConfigMode.AUTO },
        },
      },
    });
  } catch (err) {
    console.error("[chat-bar] generateContent error:", err);
    throw err;
  }

  const fnCalls: FunctionCall[] = response.functionCalls ?? [];
  let assistantText = response.text?.trim() ?? "";

  // Permite até 3 rodadas de tool calls (chamada → resultado → eventualmente
  // outra chamada com base no resultado)
  let roundsLeft = 3;
  let lastCalls = fnCalls;
  let lastHistory: Content[] = [
    ...history,
    ...(fnCalls.length > 0
      ? [{ role: "model", parts: fnCalls.map((c) => ({ functionCall: c })) } as Content]
      : []),
  ];

  while (lastCalls.length > 0 && roundsLeft-- > 0) {
    const toolResults = await Promise.all(
      lastCalls.map((call) => executeToolCall(call, householdId, userId))
    );
    const fnResponses = toolResults.map((r) => ({
      functionResponse: { name: r.name, response: { result: r.result } },
    }));
    lastHistory = [
      ...lastHistory,
      { role: "user", parts: fnResponses } as Content,
    ];

    try {
      response = await ai.models.generateContent({
        model: MODEL,
        contents: lastHistory,
        config: {
          systemInstruction: SYSTEM_PROMPT + "\n\n## Contexto atual:\n\n" + summary,
          temperature: 0.3,
          maxOutputTokens: 600,
          tools,
          toolConfig: { functionCallingConfig: { mode: FunctionCallingConfigMode.AUTO } },
        },
      });
    } catch (err) {
      console.error("[chat-bar] follow-up generateContent error:", err);
      assistantText = toolResults.map((r) => r.result).join("\n");
      break;
    }

    lastCalls = response.functionCalls ?? [];
    assistantText = response.text?.trim() ?? "";
    if (lastCalls.length > 0) {
      lastHistory = [
        ...lastHistory,
        { role: "model", parts: lastCalls.map((c) => ({ functionCall: c })) } as Content,
      ];
    }
  }

  if (!assistantText) assistantText = "(sem resposta — tente reformular)";

  const [assistantMsg] = await db
    .insert(messages)
    .values({
      threadId: thread.id,
      householdId,
      role: "assistant",
      content: assistantText,
    })
    .returning();

  await db.update(threads).set({ updatedAt: new Date() }).where(eq(threads.id, thread.id));

  revalidatePath("/chat");

  return { userMsg, assistantMsg };
}

// ────────────────────────────────────────────────────────────
// Action usada pelo ChatBar (useActionState)
// ────────────────────────────────────────────────────────────
export async function sendMessageReturn(
  prevState: ChatBarState,
  formData: FormData
): Promise<ChatBarState> {
  const content = (formData.get("content") as string)?.trim();
  if (!content) return prevState;

  try {
    const { householdId, userId } = await requireUserAndHousehold();
    const { userMsg, assistantMsg } = await processChatTurnWithTools(content, householdId, userId);
    return {
      messages: [
        ...prevState.messages,
        { role: "user", content: userMsg.content, id: userMsg.id },
        { role: "assistant", content: assistantMsg.content, id: assistantMsg.id },
      ],
    };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error("[chat-bar] sendMessageReturn error:", err);
    return {
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
}

