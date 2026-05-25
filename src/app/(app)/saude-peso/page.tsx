import { asc, eq } from "drizzle-orm";

import { BigNumber, Card, SectionRow, Sparkline } from "@/components/ap/atoms";
import { DeleteBtn, FormField, InlineForm, SubmitButton, fieldStyle } from "@/components/ap/inline-form";
import { ScreenShell } from "@/components/ap/screen-shell";
import { createPesagem, deletePesagem } from "@/app/actions/saude";
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

  // Agrupar por pessoa (who)
  const byWho = new Map<string, typeof all>();
  for (const p of all) {
    const arr = byWho.get(p.who) ?? [];
    arr.push(p);
    byWho.set(p.who, arr);
  }

  // Cores fixas pra pessoas conhecidas
  function colorFor(who: string) {
    const k = who.toUpperCase();
    if (k.startsWith("A")) return "var(--accent)";
    if (k.startsWith("M")) return "#5DA9FF";
    if (k.startsWith("F")) return "#B57FFF";
    if (k.startsWith("C")) return "#FFB85C";
    return "var(--ink)";
  }

  // Total geral (delta combinado)
  const totalDelta = [...byWho.values()].reduce((sum, arr) => {
    if (arr.length < 2) return sum;
    const first = parseFloat(arr[0].weightKg);
    const last = parseFloat(arr[arr.length - 1].weightKg);
    return sum + (last - first);
  }, 0);

  const allRecent = [...all].sort((a, b) => b.weighedOn.localeCompare(a.weighedOn)).slice(0, 20);

  return (
    <ScreenShell
      userQ="Como tá o peso nosso essas semanas?"
      insight={
        all.length === 0 ? (
          <>Sem pesagens registradas. Cadastra a primeira embaixo — basta data, quem e o peso.</>
        ) : totalDelta < 0 ? (
          <>
            Vocês perderam <b>{Math.abs(totalDelta).toFixed(1)} kg</b> no total combinado desde a primeira pesagem. Continuem.
          </>
        ) : (
          <>
            Variação combinada: <b>{totalDelta >= 0 ? "+" : ""}{totalDelta.toFixed(1)} kg</b>. Hora de retomar?
          </>
        )
      }
    >
      <SubNav active="peso" />
      <SectionRow icon="weight" label="Histórico de peso" action={`${all.length} pesagens`} />

      <BigNumber
        value={totalDelta < 0 ? `−${Math.abs(totalDelta).toFixed(1)} kg` : `${totalDelta >= 0 ? "+" : ""}${totalDelta.toFixed(1)} kg`}
        sub={`combinado · ${byWho.size} ${byWho.size === 1 ? "pessoa" : "pessoas"}`}
      />

      <div style={{ padding: "14px 0 0" }}>
        <InlineForm buttonLabel="Nova pesagem">
          <form action={createPesagem}>
              <div style={{ display: "grid", gap: 8, gridTemplateColumns: "1fr 1fr" }}>
                <FormField label="Quem *">
                  <input name="who" required placeholder="Augusto" style={fieldStyle} />
                </FormField>
                <FormField label="Data *">
                  <input
                    type="date"
                    name="weighedOn"
                    required
                    defaultValue={new Date().toISOString().slice(0, 10)}
                    style={fieldStyle}
                  />
                </FormField>
              </div>
              <div style={{ display: "grid", gap: 8, gridTemplateColumns: "1fr 1fr" }}>
                <FormField label="Peso (kg) *">
                  <input
                    type="number"
                    step="0.1"
                    name="weightKg"
                    required
                    placeholder="83.4"
                    style={fieldStyle}
                  />
                </FormField>
                <FormField label="% gordura" hint="opcional">
                  <input
                    type="number"
                    step="0.1"
                    name="bodyFatPct"
                    placeholder="18.5"
                    style={fieldStyle}
                  />
                </FormField>
              </div>
              <FormField label="Observações">
                <input name="notes" placeholder="opcional" style={fieldStyle} />
              </FormField>
            <SubmitButton>Salvar pesagem</SubmitButton>
          </form>
        </InlineForm>
      </div>

      <div style={{ padding: "14px 20px 0", display: "flex", flexDirection: "column", gap: 10 }}>
        {byWho.size === 0 ? null : (
          [...byWho.entries()].map(([who, arr]) => {
            const data = arr.map((p) => parseFloat(p.weightKg));
            const first = data[0];
            const last = data[data.length - 1];
            const delta = data.length > 1 ? last - first : 0;
            const color = colorFor(who);
            return (
              <Card key={who} pad={14} raised>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "baseline",
                    marginBottom: 10,
                  }}
                >
                  <span style={{ fontSize: 13, color: "var(--ink-d)", fontWeight: 600 }}>
                    {who} · {last.toFixed(1)} kg
                  </span>
                  {data.length > 1 && (
                    <span
                      style={{
                        fontSize: 11,
                        color: delta < 0 ? "var(--ok)" : delta > 0 ? "var(--alert)" : "var(--muted)",
                        fontWeight: 700,
                        letterSpacing: "0.08em",
                      }}
                    >
                      {delta < 0 ? "▼" : delta > 0 ? "▲" : "→"} {Math.abs(delta).toFixed(1)} kg
                    </span>
                  )}
                </div>
                {data.length >= 2 ? (
                  <Sparkline data={data} w={320} h={48} color={color} fill />
                ) : (
                  <div style={{ fontSize: 11, color: "var(--muted)" }}>
                    Apenas uma pesagem — adicione mais pra ver evolução.
                  </div>
                )}
                <div style={{ fontSize: 10.5, color: "var(--muted)", marginTop: 6 }}>
                  {data.length} pesagens · {formatDate(arr[0].weighedOn)} →{" "}
                  {formatDate(arr[arr.length - 1].weighedOn)}
                </div>
              </Card>
            );
          })
        )}
      </div>

      {allRecent.length > 0 && (
        <>
          <SectionRow icon="weight" label="Últimas pesagens" action={`${allRecent.length}`} />
          <div style={{ padding: "0 20px" }}>
            {allRecent.map((p, i) => (
              <div
                key={p.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "10px 0",
                  borderBottom:
                    i < allRecent.length - 1 ? "0.5px solid var(--line-d)" : "none",
                }}
              >
                <div
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 14,
                    background: colorFor(p.who),
                    color: "var(--accent-on)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 11,
                    fontWeight: 700,
                  }}
                >
                  {p.who.slice(0, 1).toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{p.who}</div>
                  <div style={{ fontSize: 11, color: "var(--muted)" }}>
                    {formatDate(p.weighedOn)}
                  </div>
                </div>
                <div className="ap-num" style={{ fontSize: 14, color: "var(--ink)" }}>
                  {parseFloat(p.weightKg).toFixed(1)} kg
                </div>
                <DeleteBtn
                  action={deletePesagem.bind(null, p.id)}
                  confirmMsg="Excluir esta pesagem?"
                />
              </div>
            ))}
          </div>
        </>
      )}
    </ScreenShell>
  );
}
