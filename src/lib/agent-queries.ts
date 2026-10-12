/**
 * Consultas compartilhadas pelas rotas /api/agent/*.
 *
 * Regra dos totais = a mesma do Dashboard/DRE: só lançamentos "reais"
 * (sem transferência interna e sem status `ignored`). Assim o pagamento da
 * fatura no extrato não conta duas vezes — as compras dentro da fatura já
 * são as despesas.
 */
import { and, eq, isNotNull, ne, sql } from "drizzle-orm";

import { db } from "@/db";
import { bankAccounts, invoices, transactions, uploads } from "@/db/schema";

import { ACCOUNT_TYPE_LABEL, isoDate, num } from "./agent-api";

/** Filtro dos lançamentos que entram em receita/despesa. */
export function realTxWhere(householdId: string, de: string, ate: string) {
  return and(
    eq(transactions.householdId, householdId),
    sql`${transactions.occurredOn} >= ${de}::date`,
    sql`${transactions.occurredOn} < (${ate}::date + 1)`,
    eq(transactions.isInternalTransfer, false),
    ne(transactions.status, "ignored")
  );
}

/**
 * Contas e cartões com saldo. O app não guarda saldo corrente: o saldo
 * vem do "saldo final" escrito no PDF do extrato mais recente de cada conta.
 * Cartões trazem as faturas ainda não pagas.
 */
export async function getAccountsWithBalances(householdId: string) {
  const [accs, statements, unpaidInvoices] = await Promise.all([
    db.query.bankAccounts.findMany({
      where: eq(bankAccounts.householdId, householdId),
      orderBy: (a, { asc }) => [asc(a.name)],
    }),
    db
      .select({
        bankAccountId: uploads.bankAccountId,
        closing: uploads.closingBalance,
        // Data do último lançamento do extrato = "saldo em"
        refDate: sql<string | null>`(select max(t.occurred_on)::date::text from transaction t where t.upload_id = ${uploads.id})`,
        createdAt: uploads.createdAt,
      })
      .from(uploads)
      .where(
        and(
          eq(uploads.householdId, householdId),
          eq(uploads.sourceType, "bank_statement"),
          isNotNull(uploads.closingBalance),
          isNotNull(uploads.bankAccountId)
        )
      ),
    db.query.invoices.findMany({
      where: and(eq(invoices.householdId, householdId), ne(invoices.status, "paid")),
      orderBy: (i, { asc }) => [asc(i.referenceMonth)],
    }),
  ]);

  const latestByAccount = new Map<string, { valor: number | null; data: string | null; key: string }>();
  for (const s of statements) {
    const key = s.refDate ?? isoDate(s.createdAt) ?? "";
    const cur = latestByAccount.get(s.bankAccountId!);
    if (!cur || key > cur.key) {
      latestByAccount.set(s.bankAccountId!, { valor: num(s.closing), data: s.refDate, key });
    }
  }

  const nameById = new Map(accs.map((a) => [a.id, a.name]));

  const contas = accs.map((a) => {
    const saldo = latestByAccount.get(a.id);
    const isCard = a.type === "credit_card";
    return {
      id: a.id,
      nome: a.name,
      tipo: ACCOUNT_TYPE_LABEL[a.type] ?? a.type,
      instituicao: a.institution,
      final: a.lastFour,
      ativa: a.isActive,
      conta_pagadora: a.parentAccountId ? (nameById.get(a.parentAccountId) ?? null) : null,
      saldo:
        !isCard && saldo
          ? { valor: saldo.valor, data_referencia: saldo.data, fonte: "saldo final do último extrato enviado" }
          : null,
      faturas_em_aberto: isCard
        ? unpaidInvoices
            .filter((i) => i.bankAccountId === a.id)
            .map((i) => ({
              id: i.id,
              mes_referencia: i.referenceMonth,
              vencimento: i.dueDate,
              fechamento: i.closingDate,
              valor_total: num(i.totalAmount),
              valor_minimo: num(i.minimumAmount),
              status: i.status === "scheduled" ? "agendada" : "aberta",
            }))
        : undefined,
    };
  });

  const saldoContas = contas.reduce((s, c) => s + (c.ativa && c.saldo?.valor ? c.saldo.valor : 0), 0);
  const faturasAbertas = contas.reduce(
    (s, c) => s + (c.faturas_em_aberto ?? []).reduce((x, f) => x + (f.valor_total ?? 0), 0),
    0
  );

  return {
    contas,
    totais: {
      saldo_contas: num(saldoContas),
      faturas_em_aberto: num(faturasAbertas),
    },
  };
}
