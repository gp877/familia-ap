import { asc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";

import { BigNumber, Card, Money, SectionRow } from "@/components/ap/atoms";
import { DeleteBtn, FormField, InlineForm, SubmitButton, fieldStyle } from "@/components/ap/inline-form";
import { ScreenShell } from "@/components/ap/screen-shell";
import { addRoteiroDay, deleteRoteiroDay, deleteViagem } from "@/app/actions/viagens";
import { auth } from "@/auth";
import { db } from "@/db";
import { roteiros, users, viagens } from "@/db/schema";

function formatDateBr(d: string | null): string | null {
  if (!d) return null;
  const [y, m, day] = d.split("-").map(Number);
  return new Date(y, m - 1, day).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
  });
}

export default async function ViagemDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) return null;

  const dbUser = await db.query.users.findFirst({
    where: eq(users.id, session.user.id),
  });
  if (!dbUser?.householdId) return null;

  const viagem = await db.query.viagens.findFirst({
    where: eq(viagens.id, id),
  });
  if (!viagem || viagem.householdId !== dbUser.householdId) {
    notFound();
  }

  const days = await db.query.roteiros.findMany({
    where: eq(roteiros.viagemId, viagem.id),
    orderBy: [asc(roteiros.dayNumber)],
  });

  const totalRoteiroCost = days.reduce(
    (sum, d) => sum + (d.estimatedCost ? parseFloat(d.estimatedCost) : 0),
    0
  );
  const totalKm = days.reduce((sum, d) => sum + (d.distanceKm ?? 0), 0);

  const dateRange = [formatDateBr(viagem.startDate), formatDateBr(viagem.endDate)]
    .filter(Boolean)
    .join(" – ");

  return (
    <ScreenShell
      userQ={`Me mostra o roteiro de ${viagem.title}`}
      insight={
        days.length === 0 ? (
          <>Sem roteiro ainda. Adiciona o primeiro dia abaixo — preencha cidade, distância e os 3 períodos.</>
        ) : (
          <>
            <b>{days.length}</b> {days.length === 1 ? "dia montado" : "dias montados"}
            {totalKm > 0 ? ` · ${totalKm} km` : ""}
            {totalRoteiroCost > 0 ? (
              <> · estimativa total <Money value={totalRoteiroCost} size={14} /></>
            ) : null}
            .
          </>
        )
      }
    >
      <SectionRow
        icon="plane"
        label={viagem.title}
        action={
          <DeleteBtn
            action={async () => {
              "use server";
              await deleteViagem(viagem.id);
              // redirect handled by parent revalidate
            }}
            confirmMsg={`Excluir viagem "${viagem.title}"?`}
          />
        }
      />

      <BigNumber
        value={viagem.destinationCity ?? viagem.title}
        sub={[
          dateRange,
          viagem.nights ? `${viagem.nights} noites` : null,
          viagem.flightInfo,
        ]
          .filter(Boolean)
          .join(" · ")}
        accent={viagem.status !== "past"}
      />

      <div style={{ padding: "14px 20px 0", display: "grid", gap: 10, gridTemplateColumns: "1fr 1fr" }}>
        <Card pad={12}>
          <div className="ap-eyebrow">custo estimado</div>
          <div className="ap-num" style={{ fontSize: 18, marginTop: 4 }}>
            {viagem.estimatedCost
              ? `R$ ${parseFloat(viagem.estimatedCost).toLocaleString("pt-BR")}`
              : "—"}
          </div>
        </Card>
        <Card pad={12}>
          <div className="ap-eyebrow">passagens</div>
          <div style={{ fontSize: 13, marginTop: 4, fontWeight: 600 }}>
            {viagem.ticketsBought ? "✓ compradas" : "pendentes"}
          </div>
        </Card>
      </div>

      <SectionRow icon="cal" label="Roteiro · dia a dia" action={`${days.length} dias`} />

      <div style={{ padding: "0 20px", display: "flex", flexDirection: "column", gap: 10 }}>
        {days.map((d) => (
          <Card key={d.id} pad={14} raised>
            <div
              style={{
                display: "flex",
                alignItems: "baseline",
                justifyContent: "space-between",
                gap: 8,
                marginBottom: 8,
              }}
            >
              <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                <span
                  className="ap-num"
                  style={{ fontSize: 22, color: "var(--accent)" }}
                >
                  D{d.dayNumber}
                </span>
                <span style={{ fontSize: 13, color: "var(--muted-d)" }}>
                  {formatDateBr(d.date)} {d.dayOfWeek ? `· ${d.dayOfWeek}` : ""}{" "}
                  {d.city ? `· ${d.city}` : ""}
                </span>
              </div>
              <DeleteBtn
                action={async () => {
                  "use server";
                  await deleteRoteiroDay(d.id);
                }}
                confirmMsg="Excluir dia?"
              />
            </div>

            {[
              { label: "manhã", v: d.programManha },
              { label: "tarde", v: d.programTarde },
              { label: "noite", v: d.programNoite },
            ].map((row) => (
              <div key={row.label} style={{ display: "flex", gap: 10, padding: "3px 0", fontSize: 12.5 }}>
                <span
                  style={{
                    width: 50,
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: "0.12em",
                    textTransform: "uppercase",
                    color: "var(--muted)",
                    paddingTop: 2,
                  }}
                >
                  {row.label}
                </span>
                <span style={{ flex: 1, color: row.v ? "var(--ink-d)" : "var(--muted)" }}>
                  {row.v || "—"}
                </span>
              </div>
            ))}

            {(d.distanceKm || d.estimatedCost) && (
              <div
                style={{
                  display: "flex",
                  gap: 14,
                  marginTop: 8,
                  fontSize: 11.5,
                  color: "var(--muted)",
                }}
              >
                {d.distanceKm ? <span>{d.distanceKm} km</span> : null}
                {d.estimatedCost ? (
                  <span>
                    R${" "}
                    {parseFloat(d.estimatedCost).toLocaleString("pt-BR", {
                      minimumFractionDigits: 2,
                    })}
                  </span>
                ) : null}
              </div>
            )}
            {d.notes && (
              <div
                style={{
                  marginTop: 6,
                  fontSize: 11.5,
                  color: "var(--muted-d)",
                  fontStyle: "italic",
                }}
              >
                {d.notes}
              </div>
            )}
          </Card>
        ))}
      </div>

      <div style={{ padding: "14px 0 0" }}>
        <InlineForm buttonLabel="Adicionar dia ao roteiro">
          {(close) => (
            <form
              action={async (fd) => {
                "use server";
                await addRoteiroDay(fd);
              }}
              onSubmit={() => setTimeout(close, 0)}
            >
              <input type="hidden" name="viagemId" value={viagem.id} />
              <div style={{ display: "grid", gap: 8, gridTemplateColumns: "70px 1fr 90px" }}>
                <FormField label="Dia #">
                  <input
                    type="number"
                    name="dayNumber"
                    placeholder={String(days.length + 1)}
                    style={fieldStyle}
                  />
                </FormField>
                <FormField label="Data">
                  <input type="date" name="date" style={fieldStyle} />
                </FormField>
                <FormField label="Dia">
                  <input name="dayOfWeek" placeholder="Seg" style={fieldStyle} />
                </FormField>
              </div>
              <div style={{ display: "grid", gap: 8, gridTemplateColumns: "1fr 90px" }}>
                <FormField label="Cidade">
                  <input name="city" placeholder="Lisboa" style={fieldStyle} />
                </FormField>
                <FormField label="KM">
                  <input type="number" name="distanceKm" style={fieldStyle} />
                </FormField>
              </div>
              <FormField label="Manhã">
                <input name="programManha" style={fieldStyle} />
              </FormField>
              <FormField label="Tarde">
                <input name="programTarde" style={fieldStyle} />
              </FormField>
              <FormField label="Noite">
                <input name="programNoite" style={fieldStyle} />
              </FormField>
              <FormField label="Custo estimado (R$)">
                <input type="number" step="0.01" name="estimatedCost" style={fieldStyle} />
              </FormField>
              <FormField label="Notas">
                <textarea name="notes" rows={2} style={fieldStyle} />
              </FormField>
              <SubmitButton>Adicionar dia</SubmitButton>
            </form>
          )}
        </InlineForm>
      </div>
    </ScreenShell>
  );
}
