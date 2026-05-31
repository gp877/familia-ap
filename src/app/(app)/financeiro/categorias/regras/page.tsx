import { asc, eq } from "drizzle-orm";

import { BigNumber, Card, SectionRow } from "@/components/ap/atoms";
import { BackButton } from "@/components/ap/inline-form";
import { ScreenShell } from "@/components/ap/screen-shell";
import { auth } from "@/auth";
import { db } from "@/db";
import { categories, categoryRules, users } from "@/db/schema";

import { RuleRow } from "./rule-row";

export default async function CategoryRulesPage() {
  const session = await auth();
  if (!session?.user?.id) return null;

  const dbUser = await db.query.users.findFirst({
    where: eq(users.id, session.user.id),
  });
  if (!dbUser?.householdId) return null;

  const [rules, allCategories] = await Promise.all([
    db.query.categoryRules.findMany({
      where: eq(categoryRules.householdId, dbUser.householdId),
      orderBy: [asc(categoryRules.matchType), asc(categoryRules.pattern)],
    }),
    db.query.categories.findMany({
      where: eq(categories.householdId, dbUser.householdId),
      orderBy: [asc(categories.kind), asc(categories.name)],
    }),
  ]);

  const catById = new Map(allCategories.map((c) => [c.id, c]));
  const catOptions = allCategories.map((c) => ({
    id: c.id,
    label: c.parentId
      ? `${catById.get(c.parentId)?.name ?? "?"} › ${c.name}`
      : c.name,
    name: c.name,
    parentId: c.parentId,
    color: c.color ?? null,
    kind: c.kind,
  }));

  const active = rules.filter((r) => r.isActive).length;
  const inactive = rules.length - active;

  return (
    <ScreenShell
      insight={
        rules.length === 0 ? (
          <>
            Ainda não tem regras. Quando você categorizar transações com a
            opção <b>“+ criar regras”</b> no rodapé da lista de transações,
            elas aparecem aqui.
          </>
        ) : (
          <>
            <b>{rules.length}</b>{" "}
            {rules.length === 1 ? "regra cadastrada" : "regras cadastradas"} ·{" "}
            {active} {active === 1 ? "ativa" : "ativas"}
            {inactive > 0 ? `, ${inactive} desativada${inactive === 1 ? "" : "s"}` : ""}.
            Regras automaticamente categorizam novas transações cujo texto bate
            com o padrão.
          </>
        )
      }
    >
      <div style={{ padding: "0 20px 8px" }}>
        <BackButton href="/financeiro/categorias" label="Categorias" />
      </div>

      <SectionRow icon="bag" label="Regras de categorização" action={`${rules.length}`} />
      <BigNumber
        value={String(rules.length)}
        sub={
          rules.length === 0
            ? "nenhuma regra"
            : `${active} ativa${active === 1 ? "" : "s"}${inactive > 0 ? ` · ${inactive} pausada${inactive === 1 ? "" : "s"}` : ""}`
        }
      />

      <div style={{ padding: "10px 20px" }}>
        {rules.length === 0 ? (
          <Card pad={16}>
            <div style={{ fontSize: 13, color: "var(--muted-d)", lineHeight: 1.5 }}>
              <p style={{ marginBottom: 8 }}>Como criar regras:</p>
              <ol style={{ paddingLeft: 18, fontSize: 12.5 }}>
                <li>Vá em <code>/financeiro/transacoes</code></li>
                <li>Selecione transações com o checkbox</li>
                <li>Escolha uma categoria no rodapé</li>
                <li>Clique em <b>“+ criar regras”</b> em vez de <b>“só aplicar”</b></li>
              </ol>
            </div>
          </Card>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {rules.map((r) => (
              <RuleRow key={r.id} rule={r} categoryOptions={catOptions} />
            ))}
          </div>
        )}
      </div>
    </ScreenShell>
  );
}
