import { asc, eq, gte, lte } from "drizzle-orm";
import Link from "next/link";

import { BigNumber, Card, SectionRow } from "@/components/ap/atoms";
import { DeleteBtn, FormField, InlineForm, SubmitButton, fieldStyle } from "@/components/ap/inline-form";
import { QuickAddInput } from "@/components/ap/quick-add-input";
import { ScreenShell } from "@/components/ap/screen-shell";
import {
  createCompromisso,
  deleteCompromisso,
} from "@/app/actions/compromissos";
import { auth } from "@/auth";
import { db } from "@/db";
import { compromissos, users } from "@/db/schema";

const today = new Date().toISOString().slice(0, 10);

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
  const t = new Date();
  t.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - t.getTime()) / 86_400_000);
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function dateStrFromOffset(days: number) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

type SearchParams = Promise<{ range?: string }>;

export default async function CompromissosPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = await searchParams;
  const range = sp.range ?? "month"; // today | week | month | all

  const session = await auth();
  if (!session?.user?.id) return null;
  const dbUser = await db.query.users.findFirst({
    where: eq(users.id, session.user.id),
  });
  if (!dbUser?.householdId) return null;

  const t = todayStr();
  let upcoming: typeof compromissos.$inferSelect[];
  if (range === "today") {
    upcoming = await db.query.compromissos.findMany({
      where: (c, { and: a }) =>
        a(eq(c.householdId, dbUser.householdId!), eq(c.occurredOn, t)),
      orderBy: [asc(compromissos.time)],
    });
  } else if (range === "week") {
    const end = dateStrFromOffset(7);
    upcoming = await db.query.compromissos.findMany({
      where: (c, { and: a }) =>
        a(
          eq(c.householdId, dbUser.householdId!),
          gte(c.occurredOn, t),
          lte(c.occurredOn, end)
        ),
      orderBy: [asc(compromissos.occurredOn), asc(compromissos.time)],
    });
  } else if (range === "all") {
    upcoming = await db.query.compromissos.findMany({
      where: eq(compromissos.householdId, dbUser.householdId),
      orderBy: [asc(compromissos.occurredOn), asc(compromissos.time)],
      limit: 200,
    });
  } else {
    // month (default)
    const end = dateStrFromOffset(30);
    upcoming = await db.query.compromissos.findMany({
      where: (c, { and: a }) =>
        a(
          eq(c.householdId, dbUser.householdId!),
          gte(c.occurredOn, t),
          lte(c.occurredOn, end)
        ),
      orderBy: [asc(compromissos.occurredOn), asc(compromissos.time)],
    });
  }

  const next = upcoming[0];
  const nextDays = next ? daysFromToday(next.occurredOn) : null;
  const nextLabel =
    nextDays === 0 ? "hoje" : nextDays === 1 ? "em 1 dia" : nextDays !== null ? `em ${nextDays} dias` : null;

  const rangeLabel: Record<string, string> = {
    today: "hoje",
    week: "próximos 7 dias",
    month: "próximos 30 dias",
    all: "todos",
  };

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
          <>Nenhum compromisso registrado. Digite no campo abaixo pra criar pra hoje, ou expanda o form pra escolher outra data.</>
        )
      }
    >
      <SectionRow icon="cal" label="Próximos compromissos" action={`${upcoming.length} · ${rangeLabel[range]}`} />

      {/* Chips de filtro */}
      <div style={{ padding: "0 20px 8px", display: "flex", gap: 6, flexWrap: "wrap" }}>
        {[
          { key: "today", label: "Hoje" },
          { key: "week", label: "7 dias" },
          { key: "month", label: "30 dias" },
          { key: "all", label: "Tudo" },
        ].map((r) => {
          const isActive = range === r.key;
          return (
            <Link
              key={r.key}
              href={`/compromissos?range=${r.key}`}
              style={{
                padding: "4px 12px",
                borderRadius: 999,
                fontSize: 11,
                fontWeight: 700,
                background: isActive ? "var(--accent)" : "var(--card)",
                color: isActive ? "var(--accent-on)" : "var(--muted-d)",
                textDecoration: "none",
                border: isActive ? "none" : "1px solid var(--line-d)",
              }}
            >
              {r.label}
            </Link>
          );
        })}
      </div>

      {next ? (
        <BigNumber
          value={next.title}
          sub={`${formatDate(next.occurredOn)}${next.time ? ` · ${next.time}` : ""}${next.who ? ` · ${next.who}` : ""}`}
          accent
        />
      ) : (
        <BigNumber value="—" sub="sem compromissos nesse período" />
      )}

      {/* Quick-add (cria pra hoje, sem hora) */}
      <div style={{ padding: "12px 20px 0" }}>
        <Card pad={10}>
          <QuickAddInput
            action={createCompromisso}
            hiddenFields={{ occurredOn: today }}
            placeholder="+ algo pra hoje? (Enter)"
            fontSize={13.5}
          />
        </Card>
      </div>

      {/* Form completo (escondido) */}
      <div style={{ padding: "10px 0 0" }}>
        <InlineForm buttonLabel="Outra data / detalhes">
          <form action={createCompromisso}>
            <FormField label="O que é? *">
              <input
                name="title"
                required
                autoFocus
                placeholder="Ex: aula de natação Francisco"
                style={fieldStyle}
              />
            </FormField>
            <div style={{ display: "grid", gap: 8, gridTemplateColumns: "1fr 1fr" }}>
              <FormField label="Quando *">
                <input
                  type="date"
                  name="occurredOn"
                  required
                  defaultValue={today}
                  style={fieldStyle}
                />
              </FormField>
              <FormField label="Hora">
                <input type="time" name="time" style={fieldStyle} />
              </FormField>
            </div>
            <FormField label="Quem">
              <input
                name="who"
                list="compromisso-who"
                placeholder="comece a digitar..."
                style={fieldStyle}
              />
              <datalist id="compromisso-who">
                <option value="Casal" />
                <option value="Augusto" />
                <option value="Marília" />
                <option value="Francisco" />
                <option value="Família" />
              </datalist>
            </FormField>

            <details style={{ marginBottom: 10 }}>
              <summary
                style={{
                  cursor: "pointer",
                  fontSize: 12,
                  color: "var(--muted)",
                  padding: "4px 0",
                  listStyle: "none",
                  fontWeight: 600,
                }}
              >
                + local, notas, repetir
              </summary>
              <div style={{ marginTop: 8 }}>
                <FormField label="Local">
                  <input name="location" style={fieldStyle} />
                </FormField>
                <FormField label="Observações">
                  <textarea name="notes" rows={2} style={fieldStyle} />
                </FormField>
                <FormField label="Repetir">
                  <select name="recurring" defaultValue="once" style={fieldStyle}>
                    <option value="once">Só uma vez</option>
                    <option value="weekly">Semanal (12 ocorrências)</option>
                    <option value="biweekly">Quinzenal (6 ocorrências)</option>
                    <option value="monthly">Mensal (12 ocorrências)</option>
                  </select>
                </FormField>
              </div>
            </details>

            <SubmitButton>Salvar compromisso</SubmitButton>
          </form>
        </InlineForm>
      </div>

      <div style={{ padding: "14px 20px 0" }}>
        {upcoming.length === 0 ? (
          <div style={{ fontSize: 13, color: "var(--muted)", textAlign: "center", padding: "20px 0" }}>
            Nenhum compromisso nesse período.
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
                  action={deleteCompromisso.bind(null, c.id)}
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
