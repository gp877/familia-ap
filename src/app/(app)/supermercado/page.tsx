import { asc, desc, eq, sql } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";

import { BigNumber, Card, Pill, SectionRow } from "@/components/ap/atoms";
import { DeleteBtn, FormField, InlineForm, SubmitButton, fieldStyle } from "@/components/ap/inline-form";
import { ScreenShell } from "@/components/ap/screen-shell";
import {
  createEmptyPedido,
  createItem,
  createPedidoFromShortfall,
  deleteItem,
  updateItemStock,
} from "@/app/actions/supermercado";
import { auth } from "@/auth";
import { db } from "@/db";
import { supermercadoItens, supermercadoPedidos, users } from "@/db/schema";

export default async function SupermercadoPage() {
  const session = await auth();
  if (!session?.user?.id) return null;

  const dbUser = await db.query.users.findFirst({
    where: eq(users.id, session.user.id),
  });
  if (!dbUser?.householdId) return null;

  const items = await db.query.supermercadoItens.findMany({
    where: eq(supermercadoItens.householdId, dbUser.householdId),
    orderBy: [asc(supermercadoItens.category), asc(supermercadoItens.name)],
  });

  const pedidos = await db.query.supermercadoPedidos.findMany({
    where: eq(supermercadoPedidos.householdId, dbUser.householdId),
    orderBy: [desc(supermercadoPedidos.createdAt)],
    limit: 20,
  });

  const itemCount = await db
    .select({ count: sql<number>`count(*) filter (where ${supermercadoPedidos.status} = 'draft')::int` })
    .from(supermercadoPedidos)
    .where(eq(supermercadoPedidos.householdId, dbUser.householdId))
    .then((r) => r[0]?.count ?? 0);

  // contagem de itens com estoque abaixo do padrão
  const itemsNeedingBuy = items.filter(
    (i) =>
      i.defaultQty &&
      (i.currentStock === null ||
        parseFloat(i.currentStock) < parseFloat(i.defaultQty))
  );

  return (
    <ScreenShell
      userQ="Vamos organizar a compra?"
      insight={
        itemsNeedingBuy.length > 0 ? (
          <>
            <b>{itemsNeedingBuy.length}</b> {itemsNeedingBuy.length === 1 ? "item" : "itens"} abaixo do estoque padrão. Posso gerar o pedido?
          </>
        ) : items.length > 0 ? (
          <>Estoque OK. Quando faltar algo, basta marcar a quantidade nova aqui.</>
        ) : (
          <>Comece cadastrando os itens que vocês compram com frequência. Eu sugiro o que falta.</>
        )
      }
    >
      <SectionRow icon="bag" label="Itens do supermercado" action={`${items.length} cadastrados`} />

      <BigNumber
        value={`${itemsNeedingBuy.length}`}
        sub={`${itemsNeedingBuy.length === 1 ? "item" : "itens"} abaixo do padrão · ${itemCount} pedido${itemCount === 1 ? "" : "s"} aberto${itemCount === 1 ? "" : "s"}`}
        accent={itemsNeedingBuy.length > 0}
      />

      <div style={{ padding: "14px 20px 0", display: "flex", gap: 10 }}>
        <form
          action={async () => {
            "use server";
            let id: string;
            try {
              id = await createPedidoFromShortfall();
            } catch (err) {
              if (err instanceof Error && err.message.includes("Nenhum")) {
                return;
              }
              throw err;
            }
            redirect(`/supermercado/pedidos/${id}`);
          }}
          style={{ flex: 1 }}
        >
          <button
            type="submit"
            disabled={itemsNeedingBuy.length === 0}
            style={{
              width: "100%",
              padding: "10px 16px",
              borderRadius: 14,
              background: itemsNeedingBuy.length === 0 ? "var(--card2)" : "var(--accent)",
              color: itemsNeedingBuy.length === 0 ? "var(--muted)" : "var(--accent-on)",
              border: "none",
              fontWeight: 700,
              fontSize: 13,
              cursor: itemsNeedingBuy.length === 0 ? "not-allowed" : "pointer",
            }}
          >
            Gerar pedido (faltas)
          </button>
        </form>
        <form
          action={async () => {
            "use server";
            const id = await createEmptyPedido();
            redirect(`/supermercado/pedidos/${id}`);
          }}
          style={{ flex: 1 }}
        >
          <button
            type="submit"
            style={{
              width: "100%",
              padding: "10px 16px",
              borderRadius: 14,
              background: "var(--card)",
              color: "var(--ink-d)",
              border: "1px solid var(--line-d)",
              fontWeight: 600,
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            Novo pedido vazio
          </button>
        </form>
      </div>

      <div style={{ padding: "14px 0 0" }}>
        <InlineForm buttonLabel="Cadastrar item">
          <form action={createItem}>
            <FormField label="O que é? *">
              <input
                name="name"
                required
                autoFocus
                placeholder="Ex: leite integral"
                style={fieldStyle}
              />
            </FormField>
            <div style={{ display: "grid", gap: 8, gridTemplateColumns: "1fr 1fr" }}>
              <FormField label="Categoria">
                <input
                  name="category"
                  list="supermercado-cat"
                  placeholder="comece a digitar..."
                  style={fieldStyle}
                />
                <datalist id="supermercado-cat">
                  <option value="Mercado" />
                  <option value="Padaria" />
                  <option value="Frutas" />
                  <option value="Verduras" />
                  <option value="Carnes" />
                  <option value="Bebidas" />
                  <option value="Limpeza" />
                  <option value="Higiene" />
                  <option value="Pet" />
                </datalist>
              </FormField>
              <FormField label="Unidade">
                <input
                  name="unit"
                  list="supermercado-unit"
                  defaultValue="un"
                  style={fieldStyle}
                />
                <datalist id="supermercado-unit">
                  <option value="un" />
                  <option value="kg" />
                  <option value="g" />
                  <option value="L" />
                  <option value="mL" />
                  <option value="pct" />
                  <option value="cx" />
                </datalist>
              </FormField>
            </div>

            <details style={{ marginBottom: 10 }}>
              <summary
                style={{
                  cursor: "pointer",
                  fontSize: 12,
                  color: "var(--muted)",
                  padding: "4px 0",
                  listStyle: "none",
                  fontWeight: 600,
                }}
              >
                + qtd padrão e preço estimado (opcionais)
              </summary>
              <div style={{ marginTop: 8, display: "grid", gap: 8, gridTemplateColumns: "1fr 1fr" }}>
                <FormField label="Qtd padrão" hint="qtd que vocês compram normalmente">
                  <input
                    type="number"
                    step="0.01"
                    name="defaultQty"
                    placeholder="2"
                    style={fieldStyle}
                  />
                </FormField>
                <FormField label="Preço estimado (R$)">
                  <input
                    type="number"
                    step="0.01"
                    name="estimatedPrice"
                    placeholder="5.50"
                    style={fieldStyle}
                  />
                </FormField>
              </div>
            </details>
            <SubmitButton>Salvar item</SubmitButton>
          </form>
        </InlineForm>
      </div>

      <SectionRow icon="bag" label="Estoque" action={`${items.length}`} />

      <div style={{ padding: "0 20px" }}>
        {items.length === 0 ? (
          <div style={{ fontSize: 13, color: "var(--muted)", textAlign: "center", padding: "20px 0" }}>
            Nenhum item cadastrado.
          </div>
        ) : (
          items.map((item, i) => {
            const stock = item.currentStock ? parseFloat(item.currentStock) : null;
            const need = item.defaultQty ? parseFloat(item.defaultQty) : null;
            const low = need !== null && (stock === null || stock < need);
            return (
              <div
                key={item.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "10px 0",
                  borderBottom: i < items.length - 1 ? "0.5px solid var(--line-d)" : "none",
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600 }}>{item.name}</div>
                  <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>
                    {[item.category, item.unit, need ? `padrão ${need}` : null]
                      .filter(Boolean)
                      .join(" · ") || "—"}
                  </div>
                </div>
                <form
                  action={async (fd) => {
                    "use server";
                    await updateItemStock(item.id, (fd.get("stock") as string) || "");
                  }}
                >
                  <input
                    name="stock"
                    type="number"
                    step="0.01"
                    defaultValue={item.currentStock ?? ""}
                    placeholder="estoque"
                    style={{
                      width: 70,
                      padding: "4px 8px",
                      borderRadius: 8,
                      background: low ? "var(--alert)" : "var(--card2)",
                      color: low ? "var(--accent-on)" : "var(--ink)",
                      border: "none",
                      fontSize: 12,
                      fontFamily: "inherit",
                      textAlign: "right",
                    }}
                    onBlur={(e) => e.currentTarget.form?.requestSubmit()}
                  />
                </form>
                <DeleteBtn
                  action={deleteItem.bind(null, item.id)}
                  confirmMsg={`Excluir "${item.name}"?`}
                />
              </div>
            );
          })
        )}
      </div>

      {pedidos.length > 0 && (
        <>
          <SectionRow icon="bag" label="Pedidos recentes" action={`${pedidos.length}`} />
          <div style={{ padding: "0 20px", display: "flex", flexDirection: "column", gap: 8 }}>
            {pedidos.map((p) => (
              <Link
                key={p.id}
                href={`/supermercado/pedidos/${p.id}`}
                style={{ textDecoration: "none", color: "inherit" }}
              >
                <Card pad={12}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{p.title}</div>
                      <div style={{ fontSize: 10.5, color: "var(--muted)", marginTop: 2 }}>
                        {new Date(p.createdAt).toLocaleDateString("pt-BR")}
                      </div>
                    </div>
                    <Pill tone={p.status === "received" ? "ok" : p.status === "sent" ? "accent" : "muted"}>
                      {p.status === "draft"
                        ? "rascunho"
                        : p.status === "sent"
                          ? "enviado"
                          : p.status === "received"
                            ? "recebido"
                            : "cancelado"}
                    </Pill>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        </>
      )}
    </ScreenShell>
  );
}
