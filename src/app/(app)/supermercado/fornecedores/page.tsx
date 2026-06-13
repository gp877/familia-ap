import { asc, eq } from "drizzle-orm";

import { BigNumber, SectionRow } from "@/components/ap/atoms";
import { DeleteBtn, FormField, InlineForm, SubmitButton, fieldStyle } from "@/components/ap/inline-form";
import { InlineEditInput } from "@/components/ap/inline-edit-input";
import { ScreenShell } from "@/components/ap/screen-shell";
import {
  createFornecedor,
  deleteFornecedor,
  patchFornecedor,
} from "@/app/actions/supermercado";
import { auth } from "@/auth";
import { db } from "@/db";
import { supermercadoFornecedores, users } from "@/db/schema";

export default async function FornecedoresPage() {
  const session = await auth();
  if (!session?.user?.id) return null;
  const dbUser = await db.query.users.findFirst({
    where: eq(users.id, session.user.id),
  });
  if (!dbUser?.householdId) return null;

  const fornecedores = await db.query.supermercadoFornecedores.findMany({
    where: eq(supermercadoFornecedores.householdId, dbUser.householdId),
    orderBy: [asc(supermercadoFornecedores.name)],
  });

  return (
    <ScreenShell
      userQ="Pra quem mandamos os pedidos?"
      insight={
        fornecedores.length === 0 ? (
          <>Cadastre os supermercados que recebem o pedido. E-mail e WhatsApp ficam guardados pra envio rápido.</>
        ) : (
          <>
            <b>{fornecedores.length}</b> {fornecedores.length === 1 ? "fornecedor" : "fornecedores"} cadastrados.
          </>
        )
      }
    >
      <SectionRow icon="bag" label="Fornecedores" action={`${fornecedores.length}`} />

      <BigNumber
        value={String(fornecedores.length)}
        sub="supermercados cadastrados"
      />

      {/* Form de cadastro */}
      <div style={{ padding: "12px 0 0" }}>
        <InlineForm buttonLabel="+ cadastrar fornecedor">
          <form action={createFornecedor}>
            <FormField label="Nome *">
              <input
                name="name"
                required
                autoFocus
                placeholder="Ex: Hortifruti Central"
                style={fieldStyle}
              />
            </FormField>
            <FormField label="E-mail">
              <input
                type="email"
                name="email"
                placeholder="pedidos@fornecedor.com"
                style={fieldStyle}
              />
            </FormField>
            <FormField label="WhatsApp" hint="com DDD, sem espaços">
              <input
                name="whatsapp"
                placeholder="84988887777"
                style={fieldStyle}
              />
            </FormField>
            <FormField label="Notas">
              <textarea name="notes" rows={2} style={fieldStyle} />
            </FormField>
            <SubmitButton>Salvar fornecedor</SubmitButton>
          </form>
        </InlineForm>
      </div>

      {/* Lista editável inline */}
      <div style={{ padding: "20px 16px 0", display: "flex", flexDirection: "column", gap: 10 }}>
        {fornecedores.length === 0 ? (
          <div style={{ fontSize: 13, color: "var(--muted)", textAlign: "center", padding: "20px 0" }}>
            Sem fornecedores ainda.
          </div>
        ) : (
          fornecedores.map((f) => (
            <div
              key={f.id}
              style={{
                background: "var(--card)",
                borderRadius: 14,
                border: "0.5px solid var(--line-d)",
                padding: 14,
                display: "flex",
                flexDirection: "column",
                gap: 8,
              }}
            >
              <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <InlineEditInput
                    initialValue={f.name}
                    action={patchFornecedor}
                    hiddenFields={{ id: f.id }}
                    fieldName="name"
                    fontSize={15}
                    fontWeight={700}
                  />
                </div>
                <DeleteBtn
                  action={deleteFornecedor.bind(null, f.id)}
                  confirmMsg={null}
                />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <div className="ap-eyebrow" style={{ marginBottom: 2 }}>e-mail</div>
                  <InlineEditInput
                    initialValue={f.email ?? ""}
                    action={patchFornecedor}
                    hiddenFields={{ id: f.id }}
                    fieldName="email"
                    placeholder="—"
                    fontSize={12}
                    color="var(--muted-d)"
                  />
                </div>
                <div>
                  <div className="ap-eyebrow" style={{ marginBottom: 2 }}>whatsapp</div>
                  <InlineEditInput
                    initialValue={f.whatsapp ?? ""}
                    action={patchFornecedor}
                    hiddenFields={{ id: f.id }}
                    fieldName="whatsapp"
                    placeholder="—"
                    fontSize={12}
                    color="var(--muted-d)"
                  />
                </div>
              </div>
              {(f.email || f.whatsapp) && (
                <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                  {f.email && (
                    <a
                      href={`mailto:${f.email}`}
                      style={{
                        padding: "4px 10px",
                        borderRadius: 999,
                        background: "var(--card2)",
                        color: "var(--ink-d)",
                        textDecoration: "none",
                        fontSize: 10.5,
                        fontWeight: 700,
                      }}
                    >
                      ✉ enviar e-mail
                    </a>
                  )}
                  {f.whatsapp && (
                    <a
                      href={`https://wa.me/55${(f.whatsapp || "").replace(/\D/g, "")}`}
                      target="_blank"
                      rel="noopener"
                      style={{
                        padding: "4px 10px",
                        borderRadius: 999,
                        background: "var(--card2)",
                        color: "var(--ink-d)",
                        textDecoration: "none",
                        fontSize: 10.5,
                        fontWeight: 700,
                      }}
                    >
                      💬 whatsapp
                    </a>
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </ScreenShell>
  );
}
