import { desc, eq, sql } from "drizzle-orm";
import Link from "next/link";

import { BigNumber, Card, Pill, SectionRow } from "@/components/ap/atoms";
import { ScreenShell } from "@/components/ap/screen-shell";
import { auth } from "@/auth";
import { db } from "@/db";
import {
  supermercadoPedidoItens,
  supermercadoPedidos,
  users,
} from "@/db/schema";

function formatDate(d: string | Date) {
  return new Date(d).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "2-digit",
  });
}

export default async function HistoricoPedidosPage() {
  const session = await auth();
  if (!session?.user?.id) return null;
  const dbUser = await db.query.users.findFirst({
    where: eq(users.id, session.user.id),
  });
  if (!dbUser?.householdId) return null;

  const pedidos = await db.query.supermercadoPedidos.findMany({
    where: eq(supermercadoPedidos.householdId, dbUser.householdId),
    orderBy: [desc(supermercadoPedidos.createdAt)],
  });

  // Total de itens por pedido
  const stats = await db
    .select({
      pedidoId: supermercadoPedidoItens.pedidoId,
      count: sql<number>`count(*)::int`,
      checked: sql<number>`count(*) filter (where ${supermercadoPedidoItens.isChecked} = true)::int`,
      total: sql<string>`coalesce(sum(${supermercadoPedidoItens.quantity}::numeric * coalesce(${supermercadoPedidoItens.estimatedPrice}::numeric, 0)), 0)::text`,
    })
    .from(supermercadoPedidoItens)
    .groupBy(supermercadoPedidoItens.pedidoId);
  const byId = new Map(stats.map((s) => [s.pedidoId, s]));

  const draftCount = pedidos.filter((p) => p.status === "draft").length;
  const receivedCount = pedidos.filter((p) => p.status === "received").length;

  return (
    <ScreenShell
      userQ="Quais pedidos já fizemos?"
      insight={
        pedidos.length === 0 ? (
          <>Nenhum pedido ainda. Inicie pelo botão "Gerar das faltas" na home.</>
        ) : (
          <>
            <b>{receivedCount}</b> pedidos recebidos · {draftCount} em andamento.
          </>
        )
      }
    >
      <SectionRow icon="bag" label="Histórico de pedidos" action={`${pedidos.length}`} />

      <BigNumber
        value={String(pedidos.length)}
        sub={`${receivedCount} recebidos · ${draftCount} em rascunho`}
      />

      <div style={{ padding: "20px 16px 0", display: "flex", flexDirection: "column", gap: 8 }}>
        {pedidos.length === 0 ? (
          <div style={{ fontSize: 13, color: "var(--muted)", textAlign: "center", padding: "20px 0" }}>
            Nenhum pedido.
          </div>
        ) : (
          pedidos.map((p) => {
            const s = byId.get(p.id);
            const total = parseFloat(s?.total ?? "0");
            return (
              <Link
                key={p.id}
                href={`/supermercado/pedidos/${p.id}`}
                style={{ textDecoration: "none", color: "inherit" }}
              >
                <Card pad={12}>
                  <div style={{ display: "grid", gridTemplateColumns: "auto 1fr auto", gap: 10, alignItems: "center" }}>
                    <div style={{ textAlign: "center" }}>
                      <div
                        className="ap-num"
                        style={{
                          fontSize: 18,
                          fontWeight: 800,
                          color: p.status === "received" ? "var(--ok)" : p.status === "sent" ? "var(--accent)" : "var(--ink-d)",
                          letterSpacing: "-0.04em",
                          lineHeight: 1,
                        }}
                      >
                        {String(new Date(p.createdAt).getDate()).padStart(2, "0")}
                      </div>
                      <div style={{ fontSize: 9, color: "var(--muted)", letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 700, marginTop: 2 }}>
                        {new Date(p.createdAt).toLocaleDateString("pt-BR", { month: "short" }).replace(".", "")}
                      </div>
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700 }}>{p.title}</div>
                      <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 1 }}>
                        {s?.count ?? 0} itens
                        {p.status === "received" && s && ` · ${s.checked}/${s.count} marcados`}
                        {total > 0 && ` · est. R$ ${total.toFixed(2).replace(".", ",")}`}
                      </div>
                    </div>
                    <Pill
                      tone={
                        p.status === "received"
                          ? "ok"
                          : p.status === "sent"
                            ? "accent"
                            : "muted"
                      }
                    >
                      {p.status === "draft"
                        ? "rascunho"
                        : p.status === "sent"
                          ? "enviado"
                          : p.status === "received"
                            ? "recebido"
                            : "cancelado"}
                    </Pill>
                  </div>
                </Card>
              </Link>
            );
          })
        )}
      </div>
    </ScreenShell>
  );
}
