import { eq, sql } from "drizzle-orm";

import { BigNumber, Card, SectionRow } from "@/components/ap/atoms";
import { DeleteBtn, FormField, InlineForm, SubmitButton, fieldStyle } from "@/components/ap/inline-form";
import { ScreenShell } from "@/components/ap/screen-shell";
import {
  createCategoria,
  deleteCategoria,
} from "@/app/actions/categorias";
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
  function tree(id: string): number {
    let t = countByCategory.get(id) ?? 0;
    for (const c of childrenOf(id)) t += countByCategory.get(c.id) ?? 0;
    return t;
  }

  return (
    <ScreenShell
      userQ="Quero gerenciar nossas categorias"
      insight={
        <>
          <b>{all.length}</b> categorias no total. Quando você edita uma transação, a categoria escolhida vira regra automática pra próximas iguais.
        </>
      }
    >
      <SectionRow icon="bag" label="Categorias" action={`${all.length}`} />
      <BigNumber
        value={String(all.length)}
        sub={`${expenseParents.length} despesas (categoria mãe) · ${incomeParents.length} receitas`}
      />

      <div style={{ padding: "14px 0 0" }}>
        <InlineForm buttonLabel="Criar categoria">
          <form action={createCategoria}>
              <FormField label="Nome *">
                <input name="name" required placeholder="Ex: Combustível" style={fieldStyle} />
              </FormField>
              <FormField label="Tipo *">
                <select name="kind" defaultValue="expense" style={fieldStyle}>
                  <option value="expense">Despesa</option>
                  <option value="income">Receita</option>
                </select>
              </FormField>
              <FormField label="Subcategoria de…" hint="opcional · deixe vazio pra categoria principal">
                <select name="parentId" defaultValue="" style={fieldStyle}>
                  <option value="">— principal —</option>
                  {[...expenseParents, ...incomeParents].map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </FormField>
              <FormField label="Cor (hex)">
                <input name="color" placeholder="#B8FF5C" style={fieldStyle} />
              </FormField>
            <SubmitButton>Criar categoria</SubmitButton>
          </form>
        </InlineForm>
      </div>

      <SectionRow icon="bag" label="Despesas" action={`${expenseParents.length}`} />
      <div style={{ padding: "0 20px", display: "flex", flexDirection: "column", gap: 8 }}>
        {expenseParents.map((parent) => {
          const subs = childrenOf(parent.id);
          const t = tree(parent.id);
          return (
            <Card key={parent.id} pad={12} raised={t > 0}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <span style={{ fontSize: 13.5, fontWeight: 600 }}>{parent.name}</span>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {t > 0 && (
                    <span
                      className="ap-num"
                      style={{ fontSize: 13, color: "var(--accent)" }}
                    >
                      {t}
                    </span>
                  )}
                  <DeleteBtn
                    action={deleteCategoria.bind(null, parent.id)}
                    confirmMsg={`Excluir "${parent.name}"? Transações ficarão sem categoria.`}
                  />
                </div>
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
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 6,
                          padding: "3px 9px",
                          borderRadius: 999,
                          fontSize: 11,
                          background: "var(--card2)",
                          color: sc > 0 ? "var(--ink-d)" : "var(--muted)",
                        }}
                      >
                        {sub.name}
                        {sc > 0 && <span style={{ opacity: 0.6 }}>· {sc}</span>}
                      </span>
                    );
                  })}
                </div>
              )}
            </Card>
          );
        })}
      </div>

      <SectionRow icon="bag" label="Receitas" action={`${incomeParents.length}`} />
      <div style={{ padding: "0 20px", display: "flex", flexDirection: "column", gap: 8 }}>
        {incomeParents.map((parent) => {
          const t = tree(parent.id);
          return (
            <Card key={parent.id} pad={12} raised={t > 0}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <span style={{ fontSize: 13.5, fontWeight: 600 }}>{parent.name}</span>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {t > 0 && (
                    <span className="ap-num" style={{ fontSize: 13, color: "var(--ok)" }}>
                      {t}
                    </span>
                  )}
                  <DeleteBtn
                    action={deleteCategoria.bind(null, parent.id)}
                    confirmMsg={`Excluir "${parent.name}"?`}
                  />
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </ScreenShell>
  );
}
