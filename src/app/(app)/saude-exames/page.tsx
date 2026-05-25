import { desc, eq } from "drizzle-orm";

import { BigNumber, Pill, SectionRow } from "@/components/ap/atoms";
import { DeleteBtn, FormField, InlineForm, SubmitButton, fieldStyle } from "@/components/ap/inline-form";
import { ScreenShell } from "@/components/ap/screen-shell";
import { createExame, deleteExame } from "@/app/actions/saude";
import { auth } from "@/auth";
import { db } from "@/db";
import { exames, users } from "@/db/schema";

function formatDate(d: string) {
  const [y, m, day] = d.split("-").map(Number);
  return new Date(y, m - 1, day).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "2-digit",
  });
}

export default async function ExamesPage() {
  const session = await auth();
  if (!session?.user?.id) return null;
  const dbUser = await db.query.users.findFirst({
    where: eq(users.id, session.user.id),
  });
  if (!dbUser?.householdId) return null;

  const all = await db.query.exames.findMany({
    where: eq(exames.householdId, dbUser.householdId),
    orderBy: [desc(exames.examDate)],
  });

  const last = all[0];

  return (
    <ScreenShell
      userQ="Quando foi o último check-up nosso?"
      insight={
        last ? (
          <>
            Último: <b>{last.name}</b> ({last.who}) em {formatDate(last.examDate)}.
            {last.status === "atencao"
              ? " ⚠️ marcado como atenção."
              : last.status === "anormal"
                ? " ⚠️ marcado como anormal."
                : ""}
          </>
        ) : (
          <>Sem exames cadastrados. Adiciona o último check-up abaixo.</>
        )
      }
    >
      <SubNav active="exames" />

      <SectionRow icon="file" label="Histórico de exames" action={`${all.length} cadastrados`} />

      {last ? (
        <BigNumber
          value={last.name}
          sub={`${last.who} · ${formatDate(last.examDate)}${last.doctor ? ` · ${last.doctor}` : ""}`}
        />
      ) : (
        <BigNumber value="—" sub="sem exames" />
      )}

      <div style={{ padding: "14px 0 0" }}>
        <InlineForm buttonLabel="Cadastrar exame">
          <form action={createExame}>
              <div style={{ display: "grid", gap: 8, gridTemplateColumns: "1fr 1fr" }}>
                <FormField label="Quem *" hint="Augusto, Marília…">
                  <input name="who" required placeholder="Augusto" style={fieldStyle} />
                </FormField>
                <FormField label="Status">
                  <select name="status" defaultValue="ok" style={fieldStyle}>
                    <option value="ok">OK</option>
                    <option value="atencao">Atenção</option>
                    <option value="anormal">Anormal</option>
                    <option value="pendente">Pendente</option>
                  </select>
                </FormField>
              </div>
              <FormField label="Nome do exame *">
                <input
                  name="name"
                  required
                  placeholder="Check-up cardio, Sangue completo…"
                  style={fieldStyle}
                />
              </FormField>
              <div style={{ display: "grid", gap: 8, gridTemplateColumns: "1fr 1fr" }}>
                <FormField label="Data *">
                  <input type="date" name="examDate" required style={fieldStyle} />
                </FormField>
                <FormField label="Médico / Lab">
                  <input
                    name="doctor"
                    placeholder="Dr. Salles, Lab Sabin…"
                    style={fieldStyle}
                  />
                </FormField>
              </div>
              <FormField label="Resultado resumido">
                <input
                  name="result"
                  placeholder="CK e CKMB normais, LDL limite alto…"
                  style={fieldStyle}
                />
              </FormField>
              <FormField label="Observações">
                <textarea name="notes" rows={2} style={fieldStyle} />
              </FormField>
              <FormField label="URL do anexo" hint="opcional · link pro PDF/foto">
                <input
                  type="url"
                  name="attachmentUrl"
                  placeholder="https://..."
                  style={fieldStyle}
                />
              </FormField>
            <SubmitButton>Salvar exame</SubmitButton>
          </form>
        </InlineForm>
      </div>

      <div style={{ padding: "14px 20px 0" }}>
        {all.length === 0 ? (
          <div style={{ fontSize: 13, color: "var(--muted)", textAlign: "center", padding: "20px 0" }}>
            Nenhum exame cadastrado.
          </div>
        ) : (
          all.map((e, i) => (
            <div
              key={e.id}
              style={{
                display: "flex",
                gap: 12,
                alignItems: "flex-start",
                padding: "12px 0",
                borderBottom: i < all.length - 1 ? "0.5px solid var(--line-d)" : "none",
              }}
            >
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 16,
                  background: e.who.toUpperCase().startsWith("A") ? "var(--card2)" : "var(--accent)",
                  color: e.who.toUpperCase().startsWith("A") ? "var(--ink)" : "var(--accent-on)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 11,
                  fontWeight: 700,
                  flexShrink: 0,
                }}
              >
                {e.who.slice(0, 1).toUpperCase()}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "baseline",
                    gap: 8,
                  }}
                >
                  <span style={{ fontSize: 13.5, fontWeight: 600 }}>{e.name}</span>
                  <span style={{ fontSize: 10.5, color: "var(--muted)", flexShrink: 0 }}>
                    {formatDate(e.examDate)}
                  </span>
                </div>
                <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 1 }}>
                  {[e.who, e.doctor].filter(Boolean).join(" · ")}
                </div>
                <div style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <Pill
                    tone={
                      e.status === "ok"
                        ? "ok"
                        : e.status === "pendente"
                          ? "muted"
                          : "alert"
                    }
                  >
                    {e.status === "ok"
                      ? "ok"
                      : e.status === "atencao"
                        ? "atenção"
                        : e.status === "anormal"
                          ? "anormal"
                          : "pendente"}
                  </Pill>
                  {e.result && (
                    <span style={{ fontSize: 11.5, color: "var(--ink-d)", opacity: 0.85 }}>
                      {e.result}
                    </span>
                  )}
                  {e.attachmentUrl && (
                    <a
                      href={e.attachmentUrl}
                      target="_blank"
                      rel="noopener"
                      style={{ fontSize: 11, color: "var(--accent)", fontWeight: 600 }}
                    >
                      ver anexo →
                    </a>
                  )}
                </div>
                {e.notes && (
                  <div style={{ fontSize: 11, color: "var(--muted-d)", marginTop: 4, fontStyle: "italic" }}>
                    {e.notes}
                  </div>
                )}
              </div>
              <DeleteBtn
                action={deleteExame.bind(null, e.id)}
                confirmMsg={`Excluir "${e.name}"?`}
              />
            </div>
          ))
        )}
      </div>
    </ScreenShell>
  );
}

export function SubNav({ active }: { active: "exames" | "peso" }) {
  return (
    <div style={{ padding: "8px 20px 0", display: "flex", gap: 8 }}>
      <a
        href="/saude-exames"
        style={{
          padding: "6px 14px",
          borderRadius: 999,
          fontSize: 12,
          fontWeight: 600,
          background: active === "exames" ? "var(--card)" : "transparent",
          color: active === "exames" ? "var(--ink)" : "var(--muted-d)",
          textDecoration: "none",
        }}
      >
        Exames
      </a>
      <a
        href="/saude-peso"
        style={{
          padding: "6px 14px",
          borderRadius: 999,
          fontSize: 12,
          fontWeight: 600,
          background: active === "peso" ? "var(--card)" : "transparent",
          color: active === "peso" ? "var(--ink)" : "var(--muted-d)",
          textDecoration: "none",
        }}
      >
        Peso
      </a>
    </div>
  );
}
