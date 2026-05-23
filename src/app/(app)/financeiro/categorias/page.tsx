import { eq, sql } from "drizzle-orm";

import { auth } from "@/auth";
import { PageHeader } from "@/components/page-header";
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

  const expenseParents = all.filter((c) => c.kind === "expense" && !c.parentId);
  const incomeParents = all.filter((c) => c.kind === "income" && !c.parentId);

  function childrenOf(parentId: string) {
    return all.filter((c) => c.parentId === parentId);
  }

  function totalForCategoryTree(categoryId: string): number {
    let total = countByCategory.get(categoryId) ?? 0;
    for (const child of childrenOf(categoryId)) {
      total += countByCategory.get(child.id) ?? 0;
    }
    return total;
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="Categorias"
        description={`${all.length} categorias no total. Cada vez que você edita a categoria de uma transação, o sistema cria uma regra automática pra próximas com mesma descrição.`}
      />

      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-destructive" />
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Despesas
          </h2>
          <span className="text-xs text-muted-foreground">
            {expenseParents.length} categorias
          </span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {expenseParents.map((parent) => {
            const subs = childrenOf(parent.id);
            const tree = totalForCategoryTree(parent.id);
            return (
              <Card key={parent.id} className="h-full">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle className="text-base">{parent.name}</CardTitle>
                    {tree > 0 && (
                      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                        {tree}
                      </span>
                    )}
                  </div>
                </CardHeader>
                {subs.length > 0 && (
                  <CardContent className="pt-0">
                    <ul className="space-y-1 text-sm">
                      {subs.map((sub) => {
                        const c = countByCategory.get(sub.id) ?? 0;
                        return (
                          <li
                            key={sub.id}
                            className="flex items-center justify-between text-muted-foreground"
                          >
                            <span>{sub.name}</span>
                            {c > 0 && (
                              <span className="text-xs font-medium text-foreground">
                                {c}
                              </span>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-success" />
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Receitas
          </h2>
          <span className="text-xs text-muted-foreground">
            {incomeParents.length} categorias
          </span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {incomeParents.map((parent) => {
            const count = countByCategory.get(parent.id) ?? 0;
            return (
              <Card key={parent.id}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle className="text-base">{parent.name}</CardTitle>
                    {count > 0 && (
                      <span className="rounded-full bg-success/10 px-2 py-0.5 text-[11px] font-medium text-success">
                        {count}
                      </span>
                    )}
                  </div>
                </CardHeader>
              </Card>
            );
          })}
        </div>
      </section>

      <Card className="border-dashed bg-muted/30">
        <CardHeader>
          <CardTitle className="text-base">Em breve</CardTitle>
          <CardDescription>
            CRUD completo — criar/renomear/deletar categorias, reorganizar
            hierarquia, escolher cor e ícone, gerenciar regras de
            auto-categorização.
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
