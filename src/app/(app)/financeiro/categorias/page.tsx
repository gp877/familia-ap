import { eq, sql } from "drizzle-orm";

import { BigNumber, Card, SectionRow } from "@/components/ap/atoms";
import { ScreenShell } from "@/components/ap/screen-shell";
import { auth } from "@/auth";
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

  function treeCount(parentId: string): number {
    let total = countByCategory.get(parentId) ?? 0;
    for (const child of childrenOf(parentId)) {
      total += countByCategory.get(child.id) ?? 0;
    }
    return total;
  }

  const totalUsed = [...expenseParents, ...incomeParents].filter(
    (c) => treeCount(c.id) > 0
  ).length;

  return (
    <ScreenShell
      userQ="Quais categorias tenho disponíveis?"
      insight={
        <>
          <b>{all.length}</b> categorias prontas pra família. Toda categoria que você atribui a uma transação vira regra automática.
        </>
      }
    >
      <SectionRow icon="bag" label="Categorias" action={`${totalUsed} em uso`} />
      <BigNumber value={String(all.length)} sub={`${expenseParents.length} despesas · ${incomeParents.length} receitas`} />

      <div style={{ padding: "14px 20px 0" }}>
        <div className="ap-eyebrow" style={{ marginBottom: 10 }}>
          despesas
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {expenseParents.map((parent) => {
            const subs = childrenOf(parent.id);
            const c = treeCount(parent.id);
            return (
              <Card key={parent.id} pad={12} raised={c > 0}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <span style={{ fontSize: 13.5, fontWeight: 600 }}>{parent.name}</span>
                  {c > 0 && (
                    <span
                      className="ap-num"
                      style={{ fontSize: 13, color: "var(--accent)" }}
                    >
                      {c}
                    </span>
                  )}
                </div>
                {subs.length > 0 && (
                  <div
                    style={{
                      marginTop: 8,
                      display: "flex",
                      gap: 6,
                      flexWrap: "wrap",
                    }}
                  >
                    {subs.map((sub) => {
                      const sc = countByCategory.get(sub.id) ?? 0;
                      return (
                        <span
                          key={sub.id}
                          style={{
                            padding: "3px 9px",
                            borderRadius: 999,
                            fontSize: 11,
                            background: "var(--card2)",
                            color: sc > 0 ? "var(--ink-d)" : "var(--muted)",
                          }}
                        >
                          {sub.name}
                          {sc > 0 && (
                            <span style={{ marginLeft: 5, opacity: 0.6 }}>· {sc}</span>
                          )}
                        </span>
                      );
                    })}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      </div>

      <div style={{ padding: "20px 20px 0" }}>
        <div className="ap-eyebrow" style={{ marginBottom: 10 }}>
          receitas
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {incomeParents.map((parent) => {
            const c = treeCount(parent.id);
            return (
              <Card key={parent.id} pad={12} raised={c > 0}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <span style={{ fontSize: 13.5, fontWeight: 600 }}>{parent.name}</span>
                  {c > 0 && (
                    <span className="ap-num" style={{ fontSize: 13, color: "var(--ok)" }}>
                      {c}
                    </span>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      </div>
    </ScreenShell>
  );
}
