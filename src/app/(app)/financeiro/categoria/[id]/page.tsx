import { and, asc, eq, gte, inArray, isNull, lte, ne } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";

import { BigNumber, Card, SectionRow } from "@/components/ap/atoms";
import { ScreenShell } from "@/components/ap/screen-shell";
import { TransactionsMultiSelect } from "@/components/ap/transactions-multi-select";
import type { CategoryOption } from "@/components/category-select";
import { auth } from "@/auth";
import { db } from "@/db";
import { categories, transactions, users } from "@/db/schema";
import { resolveCategoryColor } from "@/lib/category-colors";

function formatBRL(n: number) {
  return n.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

const MONTH_SHORT = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

type SearchParams = Promise<{ year?: string }>;

export default async function CategoriaDrilldownPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: SearchParams;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const session = await auth();
  if (!session?.user?.id) return null;
  const dbUser = await db.query.users.findFirst({ where: eq(users.id, session.user.id) });
  if (!dbUser?.householdId) return null;
  const hh = dbUser.householdId;

  const now = new Date();
  const year = sp.year ? parseInt(sp.year, 10) : now.getFullYear();
  const yearStart = new Date(year, 0, 1);
  const yearEnd = new Date(year + 1, 0, 1);

  const isUncategorized = id === "none";

  const allCategories = await db.query.categories.findMany({
    where: eq(categories.householdId, hh),
    with: { parent: true },
    orderBy: (c, { asc }) => [asc(c.name)],
  });

  // Categoria-alvo + seus filhos (drill-down de uma mãe inclui as subs).
  const target = isUncategorized ? null : allCategories.find((c) => c.id === id);
  if (!isUncategorized && (!target || target.householdId !== hh)) notFound();

  const targetIds = isUncategorized
    ? []
    : [target!.id, ...allCategories.filter((c) => c.parentId === target!.id).map((c) => c.id)];

  const headerName = isUncategorized ? "Sem categoria" : target!.name;
  const headerColor = isUncategorized
    ? "var(--muted)"
    : resolveCategoryColor(target!, target!.parent);

  // Transações reais (não-internas, não-ignoradas) da categoria no ano.
  const catCond = isUncategorized
    ? isNull(transactions.categoryId)
    : inArray(transactions.categoryId, targetIds);

  const txs = await db.query.transactions.findMany({
    where: and(
      eq(transactions.householdId, hh),
      gte(transactions.occurredOn, yearStart),
      lte(transactions.occurredOn, yearEnd),
      eq(transactions.isInternalTransfer, false),
      ne(transactions.status, "ignored"),
      catCond
    ),
    orderBy: [asc(transactions.occurredOn), asc(transactions.sourceOrder)],
  });

  // Totais e quebra mensal
  let totalDebit = 0;
  let totalCredit = 0;
  const monthly = Array.from({ length: 12 }, () => 0);
  for (const t of txs) {
    const v = parseFloat(t.amount);
    const m = new Date(t.occurredOn).getMonth();
    if (t.kind === "debit") {
      totalDebit += v;
      monthly[m] += v;
    } else {
      totalCredit += v;
      monthly[m] -= v;
    }
  }
  const net = totalCredit - totalDebit;
  const maxMonthly = Math.max(...monthly.map((v) => Math.abs(v)), 1);
  const kind = isUncategorized ? "expense" : target!.kind;

  const categoryOptions: CategoryOption[] = allCategories.map((c) => ({
    id: c.id,
    label: c.parent ? `${c.parent.name} › ${c.name}` : c.name,
    name: c.name,
    parentId: c.parentId,
    color: resolveCategoryColor(c, c.parent),
    kind: c.kind,
    notes: c.notes,
  }));

  const itemsForClient = txs.map((tx) => ({
    id: tx.id,
    occurredOn: new Date(tx.occurredOn).toISOString(),
    description: tx.description,
    rawDescription: tx.rawDescription,
    amount: tx.amount,
    kind: tx.kind,
    categoryId: tx.categoryId,
    status: tx.status,
    bankAccountId: tx.bankAccountId,
    isInternalTransfer: tx.isInternalTransfer,
    internalTransferType: tx.internalTransferType,
    splits: (tx.splits as Array<{ categoryId: string; amount: string; note?: string }> | null) ?? null,
  }));

  const yearLink = (y: number) => `/financeiro/categoria/${id}?year=${y}`;

  return (
    <ScreenShell
      insight={
        txs.length === 0 ? (
          <>Nenhuma transação de <b>{headerName}</b> em {year}.</>
        ) : (
          <>
            <b>{txs.length}</b> {txs.length === 1 ? "transação" : "transações"} de{" "}
            <b>{headerName}</b> em {year} ·{" "}
            {kind === "income" ? "entrou" : "saiu"} <b>R$ {formatBRL(kind === "income" ? totalCredit : totalDebit)}</b>.
          </>
        )
      }
    >
      <SectionRow
        icon={isUncategorized ? "bag" : "star"}
        label={
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            <span style={{ width: 10, height: 10, borderRadius: 5, background: headerColor, flexShrink: 0 }} />
            {headerName}
          </span>
        }
        action={
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <Link href={yearLink(year - 1)} style={yearNavStyle}>‹</Link>
            <span className="ap-num" style={{ fontSize: 14, color: "var(--ink)" }}>{year}</span>
            <Link href={yearLink(year + 1)} style={yearNavStyle}>›</Link>
          </div>
        }
      />

      <BigNumber
        value={`R$ ${formatBRL(kind === "income" ? totalCredit : totalDebit)}`}
        sub={
          totalCredit > 0 && totalDebit > 0
            ? `líquido R$ ${formatBRL(Math.abs(net))} ${net >= 0 ? "(entrou mais)" : "(saiu mais)"} · ${year}`
            : `total em ${year}`
        }
        accent={kind === "income"}
      />

      {/* Mini-quebra mensal */}
      {txs.length > 0 && (
        <div style={{ padding: "8px 20px 0" }}>
          <Card pad={14}>
            <div style={{ display: "flex", gap: 4, alignItems: "flex-end", height: 80 }}>
              {monthly.map((v, i) => {
                const h = (Math.abs(v) / maxMonthly) * 64;
                const isCurrent = i === now.getMonth() && year === now.getFullYear();
                return (
                  <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                    <div style={{ width: "100%", height: 64, display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
                      <div
                        title={`${MONTH_SHORT[i]}: R$ ${formatBRL(Math.abs(v))}`}
                        style={{
                          height: `${Math.max(h, v !== 0 ? 2 : 0)}px`,
                          borderRadius: 3,
                          background: isCurrent ? "var(--accent)" : headerColor,
                          opacity: v !== 0 ? 0.85 : 0.15,
                        }}
                      />
                    </div>
                    <span style={{ fontSize: 8.5, color: "var(--muted)", fontWeight: 700 }}>{MONTH_SHORT[i]}</span>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>
      )}

      <SectionRow icon="bag" label="Transações" action={`${txs.length}`} />
      {txs.length === 0 ? (
        <div style={{ padding: "0 20px 20px", fontSize: 13, color: "var(--muted)", textAlign: "center" }}>
          Nada nesse ano. Use ‹ › pra trocar de ano.
        </div>
      ) : (
        <TransactionsMultiSelect transactions={itemsForClient} categoryOptions={categoryOptions} />
      )}
    </ScreenShell>
  );
}

const yearNavStyle: React.CSSProperties = {
  padding: "2px 8px",
  borderRadius: 6,
  background: "var(--card2)",
  color: "var(--muted-d)",
  fontSize: 11,
  textDecoration: "none",
};
