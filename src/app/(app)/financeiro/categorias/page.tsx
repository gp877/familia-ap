import { asc, eq, sql } from "drizzle-orm";

import { BigNumber, SectionRow } from "@/components/ap/atoms";
import {
  BackButton,
  FormField,
  InlineForm,
  SubmitButton,
  fieldStyle,
} from "@/components/ap/inline-form";
import { ScreenShell } from "@/components/ap/screen-shell";
import { SortableList } from "@/components/ap/sortable-list";
import {
  createCategoria,
  reorderCategoriasForm,
} from "@/app/actions/categorias";
import { auth } from "@/auth";
import { db } from "@/db";
import { categories, transactions, users } from "@/db/schema";
import { CategoryCard } from "./category-card";

export default async function CategoriasPage() {
  const session = await auth();
  if (!session?.user?.id) return null;

  const dbUser = await db.query.users.findFirst({
    where: eq(users.id, session.user.id),
  });
  if (!dbUser?.householdId) return null;

  const [all, counts] = await Promise.all([
    db.query.categories.findMany({
      where: eq(categories.householdId, dbUser.householdId),
      orderBy: [asc(categories.kind), asc(categories.sortOrder), asc(categories.name)],
    }),
    db
      .select({
        categoryId: transactions.categoryId,
        count: sql<number>`count(*)::int`,
      })
      .from(transactions)
      .where(eq(transactions.householdId, dbUser.householdId))
      .groupBy(transactions.categoryId),
  ]);

  const countByCategory = new Map<string, number>();
  for (const c of counts) {
    if (c.categoryId) countByCategory.set(c.categoryId, c.count);
  }

  const expenseParents = all.filter((c) => c.kind === "expense" && !c.parentId);
  const incomeParents = all.filter((c) => c.kind === "income" && !c.parentId);

  function childrenOf(parentId: string) {
    return all.filter((c) => c.parentId === parentId);
  }
  function totalCount(id: string): number {
    let t = countByCategory.get(id) ?? 0;
    for (const c of childrenOf(id)) t += countByCategory.get(c.id) ?? 0;
    return t;
  }

  function toCardLite(c: typeof all[number]) {
    return {
      id: c.id,
      name: c.name,
      kind: c.kind,
      color: c.color,
      parentId: c.parentId,
      txCount: countByCategory.get(c.id) ?? 0,
    };
  }

  // Opções pra "merge into" no delete: categorias do mesmo kind, exceto a própria
  function mergeOptionsFor(currentId: string, kind: "expense" | "income") {
    return all
      .filter((c) => c.kind === kind && c.id !== currentId)
      .map((c) => ({
        id: c.id,
        label: c.parentId
          ? `${all.find((p) => p.id === c.parentId)?.name ?? "?"} › ${c.name}`
          : c.name,
      }));
  }

  return (
    <ScreenShell
      insight={
        <>
          <b>{all.length}</b> categorias. Arraste pelo handle <span style={{ color: "var(--muted)" }}>⋮⋮</span> pra reordenar. Cores definem o visual em Transações, DRE e Orçamento.
        </>
      }
    >
      <div style={{ padding: "0 20px 8px" }}>
        <BackButton href="/financeiro" label="Financeiro" />
      </div>

      <SectionRow icon="bag" label="Categorias" action={`${all.length}`} />
      <BigNumber
        value={String(all.length)}
        sub={`${expenseParents.length} despesas · ${incomeParents.length} receitas`}
      />

      <div style={{ padding: "14px 0 0" }}>
        <InlineForm buttonLabel="Criar categoria">
          <form action={createCategoria}>
            <FormField label="Nome *">
              <input name="name" required placeholder="Ex: Combustível" style={fieldStyle} />
            </FormField>
            <div style={{ display: "grid", gap: 8, gridTemplateColumns: "1fr 1fr" }}>
              <FormField label="Tipo *">
                <select name="kind" defaultValue="expense" style={fieldStyle}>
                  <option value="expense">Despesa</option>
                  <option value="income">Receita</option>
                </select>
              </FormField>
              <FormField label="Cor">
                <input type="color" name="color" defaultValue="#B8FF5C" style={{ ...fieldStyle, height: 40, padding: 4 }} />
              </FormField>
            </div>
            <FormField label="Subcategoria de…" hint="opcional · deixe vazio pra categoria principal">
              <select name="parentId" defaultValue="" style={fieldStyle}>
                <option value="">— principal —</option>
                {[...expenseParents, ...incomeParents].map((p) => (
                  <option key={p.id} value={p.id}>
                    [{p.kind === "income" ? "rec" : "des"}] {p.name}
                  </option>
                ))}
              </select>
            </FormField>
            <SubmitButton>Criar categoria</SubmitButton>
          </form>
        </InlineForm>
      </div>

      {/* DESPESAS */}
      <SectionRow
        icon="bag"
        label="Despesas"
        action={
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: "var(--alert)",
              padding: "2px 8px",
              borderRadius: 999,
              background: "color-mix(in oklab, var(--alert) 18%, transparent)",
            }}
          >
            {expenseParents.length}
          </span>
        }
      />
      <div style={{ padding: "0 20px" }}>
        {expenseParents.length > 0 ? (
          <SortableList
            items={expenseParents.map((c) => ({ id: c.id }))}
            renderItem={(id) => {
              const cat = expenseParents.find((c) => c.id === id);
              if (!cat) return null;
              return (
                <CategoryCard
                  cat={toCardLite(cat)}
                  subs={childrenOf(cat.id).map(toCardLite)}
                  totalCount={totalCount(cat.id)}
                  mergeOptions={mergeOptionsFor(cat.id, "expense")}
                />
              );
            }}
            action={reorderCategoriasForm}
          />
        ) : (
          <EmptyHint text="Sem categorias de despesa ainda." />
        )}
      </div>

      {/* RECEITAS */}
      <SectionRow
        icon="bag"
        label="Receitas"
        action={
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: "var(--ok)",
              padding: "2px 8px",
              borderRadius: 999,
              background: "color-mix(in oklab, var(--ok) 18%, transparent)",
            }}
          >
            {incomeParents.length}
          </span>
        }
      />
      <div style={{ padding: "0 20px 20px" }}>
        {incomeParents.length > 0 ? (
          <SortableList
            items={incomeParents.map((c) => ({ id: c.id }))}
            renderItem={(id) => {
              const cat = incomeParents.find((c) => c.id === id);
              if (!cat) return null;
              return (
                <CategoryCard
                  cat={toCardLite(cat)}
                  subs={childrenOf(cat.id).map(toCardLite)}
                  totalCount={totalCount(cat.id)}
                  mergeOptions={mergeOptionsFor(cat.id, "income")}
                />
              );
            }}
            action={reorderCategoriasForm}
          />
        ) : (
          <EmptyHint text="Sem categorias de receita ainda." />
        )}
      </div>
    </ScreenShell>
  );
}

function EmptyHint({ text }: { text: string }) {
  return (
    <div
      style={{
        padding: "16px",
        fontSize: 12.5,
        color: "var(--muted)",
        textAlign: "center",
        background: "var(--card)",
        borderRadius: 12,
        border: "0.5px dashed var(--line-d)",
      }}
    >
      {text}
    </div>
  );
}
