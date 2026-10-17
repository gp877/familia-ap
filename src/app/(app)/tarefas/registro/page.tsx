import Link from "next/link";

import { colorStyle } from "@/components/ws/colors";
import { getCurrentUser } from "@/lib/auth-helpers";
import { activityReport } from "@/lib/workspace";
import type { Color, DbSchema, PropValue } from "@/lib/workspace-model";

/**
 * Registro: o que foi concluído (arquivo) e números da produtividade.
 * Fonte: ws_activity (eventos) + tarefas com status "Concluído" sem evento
 * (concluídas antes do registro existir — usa a última atualização).
 */
const TZ = "America/Sao_Paulo";
const dia = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(d);
const DIAS = 60;
/** Hora da requisição (lida uma vez, fora da renderização). */
function agoraMs() {
  return Date.now();
}

export default async function RegistroPage() {
  const user = await getCurrentUser();
  if (!user) return null;
  const agora = agoraMs();
  const { events, tasksDb, rows } = await activityReport({ userId: user.userId, householdId: user.householdId }, DIAS);
  const schema = (tasksDb?.schema as DbSchema) ?? { properties: [] };
  const status = schema.properties.find((p) => p.type === "status");
  const doneIds = new Set((status?.options ?? []).filter((o) => o.group === "done").map((o) => o.id));
  const isDone = (props: unknown) => !!status && doneIds.has(String((props as Record<string, PropValue> | null)?.[status.id] ?? ""));
  const area = schema.properties.find((p) => p.name.toLowerCase().startsWith("área") || p.name.toLowerCase() === "area");
  const tipo = schema.properties.find((p) => p.name.toLowerCase() === "tipo");

  // ── concluídas: último evento "completed" por página (+ antigas sem evento) ──
  type Feita = { pageId: string | null; title: string; at: Date; createdAt: Date | null; props: Record<string, PropValue>; via: string; aindaFeita: boolean };
  const rowById = new Map(rows.map((r) => [r.id, r]));
  const vistas = new Set<string>();
  const feitas: Feita[] = [];
  for (const e of events) {
    if (e.type !== "completed") continue;
    const key = e.pageId ?? e.id;
    if (vistas.has(key)) continue;
    vistas.add(key);
    const row = e.pageId ? rowById.get(e.pageId) : undefined;
    feitas.push({
      pageId: e.pageId,
      title: row?.title ?? e.title,
      at: e.createdAt,
      createdAt: row?.createdAt ?? null,
      props: (row?.props as Record<string, PropValue>) ?? (e.props as Record<string, PropValue>) ?? {},
      via: e.via,
      aindaFeita: row ? isDone(row.props) : true,
    });
  }
  for (const r of rows) {
    if (vistas.has(r.id) || !isDone(r.props)) continue;
    feitas.push({ pageId: r.id, title: r.title, at: r.updatedAt, createdAt: r.createdAt, props: (r.props as Record<string, PropValue>) ?? {}, via: r.agentUpdatedAt ? "agent" : "app", aindaFeita: true });
  }
  const valid = feitas.filter((f) => f.aindaFeita).sort((a, b) => +b.at - +a.at);

  // ── números ──
  const hoje = dia(new Date(agora));
  const ha = (n: number) => agora - n * 864e5;
  const conta = (n: number) => valid.filter((f) => +f.at >= ha(n)).length;
  const criadas7 = events.filter((e) => e.type === "created" && +e.createdAt >= ha(7)).length;
  const abertas = rows.filter((r) => !isDone(r.props)).length;
  const tempos = valid.filter((f) => f.createdAt && +f.at >= ha(30)).map((f) => (+f.at - +f.createdAt!) / 864e5);
  const tempoMedio = tempos.length ? tempos.reduce((s, x) => s + x, 0) / tempos.length : null;
  const pelaIa = valid.filter((f) => +f.at >= ha(30) && f.via === "agent").length;

  // ── últimos 14 dias ──
  const dias14 = Array.from({ length: 14 }, (_, i) => dia(new Date(agora - (13 - i) * 864e5)));
  const porDia = dias14.map((d) => ({
    d,
    feitas: valid.filter((f) => dia(f.at) === d).length,
    criadas: events.filter((e) => e.type === "created" && dia(e.createdAt) === d).length,
  }));
  const maxDia = Math.max(1, ...porDia.map((x) => Math.max(x.feitas, x.criadas)));

  // ── por área / tipo (30 dias) ──
  const agrupar = (propId?: string) => {
    if (!propId) return [];
    const prop = schema.properties.find((p) => p.id === propId)!;
    const m = new Map<string, number>();
    for (const f of valid.filter((x) => +x.at >= ha(30))) {
      const k = String(f.props?.[propId] ?? "");
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return [...m.entries()]
      .map(([k, n]) => {
        const o = prop.options?.find((x) => x.id === k);
        return { nome: o?.name ?? "Sem " + prop.name.toLowerCase(), cor: (o?.color ?? "gray") as Color, n };
      })
      .sort((a, b) => b.n - a.n);
  };
  const porArea = agrupar(area?.id);
  const porTipo = agrupar(tipo?.id);

  // ── lista por dia ──
  const grupos = new Map<string, Feita[]>();
  for (const f of valid) grupos.set(dia(f.at), [...(grupos.get(dia(f.at)) ?? []), f]);
  const nomeDia = (d: string) => {
    if (d === hoje) return "Hoje";
    if (d === dia(new Date(ha(1)))) return "Ontem";
    return new Date(d + "T12:00:00Z").toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "short", timeZone: "UTC" });
  };
  const chip = (propId: string | undefined, props: Record<string, PropValue>) => {
    if (!propId) return null;
    const o = schema.properties.find((p) => p.id === propId)?.options?.find((x) => x.id === props?.[propId]);
    return o ? (
      <span style={{ ...colorStyle(o.color), fontSize: 11, padding: "0 5px", borderRadius: 4, lineHeight: "17px", whiteSpace: "nowrap" }}>{o.name}</span>
    ) : null;
  };

  return (
    <div style={{ maxWidth: 980, margin: "0 auto", padding: "16px 20px 40px" }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, margin: "4px 0 2px" }}>📈 Registro</h1>
      <p style={{ fontSize: 12.5, color: "var(--muted)", margin: "0 0 14px" }}>O que você concluiu (arquivo) e o ritmo das tarefas. Últimos {DIAS} dias.</p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 8, marginBottom: 16 }}>
        {[
          ["Concluídas hoje", String(valid.filter((f) => dia(f.at) === hoje).length)],
          ["Últimos 7 dias", String(conta(7))],
          ["Últimos 30 dias", String(conta(30))],
          ["Criadas em 7 dias", String(criadas7)],
          ["Abertas agora", String(abertas)],
          ["Tempo médio p/ concluir", tempoMedio == null ? "—" : tempoMedio < 1 ? "< 1 dia" : `${tempoMedio.toFixed(1).replace(".", ",")} dias`],
        ].map(([l, v]) => (
          <div key={l} style={{ background: "var(--surf)", borderRadius: 10, padding: "10px 12px" }}>
            <div style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.04em", fontWeight: 700 }}>{l}</div>
            <div style={{ fontSize: 22, fontWeight: 700, marginTop: 2 }}>{v}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 12, marginBottom: 18 }}>
        <section style={{ background: "var(--surf)", borderRadius: 10, padding: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--muted-d)", marginBottom: 8 }}>
            Últimos 14 dias <span style={{ color: "var(--accent)" }}>■ concluídas</span> <span style={{ color: "var(--muted)" }}>■ criadas</span>
          </div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 110 }}>
            {porDia.map((x) => (
              <div key={x.d} title={`${x.d.split("-").reverse().slice(0, 2).join("/")}: ${x.feitas} concluídas, ${x.criadas} criadas`} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2, height: "100%", justifyContent: "flex-end" }}>
                <div style={{ display: "flex", gap: 1, alignItems: "flex-end", height: 90, width: "100%", justifyContent: "center" }}>
                  <div style={{ width: "42%", height: `${(x.feitas / maxDia) * 100}%`, minHeight: x.feitas ? 3 : 0, background: "var(--accent)", borderRadius: 2 }} />
                  <div style={{ width: "42%", height: `${(x.criadas / maxDia) * 100}%`, minHeight: x.criadas ? 3 : 0, background: "var(--muted)", opacity: 0.6, borderRadius: 2 }} />
                </div>
                <span style={{ fontSize: 9.5, color: "var(--muted)" }}>{Number(x.d.slice(8))}</span>
              </div>
            ))}
          </div>
        </section>
        {[
          ["Concluídas por área (30 dias)", porArea],
          ["Concluídas por tipo (30 dias)", porTipo],
        ].map(([titulo, lista]) => (
          <section key={titulo as string} style={{ background: "var(--surf)", borderRadius: 10, padding: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--muted-d)", marginBottom: 8 }}>{titulo as string}</div>
            {(lista as Array<{ nome: string; cor: Color; n: number }>).length === 0 && <div style={{ fontSize: 12.5, color: "var(--muted)" }}>Nada concluído ainda.</div>}
            {(lista as Array<{ nome: string; cor: Color; n: number }>).map((x) => {
              const max = Math.max(...(lista as Array<{ n: number }>).map((y) => y.n));
              return (
                <div key={x.nome} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, fontSize: 12.5 }}>
                  <span style={{ width: 92, flexShrink: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{x.nome}</span>
                  <div style={{ flex: 1, background: "var(--card)", borderRadius: 3, height: 10 }}>
                    <div style={{ ...colorStyle(x.cor), width: `${(x.n / max) * 100}%`, height: 10, borderRadius: 3 }} />
                  </div>
                  <span style={{ width: 22, textAlign: "right", fontWeight: 700 }}>{x.n}</span>
                </div>
              );
            })}
          </section>
        ))}
      </div>

      <div style={{ fontSize: 12, fontWeight: 700, color: "var(--muted-d)", textTransform: "uppercase", letterSpacing: "0.05em", margin: "0 0 6px" }}>
        Concluídas ({valid.length}) {pelaIa > 0 && <span style={{ textTransform: "none", fontWeight: 500, color: "var(--muted)" }}>· {pelaIa} com a IA em 30 dias</span>}
      </div>
      {valid.length === 0 && (
        <div style={{ fontSize: 13, color: "var(--muted)", padding: "8px 0" }}>Quando você concluir tarefas (bolinha ○), elas aparecem aqui, organizadas por dia.</div>
      )}
      {[...grupos.entries()].map(([d, lista]) => (
        <div key={d} style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 12, color: "var(--muted-d)", fontWeight: 600, padding: "6px 0 4px", textTransform: "capitalize" }}>
            {nomeDia(d)} · {lista.length}
          </div>
          {lista.map((f, i) => {
            const diasAberta = f.createdAt ? Math.max(0, Math.round((+f.at - +f.createdAt) / 864e5)) : null;
            return (
              <div key={(f.pageId ?? "") + i} className="ws-row" style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 6px", borderBottom: "0.5px solid var(--line)", flexWrap: "wrap" }}>
                <span style={{ color: "var(--accent)", fontWeight: 800 }}>✓</span>
                <span style={{ fontSize: 11.5, color: "var(--muted)", width: 38 }}>{f.at.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: TZ })}</span>
                {f.pageId ? (
                  <Link href={`/tarefas/${f.pageId}`} style={{ flex: "1 1 240px", minWidth: 0, color: "var(--ink)", textDecoration: "none", fontSize: 13.5 }}>
                    {f.title || "Sem título"}
                  </Link>
                ) : (
                  <span style={{ flex: "1 1 240px", minWidth: 0, fontSize: 13.5, color: "var(--muted-d)" }}>{f.title} (apagada)</span>
                )}
                {chip(area?.id, f.props)}
                {chip(tipo?.id, f.props)}
                {diasAberta != null && <span style={{ fontSize: 11, color: "var(--muted)" }}>{diasAberta === 0 ? "no mesmo dia" : `em ${diasAberta}d`}</span>}
                {f.via === "agent" && <span style={{ fontSize: 10, fontWeight: 800, color: "var(--accent)" }}>IA</span>}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
