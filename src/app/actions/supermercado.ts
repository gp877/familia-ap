"use server";

import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { db } from "@/db";
import {
  supermercadoItens,
  supermercadoPedidoItens,
  supermercadoPedidos,
} from "@/db/schema";
import { requireUserAndHousehold } from "@/lib/auth-helpers";

// ── Itens (catálogo + estoque) ────────────────────────────────
export async function createItem(formData: FormData) {
  const { householdId } = await requireUserAndHousehold();
  const name = (formData.get("name") as string)?.trim();
  if (!name) throw new Error("Nome obrigatório");

  await db.insert(supermercadoItens).values({
    householdId,
    name,
    category: ((formData.get("category") as string) || "").trim() || null,
    unit: ((formData.get("unit") as string) || "").trim() || "un",
    defaultQty: ((formData.get("defaultQty") as string) || "").trim() || null,
    estimatedPrice: ((formData.get("estimatedPrice") as string) || "").trim() || null,
  });

  revalidatePath("/supermercado");
}

export async function updateItemStock(itemId: string, newStock: string) {
  const { householdId } = await requireUserAndHousehold();
  const item = await db.query.supermercadoItens.findFirst({
    where: eq(supermercadoItens.id, itemId),
  });
  if (!item || item.householdId !== householdId) throw new Error("Item não encontrado");

  await db
    .update(supermercadoItens)
    .set({ currentStock: newStock || null })
    .where(eq(supermercadoItens.id, itemId));
  revalidatePath("/supermercado");
}

/**
 * Wrapper pra usar em <form action> direto. Recebe itemId via campo hidden.
 */
export async function updateItemStockForm(formData: FormData) {
  const itemId = formData.get("itemId") as string;
  const stock = (formData.get("stock") as string) || "";
  if (!itemId) return;
  await updateItemStock(itemId, stock);
}

/** Patch genérico de um item (name, category, unit, defaultQty, estimatedPrice). */
export async function patchItem(formData: FormData) {
  const { householdId } = await requireUserAndHousehold();
  const id = formData.get("id") as string;
  if (!id) return;
  const item = await db.query.supermercadoItens.findFirst({
    where: eq(supermercadoItens.id, id),
  });
  if (!item || item.householdId !== householdId) return;

  const patch: Record<string, string | null> = {};
  for (const key of ["name", "category", "unit", "defaultQty", "estimatedPrice"]) {
    if (formData.has(key)) {
      const v = ((formData.get(key) as string) || "").trim();
      if (key === "name" && !v) continue;
      patch[key] = v || null;
    }
  }
  if (Object.keys(patch).length === 0) return;
  await db.update(supermercadoItens).set(patch).where(eq(supermercadoItens.id, id));
  revalidatePath("/supermercado");
}

export async function deleteItem(itemId: string) {
  const { householdId } = await requireUserAndHousehold();
  const item = await db.query.supermercadoItens.findFirst({
    where: eq(supermercadoItens.id, itemId),
  });
  if (!item || item.householdId !== householdId) throw new Error("Item não encontrado");
  await db.delete(supermercadoItens).where(eq(supermercadoItens.id, itemId));
  revalidatePath("/supermercado");
}

// ── Pedidos ────────────────────────────────────────────────────
/**
 * Versão "form action": cria pedido de faltas e redireciona pra detalhe.
 * Se não houver itens em falta, redireciona de volta pra /supermercado.
 */
export async function createPedidoFromShortfallAndGo() {
  const id = await createPedidoFromShortfall().catch((err) => {
    if (err instanceof Error && err.message.includes("Nenhum")) return null;
    throw err;
  });
  if (id) redirect(`/supermercado/pedidos/${id}`);
  else redirect("/supermercado");
}

/**
 * Versão "form action": cria pedido vazio e redireciona pra detalhe.
 */
export async function createEmptyPedidoAndGo() {
  const id = await createEmptyPedido();
  redirect(`/supermercado/pedidos/${id}`);
}

export async function createPedidoFromShortfall() {
  const { householdId, userId } = await requireUserAndHousehold();

  // Pega itens onde estoque < quantidade padrão
  const items = await db
    .select()
    .from(supermercadoItens)
    .where(
      sql`${supermercadoItens.householdId} = ${householdId} AND ${supermercadoItens.isActive} = true AND ${supermercadoItens.defaultQty} IS NOT NULL AND (${supermercadoItens.currentStock} IS NULL OR ${supermercadoItens.currentStock} < ${supermercadoItens.defaultQty})`
    );

  if (items.length === 0) {
    throw new Error("Nenhum item com estoque abaixo do padrão");
  }

  const now = new Date();
  const title = `Compra · ${now.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}`;

  const [pedido] = await db
    .insert(supermercadoPedidos)
    .values({
      householdId,
      createdById: userId,
      title,
      status: "draft",
    })
    .returning();

  await db.insert(supermercadoPedidoItens).values(
    items.map((item) => {
      const need =
        item.defaultQty && item.currentStock
          ? Math.max(
              0,
              parseFloat(item.defaultQty) - parseFloat(item.currentStock)
            )
          : item.defaultQty
            ? parseFloat(item.defaultQty)
            : 1;
      return {
        pedidoId: pedido.id,
        itemId: item.id,
        nameSnapshot: item.name,
        quantity: String(need),
        unit: item.unit,
        estimatedPrice: item.estimatedPrice,
      };
    })
  );

  revalidatePath("/supermercado");
  return pedido.id;
}

export async function createEmptyPedido() {
  const { householdId, userId } = await requireUserAndHousehold();
  const now = new Date();
  const title = `Compra · ${now.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}`;
  const [pedido] = await db
    .insert(supermercadoPedidos)
    .values({ householdId, createdById: userId, title, status: "draft" })
    .returning();
  revalidatePath("/supermercado");
  return pedido.id;
}

export async function addPedidoItem(formData: FormData) {
  const { householdId } = await requireUserAndHousehold();
  const pedidoId = formData.get("pedidoId") as string;
  const name = (formData.get("name") as string)?.trim();
  const quantity = (formData.get("quantity") as string) || "1";
  if (!pedidoId || !name) throw new Error("Pedido e nome obrigatórios");

  const pedido = await db.query.supermercadoPedidos.findFirst({
    where: eq(supermercadoPedidos.id, pedidoId),
  });
  if (!pedido || pedido.householdId !== householdId) {
    throw new Error("Pedido não encontrado");
  }

  await db.insert(supermercadoPedidoItens).values({
    pedidoId,
    nameSnapshot: name,
    quantity,
    unit: ((formData.get("unit") as string) || "un").trim() || "un",
    estimatedPrice: ((formData.get("estimatedPrice") as string) || "").trim() || null,
  });

  revalidatePath(`/supermercado/pedidos/${pedidoId}`);
}

export async function togglePedidoItemChecked(pedidoItemId: string) {
  const { householdId } = await requireUserAndHousehold();
  const pi = await db.query.supermercadoPedidoItens.findFirst({
    where: eq(supermercadoPedidoItens.id, pedidoItemId),
    with: { pedido: true },
  });
  if (!pi || pi.pedido.householdId !== householdId) {
    throw new Error("Item não encontrado");
  }
  await db
    .update(supermercadoPedidoItens)
    .set({ isChecked: !pi.isChecked })
    .where(eq(supermercadoPedidoItens.id, pedidoItemId));
  revalidatePath(`/supermercado/pedidos/${pi.pedidoId}`);
}

export async function removePedidoItem(pedidoItemId: string) {
  const { householdId } = await requireUserAndHousehold();
  const pi = await db.query.supermercadoPedidoItens.findFirst({
    where: eq(supermercadoPedidoItens.id, pedidoItemId),
    with: { pedido: true },
  });
  if (!pi || pi.pedido.householdId !== householdId) {
    throw new Error("Item não encontrado");
  }
  await db.delete(supermercadoPedidoItens).where(eq(supermercadoPedidoItens.id, pedidoItemId));
  revalidatePath(`/supermercado/pedidos/${pi.pedidoId}`);
}

/**
 * Wrappers que aceitam FormData (compatível com form action direto).
 */
export async function setPedidoStatusForm(formData: FormData) {
  const pedidoId = formData.get("pedidoId") as string;
  const status = formData.get("status") as "draft" | "sent" | "received" | "cancelled";
  if (!pedidoId || !status) return;
  await setPedidoStatus(pedidoId, status);
}

export async function togglePedidoItemCheckedForm(formData: FormData) {
  const id = formData.get("id") as string;
  if (!id) return;
  await togglePedidoItemChecked(id);
}

export async function deletePedidoForm(formData: FormData) {
  const id = formData.get("id") as string;
  if (!id) return;
  await deletePedido(id);
  redirect("/supermercado");
}

export async function setPedidoStatus(
  pedidoId: string,
  status: "draft" | "sent" | "received" | "cancelled"
) {
  const { householdId } = await requireUserAndHousehold();
  const pedido = await db.query.supermercadoPedidos.findFirst({
    where: eq(supermercadoPedidos.id, pedidoId),
  });
  if (!pedido || pedido.householdId !== householdId) {
    throw new Error("Pedido não encontrado");
  }
  const patch: { status: typeof status; sentAt?: Date; receivedAt?: Date } = { status };
  if (status === "sent" && !pedido.sentAt) patch.sentAt = new Date();
  if (status === "received" && !pedido.receivedAt) patch.receivedAt = new Date();
  await db
    .update(supermercadoPedidos)
    .set(patch)
    .where(eq(supermercadoPedidos.id, pedidoId));
  revalidatePath("/supermercado");
  revalidatePath(`/supermercado/pedidos/${pedidoId}`);
}

export async function deletePedido(pedidoId: string) {
  const { householdId } = await requireUserAndHousehold();
  const pedido = await db.query.supermercadoPedidos.findFirst({
    where: eq(supermercadoPedidos.id, pedidoId),
  });
  if (!pedido || pedido.householdId !== householdId) {
    throw new Error("Pedido não encontrado");
  }
  await db.delete(supermercadoPedidos).where(eq(supermercadoPedidos.id, pedidoId));
  revalidatePath("/supermercado");
}
