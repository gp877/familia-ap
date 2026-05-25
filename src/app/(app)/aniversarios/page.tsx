import { asc, desc, eq } from "drizzle-orm";

import { BigNumber, SectionRow } from "@/components/ap/atoms";
import { DeleteBtn, FormField, InlineForm, SubmitButton, fieldStyle } from "@/components/ap/inline-form";
import { InlineEditInput } from "@/components/ap/inline-edit-input";
import { ScreenShell } from "@/components/ap/screen-shell";
import { ViewToggle } from "@/components/ap/view-toggle";
import {
  addPresente,
  createAniversario,
  deleteAniversario,
  deletePresente,
  patchAniversario,
} from "@/app/actions/aniversarios";
import { auth } from "@/auth";
import { db } from "@/db";
import { aniversarios, users } from "@/db/schema";

const MONTH_LABEL = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

function daysUntil(monthDay: string): number {
  const [m, d] = monthDay.split("-").map(Number);
  const now = new Date();
  let target = new Date(now.getFullYear(), m - 1, d);
  target.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (target < today) {
    target = new Date(now.getFullYear() + 1, m - 1, d);
    target.setHours(0, 0, 0, 0);
  }
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

function computeAge(birthYear: number | null, monthDay: string): number | null {
  if (!birthYear) return null;
  const [m, d] = monthDay.split("-").map(Number);
  const now = new Date();
  let age = now.getFullYear() - birthYear;
  const passed =
    now.getMonth() + 1 > m || (now.getMonth() + 1 === m && now.getDate() >= d);
  if (!passed) age -= 1;
  return age + 1;
}

type SearchParams = Promise<{ view?: string }>;

export default async function AniversariosPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = await searchParams;
  const isList = sp.view === "list";

  const session = await auth();
  if (!session?.user?.id) return null;
  const dbUser = await db.query.users.findFirst({
    where: eq(users.id, session.user.id),
  });
  if (!dbUser?.householdId) return null;

  const all = await db.query.aniversarios.findMany({
    where: eq(aniversarios.householdId, dbUser.householdId),
    with: {
      presentes: { orderBy: (p, { desc: d }) => [d(p.year)] },
    },
    orderBy: isList ? [desc(aniversarios.createdAt)] : [asc(aniversarios.monthDay)],
  });

  const sorted = [...all]
    .map((a) => ({
      ...a,
      days: daysUntil(a.monthDay),
      nextAge: computeAge(a.birthYear, a.monthDay),
    }))
    .sort((a, b) => (isList ? 0 : a.days - b.days));

  const next = sorted[0];

  return (
    <ScreenShell
      userQ="Quem faz aniversário em breve?"
      insight={
        next ? (
          <>
            <b>{next.name}</b> {next.days === 0 ? "faz hoje" : `em ${next.days} ${next.days === 1 ? "dia" : "dias"}`}
            {next.nextAge ? ` · ${next.nextAge} anos` : ""}.
          </>
        ) : (
          <>Cadastre o próximo · Enter salva.</>
        )
      }
    >
      <SectionRow
        icon="cake"
        label="Aniversários da família"
        action={
          <ViewToggle basePath="/aniversarios" current={sp.view} />
        }
      />

      {next ? (
        <BigNumber
          value={next.days === 0 ? "Hoje" : `${next.days}d`}
          sub={`${next.name}${next.nextAge ? ` · ${next.nextAge} anos` : ""}`}
          accent
        />
      ) : (
        <BigNumber value="—" sub="sem aniversários" />
      )}

      {/* Quick add: form com 3 campos */}
      <div style={{ padding: "12px 0 0" }}>
        <InlineForm buttonLabel="+ adicionar aniversário">
          <form action={createAniversario}>
            <FormField label="Nome *">
              <input name="name" required autoFocus placeholder="Vó Inês" style={fieldStyle} />
            </FormField>
            <div style={{ display: "grid", gap: 8, gridTemplateColumns: "1fr 1fr" }}>
              <FormField label="Nascimento *" hint="usa só dia/mês">
                <input type="date" name="monthDay" required style={fieldStyle} />
              </FormField>
              <FormField label="Ano (opcional)">
                <input
                  type="number"
                  name="birthYear"
                  placeholder="1948"
                  min="1900"
                  max={new Date().getFullYear()}
                  style={fieldStyle}
                />
              </FormField>
            </div>
            <FormField label="Relação">
              <input name="relation" placeholder="avó, sobrinho..." style={fieldStyle} />
            </FormField>
            <SubmitButton>Salvar</SubmitButton>
          </form>
        </InlineForm>
      </div>

      {/* Lista — cada card é uma "person card" */}
      <div style={{ padding: "16px 16px 0", display: "flex", flexDirection: "column", gap: 10 }}>
        {sorted.map((aniv, idx) => {
          const m = parseInt(aniv.monthDay.split("-")[0], 10);
          const d = parseInt(aniv.monthDay.split("-")[1], 10);
          const isNext = !isList && idx === 0;
          return (
            <details
              key={aniv.id}
              style={{
                background: "var(--card)",
                borderRadius: 16,
                border: isNext ? "1px solid var(--accent)" : "0.5px solid var(--line-d)",
                overflow: "hidden",
              }}
            >
              <summary
                style={{
                  display: "grid",
                  gridTemplateColumns: "56px 1fr auto auto",
                  alignItems: "center",
                  gap: 12,
                  padding: "12px 14px",
                  cursor: "pointer",
                  listStyle: "none",
                }}
              >
                {/* Tag dia/mês — número grande */}
                <div style={{ textAlign: "center" }}>
                  <div
                    className="ap-num"
                    style={{
                      fontSize: 22,
                      fontWeight: 800,
                      lineHeight: 1,
                      color: isNext ? "var(--accent)" : "var(--ink)",
                      letterSpacing: "-0.04em",
                    }}
                  >
                    {String(d).padStart(2, "0")}
                  </div>
                  <div
                    style={{
                      fontSize: 9,
                      fontWeight: 800,
                      letterSpacing: "0.16em",
                      textTransform: "uppercase",
                      color: "var(--muted)",
                      marginTop: 3,
                    }}
                  >
                    {MONTH_LABEL[m - 1]}
                  </div>
                </div>

                {/* Nome editável + relação editável */}
                <div style={{ minWidth: 0 }}>
                  <InlineEditInput
                    initialValue={aniv.name}
                    action={patchAniversario}
                    hiddenFields={{ id: aniv.id }}
                    fieldName="name"
                    fontSize={14}
                    fontWeight={700}
                  />
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <InlineEditInput
                      initialValue={aniv.relation ?? ""}
                      action={patchAniversario}
                      hiddenFields={{ id: aniv.id }}
                      fieldName="relation"
                      placeholder="+ relação"
                      fontSize={11}
                      color="var(--muted-d)"
                    />
                    {aniv.nextAge && (
                      <span style={{ fontSize: 11, color: "var(--muted)" }}>
                        · faz {aniv.nextAge}
                      </span>
                    )}
                  </div>
                </div>

                {/* Distância em dias */}
                <span
                  style={{
                    fontSize: 11,
                    color: aniv.days < 10 ? "var(--accent)" : "var(--muted)",
                    fontWeight: 700,
                  }}
                >
                  {aniv.days === 0 ? "hoje" : `${aniv.days}d`}
                </span>

                <DeleteBtn
                  action={deleteAniversario.bind(null, aniv.id)}
                  confirmMsg={null}
                />
              </summary>

              {/* Detalhes expandidos: ano + notes + presentes */}
              <div style={{ padding: "0 14px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <div>
                    <div className="ap-eyebrow" style={{ fontSize: 9 }}>ano</div>
                    <InlineEditInput
                      initialValue={aniv.birthYear ? String(aniv.birthYear) : ""}
                      action={patchAniversario}
                      hiddenFields={{ id: aniv.id }}
                      fieldName="birthYear"
                      placeholder="ex: 1948"
                      fontSize={12}
                    />
                  </div>
                  <div>
                    <div className="ap-eyebrow" style={{ fontSize: 9 }}>notas</div>
                    <InlineEditInput
                      initialValue={aniv.notes ?? ""}
                      action={patchAniversario}
                      hiddenFields={{ id: aniv.id }}
                      fieldName="notes"
                      placeholder="+ notas"
                      fontSize={12}
                      color="var(--muted-d)"
                      italic
                    />
                  </div>
                </div>

                <div>
                  <div className="ap-eyebrow" style={{ marginBottom: 4 }}>presentes dados</div>
                  {aniv.presentes.length > 0 ? (
                    <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                      {aniv.presentes.map((p) => (
                        <li
                          key={p.id}
                          style={{
                            display: "grid",
                            gridTemplateColumns: "40px 1fr auto",
                            gap: 8,
                            alignItems: "center",
                            padding: "4px 0",
                            fontSize: 12.5,
                          }}
                        >
                          <span className="ap-num" style={{ color: "var(--muted)" }}>{p.year}</span>
                          <span>{p.description}</span>
                          <DeleteBtn
                            action={deletePresente.bind(null, p.id)}
                            confirmMsg={null}
                          />
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div style={{ fontSize: 11, color: "var(--muted)" }}>nenhum ainda</div>
                  )}

                  <form action={addPresente} style={{ marginTop: 6 }}>
                    <input type="hidden" name="aniversarioId" value={aniv.id} />
                    <div style={{ display: "grid", gridTemplateColumns: "60px 1fr auto", gap: 6 }}>
                      <input
                        type="number"
                        name="year"
                        required
                        defaultValue={new Date().getFullYear()}
                        style={{ ...fieldStyle, padding: "5px 8px", fontSize: 11.5 }}
                      />
                      <input
                        name="description"
                        required
                        placeholder="o que vocês deram"
                        style={{ ...fieldStyle, padding: "5px 8px", fontSize: 11.5 }}
                      />
                      <button
                        type="submit"
                        style={{
                          padding: "5px 12px",
                          borderRadius: 8,
                          background: "var(--accent)",
                          color: "var(--accent-on)",
                          border: "none",
                          fontSize: 12,
                          fontWeight: 700,
                          cursor: "pointer",
                        }}
                      >
                        +
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            </details>
          );
        })}
      </div>
    </ScreenShell>
  );
}
