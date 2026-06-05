"use server";

import { and, eq, isNull, like, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { db } from "@/db";
import {
  bankAccounts,
  recurringPaymentRecords,
  recurringPayments,
  transactions,
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
  pixKey?: string | null;
  barcodeNumber?: string | null;
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
    pixKey: input.pixKey?.trim() || null,
    barcodeNumber: input.barcodeNumber?.trim() || null,
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
    pixKey: string | null;
    barcodeNumber: string | null;
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
 * só atualiza paidAmount/paidOn/notes/transactionId.
 */
export async function markRecurringPaid(input: {
  paymentId: string;
  period: string;
  paidOn?: string | null; // YYYY-MM-DD
  paidAmount?: string | null;
  notes?: string | null;
  transactionId?: string | null;
}) {
  const { userId, householdId } = await requireUser();
  const cur = await db.query.recurringPayments.findFirst({
    where: eq(recurringPayments.id, input.paymentId),
  });
  if (!cur || cur.householdId !== householdId) throw new Error("Não encontrado");

  // Se vincular transação, valida que pertence ao household.
  let transactionId: string | null = input.transactionId?.trim() || null;
  if (transactionId) {
    const tx = await db.query.transactions.findFirst({
      where: eq(transactions.id, transactionId),
    });
    if (!tx || tx.householdId !== householdId) {
      throw new Error("Transação inválida");
    }
  }

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
      transactionId,
    })
    .onConflictDoUpdate({
      target: [recurringPaymentRecords.paymentId, recurringPaymentRecords.period],
      set: {
        paidOn,
        paidAmount: input.paidAmount?.trim() || null,
        notes: input.notes?.trim() || null,
        transactionId,
        markedById: userId,
      },
    });
  revalidatePath("/financeiro/recorrentes");
}

/**
 * Lista transações candidatas pra vincular a um pagamento recorrente:
 * - mesmo household, débito
 * - data dentro de ±20 dias do vencimento do período
 * - ainda não vinculada a NENHUM outro recurring_payment_record
 *
 * Retorna até 20 ordenadas por proximidade (valor mais próximo + data
 * mais próxima do vencimento).
 */
export async function findCandidateTransactions(input: {
  paymentId: string;
  period: string; // YYYY-MM ou YYYY
}): Promise<
  {
    id: string;
    occurredOn: string;
    amount: string;
    description: string;
    rawDescription: string | null;
    bankAccountName: string | null;
  }[]
> {
  const { householdId } = await requireUser();
  const cur = await db.query.recurringPayments.findFirst({
    where: eq(recurringPayments.id, input.paymentId),
  });
  if (!cur || cur.householdId !== householdId) throw new Error("Não encontrado");

  // Calcula data de vencimento do período
  const period = input.period.trim();
  let dueDate: Date;
  if (cur.frequency === "monthly") {
    const [y, m] = period.split("-").map(Number);
    if (!y || !m) throw new Error("Período inválido");
    // Clampa pra não passar do último dia do mês
    const lastDay = new Date(y, m, 0).getDate();
    dueDate = new Date(y, m - 1, Math.min(cur.dueDay, lastDay));
  } else {
    const y = parseInt(period, 10);
    if (!y) throw new Error("Período inválido");
    const mm = cur.dueMonth ?? 1;
    const lastDay = new Date(y, mm, 0).getDate();
    dueDate = new Date(y, mm - 1, Math.min(cur.dueDay, lastDay));
  }

  const minDate = new Date(dueDate);
  minDate.setDate(minDate.getDate() - 20);
  const maxDate = new Date(dueDate);
  maxDate.setDate(maxDate.getDate() + 20);
  const minStr = minDate.toISOString().slice(0, 10);
  const maxStr = maxDate.toISOString().slice(0, 10);

  // IDs já vinculadas — excluir
  const linked = await db
    .select({ transactionId: recurringPaymentRecords.transactionId })
    .from(recurringPaymentRecords)
    .where(
      and(
        eq(recurringPaymentRecords.householdId, householdId),
        sql`${recurringPaymentRecords.transactionId} IS NOT NULL`
      )
    );
  const linkedIds = linked.map((l) => l.transactionId).filter(Boolean) as string[];

  const conditions = [
    eq(transactions.householdId, householdId),
    eq(transactions.kind, "debit"),
    sql`${transactions.occurredOn} >= ${minStr}::date`,
    sql`${transactions.occurredOn} <= ${maxStr}::date`,
    isNull(recurringPaymentRecords.id),
  ];
  if (linkedIds.length > 0) {
    conditions.push(sql`${transactions.id} NOT IN (${sql.join(linkedIds.map((id) => sql`${id}`), sql`, `)})`);
  }

  // Busca + join com bank_account pra ter nome da conta
  const rows = await db
    .select({
      id: transactions.id,
      occurredOn: transactions.occurredOn,
      amount: transactions.amount,
      description: transactions.description,
      rawDescription: transactions.rawDescription,
      bankAccountName: bankAccounts.name,
    })
    .from(transactions)
    .leftJoin(bankAccounts, eq(transactions.bankAccountId, bankAccounts.id))
    .leftJoin(
      recurringPaymentRecords,
      eq(recurringPaymentRecords.transactionId, transactions.id)
    )
    .where(and(...conditions))
    .limit(40);

  // Score por proximidade (valor + data). Drizzle retorna `date` como
  // string ou Date dependendo do mode — normaliza pra YYYY-MM-DD aqui.
  const expected = cur.expectedAmount ? parseFloat(cur.expectedAmount) : null;
  const dueTs = dueDate.getTime();
  const scored = rows.map((r) => {
    const dateStr =
      typeof r.occurredOn === "string"
        ? r.occurredOn
        : new Date(r.occurredOn).toISOString().slice(0, 10);
    const amt = parseFloat(r.amount);
    const valueScore = expected ? Math.abs(amt - expected) / expected : 0;
    const dateScore = Math.abs(new Date(dateStr + "T00:00:00").getTime() - dueTs) / 86_400_000;
    return { ...r, occurredOn: dateStr, score: valueScore * 10 + dateScore };
  });
  scored.sort((a, b) => a.score - b.score);

  return scored.slice(0, 20).map((r) => ({
    id: r.id,
    occurredOn: r.occurredOn,
    amount: r.amount,
    description: r.description,
    rawDescription: r.rawDescription,
    bankAccountName: r.bankAccountName,
  }));
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
