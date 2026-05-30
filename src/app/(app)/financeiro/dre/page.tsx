import { and, eq, sql } from "drizzle-orm";
import Link from "next/link";

import { BigNumber, Card, Progress, SectionRow, StackBar } from "@/components/ap/atoms";
import { BackButton } from "@/components/ap/inline-form";
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

/** Sem R$ e sem centavos — usado no BigNumber/cards para não quebrar linha. */
function formatBRLInt(n: number) {
  return Math.round(n).toLocaleString("pt-BR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

const CAT_COLORS = ["var(--accent)", "var(--alert)", "#5DA9FF", "#B57FFF", "#7BD86F", "#FFB85C"];

const MONTH_LABEL = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

type SearchParams = Promise<{ year?: string; month?: string }>;

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
  // Modo padrão: anual
  const isMonthly = !!sp.month;
  const year = isMonthly
    ? parseInt(sp.month!.split("-")[0], 10)
    : sp.year
      ? parseInt(sp.year, 10)
      : now.getFullYear();

  // ── MONTHLY VIEW ────────────────────────────────────────────
  if (isMonthly) {
    return <MonthlyDRE householdId={dbUser.householdId} monthStr={sp.month!} />;
  }

  // ── YEARLY VIEW (default) ───────────────────────────────────
  const yearStart = new Date(year, 0, 1);
  const yearEnd = new Date(year + 1, 0, 1);

  // 3 queries do ano em paralelo (antes sequenciais)
  const [byCategoryMonth, allCats, yearBudgets] = await Promise.all([
    db
      .select({
        categoryId: transactions.categoryId,
        categoryName: categories.name,
        parentId: categories.parentId,
        txKind: transactions.kind,
        month: sql<number>`extract(month from ${transactions.occurredOn})::int`,
        total: sql<string>`sum(${transactions.amount}::numeric)::text`,
      })
      .from(transactions)
      .leftJoin(categories, eq(transactions.categoryId, categories.id))
      .where(
        sql`${transactions.householdId} = ${dbUser.householdId} AND ${transactions.status} != 'ignored' AND ${transactions.occurredOn} >= ${yearStart.toISOString()} AND ${transactions.occurredOn} < ${yearEnd.toISOString()}`
      )
      .groupBy(
        transactions.categoryId,
        categories.name,
        categories.parentId,
        transactions.kind,
        sql`extract(month from ${transactions.occurredOn})`
      ),
    db.query.categories.findMany({
      where: eq(categories.householdId, dbUser.householdId),
    }),
    db.query.budgets.findMany({
      where: and(eq(budgets.householdId, dbUser.householdId), eq(budgets.year, year)),
    }),
  ]);

  // Soma totais por mês + por categoria mãe
  const monthlyData: Array<{ month: number; debit: number; credit: number }> = Array.from({ length: 12 }, (_, i) => ({
    month: i + 1,
    debit: 0,
    credit: 0,
  }));
  const catById = new Map(allCats.map((c) => [c.id, c]));

  type ExpenseGroup = {
    name: string;
    parentId: string | null;
    total: number;
    planned: number;
  };
  const expenseGroupsMap = new Map<string, ExpenseGroup>();

  let yearDebit = 0;
  let yearCredit = 0;
  let uncategorizedDebit = 0;

  for (const r of byCategoryMonth) {
    const value = parseFloat(r.total);
    const m = monthlyData[r.month - 1];
    if (r.txKind === "debit") {
      yearDebit += value;
      m.debit += value;
      if (r.categoryId && r.categoryName) {
        const cat = catById.get(r.categoryId);
        const parentCat = cat?.parentId ? catById.get(cat.parentId) : cat;
        const parentName = parentCat?.name ?? r.categoryName;
        const group = expenseGroupsMap.get(parentName) ?? {
          name: parentName,
          parentId: parentCat?.id ?? null,
          total: 0,
          planned: 0,
        };
        group.total += value;
        expenseGroupsMap.set(parentName, group);
      } else {
        uncategorizedDebit += value;
      }
    } else {
      yearCredit += value;
      m.credit += value;
    }
  }

  for (const b of yearBudgets) {
    const cat = catById.get(b.categoryId);
    if (!cat || cat.kind !== "expense") continue;
    const parentCat = cat.parentId ? catById.get(cat.parentId) : cat;
    const parentName = parentCat?.name ?? cat.name;
    const planned =
      b.month === 0
        ? parseFloat(b.plannedAmount) * 12 // anual
        : parseFloat(b.plannedAmount);
    const group = expenseGroupsMap.get(parentName) ?? {
      name: parentName,
      parentId: parentCat?.id ?? null,
      total: 0,
      planned: 0,
    };
    group.planned += planned;
    expenseGroupsMap.set(parentName, group);
  }

  const expenseGroups = [...expenseGroupsMap.values()].sort((a, b) => b.total - a.total);
  const totalPlanned = expenseGroups.reduce((s, g) => s + g.planned, 0);
  const yearSaldo = yearCredit - yearDebit;

  // Top 5 segmentos pra StackBar
  const top5 = expenseGroups.slice(0, 5);
  const restPct = expenseGroups.slice(5).reduce((s, g) => s + g.total, 0);
  const stackSegments = [
    ...top5.map((g, i) => ({
      value: yearDebit > 0 ? (g.total / yearDebit) * 100 : 0,
      color: CAT_COLORS[i],
    })),
    { value: yearDebit > 0 ? (restPct / yearDebit) * 100 : 100, color: "var(--card2)" },
  ];

  // Max para escala dos meses
  const maxMonthly = Math.max(...monthlyData.map((m) => Math.max(m.debit, m.credit)), 1);

  return (
    <ScreenShell
      userQ={`Como tá o ano de ${year}?`}
      insight={
        yearDebit === 0 ? (
          <>Sem dados em {year}. Suba alguns extratos ou popule dados de exemplo em configurações.</>
        ) : (
          <>
            {yearSaldo >= 0 ? "Sobraram" : "Faltaram"} <b>R$ {formatBRL(Math.abs(yearSaldo))}</b> em {year}.{" "}
            {totalPlanned > 0
              ? `Realizado: ${((yearDebit / totalPlanned) * 100).toFixed(0)}% do orçamento.`
              : expenseGroups[0]
                ? `Maior gasto: ${expenseGroups[0].name}.`
                : ""}
          </>
        )
      }
    >
      <div style={{ padding: "0 20px 8px" }}>
        <BackButton href="/financeiro" label="Financeiro" />
      </div>

      <SectionRow
        icon="chart"
        label="DRE Familiar"
        action={
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <Link
              href={`/financeiro/dre?year=${year - 1}`}
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
            </Link>
            <span className="ap-num" style={{ fontSize: 14, color: "var(--ink)", letterSpacing: 0 }}>
              {year}
            </span>
            <Link
              href={`/financeiro/dre?year=${year + 1}`}
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
            </Link>
          </div>
        }
      />

      <BigNumber
        value={formatBRLInt(Math.abs(yearSaldo))}
        sub={yearSaldo >= 0 ? `R$ · saldo positivo de ${year}` : "R$ · no vermelho"}
        accent={yearSaldo >= 0}
      />

      {/* Toggle Ano / Mês */}
      <div style={{ padding: "8px 20px 0", display: "flex", gap: 6 }}>
        <Link
          href={`/financeiro/dre?year=${year}`}
          style={{
            padding: "5px 14px",
            borderRadius: 999,
            background: "var(--card)",
            color: "var(--ink)",
            fontSize: 12,
            fontWeight: 600,
            textDecoration: "none",
            border: "1px solid var(--line-d)",
          }}
        >
          Ano
        </Link>
        <Link
          href={`/financeiro/dre?month=${year}-${String(now.getMonth() + 1).padStart(2, "0")}`}
          style={{
            padding: "5px 14px",
            borderRadius: 999,
            background: "transparent",
            color: "var(--muted-d)",
            fontSize: 12,
            fontWeight: 600,
            textDecoration: "none",
            border: "1px solid var(--line-d)",
          }}
        >
          Mês atual
        </Link>
      </div>

      <div
        style={{
          padding: "14px 20px 0",
          display: "grid",
          gap: 10,
          gridTemplateColumns: totalPlanned > 0 ? "1fr 1fr 1fr" : "1fr 1fr",
        }}
      >
        <Card pad={12}>
          <div className="ap-eyebrow">receitas {year}</div>
          <div className="ap-num" style={{ fontSize: 16, color: "var(--ok)", marginTop: 4 }}>
            {formatBRLInt(yearCredit)}
          </div>
        </Card>
        <Card pad={12}>
          <div className="ap-eyebrow">despesas {year}</div>
          <div className="ap-num" style={{ fontSize: 16, color: "var(--alert)", marginTop: 4 }}>
            {formatBRLInt(yearDebit)}
          </div>
          {totalPlanned > 0 && (
            <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 4 }}>
              de {formatBRLInt(totalPlanned)}
            </div>
          )}
        </Card>
        {totalPlanned > 0 && (
          <Card pad={12}>
            <div className="ap-eyebrow">orçado</div>
            <div className="ap-num" style={{ fontSize: 16, marginTop: 4 }}>
              {formatBRLInt(totalPlanned)}
            </div>
            <div
              style={{
                fontSize: 10,
                color: yearDebit > totalPlanned ? "var(--alert)" : "var(--muted)",
                marginTop: 4,
              }}
            >
              {((yearDebit / totalPlanned) * 100).toFixed(0)}% usado
            </div>
          </Card>
        )}
      </div>

      {/* Mini-gráfico mensal (12 meses, barras simples) */}
      {yearDebit > 0 && (
        <>
          <SectionRow icon="chart" label="Mês a mês" action="clique p/ ver" />
          <div style={{ padding: "0 20px", display: "flex", gap: 4, alignItems: "flex-end", height: 100 }}>
            {monthlyData.map((m) => {
              const debitH = (m.debit / maxMonthly) * 80;
              const monthStr = `${year}-${String(m.month).padStart(2, "0")}`;
              return (
                <Link
                  key={m.month}
                  href={`/financeiro/dre?month=${monthStr}`}
                  style={{
                    flex: 1,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 4,
                    textDecoration: "none",
                    color: "inherit",
                  }}
                >
                  <div
                    style={{
                      width: "100%",
                      height: 80,
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "flex-end",
                    }}
                  >
                    <div
                      style={{
                        background: m.month === now.getMonth() + 1 && year === now.getFullYear() ? "var(--accent)" : "var(--ink-d)",
                        height: `${debitH}px`,
                        borderRadius: 3,
                        opacity: m.debit > 0 ? 1 : 0.2,
                      }}
                      title={`R$ ${formatBRL(m.debit)}`}
                    />
                  </div>
                  <div style={{ fontSize: 9, color: "var(--muted)", fontWeight: 600 }}>
                    {MONTH_LABEL[m.month - 1].toLowerCase()}
                  </div>
                </Link>
              );
            })}
          </div>
          <div style={{ padding: "8px 20px 0", fontSize: 10.5, color: "var(--muted)", textAlign: "center" }}>
            altura = despesas · clique pra ver detalhes
          </div>
        </>
      )}

      {/* Categorias com StackBar e budget */}
      {expenseGroups.length > 0 && (
        <>
          <SectionRow icon="chart" label="Despesas por categoria" action={`${expenseGroups.length}`} />

          <div style={{ padding: "0 20px" }}>
            <StackBar h={8} segments={stackSegments} />
          </div>

          <div style={{ padding: "14px 20px 0" }}>
            {expenseGroups.map((g, i) => {
              const pct = yearDebit > 0 ? (g.total / yearDebit) * 100 : 0;
              const overBudget = g.planned > 0 && g.total > g.planned;
              const budgetPct = g.planned > 0 ? Math.min(100, (g.total / g.planned) * 100) : 0;
              return (
                <div
                  key={g.name}
                  style={{
                    padding: "12px 0",
                    borderBottom: i < expenseGroups.length - 1 ? "0.5px solid var(--line-d)" : "none",
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
                    <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 8 }}>
                      <span
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: 4,
                          background: i < 5 ? CAT_COLORS[i] : "var(--muted)",
                          flexShrink: 0,
                        }}
                      />
                      <span style={{ fontSize: 13.5, fontWeight: 600 }}>{g.name}</span>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div
                        className="ap-num"
                        style={{
                          fontSize: 14,
                          color: overBudget ? "var(--alert)" : "var(--ink)",
                        }}
                      >
                        {formatBRLInt(g.total)}
                      </div>
                      <div style={{ fontSize: 10.5, color: "var(--muted)" }}>
                        {g.planned > 0
                          ? `de ${formatBRLInt(g.planned)} · ${budgetPct.toFixed(0)}%`
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
                  {formatBRLInt(uncategorizedDebit)}
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </ScreenShell>
  );
}

// ── MONTHLY VIEW (drill-down) ──────────────────────────────
async function MonthlyDRE({ householdId, monthStr }: { householdId: string; monthStr: string }) {
  const m = /^(\d{4})-(\d{2})$/.exec(monthStr);
  if (!m) return <div>Mês inválido</div>;
  const yearN = parseInt(m[1], 10);
  const monthN = parseInt(m[2], 10);
  const start = new Date(yearN, monthN - 1, 1);
  const end = new Date(yearN, monthN, 1);
  const label = start.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });

  // 3 queries em paralelo (antes sequenciais)
  const [byCategory, allCats, monthBudgets] = await Promise.all([
    db
      .select({
        categoryId: transactions.categoryId,
        categoryName: categories.name,
        parentId: categories.parentId,
        txKind: transactions.kind,
        total: sql<string>`sum(${transactions.amount}::numeric)::text`,
      })
      .from(transactions)
      .leftJoin(categories, eq(transactions.categoryId, categories.id))
      .where(
        sql`${transactions.householdId} = ${householdId} AND ${transactions.status} != 'ignored' AND ${transactions.occurredOn} >= ${start.toISOString()} AND ${transactions.occurredOn} < ${end.toISOString()}`
      )
      .groupBy(transactions.categoryId, categories.name, categories.parentId, transactions.kind),
    db.query.categories.findMany({
      where: eq(categories.householdId, householdId),
    }),
    db.query.budgets.findMany({
      where: and(eq(budgets.householdId, householdId), eq(budgets.year, yearN)),
    }),
  ]);
  const catById = new Map(allCats.map((c) => [c.id, c]));
  const plannedByCategory = new Map<string, number>();
  for (const b of monthBudgets) {
    const planned = b.month === 0 ? parseFloat(b.plannedAmount) : b.month === monthN ? parseFloat(b.plannedAmount) : null;
    if (planned === null) continue;
    plannedByCategory.set(b.categoryId, planned);
  }

  type ExpGroup = { name: string; parentId: string | null; total: number; planned: number };
  const expenseGroupsMap = new Map<string, ExpGroup>();
  let totalDebit = 0;
  let totalCredit = 0;
  let uncategorizedDebit = 0;
  let uncategorizedCredit = 0;
  const incomes: Array<{ name: string; total: number }> = [];

  for (const r of byCategory) {
    const value = parseFloat(r.total);
    if (r.txKind === "debit") {
      totalDebit += value;
      if (r.categoryId && r.categoryName) {
        const cat = catById.get(r.categoryId);
        const parentCat = cat?.parentId ? catById.get(cat.parentId) : cat;
        const parentName = parentCat?.name ?? r.categoryName;
        const group = expenseGroupsMap.get(parentName) ?? {
          name: parentName,
          parentId: parentCat?.id ?? null,
          total: 0,
          planned: 0,
        };
        group.total += value;
        expenseGroupsMap.set(parentName, group);
      } else {
        uncategorizedDebit += value;
      }
    } else {
      totalCredit += value;
      if (r.categoryId && r.categoryName) {
        incomes.push({ name: r.categoryName, total: value });
      } else {
        uncategorizedCredit += value;
      }
    }
  }

  for (const [catId, plannedAmount] of plannedByCategory.entries()) {
    const cat = catById.get(catId);
    if (!cat || cat.kind !== "expense") continue;
    const parentCat = cat.parentId ? catById.get(cat.parentId) : cat;
    const parentName = parentCat?.name ?? cat.name;
    const group = expenseGroupsMap.get(parentName) ?? {
      name: parentName,
      parentId: parentCat?.id ?? null,
      total: 0,
      planned: 0,
    };
    group.planned += plannedAmount;
    expenseGroupsMap.set(parentName, group);
  }

  const expenseGroups = [...expenseGroupsMap.values()].sort((a, b) => b.total - a.total);
  const totalPlanned = expenseGroups.reduce((s, g) => s + g.planned, 0);
  const saldo = totalCredit - totalDebit;
  const prevMonth = new Date(start);
  prevMonth.setMonth(prevMonth.getMonth() - 1);
  const nextMonth = new Date(start);
  nextMonth.setMonth(nextMonth.getMonth() + 1);
  const prevStr = `${prevMonth.getFullYear()}-${String(prevMonth.getMonth() + 1).padStart(2, "0")}`;
  const nextStr = `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, "0")}`;

  return (
    <ScreenShell
      userQ={`Como foi ${label}?`}
      insight={
        <>
          {saldo >= 0 ? "Sobrou" : "Faltou"} <b>R$ {formatBRL(Math.abs(saldo))}</b> em {label}.
        </>
      }
    >
      <div style={{ padding: "0 20px 8px" }}>
        <BackButton href={`/financeiro/dre?year=${yearN}`} label={`DRE ${yearN}`} />
      </div>

      <SectionRow
        icon="chart"
        label="DRE mensal"
        action={
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <Link
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
            </Link>
            <span style={{ fontSize: 12, color: "var(--muted)" }}>{label}</span>
            <Link
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
            </Link>
          </div>
        }
      />

      <BigNumber
        value={formatBRLInt(Math.abs(saldo))}
        sub={saldo >= 0 ? "R$ · saldo positivo do mês" : "R$ · no vermelho"}
        accent={saldo >= 0}
      />

      <div
        style={{
          padding: "14px 20px 0",
          display: "grid",
          gap: 10,
          gridTemplateColumns: totalPlanned > 0 ? "1fr 1fr 1fr" : "1fr 1fr",
        }}
      >
        <Card pad={12}>
          <div className="ap-eyebrow">receitas</div>
          <div className="ap-num" style={{ fontSize: 16, color: "var(--ok)", marginTop: 4 }}>
            {formatBRLInt(totalCredit)}
          </div>
        </Card>
        <Card pad={12}>
          <div className="ap-eyebrow">despesas</div>
          <div className="ap-num" style={{ fontSize: 16, color: "var(--alert)", marginTop: 4 }}>
            {formatBRLInt(totalDebit)}
          </div>
        </Card>
        {totalPlanned > 0 && (
          <Card pad={12}>
            <div className="ap-eyebrow">orçado</div>
            <div className="ap-num" style={{ fontSize: 16, marginTop: 4 }}>
              {formatBRLInt(totalPlanned)}
            </div>
            <div style={{ fontSize: 10, color: totalDebit > totalPlanned ? "var(--alert)" : "var(--muted)", marginTop: 4 }}>
              {((totalDebit / totalPlanned) * 100).toFixed(0)}% usado
            </div>
          </Card>
        )}
      </div>

      <SectionRow icon="chart" label="Despesas por categoria" action={`${expenseGroups.length}`} />

      <div style={{ padding: "0 20px" }}>
        {expenseGroups.map((g, i) => {
          const pct = totalDebit > 0 ? (g.total / totalDebit) * 100 : 0;
          const overBudget = g.planned > 0 && g.total > g.planned;
          const budgetPct = g.planned > 0 ? Math.min(100, (g.total / g.planned) * 100) : 0;
          return (
            <div
              key={g.name}
              style={{
                padding: "12px 0",
                borderBottom: i < expenseGroups.length - 1 ? "0.5px solid var(--line-d)" : "none",
              }}
            >
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
                <span style={{ fontSize: 13.5, fontWeight: 600 }}>{g.name}</span>
                <div style={{ textAlign: "right" }}>
                  <div className="ap-num" style={{ fontSize: 14, color: overBudget ? "var(--alert)" : "var(--ink)" }}>
                    {formatBRLInt(g.total)}
                  </div>
                  <div style={{ fontSize: 10.5, color: "var(--muted)" }}>
                    {g.planned > 0 ? `de ${formatBRLInt(g.planned)} · ${budgetPct.toFixed(0)}%` : `${pct.toFixed(0)}% das despesas`}
                  </div>
                </div>
              </div>
              {g.planned > 0 && (
                <div style={{ marginTop: 6 }}>
                  <Progress value={budgetPct} h={3} color={overBudget ? "var(--alert)" : "var(--accent)"} />
                </div>
              )}
            </div>
          );
        })}
        {uncategorizedDebit > 0 && (
          <div style={{ padding: "12px 0", display: "flex", justifyContent: "space-between" }}>
            <span style={{ fontSize: 13, color: "var(--muted)" }}>Sem categoria</span>
            <div className="ap-num" style={{ fontSize: 13, color: "var(--muted)" }}>
              {formatBRLInt(uncategorizedDebit)}
            </div>
          </div>
        )}
      </div>

      {(incomes.length > 0 || uncategorizedCredit > 0) && (
        <>
          <SectionRow icon="chart" label="Receitas por categoria" />
          <div style={{ padding: "0 20px" }}>
            {incomes.map((r, i) => (
              <div key={r.name} style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "baseline",
                padding: "10px 0",
                borderBottom: i < incomes.length - 1 ? "0.5px solid var(--line-d)" : "none",
              }}>
                <span style={{ fontSize: 13.5, fontWeight: 600 }}>{r.name}</span>
                <div className="ap-num" style={{ fontSize: 14, color: "var(--ok)" }}>
                  {formatBRLInt(r.total)}
                </div>
              </div>
            ))}
            {uncategorizedCredit > 0 && (
              <div style={{ padding: "10px 0", display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontSize: 13, color: "var(--muted)" }}>Sem categoria</span>
                <div className="ap-num" style={{ fontSize: 13, color: "var(--muted)" }}>
                  {formatBRLInt(uncategorizedCredit)}
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </ScreenShell>
  );
}
