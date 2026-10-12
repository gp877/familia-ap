/**
 * Lixeira do financeiro. Excluir = copiar a linha inteira (`to_jsonb`) pra
 * `trash_item` e só então apagar, tudo na mesma transação do banco.
 * Restaurar recria a linha com o MESMO id (`jsonb_populate_record`) e religa
 * as referências que o banco tinha anulado (FK "set null").
 *
 * Usado pelas telas (via "app") e pela API de agentes (via "agent"). Só
 * pessoas esvaziam a lixeira (purge) — a API não tem essa rota.
 */
import { randomUUID } from "node:crypto";

import { del } from "@vercel/blob";
import { and, desc, eq, inArray, sql, type SQL } from "drizzle-orm";

import { db } from "@/db";
import { invoices, transactions, trashItems, uploads } from "@/db/schema";

export type TrashActor = { userId: string; householdId: string; via: "app" | "agent" };
export type TrashEntity = "transaction" | "upload" | "invoice";

// Nome real da tabela no Postgres
const TABLE: Record<TrashEntity, string> = {
  transaction: "transaction",
  upload: "upload",
  invoice: "invoice",
};

// FKs "on delete set null" que APONTAM pra entidade — religadas ao restaurar
const INBOUND: Record<TrashEntity, Array<{ table: string; column: string }>> = {
  transaction: [{ table: "recurring_payment_record", column: "transaction_id" }],
  upload: [{ table: "transaction", column: "upload_id" }],
  invoice: [
    { table: "transaction", column: "invoice_id" },
    { table: "upload", column: "invoice_id" },
  ],
};

// FKs que SAEM da entidade e podem ter sumido até a restauração. Opcionais
// viram null; obrigatórias impedem a restauração (com motivo).
const OUTBOUND: Record<TrashEntity, Array<{ column: string; table: string; required?: boolean }>> = {
  transaction: [
    { column: "bank_account_id", table: "bank_account" },
    { column: "category_id", table: "category" },
    { column: "invoice_id", table: "invoice" },
    { column: "upload_id", table: "upload" },
    { column: "created_by_id", table: "user" },
  ],
  upload: [
    { column: "bank_account_id", table: "bank_account" },
    { column: "invoice_id", table: "invoice" },
    { column: "uploaded_by_id", table: "user", required: true },
  ],
  invoice: [{ column: "bank_account_id", table: "bank_account", required: true }],
};

// Ordem de exclusão: dependentes primeiro. Restauração: o inverso.
const DELETE_ORDER: TrashEntity[] = ["transaction", "upload", "invoice"];
const RESTORE_ORDER: TrashEntity[] = ["invoice", "upload", "transaction"];

type Link = { table: string; column: string; ids: string[] };
type Row = Record<string, unknown>;

const idList = (ids: string[]) => sql.join(ids.map((id) => sql`${id}::uuid`), sql`, `);

function labelFor(type: TrashEntity, d: Row): string {
  if (type === "transaction") {
    const valor = Number(d.amount ?? 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 });
    const data = String(d.occurred_on ?? "").slice(0, 10).split("-").reverse().join("/");
    return `${d.description ?? "Lançamento"} · ${d.kind === "credit" ? "+" : "−"}R$ ${valor} · ${data}`;
  }
  if (type === "upload") return `PDF "${d.filename ?? ""}"`;
  return `Fatura ${d.reference_month ?? ""}`;
}

/**
 * Move pra lixeira, num único lote. Ids de outro household são ignorados.
 * Retorna o lote e quantos itens de cada tipo foram pra lixeira.
 */
export async function trashEntities(
  actor: TrashActor,
  items: Partial<Record<TrashEntity, string[]>>,
  reason: string
) {
  const batchId = randomUUID();
  const counts: Record<TrashEntity, number> = { transaction: 0, upload: 0, invoice: 0 };
  const inBatch = new Set(Object.values(items).flat().filter(Boolean) as string[]);

  await db.transaction(async (tx) => {
    for (const type of DELETE_ORDER) {
      const ids = [...new Set(items[type] ?? [])];
      if (!ids.length) continue;
      const table = sql.identifier(TABLE[type]);

      const res = await tx.execute(
        sql`select id, to_jsonb(x.*) as data from ${table} x where x.household_id = ${actor.householdId}::uuid and x.id in (${idList(ids)})`
      );
      const rows = res.rows as Array<{ id: string; data: Row }>;
      if (!rows.length) continue;
      const ownedIds = rows.map((r) => r.id);

      // Quem aponta pra estas linhas (fora do próprio lote) — pra religar depois
      const linksById = new Map<string, Link[]>();
      for (const ref of INBOUND[type]) {
        const refRes = await tx.execute(
          sql`select id, ${sql.identifier(ref.column)} as target from ${sql.identifier(ref.table)} where ${sql.identifier(ref.column)} in (${idList(ownedIds)})`
        );
        for (const r of refRes.rows as Array<{ id: string; target: string }>) {
          if (inBatch.has(r.id)) continue;
          const list = linksById.get(r.target) ?? [];
          let link = list.find((l) => l.table === ref.table && l.column === ref.column);
          if (!link) list.push((link = { table: ref.table, column: ref.column, ids: [] }));
          link.ids.push(r.id);
          linksById.set(r.target, list);
        }
      }

      await tx.insert(trashItems).values(
        rows.map((r) => ({
          householdId: actor.householdId,
          batchId,
          entityType: type,
          entityId: r.id,
          data: r.data,
          links: linksById.get(r.id) ?? null,
          label: labelFor(type, r.data),
          reason,
          deletedVia: actor.via,
          deletedById: actor.userId,
        }))
      );
      await tx.execute(sql`delete from ${table} where id in (${idList(ownedIds)})`);
      counts[type] = ownedIds.length;
    }
  });

  return { batchId, counts };
}

/** Exclui um extrato e os lançamentos dele (mesmo escopo da tela Documentos). */
export async function trashStatementUpload(actor: TrashActor, uploadId: string) {
  const up = await db.query.uploads.findFirst({
    where: and(eq(uploads.id, uploadId), eq(uploads.householdId, actor.householdId)),
  });
  if (!up) throw new Error("Upload não encontrado");
  const txs = await db.query.transactions.findMany({
    columns: { id: true },
    where: and(eq(transactions.householdId, actor.householdId), eq(transactions.uploadId, uploadId)),
  });
  const r = await trashEntities(
    actor,
    { transaction: txs.map((t) => t.id), upload: [uploadId] },
    `Extrato "${up.filename}" excluído`
  );
  return { batchId: r.batchId, removedTransactions: r.counts.transaction };
}

/** Exclui uma fatura, o(s) PDF(s) dela e os lançamentos lançados nela. */
export async function trashInvoiceCascade(actor: TrashActor, invoiceId: string) {
  const inv = await db.query.invoices.findFirst({
    where: and(eq(invoices.id, invoiceId), eq(invoices.householdId, actor.householdId)),
  });
  if (!inv) throw new Error("Fatura não encontrada");
  const [txs, ups] = await Promise.all([
    db.query.transactions.findMany({
      columns: { id: true },
      where: and(eq(transactions.householdId, actor.householdId), eq(transactions.invoiceId, invoiceId)),
    }),
    db.query.uploads.findMany({
      columns: { id: true },
      where: and(eq(uploads.householdId, actor.householdId), eq(uploads.invoiceId, invoiceId)),
    }),
  ]);
  const r = await trashEntities(
    actor,
    { transaction: txs.map((t) => t.id), upload: ups.map((u) => u.id), invoice: [invoiceId] },
    `Fatura ${inv.referenceMonth} excluída`
  );
  return {
    batchId: r.batchId,
    removedTransactions: r.counts.transaction,
    removedUploads: r.counts.upload,
  };
}

function trashFilter(householdId: string, sel: { itemIds?: string[]; batchId?: string }): SQL | undefined {
  if (sel.itemIds?.length) {
    return and(eq(trashItems.householdId, householdId), inArray(trashItems.id, sel.itemIds));
  }
  if (sel.batchId) return and(eq(trashItems.householdId, householdId), eq(trashItems.batchId, sel.batchId));
  return undefined;
}

/**
 * Restaura itens (por id) ou um lote inteiro. Linha que já não cabe (ex.:
 * o mesmo lançamento foi importado de novo) fica na lixeira, com o motivo.
 */
export async function restoreFromTrash(
  householdId: string,
  sel: { itemIds?: string[]; batchId?: string }
) {
  const where = trashFilter(householdId, sel);
  if (!where) throw new Error("Informe itens ou lote — obrigatório");

  const restored: Array<{ id: string; label: string }> = [];
  const skipped: Array<{ id: string; label: string; motivo: string }> = [];

  await db.transaction(async (tx) => {
    const items = await tx.select().from(trashItems).where(where);
    items.sort(
      (a, b) =>
        RESTORE_ORDER.indexOf(a.entityType as TrashEntity) -
        RESTORE_ORDER.indexOf(b.entityType as TrashEntity)
    );

    for (const item of items) {
      const type = item.entityType as TrashEntity;
      const data: Row = { ...(item.data as Row) };

      let blocked: string | null = null;
      for (const fk of OUTBOUND[type]) {
        const target = data[fk.column];
        if (target == null) continue;
        const exists = await tx.execute(
          sql`select 1 from ${sql.identifier(fk.table)} where id = ${String(target)} limit 1`
        );
        if (exists.rows.length) continue;
        if (fk.required) {
          blocked = `depende de ${fk.table} que não existe mais`;
          break;
        }
        data[fk.column] = null;
      }
      if (blocked) {
        skipped.push({ id: item.id, label: item.label, motivo: blocked });
        continue;
      }

      const table = sql.identifier(TABLE[type]);
      const ins = await tx.execute(
        sql`insert into ${table} select * from jsonb_populate_record(null::${table}, ${JSON.stringify(data)}::jsonb) on conflict do nothing returning id`
      );
      if (!ins.rows.length) {
        skipped.push({ id: item.id, label: item.label, motivo: "já existe um registro igual (ex.: importado de novo)" });
        continue;
      }

      for (const link of (item.links as Link[] | null) ?? []) {
        if (!link.ids.length) continue;
        await tx.execute(
          sql`update ${sql.identifier(link.table)} set ${sql.identifier(link.column)} = ${item.entityId}::uuid where id in (${idList(link.ids)}) and ${sql.identifier(link.column)} is null`
        );
      }
      await tx.delete(trashItems).where(eq(trashItems.id, item.id));
      restored.push({ id: item.id, label: item.label });
    }
  });

  return { restored, skipped };
}

/** Apaga DEFINITIVAMENTE (só pelas telas). Remove também o PDF do Blob. */
export async function purgeTrash(
  householdId: string,
  sel: { itemIds?: string[]; batchId?: string; all?: boolean }
) {
  const where = sel.all ? eq(trashItems.householdId, householdId) : trashFilter(householdId, sel);
  if (!where) throw new Error("Informe itens ou lote — obrigatório");
  const removed = await db.delete(trashItems).where(where).returning();
  for (const item of removed) {
    const blobUrl = item.entityType === "upload" ? (item.data as Row).blob_url : null;
    if (typeof blobUrl === "string" && blobUrl.startsWith("http")) {
      try {
        await del(blobUrl);
      } catch (err) {
        console.warn("[purgeTrash] del do blob falhou:", err);
      }
    }
  }
  return { removed: removed.length };
}

export async function listTrash(householdId: string, limit = 500) {
  return db
    .select({
      id: trashItems.id,
      batchId: trashItems.batchId,
      entityType: trashItems.entityType,
      entityId: trashItems.entityId,
      label: trashItems.label,
      reason: trashItems.reason,
      deletedVia: trashItems.deletedVia,
      deletedAt: trashItems.deletedAt,
    })
    .from(trashItems)
    .where(eq(trashItems.householdId, householdId))
    .orderBy(desc(trashItems.deletedAt))
    .limit(limit);
}
