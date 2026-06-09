import { asc, eq, sql } from "drizzle-orm";
import Link from "next/link";

import { BigNumber, SectionRow } from "@/components/ap/atoms";
import { BackButton } from "@/components/ap/inline-form";
import { ScreenShell } from "@/components/ap/screen-shell";
import { SortableList } from "@/components/ap/sortable-list";
import { reorderCategoriasForm } from "@/app/actions/categorias";
import { auth } from "@/auth";
import { db } from "@/db";
import { categories, transactions, users } from "@/db/schema";
import { CategoryCard } from "./category-card";
import { CompactView } from "./compact-view";
import { QuickAdd } from "./quick-add";

type SearchParams = Promise<{ view?: string }>;

export default async function CategoriasPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = await searchParams;
  const isCompact = sp.view === "compact";

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
      notes: c.notes,
    };
  }

  // Versão "magra" pra serializar e mandar pro client da visão compacta —
  // sem campos como sortOrder, createdAt etc que não importam ali.
  function serializeCat(c: typeof all[number]) {
    return {
      id: c.id,
      name: c.name,
      kind: c.kind,
      color: c.color,
      parentId: c.parentId,
      notes: c.notes,
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

      <SectionRow
        icon="bag"
        label="Categorias"
        action={
          <a
            href="/financeiro/categorias/regras"
            style={{
              fontSize: 11,
              fontWeight: 600,
              padding: "4px 10px",
              borderRadius: 999,
              border: "0.5px solid var(--line-d)",
              color: "var(--muted-d)",
              textDecoration: "none",
            }}
          >
            regras →
          </a>
        }
      />
      <BigNumber
        value={String(all.length)}
        sub={`${expenseParents.length} despesas · ${incomeParents.length} receitas`}
      />

      {/* Cadastro rápido — único formulário de criação. Suporta principal
          ou subcategoria (select de pai). Atalho Alt+Enter pra focar. */}
      <div style={{ marginTop: 14 }}>
        <QuickAdd
          parents={[...expenseParents, ...incomeParents].map((p) => ({
            id: p.id,
            name: p.name,
            kind: p.kind,
          }))}
        />
      </div>

      {/* Toggle de visualização */}
      <div style={{ padding: "0 20px 12px", display: "flex", gap: 4, justifyContent: "flex-end" }}>
        <Link href="/financeiro/categorias" style={toggleStyle(!isCompact)}>
          Detalhada
        </Link>
        <Link href="/financeiro/categorias?view=compact" style={toggleStyle(isCompact)}>
          Compacta
        </Link>
      </div>

      {isCompact ? (
        <CompactView
          expenseParents={expenseParents.map(serializeCat)}
          incomeParents={incomeParents.map(serializeCat)}
          childrenByParent={Object.fromEntries(
            [...expenseParents, ...incomeParents].map((p) => [
              p.id,
              childrenOf(p.id).map(serializeCat),
            ])
          )}
          countByCategory={Object.fromEntries(countByCategory.entries())}
        />
      ) : (
        <>
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
                action={reorderCategoriasForm}
                items={expenseParents.map((cat) => ({
                  id: cat.id,
                  content: (
                    <CategoryCard
                      cat={toCardLite(cat)}
                      subs={childrenOf(cat.id).map(toCardLite)}
                      totalCount={totalCount(cat.id)}
                      mergeOptions={mergeOptionsFor(cat.id, "expense")}
                    />
                  ),
                }))}
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
                action={reorderCategoriasForm}
                items={incomeParents.map((cat) => ({
                  id: cat.id,
                  content: (
                    <CategoryCard
                      cat={toCardLite(cat)}
                      subs={childrenOf(cat.id).map(toCardLite)}
                      totalCount={totalCount(cat.id)}
                      mergeOptions={mergeOptionsFor(cat.id, "income")}
                    />
                  ),
                }))}
              />
            ) : (
              <EmptyHint text="Sem categorias de receita ainda." />
            )}
          </div>
        </>
      )}
    </ScreenShell>
  );
}

function toggleStyle(active: boolean): React.CSSProperties {
  return {
    padding: "4px 12px",
    borderRadius: 999,
    fontSize: 11,
    fontWeight: 700,
    background: active ? "var(--ink)" : "transparent",
    color: active ? "var(--bg)" : "var(--muted-d)",
    border: active ? "none" : "0.5px solid var(--line-d)",
    textDecoration: "none",
  };
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
