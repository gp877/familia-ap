import { asc, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";

import { BigNumber, Pill, SectionRow } from "@/components/ap/atoms";
import { BackButton } from "@/components/ap/inline-form";
import { InlineEditInput } from "@/components/ap/inline-edit-input";
import { ScreenShell } from "@/components/ap/screen-shell";
import {
  closeContagem,
  closeContagemAndCreatePedido,
  patchContagemItem,
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
    month: "long",
    year: "numeric",
  });
}

export default async function ContagemDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) return null;
  const dbUser = await db.query.users.findFirst({
    where: eq(users.id, session.user.id),
  });
  if (!dbUser?.householdId) return null;

  const contagem = await db.query.supermercadoContagens.findFirst({
    where: eq(supermercadoContagens.id, id),
  });
  if (!contagem || contagem.householdId !== dbUser.householdId) notFound();

  const items = await db.query.supermercadoContagemItens.findMany({
    where: eq(supermercadoContagemItens.contagemId, contagem.id),
    orderBy: [asc(supermercadoContagemItens.locationSnapshot), asc(supermercadoContagemItens.nameSnapshot)],
  });

  // Agrupa por localização
  const byLocation = new Map<string, typeof items>();
  for (const it of items) {
    const loc = it.locationSnapshot || "Sem localização";
    const arr = byLocation.get(loc) ?? [];
    arr.push(it);
    byLocation.set(loc, arr);
  }
  const locations = [...byLocation.keys()].sort();

  const total = items.length;
  const counted = items.filter((i) => i.countedQty !== null).length;
  const itemsBelow = items.filter((i) => {
    if (!i.minStockSnapshot || i.countedQty === null) return false;
    return parseFloat(i.countedQty) < parseFloat(i.minStockSnapshot);
  }).length;

  const isOpen = contagem.status === "open";

  return (
    <ScreenShell
      userQ={`Contagem de ${formatDate(contagem.contagemDate)}`}
      insight={
        isOpen ? (
          <>
            <b>{counted}/{total}</b> contados.{" "}
            {itemsBelow > 0 ? (
              <>
                <b>{itemsBelow}</b> abaixo do mínimo. Encerre + gerar pedido pra resolver tudo.
              </>
            ) : counted === total ? (
              <>Tudo contado, sem faltas. Pode encerrar.</>
            ) : (
              <>Conte por localização — Enter salva cada item.</>
            )}
          </>
        ) : (
          <>Contagem fechada em {contagem.closedAt ? formatDate(contagem.closedAt) : "—"}.</>
        )
      }
    >
      <div style={{ padding: "0 20px 8px" }}>
        <BackButton href="/supermercado/contagens" label="Contagens" />
      </div>

      <SectionRow
        icon="cal"
        label={`Contagem · ${formatDate(contagem.contagemDate)}`}
        action={<Pill tone={isOpen ? "accent" : "muted"}>{isOpen ? "aberta" : "fechada"}</Pill>}
      />

      <BigNumber
        value={`${counted}/${total}`}
        sub={`itens contados${itemsBelow > 0 ? ` · ${itemsBelow} abaixo do mínimo` : ""}`}
        accent={counted === total && total > 0}
      />

      {/* Botões de ação (só se aberta) */}
      {isOpen && (
        <div style={{ padding: "12px 16px 0", display: "flex", flexDirection: "column", gap: 8 }}>
          <form action={closeContagemAndCreatePedido}>
            <input type="hidden" name="id" value={contagem.id} />
            <button
              type="submit"
              style={{
                width: "100%",
                padding: "12px 18px",
                borderRadius: 14,
                background: "var(--accent)",
                color: "var(--accent-on)",
                border: "none",
                fontWeight: 700,
                fontSize: 13.5,
                cursor: "pointer",
              }}
            >
              Encerrar + gerar pedido das faltas →
            </button>
          </form>
          <form action={closeContagem}>
            <input type="hidden" name="id" value={contagem.id} />
            <button
              type="submit"
              style={{
                width: "100%",
                padding: "10px 14px",
                borderRadius: 12,
                background: "transparent",
                color: "var(--muted-d)",
                border: "1px solid var(--line-d)",
                fontWeight: 600,
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              Só encerrar (sem pedido)
            </button>
          </form>
        </div>
      )}

      {contagem.pedidoId && (
        <div style={{ padding: "12px 16px 0" }}>
          <Link
            href={`/supermercado/pedidos/${contagem.pedidoId}`}
            style={{
              display: "block",
              padding: "10px 14px",
              borderRadius: 12,
              background: "var(--card)",
              color: "var(--ink-d)",
              textDecoration: "none",
              fontSize: 12,
              fontWeight: 600,
              border: "1px solid var(--line-d)",
              textAlign: "center",
            }}
          >
            Ver pedido gerado →
          </Link>
        </div>
      )}

      {/* Lista agrupada por localização */}
      <div style={{ padding: "14px 16px 20px", display: "flex", flexDirection: "column", gap: 14 }}>
        {locations.map((loc) => {
          const locItems = byLocation.get(loc)!;
          const locCounted = locItems.filter((i) => i.countedQty !== null).length;
          return (
            <div
              key={loc}
              style={{
                background: "var(--card)",
                borderRadius: 16,
                border: "0.5px solid var(--line-d)",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "10px 14px",
                  background: "var(--surf)",
                  borderBottom: "1px solid var(--line-d)",
                }}
              >
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 800,
                    color: "var(--ink)",
                    letterSpacing: "-0.01em",
                  }}
                >
                  {loc}
                </span>
                <span
                  style={{
                    fontSize: 10,
                    color: locCounted === locItems.length ? "var(--accent)" : "var(--muted)",
                    fontWeight: 700,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                  }}
                >
                  {locCounted}/{locItems.length}
                </span>
              </div>
              <div>
                {locItems.map((ci, i) => {
                  const cur = ci.countedQty ? parseFloat(ci.countedQty) : null;
                  const min = ci.minStockSnapshot ? parseFloat(ci.minStockSnapshot) : null;
                  const low = min !== null && cur !== null && cur < min;
                  return (
                    <div
                      key={ci.id}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr auto auto",
                        alignItems: "center",
                        gap: 10,
                        padding: "10px 14px",
                        borderBottom: i < locItems.length - 1 ? "0.5px solid var(--line-d)" : "none",
                      }}
                    >
                      <div style={{ minWidth: 0 }}>
                        <div
                          style={{
                            fontSize: 13,
                            fontWeight: 600,
                            color: cur !== null ? "var(--ink)" : "var(--muted-d)",
                          }}
                        >
                          {ci.nameSnapshot}
                        </div>
                        <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 1 }}>
                          mín {min ?? "—"} {ci.unitSnapshot}
                        </div>
                      </div>
                      {isOpen ? (
                        <div style={{ width: 80, textAlign: "right" }}>
                          <InlineEditInput
                            initialValue={ci.countedQty ?? ""}
                            action={patchContagemItem}
                            hiddenFields={{ id: ci.id }}
                            fieldName="countedQty"
                            placeholder="—"
                            fontSize={16}
                            fontWeight={800}
                            color={low ? "var(--alert)" : cur !== null ? "var(--ink)" : "var(--muted)"}
                          />
                        </div>
                      ) : (
                        <div
                          className="ap-num"
                          style={{
                            fontSize: 14,
                            fontWeight: 800,
                            color: low ? "var(--alert)" : "var(--ink)",
                            width: 60,
                            textAlign: "right",
                          }}
                        >
                          {ci.countedQty ?? "—"}
                        </div>
                      )}
                      <span
                        style={{
                          fontSize: 10,
                          color: "var(--muted)",
                          fontWeight: 700,
                          letterSpacing: "0.06em",
                          textTransform: "uppercase",
                          minWidth: 30,
                        }}
                      >
                        {ci.unitSnapshot}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </ScreenShell>
  );
}
