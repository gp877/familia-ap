"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { db } from "@/db";
import { travelDrafts, users } from "@/db/schema";

async function requireUser() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Não autenticado");
  const dbUser = await db.query.users.findFirst({
    where: eq(users.id, session.user.id),
  });
  if (!dbUser?.householdId) throw new Error("Sem household");
  return { userId: dbUser.id, householdId: dbUser.householdId };
}

/**
 * Cria ou atualiza o rascunho de viagem do mês. Vazio (title em branco)
 * → remove o registro.
 */
export async function upsertTravelDraft(input: {
  year: number;
  month: number;
  title: string;
  notes?: string | null;
}) {
  const { userId, householdId } = await requireUser();
  if (input.month < 1 || input.month > 12) throw new Error("Mês inválido");
  if (input.year < 2000 || input.year > 2100) throw new Error("Ano inválido");

  const title = input.title.trim();
  if (!title) {
    // sem título → apaga
    await db
      .delete(travelDrafts)
      .where(
        and(
          eq(travelDrafts.householdId, householdId),
          eq(travelDrafts.year, input.year),
          eq(travelDrafts.month, input.month)
        )
      );
    revalidatePath("/viagens");
    return { removed: true };
  }

  const notes = input.notes?.trim() || null;
  await db
    .insert(travelDrafts)
    .values({
      householdId,
      createdById: userId,
      year: input.year,
      month: input.month,
      title,
      notes,
    })
    .onConflictDoUpdate({
      target: [travelDrafts.householdId, travelDrafts.year, travelDrafts.month],
      set: { title, notes, updatedAt: new Date() },
    });
  revalidatePath("/viagens");
  return { removed: false };
}

export async function deleteTravelDraft(input: { year: number; month: number }) {
  const { householdId } = await requireUser();
  await db
    .delete(travelDrafts)
    .where(
      and(
        eq(travelDrafts.householdId, householdId),
        eq(travelDrafts.year, input.year),
        eq(travelDrafts.month, input.month)
      )
    );
  revalidatePath("/viagens");
}
