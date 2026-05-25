import { and, eq, sql } from "drizzle-orm";

import { BigNumber, Card, Progress, SectionRow } from "@/components/ap/atoms";
import { ScreenShell } from "@/components/ap/screen-shell";
import { auth } from "@/auth";
import { db } from "@/db";
import { budgets, categories, transactions, users } from "@/db/schema";

function formatBRL(n: number) {
  return n.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function monthBounds(yyyymm: string): { start: Date; end: Date; label: string; year: number; month: number } {
  const m = /^(\d{4})-(\d{2})$/.exec(yyyymm);
  const year = m ? parseInt(m[1], 10) : new Date().getFullYear();
  const month = m ? parseInt(m[2], 10) : new Date().getMonth() + 1;
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 1);
  const label = start.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  return { start, end, label, year, month };
}

type SearchParams = Promise<{ month?: string }>;

export default async function DREPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = await searchParams;
  const session = await auth();
  if (!session?.user?.id) return null;
  const dbUser = await db.query.users.findFirst({
    where: eq(users.id, session.user.id),
  });
  if (!dbUser?.householdId) return null;

  const now = new Date();
  const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const { start, end, label, year, month } = monthBounds(sp.month ?? defaultMonth);

  // Realizado por categoria/kind
  const byCategory = await db
    .select({
      categoryId: transactions.categoryId,
      categoryName: categories.name,
      parentId: categories.parentId,
      categoryKind: categories.kind,
      txKind: transactions.kind,
      total: sql<string>`sum(${transactions.amount}::numeric)::text`,
      count: sql<number>`count(*)::int`,
    })
    .from(transactions)
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .where(
      sql`${transactions.householdId} = ${dbUser.householdId} AND ${transactions.status} != 'ignored' AND ${transactions.occurredOn} >= ${start.toISOString()} AND ${transactions.occurredOn} < ${end.toISOString()}`
    )
    .groupBy(
      transactions.categoryId,
      categories.name,
      categories.parentId,
      categories.kind,
      transactions.kind
    );

  // Orçamentos do mês (anual + mensal específico)
  const monthBudgets = await db.query.budgets.findMany({
    where: and(eq(budgets.householdId, dbUser.householdId), eq(budgets.year, year)),
  });
  // mapa de planejado por categoria
  const plannedByCategory = new Map<string, number>();
  for (const b of monthBudgets) {
    const planned = b.month === 0
      ? parseFloat(b.plannedAmount) // anual: dividido por 12
      : b.month === month
        ? parseFloat(b.plannedAmount)
        : null;
    if (planned === null) continue;
    plannedByCategory.set(b.categoryId, planned);
  }

  // Agregar realized
  type Row = {
    id: string | null;
    name: string;
    total: number;
    count: number;
    parentId: string | null;
  };
  const expenses: Row[] = [];
  const incomes: Row[] = [];
  let totalDebit = 0;
  let totalCredit = 0;
  let uncategorizedDebit = 0;
  let uncategorizedCredit = 0;

  for (const r of byCategory) {
    const value = parseFloat(r.total);
    if (r.txKind === "debit") {
      totalDebit += value;
      if (r.categoryId && r.categoryName) {
        expenses.push({
          id: r.categoryId,
          name: r.categoryName,
          total: value,
          count: r.count,
          parentId: r.parentId,
        });
      } else {
        uncategorizedDebit += value;
      }
    } else {
      totalCredit += value;
      if (r.categoryId && r.categoryName) {
        incomes.push({
          id: r.categoryId,
          name: r.categoryName,
          total: value,
          count: r.count,
          parentId: r.parentId,
        });
      } else {
        uncategorizedCredit += value;
      }
    }
  }

  // Agrupar despesas por categoria mãe + somar planejado da mãe e subs
  const allCategories = await db.query.categories.findMany({
    where: eq(categories.householdId, dbUser.householdId),
  });
  const catById = new Map(allCategories.map((c) => [c.id, c]));

  type ParentGroup = {
    name: string;
    parentId: string | null;
    total: number;
    planned: number;
    subs: { name: string; total: number; count: number }[];
  };
  const expenseGroupsMap = new Map<string, ParentGroup>();
  for (const e of expenses) {
    const cat = catById.get(e.id!);
    const parentCat = cat?.parentId ? catById.get(cat.parentId) : cat;
    const parentName = parentCat?.name ?? e.name;
    const parentIdRoot = parentCat?.id ?? null;
    const group = expenseGroupsMap.get(parentName) ?? {
      name: parentName,
      parentId: parentIdRoot,
      total: 0,
      planned: 0,
      subs: [],
    };
    group.total += e.total;
    if (cat?.parentId) {
      group.subs.push({ name: e.name, total: e.total, count: e.count });
    }
    expenseGroupsMap.set(parentName, group);
  }

  // Adicionar planejado por categoria mãe + soma de planejado das subs
  for (const [name, g] of expenseGroupsMap.entries()) {
    if (g.parentId) {
      g.planned += plannedByCategory.get(g.parentId) ?? 0;
      // subs
      for (const sub of allCategories.filter((c) => c.parentId === g.parentId)) {
        g.planned += plannedByCategory.get(sub.id) ?? 0;
      }
    }
    expenseGroupsMap.set(name, g);
  }

  // Adicionar categorias com orçamento mas sem realizado
  for (const [catId, plannedAmount] of plannedByCategory.entries()) {
    const cat = catById.get(catId);
    if (!cat) continue;
    const parentCat = cat.parentId ? catById.get(cat.parentId) : cat;
    const parentName = parentCat?.name ?? cat.name;
    if (!expenseGroupsMap.has(parentName) && cat.kind === "expense") {
      expenseGroupsMap.set(parentName, {
        name: parentName,
        parentId: parentCat?.id ?? null,
        total: 0,
        planned: plannedAmount,
        subs: [],
      });
    }
  }

  const expenseGroups = [...expenseGroupsMap.values()].sort((a, b) => b.total - a.total);

  const totalPlanned = [...plannedByCategory.values()].reduce((s, v) => s + v, 0);
  const saldo = totalCredit - totalDebit;
  const prevMonth = new Date(start);
  prevMonth.setMonth(prevMonth.getMonth() - 1);
  const nextMonth = new Date(start);
  nextMonth.setMonth(nextMonth.getMonth() + 1);
  const prevStr = `${prevMonth.getFullYear()}-${String(prevMonth.getMonth() + 1).padStart(2, "0")}`;
  const nextStr = `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, "0")}`;

  return (
    <ScreenShell
      userQ="Como foi nosso mês?"
      insight={
        <>
          {saldo >= 0 ? "Sobrou" : "Faltou"} <b>R$ {formatBRL(Math.abs(saldo))}</b> em {label}.{" "}
          {totalPlanned > 0 ? (
            <>
              Despesas: {((totalDebit / totalPlanned) * 100).toFixed(0)}% do orçamento.
            </>
          ) : expenseGroups[0] ? (
            <>Maior gasto: {expenseGroups[0].name} (R$ {formatBRL(expenseGroups[0].total)}).</>
          ) : null}
        </>
      }
    >
      <SectionRow
        icon="chart"
        label="DRE familiar"
        action={
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <a
              href={`/financeiro/dre?month=${prevStr}`}
              style={{
                padding: "2px 8px",
                borderRadius: 6,
                background: "var(--card2)",
                color: "var(--muted-d)",
                fontSize: 11,
                textDecoration: "none",
              }}
            >
              ‹
            </a>
            <span style={{ fontSize: 12, color: "var(--muted)" }}>{label}</span>
            <a
              href={`/financeiro/dre?month=${nextStr}`}
              style={{
                padding: "2px 8px",
                borderRadius: 6,
                background: "var(--card2)",
                color: "var(--muted-d)",
                fontSize: 11,
                textDecoration: "none",
              }}
            >
              ›
            </a>
          </div>
        }
      />

      <BigNumber
        value={`R$ ${formatBRL(Math.abs(saldo))}`}
        sub={saldo >= 0 ? "saldo positivo do mês" : "no vermelho"}
        accent={saldo >= 0}
      />

      <div style={{ padding: "14px 20px 0", display: "grid", gap: 10, gridTemplateColumns: totalPlanned > 0 ? "1fr 1fr 1fr" : "1fr 1fr" }}>
        <Card pad={12}>
          <div className="ap-eyebrow">receitas</div>
          <div className="ap-num" style={{ fontSize: 18, color: "var(--ok)", marginTop: 4 }}>
            R$ {formatBRL(totalCredit)}
          </div>
        </Card>
        <Card pad={12}>
          <div className="ap-eyebrow">despesas</div>
          <div className="ap-num" style={{ fontSize: 18, color: "var(--alert)", marginTop: 4 }}>
            R$ {formatBRL(totalDebit)}
          </div>
          {totalPlanned > 0 && (
            <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 4 }}>
              de R$ {formatBRL(totalPlanned)}
            </div>
          )}
        </Card>
        {totalPlanned > 0 && (
          <Card pad={12}>
            <div className="ap-eyebrow">orçado</div>
            <div className="ap-num" style={{ fontSize: 18, marginTop: 4 }}>
              R$ {formatBRL(totalPlanned)}
            </div>
            <div style={{ fontSize: 10, color: totalDebit > totalPlanned ? "var(--alert)" : "var(--muted)", marginTop: 4 }}>
              {((totalDebit / totalPlanned) * 100).toFixed(0)}% usado
            </div>
          </Card>
        )}
      </div>

      <SectionRow icon="chart" label="Despesas por categoria" action={`${expenseGroups.length}`} />

      <div style={{ padding: "0 20px" }}>
        {expenseGroups.length === 0 && uncategorizedDebit === 0 ? (
          <div style={{ fontSize: 13, color: "var(--muted)", textAlign: "center", padding: "20px 0" }}>
            Sem despesas em {label}.
          </div>
        ) : (
          <>
            {expenseGroups.map((g, i) => {
              const pct = totalDebit > 0 ? (g.total / totalDebit) * 100 : 0;
              const overBudget = g.planned > 0 && g.total > g.planned;
              const budgetPct = g.planned > 0 ? Math.min(100, (g.total / g.planned) * 100) : 0;
              return (
                <div
                  key={g.name}
                  style={{
                    padding: "12px 0",
                    borderBottom:
                      i < expenseGroups.length - 1 ? "0.5px solid var(--line-d)" : "none",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "baseline",
                      justifyContent: "space-between",
                      gap: 8,
                    }}
                  >
                    <span style={{ fontSize: 13.5, fontWeight: 600 }}>{g.name}</span>
                    <div style={{ textAlign: "right" }}>
                      <div
                        className="ap-num"
                        style={{ fontSize: 14, color: overBudget ? "var(--alert)" : "var(--ink)" }}
                      >
                        R$ {formatBRL(g.total)}
                      </div>
                      <div style={{ fontSize: 10.5, color: "var(--muted)" }}>
                        {g.planned > 0
                          ? `de R$ ${formatBRL(g.planned)} · ${budgetPct.toFixed(0)}%`
                          : `${pct.toFixed(0)}% das despesas`}
                      </div>
                    </div>
                  </div>
                  {g.planned > 0 && (
                    <div style={{ marginTop: 6 }}>
                      <Progress
                        value={budgetPct}
                        h={3}
                        color={overBudget ? "var(--alert)" : "var(--accent)"}
                      />
                    </div>
                  )}
                  {g.subs.length > 0 && (
                    <div
                      style={{
                        marginTop: 6,
                        marginLeft: 4,
                        display: "flex",
                        gap: 6,
                        flexWrap: "wrap",
                      }}
                    >
                      {g.subs.map((s) => (
                        <span
                          key={s.name}
                          style={{
                            padding: "3px 8px",
                            borderRadius: 999,
                            background: "var(--card2)",
                            fontSize: 11,
                            color: "var(--muted-d)",
                          }}
                        >
                          {s.name} · R$ {formatBRL(s.total)}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
            {uncategorizedDebit > 0 && (
              <div
                style={{
                  padding: "12px 0",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "baseline",
                }}
              >
                <span style={{ fontSize: 13, color: "var(--muted)" }}>Sem categoria</span>
                <div className="ap-num" style={{ fontSize: 13, color: "var(--muted)" }}>
                  R$ {formatBRL(uncategorizedDebit)}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {(incomes.length > 0 || uncategorizedCredit > 0) && (
        <>
          <SectionRow icon="chart" label="Receitas por categoria" action={`${incomes.length}`} />
          <div style={{ padding: "0 20px" }}>
            {incomes.map((r, i) => (
              <div
                key={r.id ?? "uncat"}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "baseline",
                  padding: "10px 0",
                  borderBottom:
                    i < incomes.length - 1 ? "0.5px solid var(--line-d)" : "none",
                }}
              >
                <span style={{ fontSize: 13.5, fontWeight: 600 }}>{r.name}</span>
                <div className="ap-num" style={{ fontSize: 14, color: "var(--ok)" }}>
                  R$ {formatBRL(r.total)}
                </div>
              </div>
            ))}
            {uncategorizedCredit > 0 && (
              <div
                style={{
                  padding: "10px 0",
                  display: "flex",
                  justifyContent: "space-between",
                }}
              >
                <span style={{ fontSize: 13, color: "var(--muted)" }}>Sem categoria</span>
                <div className="ap-num" style={{ fontSize: 13, color: "var(--muted)" }}>
                  R$ {formatBRL(uncategorizedCredit)}
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </ScreenShell>
  );
}
