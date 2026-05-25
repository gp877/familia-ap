"use server";

// Módulo aposentado: "Finais de Semana" agora faz parte de Compromissos.
// As actions abaixo viraram thin wrappers que delegam pra compromissos.

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { compromissos } from "@/db/schema";
import { requireUserAndHousehold } from "@/lib/auth-helpers";

/**
 * Cria ou substitui o compromisso "principal" do dia (1 por data).
 * Mantido pra compatibilidade com mock data e chat tool.
 */
export async function createFimDeSemana(formData: FormData) {
  const { householdId, userId } = await requireUserAndHousehold();
  const weekendDate = formData.get("weekendDate") as string;
  const title = (formData.get("title") as string)?.trim();
  if (!weekendDate || !title) throw new Error("Data e título obrigatórios");

  const notes = ((formData.get("notes") as string) || "").trim() || null;

  const existing = await db.query.compromissos.findFirst({
    where: and(
      eq(compromissos.householdId, householdId),
      eq(compromissos.occurredOn, weekendDate),
      eq(compromissos.title, title)
    ),
  });

  if (existing) {
    await db
      .update(compromissos)
      .set({ notes })
      .where(eq(compromissos.id, existing.id));
  } else {
    await db.insert(compromissos).values({
      householdId,
      createdById: userId,
      occurredOn: weekendDate,
      title,
      notes,
    });
  }
  revalidatePath("/compromissos");
}

export async function updateFimDeSemanaNotes(formData: FormData) {
  // No-op: agora notes ficam editáveis direto no compromisso via patchCompromisso.
  return;
}

export async function deleteFimDeSemana(id: string) {
  const { householdId } = await requireUserAndHousehold();
  const existing = await db.query.compromissos.findFirst({
    where: eq(compromissos.id, id),
  });
  if (!existing || existing.householdId !== householdId) return;
  await db.delete(compromissos).where(eq(compromissos.id, id));
  revalidatePath("/compromissos");
}
