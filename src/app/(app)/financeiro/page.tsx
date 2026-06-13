import { eq, sql } from "drizzle-orm";
import Link from "next/link";

import { BigNumber, Card, SectionRow, StackBar } from "@/components/ap/atoms";
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

export default async function FinanceiroPage() {
  const session = await auth();
  if (!session?.user?.id) return null;

  const dbUser = await db.query.users.findFirst({
    where: eq(users.id, session.user.id),
  });
  if (!dbUser?.householdId) return null;

  const now = new Date();

  // O fluxo da família é subir documentos na VIRADA do mês — durante quase
  // o mês inteiro o "mês atual" não tem dados e o painel ficava vazio.
  // Mostramos o mês atual SE tiver transações; senão, o último mês com dados.
  const [latestRow] = await db
    .select({
      month: sql<string | null>`to_char(max(${transactions.occurredOn}), 'YYYY-MM')`,
    })
    .from(transactions)
    .where(
      sql`${transactions.householdId} = ${dbUser.householdId} AND ${transactions.status} != 'ignored' AND ${transactions.isInternalTransfer} = false`
    );
  const currentYm = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const displayYm =
    latestRow?.month && latestRow.month < currentYm ? latestRow.month : currentYm;
  const [dispY, dispM] = displayYm.split("-").map(Number);
  const isCurrentMonth = displayYm === currentYm;

  const monthStart = new Date(dispY, dispM - 1, 1);
  const monthEnd = new Date(dispY, dispM, 1);
  const monthLabel = monthStart.toLocaleDateString("pt-BR", {
    month: "long",
    ...(dispY !== now.getFullYear() ? { year: "numeric" } : {}),
  });

  // 3 queries em paralelo — antes eram sequenciais
  const [monthAgg, byCat] = await Promise.all([
    db
      .select({
        totalDebit: sql<string>`coalesce(sum(case when ${transactions.kind} = 'debit' then ${transactions.amount}::numeric else 0 end), 0)::text`,
        totalCredit: sql<string>`coalesce(sum(case when ${transactions.kind} = 'credit' then ${transactions.amount}::numeric else 0 end), 0)::text`,
        txCount: sql<number>`count(*)::int`,
        pendingCount: sql<number>`count(*) filter (where ${transactions.status} = 'pending')::int`,
      })
      .from(transactions)
      .where(
        sql`${transactions.householdId} = ${dbUser.householdId} AND ${transactions.status} != 'ignored' AND ${transactions.isInternalTransfer} = false AND ${transactions.occurredOn} >= ${monthStart.toISOString()} AND ${transactions.occurredOn} < ${monthEnd.toISOString()}`
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
      <SectionRow
        icon="bank"
        label={`Visão de ${monthLabel}`}
        action={
          isCurrentMonth ? (
            `${txCount} transações`
          ) : (
            <span style={{ fontSize: 11, color: "var(--muted)" }}>
              último mês com dados · {txCount} transações
            </span>
          )
        }
      />

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

          {pendingCount > 0 && (
            <div style={{ padding: "10px 20px 0" }}>
              <Link
                href={`/financeiro/transacoes?status=pending&month=${displayYm}`}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "11px 14px",
                  borderRadius: 12,
                  background: "color-mix(in oklab, var(--alert) 12%, var(--card))",
                  border: "0.5px solid color-mix(in oklab, var(--alert) 40%, transparent)",
                  color: "var(--alert)",
                  textDecoration: "none",
                  fontSize: 12.5,
                  fontWeight: 700,
                }}
              >
                <span>
                  {pendingCount} {pendingCount === 1 ? "transação pendente" : "transações pendentes"} de revisão em {monthLabel}
                </span>
                <span style={{ fontWeight: 800 }}>revisar →</span>
              </Link>
            </div>
          )}

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

      {/* Navegação entre telas do módulo agora é pelos chips no topo —
          o grid antigo de atalhos duplicava os mesmos destinos. Sobra só
          a AÇÃO principal do ritual mensal. */}
      <div style={{ padding: "14px 20px 0" }}>
        <Link
          href="/financeiro/upload"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "14px 16px",
            borderRadius: 14,
            background: "var(--accent)",
            color: "var(--accent-on)",
            textDecoration: "none",
            fontSize: 14,
            fontWeight: 700,
          }}
        >
          <span>Subir documento — extrato ou fatura</span>
          <span style={{ fontSize: 18, fontWeight: 800 }}>↗</span>
        </Link>
      </div>
    </ScreenShell>
  );
}

