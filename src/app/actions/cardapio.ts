"use server";

import { GoogleGenAI, Type } from "@google/genai";
import { and, eq, gte, lte } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { cardapioEntries, receitas } from "@/db/schema";
import { requireUserAndHousehold } from "@/lib/auth-helpers";

// ────────────────────────────────────────────────────────────
// CRUD Receitas
// ────────────────────────────────────────────────────────────
export async function createReceita(formData: FormData) {
  const { householdId, userId } = await requireUserAndHousehold();
  const title = (formData.get("title") as string)?.trim();
  if (!title) throw new Error("Título obrigatório");

  const [r] = await db
    .insert(receitas)
    .values({
      householdId,
      createdById: userId,
      title,
      description: (formData.get("description") as string)?.trim() || null,
      sourceUrl: (formData.get("sourceUrl") as string)?.trim() || null,
      imageUrl: (formData.get("imageUrl") as string)?.trim() || null,
      prepTimeMin: formData.get("prepTimeMin") ? Number(formData.get("prepTimeMin")) : null,
      servings: formData.get("servings") ? Number(formData.get("servings")) : null,
      ingredients: (formData.get("ingredients") as string)?.trim() || null,
      steps: (formData.get("steps") as string)?.trim() || null,
      notes: (formData.get("notes") as string)?.trim() || null,
      tags: (formData.get("tags") as string)?.trim() || null,
    })
    .returning();

  revalidatePath("/cardapio/receitas");
  return r;
}

/** Patch parcial — aceita qualquer campo da receita. */
export async function patchReceita(formData: FormData) {
  const { householdId } = await requireUserAndHousehold();
  const id = formData.get("id") as string;
  if (!id) return;
  const existing = await db.query.receitas.findFirst({ where: eq(receitas.id, id) });
  if (!existing || existing.householdId !== householdId) return;

  const allowed = [
    "title",
    "description",
    "sourceUrl",
    "imageUrl",
    "ingredients",
    "steps",
    "notes",
    "tags",
  ];
  const patch: Record<string, unknown> = { updatedAt: new Date() };
  for (const key of allowed) {
    if (formData.has(key)) {
      const v = ((formData.get(key) as string) || "").trim();
      if (key === "title" && !v) continue;
      patch[key] = v || null;
    }
  }
  // Campos numéricos
  for (const key of ["prepTimeMin", "servings"]) {
    if (formData.has(key)) {
      const v = ((formData.get(key) as string) || "").trim();
      patch[key] = v ? Number(v) : null;
    }
  }

  if (Object.keys(patch).length <= 1) return; // só updatedAt
  await db.update(receitas).set(patch).where(eq(receitas.id, id));
  revalidatePath(`/cardapio/receitas/${id}`);
  revalidatePath("/cardapio/receitas");
}

export async function toggleReceitaFavorita(id: string) {
  const { householdId } = await requireUserAndHousehold();
  const existing = await db.query.receitas.findFirst({ where: eq(receitas.id, id) });
  if (!existing || existing.householdId !== householdId) return;
  await db
    .update(receitas)
    .set({ isFavorite: !existing.isFavorite, updatedAt: new Date() })
    .where(eq(receitas.id, id));
  revalidatePath("/cardapio/receitas");
  revalidatePath(`/cardapio/receitas/${id}`);
}

export async function deleteReceita(id: string) {
  const { householdId } = await requireUserAndHousehold();
  const existing = await db.query.receitas.findFirst({ where: eq(receitas.id, id) });
  if (!existing || existing.householdId !== householdId) throw new Error("Não encontrada");
  await db.delete(receitas).where(eq(receitas.id, id));
  revalidatePath("/cardapio/receitas");
  revalidatePath("/cardapio");
}

// ────────────────────────────────────────────────────────────
// CRUD Cardápio (entrada do almoço de um dia)
// ────────────────────────────────────────────────────────────

/**
 * Agenda/atualiza o almoço de uma data. Mantém 1 entry por dia
 * (upsert manual: se já existe, atualiza; senão cria).
 */
export async function agendarAlmoco(formData: FormData) {
  const { householdId, userId } = await requireUserAndHousehold();
  const mealDate = formData.get("mealDate") as string;
  if (!mealDate) throw new Error("Data obrigatória");

  const receitaId = ((formData.get("receitaId") as string) || "").trim() || null;
  const titleRaw = ((formData.get("title") as string) || "").trim();
  const notes = ((formData.get("notes") as string) || "").trim() || null;

  // Se passou receitaId, valida e pega título da receita
  let titleFinal = titleRaw || null;
  if (receitaId) {
    const r = await db.query.receitas.findFirst({ where: eq(receitas.id, receitaId) });
    if (!r || r.householdId !== householdId) throw new Error("Receita não encontrada");
    titleFinal = r.title;
  }

  if (!receitaId && !titleFinal) {
    // Vazio → remover entry desse dia (se existir)
    await db
      .delete(cardapioEntries)
      .where(
        and(
          eq(cardapioEntries.householdId, householdId),
          eq(cardapioEntries.mealDate, mealDate)
        )
      );
    revalidatePath("/cardapio");
    return;
  }

  const existing = await db.query.cardapioEntries.findFirst({
    where: and(
      eq(cardapioEntries.householdId, householdId),
      eq(cardapioEntries.mealDate, mealDate)
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
      mealDate,
      receitaId,
      title: titleFinal,
      notes,
    });
  }

  revalidatePath("/cardapio");
}

export async function limparAlmoco(mealDate: string) {
  const { householdId } = await requireUserAndHousehold();
  await db
    .delete(cardapioEntries)
    .where(
      and(
        eq(cardapioEntries.householdId, householdId),
        eq(cardapioEntries.mealDate, mealDate)
      )
    );
  revalidatePath("/cardapio");
}

export async function listarCardapioRange(fromDate: string, toDate: string) {
  const { householdId } = await requireUserAndHousehold();
  return db.query.cardapioEntries.findMany({
    where: and(
      eq(cardapioEntries.householdId, householdId),
      gte(cardapioEntries.mealDate, fromDate),
      lte(cardapioEntries.mealDate, toDate)
    ),
    with: { receita: true },
  });
}

// ────────────────────────────────────────────────────────────
// Extração de receita a partir de URL (IA)
// ────────────────────────────────────────────────────────────

type ExtractedReceita = {
  title: string;
  description: string | null;
  ingredients: string | null;
  steps: string | null;
  prepTimeMin: number | null;
  servings: number | null;
  imageUrl: string | null;
  tags: string | null;
};

/**
 * Faz fetch do URL, extrai conteúdo legível (HTML simplificado) e pede pro
 * Gemini estruturar como receita.
 *
 * Limitação: páginas que rendem só via JS (Instagram, alguns vídeos) podem
 * vir vazias. Pra esses casos a IA tenta inferir do og:description / og:title.
 */
export async function extrairReceitaDeUrl(url: string): Promise<ExtractedReceita> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY não configurada");

  // 1. Fetch da página com timeout
  let html = "";
  try {
    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), 15_000);
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; FamiliaAP/1.0; +https://familia-ap.vercel.app)",
        Accept: "text/html,application/xhtml+xml",
      },
      signal: ctrl.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) throw new Error(`fetch ${res.status}`);
    html = await res.text();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Não consegui baixar o conteúdo do link: ${msg}`);
  }

  // 2. Reduz HTML — só metas, título e texto visível
  const cleaned = simplifyHtml(html);

  // 3. Chama Gemini com schema estruturado
  const ai = new GoogleGenAI({ apiKey: key });
  const response = await ai.models.generateContent({
    model: "gemini-flash-latest",
    contents: [
      {
        role: "user",
        parts: [
          {
            text: `Extraia a receita da página abaixo. Se for vídeo (YouTube/Instagram/Reels), use a descrição/transcrição que vier no HTML — inclusive metatags og:description, og:title. Se não houver receita estruturada (só uma foto sem instruções), faça o melhor esforço a partir do que tiver. Português brasileiro.\n\nURL: ${url}\n\nHTML (simplificado):\n${cleaned.slice(0, 25_000)}`,
          },
        ],
      },
    ],
    config: {
      temperature: 0.2,
      maxOutputTokens: 1500,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING, description: "Nome da receita, curto" },
          description: {
            type: Type.STRING,
            description: "Resumo de 1 linha (opcional, pode ser vazio)",
          },
          ingredients: {
            type: Type.STRING,
            description:
              "Ingredientes, 1 por linha. Ex: '- 200g de arroz\\n- 2 colheres de óleo'",
          },
          steps: {
            type: Type.STRING,
            description:
              "Passo-a-passo numerado, 1 passo por linha. Ex: '1. Aqueça o óleo\\n2. ...'",
          },
          prepTimeMin: {
            type: Type.NUMBER,
            description: "Tempo total de preparo em minutos, ou 0 se não souber",
          },
          servings: {
            type: Type.NUMBER,
            description: "Quantas porções, ou 0 se não souber",
          },
          imageUrl: {
            type: Type.STRING,
            description: "URL da imagem (og:image se houver), ou string vazia",
          },
          tags: {
            type: Type.STRING,
            description: "Tags CSV pra busca, ex: 'rápido,vegetariano,frango'",
          },
        },
        required: ["title", "ingredients", "steps"],
      },
    },
  });

  const text = response.text?.trim() ?? "";
  if (!text) throw new Error("IA não retornou conteúdo");

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("IA retornou JSON inválido");
  }

  const num = (v: unknown) => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : null;
  };
  const str = (v: unknown) => {
    const s = typeof v === "string" ? v.trim() : "";
    return s || null;
  };

  return {
    title: str(parsed.title) ?? "Receita sem título",
    description: str(parsed.description),
    ingredients: str(parsed.ingredients),
    steps: str(parsed.steps),
    prepTimeMin: num(parsed.prepTimeMin),
    servings: num(parsed.servings),
    imageUrl: str(parsed.imageUrl),
    tags: str(parsed.tags),
  };
}

/**
 * Server action: pega URL do form, extrai via IA, cria receita,
 * retorna o ID. Usada pela página de receitas e pelo chat.
 */
export async function importarReceitaDeUrl(formData: FormData) {
  const { householdId, userId } = await requireUserAndHousehold();
  const url = ((formData.get("url") as string) || "").trim();
  if (!url) throw new Error("URL obrigatória");

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
  return r;
}

// ────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────

/** Simplifica HTML — remove script/style/svg, mantém textos e metatags relevantes. */
function simplifyHtml(html: string): string {
  let s = html;
  // Extrai meta tags importantes primeiro
  const metas: string[] = [];
  const metaRegex =
    /<meta[^>]+(?:property|name)=["'](og:title|og:description|og:image|description|title|twitter:title|twitter:description)["'][^>]*content=["']([^"']*)["'][^>]*>/gi;
  let m;
  while ((m = metaRegex.exec(s)) !== null) {
    metas.push(`${m[1]}: ${m[2]}`);
  }
  // Captura <title>
  const titleMatch = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(s);
  if (titleMatch) metas.unshift(`title: ${titleMatch[1].trim()}`);

  // Limpa o resto
  s = s
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<svg[\s\S]*?<\/svg>/gi, "")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();

  return [metas.join("\n"), "---", s].filter(Boolean).join("\n");
}
