import { and, desc, eq, gte, isNull, lte, sql } from "drizzle-orm";
import Link from "next/link";

import { BigNumber, Pill, SectionRow } from "@/components/ap/atoms";
import { ScreenShell } from "@/components/ap/screen-shell";
import { auth } from "@/auth";
import { CategorySelect, type CategoryOption } from "@/components/category-select";
import { TransactionFilters } from "@/components/transaction-filters";
import { TransactionStatusToggle } from "@/components/transaction-status-toggle";
import { db } from "@/db";
import { categories, transactions, users } from "@/db/schema";

function formatBRL(n: number) {
  return n.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatDate(d: Date) {
  return new Date(d).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
  });
}

function monthBounds(yyyymm: string): { start: Date; end: Date } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(yyyymm);
  if (!m) return null;
  const year = parseInt(m[1], 10);
  const month = parseInt(m[2], 10);
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 1);
  return { start, end };
}

type SearchParams = Promise<{
  month?: string;
  status?: string;
  uncategorized?: string;
}>;

export default async function TransacoesPage({
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

  const conds = [eq(transactions.householdId, dbUser.householdId)];
  const bounds = sp.month ? monthBounds(sp.month) : null;
  if (bounds) {
    conds.push(gte(transactions.occurredOn, bounds.start));
    conds.push(lte(transactions.occurredOn, bounds.end));
  }
  if (sp.status === "pending" || sp.status === "confirmed" || sp.status === "ignored") {
    conds.push(eq(transactions.status, sp.status));
  }
  if (sp.uncategorized === "1") {
    conds.push(isNull(transactions.categoryId));
  }

  const monthsRow = await db
    .select({
      m: sql<string>`to_char(${transactions.occurredOn}, 'YYYY-MM')`,
    })
    .from(transactions)
    .where(eq(transactions.householdId, dbUser.householdId))
    .groupBy(sql`to_char(${transactions.occurredOn}, 'YYYY-MM')`)
    .orderBy(sql`to_char(${transactions.occurredOn}, 'YYYY-MM') desc`);
  const availableMonths = monthsRow.map((r) => r.m).filter(Boolean);

  const [allCategories, txs] = await Promise.all([
    db.query.categories.findMany({
      where: eq(categories.householdId, dbUser.householdId),
      with: { parent: true },
      orderBy: (c, { asc }) => [asc(c.name)],
    }),
    db.query.transactions.findMany({
      where: and(...conds),
      orderBy: [desc(transactions.occurredOn), desc(transactions.createdAt)],
      with: { category: true },
      limit: 500,
    }),
  ]);

  const categoryOptions: CategoryOption[] = allCategories.map((c) => ({
    id: c.id,
    label: c.parent ? `${c.parent.name} > ${c.name}` : c.name,
  }));

  const pendingCount = txs.filter((t) => t.status === "pending").length;
  const totalDebit = txs
    .filter((t) => t.kind === "debit" && t.status !== "ignored")
    .reduce((s, t) => s + parseFloat(t.amount), 0);
  const totalCredit = txs
    .filter((t) => t.kind === "credit" && t.status !== "ignored")
    .reduce((s, t) => s + parseFloat(t.amount), 0);

  const filterApplied = !!(sp.month || sp.status || sp.uncategorized);

  if (txs.length === 0 && availableMonths.length === 0) {
    return (
      <ScreenShell
        userQ="Vamos ver as transações?"
        insight={<>Sem nada por aqui. Suba um PDF de extrato ou fatura — a IA extrai tudo em ~30s.</>}
      >
        <SectionRow icon="bag" label="Transações" />
        <BigNumber value="—" sub="nenhuma transação registrada" />
        <div style={{ padding: "20px" }}>
          <Link
            href="/financeiro/upload"
            style={{
              display: "block",
              padding: "14px",
              borderRadius: 16,
              background: "var(--accent)",
              color: "var(--accent-on)",
              fontSize: 13.5,
              fontWeight: 700,
              textDecoration: "none",
              textAlign: "center",
            }}
          >
            Subir primeiro PDF
          </Link>
        </div>
      </ScreenShell>
    );
  }

  return (
    <ScreenShell
      userQ="Me mostra todas as transações"
      insight={
        pendingCount > 0 ? (
          <>
            <b>{pendingCount}</b> transações ainda pendentes de revisão. Toda edição de categoria vira regra automática.
          </>
        ) : (
          <>{txs.length} transações {filterApplied ? "no filtro" : "no total"}. Tudo revisado.</>
        )
      }
    >
      <SectionRow
        icon="bag"
        label="Transações"
        action={`${txs.length} ${filterApplied ? "filtradas" : "totais"}`}
      />

      <div style={{ padding: "0 20px" }}>
        <div className="ap-num" style={{ fontSize: 28, color: "var(--ink)" }}>
          − R$ {formatBRL(totalDebit)}
        </div>
        <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>
          em despesas · receitas: R$ {formatBRL(totalCredit)}
        </div>
      </div>

      <div style={{ padding: "12px 20px 0" }}>
        <TransactionFilters availableMonths={availableMonths} />
      </div>

      {txs.length === 0 ? (
        <div style={{ padding: "30px 20px", textAlign: "center", color: "var(--muted)", fontSize: 13 }}>
          Nenhuma transação com esses filtros.
        </div>
      ) : (
        <div style={{ padding: "8px 20px 0" }}>
          {txs.map((tx, i) => {
            const amount = parseFloat(tx.amount);
            return (
              <div
                key={tx.id}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 6,
                  padding: "12px 0",
                  borderBottom:
                    i < txs.length - 1 ? "0.5px solid var(--line-d)" : "none",
                  opacity: tx.status === "ignored" ? 0.4 : 1,
                }}
              >
                <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 13.5,
                        fontWeight: 600,
                        color: "var(--ink)",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {tx.description}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>
                      {formatDate(tx.occurredOn)} · {tx.rawDescription.slice(0, 64)}
                      {tx.rawDescription.length > 64 ? "…" : ""}
                    </div>
                  </div>
                  <div
                    className="ap-num"
                    style={{
                      fontSize: 14,
                      color: tx.kind === "debit" ? "var(--ink)" : "var(--ok)",
                      flexShrink: 0,
                    }}
                  >
                    {tx.kind === "debit" ? "−" : "+"} R$ {formatBRL(amount)}
                  </div>
                </div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    flexWrap: "wrap",
                  }}
                >
                  <CategorySelect
                    transactionId={tx.id}
                    currentCategoryId={tx.categoryId}
                    options={categoryOptions}
                  />
                  <Pill
                    tone={
                      tx.status === "confirmed"
                        ? "ok"
                        : tx.status === "ignored"
                          ? "muted"
                          : "alert"
                    }
                  >
                    {tx.status === "confirmed"
                      ? "ok"
                      : tx.status === "ignored"
                        ? "ignorada"
                        : "pendente"}
                  </Pill>
                  <div style={{ marginLeft: "auto" }}>
                    <TransactionStatusToggle
                      transactionId={tx.id}
                      status={tx.status}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </ScreenShell>
  );
}
