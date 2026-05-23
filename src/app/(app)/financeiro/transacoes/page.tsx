import { desc, eq } from "drizzle-orm";
import Link from "next/link";

import { auth } from "@/auth";
import { CategorySelect, type CategoryOption } from "@/components/category-select";
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

function formatBRL(value: string, kind: "debit" | "credit") {
  const n = parseFloat(value);
  const sign = kind === "debit" ? "−" : "+";
  return `${sign} R$ ${n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(d: Date) {
  return new Date(d).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export default async function TransacoesPage() {
  const session = await auth();
  if (!session?.user?.id) return null;

  const dbUser = await db.query.users.findFirst({
    where: eq(users.id, session.user.id),
  });
  if (!dbUser?.householdId) return null;

  const [allCategories, txs] = await Promise.all([
    db.query.categories.findMany({
      where: eq(categories.householdId, dbUser.householdId),
      with: { parent: true },
      orderBy: (c, { asc }) => [asc(c.name)],
    }),
    db.query.transactions.findMany({
      where: eq(transactions.householdId, dbUser.householdId),
      orderBy: [desc(transactions.occurredOn), desc(transactions.createdAt)],
      with: { category: true },
      limit: 500,
    }),
  ]);

  // Build hierarchical labels: "Parent > Child"
  const categoryOptions: CategoryOption[] = allCategories.map((c) => ({
    id: c.id,
    label: c.parent ? `${c.parent.name} > ${c.name}` : c.name,
  }));

  if (txs.length === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Transações</h1>
          <p className="text-muted-foreground">
            Nenhuma transação ainda. Comece subindo um PDF.
          </p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Comece por aqui</CardTitle>
            <CardDescription>
              Suba um extrato bancário ou fatura de cartão. A IA extrai e
              categoriza pra você.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button render={<Link href="/financeiro/upload" />}>Subir PDF</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Stats rápidos
  const pendingCount = txs.filter((t) => t.status === "pending").length;
  const uncategorizedCount = txs.filter((t) => !t.categoryId).length;
  const totalDebit = txs
    .filter((t) => t.kind === "debit" && t.status !== "ignored")
    .reduce((sum, t) => sum + parseFloat(t.amount), 0);
  const totalCredit = txs
    .filter((t) => t.kind === "credit" && t.status !== "ignored")
    .reduce((sum, t) => sum + parseFloat(t.amount), 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Transações</h1>
          <p className="text-muted-foreground">
            {txs.length} transações no total — {pendingCount} pendentes, {uncategorizedCount} sem categoria.
          </p>
        </div>
        <Link href="/financeiro/upload">
          <Button>Subir outro PDF</Button>
        </Link>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total despesas</CardDescription>
            <CardTitle className="text-2xl text-red-600">
              R$ {totalDebit.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total receitas</CardDescription>
            <CardTitle className="text-2xl text-green-600">
              R$ {totalCredit.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Saldo</CardDescription>
            <CardTitle className={`text-2xl ${totalCredit - totalDebit >= 0 ? "text-green-600" : "text-red-600"}`}>
              R$ {(totalCredit - totalDebit).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr className="border-b">
                <th className="px-3 py-2 text-left font-medium">Data</th>
                <th className="px-3 py-2 text-left font-medium">Descrição</th>
                <th className="px-3 py-2 text-right font-medium">Valor</th>
                <th className="px-3 py-2 text-left font-medium">Categoria</th>
                <th className="px-3 py-2 text-left font-medium">Status</th>
                <th className="px-3 py-2 text-right font-medium">Ações</th>
              </tr>
            </thead>
            <tbody>
              {txs.map((tx) => (
                <tr
                  key={tx.id}
                  className={`border-b last:border-0 ${tx.status === "ignored" ? "opacity-40" : ""}`}
                >
                  <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">
                    {formatDate(tx.occurredOn)}
                  </td>
                  <td className="px-3 py-2">
                    <div className="font-medium">{tx.description}</div>
                    <div className="text-xs text-muted-foreground line-clamp-1">
                      {tx.rawDescription}
                    </div>
                  </td>
                  <td
                    className={`px-3 py-2 whitespace-nowrap text-right font-medium ${tx.kind === "debit" ? "text-red-600" : "text-green-600"}`}
                  >
                    {formatBRL(tx.amount, tx.kind)}
                  </td>
                  <td className="px-3 py-2">
                    <CategorySelect
                      transactionId={tx.id}
                      currentCategoryId={tx.categoryId}
                      options={categoryOptions}
                    />
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                        tx.status === "confirmed"
                          ? "bg-green-100 text-green-700"
                          : tx.status === "ignored"
                            ? "bg-zinc-100 text-zinc-600"
                            : "bg-amber-100 text-amber-700"
                      }`}
                    >
                      {tx.status === "confirmed"
                        ? "Confirmada"
                        : tx.status === "ignored"
                          ? "Ignorada"
                          : "Pendente"}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <TransactionStatusToggle
                      transactionId={tx.id}
                      status={tx.status}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
