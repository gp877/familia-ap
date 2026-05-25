import { and, desc, eq, gte, isNull, lte, sql } from "drizzle-orm";
import Link from "next/link";

import { BigNumber, SectionRow } from "@/components/ap/atoms";
import { BackButton } from "@/components/ap/inline-form";
import { MonthChips } from "@/components/ap/month-chips";
import { ScreenShell } from "@/components/ap/screen-shell";
import { TransactionsMultiSelect } from "@/components/ap/transactions-multi-select";
import { auth } from "@/auth";
import type { CategoryOption } from "@/components/category-select";
import { db } from "@/db";
import {
  bankAccounts,
  categories,
  transactions,
  users,
} from "@/db/schema";

function formatBRL(n: number) {
  return n.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function monthBounds(yyyymm: string): { start: Date; end: Date } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(yyyymm);
  if (!m) return null;
  const year = parseInt(m[1], 10);
  const month = parseInt(m[2], 10);
  return {
    start: new Date(year, month - 1, 1),
    end: new Date(year, month, 1),
  };
}

type SearchParams = Promise<{
  month?: string;
  status?: string;
  uncategorized?: string;
  account?: string;
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

  // Mês: default = mês atual; "all" pra mostrar todos
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const selectedMonth = sp.month ?? currentMonth;
  const showAll = selectedMonth === "all";

  const conds = [eq(transactions.householdId, dbUser.householdId)];
  if (!showAll) {
    const bounds = monthBounds(selectedMonth);
    if (bounds) {
      conds.push(gte(transactions.occurredOn, bounds.start));
      conds.push(lte(transactions.occurredOn, bounds.end));
    }
  }
  if (sp.status === "pending" || sp.status === "confirmed" || sp.status === "ignored") {
    conds.push(eq(transactions.status, sp.status));
  }
  if (sp.uncategorized === "1") {
    conds.push(isNull(transactions.categoryId));
  }
  if (sp.account) {
    conds.push(eq(transactions.bankAccountId, sp.account));
  }

  const [allCategories, allAccounts, txs] = await Promise.all([
    db.query.categories.findMany({
      where: eq(categories.householdId, dbUser.householdId),
      with: { parent: true },
      orderBy: (c, { asc }) => [asc(c.name)],
    }),
    db.query.bankAccounts.findMany({
      where: eq(bankAccounts.householdId, dbUser.householdId),
      orderBy: (a, { asc }) => [asc(a.name)],
    }),
    db.query.transactions.findMany({
      where: and(...conds),
      orderBy: [desc(transactions.occurredOn), desc(transactions.createdAt)],
      limit: 500,
    }),
  ]);

  const categoryOptions: CategoryOption[] = allCategories.map((c) => ({
    id: c.id,
    label: c.parent ? `${c.parent.name} > ${c.name}` : c.name,
  }));

  const totalDebit = txs
    .filter((t) => t.kind === "debit" && t.status !== "ignored")
    .reduce((s, t) => s + parseFloat(t.amount), 0);
  const totalCredit = txs
    .filter((t) => t.kind === "credit" && t.status !== "ignored")
    .reduce((s, t) => s + parseFloat(t.amount), 0);

  const activeAccount = sp.account
    ? allAccounts.find((a) => a.id === sp.account)
    : null;

  // Total transações no DB pra mostrar "X/Y" no header
  const totalAll = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(transactions)
    .where(eq(transactions.householdId, dbUser.householdId))
    .then((r) => r[0]?.c ?? 0);

  if (totalAll === 0) {
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

  // Prepare data for client component
  const txsForClient = txs.map((tx) => ({
    id: tx.id,
    occurredOn: new Date(tx.occurredOn).toISOString(),
    description: tx.description,
    rawDescription: tx.rawDescription,
    amount: tx.amount,
    kind: tx.kind,
    categoryId: tx.categoryId,
    status: tx.status,
    bankAccountId: tx.bankAccountId,
  }));

  // Preserva params na navegação
  const preservedParams: Record<string, string | undefined> = {
    status: sp.status,
    uncategorized: sp.uncategorized,
    account: sp.account,
  };

  function statusLink(status: string | null) {
    const next = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...sp, status })) {
      if (v) next.set(k, v as string);
    }
    if (!status) next.delete("status");
    return `/financeiro/transacoes?${next.toString()}`;
  }

  return (
    <ScreenShell
      userQ={
        activeAccount ? `Quero ver os lançamentos de ${activeAccount.name}` : "Me mostra todas as transações"
      }
      insight={
        <>
          Selecione transações pra ver a soma. Clique na categoria pra editar — vira regra automática.
        </>
      }
    >
      <div style={{ padding: "0 20px 8px" }}>
        <BackButton href="/financeiro" label="Financeiro" />
      </div>

      <SectionRow
        icon="bag"
        label={activeAccount ? activeAccount.name : "Transações"}
        action={`${txs.length} de ${totalAll}`}
      />

      <MonthChips
        basePath="/financeiro/transacoes"
        currentMonth={showAll ? currentMonth : selectedMonth}
        extraParams={preservedParams}
      />

      {/* Botão "todos" */}
      <div style={{ padding: "0 20px 8px", display: "flex", gap: 6 }}>
        <Link
          href={`/financeiro/transacoes?${new URLSearchParams({ ...preservedParams, month: "all" } as Record<string, string>).toString()}`}
          style={{
            padding: "4px 12px",
            borderRadius: 999,
            fontSize: 11,
            fontWeight: 700,
            background: showAll ? "var(--accent)" : "var(--card)",
            color: showAll ? "var(--accent-on)" : "var(--muted-d)",
            textDecoration: "none",
            border: showAll ? "none" : "1px solid var(--line-d)",
          }}
        >
          Ano todo
        </Link>
      </div>

      <div style={{ padding: "0 20px" }}>
        <div className="ap-num" style={{ fontSize: 28, color: "var(--ink)" }}>
          − R$ {formatBRL(totalDebit)}
        </div>
        <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>
          em despesas · receitas: R$ {formatBRL(totalCredit)}
          {activeAccount ? ` · ${activeAccount.name}` : ""}
        </div>
      </div>

      {/* Pills de status */}
      <div style={{ padding: "12px 20px 0", display: "flex", gap: 6, flexWrap: "wrap" }}>
        {[
          { key: null, label: "Todas" },
          { key: "pending", label: "Pendentes" },
          { key: "confirmed", label: "Confirmadas" },
          { key: "ignored", label: "Ignoradas" },
        ].map((s) => {
          const isActive = (sp.status ?? null) === s.key;
          return (
            <Link
              key={s.label}
              href={statusLink(s.key)}
              style={{
                padding: "4px 12px",
                borderRadius: 999,
                fontSize: 11,
                fontWeight: 600,
                background: isActive ? "var(--card)" : "transparent",
                color: isActive ? "var(--ink)" : "var(--muted-d)",
                textDecoration: "none",
                border: "1px solid var(--line-d)",
              }}
            >
              {s.label}
            </Link>
          );
        })}
      </div>

      {/* Filtro de conta */}
      {allAccounts.length > 0 && (
        <div style={{ padding: "8px 20px 0", display: "flex", gap: 6, flexWrap: "wrap" }}>
          <Link
            href="/financeiro/transacoes"
            style={{
              padding: "4px 12px",
              borderRadius: 999,
              fontSize: 11,
              fontWeight: 600,
              background: !sp.account ? "var(--card)" : "transparent",
              color: !sp.account ? "var(--ink)" : "var(--muted-d)",
              textDecoration: "none",
              border: "1px solid var(--line-d)",
            }}
          >
            Todas as contas
          </Link>
          {allAccounts.map((a) => {
            const isActive = sp.account === a.id;
            const next = new URLSearchParams();
            for (const [k, v] of Object.entries({ ...sp, account: a.id })) {
              if (v) next.set(k, v as string);
            }
            return (
              <Link
                key={a.id}
                href={`/financeiro/transacoes?${next.toString()}`}
                style={{
                  padding: "4px 12px",
                  borderRadius: 999,
                  fontSize: 11,
                  fontWeight: 600,
                  background: isActive ? "var(--card)" : "transparent",
                  color: isActive ? "var(--ink)" : "var(--muted-d)",
                  textDecoration: "none",
                  border: "1px solid var(--line-d)",
                }}
              >
                {a.name}
              </Link>
            );
          })}
        </div>
      )}

      <div style={{ marginTop: 8 }}>
        <TransactionsMultiSelect
          transactions={txsForClient}
          categoryOptions={categoryOptions}
        />
      </div>
    </ScreenShell>
  );
}
