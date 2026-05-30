import { desc, eq, sql } from "drizzle-orm";
import Link from "next/link";

import { AccountPicker } from "@/components/ap/account-picker";
import { BigNumber, Card, Pill, SectionRow } from "@/components/ap/atoms";
import { BackButton } from "@/components/ap/inline-form";
import { ScreenShell } from "@/components/ap/screen-shell";
import { auth } from "@/auth";
import { db } from "@/db";
import { bankAccounts, transactions, uploads, users } from "@/db/schema";

function formatBRL(n: number) {
  return n.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatMonthLabel(yyyymm: string): string {
  const [y, m] = yyyymm.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
  });
}

function formatMonthShort(yyyymm: string): string {
  const [y, m] = yyyymm.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("pt-BR", {
    month: "short",
    year: "2-digit",
  });
}

function formatDate(d: Date | string): string {
  return new Date(d).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "2-digit",
  });
}

type SearchParams = Promise<{ account?: string }>;

export default async function ExtratosPage({
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

  // 3 queries em paralelo
  const [allAccounts, allUploads, aggByUpload] = await Promise.all([
    db.query.bankAccounts.findMany({
      where: eq(bankAccounts.householdId, dbUser.householdId),
      orderBy: (a, { asc }) => [asc(a.type), asc(a.name)],
    }),
    db.query.uploads.findMany({
      where: (u, { and: aa, eq: ee }) =>
        aa(ee(u.householdId, dbUser.householdId!), ee(u.sourceType, "bank_statement")),
      orderBy: [desc(uploads.createdAt)],
    }),
    db
      .select({
        uploadId: transactions.uploadId,
        count: sql<number>`count(*)::int`,
        debit: sql<string>`coalesce(sum(case when ${transactions.kind} = 'debit' then ${transactions.amount}::numeric else 0 end), 0)::text`,
        credit: sql<string>`coalesce(sum(case when ${transactions.kind} = 'credit' then ${transactions.amount}::numeric else 0 end), 0)::text`,
        minDate: sql<string>`min(${transactions.occurredOn})::text`,
        maxDate: sql<string>`max(${transactions.occurredOn})::text`,
      })
      .from(transactions)
      .where(eq(transactions.householdId, dbUser.householdId))
      .groupBy(transactions.uploadId),
  ]);
  const accountsById = new Map(allAccounts.map((a) => [a.id, a]));

  const aggMap = new Map<
    string,
    {
      count: number;
      debit: number;
      credit: number;
      minDate: string | null;
      maxDate: string | null;
    }
  >();
  for (const row of aggByUpload) {
    if (!row.uploadId) continue;
    aggMap.set(row.uploadId, {
      count: row.count,
      debit: parseFloat(row.debit),
      credit: parseFloat(row.credit),
      minDate: row.minDate,
      maxDate: row.maxDate,
    });
  }

  // Conta de filtros: expande conta-mãe pra incluir cartões filhos
  // (extrato é só de contas correntes/poupança, então sem filhos esperados,
  // mas mantém consistência com /transacoes)
  const filterIds: string[] | null = sp.account
    ? (() => {
        const sel = allAccounts.find((a) => a.id === sp.account);
        if (!sel) return null;
        if (sel.type === "credit_card") return [sel.id];
        const children = allAccounts.filter((a) => a.parentAccountId === sel.id).map((a) => a.id);
        return [sel.id, ...children];
      })()
    : null;

  type EnrichedUpload = {
    upload: typeof allUploads[number];
    referenceMonth: string;
    count: number;
    debit: number;
    credit: number;
    minDate: string | null;
    maxDate: string | null;
  };

  const enriched: EnrichedUpload[] = allUploads
    .filter((u) => !filterIds || (u.bankAccountId && filterIds.includes(u.bankAccountId)))
    .map((u) => {
      const agg = aggMap.get(u.id);
      const refMonth =
        agg?.minDate?.slice(0, 7) ??
        new Date(u.createdAt).toISOString().slice(0, 7);
      return {
        upload: u,
        referenceMonth: refMonth,
        count: agg?.count ?? 0,
        debit: agg?.debit ?? 0,
        credit: agg?.credit ?? 0,
        minDate: agg?.minDate ?? null,
        maxDate: agg?.maxDate ?? null,
      };
    });

  // Agrupa por mês (referenceMonth) — mais recente primeiro
  const byMonth = new Map<string, EnrichedUpload[]>();
  for (const e of enriched) {
    const arr = byMonth.get(e.referenceMonth) ?? [];
    arr.push(e);
    byMonth.set(e.referenceMonth, arr);
  }
  const sortedMonths = [...byMonth.keys()].sort().reverse();

  const totalProcessed = enriched.filter((e) => e.upload.status === "completed").length;
  const totalPending = enriched.filter((e) =>
    e.upload.status === "pending" || e.upload.status === "processing"
  ).length;
  const totalErrored = enriched.filter((e) => e.upload.status === "failed").length;

  const activeAccount = sp.account ? accountsById.get(sp.account) : null;

  return (
    <ScreenShell
      insight={
        enriched.length === 0 ? (
          <>Nenhum extrato cadastrado ainda. Suba um PDF abaixo — a IA extrai as transações.</>
        ) : (
          <>
            <b>{enriched.length}</b> extratos
            {activeAccount ? ` de ${activeAccount.name}` : ""}
            {" — "}
            <b>{sortedMonths.length}</b> {sortedMonths.length === 1 ? "mês" : "meses"} controlados.
            {totalPending > 0 ? ` ${totalPending} pendente${totalPending === 1 ? "" : "s"} de processamento.` : ""}
          </>
        )
      }
    >
      <div style={{ padding: "0 20px 8px" }}>
        <BackButton href="/financeiro" label="Financeiro" />
      </div>

      <SectionRow icon="bank" label="Extratos bancários" action={`${enriched.length} no total`} />

      {/* Filtro de conta — mesma hierarquia de /transacoes */}
      <AccountPicker
        basePath="/financeiro/extratos"
        accounts={allAccounts.map((a) => ({
          id: a.id,
          name: a.name,
          type: a.type,
          institution: a.institution,
          lastFour: a.lastFour,
          parentAccountId: a.parentAccountId,
        }))}
        activeAccountId={sp.account ?? null}
      />

      <BigNumber
        value={String(sortedMonths.length)}
        sub={`mês${sortedMonths.length === 1 ? "" : "es"} com extrato lançado${activeAccount ? ` · ${activeAccount.name}` : ""}`}
      />

      {/* Stats rápidas */}
      <div
        style={{
          padding: "14px 20px 0",
          display: "grid",
          gap: 8,
          gridTemplateColumns: "1fr 1fr 1fr",
        }}
      >
        <StatCard label="processados" value={totalProcessed} tone="ok" />
        <StatCard label="pendentes" value={totalPending} tone="accent" />
        <StatCard label="com erro" value={totalErrored} tone="alert" />
      </div>

      {/* Atalho de upload */}
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
          <span>Subir PDF de extrato</span>
          <span style={{ fontSize: 18, fontWeight: 800 }}>↗</span>
        </Link>
      </div>

      {/* Lista por mês */}
      {sortedMonths.map((month) => {
        const list = byMonth.get(month) ?? [];
        const monthTotal = list.reduce((s, e) => s + e.debit + e.credit, 0);
        const monthTxCount = list.reduce((s, e) => s + e.count, 0);
        return (
          <div key={month}>
            <SectionRow
              icon="bank"
              label={formatMonthLabel(month)}
              action={
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span
                    style={{
                      fontSize: 10.5,
                      color: "var(--muted)",
                      fontWeight: 700,
                    }}
                  >
                    {monthTxCount} lançamentos
                  </span>
                </div>
              }
            />
            <div style={{ padding: "0 20px", display: "flex", flexDirection: "column", gap: 8 }}>
              {list.map((e) => (
                <ExtratoCard key={e.upload.id} entry={e} accountsById={accountsById} />
              ))}
            </div>
            <div style={{ padding: "8px 20px 4px", fontSize: 10.5, color: "var(--muted)" }}>
              Movimento total no mês: R$ {formatBRL(monthTotal)}
            </div>
          </div>
        );
      })}

      {sortedMonths.length === 0 && enriched.length === 0 && (
        <div
          style={{
            margin: "14px 20px 20px",
            padding: 20,
            background: "var(--card)",
            borderRadius: 14,
            fontSize: 12.5,
            color: "var(--muted-d)",
            textAlign: "center",
          }}
        >
          Sem extratos por aqui. Suba um PDF acima e a IA cuida do resto.
        </div>
      )}
    </ScreenShell>
  );
}

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "ok" | "accent" | "alert";
}) {
  const color =
    tone === "ok"
      ? "var(--ok)"
      : tone === "alert"
        ? "var(--alert)"
        : "var(--accent)";
  return (
    <Card pad={10}>
      <div className="ap-eyebrow" style={{ fontSize: 9.5 }}>
        {label}
      </div>
      <div
        className="ap-num"
        style={{
          fontSize: 18,
          color: value > 0 ? color : "var(--muted)",
          marginTop: 4,
        }}
      >
        {value}
      </div>
    </Card>
  );
}

function ExtratoCard({
  entry,
  accountsById,
}: {
  entry: {
    upload: typeof uploads.$inferSelect;
    referenceMonth: string;
    count: number;
    debit: number;
    credit: number;
    minDate: string | null;
    maxDate: string | null;
  };
  accountsById: Map<string, typeof bankAccounts.$inferSelect>;
}) {
  const acc = entry.upload.bankAccountId
    ? accountsById.get(entry.upload.bankAccountId)
    : null;
  const status = entry.upload.status;
  const linkTo = acc
    ? `/financeiro/transacoes?account=${acc.id}&month=${entry.referenceMonth}`
    : `/financeiro/transacoes?month=${entry.referenceMonth}`;

  return (
    <Link
      href={linkTo}
      style={{ textDecoration: "none", color: "inherit" }}
    >
      <Card pad={12} raised={status === "completed"}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                display: "flex",
                alignItems: "baseline",
                gap: 8,
                flexWrap: "wrap",
              }}
            >
              <span style={{ fontSize: 13.5, fontWeight: 700 }}>
                {acc?.name ?? "Conta não vinculada"}
              </span>
              <span
                style={{
                  fontSize: 10.5,
                  fontWeight: 700,
                  letterSpacing: "0.04em",
                  textTransform: "uppercase",
                  color: "var(--accent)",
                  padding: "2px 8px",
                  borderRadius: 999,
                  background: "color-mix(in oklab, var(--accent) 18%, var(--card))",
                }}
              >
                {formatMonthShort(entry.referenceMonth)}
              </span>
            </div>
            <div
              style={{
                fontSize: 11,
                color: "var(--muted)",
                marginTop: 4,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
              title={entry.upload.filename}
            >
              {entry.upload.filename}
            </div>
            <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>
              {entry.count} lançamentos
              {entry.minDate && entry.maxDate && entry.minDate !== entry.maxDate
                ? ` · ${formatDate(entry.minDate)} → ${formatDate(entry.maxDate)}`
                : ""}
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div
              className="ap-num"
              style={{
                fontSize: 13,
                color: "var(--alert)",
                lineHeight: 1.2,
              }}
            >
              −R$ {formatBRL(entry.debit)}
            </div>
            <div
              className="ap-num"
              style={{
                fontSize: 13,
                color: "var(--ok)",
                lineHeight: 1.2,
              }}
            >
              +R$ {formatBRL(entry.credit)}
            </div>
            <div style={{ marginTop: 4 }}>
              <Pill
                tone={
                  status === "completed"
                    ? "ok"
                    : status === "failed"
                      ? "alert"
                      : "accent"
                }
              >
                {status === "completed"
                  ? "processado"
                  : status === "failed"
                    ? "erro"
                    : status === "processing"
                      ? "processando"
                      : "pendente"}
              </Pill>
            </div>
          </div>
        </div>
      </Card>
    </Link>
  );
}
