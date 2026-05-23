import { eq, sql } from "drizzle-orm";

import { BigNumber, ListRow, SectionRow, StackBar } from "@/components/ap/atoms";
import { ScreenShell } from "@/components/ap/screen-shell";
import { auth } from "@/auth";
import { db } from "@/db";
import { categories, transactions, users } from "@/db/schema";

function formatBRL(n: number) {
  return n.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

const CAT_COLORS = ["var(--accent)", "var(--alert)", "#5DA9FF", "#B57FFF", "#7BD86F"];

const ICON_FOR_CAT: Record<string, "fork" | "home" | "mask" | "bag" | "plane" | "cake" | "star"> = {
  Alimentação: "fork",
  Moradia: "home",
  Casa: "home",
  Saúde: "mask",
  Lazer: "star",
  Viagens: "plane",
  Transporte: "bag",
};

export default async function FinanceiroPage() {
  const session = await auth();
  if (!session?.user?.id) return null;

  const dbUser = await db.query.users.findFirst({
    where: eq(users.id, session.user.id),
  });
  if (!dbUser?.householdId) return null;

  // Mês corrente
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const monthLabel = now.toLocaleDateString("pt-BR", { month: "long" });
  const daysInMonth = Math.ceil(
    (Date.now() - monthStart.getTime()) / (1000 * 60 * 60 * 24)
  );

  // Total de débitos do mês + agrupamento por categoria
  const grouped = await db
    .select({
      categoryId: transactions.categoryId,
      categoryName: categories.name,
      total: sql<string>`sum(${transactions.amount}::numeric)::text`,
      count: sql<number>`count(*)::int`,
    })
    .from(transactions)
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .where(
      sql`${transactions.householdId} = ${dbUser.householdId} AND ${transactions.kind} = 'debit' AND ${transactions.status} != 'ignored' AND ${transactions.occurredOn} >= ${monthStart.toISOString()} AND ${transactions.occurredOn} < ${monthEnd.toISOString()}`
    )
    .groupBy(transactions.categoryId, categories.name);

  const total = grouped.reduce((sum, g) => sum + parseFloat(g.total), 0);

  // Top 4 categorias com nome
  const named = grouped
    .filter((g) => g.categoryName)
    .map((g) => ({
      name: g.categoryName!,
      val: parseFloat(g.total),
      pct: total > 0 ? Math.round((parseFloat(g.total) / total) * 100) : 0,
    }))
    .sort((a, b) => b.val - a.val)
    .slice(0, 4);

  const uncategorizedTotal = grouped
    .filter((g) => !g.categoryName)
    .reduce((sum, g) => sum + parseFloat(g.total), 0);
  const uncategorizedPct = total > 0 ? Math.round((uncategorizedTotal / total) * 100) : 0;

  // StackBar segments — top 4 + outros
  const usedPct = named.reduce((sum, n) => sum + n.pct, 0);
  const restPct = Math.max(0, 100 - usedPct);
  const segments = [
    ...named.map((c, i) => ({ value: c.pct, color: CAT_COLORS[i] })),
    { value: restPct, color: "var(--card2)" },
  ];

  // Empty state — se não tem nada
  if (total === 0) {
    return (
      <ScreenShell
        userQ="Fala AP, me mostra os gastos desse mês"
        insight={<>Ainda sem transações nesse mês. Suba um extrato ou fatura — eu extraio tudo em ~30 segundos.</>}
      >
        <SectionRow icon="chart" label="Gastos por categoria" action={`${monthLabel} · sem dados`} />
        <BigNumber value="R$ 0,00" sub="nenhuma despesa registrada esse mês" />
        <div style={{ padding: "20px" }}>
          <a
            href="/financeiro/upload"
            style={{
              display: "block",
              padding: "16px",
              borderRadius: 16,
              background: "var(--card)",
              color: "var(--ink-d)",
              fontSize: 13.5,
              textDecoration: "none",
              textAlign: "center",
            }}
          >
            Subir um PDF →
          </a>
        </div>
      </ScreenShell>
    );
  }

  return (
    <ScreenShell
      userQ="Fala AP, me mostra os gastos desse mês"
      insight={
        named.length > 0 ? (
          <>
            Vocês gastaram <b>R$ {formatBRL(total)}</b> em {monthLabel}.{" "}
            {named[0].name} foi o maior com <b>{named[0].pct}%</b>.{" "}
            {uncategorizedTotal > 0
              ? `Ainda tem R$ ${formatBRL(uncategorizedTotal)} sem categoria — quer revisar?`
              : ""}
          </>
        ) : (
          <>R$ {formatBRL(total)} em despesas, mas nada categorizado ainda. Comece editando categorias na lista — vira regra automática.</>
        )
      }
    >
      <SectionRow icon="chart" label="Gastos por categoria" action={`${monthLabel} · ${daysInMonth} dias`} />
      <BigNumber value={`R$ ${formatBRL(total)}`} sub={`${grouped.reduce((s, g) => s + g.count, 0)} transações`} />

      <div style={{ padding: "12px 20px 0" }}>
        <StackBar h={6} segments={segments} />
      </div>

      <div style={{ padding: "14px 20px 0" }}>
        {named.map((c, i) => {
          const icon = ICON_FOR_CAT[c.name] ?? "bag";
          return (
            <ListRow
              key={c.name}
              icon={icon}
              title={c.name}
              sub={`${c.pct}% dos gastos`}
              value={`R$ ${formatBRL(c.val)}`}
              color={CAT_COLORS[i]}
              last={i === named.length - 1 && uncategorizedPct === 0}
            />
          );
        })}
        {uncategorizedPct > 0 && (
          <ListRow
            icon="file"
            title="Sem categoria"
            sub={`${uncategorizedPct}% · revisar`}
            value={`R$ ${formatBRL(uncategorizedTotal)}`}
            color="var(--muted)"
            last
          />
        )}
      </div>

      <div style={{ padding: "20px" }}>
        <a
          href="/financeiro/transacoes"
          style={{
            display: "block",
            padding: "14px",
            borderRadius: 16,
            background: "var(--card)",
            color: "var(--ink)",
            fontSize: 13.5,
            fontWeight: 600,
            textDecoration: "none",
            textAlign: "center",
          }}
        >
          Ver todas as transações →
        </a>
        <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
          <a
            href="/financeiro/upload"
            style={{
              flex: 1,
              padding: "12px",
              borderRadius: 16,
              background: "var(--surf)",
              color: "var(--ink-d)",
              fontSize: 12.5,
              textDecoration: "none",
              textAlign: "center",
            }}
          >
            Subir PDF
          </a>
          <a
            href="/financeiro/categorias"
            style={{
              flex: 1,
              padding: "12px",
              borderRadius: 16,
              background: "var(--surf)",
              color: "var(--ink-d)",
              fontSize: 12.5,
              textDecoration: "none",
              textAlign: "center",
            }}
          >
            Categorias
          </a>
        </div>
      </div>
    </ScreenShell>
  );
}
