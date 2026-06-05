"use server";

import { and, eq, like } from "drizzle-orm";
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

// ────────────────────────────────────────────────────────────
// Mock seeder pra teste de densidade
// ────────────────────────────────────────────────────────────

const MOCK_MONTHLY: { name: string; dueDay: number; amount: string }[] = [
  { name: "Gás botijão (demo)", dueDay: 5, amount: "120.00" },
  { name: "Internet Claro (demo)", dueDay: 10, amount: "129.90" },
  { name: "Energia CELESC (demo)", dueDay: 15, amount: "320.00" },
  { name: "Água CASAN (demo)", dueDay: 20, amount: "95.00" },
  { name: "Telefone TIM (demo)", dueDay: 8, amount: "89.90" },
  { name: "Netflix (demo)", dueDay: 12, amount: "55.90" },
  { name: "Spotify Família (demo)", dueDay: 14, amount: "26.90" },
  { name: "Mensalidade escola (demo)", dueDay: 5, amount: "1850.00" },
  { name: "Plano de saúde (demo)", dueDay: 25, amount: "1240.00" },
  { name: "Academia (demo)", dueDay: 7, amount: "159.00" },
  { name: "Condomínio (demo)", dueDay: 10, amount: "750.00" },
  { name: "Diarista (demo)", dueDay: 28, amount: "400.00" },
  { name: "Estacionamento (demo)", dueDay: 1, amount: "180.00" },
  { name: "Seguro carro (demo)", dueDay: 18, amount: "385.00" },
  { name: "Streaming Disney+ (demo)", dueDay: 22, amount: "33.90" },
];

const MOCK_YEARLY: {
  name: string;
  dueMonth: number;
  dueDay: number;
  amount: string;
}[] = [
  { name: "IPVA Onix (demo)", dueMonth: 4, dueDay: 30, amount: "1850.00" },
  { name: "IPTU casa (demo)", dueMonth: 3, dueDay: 15, amount: "2400.00" },
  { name: "Licenciamento (demo)", dueMonth: 9, dueDay: 30, amount: "180.00" },
  { name: "Renovação CNH (demo)", dueMonth: 11, dueDay: 1, amount: "270.00" },
  { name: "Anuidade conselho (demo)", dueMonth: 2, dueDay: 28, amount: "850.00" },
];

export async function seedRecurringMocks() {
  const { userId, householdId } = await requireUser();
  let inserted = 0;
  for (const m of MOCK_MONTHLY) {
    const exists = await db.query.recurringPayments.findFirst({
      where: and(
        eq(recurringPayments.householdId, householdId),
        eq(recurringPayments.name, m.name)
      ),
    });
    if (exists) continue;
    await db.insert(recurringPayments).values({
      householdId,
      createdById: userId,
      name: m.name,
      frequency: "monthly",
      dueDay: m.dueDay,
      dueMonth: null,
      expectedAmount: m.amount,
    });
    inserted++;
  }
  for (const y of MOCK_YEARLY) {
    const exists = await db.query.recurringPayments.findFirst({
      where: and(
        eq(recurringPayments.householdId, householdId),
        eq(recurringPayments.name, y.name)
      ),
    });
    if (exists) continue;
    await db.insert(recurringPayments).values({
      householdId,
      createdById: userId,
      name: y.name,
      frequency: "yearly",
      dueDay: y.dueDay,
      dueMonth: y.dueMonth,
      expectedAmount: y.amount,
    });
    inserted++;
  }
  revalidatePath("/financeiro/recorrentes");
  return { inserted };
}

export async function clearRecurringMocks() {
  const { householdId } = await requireUser();
  const result = await db
    .delete(recurringPayments)
    .where(
      and(
        eq(recurringPayments.householdId, householdId),
        like(recurringPayments.name, "%(demo)")
      )
    )
    .returning({ id: recurringPayments.id });
  revalidatePath("/financeiro/recorrentes");
  return { removed: result.length };
}
