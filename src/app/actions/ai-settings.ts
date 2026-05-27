"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { aiSettings } from "@/db/schema";
import { requireUserAndHousehold } from "@/lib/auth-helpers";

export type AiSettings = typeof aiSettings.$inferSelect;

const DEFAULTS = {
  alma: null as string | null,
  tone: "intimo" as string,
  responseLength: "curto" as string,
  allowEmoji: false as boolean,
  autoSaveMemories: true as boolean,
  callsUserByName: true as boolean,
  modelOverride: null as string | null,
  customInstructions: null as string | null,
};

/**
 * Devolve o registro de aiSettings do household — cria com defaults
 * se ainda não existe.
 */
export async function getOrCreateAiSettings(householdId: string): Promise<AiSettings> {
  const existing = await db.query.aiSettings.findFirst({
    where: eq(aiSettings.householdId, householdId),
  });
  if (existing) return existing;
  const [created] = await db
    .insert(aiSettings)
    .values({ householdId, ...DEFAULTS })
    .returning();
  return created;
}

/** Patch parcial (mesmo padrão das outras actions). */
export async function patchAiSettings(formData: FormData) {
  const { householdId } = await requireUserAndHousehold();
  // Garante que existe
  await getOrCreateAiSettings(householdId);

  const patch: Record<string, string | boolean | null> = { updatedAt: new Date() as unknown as string };

  // Strings
  for (const key of ["alma", "tone", "responseLength", "modelOverride", "customInstructions"]) {
    if (formData.has(key)) {
      const v = ((formData.get(key) as string) || "").trim();
      patch[key] = v || null;
    }
  }
  // Booleans (checkbox vem como "on" se marcado, ausente se não)
  for (const key of ["allowEmoji", "autoSaveMemories", "callsUserByName"]) {
    if (formData.has(`_present_${key}`)) {
      // _present_ é um hidden indicando "esse campo está sendo enviado"
      patch[key] = formData.get(key) === "on" || formData.get(key) === "true";
    }
  }

  // Validações leves
  if (patch.tone && !["intimo", "formal", "divertido"].includes(patch.tone as string)) {
    delete patch.tone;
  }
  if (
    patch.responseLength &&
    !["curto", "medio", "detalhado"].includes(patch.responseLength as string)
  ) {
    delete patch.responseLength;
  }

  await db.update(aiSettings).set(patch).where(eq(aiSettings.householdId, householdId));
  revalidatePath("/configuracoes/ia");
}

/** Reset pra defaults (todos os campos voltam ao padrão). */
export async function resetAiSettings() {
  const { householdId } = await requireUserAndHousehold();
  const existing = await db.query.aiSettings.findFirst({
    where: eq(aiSettings.householdId, householdId),
  });
  if (existing) {
    await db
      .update(aiSettings)
      .set({ ...DEFAULTS, updatedAt: new Date() })
      .where(eq(aiSettings.id, existing.id));
  } else {
    await db.insert(aiSettings).values({ householdId, ...DEFAULTS });
  }
  revalidatePath("/configuracoes/ia");
}

/** Gera a parte do system prompt derivada das preferências do household. */
export function aiSettingsToSystemPrompt(s: AiSettings): string {
  const parts: string[] = [];

  const tone =
    s.tone === "formal"
      ? "Tom: formal, profissional, respeitoso. Cortesia explícita."
      : s.tone === "divertido"
        ? "Tom: leve e divertido, brincadeiras sutis quando couber, mas sempre informativo."
        : "Tom: conversacional, íntimo, português brasileiro. Primeira pessoa do plural quando relevante (\"vocês\", \"a gente\").";
  parts.push(tone);

  const length =
    s.responseLength === "detalhado"
      ? "Resposta: detalhada quando o assunto pede. Pode usar listas e estruturação. Mas nunca enrole."
      : s.responseLength === "medio"
        ? "Resposta: 2-4 frases tipicamente. Pode estruturar quando ajudar."
        : "Resposta: curta e direta. 1-2 frases na maioria dos casos.";
  parts.push(length);

  parts.push(s.allowEmoji ? "Pode usar emoji com moderação." : "NUNCA use emoji.");
  parts.push(
    s.callsUserByName
      ? "Chame os usuários pelo primeiro nome quando souber quem está falando."
      : "Não use nomes pessoais nas respostas."
  );
  parts.push(
    s.autoSaveMemories
      ? "Use salvar_memoria proativamente quando aprender algo importante e durável."
      : "Só salve memória se o usuário pedir explicitamente."
  );

  if (s.alma) {
    parts.push(`\nAlma da AP (personalidade definida pela família):\n${s.alma}`);
  }
  if (s.customInstructions) {
    parts.push(`\nInstruções adicionais:\n${s.customInstructions}`);
  }

  return parts.join("\n");
}
