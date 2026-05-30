import { asc, eq, sql } from "drizzle-orm";
import Link from "next/link";

import { BigNumber, Card, Pill, SectionRow } from "@/components/ap/atoms";
import { BackButton, DeleteBtn, FormField, InlineForm, SubmitButton, fieldStyle } from "@/components/ap/inline-form";
import { InlineEditInput } from "@/components/ap/inline-edit-input";
import { ScreenShell } from "@/components/ap/screen-shell";
import {
  createBankAccount,
  deleteBankAccount,
  patchBankAccount,
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

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString();

  // 2 queries em paralelo
  const [contas, stats] = await Promise.all([
    db.query.bankAccounts.findMany({
      where: eq(bankAccounts.householdId, dbUser.householdId),
      orderBy: [asc(bankAccounts.type), asc(bankAccounts.name)],
    }),
    db
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
      .groupBy(transactions.bankAccountId),
  ]);

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
      <div style={{ padding: "0 20px 8px" }}>
        <BackButton href="/financeiro" label="Financeiro" />
      </div>

      <SectionRow icon="bank" label="Contas e cartões" action={`${contas.length}`} />

      <BigNumber
        value={String(contas.length)}
        sub={`${contas.filter((c) => c.type === "checking").length} CC · ${contas.filter((c) => c.type === "credit_card").length} cartões`}
      />

      {/* Lista de contas-mãe pra vincular cartões */}
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
              <FormField
                label="Conta-mãe"
                hint="só pra cartão de crédito — qual conta paga a fatura"
              >
                <select name="parentAccountId" defaultValue="" style={fieldStyle}>
                  <option value="">(nenhuma · ignora pra contas raiz)</option>
                  {contas
                    .filter((c) => c.type !== "credit_card")
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                        {c.lastFour ? ` ····${c.lastFour}` : ""}
                      </option>
                    ))}
                </select>
              </FormField>
              <div style={{ display: "grid", gap: 8, gridTemplateColumns: "1fr 90px" }}>
                <FormField label="Instituição">
                  <input
                    name="institution"
                    list="banco-options"
                    placeholder="comece a digitar..."
                    style={fieldStyle}
                  />
                  <datalist id="banco-options">
                    <option value="UNICRED" />
                    <option value="Sicredi" />
                    <option value="Santander" />
                    <option value="Nubank" />
                    <option value="Itaú" />
                    <option value="Bradesco" />
                    <option value="Banco do Brasil" />
                    <option value="Caixa" />
                    <option value="Inter" />
                    <option value="C6" />
                    <option value="BTG Pactual" />
                  </datalist>
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

      <ContasList contas={contas} statsById={statsById} />

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

function ContasList({
  contas,
  statsById,
}: {
  contas: (typeof bankAccounts.$inferSelect)[];
  statsById: Map<
    string | null,
    { count: number; debit: string; credit: string; accountId: string | null }
  >;
}) {
  const roots = contas.filter((c) => c.type !== "credit_card");
  const cards = contas.filter((c) => c.type === "credit_card");
  const cardsByParent = new Map<string, typeof contas>();
  for (const card of cards) {
    if (card.parentAccountId) {
      const arr = cardsByParent.get(card.parentAccountId) ?? [];
      arr.push(card);
      cardsByParent.set(card.parentAccountId, arr);
    }
  }
  const orphans = cards.filter((c) => !c.parentAccountId);
  const parentOptions = roots.map((c) => ({
    id: c.id,
    label: `${c.name}${c.lastFour ? ` ····${c.lastFour}` : ""}`,
  }));

  return (
    <div style={{ padding: "14px 20px 0", display: "flex", flexDirection: "column", gap: 14 }}>
      {roots.map((c) => {
        const children = cardsByParent.get(c.id) ?? [];
        return (
          <div key={c.id} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <ContaCard conta={c} stats={statsById.get(c.id) ?? null} parentOptions={parentOptions} />
            {children.length > 0 && (
              <div style={{ paddingLeft: 14, display: "flex", flexDirection: "column", gap: 8 }}>
                {children.map((card) => (
                  <ContaCard
                    key={card.id}
                    conta={card}
                    stats={statsById.get(card.id) ?? null}
                    parentOptions={parentOptions}
                    nested
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}
      {orphans.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div
            style={{
              fontSize: 9.5,
              fontWeight: 800,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: "var(--muted)",
              padding: "8px 0 0",
            }}
          >
            cartões sem conta-mãe
          </div>
          {orphans.map((card) => (
            <ContaCard
              key={card.id}
              conta={card}
              stats={statsById.get(card.id) ?? null}
              parentOptions={parentOptions}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ContaCard({
  conta: c,
  stats: s,
  parentOptions,
  nested = false,
}: {
  conta: typeof bankAccounts.$inferSelect;
  stats: { count: number; debit: string; credit: string } | null;
  parentOptions: { id: string; label: string }[];
  nested?: boolean;
}) {
  return (
    <Card pad={14} raised={c.type === "credit_card" && !nested}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <InlineEditInput
                initialValue={c.name}
                action={patchBankAccount}
                hiddenFields={{ id: c.id }}
                fieldName="name"
                fontSize={14}
                fontWeight={700}
              />
            </div>
            <span style={{ fontSize: 11, color: "var(--muted)" }}>····</span>
            <div style={{ width: 50 }}>
              <InlineEditInput
                initialValue={c.lastFour ?? ""}
                action={patchBankAccount}
                hiddenFields={{ id: c.id }}
                fieldName="lastFour"
                placeholder="1234"
                fontSize={11}
                color="var(--muted)"
              />
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 2 }}>
            <Pill tone="muted">{TYPE_LABEL[c.type]}</Pill>
            <InlineEditInput
              initialValue={c.institution ?? ""}
              action={patchBankAccount}
              hiddenFields={{ id: c.id }}
              fieldName="institution"
              placeholder="+ instituição"
              fontSize={11.5}
              color="var(--muted-d)"
            />
          </div>
          {/* Re-vincular cartão a outra conta-mãe */}
          {c.type === "credit_card" && parentOptions.length > 0 && (
            <form
              action={patchBankAccount}
              style={{
                marginTop: 6,
                display: "flex",
                gap: 6,
                alignItems: "center",
              }}
            >
              <input type="hidden" name="id" value={c.id} />
              <select
                name="parentAccountId"
                defaultValue={c.parentAccountId ?? ""}
                style={{
                  ...fieldStyle,
                  padding: "4px 8px",
                  fontSize: 11.5,
                  background: "var(--card2)",
                  flex: 1,
                }}
              >
                <option value="">sem conta-mãe</option>
                {parentOptions.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                style={{
                  padding: "5px 10px",
                  borderRadius: 8,
                  background: "var(--card2)",
                  color: "var(--ink)",
                  border: "0.5px solid var(--line-d)",
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                vincular
              </button>
            </form>
          )}
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
            confirmMsg={null}
          />
        </div>
      </div>
    </Card>
  );
}

