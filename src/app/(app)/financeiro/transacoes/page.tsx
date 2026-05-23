import { and, desc, eq, gte, isNull, lte, sql } from "drizzle-orm";
import { ArrowDownRight, ArrowUpRight, Plus } from "lucide-react";
import Link from "next/link";

import { auth } from "@/auth";
import { CategorySelect, type CategoryOption } from "@/components/category-select";
import { PageHeader } from "@/components/page-header";
import { TransactionFilters } from "@/components/transaction-filters";
import { TransactionStatusToggle } from "@/components/transaction-status-toggle";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
    month: "2-digit",
    year: "2-digit",
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
  const uncategorizedCount = txs.filter((t) => !t.categoryId).length;
  const totalDebit = txs
    .filter((t) => t.kind === "debit" && t.status !== "ignored")
    .reduce((s, t) => s + parseFloat(t.amount), 0);
  const totalCredit = txs
    .filter((t) => t.kind === "credit" && t.status !== "ignored")
    .reduce((s, t) => s + parseFloat(t.amount), 0);
  const saldo = totalCredit - totalDebit;

  const hasAnyFilter = !!(sp.month || sp.status || sp.uncategorized);
  const subtitleParts: string[] = [];
  if (txs.length > 0) {
    subtitleParts.push(`${txs.length} ${txs.length === 1 ? "transação" : "transações"}${hasAnyFilter ? " filtradas" : ""}`);
    if (pendingCount > 0) subtitleParts.push(`${pendingCount} pendente${pendingCount === 1 ? "" : "s"}`);
    if (uncategorizedCount > 0) subtitleParts.push(`${uncategorizedCount} sem categoria`);
  }

  if (txs.length === 0 && availableMonths.length === 0) {
    return (
      <div className="space-y-8">
        <PageHeader title="Transações" />
        <Card className="border-dashed bg-gradient-brand-subtle">
          <CardHeader className="text-center py-12">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Plus className="size-6" />
            </div>
            <CardTitle className="mt-4">Nenhuma transação ainda</CardTitle>
            <CardDescription className="max-w-md mx-auto">
              Comece subindo um extrato bancário ou fatura de cartão. A IA
              extrai todas as transações em segundos.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center pb-8">
            <Button
              size="lg"
              render={<Link href="/financeiro/upload" />}
              className="bg-gradient-brand text-white"
            >
              Subir primeiro PDF
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="Transações"
        description={subtitleParts.join(" · ")}
        action={
          <Button
            render={<Link href="/financeiro/upload" />}
            className="bg-gradient-brand text-white"
          >
            <Plus className="size-4" />
            Subir PDF
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <SummaryCard
          label="Total despesas"
          value={formatBRL(totalDebit)}
          tone="debit"
        />
        <SummaryCard
          label="Total receitas"
          value={formatBRL(totalCredit)}
          tone="credit"
        />
        <SummaryCard
          label="Saldo"
          value={formatBRL(Math.abs(saldo))}
          tone={saldo >= 0 ? "credit" : "debit"}
          prefix={saldo >= 0 ? "+" : "−"}
        />
      </div>

      <TransactionFilters availableMonths={availableMonths} />

      {txs.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Nenhuma transação com esses filtros.
          </CardContent>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-3 text-left">Data</th>
                  <th className="px-4 py-3 text-left">Descrição</th>
                  <th className="px-4 py-3 text-right">Valor</th>
                  <th className="px-4 py-3 text-left">Categoria</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {txs.map((tx, i) => {
                  const amount = parseFloat(tx.amount);
                  return (
                    <tr
                      key={tx.id}
                      className={`border-b border-border/50 last:border-0 transition-colors hover:bg-accent/30 ${
                        tx.status === "ignored" ? "opacity-50" : ""
                      } ${i % 2 === 1 ? "bg-muted/15" : ""}`}
                    >
                      <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                        {formatDate(tx.occurredOn)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-start gap-2">
                          <span
                            className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
                              tx.kind === "debit"
                                ? "bg-destructive/10 text-destructive"
                                : "bg-success/10 text-success"
                            }`}
                          >
                            {tx.kind === "debit" ? (
                              <ArrowUpRight className="size-3.5" />
                            ) : (
                              <ArrowDownRight className="size-3.5" />
                            )}
                          </span>
                          <div className="min-w-0">
                            <div className="font-medium leading-tight">
                              {tx.description}
                            </div>
                            <div className="mt-0.5 text-[11px] text-muted-foreground line-clamp-1">
                              {tx.rawDescription}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td
                        className={`whitespace-nowrap px-4 py-3 text-right font-semibold tabular-nums ${
                          tx.kind === "debit" ? "text-destructive" : "text-success"
                        }`}
                      >
                        {tx.kind === "debit" ? "−" : "+"} R$ {formatBRL(amount)}
                      </td>
                      <td className="px-4 py-3">
                        <CategorySelect
                          transactionId={tx.id}
                          currentCategoryId={tx.categoryId}
                          options={categoryOptions}
                        />
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <StatusBadge status={tx.status} />
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right">
                        <TransactionStatusToggle
                          transactionId={tx.id}
                          status={tx.status}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  tone,
  prefix = "",
}: {
  label: string;
  value: string;
  tone: "debit" | "credit";
  prefix?: string;
}) {
  const toneClass =
    tone === "debit"
      ? "from-destructive/10 to-destructive/5 text-destructive border-destructive/20"
      : "from-success/10 to-success/5 text-success border-success/20";
  return (
    <div
      className={`rounded-xl border bg-gradient-to-br ${toneClass} p-5 shadow-card`}
    >
      <p className="text-xs font-medium uppercase tracking-wider opacity-80">
        {label}
      </p>
      <p className="mt-2 text-3xl font-semibold tracking-tight tabular-nums">
        {prefix && <span className="mr-1">{prefix}</span>}
        <span className="text-base font-medium opacity-70">R$ </span>
        {value}
      </p>
    </div>
  );
}

function StatusBadge({
  status,
}: {
  status: "pending" | "confirmed" | "ignored";
}) {
  const classes = {
    pending: "bg-warning/15 text-warning-foreground/90 ring-warning/25",
    confirmed: "bg-success/15 text-success ring-success/25",
    ignored: "bg-muted text-muted-foreground ring-border",
  } as const;
  const labels = {
    pending: "Pendente",
    confirmed: "Confirmada",
    ignored: "Ignorada",
  } as const;
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium ring-1 ring-inset ${classes[status]}`}
    >
      {labels[status]}
    </span>
  );
}
