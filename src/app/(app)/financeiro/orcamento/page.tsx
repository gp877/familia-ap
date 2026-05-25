import { and, eq, sql } from "drizzle-orm";

import { BigNumber, Card, Progress, SectionRow } from "@/components/ap/atoms";
import { DeleteBtn, FormField, InlineForm, SubmitButton, fieldStyle } from "@/components/ap/inline-form";
import { ScreenShell } from "@/components/ap/screen-shell";
import { deleteBudget, upsertBudget } from "@/app/actions/budgets";
import { auth } from "@/auth";
import { db } from "@/db";
import { budgets, categories, transactions, users } from "@/db/schema";

function formatBRL(n: number) {
  return n.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

type SearchParams = Promise<{ year?: string }>;

export default async function OrcamentoPage({
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

  const year = sp.year ? parseInt(sp.year, 10) : new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;

  // Categorias da família
  const allCats = await db.query.categories.findMany({
    where: eq(categories.householdId, dbUser.householdId),
    orderBy: (c, { asc }) => [asc(c.kind), asc(c.name)],
  });

  // Orçamentos do ano
  const allBudgets = await db.query.budgets.findMany({
    where: and(eq(budgets.householdId, dbUser.householdId), eq(budgets.year, year)),
    with: { category: true },
  });

  // Realizado do ano por categoria (despesas)
  const realized = await db
    .select({
      categoryId: transactions.categoryId,
      total: sql<string>`sum(${transactions.amount}::numeric)::text`,
    })
    .from(transactions)
    .where(
      sql`${transactions.householdId} = ${dbUser.householdId} AND ${transactions.kind} = 'debit' AND ${transactions.status} != 'ignored' AND extract(year from ${transactions.occurredOn}) = ${year}`
    )
    .groupBy(transactions.categoryId);

  const realizedById = new Map(
    realized
      .filter((r) => r.categoryId)
      .map((r) => [r.categoryId!, parseFloat(r.total)])
  );

  // Totais
  const monthlyBudgets = allBudgets.filter((b) => b.month !== 0);
  const totalPlannedYear = monthlyBudgets.reduce(
    (sum, b) => sum + parseFloat(b.plannedAmount) * 12,
    0
  );
  const totalRealizedYear = [...realizedById.values()].reduce((s, v) => s + v, 0);

  // Agrupar por categoria: prefer categoria mãe (mas mostrar subs também)
  const expenseCats = allCats.filter((c) => c.kind === "expense" && !c.parentId);

  return (
    <ScreenShell
      userQ={`Como tá o orçamento de ${year}?`}
      insight={
        totalPlannedYear === 0 ? (
          <>Sem orçamento definido pra {year}. Adiciona valores planejados abaixo — vou comparar com o realizado.</>
        ) : totalRealizedYear > totalPlannedYear ? (
          <>
            Estouraram o orçamento anual em <b>R$ {formatBRL(totalRealizedYear - totalPlannedYear)}</b>. Hora de revisar?
          </>
        ) : (
          <>
            Realizado: <b>R$ {formatBRL(totalRealizedYear)}</b> de R$ {formatBRL(totalPlannedYear)} ({((totalRealizedYear / totalPlannedYear) * 100).toFixed(0)}%).
          </>
        )
      }
    >
      <SectionRow
        icon="chart"
        label={`Orçamento ${year}`}
        action={
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <a
              href={`/financeiro/orcamento?year=${year - 1}`}
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
            <span style={{ fontSize: 12, color: "var(--muted)" }}>{year}</span>
            <a
              href={`/financeiro/orcamento?year=${year + 1}`}
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
        value={`R$ ${formatBRL(totalPlannedYear)}`}
        sub={`planejado anual · ${monthlyBudgets.length} categorias com orçamento`}
        accent={totalRealizedYear <= totalPlannedYear && totalPlannedYear > 0}
      />

      <div style={{ padding: "14px 20px 0", display: "grid", gap: 10, gridTemplateColumns: "1fr 1fr" }}>
        <Card pad={12}>
          <div className="ap-eyebrow">realizado · {year}</div>
          <div className="ap-num" style={{ fontSize: 18, marginTop: 4 }}>
            R$ {formatBRL(totalRealizedYear)}
          </div>
        </Card>
        <Card pad={12}>
          <div className="ap-eyebrow">saldo</div>
          <div
            className="ap-num"
            style={{
              fontSize: 18,
              color: totalRealizedYear > totalPlannedYear ? "var(--alert)" : "var(--ok)",
              marginTop: 4,
            }}
          >
            R$ {formatBRL(Math.abs(totalPlannedYear - totalRealizedYear))}
          </div>
        </Card>
      </div>

      <div style={{ padding: "14px 0 0" }}>
        <InlineForm buttonLabel="Definir orçamento de categoria">
          {(close) => (
            <form
              action={async (fd) => {
                "use server";
                await upsertBudget(fd);
              }}
              onSubmit={() => setTimeout(close, 0)}
            >
              <FormField label="Categoria *">
                <select name="categoryId" required style={fieldStyle}>
                  <option value="">Selecione...</option>
                  {allCats
                    .filter((c) => c.kind === "expense")
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                </select>
              </FormField>
              <div style={{ display: "grid", gap: 8, gridTemplateColumns: "80px 80px 1fr" }}>
                <FormField label="Ano *">
                  <input
                    type="number"
                    name="year"
                    required
                    defaultValue={year}
                    style={fieldStyle}
                  />
                </FormField>
                <FormField label="Mês" hint="0=anual">
                  <input
                    type="number"
                    name="month"
                    defaultValue="0"
                    min="0"
                    max="12"
                    style={fieldStyle}
                  />
                </FormField>
                <FormField label="Valor mensal (R$) *">
                  <input
                    type="number"
                    step="0.01"
                    name="plannedAmount"
                    required
                    placeholder="2000"
                    style={fieldStyle}
                  />
                </FormField>
              </div>
              <SubmitButton>Salvar orçamento</SubmitButton>
            </form>
          )}
        </InlineForm>
      </div>

      <SectionRow icon="chart" label="Por categoria" action={`${expenseCats.length} despesas`} />

      <div style={{ padding: "0 20px" }}>
        {expenseCats.map((cat, i) => {
          // Soma orçamentos: pode ter 1 anual (month=0) ou múltiplos mensais
          const budgetEntries = allBudgets.filter((b) => b.categoryId === cat.id);
          const monthly = budgetEntries.filter((b) => b.month !== 0);
          const yearly = budgetEntries.find((b) => b.month === 0);
          const monthlyPlanned = yearly
            ? parseFloat(yearly.plannedAmount)
            : monthly.length === 1
              ? parseFloat(monthly[0].plannedAmount)
              : monthly.reduce((sum, b) => sum + parseFloat(b.plannedAmount), 0) / Math.max(1, monthly.length);
          const yearPlanned = yearly
            ? parseFloat(yearly.plannedAmount) * 12
            : monthly.reduce((sum, b) => sum + parseFloat(b.plannedAmount), 0);

          // Realizado da categoria (incluindo subs)
          const subs = allCats.filter((c) => c.parentId === cat.id);
          const realizedSelf = realizedById.get(cat.id) ?? 0;
          const realizedSubs = subs.reduce(
            (s, sc) => s + (realizedById.get(sc.id) ?? 0),
            0
          );
          const realizedTotal = realizedSelf + realizedSubs;

          if (yearPlanned === 0 && realizedTotal === 0) return null;
          const pct = yearPlanned > 0 ? Math.min(100, (realizedTotal / yearPlanned) * 100) : 0;

          const budgetEntry = monthly[0] ?? yearly;

          return (
            <div
              key={cat.id}
              style={{
                padding: "12px 0",
                borderBottom: i < expenseCats.length - 1 ? "0.5px solid var(--line-d)" : "none",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  justifyContent: "space-between",
                  gap: 8,
                  marginBottom: 6,
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600 }}>{cat.name}</div>
                  {yearPlanned > 0 && (
                    <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>
                      planejado R$ {formatBRL(monthlyPlanned)}/mês · R$ {formatBRL(yearPlanned)}/ano
                    </div>
                  )}
                </div>
                <div style={{ textAlign: "right" }}>
                  <div
                    className="ap-num"
                    style={{
                      fontSize: 14,
                      color: realizedTotal > yearPlanned && yearPlanned > 0 ? "var(--alert)" : "var(--ink)",
                    }}
                  >
                    R$ {formatBRL(realizedTotal)}
                  </div>
                  {yearPlanned > 0 && (
                    <div style={{ fontSize: 10.5, color: "var(--muted)" }}>
                      {pct.toFixed(0)}% do anual
                    </div>
                  )}
                </div>
                {budgetEntry && (
                  <DeleteBtn
                    action={async () => {
                      "use server";
                      await deleteBudget(budgetEntry.id);
                    }}
                    confirmMsg={`Remover orçamento de "${cat.name}"?`}
                  />
                )}
              </div>
              {yearPlanned > 0 && (
                <Progress
                  value={pct}
                  h={4}
                  color={
                    realizedTotal > yearPlanned
                      ? "var(--alert)"
                      : pct > 80
                        ? "var(--accent)"
                        : "var(--ink-d)"
                  }
                />
              )}
            </div>
          );
        })}
      </div>
    </ScreenShell>
  );
}
