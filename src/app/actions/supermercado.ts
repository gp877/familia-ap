"use server";

import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { db } from "@/db";
import {
  supermercadoContagemItens,
  supermercadoContagens,
  supermercadoItens,
  supermercadoPedidoItens,
  supermercadoPedidos,
} from "@/db/schema";
import { requireUserAndHousehold } from "@/lib/auth-helpers";

// ── Itens (catálogo + estoque) ─────────────────────────────────────
export async function createItem(formData: FormData) {
  const { householdId } = await requireUserAndHousehold();
  const name = (formData.get("name") as string)?.trim();
  if (!name) throw new Error("Nome obrigatório");

  // Próximo sortOrder
  const maxOrder = await db
    .select({ m: sql<number>`coalesce(max(${supermercadoItens.sortOrder}), 0)::int` })
    .from(supermercadoItens)
    .where(eq(supermercadoItens.householdId, householdId))
    .then((r) => r[0]?.m ?? 0);

  await db.insert(supermercadoItens).values({
    householdId,
    name,
    category: ((formData.get("category") as string) || "").trim() || null,
    location: ((formData.get("location") as string) || "").trim() || null,
    brand: ((formData.get("brand") as string) || "").trim() || null,
    unit: ((formData.get("unit") as string) || "").trim() || "un",
    defaultQty: ((formData.get("defaultQty") as string) || "").trim() || null,
    minStock: ((formData.get("minStock") as string) || "").trim() || null,
    estimatedPrice: ((formData.get("estimatedPrice") as string) || "").trim() || null,
    sortOrder: maxOrder + 10,
  });

  revalidatePath("/supermercado");
  revalidatePath("/supermercado/produtos");
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

export async function updateItemStockForm(formData: FormData) {
  const itemId = formData.get("itemId") as string;
  const stock = (formData.get("stock") as string) || "";
  if (!itemId) return;
  await updateItemStock(itemId, stock);
}

/** Patch genérico de item (todos os campos editáveis). */
export async function patchItem(formData: FormData) {
  const { householdId } = await requireUserAndHousehold();
  const id = formData.get("id") as string;
  if (!id) return;
  const item = await db.query.supermercadoItens.findFirst({
    where: eq(supermercadoItens.id, id),
  });
  if (!item || item.householdId !== householdId) return;

  const patch: Record<string, string | null> = {};
  for (const key of [
    "name",
    "category",
    "location",
    "brand",
    "unit",
    "defaultQty",
    "minStock",
    "currentStock",
    "estimatedPrice",
  ]) {
    if (formData.has(key)) {
      const v = ((formData.get(key) as string) || "").trim();
      if (key === "name" && !v) continue;
      patch[key] = v || null;
    }
  }
  if (Object.keys(patch).length === 0) return;
  await db.update(supermercadoItens).set(patch).where(eq(supermercadoItens.id, id));
  revalidatePath("/supermercado");
  revalidatePath("/supermercado/produtos");
}

export async function deleteItem(itemId: string) {
  const { householdId } = await requireUserAndHousehold();
  const item = await db.query.supermercadoItens.findFirst({
    where: eq(supermercadoItens.id, itemId),
  });
  if (!item || item.householdId !== householdId) throw new Error("Item não encontrado");
  await db.delete(supermercadoItens).where(eq(supermercadoItens.id, itemId));
  revalidatePath("/supermercado");
  revalidatePath("/supermercado/produtos");
}

/**
 * Reordena itens. Recebe um array JSON `order` com IDs na nova ordem.
 * Atualiza sortOrder em lote.
 */
export async function reorderItems(formData: FormData) {
  const { householdId } = await requireUserAndHousehold();
  const orderRaw = formData.get("order") as string;
  if (!orderRaw) return;
  let ids: string[];
  try {
    ids = JSON.parse(orderRaw);
  } catch {
    return;
  }
  if (!Array.isArray(ids)) return;

  // Multi-update via SQL CASE
  if (ids.length === 0) return;
  const items = await db.query.supermercadoItens.findMany({
    where: eq(supermercadoItens.householdId, householdId),
  });
  const myIds = new Set(items.map((i) => i.id));

  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    if (!myIds.has(id)) continue;
    await db
      .update(supermercadoItens)
      .set({ sortOrder: (i + 1) * 10 })
      .where(eq(supermercadoItens.id, id));
  }
  revalidatePath("/supermercado/produtos");
  revalidatePath("/supermercado");
}

// ── Pedidos ─────────────────────────────────────────────────────────
export async function createPedidoFromShortfallAndGo() {
  const id = await createPedidoFromShortfall().catch((err) => {
    if (err instanceof Error && err.message.includes("Nenhum")) return null;
    throw err;
  });
  if (id) redirect(`/supermercado/pedidos/${id}`);
  else redirect("/supermercado");
}

export async function createEmptyPedidoAndGo() {
  const id = await createEmptyPedido();
  redirect(`/supermercado/pedidos/${id}`);
}

/**
 * Cria pedido a partir do shortfall: minStock - currentStock por item.
 * Se item não tem minStock, ignora. Se currentStock >= minStock, ignora.
 */
export async function createPedidoFromShortfall() {
  const { householdId, userId } = await requireUserAndHousehold();

  const items = await db
    .select()
    .from(supermercadoItens)
    .where(
      sql`${supermercadoItens.householdId} = ${householdId}
          AND ${supermercadoItens.isActive} = true
          AND ${supermercadoItens.minStock} IS NOT NULL
          AND (${supermercadoItens.currentStock} IS NULL OR ${supermercadoItens.currentStock} < ${supermercadoItens.minStock})`
    );

  if (items.length === 0) {
    throw new Error("Nenhum item abaixo do estoque mínimo");
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
      const min = parseFloat(item.minStock!);
      const cur = item.currentStock ? parseFloat(item.currentStock) : 0;
      const need = Math.max(0, min - cur);
      return {
        pedidoId: pedido.id,
        itemId: item.id,
        nameSnapshot: item.brand ? `${item.name} (${item.brand})` : item.name,
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

export async function togglePedidoItemCheckedForm(formData: FormData) {
  const id = formData.get("id") as string;
  if (!id) return;
  await togglePedidoItemChecked(id);
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

export async function setPedidoStatusForm(formData: FormData) {
  const pedidoId = formData.get("pedidoId") as string;
  const status = formData.get("status") as "draft" | "sent" | "received" | "cancelled";
  if (!pedidoId || !status) return;
  await setPedidoStatus(pedidoId, status);
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

export async function deletePedidoForm(formData: FormData) {
  const id = formData.get("id") as string;
  if (!id) return;
  await deletePedido(id);
  redirect("/supermercado");
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

// ── Contagens ──────────────────────────────────────────────────────
/**
 * Cria uma nova contagem com snapshot de todos os itens ativos.
 * Cada item vira uma linha em supermercado_contagem_item com countedQty=null.
 */
export async function createContagem(): Promise<string> {
  const { householdId, userId } = await requireUserAndHousehold();

  // Bloqueia se já houver contagem aberta
  const aberta = await db.query.supermercadoContagens.findFirst({
    where: and(
      eq(supermercadoContagens.householdId, householdId),
      eq(supermercadoContagens.status, "open")
    ),
  });
  if (aberta) return aberta.id;

  const items = await db.query.supermercadoItens.findMany({
    where: and(
      eq(supermercadoItens.householdId, householdId),
      eq(supermercadoItens.isActive, true)
    ),
    orderBy: [asc(supermercadoItens.sortOrder), asc(supermercadoItens.name)],
  });

  const today = new Date().toISOString().slice(0, 10);
  const [contagem] = await db
    .insert(supermercadoContagens)
    .values({
      householdId,
      createdById: userId,
      contagemDate: today,
      status: "open",
    })
    .returning();

  if (items.length > 0) {
    await db.insert(supermercadoContagemItens).values(
      items.map((it) => ({
        contagemId: contagem.id,
        itemId: it.id,
        nameSnapshot: it.name,
        locationSnapshot: it.location,
        unitSnapshot: it.unit,
        minStockSnapshot: it.minStock,
        countedQty: null,
      }))
    );
  }

  revalidatePath("/supermercado/contagens");
  return contagem.id;
}

export async function createContagemAndGo() {
  const id = await createContagem();
  redirect(`/supermercado/contagens/${id}`);
}

/** Atualiza a qty contada de um item da contagem. Auto-save. */
export async function patchContagemItem(formData: FormData) {
  const { householdId } = await requireUserAndHousehold();
  const id = formData.get("id") as string;
  if (!id) return;
  const ci = await db.query.supermercadoContagemItens.findFirst({
    where: eq(supermercadoContagemItens.id, id),
    with: { contagem: true },
  });
  if (!ci || ci.contagem.householdId !== householdId) return;
  if (ci.contagem.status === "closed") return; // não permite edição em contagem fechada

  const qty = ((formData.get("countedQty") as string) || "").trim();
  await db
    .update(supermercadoContagemItens)
    .set({ countedQty: qty || null })
    .where(eq(supermercadoContagemItens.id, id));
  revalidatePath(`/supermercado/contagens/${ci.contagemId}`);
}

/**
 * Fecha a contagem: copia countedQty pra currentStock dos items correspondentes,
 * registra closedAt.
 */
export async function closeContagem(formData: FormData) {
  const { householdId } = await requireUserAndHousehold();
  const id = formData.get("id") as string;
  if (!id) return;
  const contagem = await db.query.supermercadoContagens.findFirst({
    where: eq(supermercadoContagens.id, id),
    with: { items: true },
  });
  if (!contagem || contagem.householdId !== householdId) return;
  if (contagem.status === "closed") return;

  for (const ci of contagem.items) {
    if (ci.itemId && ci.countedQty !== null) {
      await db
        .update(supermercadoItens)
        .set({ currentStock: ci.countedQty })
        .where(eq(supermercadoItens.id, ci.itemId));
    }
  }

  await db
    .update(supermercadoContagens)
    .set({ status: "closed", closedAt: new Date() })
    .where(eq(supermercadoContagens.id, id));

  revalidatePath("/supermercado");
  revalidatePath("/supermercado/contagens");
  revalidatePath(`/supermercado/contagens/${id}`);
}

/**
 * Encerra a contagem (se ainda aberta), gera pedido a partir do shortfall e
 * vincula o pedido à contagem. Redireciona pra detalhe do pedido.
 */
export async function closeContagemAndCreatePedido(formData: FormData) {
  const { householdId, userId } = await requireUserAndHousehold();
  const contagemId = formData.get("id") as string;
  if (!contagemId) return;

  // Garante contagem fechada (encerra com os dados atuais)
  const contagem = await db.query.supermercadoContagens.findFirst({
    where: eq(supermercadoContagens.id, contagemId),
    with: { items: true },
  });
  if (!contagem || contagem.householdId !== householdId) return;

  if (contagem.status === "open") {
    // Aplica os countedQty no estoque
    for (const ci of contagem.items) {
      if (ci.itemId && ci.countedQty !== null) {
        await db
          .update(supermercadoItens)
          .set({ currentStock: ci.countedQty })
          .where(eq(supermercadoItens.id, ci.itemId));
      }
    }
  }

  // Cria pedido baseado no shortfall (usando currentStock atualizado)
  let pedidoId: string | null = null;
  try {
    pedidoId = await createPedidoFromShortfall();
  } catch (e) {
    // sem shortfall — fecha contagem e volta pra lista
  }

  await db
    .update(supermercadoContagens)
    .set({
      status: "closed",
      closedAt: new Date(),
      pedidoId: pedidoId ?? undefined,
    })
    .where(eq(supermercadoContagens.id, contagemId));

  revalidatePath("/supermercado");
  revalidatePath("/supermercado/contagens");

  if (pedidoId) {
    redirect(`/supermercado/pedidos/${pedidoId}`);
  } else {
    redirect("/supermercado/contagens");
  }
}

export async function deleteContagem(formData: FormData) {
  const { householdId } = await requireUserAndHousehold();
  const id = formData.get("id") as string;
  if (!id) return;
  const c = await db.query.supermercadoContagens.findFirst({
    where: eq(supermercadoContagens.id, id),
  });
  if (!c || c.householdId !== householdId) return;
  await db.delete(supermercadoContagens).where(eq(supermercadoContagens.id, id));
  revalidatePath("/supermercado/contagens");
}
