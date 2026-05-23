import { eq, sql } from "drizzle-orm";

import { BigNumber, ListRow, SectionRow } from "@/components/ap/atoms";
import { ScreenShell } from "@/components/ap/screen-shell";
import { auth } from "@/auth";
import { db } from "@/db";
import { transactions, users } from "@/db/schema";

function formatBRL(n: number) {
  return n.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export default async function CasaPage() {
  const session = await auth();
  const firstName = session?.user?.name?.split(" ")[0] ?? "";

  let saldoLivre = 0;
  let txCount = 0;
  let pendingCount = 0;

  if (session?.user?.id) {
    const me = await db.query.users.findFirst({
      where: eq(users.id, session.user.id),
    });
    if (me?.householdId) {
      const monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);

      const totals = await db
        .select({
          totalDebit: sql<string>`coalesce(sum(case when ${transactions.kind} = 'debit' then ${transactions.amount}::numeric else 0 end), 0)::text`,
          totalCredit: sql<string>`coalesce(sum(case when ${transactions.kind} = 'credit' then ${transactions.amount}::numeric else 0 end), 0)::text`,
          count: sql<number>`count(*)::int`,
          pending: sql<number>`count(*) filter (where ${transactions.status} = 'pending')::int`,
        })
        .from(transactions)
        .where(
          sql`${transactions.householdId} = ${me.householdId} AND ${transactions.occurredOn} >= ${monthStart.toISOString()} AND ${transactions.status} != 'ignored'`
        )
        .then((r) => r[0]);

      const debit = parseFloat(totals?.totalDebit ?? "0");
      const credit = parseFloat(totals?.totalCredit ?? "0");
      saldoLivre = credit - debit;
      txCount = totals?.count ?? 0;
      pendingCount = totals?.pending ?? 0;
    }
  }

  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 5) return "boa madrugada";
    if (h < 12) return "bom dia";
    if (h < 18) return "boa tarde";
    return "boa noite";
  })();

  const today = new Date().toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "short",
  });

  // Módulos — só Finanças tem dado real; resto é mock por enquanto
  const modules = [
    {
      id: "fin",
      label: "Finanças",
      val: txCount > 0 ? `R$ ${formatBRL(Math.max(0, saldoLivre))}` : "—",
      sub:
        txCount > 0
          ? pendingCount > 0
            ? `${pendingCount} pendente${pendingCount === 1 ? "" : "s"} de revisão`
            : `${txCount} transações no mês`
          : "suba seu primeiro extrato",
      icon: "bag" as const,
    },
    { id: "ex", label: "Saúde", val: "Em 23 dias", sub: "próximo check-up · em breve", icon: "mask" as const },
    { id: "son", label: "Sonhos", val: "4 ativos", sub: "1 acima de 80% · em breve", icon: "star" as const },
    { id: "via", label: "Viagens", val: "Lisboa", sub: "em 4 dias · 14 noites · em breve", icon: "plane" as const },
    { id: "cal", label: "Calendário", val: "5 datas", sub: "nos próximos 7 dias · em breve", icon: "cal" as const },
    { id: "aniv", label: "Aniversários", val: "Vó Inês", sub: "em 3 dias · em breve", icon: "cake" as const },
  ];

  return (
    <ScreenShell
      userQ="Fala AP, como estamos hoje?"
      insight={
        txCount > 0 ? (
          <>
            {greeting === "boa noite" ? "Noite calma" : "Tudo certo"} aqui na casa —{" "}
            <b>R$ {formatBRL(Math.max(0, saldoLivre))}</b>{" "}
            {saldoLivre >= 0 ? "ainda livres" : "no vermelho"} no mês. Quer que eu liste os gastos da semana?
          </>
        ) : (
          <>
            {greeting}, {firstName || "tudo bem"}! Ainda não temos dado financeiro — sobe o primeiro extrato e eu organizo tudo pra você.
          </>
        )
      }
    >
      <SectionRow icon="chart" label={`Resumo de hoje · ${today}`} />
      <BigNumber
        value={txCount > 0 ? `R$ ${formatBRL(Math.max(0, saldoLivre))}` : "—"}
        sub={txCount > 0 ? "saldo livre do mês" : "ainda sem transações"}
      />

      <SectionRow icon="home" label="O que tá rolando" />
      <div style={{ padding: "0 20px" }}>
        {modules.map((m, i) => (
          <ListRow
            key={m.id}
            icon={m.icon}
            title={m.label}
            sub={m.sub}
            value={m.val}
            last={i === modules.length - 1}
          />
        ))}
      </div>
    </ScreenShell>
  );
}
