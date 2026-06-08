import { asc, eq } from "drizzle-orm";

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
const MONTH_FULL = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

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

/**
 * Idade atual (anos vividos até hoje). Se ainda não passou o aniversário
 * deste ano, retorna ano - birthYear - 1.
 */
function currentAge(birthYear: number | null, monthDay: string): number | null {
  if (!birthYear) return null;
  const [m, d] = monthDay.split("-").map(Number);
  const now = new Date();
  let age = now.getFullYear() - birthYear;
  const passed =
    now.getMonth() + 1 > m || (now.getMonth() + 1 === m && now.getDate() >= d);
  if (!passed) age -= 1;
  return age;
}

/**
 * Idade que vai fazer no próximo aniversário. Útil pra "faz X em N dias".
 */
function nextAge(birthYear: number | null, monthDay: string): number | null {
  const cur = currentAge(birthYear, monthDay);
  return cur === null ? null : cur + 1;
}

type SearchParams = Promise<{ view?: string }>;

export default async function AniversariosPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = await searchParams;
  const isAnual = sp.view === "anual";

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
    orderBy: [asc(aniversarios.monthDay)],
  });

  const enriched = all.map((a) => ({
    ...a,
    days: daysUntil(a.monthDay),
    nextAge: nextAge(a.birthYear, a.monthDay),
    currentAge: currentAge(a.birthYear, a.monthDay),
  }));

  const sorted = [...enriched].sort((a, b) => a.days - b.days);
  const next = sorted[0];

  // Agrupar por mês (1-12) — pra view anual
  const byMonth = new Map<number, typeof enriched>();
  for (const a of enriched) {
    const m = parseInt(a.monthDay.split("-")[0], 10);
    const arr = byMonth.get(m) ?? [];
    arr.push(a);
    byMonth.set(m, arr);
  }
  // Dentro de cada mês, ordenar por dia
  for (const arr of byMonth.values()) {
    arr.sort((a, b) => {
      const da = parseInt(a.monthDay.split("-")[1], 10);
      const db = parseInt(b.monthDay.split("-")[1], 10);
      return da - db;
    });
  }
  const currentMonth = new Date().getMonth() + 1;

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
          <ViewToggle
            basePath="/aniversarios"
            current={sp.view}
            options={[
              { key: null, label: "Próximos" },
              { key: "anual", label: "Anual" },
            ]}
          />
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
            <FormField label="Data de nascimento *" hint="dia, mês e ano — pra calcular a idade automaticamente">
              <input type="date" name="birthDate" required style={fieldStyle} />
            </FormField>
            <FormField label="Relação">
              <input name="relation" placeholder="avó, sobrinho..." style={fieldStyle} />
            </FormField>
            <SubmitButton>Salvar</SubmitButton>
          </form>
        </InlineForm>
      </div>

      {isAnual ? (
        <AnualView byMonth={byMonth} currentMonth={currentMonth} />
      ) : (
      <div style={{ padding: "10px 16px 0", display: "flex", flexDirection: "column", gap: 4 }}>
        {sorted.map((aniv, idx) => {
          const m = parseInt(aniv.monthDay.split("-")[0], 10);
          const d = parseInt(aniv.monthDay.split("-")[1], 10);
          const isNext = idx === 0;
          return (
            <div
              key={aniv.id}
              style={{
                background: "var(--card)",
                borderRadius: 10,
                border: isNext ? "1px solid var(--accent)" : "0.5px solid var(--line-d)",
                overflow: "hidden",
              }}
            >
              {/* Header compacto: data | nome+relação+idade | dias | delete */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "38px 1fr auto auto",
                  alignItems: "center",
                  gap: 10,
                  padding: "6px 10px",
                  minHeight: 40,
                }}
              >
                <div style={{ textAlign: "center", lineHeight: 1 }}>
                  <div
                    className="ap-num"
                    style={{
                      fontSize: 17,
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
                      fontSize: 8.5,
                      fontWeight: 800,
                      letterSpacing: "0.14em",
                      textTransform: "uppercase",
                      color: "var(--muted)",
                      marginTop: 2,
                    }}
                  >
                    {MONTH_LABEL[m - 1]}
                  </div>
                </div>

                {/* Nome + idade em destaque na linha 1; relação (se houver)
                    na linha 2 dim. Edição de ano fica no expandable abaixo
                    pra não poluir esse header. */}
                <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 1 }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "baseline",
                      gap: 6,
                      flexWrap: "wrap",
                      rowGap: 0,
                    }}
                  >
                    <InlineEditInput
                      initialValue={aniv.name}
                      action={patchAniversario}
                      hiddenFields={{ id: aniv.id }}
                      fieldName="name"
                      fontSize={13.5}
                      fontWeight={700}
                    />
                    {aniv.currentAge !== null && (
                      <span
                        title={`Vai fazer ${aniv.nextAge} em ${aniv.days === 0 ? "hoje" : `${aniv.days} dia${aniv.days === 1 ? "" : "s"}`}`}
                        className="ap-num"
                        style={{
                          fontSize: 13.5,
                          fontWeight: 800,
                          color: "var(--accent)",
                          letterSpacing: "-0.01em",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {aniv.currentAge}
                        <span
                          style={{
                            fontSize: 10,
                            fontWeight: 600,
                            color: "var(--muted)",
                            marginLeft: 2,
                            letterSpacing: 0,
                          }}
                        >
                          anos
                        </span>
                      </span>
                    )}
                  </div>
                  {aniv.relation && (
                    <InlineEditInput
                      initialValue={aniv.relation}
                      action={patchAniversario}
                      hiddenFields={{ id: aniv.id }}
                      fieldName="relation"
                      fontSize={10.5}
                      color="var(--muted-d)"
                    />
                  )}
                </div>

                <span
                  style={{
                    fontSize: 10.5,
                    color: aniv.days < 10 ? "var(--accent)" : "var(--muted)",
                    fontWeight: 700,
                    whiteSpace: "nowrap",
                  }}
                >
                  {aniv.days === 0 ? "hoje" : `${aniv.days}d`}
                </span>

                <DeleteBtn
                  action={deleteAniversario.bind(null, aniv.id)}
                  confirmMsg={null}
                />
              </div>

              {/* Sub-detalhes (ano, notas, presentes) — collapsed por padrão */}
              <details>
                <summary
                  style={{
                    cursor: "pointer",
                    listStyle: "none",
                    padding: "5px 10px",
                    fontSize: 10,
                    color: "var(--muted)",
                    fontWeight: 700,
                    letterSpacing: "0.04em",
                    borderTop: "0.5px dashed var(--line-d)",
                    userSelect: "none",
                  }}
                >
                  + data, notas, presentes
                </summary>
                <div style={{ padding: "4px 14px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <div>
                      <div className="ap-eyebrow" style={{ fontSize: 9 }}>data de nascimento</div>
                      <form
                        action={patchAniversario}
                        style={{ display: "flex", gap: 4, alignItems: "center" }}
                      >
                        <input type="hidden" name="id" value={aniv.id} />
                        <input
                          type="date"
                          name="birthDate"
                          defaultValue={
                            aniv.birthYear
                              ? `${aniv.birthYear}-${aniv.monthDay}`
                              : ""
                          }
                          style={{
                            ...fieldStyle,
                            padding: "4px 8px",
                            fontSize: 12.5,
                            flex: 1,
                          }}
                        />
                        <button
                          type="submit"
                          style={{
                            padding: "4px 10px",
                            borderRadius: 6,
                            background: "var(--accent)",
                            color: "var(--accent-on)",
                            border: "none",
                            fontSize: 11,
                            fontWeight: 700,
                            cursor: "pointer",
                          }}
                        >
                          ok
                        </button>
                      </form>
                      {!aniv.birthYear && (
                        <div
                          style={{
                            fontSize: 10,
                            color: "var(--muted)",
                            marginTop: 3,
                            fontStyle: "italic",
                          }}
                        >
                          sem ano cadastrado — adicione pra calcular idade
                        </div>
                      )}
                    </div>
                    <div>
                      <div className="ap-eyebrow" style={{ fontSize: 9 }}>notas</div>
                      <InlineEditInput
                        initialValue={aniv.notes ?? ""}
                        action={patchAniversario}
                        hiddenFields={{ id: aniv.id }}
                        fieldName="notes"
                        placeholder="+ notas"
                        fontSize={13}
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
                      <div style={{ display: "grid", gridTemplateColumns: "70px 1fr auto", gap: 6 }}>
                        <input
                          type="number"
                          name="year"
                          required
                          defaultValue={new Date().getFullYear()}
                          style={{ ...fieldStyle, padding: "6px 8px" }}
                        />
                        <input
                          name="description"
                          required
                          placeholder="o que vocês deram"
                          style={{ ...fieldStyle, padding: "6px 8px" }}
                        />
                        <button
                          type="submit"
                          style={{
                            padding: "6px 14px",
                            borderRadius: 8,
                            background: "var(--accent)",
                            color: "var(--accent-on)",
                            border: "none",
                            fontSize: 13,
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
            </div>
          );
        })}
      </div>
      )}
    </ScreenShell>
  );
}

function AnualView({
  byMonth,
  currentMonth,
}: {
  byMonth: Map<number, { id: string; name: string; monthDay: string; birthYear: number | null; nextAge: number | null }[]>;
  currentMonth: number;
}) {
  return (
    <div
      style={{
        padding: "20px 16px 0",
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        // Linhas com altura uniforme — cards vazios ficam do mesmo tamanho
        // que os preenchidos. Layout regular vence densidade aqui.
        gridAutoRows: "1fr",
        gap: 10,
      }}
    >
      {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => {
        const arr = byMonth.get(m) ?? [];
        const isCurrent = m === currentMonth;
        return (
          <div
            key={m}
            style={{
              background: "var(--card)",
              borderRadius: 14,
              border: isCurrent ? "1px solid var(--accent)" : "0.5px solid var(--line-d)",
              padding: 12,
              minHeight: 100,
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 800,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: isCurrent ? "var(--accent)" : "var(--ink)",
                }}
              >
                {MONTH_FULL[m - 1]}
              </span>
              <span
                style={{
                  fontSize: 10,
                  color: arr.length > 0 ? "var(--muted-d)" : "var(--muted)",
                  fontWeight: 700,
                }}
              >
                {arr.length || "—"}
              </span>
            </div>
            {arr.length === 0 ? (
              <div style={{ fontSize: 10.5, color: "var(--muted)", fontStyle: "italic" }}>
                vazio
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {arr.map((aniv) => {
                  const dia = parseInt(aniv.monthDay.split("-")[1], 10);
                  return (
                    <div
                      key={aniv.id}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "24px 1fr",
                        alignItems: "baseline",
                        gap: 6,
                      }}
                    >
                      <span
                        className="ap-num"
                        style={{
                          fontSize: 13,
                          fontWeight: 700,
                          color: "var(--muted)",
                          textAlign: "right",
                        }}
                      >
                        {String(dia).padStart(2, "0")}
                      </span>
                      <div style={{ minWidth: 0 }}>
                        <div
                          style={{
                            fontSize: 12,
                            fontWeight: 600,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                          title={aniv.name}
                        >
                          {aniv.name}
                        </div>
                        {aniv.nextAge && (
                          <div style={{ fontSize: 9.5, color: "var(--muted)" }}>
                            faz {aniv.nextAge}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
