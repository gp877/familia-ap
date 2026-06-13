import { desc, eq, sql } from "drizzle-orm";
import Link from "next/link";

import { BigNumber, Card, Pill, SectionRow } from "@/components/ap/atoms";
import { DeleteBtn } from "@/components/ap/inline-form";
import { ScreenShell } from "@/components/ap/screen-shell";
import {
  createContagemAndGo,
  deleteContagem,
} from "@/app/actions/supermercado";
import { auth } from "@/auth";
import { db } from "@/db";
import {
  supermercadoContagemItens,
  supermercadoContagens,
  users,
} from "@/db/schema";

function formatDate(d: string | Date) {
  return new Date(d).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "2-digit",
  });
}

export default async function ContagensPage() {
  const session = await auth();
  if (!session?.user?.id) return null;
  const dbUser = await db.query.users.findFirst({
    where: eq(users.id, session.user.id),
  });
  if (!dbUser?.householdId) return null;

  const contagens = await db.query.supermercadoContagens.findMany({
    where: eq(supermercadoContagens.householdId, dbUser.householdId),
    orderBy: [desc(supermercadoContagens.contagemDate), desc(supermercadoContagens.createdAt)],
  });

  // Counts por contagem
  const counts = await db
    .select({
      contagemId: supermercadoContagemItens.contagemId,
      total: sql<number>`count(*)::int`,
      counted: sql<number>`count(*) filter (where ${supermercadoContagemItens.countedQty} is not null)::int`,
    })
    .from(supermercadoContagemItens)
    .groupBy(supermercadoContagemItens.contagemId);
  const countsById = new Map(counts.map((c) => [c.contagemId, c]));

  const aberta = contagens.find((c) => c.status === "open");

  return (
    <ScreenShell
      userQ="Quando contamos pela última vez?"
      insight={
        aberta ? (
          <>Contagem em andamento desde {formatDate(aberta.contagemDate)}. Continue de onde parou.</>
        ) : contagens.length > 0 ? (
          <>
            Última contagem: <b>{formatDate(contagens[0].contagemDate)}</b>. Quando quiser revisar o estoque, inicie uma nova.
          </>
        ) : (
          <>Nenhuma contagem ainda. A contagem é o registro do que tem no momento — ajuda a gerar pedidos baseados no estoque mínimo.</>
        )
      }
    >
      <SectionRow icon="cal" label="Contagens" action={`${contagens.length}`} />

      <BigNumber
        value={String(contagens.length)}
        sub={`contagens registradas${aberta ? " · 1 aberta" : ""}`}
        accent={!!aberta}
      />

      {/* CTA principal */}
      <div style={{ padding: "12px 16px 0" }}>
        {aberta ? (
          <Link
            href={`/supermercado/contagens/${aberta.id}`}
            style={{
              display: "block",
              padding: "14px 18px",
              borderRadius: 14,
              background: "var(--accent)",
              color: "var(--accent-on)",
              fontWeight: 700,
              fontSize: 14,
              textAlign: "center",
              textDecoration: "none",
            }}
          >
            Continuar contagem em andamento →
          </Link>
        ) : (
          <form action={createContagemAndGo}>
            <button
              type="submit"
              style={{
                width: "100%",
                padding: "14px 18px",
                borderRadius: 14,
                background: "var(--accent)",
                color: "var(--accent-on)",
                border: "none",
                fontWeight: 700,
                fontSize: 14,
                cursor: "pointer",
              }}
            >
              + Iniciar nova contagem
            </button>
          </form>
        )}
      </div>

      {/* Lista de contagens */}
      <SectionRow icon="cal" label="Histórico" action={`${contagens.length}`} />
      <div style={{ padding: "0 16px 20px", display: "flex", flexDirection: "column", gap: 8 }}>
        {contagens.length === 0 ? (
          <div style={{ fontSize: 13, color: "var(--muted)", textAlign: "center", padding: "20px 0" }}>
            Nenhuma contagem ainda.
          </div>
        ) : (
          contagens.map((c) => {
            const stats = countsById.get(c.id);
            const total = stats?.total ?? 0;
            const counted = stats?.counted ?? 0;
            return (
              <Link
                key={c.id}
                href={`/supermercado/contagens/${c.id}`}
                style={{ textDecoration: "none", color: "inherit" }}
              >
                <Card pad={12}>
                  <div style={{ display: "grid", gridTemplateColumns: "auto 1fr auto auto", gap: 12, alignItems: "center" }}>
                    <div style={{ textAlign: "center" }}>
                      <div
                        className="ap-num"
                        style={{
                          fontSize: 18,
                          fontWeight: 800,
                          color: c.status === "open" ? "var(--accent)" : "var(--ink-d)",
                          letterSpacing: "-0.04em",
                          lineHeight: 1,
                        }}
                      >
                        {String(new Date(c.contagemDate).getDate()).padStart(2, "0")}
                      </div>
                      <div style={{ fontSize: 9, color: "var(--muted)", letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 700, marginTop: 2 }}>
                        {new Date(c.contagemDate).toLocaleDateString("pt-BR", { month: "short" }).replace(".", "")}
                      </div>
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700 }}>
                        Contagem de {formatDate(c.contagemDate)}
                      </div>
                      <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 1 }}>
                        {counted}/{total} {counted === total && total > 0 ? "(completa)" : "contados"}
                        {c.pedidoId && " · gerou pedido"}
                      </div>
                    </div>
                    <Pill tone={c.status === "open" ? "accent" : "muted"}>
                      {c.status === "open" ? "aberta" : "fechada"}
                    </Pill>
                    {c.status === "open" && (
                      <form action={deleteContagem}>
                        <input type="hidden" name="id" value={c.id} />
                        <DeleteBtn
                          action={async () => {
                            const fd = new FormData();
                            fd.set("id", c.id);
                            await deleteContagem(fd);
                          }}
                          confirmMsg={null}
                        />
                      </form>
                    )}
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
