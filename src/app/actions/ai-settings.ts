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

