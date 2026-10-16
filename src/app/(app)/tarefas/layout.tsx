import type { ReactNode } from "react";

import { WsTree } from "@/components/ws/ws-tree";
import { getCurrentUser } from "@/lib/auth-helpers";
import { ensureWorkspace, listTree } from "@/lib/workspace";

/**
 * Espaço de trabalho (Tarefas) — árvore de páginas à esquerda (no celular,
 * um botão "Páginas") e a página aberta à direita. Na 1ª visita cria o
 * espaço inicial (boas-vindas + banco Tarefas).
 */
export default async function TarefasLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  if (!user) return null;
  const actor = { userId: user.userId, householdId: user.householdId };
  await ensureWorkspace(actor);
  const tree = await listTree(actor);
  return (
    <div className="lg:flex" style={{ minHeight: "100%", width: "100%" }}>
      <WsTree
        items={tree.map((t) => ({ id: t.id, parentId: t.parentId, kind: t.kind, title: t.title, icon: t.icon, visibility: t.visibility }))}
      />
      <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
    </div>
  );
}
