import { asc, eq } from "drizzle-orm";

import { BigNumber, Card, SectionRow, Sparkline } from "@/components/ap/atoms";
import { DeleteBtn } from "@/components/ap/inline-form";
import { InlineEditInput } from "@/components/ap/inline-edit-input";
import { ScreenShell } from "@/components/ap/screen-shell";
import { createPesagem, deletePesagem, patchPesagem } from "@/app/actions/saude";
import { SubNav } from "@/app/(app)/saude-exames/page";
import { auth } from "@/auth";
import { db } from "@/db";
import { pesagens, users } from "@/db/schema";

function formatDate(d: string) {
  const [y, m, day] = d.split("-").map(Number);
  return new Date(y, m - 1, day).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
  });
}

export default async function PesoPage() {
  const session = await auth();
  if (!session?.user?.id) return null;
  const dbUser = await db.query.users.findFirst({
    where: eq(users.id, session.user.id),
  });
  if (!dbUser?.householdId) return null;

  const all = await db.query.pesagens.findMany({
    where: eq(pesagens.householdId, dbUser.householdId),
    orderBy: [asc(pesagens.weighedOn)],
  });

  const byWho = new Map<string, typeof all>();
  for (const p of all) {
    const arr = byWho.get(p.who) ?? [];
    arr.push(p);
    byWho.set(p.who, arr);
  }

  function colorFor(who: string) {
    const k = who.toUpperCase();
    if (k.startsWith("A")) return "var(--accent)";
    if (k.startsWith("M")) return "#5DA9FF";
    if (k.startsWith("F")) return "#B57FFF";
    return "var(--ink)";
  }

  const totalDelta = [...byWho.values()].reduce((sum, arr) => {
    if (arr.length < 2) return sum;
    const first = parseFloat(arr[0].weightKg);
    const last = parseFloat(arr[arr.length - 1].weightKg);
    return sum + (last - first);
  }, 0);

  const today = new Date().toISOString().slice(0, 10);

  // Known people (chips/sugestões)
  const knownPeople = byWho.size > 0 ? [...byWho.keys()] : ["Augusto", "Marília", "Francisco"];

  const allRecent = [...all].sort((a, b) => b.weighedOn.localeCompare(a.weighedOn)).slice(0, 30);

  return (
    <ScreenShell
      userQ="Como tá o peso nosso essas semanas?"
      insight={
        all.length === 0 ? (
          <>Cadastre a primeira pesagem · data, quem e peso. Enter salva.</>
        ) : totalDelta < 0 ? (
          <>
            Perderam <b>{Math.abs(totalDelta).toFixed(1)} kg</b> combinado. Continuem.
          </>
        ) : (
          <>
            Variação combinada: <b>{totalDelta >= 0 ? "+" : ""}{totalDelta.toFixed(1)} kg</b>.
          </>
        )
      }
    >
      <SubNav active="peso" />
      <SectionRow icon="weight" label="Peso" action={`${all.length}`} />

      <BigNumber
        value={
          totalDelta < 0
            ? `−${Math.abs(totalDelta).toFixed(1)} kg`
            : `${totalDelta >= 0 ? "+" : ""}${totalDelta.toFixed(1)} kg`
        }
        sub={`combinado · ${byWho.size} ${byWho.size === 1 ? "pessoa" : "pessoas"}`}
      />

      {/* Cards de pessoas com quick-add inline */}
      <div
        style={{
          padding: "14px 16px 0",
          display: "grid",
          gridTemplateColumns: "1fr",
          gap: 12,
        }}
      >
        {knownPeople.map((who) => {
          const arr = byWho.get(who) ?? [];
          const data = arr.map((p) => parseFloat(p.weightKg));
          const last = data[data.length - 1];
          const first = data[0];
          const delta = data.length > 1 ? last - first : 0;
          const color = colorFor(who);
          return (
            <div
              key={who}
              style={{
                background: "var(--card)",
                borderRadius: 18,
                border: "0.5px solid var(--line-d)",
                overflow: "hidden",
              }}
            >
              {/* Header pessoa */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "12px 16px",
                  background: "var(--surf)",
                  borderBottom: "1px solid var(--line-d)",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 14,
                      background: color,
                      color: "var(--accent-on)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 12,
                      fontWeight: 800,
                    }}
                  >
                    {who.slice(0, 1).toUpperCase()}
                  </span>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: "var(--ink)" }}>
                      {who}
                    </div>
                    {last !== undefined ? (
                      <div className="ap-num" style={{ fontSize: 18, fontWeight: 800, color: "var(--ink)", letterSpacing: "-0.02em" }}>
                        {last.toFixed(1)}
                        <span style={{ fontSize: 11, color: "var(--muted)", fontWeight: 500, marginLeft: 3 }}>kg</span>
                      </div>
                    ) : (
                      <div style={{ fontSize: 11, color: "var(--muted)" }}>sem pesagens</div>
                    )}
                  </div>
                </div>
                {data.length > 1 && (
                  <div style={{ textAlign: "right" }}>
                    <div
                      style={{
                        fontSize: 12,
                        color: delta < 0 ? "var(--ok)" : delta > 0 ? "var(--alert)" : "var(--muted)",
                        fontWeight: 800,
                      }}
                    >
                      {delta < 0 ? "▼" : delta > 0 ? "▲" : "→"} {Math.abs(delta).toFixed(1)} kg
                    </div>
                    <div style={{ fontSize: 9.5, color: "var(--muted)", marginTop: 2, letterSpacing: "0.06em", textTransform: "uppercase", fontWeight: 700 }}>
                      desde {formatDate(arr[0].weighedOn)}
                    </div>
                  </div>
                )}
              </div>

              {/* Sparkline */}
              {data.length >= 2 && (
                <div style={{ padding: "10px 16px 4px" }}>
                  <Sparkline data={data} w={300} h={40} color={color} fill />
                </div>
              )}

              {/* Quick-add inline */}
              <form
                action={createPesagem}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 110px 80px",
                  gap: 8,
                  padding: "10px 16px",
                  alignItems: "center",
                  borderTop: "1px solid var(--line-d)",
                  background: "var(--surf)",
                }}
              >
                <input type="hidden" name="who" value={who} />
                <span style={{ fontSize: 11, color: "var(--muted)", fontWeight: 700 }}>
                  + pesagem
                </span>
                <input
                  type="number"
                  step="0.1"
                  name="weightKg"
                  required
                  placeholder="83.4 kg"
                  style={{
                    padding: "6px 10px",
                    borderRadius: 8,
                    background: "var(--card)",
                    color: "var(--ink)",
                    border: "1px solid var(--line-d)",
                    fontSize: 13,
                    fontFamily: "inherit",
                    outline: "none",
                  }}
                />
                <input type="hidden" name="weighedOn" value={today} />
                <button
                  type="submit"
                  style={{
                    padding: "6px 10px",
                    borderRadius: 8,
                    background: "var(--accent)",
                    color: "var(--accent-on)",
                    border: "none",
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  registrar
                </button>
              </form>
            </div>
          );
        })}
      </div>

      {/* Histórico de pesagens editável */}
      {allRecent.length > 0 && (
        <>
          <SectionRow icon="weight" label="Histórico" action={`${all.length}`} />
          <div style={{ padding: "0 20px 20px" }}>
            {allRecent.map((p, i) => (
              <div
                key={p.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "28px 80px 1fr 80px 28px",
                  alignItems: "center",
                  gap: 8,
                  padding: "8px 0",
                  borderBottom: i < allRecent.length - 1 ? "0.5px solid var(--line-d)" : "none",
                }}
              >
                <span
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: 12,
                    background: colorFor(p.who),
                    color: "var(--accent-on)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 10,
                    fontWeight: 800,
                  }}
                >
                  {p.who.slice(0, 1).toUpperCase()}
                </span>
                <InlineEditInput
                  initialValue={p.weighedOn}
                  action={patchPesagem}
                  hiddenFields={{ id: p.id }}
                  fieldName="weighedOn"
                  fontSize={11}
                  color="var(--muted-d)"
                />
                <div style={{ fontSize: 12.5, fontWeight: 600 }}>{p.who}</div>
                <InlineEditInput
                  initialValue={p.weightKg}
                  action={patchPesagem}
                  hiddenFields={{ id: p.id }}
                  fieldName="weightKg"
                  fontSize={13}
                  fontWeight={700}
                />
                <DeleteBtn
                  action={deletePesagem.bind(null, p.id)}
                  confirmMsg={null}
                />
              </div>
            ))}
          </div>
        </>
      )}
    </ScreenShell>
  );
}
