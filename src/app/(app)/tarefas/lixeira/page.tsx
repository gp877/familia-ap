import { WsTrashActions } from "@/components/ws/ws-trash-actions";
import { getCurrentUser } from "@/lib/auth-helpers";
import { listArchived } from "@/lib/workspace";

const TIPO: Record<string, string> = { database: "banco", row: "item", page: "página" };

/** Lixeira do espaço: páginas, bancos e tarefas excluídos (com tudo que foi junto). */
export default async function WsLixeira() {
  const user = await getCurrentUser();
  if (!user) return null;
  const items = await listArchived({ userId: user.userId, householdId: user.householdId });
  return (
    <div style={{ maxWidth: 860, margin: "0 auto", padding: "16px 20px 40px" }}>
      <h1 style={{ fontSize: 30, fontWeight: 700, margin: "8px 0 4px" }}>🗑️ Lixeira</h1>
      <p style={{ fontSize: 13, color: "var(--muted)", margin: "0 0 16px" }}>
        O que foi excluído no espaço de trabalho. Restaurar devolve a página com tudo que estava dentro dela.
      </p>
      {items.length === 0 && <div style={{ fontSize: 13, color: "var(--muted)" }}>Lixeira vazia.</div>}
      <div style={{ display: "flex", flexDirection: "column" }}>
        {items.map((i) => (
          <div key={i.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 6px", borderBottom: "0.5px solid var(--line)", flexWrap: "wrap" }}>
            <span style={{ fontSize: 18 }}>{i.icon ?? (i.kind === "database" ? "🗂️" : "📄")}</span>
            <div style={{ flex: "1 1 220px", minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 500 }}>{i.title || "Sem título"}</div>
              <div style={{ fontSize: 11.5, color: "var(--muted)" }}>
                {TIPO[i.kind] ?? "página"} · excluído em {i.archivedAt?.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}
                {i.archivedVia === "agent" && <span style={{ color: "var(--accent)", fontWeight: 700 }}> · pela IA</span>}
              </div>
            </div>
            <WsTrashActions id={i.id} />
          </div>
        ))}
      </div>
    </div>
  );
}
