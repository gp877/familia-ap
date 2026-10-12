"use server";

import { revalidatePath } from "next/cache";

import { requireUserAndHousehold } from "@/lib/auth-helpers";
import { purgeTrash, restoreFromTrash } from "@/lib/trash";

/** Restaura um lote inteiro da Lixeira. Devolve o que não pôde voltar. */
export async function restoreTrashBatch(batchId: string) {
  const { householdId } = await requireUserAndHousehold();
  const r = await restoreFromTrash(householdId, { batchId });
  revalidatePath("/financeiro", "layout");
  return { restored: r.restored.length, skipped: r.skipped };
}

/** Apaga um lote DEFINITIVAMENTE (inclui o PDF guardado). */
export async function purgeTrashBatch(batchId: string) {
  const { householdId } = await requireUserAndHousehold();
  const r = await purgeTrash(householdId, { batchId });
  revalidatePath("/financeiro/lixeira");
  return r;
}

/** Esvazia a Lixeira inteira, DEFINITIVAMENTE. */
export async function emptyTrash() {
  const { householdId } = await requireUserAndHousehold();
  const r = await purgeTrash(householdId, { all: true });
  revalidatePath("/financeiro/lixeira");
  return r;
}
