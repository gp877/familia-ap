import { asc, desc, eq, gte, sql } from "drizzle-orm";
import Link from "next/link";
import React from "react";

import { BigNumber, Card, ListRow, SectionRow } from "@/components/ap/atoms";
import { ScreenShell } from "@/components/ap/screen-shell";
import { auth } from "@/auth";
import { db } from "@/db";
import {
  aniversarios,
  compromissos,
  sonhos,
  transactions,
  users,
  viagens,
} from "@/db/schema";

function formatBRL(n: number) {
  return n.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Sem R$ e sem centavos — pra big numbers/cards que quebram linha no mobile. */
function formatBRLInt(n: number) {
  return Math.round(n).toLocaleString("pt-BR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

function daysUntilMD(md: string): number {
  const [m, d] = md.split("-").map(Number);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let target = new Date(today.getFullYear(), m - 1, d);
  if (target < today) target = new Date(today.getFullYear() + 1, m - 1, d);
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

function daysUntilDate(d: string): number {
  const [y, m, day] = d.split("-").map(Number);
  const target = new Date(y, m - 1, day);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

export default async function InicioPage() {
  const session = await auth();
  const firstName = session?.user?.name?.split(" ")[0] ?? "";

  if (!session?.user?.id) return null;
  const dbUser = await db.query.users.findFirst({
    where: eq(users.id, session.user.id),
  });
  if (!dbUser?.householdId) return null;

  // === Dados do mês corrente ===
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  const todayStr = new Date().toISOString().slice(0, 10);

  // 5 queries em paralelo (antes sequenciais — era o maior gargalo da home)
  const [monthStats, nextCompromissos, upcomingTrips, allAniv, activeSonhos] =
    await Promise.all([
      db
        .select({
          debit: sql<string>`coalesce(sum(case when ${transactions.kind} = 'debit' then ${transactions.amount}::numeric else 0 end), 0)::text`,
          credit: sql<string>`coalesce(sum(case when ${transactions.kind} = 'credit' then ${transactions.amount}::numeric else 0 end), 0)::text`,
          count: sql<number>`count(*)::int`,
          pending: sql<number>`count(*) filter (where ${transactions.status} = 'pending')::int`,
        })
        .from(transactions)
        .where(
          sql`${transactions.householdId} = ${dbUser.householdId} AND ${transactions.status} != 'ignored' AND ${transactions.isInternalTransfer} = false AND ${transactions.occurredOn} >= ${monthStart.toISOString()} AND ${transactions.occurredOn} < ${monthEnd.toISOString()}`
        )
        .then((r) => r[0]),
      db.query.compromissos.findMany({
        where: (c, { and: a }) =>
          a(eq(c.householdId, dbUser.householdId!), gte(c.occurredOn, todayStr)),
        orderBy: [asc(compromissos.occurredOn), asc(compromissos.time)],
        limit: 3,
      }),
      db.query.viagens.findMany({
        where: (v, { and: a, ne }) =>
          a(eq(v.householdId, dbUser.householdId!), ne(v.status, "past")),
        orderBy: [asc(viagens.startDate)],
        limit: 1,
      }),
      db.query.aniversarios.findMany({
        where: eq(aniversarios.householdId, dbUser.householdId),
      }),
      db.query.sonhos.findMany({
        where: (s, { and: a }) =>
          a(eq(s.householdId, dbUser.householdId!), eq(s.status, "active")),
        orderBy: [desc(sonhos.createdAt)],
        limit: 6,
      }),
    ]);

  const totalDebit = parseFloat(monthStats?.debit ?? "0");
  const totalCredit = parseFloat(monthStats?.credit ?? "0");
  const saldo = totalCredit - totalDebit;
  const txCount = monthStats?.count ?? 0;
  const pendingCount = monthStats?.pending ?? 0;
  const nextTrip = upcomingTrips[0];
  // Todos os aniversários dentro de 60 dias — não só o mais próximo.
  // Isso garante que TODOS os próximos aniversários aparecem no feed na
  // ordem certa (ex: Sarah em 3d antes da Maria em 25d).
  const upcomingAnivs = allAniv
    .map((a) => ({ ...a, days: daysUntilMD(a.monthDay) }))
    .filter((a) => a.days <= 60)
    .sort((a, b) => a.days - b.days);

  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 5) return "boa madrugada";
    if (h < 12) return "bom dia";
    if (h < 18) return "boa tarde";
    return "boa noite";
  })();

  const monthLabel = now.toLocaleDateString("pt-BR", { month: "long" });

  return (
    <ScreenShell
      userQ="Fala AP, como estamos hoje?"
      insight={
        txCount > 0 ? (
          <>
            {saldo >= 0 ? "Vocês estão" : "Vocês estão"}{" "}
            <b>{saldo >= 0 ? `com R$ ${formatBRL(saldo)} livres` : `R$ ${formatBRL(Math.abs(saldo))} no vermelho`}</b>{" "}
            em {monthLabel}.
            {pendingCount > 0 ? ` ${pendingCount} transações pra revisar.` : ""}
            {nextCompromissos[0] && nextCompromissos[0].occurredOn === todayStr
              ? ` Hoje tem ${nextCompromissos[0].title.toLowerCase()}.`
              : ""}
          </>
        ) : (
          <>{greeting}, {firstName}. Cadastra umas contas, sobe um extrato — começo a montar o cenário.</>
        )
      }
    >
      <SectionRow icon="home" label={`${greeting} · ${firstName || "tudo certo"}`} />

      <BigNumber
        value={txCount > 0 ? formatBRLInt(saldo) : "Família AP"}
        sub={
          txCount > 0
            ? `R$ · ${saldo >= 0 ? "livres" : "no vermelho"} · ${monthLabel}`
            : "plataforma pronta — configura nos atalhos abaixo"
        }
        accent={txCount > 0 && saldo >= 0}
      />

      {/* Cards de stats */}
      <div style={{ padding: "14px 20px 0", display: "grid", gap: 10, gridTemplateColumns: "1fr 1fr" }}>
        <Card pad={12}>
          <div className="ap-eyebrow">despesas · {monthLabel}</div>
          <div className="ap-num" style={{ fontSize: 16, color: "var(--alert)", marginTop: 4 }}>
            {formatBRLInt(totalDebit)}
          </div>
        </Card>
        <Card pad={12}>
          <div className="ap-eyebrow">receitas · {monthLabel}</div>
          <div className="ap-num" style={{ fontSize: 16, color: "var(--ok)", marginTop: 4 }}>
            {formatBRLInt(totalCredit)}
          </div>
        </Card>
      </div>

      {/* Pendentes / próximos eventos */}
      <SectionRow icon="cal" label="O que vem por aí" />

      {/* Feed unificado em ordem cronológica: compromissos, viagem e
          aniversários convivem por proximidade — a Sarah em 3d vem antes
          do João em 25d, mesmo de tipos diferentes. Pendências (sem data)
          ficam no final. */}
      <div style={{ padding: "0 20px" }}>
        {(() => {
          type FeedItem = {
            key: string;
            days: number;
            render: (last: boolean) => React.ReactNode;
          };
          const items: FeedItem[] = [];

          for (const c of nextCompromissos) {
            const d = daysUntilDate(c.occurredOn);
            items.push({
              key: `c-${c.id}`,
              days: d,
              render: (last) => (
                <ListRow
                  icon="cal"
                  title={c.title}
                  sub={
                    d === 0
                      ? `hoje${c.time ? ` · ${c.time}` : ""}`
                      : d === 1
                        ? "amanhã"
                        : `em ${d} dias`
                  }
                  value={
                    c.who ? (
                      <span style={{ fontSize: 11, color: "var(--muted)" }}>{c.who}</span>
                    ) : undefined
                  }
                  last={last}
                />
              ),
            });
          }

          if (nextTrip?.startDate) {
            const d = daysUntilDate(nextTrip.startDate);
            items.push({
              key: `t-${nextTrip.id}`,
              days: d,
              render: (last) => (
                <ListRow
                  icon="plane"
                  title={nextTrip.title}
                  sub={`próxima viagem · em ${d} dias`}
                  value={
                    nextTrip.destinationCountry ? (
                      <span style={{ fontSize: 11, fontWeight: 700 }}>
                        {nextTrip.destinationCountry.toUpperCase()}
                      </span>
                    ) : undefined
                  }
                  last={last}
                />
              ),
            });
          }

          for (const a of upcomingAnivs) {
            items.push({
              key: `a-${a.id}`,
              days: a.days,
              render: (last) => (
                <ListRow
                  icon="cake"
                  title={`Aniversário · ${a.name}`}
                  sub={a.days === 0 ? "hoje" : a.days === 1 ? "amanhã" : `em ${a.days} dias`}
                  value={
                    a.birthYear ? (
                      <span style={{ fontSize: 11, color: "var(--muted)" }}>
                        faz {new Date().getFullYear() - a.birthYear}
                      </span>
                    ) : undefined
                  }
                  last={last}
                />
              ),
            });
          }

          items.sort((x, y) => x.days - y.days);

          if (items.length === 0 && pendingCount === 0) {
            return (
              <ListRow icon="cal" title="Compromissos" sub="sem nada agendado" value="—" last />
            );
          }

          const lastFeedIdx = items.length - 1;
          return (
            <>
              {items.map((it, i) => (
                <React.Fragment key={it.key}>
                  {it.render(i === lastFeedIdx && pendingCount === 0)}
                </React.Fragment>
              ))}
              {pendingCount > 0 && (
                <Link
                  href="/financeiro/transacoes?status=pending"
                  style={{ textDecoration: "none", color: "inherit" }}
                >
                  <ListRow
                    icon="bag"
                    title="Transações pendentes"
                    sub="revisar e classificar"
                    value={
                      <span className="ap-num" style={{ fontSize: 16, color: "var(--accent)" }}>
                        {pendingCount}
                      </span>
                    }
                    last
                  />
                </Link>
              )}
            </>
          );
        })()}
      </div>

      {/* Carrossel de sonhos (linha horizontal) */}
      {activeSonhos.length > 0 && (
        <>
          <SectionRow icon="star" label="Sonhos da família" action={`${activeSonhos.length} ativos`} />
          <div
            style={{
              padding: "0 0 0 20px",
              display: "flex",
              gap: 10,
              overflowX: "auto",
              scrollSnapType: "x mandatory",
            }}
          >
            {activeSonhos.map((s) => (
              <Link
                key={s.id}
                href="/sonhos"
                style={{
                  textDecoration: "none",
                  color: "inherit",
                  flexShrink: 0,
                  width: 180,
                  scrollSnapAlign: "start",
                }}
              >
                <div
                  style={{
                    borderRadius: 14,
                    background: "var(--card)",
                    overflow: "hidden",
                    height: 200,
                    display: "flex",
                    flexDirection: "column",
                  }}
                >
                  {s.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={s.imageUrl}
                      alt={s.title}
                      style={{
                        width: "100%",
                        flex: 1,
                        objectFit: "cover",
                      }}
                    />
                  ) : (
                    <div
                      style={{
                        flex: 1,
                        background: "var(--card2)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: "var(--muted)",
                        fontSize: 11,
                      }}
                    >
                      sem imagem
                    </div>
                  )}
                  <div style={{ padding: "8px 10px" }}>
                    <div
                      style={{
                        fontSize: 12,
                        fontWeight: 700,
                        color: "var(--ink)",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {s.title}
                    </div>
                  </div>
                </div>
              </Link>
            ))}
            {/* spacer no fim */}
            <div style={{ width: 20, flexShrink: 0 }} />
          </div>
        </>
      )}

      {/* Atalhos rápidos */}
      <SectionRow icon="home" label="Atalhos" />

      <div
        style={{
          padding: "0 20px",
          display: "grid",
          gap: 8,
          gridTemplateColumns: "1fr 1fr",
        }}
      >
        <QuickLink href="/financeiro/upload" label="Subir extrato" sub="PDF" accent />
        <QuickLink href="/compromissos" label="Compromissos" sub="agendar" />
        <QuickLink href="/finais-de-semana" label="Fins de semana" sub="programar" />
        <QuickLink href="/supermercado" label="Supermercado" sub="estoque" />
      </div>
    </ScreenShell>
  );
}

function QuickLink({
  href,
  label,
  sub,
  accent,
}: {
  href: string;
  label: string;
  sub: string;
  accent?: boolean;
}) {
  return (
    <Link href={href} style={{ textDecoration: "none", color: "inherit" }}>
      <div
        style={{
          padding: 14,
          borderRadius: 14,
          background: accent ? "var(--accent)" : "var(--card)",
          color: accent ? "var(--accent-on)" : "var(--ink)",
        }}
      >
        <div style={{ fontSize: 13.5, fontWeight: 700 }}>{label}</div>
        <div
          style={{
            fontSize: 10.5,
            color: accent ? "rgba(0,0,0,0.6)" : "var(--muted)",
            marginTop: 4,
          }}
        >
          {sub}
        </div>
      </div>
    </Link>
  );
}
