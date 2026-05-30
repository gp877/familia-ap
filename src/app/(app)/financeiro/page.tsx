import { eq, sql } from "drizzle-orm";
import Link from "next/link";

import { BigNumber, Card, SectionRow, StackBar } from "@/components/ap/atoms";
import { Icon } from "@/components/ap/icon";
import { ScreenShell } from "@/components/ap/screen-shell";
import { auth } from "@/auth";
import { db } from "@/db";
import { bankAccounts, categories, transactions, users } from "@/db/schema";

function formatBRL(n: number) {
  return n.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

const CAT_COLORS = ["var(--accent)", "var(--alert)", "#5DA9FF", "#B57FFF", "#7BD86F"];

export default async function FinanceiroPage() {
  const session = await auth();
  if (!session?.user?.id) return null;

  const dbUser = await db.query.users.findFirst({
    where: eq(users.id, session.user.id),
  });
  if (!dbUser?.householdId) return null;

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const monthLabel = now.toLocaleDateString("pt-BR", { month: "long" });

  // 3 queries em paralelo — antes eram sequenciais
  const [monthAgg, byCat, accounts] = await Promise.all([
    db
      .select({
        totalDebit: sql<string>`coalesce(sum(case when ${transactions.kind} = 'debit' then ${transactions.amount}::numeric else 0 end), 0)::text`,
        totalCredit: sql<string>`coalesce(sum(case when ${transactions.kind} = 'credit' then ${transactions.amount}::numeric else 0 end), 0)::text`,
        txCount: sql<number>`count(*)::int`,
        pendingCount: sql<number>`count(*) filter (where ${transactions.status} = 'pending')::int`,
      })
      .from(transactions)
      .where(
        sql`${transactions.householdId} = ${dbUser.householdId} AND ${transactions.status} != 'ignored' AND ${transactions.occurredOn} >= ${monthStart.toISOString()} AND ${transactions.occurredOn} < ${monthEnd.toISOString()}`
      )
      .then((r) => r[0]),
    db
      .select({
        categoryName: categories.name,
        total: sql<string>`sum(${transactions.amount}::numeric)::text`,
      })
      .from(transactions)
      .leftJoin(categories, eq(transactions.categoryId, categories.id))
      .where(
        sql`${transactions.householdId} = ${dbUser.householdId} AND ${transactions.kind} = 'debit' AND ${transactions.status} != 'ignored' AND ${transactions.occurredOn} >= ${monthStart.toISOString()} AND ${transactions.occurredOn} < ${monthEnd.toISOString()}`
      )
      .groupBy(categories.name),
    db.query.bankAccounts.findMany({
      where: eq(bankAccounts.householdId, dbUser.householdId),
      limit: 10,
    }),
  ]);

  const totalDebit = parseFloat(monthAgg?.totalDebit ?? "0");
  const totalCredit = parseFloat(monthAgg?.totalCredit ?? "0");
  const txCount = monthAgg?.txCount ?? 0;
  const pendingCount = monthAgg?.pendingCount ?? 0;
  const saldo = totalCredit - totalDebit;

  const named = byCat
    .filter((c) => c.categoryName)
    .map((c) => ({
      name: c.categoryName!,
      val: parseFloat(c.total),
    }))
    .sort((a, b) => b.val - a.val)
    .slice(0, 4);

  const totalCatTop4 = named.reduce((sum, c) => sum + c.val, 0);
  const rest = totalDebit - totalCatTop4;
  const segments = [
    ...named.map((c, i) => ({
      value: totalDebit > 0 ? (c.val / totalDebit) * 100 : 0,
      color: CAT_COLORS[i],
    })),
    {
      value: totalDebit > 0 ? (rest / totalDebit) * 100 : 100,
      color: "var(--card2)",
    },
  ];

  return (
    <ScreenShell
      userQ="Como tá o financeiro este mês?"
      insight={
        txCount === 0 ? (
          <>Sem dados desse mês. Suba um PDF de extrato ou fatura.</>
        ) : (
          <>
            {saldo >= 0 ? "Vocês sobraram" : "Faltou"} <b>R$ {formatBRL(Math.abs(saldo))}</b> em {monthLabel}.{" "}
            {pendingCount > 0 ? `${pendingCount} transações ainda precisam ser revisadas.` : "Tudo categorizado."}
          </>
        )
      }
    >
      <SectionRow icon="bank" label={`Visão de ${monthLabel}`} action={`${txCount} transações`} />

      <BigNumber
        value={txCount > 0 ? `R$ ${formatBRL(Math.abs(saldo))}` : "—"}
        sub={
          txCount > 0
            ? saldo >= 0
              ? "saldo positivo · receitas − despesas"
              : "no vermelho · revisar gastos"
            : "ainda sem transações"
        }
        accent={txCount > 0 && saldo >= 0}
      />

      {txCount > 0 && (
        <>
          <div style={{ padding: "12px 20px 0" }}>
            <div style={{ display: "grid", gap: 10, gridTemplateColumns: "1fr 1fr" }}>
              <Card pad={12}>
                <div className="ap-eyebrow">despesas</div>
                <div className="ap-num" style={{ fontSize: 18, color: "var(--alert)", marginTop: 4 }}>
                  R$ {formatBRL(totalDebit)}
                </div>
              </Card>
              <Card pad={12}>
                <div className="ap-eyebrow">receitas</div>
                <div className="ap-num" style={{ fontSize: 18, color: "var(--ok)", marginTop: 4 }}>
                  R$ {formatBRL(totalCredit)}
                </div>
              </Card>
            </div>
          </div>

          {named.length > 0 && (
            <div style={{ padding: "14px 20px 0" }}>
              <StackBar h={6} segments={segments} />
              <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 4 }}>
                {named.map((c, i) => (
                  <div
                    key={c.name}
                    style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}
                  >
                    <span
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: 4,
                        background: CAT_COLORS[i],
                      }}
                    />
                    <span style={{ flex: 1, color: "var(--ink-d)" }}>{c.name}</span>
                    <span className="ap-num" style={{ fontSize: 12 }}>
                      R$ {formatBRL(c.val)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      <SectionRow icon="bag" label="Atalhos" />

      <div style={{ padding: "0 20px", display: "grid", gap: 8, gridTemplateColumns: "1fr 1fr" }}>
        <Shortcut href="/financeiro/upload" icon="file" label="Subir PDF" sub="extrato ou fatura" accent />
        <Shortcut href="/financeiro/transacoes" icon="bag" label="Transações" sub="ver e classificar" />
        <Shortcut href="/financeiro/extratos" icon="bank" label="Extratos" sub="controle mês a mês" />
        <Shortcut href="/financeiro/faturas" icon="bank" label="Faturas" sub="cartões de crédito" />
        <Shortcut href="/financeiro/dre" icon="chart" label="DRE" sub="receitas e despesas" />
        <Shortcut href="/financeiro/orcamento" icon="chart" label="Orçamento" sub="planejado anual" />
        <Shortcut href="/financeiro/contas" icon="bank" label="Contas" sub={`${accounts.length} cadastradas`} />
        <Shortcut href="/financeiro/categorias" icon="star" label="Categorias" sub="gerenciar" />
      </div>
    </ScreenShell>
  );
}

function Shortcut({
  href,
  icon,
  label,
  sub,
  accent,
}: {
  href: string;
  icon: Parameters<typeof Icon>[0]["name"];
  label: string;
  sub: string;
  accent?: boolean;
}) {
  return (
    <Link href={href} style={{ textDecoration: "none", color: "inherit" }}>
      <div
        style={{
          padding: 14,
          borderRadius: 16,
          background: accent ? "var(--accent)" : "var(--card)",
          color: accent ? "var(--accent-on)" : "var(--ink)",
          display: "flex",
          flexDirection: "column",
          gap: 6,
        }}
      >
        <Icon name={icon} size={18} color="currentColor" stroke={1.8} />
        <div style={{ fontSize: 14, fontWeight: 700 }}>{label}</div>
        <div
          style={{
            fontSize: 10.5,
            color: accent ? "rgba(0,0,0,0.6)" : "var(--muted)",
          }}
        >
          {sub}
        </div>
      </div>
    </Link>
  );
}
