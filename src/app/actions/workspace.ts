"use server";

import { revalidatePath } from "next/cache";

import { requireUserAndHousehold } from "@/lib/auth-helpers";
import {
  type WsActor,
  addOption,
  archivePage,
  createPage,
  moveRow,
  purgePage,
  restorePage,
  setOptionArchived,
  setRowProps,
  setVisibility,
  updateDatabase,
  updatePage,
} from "@/lib/workspace";
import type { Block, DbSchema, PropValue, View } from "@/lib/workspace-model";

async function actor(): Promise<WsActor> {
  const u = await requireUserAndHousehold();
  return { userId: u.userId, householdId: u.householdId, via: "app" };
}

const refresh = () => {
  revalidatePath("/tarefas", "layout");
  revalidatePath("/compras", "layout");
};

export async function wsCreatePage(input: {
  parentId?: string | null;
  kind: "page" | "database" | "row";
  title?: string;
  props?: Record<string, PropValue>;
}) {
  const page = await createPage(await actor(), input);
  refresh();
  return { id: page.id };
}

export async function wsRename(id: string, title: string) {
  await updatePage(await actor(), id, { title });
  refresh();
}

export async function wsSetIcon(id: string, icon: string | null) {
  await updatePage(await actor(), id, { icon });
  refresh();
}

/** Salva os blocos (chamado com debounce pelo editor — sem revalidar a árvore). */
export async function wsSaveContent(id: string, content: Block[]) {
  await updatePage(await actor(), id, { content });
}

export async function wsSetRowProps(rowId: string, values: Record<string, PropValue>) {
  await setRowProps(await actor(), rowId, values);
  refresh();
}

export async function wsUpdateDatabase(id: string, patch: { schema?: DbSchema; views?: View[] }) {
  await updateDatabase(await actor(), id, patch);
  refresh();
}

export async function wsReorder(ids: string[]) {
  const a = await actor();
  for (let i = 0; i < ids.length; i++) await updatePage(a, ids[i], { sortOrder: i });
  refresh();
}

export async function wsArchive(id: string) {
  await archivePage(await actor(), id);
  refresh();
}

export async function wsRestore(id: string) {
  const r = await restorePage(await actor(), id);
  refresh();
  return r;
}

export async function wsPurge(id: string) {
  await purgePage(await actor(), id);
  refresh();
}

export async function wsSetVisibility(id: string, visibility: "private" | "household") {
  await setVisibility(await actor(), id, visibility);
  refresh();
}

/** Arrastar no quadro: muda a coluna (valores) e grava a ordem da coluna. */
export async function wsMoveRow(rowId: string, values: Record<string, PropValue> | null, orderedIds: string[]) {
  await moveRow(await actor(), rowId, values, orderedIds);
  refresh();
}

/** Cria um nome novo (ou reaproveita um igual) e já aplica na linha — tudo no servidor, de uma vez. */
export async function wsAddOptionAndSet(dbId: string, propId: string, name: string, rowId?: string, id?: string) {
  const a = await actor();
  const optId = await addOption(a, dbId, propId, name, id);
  if (rowId) await setRowProps(a, rowId, { [propId]: optId });
  refresh();
  return optId;
}

export async function wsArchiveOption(dbId: string, propId: string, optId: string, archived: boolean) {
  await setOptionArchived(await actor(), dbId, propId, optId, archived);
  refresh();
}

