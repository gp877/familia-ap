"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { db } from "@/db";
import {
  recurringPaymentRecords,
  recurringPayments,
  users,
} from "@/db/schema";

async function requireUser() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Não autenticado");
  const dbUser = await db.query.users.findFirst({
    where: eq(users.id, session.user.id),
  });
  if (!dbUser?.householdId) throw new Error("Sem household");
  return { userId: dbUser.id, householdId: dbUser.householdId };
}

export type RecurringFreq = "monthly" | "yearly";

// ────────────────────────────────────────────────────────────
// CRUD do recorrente
// ────────────────────────────────────────────────────────────

export async function createRecurringPayment(input: {
  name: string;
  frequency: RecurringFreq;
  dueDay: number;
  dueMonth?: number | null; // só yearly
  expectedAmount?: string | null;
  bankAccountId?: string | null;
  categoryId?: string | null;
  notes?: string | null;
}) {
  const { userId, householdId } = await requireUser();
  if (!input.name.trim()) throw new Error("Nome obrigatório");
  if (input.dueDay < 1 || input.dueDay > 31) throw new Error("Dia inválido");
  if (input.frequency === "yearly") {
    if (!input.dueMonth || input.dueMonth < 1 || input.dueMonth > 12) {
      throw new Error("Mês obrigatório pra anual");
    }
  }
  await db.insert(recurringPayments).values({
    householdId,
    createdById: userId,
    name: input.name.trim(),
    frequency: input.frequency,
    dueDay: input.dueDay,
    dueMonth: input.frequency === "yearly" ? input.dueMonth ?? null : null,
    expectedAmount: input.expectedAmount?.trim() || null,
    bankAccountId: input.bankAccountId || null,
    categoryId: input.categoryId || null,
    notes: input.notes?.trim() || null,
  });
  revalidatePath("/financeiro/recorrentes");
}

export async function updateRecurringPayment(
  id: string,
  patch: Partial<{
    name: string;
    dueDay: number;
    dueMonth: number | null;
    expectedAmount: string | null;
    bankAccountId: string | null;
    categoryId: string | null;
    notes: string | null;
    isActive: boolean;
  }>
) {
  const { householdId } = await requireUser();
  const cur = await db.query.recurringPayments.findFirst({
    where: eq(recurringPayments.id, id),
  });
  if (!cur || cur.householdId !== householdId) throw new Error("Não encontrado");

  await db
    .update(recurringPayments)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(recurringPayments.id, id));
  revalidatePath("/financeiro/recorrentes");
}

export async function deleteRecurringPayment(id: string) {
  const { householdId } = await requireUser();
  await db
    .delete(recurringPayments)
    .where(
      and(
        eq(recurringPayments.id, id),
        eq(recurringPayments.householdId, householdId)
      )
    );
  revalidatePath("/financeiro/recorrentes");
}

// ────────────────────────────────────────────────────────────
// Marca como pago
// ────────────────────────────────────────────────────────────

/**
 * Marca um pagamento recorrente como pago para o período especificado.
 * Period: YYYY-MM (mensal) ou YYYY (anual). Idempotente — se já existe,
 * só atualiza paidAmount/paidOn/notes.
 */
export async function markRecurringPaid(input: {
  paymentId: string;
  period: string;
  paidOn?: string | null; // YYYY-MM-DD
  paidAmount?: string | null;
  notes?: string | null;
}) {
  const { userId, householdId } = await requireUser();
  const cur = await db.query.recurringPayments.findFirst({
    where: eq(recurringPayments.id, input.paymentId),
  });
  if (!cur || cur.householdId !== householdId) throw new Error("Não encontrado");

  const paidOn = input.paidOn?.trim() || null; // YYYY-MM-DD string
  await db
    .insert(recurringPaymentRecords)
    .values({
      paymentId: input.paymentId,
      householdId,
      markedById: userId,
      period: input.period,
      paidOn,
      paidAmount: input.paidAmount?.trim() || null,
      notes: input.notes?.trim() || null,
    })
    .onConflictDoUpdate({
      target: [recurringPaymentRecords.paymentId, recurringPaymentRecords.period],
      set: {
        paidOn,
        paidAmount: input.paidAmount?.trim() || null,
        notes: input.notes?.trim() || null,
        markedById: userId,
      },
    });
  revalidatePath("/financeiro/recorrentes");
}

/**
 * Desfaz a marcação de pago.
 */
export async function unmarkRecurringPaid(paymentId: string, period: string) {
  const { householdId } = await requireUser();
  await db
    .delete(recurringPaymentRecords)
    .where(
      and(
        eq(recurringPaymentRecords.paymentId, paymentId),
        eq(recurringPaymentRecords.period, period),
        eq(recurringPaymentRecords.householdId, householdId)
      )
    );
  revalidatePath("/financeiro/recorrentes");
}
