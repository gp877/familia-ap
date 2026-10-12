/**
 * GET /api/agent/resumo?mes=AAAA-MM — receitas, despesas e resultado do mês
 * (padrão: mês atual), maiores categorias de despesa e saldos.
 * Somente leitura; ver lib/agent-api.
 */
import { and, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { categories, transactions } from "@/db/schema";
import { agentRoute, num, parseMonthParam } from "@/lib/agent-api";
import { getAccountsWithBalances, realTxWhere } from "@/lib/agent-queries";

export const runtime = "nodejs";

export const GET = agentRoute(async ({ householdId, url }) => {
  const { mes, de, ate } = parseMonthParam(url.searchParams.get("mes"));
  const where = realTxWhere(householdId, de, ate);

  const [[totals], byCategory, cats, [pending], accounts] = await Promise.all([
    db
      .select({
        receitas: sql<string>`coalesce(sum(${transactions.amount}::numeric) filter (where ${transactions.kind} = 'credit'), 0)::text`,
        despesas: sql<string>`coalesce(sum(${transactions.amount}::numeric) filter (where ${transactions.kind} = 'debit'), 0)::text`,
        quantidade: sql<number>`count(*)::int`,
      })
      .from(transactions)
      .where(where),
    db
      .select({
        categoryId: transactions.categoryId,
        total: sql<string>`sum(${transactions.amount}::numeric)::text`,
      })
      .from(transactions)
      .where(and(where, eq(transactions.kind, "debit")))
      .groupBy(transactions.categoryId)
      .orderBy(sql`sum(${transactions.amount}::numeric) desc`)
      .limit(10),
    db.query.categories.findMany({
      where: eq(categories.householdId, householdId),
      columns: { id: true, name: true },
    }),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(transactions)
      .where(and(where, eq(transactions.status, "pending"))),
    getAccountsWithBalances(householdId),
  ]);

  const catName = new Map(cats.map((c) => [c.id, c.name]));
  const receitas = num(totals.receitas) ?? 0;
  const despesas = num(totals.despesas) ?? 0;

  return {
    mes,
    periodo: { de, ate },
    moeda: "BRL",
    receitas,
    despesas,
    resultado: num(receitas - despesas),
    quantidade_lancamentos: totals.quantidade,
    lancamentos_sem_classificacao: pending.n,
    maiores_despesas_por_categoria: byCategory.map((r) => ({
      categoria_id: r.categoryId,
      categoria: r.categoryId ? (catName.get(r.categoryId) ?? null) : "Sem categoria",
      total: num(r.total),
    })),
    saldos: accounts.totais,
    regra:
      "Totais excluem transferências internas (ex.: pagamento de fatura no extrato) e lançamentos ignorados — mesma regra do Dashboard.",
  };
});
