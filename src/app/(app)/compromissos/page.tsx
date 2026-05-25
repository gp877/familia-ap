import { asc, eq, gte } from "drizzle-orm";

import { BigNumber, SectionRow } from "@/components/ap/atoms";
import { DeleteBtn, FormField, InlineForm, SubmitButton, fieldStyle } from "@/components/ap/inline-form";
import { ScreenShell } from "@/components/ap/screen-shell";
import {
  createCompromisso,
  deleteCompromisso,
} from "@/app/actions/compromissos";
import { auth } from "@/auth";
import { db } from "@/db";
import { compromissos, users } from "@/db/schema";

function formatDate(d: string) {
  const [y, m, day] = d.split("-").map(Number);
  return new Date(y, m - 1, day).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    weekday: "short",
  });
}

function daysFromToday(d: string) {
  const [y, m, day] = d.split("-").map(Number);
  const target = new Date(y, m - 1, day);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

export default async function CompromissosPage() {
  const session = await auth();
  if (!session?.user?.id) return null;

  const dbUser = await db.query.users.findFirst({
    where: eq(users.id, session.user.id),
  });
  if (!dbUser?.householdId) return null;

  const todayStr = new Date().toISOString().slice(0, 10);
  const upcoming = await db.query.compromissos.findMany({
    where: (c, { and: a }) =>
      a(eq(c.householdId, dbUser.householdId!), gte(c.occurredOn, todayStr)),
    orderBy: [asc(compromissos.occurredOn), asc(compromissos.time)],
    limit: 100,
  });

  const next = upcoming[0];
  const nextDays = next ? daysFromToday(next.occurredOn) : null;
  const nextLabel =
    nextDays === 0 ? "hoje" : nextDays === 1 ? "em 1 dia" : nextDays !== null ? `em ${nextDays} dias` : null;

  return (
    <ScreenShell
      userQ="O que tem nos próximos dias?"
      insight={
        next ? (
          <>
            Próximo: <b>{next.title}</b> {nextLabel ? <>· {nextLabel}</> : null}
            {next.time ? <> às {next.time}</> : null}.
          </>
        ) : (
          <>Nenhum compromisso registrado. Adiciona um abaixo.</>
        )
      }
    >
      <SectionRow icon="cal" label="Próximos compromissos" action={`${upcoming.length} agendados`} />

      {next ? (
        <BigNumber
          value={next.title}
          sub={`${formatDate(next.occurredOn)}${next.time ? ` · ${next.time}` : ""}${next.who ? ` · ${next.who}` : ""}`}
          accent
        />
      ) : (
        <BigNumber value="—" sub="sem compromissos próximos" />
      )}

      <div style={{ padding: "14px 0 0" }}>
        <InlineForm buttonLabel="Adicionar compromisso">
          {(close) => (
            <form
              action={async (fd) => {
                "use server";
                await createCompromisso(fd);
              }}
              onSubmit={() => setTimeout(close, 0)}
            >
              <FormField label="Título *">
                <input
                  name="title"
                  required
                  placeholder="Ex: primeira aula de natação do Francisco"
                  style={fieldStyle}
                />
              </FormField>
              <div style={{ display: "grid", gap: 8, gridTemplateColumns: "1fr 1fr" }}>
                <FormField label="Data *">
                  <input type="date" name="occurredOn" required style={fieldStyle} />
                </FormField>
                <FormField label="Hora">
                  <input
                    type="time"
                    name="time"
                    placeholder="HH:MM"
                    style={fieldStyle}
                  />
                </FormField>
              </div>
              <FormField label="Quem">
                <input
                  name="who"
                  placeholder="Casal · Augusto · Marília · Francisco"
                  style={fieldStyle}
                />
              </FormField>
              <FormField label="Local">
                <input name="location" placeholder="Opcional" style={fieldStyle} />
              </FormField>
              <FormField label="Observações">
                <textarea name="notes" rows={2} style={fieldStyle} />
              </FormField>
              <SubmitButton>Salvar compromisso</SubmitButton>
            </form>
          )}
        </InlineForm>
      </div>

      <div style={{ padding: "14px 20px 0" }}>
        {upcoming.length === 0 ? (
          <div style={{ fontSize: 13, color: "var(--muted)", textAlign: "center", padding: "20px 0" }}>
            Nenhum compromisso ainda.
          </div>
        ) : (
          upcoming.map((c, i) => {
            const days = daysFromToday(c.occurredOn);
            const isAccent = days <= 7;
            return (
              <div
                key={c.id}
                style={{
                  display: "flex",
                  gap: 14,
                  alignItems: "center",
                  padding: "12px 0",
                  borderBottom: i < upcoming.length - 1 ? "0.5px solid var(--line-d)" : "none",
                }}
              >
                <div
                  style={{
                    width: 56,
                    textAlign: "right",
                    display: "flex",
                    flexDirection: "column",
                  }}
                >
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      color: "var(--muted)",
                      letterSpacing: "0.1em",
                      textTransform: "uppercase",
                    }}
                  >
                    {formatDate(c.occurredOn).split(",")[0]}
                  </span>
                  <span
                    className="ap-num"
                    style={{
                      fontSize: 14,
                      color: isAccent ? "var(--accent)" : "var(--ink)",
                      marginTop: 2,
                    }}
                  >
                    {c.time ?? "—"}
                  </span>
                </div>
                <div
                  style={{
                    width: 2,
                    height: 30,
                    background: isAccent ? "var(--accent)" : "var(--line-d)",
                  }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600 }}>{c.title}</div>
                  <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 1 }}>
                    {[c.who, c.location].filter(Boolean).join(" · ") || "—"}
                  </div>
                  {c.notes && (
                    <div
                      style={{
                        fontSize: 11,
                        color: "var(--muted-d)",
                        marginTop: 4,
                        fontStyle: "italic",
                      }}
                    >
                      {c.notes}
                    </div>
                  )}
                </div>
                <DeleteBtn
                  action={async () => {
                    "use server";
                    await deleteCompromisso(c.id);
                  }}
                  confirmMsg="Excluir compromisso?"
                />
              </div>
            );
          })
        )}
      </div>
    </ScreenShell>
  );
}
