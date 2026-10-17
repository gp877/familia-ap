import { DatabaseView } from "@/components/ws/database-view";
import { getCurrentUser } from "@/lib/auth-helpers";
import { getSystemDatabase, householdPeople, listRows } from "@/lib/workspace";
import type { Block, DbSchema, PropValue, View } from "@/lib/workspace-model";

/**
 * Radar de Compras: o que a família compra sempre, onde comprou, por quanto, e o melhor
 * preço que a pesquisa achou. É um banco do espaço de trabalho (systemKey "radar"); a IA
 * atualiza pela API (/api/agent/tarefas?banco_id=radar).
 */
export default async function ComprasPage() {
  const user = await getCurrentUser();
  if (!user) return null;
  const actor = { userId: user.userId, householdId: user.householdId };
  const page = await getSystemDatabase(actor, "radar");
  const [rows, people] = await Promise.all([listRows(actor, page.id), householdPeople(user.householdId)]);
  const views = (page.views as View[] | null) ?? [];

  return (
    <div style={{ padding: "16px 24px 40px" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap", margin: "4px 0 14px" }}>
        <h1 style={{ fontSize: 26, fontWeight: 800, margin: 0 }}>📡 Radar de Compras</h1>
        <span style={{ fontSize: 13, color: "var(--muted-d)" }}>
          O que compramos sempre e o melhor preço que a pesquisa achou. A IA atualiza os preços toda semana.
        </span>
      </div>
      <DatabaseView
        key={page.id}
        dbId={page.id}
        schema={(page.schema as DbSchema) ?? { properties: [] }}
        views={views.length ? views : [{ id: "default", name: "Radar", type: "table", filters: [], sorts: [] }]}
        people={people.map((p) => ({ id: p.id, name: p.name }))}
        rows={rows.map((r) => ({
          id: r.id,
          title: r.title,
          icon: r.icon,
          props: (r.props as Record<string, PropValue>) ?? {},
          sortOrder: r.sortOrder,
          createdAt: r.createdAt.toISOString(),
          createdVia: r.createdVia,
          agentUpdatedAt: r.agentUpdatedAt ? r.agentUpdatedAt.toISOString() : null,
          content: (r.content as Block[] | null) ?? [],
        }))}
      />
    </div>
  );
}
