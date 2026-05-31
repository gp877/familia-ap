import { asc, eq } from "drizzle-orm";

import { BigNumber, SectionRow } from "@/components/ap/atoms";
import { BackButton } from "@/components/ap/inline-form";
import { ScreenShell } from "@/components/ap/screen-shell";
import { auth } from "@/auth";
import { db } from "@/db";
import { bankAccounts, categories, users } from "@/db/schema";

import { ManualTransactionForm } from "./manual-form";

export default async function NewTransactionPage() {
  const session = await auth();
  if (!session?.user?.id) return null;
  const dbUser = await db.query.users.findFirst({
    where: eq(users.id, session.user.id),
  });
  if (!dbUser?.householdId) return null;

  const [accounts, allCategories] = await Promise.all([
    db.query.bankAccounts.findMany({
      where: eq(bankAccounts.householdId, dbUser.householdId),
      orderBy: [asc(bankAccounts.type), asc(bankAccounts.name)],
    }),
    db.query.categories.findMany({
      where: eq(categories.householdId, dbUser.householdId),
      orderBy: [asc(categories.kind), asc(categories.name)],
    }),
  ]);

  const catById = new Map(allCategories.map((c) => [c.id, c]));
  const categoryOptions = allCategories.map((c) => ({
    id: c.id,
    label: c.parentId
      ? `${catById.get(c.parentId)?.name ?? "?"} › ${c.name}`
      : c.name,
    name: c.name,
    parentId: c.parentId,
    color: c.color ?? null,
    kind: c.kind,
  }));

  return (
    <ScreenShell
      insight={
        <>
          Lançamento avulso — pra completar uma transação que ficou faltando
          no PDF, ou registrar algo que aconteceu fora do extrato.
        </>
      }
    >
      <div style={{ padding: "0 20px 8px" }}>
        <BackButton href="/financeiro/transacoes" label="Transações" />
      </div>
      <SectionRow icon="bag" label="Lançar manualmente" />
      <BigNumber value="nova" sub="transação manual" />

      <div style={{ padding: "16px 20px" }}>
        <ManualTransactionForm
          accounts={accounts.map((a) => ({ id: a.id, name: a.name, type: a.type }))}
          categoryOptions={categoryOptions}
        />
      </div>
    </ScreenShell>
  );
}
