/**
 * GET /api/agent/categorias?mes=AAAA-MM — categorias (com subcategorias),
 * orçamento do mês e realizado no mês (padrão: mês atual). Somente leitura.
 *
 * Orçamento: lançamento específico do mês, se houver; senão o valor padrão
 * mensal (budget com month=0, que a tela de Orçamento multiplica por 12).
 */
import { and, eq, inArray, sql } from "drizzle-orm";

import { db } from "@/db";
import { budgets, categories, transactions } from "@/db/schema";
import { agentRoute, num, parseMonthParam } from "@/lib/agent-api";
import { realTxWhere } from "@/lib/agent-queries";

export const runtime = "nodejs";

export const GET = agentRoute(async ({ householdId, url }) => {
  const { mes, year, month, de, ate } = parseMonthParam(url.searchParams.get("mes"));

  const [cats, buds, realized] = await Promise.all([
    db.query.categories.findMany({
      where: eq(categories.householdId, householdId),
      orderBy: (c, { asc }) => [asc(c.kind), asc(c.sortOrder), asc(c.name)],
    }),
    db.query.budgets.findMany({
      where: and(
        eq(budgets.householdId, householdId),
        eq(budgets.year, year),
        inArray(budgets.month, [0, month])
      ),
    }),
    db
      .select({
        categoryId: transactions.categoryId,
        debit: sql<string>`coalesce(sum(${transactions.amount}::numeric) filter (where ${transactions.kind} = 'debit'), 0)::text`,
        credit: sql<string>`coalesce(sum(${transactions.amount}::numeric) filter (where ${transactions.kind} = 'credit'), 0)::text`,
      })
      .from(transactions)
      .where(realTxWhere(householdId, de, ate))
      .groupBy(transactions.categoryId),
  ]);

  const realizedById = new Map(realized.map((r) => [r.categoryId, r]));
  const realizedOf = (id: string, kind: string) => {
    const r = realizedById.get(id);
    if (!r) return 0;
    return parseFloat(kind === "income" ? r.credit : r.debit);
  };
  const budgetOf = (id: string) => {
    const specific = buds.find((b) => b.categoryId === id && b.month === month);
    const standard = buds.find((b) => b.categoryId === id && b.month === 0);
    return num((specific ?? standard)?.plannedAmount ?? null);
  };

  const describe = (c: (typeof cats)[number]) => {
    const own = realizedOf(c.id, c.kind);
    const children = cats.filter((s) => s.parentId === c.id);
    const childrenTotal = children.reduce((s, ch) => s + realizedOf(ch.id, ch.kind), 0);
    return {
      id: c.id,
      nome: c.name,
      tipo: c.kind === "income" ? "receita" : "despesa",
      observacao: c.notes,
      orcamento_mes: budgetOf(c.id),
      realizado_mes: num(own + childrenTotal),
      subcategorias: children.length
        ? children.map((ch) => ({
            id: ch.id,
            nome: ch.name,
            observacao: ch.notes,
            orcamento_mes: budgetOf(ch.id),
            realizado_mes: num(realizedOf(ch.id, ch.kind)),
          }))
        : undefined,
    };
  };

  const semCategoria = realizedById.get(null);

  return {
    mes,
    periodo: { de, ate },
    categorias: cats.filter((c) => !c.parentId).map(describe),
    sem_categoria: {
      despesas: num(semCategoria?.debit ?? 0),
      receitas: num(semCategoria?.credit ?? 0),
    },
    regra:
      "realizado_mes da categoria-mãe inclui as subcategorias. Exclui transferências internas e lançamentos ignorados.",
  };
});
