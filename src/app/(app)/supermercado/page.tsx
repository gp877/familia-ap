import { and, asc, desc, eq, sql } from "drizzle-orm";
import Link from "next/link";

import { BigNumber, Card, Pill, SectionRow } from "@/components/ap/atoms";
import { Icon } from "@/components/ap/icon";
import { ScreenShell } from "@/components/ap/screen-shell";
import {
  createContagemAndGo,
  createEmptyPedidoAndGo,
  createPedidoFromShortfallAndGo,
} from "@/app/actions/supermercado";
import { auth } from "@/auth";
import { db } from "@/db";
import {
  supermercadoContagens,
  supermercadoItens,
  supermercadoPedidos,
  users,
} from "@/db/schema";

export default async function SupermercadoPage() {
  const session = await auth();
  if (!session?.user?.id) return null;
  const dbUser = await db.query.users.findFirst({
    where: eq(users.id, session.user.id),
  });
  if (!dbUser?.householdId) return null;

  const householdId = dbUser.householdId;

  const items = await db.query.supermercadoItens.findMany({
    where: eq(supermercadoItens.householdId, householdId),
    orderBy: [asc(supermercadoItens.sortOrder), asc(supermercadoItens.name)],
  });

  const itemsNeedingBuy = items.filter((i) => {
    if (!i.minStock) return false;
    const cur = i.currentStock ? parseFloat(i.currentStock) : 0;
    const min = parseFloat(i.minStock);
    return cur < min;
  });
  const shortfallTotal = itemsNeedingBuy.reduce((sum, i) => {
    const min = parseFloat(i.minStock!);
    const cur = i.currentStock ? parseFloat(i.currentStock) : 0;
    return sum + Math.max(0, min - cur);
  }, 0);

  const contagemAberta = await db.query.supermercadoContagens.findFirst({
    where: and(
      eq(supermercadoContagens.householdId, householdId),
      eq(supermercadoContagens.status, "open")
    ),
  });

  const contagensRecentes = await db.query.supermercadoContagens.findMany({
    where: eq(supermercadoContagens.householdId, householdId),
    orderBy: [desc(supermercadoContagens.contagemDate)],
    limit: 3,
  });

  const draftPedidos = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(supermercadoPedidos)
    .where(
      and(
        eq(supermercadoPedidos.householdId, householdId),
        eq(supermercadoPedidos.status, "draft")
      )
    )
    .then((r) => r[0]?.c ?? 0);

  const pedidos = await db.query.supermercadoPedidos.findMany({
    where: eq(supermercadoPedidos.householdId, householdId),
    orderBy: [desc(supermercadoPedidos.createdAt)],
    limit: 6,
  });

  const cycleStatus = contagemAberta
    ? "contagem"
    : draftPedidos > 0
      ? "pedido"
      : "ocioso";

  return (
    <ScreenShell
      userQ="Vamos organizar a compra?"
      insight={
        contagemAberta ? (
          <>
            Contagem <b>em andamento</b>. Continue de onde parou e gere o pedido ao final.
          </>
        ) : itemsNeedingBuy.length > 0 ? (
          <>
            <b>{itemsNeedingBuy.length}</b> {itemsNeedingBuy.length === 1 ? "item" : "itens"} abaixo do mínimo. Faltam <b>{shortfallTotal.toFixed(0)}</b> unidades no total.
          </>
        ) : items.length > 0 ? (
          <>Estoque OK. Faça uma contagem quando quiser revisar.</>
        ) : (
          <>Cadastre os produtos primeiro em <Link href="/supermercado/produtos" style={{ color: "var(--accent)", fontWeight: 700 }}>Produtos</Link>.</>
        )
      }
    >
      <SectionRow icon="bag" label="Supermercado" />

      <BigNumber
        value={String(itemsNeedingBuy.length)}
        sub={`${itemsNeedingBuy.length === 1 ? "item" : "itens"} abaixo do mínimo · ${items.length} cadastrados`}
        accent={itemsNeedingBuy.length > 0}
      />

      {/* Ciclo de compra — cards "passo a passo" */}
      <div style={{ padding: "14px 16px 0" }}>
        <div
          style={{
            fontSize: 9.5,
            color: "var(--muted)",
            fontWeight: 800,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            marginBottom: 8,
            padding: "0 4px",
          }}
        >
          Ciclo de compra
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {/* PASSO 1: Contagem */}
          <CycleCard
            step={1}
            label="Contagem"
            active={cycleStatus === "contagem" || cycleStatus === "ocioso"}
            done={false}
          >
            {contagemAberta ? (
              <Link
                href={`/supermercado/contagens/${contagemAberta.id}`}
                style={{
                  display: "block",
                  padding: "8px 12px",
                  borderRadius: 10,
                  background: "var(--accent)",
                  color: "var(--accent-on)",
                  textAlign: "center",
                  fontSize: 12,
                  fontWeight: 700,
                  textDecoration: "none",
                  marginTop: 8,
                }}
              >
                continuar →
              </Link>
            ) : (
              <form action={createContagemAndGo}>
                <button
                  type="submit"
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    borderRadius: 10,
                    background: "var(--accent)",
                    color: "var(--accent-on)",
                    border: "none",
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: "pointer",
                    marginTop: 8,
                  }}
                >
                  iniciar nova
                </button>
              </form>
            )}
          </CycleCard>

          {/* PASSO 2: Pedido */}
          <CycleCard
            step={2}
            label="Pedido"
            active={cycleStatus === "pedido"}
            done={false}
          >
            <form action={createPedidoFromShortfallAndGo}>
              <button
                type="submit"
                disabled={itemsNeedingBuy.length === 0}
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  borderRadius: 10,
                  background:
                    itemsNeedingBuy.length === 0 ? "var(--card2)" : "var(--accent)",
                  color:
                    itemsNeedingBuy.length === 0 ? "var(--muted)" : "var(--accent-on)",
                  border: "none",
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: itemsNeedingBuy.length === 0 ? "not-allowed" : "pointer",
                  marginTop: 8,
                }}
              >
                gerar das faltas
              </button>
            </form>
            <form action={createEmptyPedidoAndGo}>
              <button
                type="submit"
                style={{
                  width: "100%",
                  padding: "6px 10px",
                  borderRadius: 10,
                  background: "transparent",
                  color: "var(--muted-d)",
                  border: "1px solid var(--line-d)",
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: "pointer",
                  marginTop: 4,
                }}
              >
                pedido vazio
              </button>
            </form>
          </CycleCard>
        </div>
      </div>

      {/* Itens com falta — preview */}
      {itemsNeedingBuy.length > 0 && (
        <>
          <SectionRow icon="bag" label="Faltando agora" action={`${itemsNeedingBuy.length}`} />
          <div style={{ padding: "0 20px" }}>
            {itemsNeedingBuy.slice(0, 8).map((item, i) => {
              const min = parseFloat(item.minStock!);
              const cur = item.currentStock ? parseFloat(item.currentStock) : 0;
              const need = Math.max(0, min - cur);
              return (
                <div
                  key={item.id}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr auto auto",
                    alignItems: "center",
                    gap: 10,
                    padding: "8px 0",
                    borderBottom:
                      i < Math.min(8, itemsNeedingBuy.length) - 1
                        ? "0.5px solid var(--line-d)"
                        : "none",
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>
                      {item.name}
                      {item.brand && (
                        <span style={{ color: "var(--muted)", fontWeight: 400, fontSize: 11, marginLeft: 4 }}>
                          · {item.brand}
                        </span>
                      )}
                    </div>
                    {item.location && (
                      <div style={{ fontSize: 10, color: "var(--muted)" }}>
                        {item.location}
                      </div>
                    )}
                  </div>
                  <span
                    style={{
                      fontSize: 11,
                      color: "var(--muted)",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {cur} de {min} {item.unit}
                  </span>
                  <span
                    className="ap-num"
                    style={{
                      fontSize: 13,
                      fontWeight: 800,
                      color: "var(--alert)",
                      minWidth: 40,
                      textAlign: "right",
                    }}
                  >
                    +{need.toFixed(0)}
                  </span>
                </div>
              );
            })}
            {itemsNeedingBuy.length > 8 && (
              <div style={{ fontSize: 11, color: "var(--muted)", textAlign: "center", padding: "8px 0" }}>
                +{itemsNeedingBuy.length - 8} outros…
              </div>
            )}
          </div>
        </>
      )}

      {/* Atalhos */}
      <SectionRow icon="bag" label="Atalhos" />
      <div
        style={{
          padding: "0 20px",
          display: "grid",
          gap: 8,
          gridTemplateColumns: "1fr 1fr",
        }}
      >
        <ShortcutLink
          href="/supermercado/produtos"
          icon="bag"
          label="Produtos"
          sub={`${items.length} cadastrados`}
        />
        <ShortcutLink
          href="/supermercado/contagens"
          icon="cal"
          label="Contagens"
          sub={`${contagensRecentes.length} recentes`}
        />
        <ShortcutLink
          href="/supermercado/historico"
          icon="bag"
          label="Histórico pedidos"
          sub={`${pedidos.length} registrados`}
        />
        <ShortcutLink
          href="/supermercado/fornecedores"
          icon="bank"
          label="Fornecedores"
          sub="e-mail e whatsapp"
        />
      </div>

      {/* Pedidos recentes */}
      {pedidos.length > 0 && (
        <>
          <SectionRow icon="bag" label="Pedidos" action={`${pedidos.length}`} />
          <div style={{ padding: "0 20px", display: "flex", flexDirection: "column", gap: 6 }}>
            {pedidos.map((p) => (
              <Link
                key={p.id}
                href={`/supermercado/pedidos/${p.id}`}
                style={{ textDecoration: "none", color: "inherit" }}
              >
                <Card pad={10}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{p.title}</div>
                      <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 1 }}>
                        {new Date(p.createdAt).toLocaleDateString("pt-BR")}
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
            ))}
          </div>
        </>
      )}
    </ScreenShell>
  );
}

function CycleCard({
  step,
  label,
  active,
  done,
  children,
}: {
  step: number;
  label: string;
  active: boolean;
  done: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        background: "var(--card)",
        borderRadius: 16,
        border: active ? "1px solid var(--accent)" : "0.5px solid var(--line-d)",
        padding: 12,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
        <span
          className="ap-num"
          style={{
            fontSize: 18,
            fontWeight: 800,
            color: done ? "var(--ok)" : active ? "var(--accent)" : "var(--muted)",
            letterSpacing: "-0.04em",
            lineHeight: 1,
          }}
        >
          {step}
        </span>
        <span style={{ fontSize: 11, fontWeight: 700, color: "var(--ink-d)" }}>
          {label}
        </span>
      </div>
      {children}
    </div>
  );
}

function ShortcutLink({
  href,
  icon,
  label,
  sub,
}: {
  href: string;
  icon: Parameters<typeof Icon>[0]["name"];
  label: string;
  sub: string;
}) {
  return (
    <Link href={href} style={{ textDecoration: "none", color: "inherit" }}>
      <div
        style={{
          padding: 12,
          borderRadius: 14,
          background: "var(--card)",
          border: "0.5px solid var(--line-d)",
          display: "flex",
          flexDirection: "column",
          gap: 4,
        }}
      >
        <Icon name={icon} size={16} color="var(--ink)" stroke={1.8} />
        <div style={{ fontSize: 13, fontWeight: 700 }}>{label}</div>
        <div style={{ fontSize: 10.5, color: "var(--muted)" }}>{sub}</div>
      </div>
    </Link>
  );
}
