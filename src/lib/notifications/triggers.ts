import { and, desc, eq, gte, lt, sql } from "drizzle-orm";

import { db } from "@/db";
import { bankAccounts, transactions, uploads } from "@/db/schema";

/**
 * Avaliadores de gatilho — cada função decide se uma regra DEVE disparar
 * agora. Retorna `null` se não deve, ou um objeto com os dados pro
 * template do email se deve.
 *
 * Cada avaliador é PURO em relação ao DB (só lê) — quem decide enviar
 * é o cron handler.
 */

// ────────────────────────────────────────────────────────────
// 1. Extrato do mês não foi enviado
// ────────────────────────────────────────────────────────────

export type MissingStatementTrigger = {
  type: "missing_statement";
  accountName: string;
  monthLabel: string;
  daysIntoMonth: number;
};

/**
 * Considera "faltando" se:
 * - Hoje >= dia 5 do mês
 * - E não há upload `bank_statement` `completed` ou `needs_review` cujo
 *   referenceMonth seja o mês corrente E vinculado a uma conta `checking`/
 *   `savings` do household.
 */
export async function evaluateMissingStatement(
  householdId: string,
  now: Date = new Date()
): Promise<MissingStatementTrigger[]> {
  const day = now.getDate();
  if (day < 5) return []; // muito cedo no mês — não cobra ainda

  const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const accounts = await db.query.bankAccounts.findMany({
    where: and(
      eq(bankAccounts.householdId, householdId),
      sql`${bankAccounts.type} IN ('checking', 'savings')`
    ),
  });

  if (accounts.length === 0) return [];

  // Pra cada conta, vê se tem upload de extrato do mês atual
  const triggers: MissingStatementTrigger[] = [];
  for (const acc of accounts) {
    const uploaded = await db.query.uploads.findFirst({
      where: and(
        eq(uploads.householdId, householdId),
        eq(uploads.bankAccountId, acc.id),
        eq(uploads.sourceType, "bank_statement"),
        gte(uploads.createdAt, currentMonthStart),
        sql`${uploads.status} IN ('completed', 'needs_review')`
      ),
    });
    if (!uploaded) {
      triggers.push({
        type: "missing_statement",
        accountName: acc.name,
        monthLabel: monthLabel(now),
        daysIntoMonth: day,
      });
    }
  }
  return triggers;
}

// ────────────────────────────────────────────────────────────
// 2. Fatura do cartão não foi enviada
// ────────────────────────────────────────────────────────────

export type MissingInvoiceTrigger = {
  type: "missing_invoice";
  cardName: string;
  monthLabel: string;
  daysIntoMonth: number;
};

export async function evaluateMissingInvoice(
  householdId: string,
  now: Date = new Date()
): Promise<MissingInvoiceTrigger[]> {
  const day = now.getDate();
  if (day < 10) return []; // fatura geralmente fecha entre 5-10 do mês

  const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const cards = await db.query.bankAccounts.findMany({
    where: and(
      eq(bankAccounts.householdId, householdId),
      eq(bankAccounts.type, "credit_card")
    ),
  });

  if (cards.length === 0) return [];

  const triggers: MissingInvoiceTrigger[] = [];
  for (const card of cards) {
    const uploaded = await db.query.uploads.findFirst({
      where: and(
        eq(uploads.householdId, householdId),
        eq(uploads.bankAccountId, card.id),
        eq(uploads.sourceType, "credit_card_invoice"),
        gte(uploads.createdAt, currentMonthStart),
        sql`${uploads.status} IN ('completed', 'needs_review')`
      ),
    });
    if (!uploaded) {
      triggers.push({
        type: "missing_invoice",
        cardName: card.name,
        monthLabel: monthLabel(now),
        daysIntoMonth: day,
      });
    }
  }
  return triggers;
}

// ────────────────────────────────────────────────────────────
// 3. Lançamentos pendentes de classificação
// ────────────────────────────────────────────────────────────

export type PendingClassificationsTrigger = {
  type: "pending_classifications";
  pendingCount: number;
  oldestDays: number;
};

/**
 * Dispara se há >= 10 transações com `status = 'pending'` há >= 5 dias.
 * Limites configuráveis via `config` da regra (opcional).
 */
export async function evaluatePendingClassifications(
  householdId: string,
  config: { minCount?: number; minDaysOld?: number } = {},
  now: Date = new Date()
): Promise<PendingClassificationsTrigger | null> {
  const minCount = config.minCount ?? 10;
  const minDaysOld = config.minDaysOld ?? 5;

  const cutoff = new Date(now.getTime() - minDaysOld * 24 * 60 * 60 * 1000);

  const result = await db
    .select({
      count: sql<number>`count(*)::int`,
      oldest: sql<string>`min(${transactions.createdAt})::text`,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.householdId, householdId),
        eq(transactions.status, "pending"),
        lt(transactions.createdAt, cutoff),
        eq(transactions.isInternalTransfer, false)
      )
    )
    .then((r) => r[0]);

  if (!result || result.count < minCount) return null;

  const oldestDate = new Date(result.oldest);
  const oldestDays = Math.floor(
    (now.getTime() - oldestDate.getTime()) / (24 * 60 * 60 * 1000)
  );

  return {
    type: "pending_classifications",
    pendingCount: result.count,
    oldestDays,
  };
}

// ────────────────────────────────────────────────────────────
// 4. Resumo semanal
// ────────────────────────────────────────────────────────────

export type WeeklyDigestTrigger = {
  type: "weekly_digest";
  weekRange: string;
  txCount: number;
  totalDebit: string; // formatado pt-BR
  totalCredit: string;
  topCategories: { name: string; amount: string }[];
  pendingCount: number;
};

export async function evaluateWeeklyDigest(
  householdId: string,
  now: Date = new Date()
): Promise<WeeklyDigestTrigger | null> {
  // Semana = últimos 7 dias até agora (inclusive)
  const end = now;
  const start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  // Stats agregados — exclui internas
  const stats = await db
    .select({
      count: sql<number>`count(*)::int`,
      debit: sql<string>`coalesce(sum(case when ${transactions.kind} = 'debit' then ${transactions.amount}::numeric else 0 end), 0)::text`,
      credit: sql<string>`coalesce(sum(case when ${transactions.kind} = 'credit' then ${transactions.amount}::numeric else 0 end), 0)::text`,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.householdId, householdId),
        eq(transactions.isInternalTransfer, false),
        sql`${transactions.status} != 'ignored'`,
        gte(transactions.occurredOn, start),
        lt(transactions.occurredOn, end)
      )
    )
    .then((r) => r[0]);

  if (!stats || stats.count === 0) return null;

  // Top 3 categorias por gasto
  const top = await db
    .select({
      categoryName: sql<string>`coalesce(c.name, '(sem categoria)')`,
      total: sql<string>`sum(${transactions.amount}::numeric)::text`,
    })
    .from(transactions)
    .leftJoin(
      sql`category c`,
      sql`c.id = ${transactions.categoryId}`
    )
    .where(
      and(
        eq(transactions.householdId, householdId),
        eq(transactions.kind, "debit"),
        eq(transactions.isInternalTransfer, false),
        sql`${transactions.status} != 'ignored'`,
        gte(transactions.occurredOn, start),
        lt(transactions.occurredOn, end)
      )
    )
    .groupBy(sql`c.name`)
    .orderBy(sql`sum(${transactions.amount}::numeric) DESC`)
    .limit(3);

  const pending = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(transactions)
    .where(
      and(
        eq(transactions.householdId, householdId),
        eq(transactions.status, "pending"),
        eq(transactions.isInternalTransfer, false)
      )
    )
    .then((r) => r[0]?.count ?? 0);

  return {
    type: "weekly_digest",
    weekRange: weekRangeLabel(start, end),
    txCount: stats.count,
    totalDebit: formatBRL(parseFloat(stats.debit)),
    totalCredit: formatBRL(parseFloat(stats.credit)),
    topCategories: top.map((c) => ({
      name: c.categoryName,
      amount: formatBRL(parseFloat(c.total)),
    })),
    pendingCount: pending,
  };
}

// ────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────

function monthLabel(d: Date): string {
  return d.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
}

function weekRangeLabel(start: Date, end: Date): string {
  const fmt = (x: Date) =>
    x.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
  return `${fmt(start)} – ${fmt(end)}`;
}

function formatBRL(n: number): string {
  return n.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
