import { asc, eq, sql } from "drizzle-orm";
import Link from "next/link";

import { BigNumber, Card, Pill, SectionRow } from "@/components/ap/atoms";
import { DeleteBtn, FormField, InlineForm, SubmitButton, fieldStyle } from "@/components/ap/inline-form";
import { ScreenShell } from "@/components/ap/screen-shell";
import {
  createBankAccount,
  deleteBankAccount,
} from "@/app/actions/contas";
import { auth } from "@/auth";
import { db } from "@/db";
import { bankAccounts, transactions, users } from "@/db/schema";

const TYPE_LABEL = {
  checking: "Conta corrente",
  savings: "Poupança",
  credit_card: "Cartão de crédito",
  investment: "Investimento",
  other: "Outra",
} as const;

export default async function ContasPage() {
  const session = await auth();
  if (!session?.user?.id) return null;

  const dbUser = await db.query.users.findFirst({
    where: eq(users.id, session.user.id),
  });
  if (!dbUser?.householdId) return null;

  const contas = await db.query.bankAccounts.findMany({
    where: eq(bankAccounts.householdId, dbUser.householdId),
    orderBy: [asc(bankAccounts.type), asc(bankAccounts.name)],
  });

  // Contagem + soma por conta (do mês)
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString();

  const stats = await db
    .select({
      accountId: transactions.bankAccountId,
      count: sql<number>`count(*)::int`,
      debit: sql<string>`coalesce(sum(case when ${transactions.kind} = 'debit' then ${transactions.amount}::numeric else 0 end), 0)::text`,
      credit: sql<string>`coalesce(sum(case when ${transactions.kind} = 'credit' then ${transactions.amount}::numeric else 0 end), 0)::text`,
    })
    .from(transactions)
    .where(
      sql`${transactions.householdId} = ${dbUser.householdId} AND ${transactions.status} != 'ignored' AND ${transactions.occurredOn} >= ${monthStart} AND ${transactions.occurredOn} < ${monthEnd}`
    )
    .groupBy(transactions.bankAccountId);

  const statsById = new Map(stats.map((s) => [s.accountId, s]));

  return (
    <ScreenShell
      userQ="Quais contas a gente usa?"
      insight={
        contas.length === 0 ? (
          <>Sem contas cadastradas. Adicione abaixo as suas conta corrente e cartões.</>
        ) : (
          <><b>{contas.length}</b> contas cadastradas. Use o botão "Subir PDF" e selecione uma conta na hora do upload.</>
        )
      }
    >
      <SectionRow icon="bank" label="Contas e cartões" action={`${contas.length}`} />

      <BigNumber
        value={String(contas.length)}
        sub={`${contas.filter((c) => c.type === "checking").length} CC · ${contas.filter((c) => c.type === "credit_card").length} cartões`}
      />

      <div style={{ padding: "14px 0 0" }}>
        <InlineForm buttonLabel="Cadastrar conta ou cartão">
          <form action={createBankAccount}>
              <FormField label="Nome *">
                <input
                  name="name"
                  required
                  placeholder="Ex: UNICRED · CC"
                  style={fieldStyle}
                />
              </FormField>
              <FormField label="Tipo *">
                <select name="type" defaultValue="checking" style={fieldStyle}>
                  <option value="checking">Conta corrente</option>
                  <option value="savings">Poupança</option>
                  <option value="credit_card">Cartão de crédito</option>
                  <option value="investment">Investimento</option>
                  <option value="other">Outra</option>
                </select>
              </FormField>
              <div style={{ display: "grid", gap: 8, gridTemplateColumns: "1fr 90px" }}>
                <FormField label="Instituição">
                  <input
                    name="institution"
                    placeholder="UNICRED, Santander…"
                    style={fieldStyle}
                  />
                </FormField>
                <FormField label="Final" hint="4 dígitos">
                  <input
                    name="lastFour"
                    maxLength={4}
                    placeholder="1234"
                    style={fieldStyle}
                  />
                </FormField>
              </div>
            <SubmitButton>Salvar conta</SubmitButton>
          </form>
        </InlineForm>
      </div>

      <div style={{ padding: "14px 20px 0", display: "flex", flexDirection: "column", gap: 10 }}>
        {contas.map((c) => {
          const s = statsById.get(c.id);
          return (
            <Card key={c.id} pad={14} raised={c.type === "credit_card"}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 14, fontWeight: 700 }}>{c.name}</span>
                    {c.lastFour && (
                      <span style={{ fontSize: 11, color: "var(--muted)" }}>
                        ····{c.lastFour}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 2 }}>
                    {TYPE_LABEL[c.type]}
                    {c.institution ? ` · ${c.institution}` : ""}
                  </div>
                  {s && (
                    <div style={{ fontSize: 11, color: "var(--muted-d)", marginTop: 6 }}>
                      Este mês · {s.count} transações · saldo{" "}
                      <span className="ap-num" style={{ fontSize: 12 }}>
                        R$ {(parseFloat(s.credit) - parseFloat(s.debit)).toLocaleString("pt-BR", {
                          minimumFractionDigits: 2,
                        })}
                      </span>
                    </div>
                  )}
                </div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                  <Link
                    href={`/financeiro/transacoes?account=${c.id}`}
                    style={{
                      fontSize: 11,
                      color: "var(--accent)",
                      fontWeight: 600,
                      textDecoration: "none",
                    }}
                  >
                    Ver →
                  </Link>
                  <DeleteBtn
                    action={deleteBankAccount.bind(null, c.id)}
                    confirmMsg={`Excluir "${c.name}"? Transações ficarão sem conta vinculada.`}
                  />
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {contas.length === 0 && (
        <div
          style={{
            padding: "20px",
            margin: "14px 20px 0",
            background: "var(--card)",
            borderRadius: 14,
            fontSize: 12.5,
            color: "var(--muted-d)",
            textAlign: "center",
          }}
        >
          Sem contas cadastradas. Adicione acima.
        </div>
      )}
    </ScreenShell>
  );
}
