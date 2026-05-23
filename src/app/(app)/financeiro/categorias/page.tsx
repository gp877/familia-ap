import { eq, sql } from "drizzle-orm";

import { auth } from "@/auth";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { db } from "@/db";
import { categories, transactions, users } from "@/db/schema";

export default async function CategoriasPage() {
  const session = await auth();
  if (!session?.user?.id) return null;

  const dbUser = await db.query.users.findFirst({
    where: eq(users.id, session.user.id),
  });
  if (!dbUser?.householdId) return null;

  // Pega todas categorias com contagem de transações
  const all = await db.query.categories.findMany({
    where: eq(categories.householdId, dbUser.householdId),
    orderBy: (c, { asc }) => [asc(c.kind), asc(c.name)],
  });

  const counts = await db
    .select({
      categoryId: transactions.categoryId,
      count: sql<number>`count(*)::int`,
    })
    .from(transactions)
    .where(eq(transactions.householdId, dbUser.householdId))
    .groupBy(transactions.categoryId);

  const countByCategory = new Map<string, number>();
  for (const c of counts) {
    if (c.categoryId) countByCategory.set(c.categoryId, c.count);
  }

  // Agrupa por kind, depois por parent
  const expenseParents = all.filter((c) => c.kind === "expense" && !c.parentId);
  const incomeParents = all.filter((c) => c.kind === "income" && !c.parentId);

  function childrenOf(parentId: string) {
    return all.filter((c) => c.parentId === parentId);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Categorias</h1>
        <p className="text-muted-foreground">
          {all.length} categorias no total. Toda categoria recebe transações automaticamente quando você edita na lista (vira uma regra).
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Despesas</CardTitle>
            <CardDescription>{expenseParents.length} categorias principais</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {expenseParents.map((parent) => {
              const subs = childrenOf(parent.id);
              const parentCount = countByCategory.get(parent.id) ?? 0;
              return (
                <div key={parent.id} className="border-b pb-2 last:border-0">
                  <div className="flex items-center justify-between font-medium">
                    <span>{parent.name}</span>
                    {parentCount > 0 && (
                      <span className="text-xs text-muted-foreground">
                        {parentCount} {parentCount === 1 ? "transação" : "transações"}
                      </span>
                    )}
                  </div>
                  {subs.length > 0 && (
                    <ul className="mt-1 ml-3 space-y-0.5 text-sm text-muted-foreground">
                      {subs.map((sub) => {
                        const subCount = countByCategory.get(sub.id) ?? 0;
                        return (
                          <li key={sub.id} className="flex items-center justify-between">
                            <span>↳ {sub.name}</span>
                            {subCount > 0 && (
                              <span className="text-xs">
                                {subCount} {subCount === 1 ? "transação" : "transações"}
                              </span>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Receitas</CardTitle>
            <CardDescription>{incomeParents.length} categorias</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {incomeParents.map((parent) => {
              const count = countByCategory.get(parent.id) ?? 0;
              return (
                <div key={parent.id} className="flex items-center justify-between border-b pb-2 last:border-0">
                  <span className="font-medium">{parent.name}</span>
                  {count > 0 && (
                    <span className="text-xs text-muted-foreground">
                      {count} {count === 1 ? "transação" : "transações"}
                    </span>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Em breve</CardTitle>
          <CardDescription>
            CRUD completo de categorias (criar/renomear/deletar, reorganizar
            hierarquia, escolher cor/ícone). Gestão de regras de
            auto-categorização também.
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
