import { SectionRow } from "@/components/ap/atoms";
import { ScreenShell } from "@/components/ap/screen-shell";
import { getCurrentUser } from "@/lib/auth-helpers";
import { listTrash } from "@/lib/trash";

import { BatchActions, EmptyTrashButton } from "./trash-actions";

/**
 * Lixeira do financeiro — tudo que foi excluído (pelas telas ou pelo
 * assistente de IA), agrupado por exclusão. Restaurar devolve como estava.
 */
export default async function LixeiraPage() {
  const user = await getCurrentUser();
  if (!user) return null;

  const items = await listTrash(user.householdId);
  const batches = new Map<string, typeof items>();
  for (const i of items) batches.set(i.batchId, [...(batches.get(i.batchId) ?? []), i]);

  return (
    <ScreenShell
      insight={
        items.length === 0 ? (
          <>Lixeira vazia. Tudo que for excluído no financeiro vem pra cá e pode ser restaurado.</>
        ) : (
          <>
            <b>{items.length}</b> {items.length === 1 ? "item" : "itens"} em {batches.size}{" "}
            {batches.size === 1 ? "exclusão" : "exclusões"}. Restaurar devolve tudo como estava.
          </>
        )
      }
    >
      <SectionRow icon="file" label="Lixeira" action={<EmptyTrashButton count={items.length} />} />

      <div style={{ padding: "0 20px", display: "flex", flexDirection: "column", gap: 8 }}>
        {[...batches.entries()].map(([batchId, list]) => {
          const first = list[0];
          const byAgent = first.deletedVia === "agent";
          const shown = list.filter((i) => i.entityType !== "transaction").concat(
            list.filter((i) => i.entityType === "transaction")
          );
          return (
            <div
              key={batchId}
              style={{
                padding: "12px 12px",
                borderRadius: 12,
                border: "0.5px solid var(--line-d)",
                display: "flex",
                flexDirection: "column",
                gap: 8,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--ink)" }}>
                    {first.reason ?? "Exclusão"}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>
                    {first.deletedAt.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })} ·{" "}
                    {list.length} {list.length === 1 ? "item" : "itens"}
                    {byAgent && (
                      <span style={{ color: "var(--accent)", fontWeight: 800, marginLeft: 6 }}>· pela IA</span>
                    )}
                  </div>
                </div>
                <BatchActions batchId={batchId} count={list.length} />
              </div>
              <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12, color: "var(--muted-d)" }}>
                {shown.slice(0, 8).map((i) => (
                  <li key={i.id} style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {i.label}
                  </li>
                ))}
                {shown.length > 8 && <li>… e mais {shown.length - 8}</li>}
              </ul>
            </div>
          );
        })}
      </div>
    </ScreenShell>
  );
}
