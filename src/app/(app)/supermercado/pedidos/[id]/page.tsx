import { asc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";

import { BigNumber, Pill, SectionRow } from "@/components/ap/atoms";
import { ConfirmSubmitButton } from "@/components/ap/confirm-submit";
import { BackButton, DeleteBtn, FormField, InlineForm, SubmitButton, fieldStyle } from "@/components/ap/inline-form";
import { ScreenShell } from "@/components/ap/screen-shell";
import {
  addPedidoItem,
  deletePedidoForm,
  removePedidoItem,
  setPedidoStatusForm,
  togglePedidoItemCheckedForm,
} from "@/app/actions/supermercado";
import { auth } from "@/auth";
import { db } from "@/db";
import {
  supermercadoPedidoItens,
  supermercadoPedidos,
  users,
} from "@/db/schema";

export default async function PedidoDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) return null;

  const dbUser = await db.query.users.findFirst({
    where: eq(users.id, session.user.id),
  });
  if (!dbUser?.householdId) return null;

  const pedido = await db.query.supermercadoPedidos.findFirst({
    where: eq(supermercadoPedidos.id, id),
  });
  if (!pedido || pedido.householdId !== dbUser.householdId) notFound();

  const items = await db.query.supermercadoPedidoItens.findMany({
    where: eq(supermercadoPedidoItens.pedidoId, pedido.id),
    orderBy: [asc(supermercadoPedidoItens.createdAt)],
  });

  const totalEstimated = items.reduce(
    (sum, item) =>
      sum +
      (item.estimatedPrice ? parseFloat(item.estimatedPrice) * parseFloat(item.quantity) : 0),
    0
  );
  const checked = items.filter((i) => i.isChecked).length;

  // Texto pra exportar (mailto/whatsapp futuro)
  const exportText = items
    .map((i) => `- ${i.quantity} ${i.unit} ${i.nameSnapshot}`)
    .join("\n");
  const mailto = `mailto:?subject=${encodeURIComponent(pedido.title ?? "Pedido")}&body=${encodeURIComponent(`Olá!\n\nPedido:\n${exportText}\n\nObrigado.`)}`;
  const whatsapp = `https://wa.me/?text=${encodeURIComponent(`*${pedido.title ?? "Pedido"}*\n\n${exportText}`)}`;

  return (
    <ScreenShell
      userQ={pedido.title ?? "Vamos ver o pedido?"}
      insight={
        items.length === 0 ? (
          <>Pedido vazio. Adicione itens abaixo.</>
        ) : (
          <>
            <b>{items.length}</b> {items.length === 1 ? "item" : "itens"}{" "}
            {checked > 0 ? `· ${checked} marcados` : ""}
            {totalEstimated > 0 ? ` · estimativa R$ ${totalEstimated.toFixed(2).replace(".", ",")}` : ""}.
          </>
        )
      }
    >
      <div style={{ padding: "0 20px 8px" }}>
        <BackButton href="/supermercado" label="Supermercado" />
      </div>

      <SectionRow
        icon="bag"
        label={pedido.title ?? "Pedido"}
        action={
          <Pill tone={pedido.status === "received" ? "ok" : pedido.status === "sent" ? "accent" : "muted"}>
            {pedido.status === "draft"
              ? "rascunho"
              : pedido.status === "sent"
                ? "enviado"
                : pedido.status === "received"
                  ? "recebido"
                  : "cancelado"}
          </Pill>
        }
      />

      <BigNumber
        value={`${items.length} ${items.length === 1 ? "item" : "itens"}`}
        sub={totalEstimated > 0 ? `Estimativa R$ ${totalEstimated.toFixed(2).replace(".", ",")}` : "sem estimativa"}
        accent={pedido.status === "draft"}
      />

      <div style={{ padding: "14px 20px 0", display: "flex", gap: 8, flexWrap: "wrap" }}>
        <a
          href={mailto}
          style={{
            padding: "6px 12px",
            borderRadius: 999,
            background: "var(--card)",
            color: "var(--ink-d)",
            fontSize: 11.5,
            fontWeight: 600,
            textDecoration: "none",
          }}
        >
          Enviar por email
        </a>
        <a
          href={whatsapp}
          target="_blank"
          rel="noopener"
          style={{
            padding: "6px 12px",
            borderRadius: 999,
            background: "var(--card)",
            color: "var(--ink-d)",
            fontSize: 11.5,
            fontWeight: 600,
            textDecoration: "none",
          }}
        >
          WhatsApp
        </a>
        {pedido.status === "draft" && (
          <form action={setPedidoStatusForm}>
            <input type="hidden" name="pedidoId" value={pedido.id} />
            <input type="hidden" name="status" value="sent" />
            <button
              type="submit"
              style={{
                padding: "6px 12px",
                borderRadius: 999,
                background: "var(--accent)",
                color: "var(--accent-on)",
                border: "none",
                fontSize: 11.5,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Marcar como enviado
            </button>
          </form>
        )}
        {pedido.status === "sent" && (
          <form action={setPedidoStatusForm}>
            <input type="hidden" name="pedidoId" value={pedido.id} />
            <input type="hidden" name="status" value="received" />
            <button
              type="submit"
              style={{
                padding: "6px 12px",
                borderRadius: 999,
                background: "var(--ok)",
                color: "var(--accent-on)",
                border: "none",
                fontSize: 11.5,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Marcar como recebido
            </button>
          </form>
        )}
        <form action={deletePedidoForm} style={{ marginLeft: "auto" }}>
          <input type="hidden" name="id" value={pedido.id} />
          <ConfirmSubmitButton
            confirmMsg="Excluir pedido inteiro?"
            style={{
              padding: "6px 12px",
              borderRadius: 999,
              background: "transparent",
              color: "var(--alert)",
              border: "1px solid var(--alert)",
              fontSize: 11.5,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Excluir pedido
          </ConfirmSubmitButton>
        </form>
      </div>

      <SectionRow icon="bag" label="Itens" action={`${items.length}`} />

      <div style={{ padding: "0 20px" }}>
        {items.length === 0 ? (
          <div style={{ fontSize: 13, color: "var(--muted)", textAlign: "center", padding: "20px 0" }}>
            Sem itens. Adiciona abaixo.
          </div>
        ) : (
          items.map((item, i) => (
            <div
              key={item.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "10px 0",
                borderBottom: i < items.length - 1 ? "0.5px solid var(--line-d)" : "none",
                opacity: item.isChecked ? 0.5 : 1,
              }}
            >
              <form action={togglePedidoItemCheckedForm}>
                <input type="hidden" name="id" value={item.id} />
                <button
                  type="submit"
                  aria-label={item.isChecked ? "Desmarcar" : "Marcar"}
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 4,
                    background: item.isChecked ? "var(--accent)" : "transparent",
                    color: item.isChecked ? "var(--accent-on)" : "transparent",
                    border: `1.5px solid ${item.isChecked ? "var(--accent)" : "var(--line-d)"}`,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 14,
                    fontWeight: 700,
                  }}
                >
                  {item.isChecked ? "✓" : ""}
                </button>
              </form>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 13.5,
                    fontWeight: 600,
                    textDecoration: item.isChecked ? "line-through" : "none",
                  }}
                >
                  {item.nameSnapshot}
                </div>
                <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>
                  {parseFloat(item.quantity)} {item.unit}
                  {item.estimatedPrice ? ` · R$ ${parseFloat(item.estimatedPrice).toFixed(2)}` : ""}
                </div>
              </div>
              <DeleteBtn
                action={removePedidoItem.bind(null, item.id)}
                confirmMsg="Remover item?"
              />
            </div>
          ))
        )}
      </div>

      {pedido.status === "draft" && (
        <div style={{ padding: "14px 0 0" }}>
          <InlineForm buttonLabel="Adicionar item ao pedido">
            <form action={addPedidoItem}>
                <input type="hidden" name="pedidoId" value={pedido.id} />
                <FormField label="Item *">
                  <input
                    name="name"
                    required
                    placeholder="Ex: queijo mussarela"
                    style={fieldStyle}
                  />
                </FormField>
                <div style={{ display: "grid", gap: 8, gridTemplateColumns: "80px 80px 1fr" }}>
                  <FormField label="Qtd">
                    <input
                      type="number"
                      step="0.01"
                      name="quantity"
                      defaultValue="1"
                      style={fieldStyle}
                    />
                  </FormField>
                  <FormField label="Unidade">
                    <input name="unit" defaultValue="un" style={fieldStyle} />
                  </FormField>
                  <FormField label="Preço un.">
                    <input
                      type="number"
                      step="0.01"
                      name="estimatedPrice"
                      style={fieldStyle}
                    />
                  </FormField>
                </div>
              <SubmitButton>Adicionar</SubmitButton>
            </form>
          </InlineForm>
        </div>
      )}
    </ScreenShell>
  );
}
