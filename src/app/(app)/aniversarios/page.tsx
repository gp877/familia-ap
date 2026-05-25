import { asc, eq } from "drizzle-orm";

import { BigNumber, SectionRow } from "@/components/ap/atoms";
import { DeleteBtn, FormField, InlineForm, SubmitButton, fieldStyle } from "@/components/ap/inline-form";
import { ScreenShell } from "@/components/ap/screen-shell";
import {
  addPresente,
  createAniversario,
  deleteAniversario,
  deletePresente,
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
  // próxima idade
  return age + 1;
}

export default async function AniversariosPage() {
  const session = await auth();
  if (!session?.user?.id) return null;

  const dbUser = await db.query.users.findFirst({
    where: eq(users.id, session.user.id),
  });
  if (!dbUser?.householdId) return null;

  const all = await db.query.aniversarios.findMany({
    where: eq(aniversarios.householdId, dbUser.householdId),
    with: {
      presentes: {
        orderBy: (p, { desc: d }) => [d(p.year)],
      },
    },
    orderBy: [asc(aniversarios.monthDay)],
  });

  // Ordena por proximidade (dias até)
  const sorted = [...all]
    .map((a) => ({ ...a, days: daysUntil(a.monthDay), nextAge: computeAge(a.birthYear, a.monthDay) }))
    .sort((a, b) => a.days - b.days);

  const next = sorted[0];

  return (
    <ScreenShell
      userQ="Quem faz aniversário em breve?"
      insight={
        next ? (
          <>
            <b>{next.name}</b> faz aniversário {next.days === 0 ? "hoje" : `em ${next.days} ${next.days === 1 ? "dia" : "dias"}`}
            {next.nextAge ? ` · ${next.nextAge} anos` : ""}.
          </>
        ) : (
          <>Nenhum aniversário cadastrado. Adiciona abaixo pra eu lembrar você.</>
        )
      }
    >
      <SectionRow icon="cake" label="Aniversários da família" action={`${sorted.length} cadastrados`} />

      {next ? (
        <BigNumber
          value={next.days === 0 ? "Hoje" : `${next.days} dias`}
          sub={`${next.name}${next.nextAge ? ` · ${next.nextAge} anos` : ""}`}
          accent
        />
      ) : (
        <BigNumber value="—" sub="sem aniversários cadastrados" />
      )}

      <div style={{ padding: "14px 0 0" }}>
        <InlineForm buttonLabel="Cadastrar aniversário">
          <form action={createAniversario}>
            <FormField label="Nome *">
              <input name="name" required placeholder="Ex: Vó Inês" style={fieldStyle} />
            </FormField>
            <FormField label="Data de nascimento *" hint="se não souber o ano exato, escolha qualquer ano — só extraímos o mês e dia">
              <input
                type="date"
                name="monthDay"
                required
                style={fieldStyle}
              />
            </FormField>
            <FormField label="Ano de nascimento (opcional)" hint="preencha aqui se quiser que a gente calcule a idade">
              <input
                type="number"
                name="birthYear"
                placeholder="1948"
                min="1900"
                max={new Date().getFullYear()}
                style={fieldStyle}
              />
            </FormField>
            <FormField label="Relação">
              <input
                name="relation"
                placeholder="Ex: avó da Marília, sobrinho"
                style={fieldStyle}
              />
            </FormField>
            <FormField label="Observações">
              <textarea name="notes" rows={2} style={fieldStyle} />
            </FormField>
            <SubmitButton>Salvar</SubmitButton>
          </form>
        </InlineForm>
      </div>

      <div style={{ padding: "14px 20px 0" }}>
        {sorted.map((aniv, i) => (
          <details
            key={aniv.id}
            style={{
              borderBottom: i < sorted.length - 1 ? "0.5px solid var(--line-d)" : "none",
              padding: "12px 0",
            }}
          >
            <summary
              style={{
                display: "flex",
                gap: 14,
                alignItems: "center",
                cursor: "pointer",
                listStyle: "none",
              }}
            >
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 12,
                  background: i === 0 ? "var(--accent)" : "var(--card2)",
                  color: i === 0 ? "var(--accent-on)" : "var(--ink)",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <span className="ap-num" style={{ fontSize: 14, lineHeight: 1 }}>
                  {aniv.monthDay.split("-")[1]}
                </span>
                <span
                  style={{
                    fontSize: 8,
                    fontWeight: 700,
                    letterSpacing: "0.1em",
                    textTransform: "uppercase",
                    marginTop: 2,
                  }}
                >
                  {MONTH_LABEL[parseInt(aniv.monthDay.split("-")[0], 10) - 1]}
                </span>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700 }}>{aniv.name}</div>
                <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>
                  {[aniv.relation, aniv.nextAge ? `faz ${aniv.nextAge}` : null]
                    .filter(Boolean)
                    .join(" · ") || aniv.notes || "—"}
                </div>
              </div>
              <span style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600 }}>
                {aniv.days < 10 ? `em ${aniv.days}d` : `${aniv.days}d`}
              </span>
              <DeleteBtn
                action={deleteAniversario.bind(null, aniv.id)}
                confirmMsg={`Excluir ${aniv.name}?`}
              />
            </summary>

            <div style={{ paddingLeft: 58, paddingTop: 10 }}>
              {aniv.notes && (
                <p
                  style={{
                    fontSize: 12,
                    color: "var(--muted-d)",
                    marginBottom: 10,
                    fontStyle: "italic",
                  }}
                >
                  {aniv.notes}
                </p>
              )}

              <div className="ap-eyebrow" style={{ marginBottom: 6 }}>
                presentes dados
              </div>
              {aniv.presentes.length === 0 ? (
                <div style={{ fontSize: 11.5, color: "var(--muted)", marginBottom: 8 }}>
                  Nenhum presente registrado ainda.
                </div>
              ) : (
                <ul style={{ listStyle: "none", padding: 0, marginBottom: 8 }}>
                  {aniv.presentes.map((p) => (
                    <li
                      key={p.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        padding: "4px 0",
                        fontSize: 12.5,
                      }}
                    >
                      <span
                        className="ap-num"
                        style={{ fontSize: 12, color: "var(--muted)", minWidth: 36 }}
                      >
                        {p.year}
                      </span>
                      <span style={{ flex: 1 }}>{p.description}</span>
                      <DeleteBtn
                        action={deletePresente.bind(null, p.id)}
                        confirmMsg="Remover presente?"
                      />
                    </li>
                  ))}
                </ul>
              )}

              <form action={addPresente} style={{ marginTop: 6 }}>
                <input type="hidden" name="aniversarioId" value={aniv.id} />
                <div style={{ display: "grid", gap: 6, gridTemplateColumns: "60px 1fr auto" }}>
                  <input
                    type="number"
                    name="year"
                    required
                    defaultValue={new Date().getFullYear()}
                    placeholder="ano"
                    style={{ ...fieldStyle, padding: "6px 10px", fontSize: 12 }}
                  />
                  <input
                    name="description"
                    required
                    placeholder="O que vocês deram?"
                    style={{ ...fieldStyle, padding: "6px 10px", fontSize: 12 }}
                  />
                  <button
                    type="submit"
                    style={{
                      padding: "6px 12px",
                      borderRadius: 10,
                      background: "var(--accent)",
                      color: "var(--accent-on)",
                      border: "none",
                      fontSize: 11.5,
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    +
                  </button>
                </div>
              </form>
            </div>
          </details>
        ))}
      </div>
    </ScreenShell>
  );
}
