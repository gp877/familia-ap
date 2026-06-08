import { and, asc, desc, eq } from "drizzle-orm";
import Link from "next/link";

import { BigNumber, Card, Pill, SectionRow } from "@/components/ap/atoms";
import { ChipToggle } from "@/components/ap/chip-toggle";
import { DeleteBtn, FormField, InlineForm, SubmitButton, fieldStyle } from "@/components/ap/inline-form";
import { InlineEditInput } from "@/components/ap/inline-edit-input";
import { ScreenShell } from "@/components/ap/screen-shell";
import { ViewToggle } from "@/components/ap/view-toggle";
import { createViagem, deleteViagem, patchViagem } from "@/app/actions/viagens";
import { auth } from "@/auth";
import { db } from "@/db";
import { travelDrafts, users, viagens } from "@/db/schema";

import { TravelDraftGrid } from "./travel-draft-grid";

function formatDateBr(d: string | null): string | null {
  if (!d) return null;
  const [y, m, day] = d.split("-").map(Number);
  return new Date(y, m - 1, day).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
  });
}

function daysFromToday(d: string | null): number | null {
  if (!d) return null;
  const [y, m, day] = d.split("-").map(Number);
  const target = new Date(y, m - 1, day);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

type SearchParams = Promise<{ view?: string; draftYear?: string }>;

export default async function ViagensPage({
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

  const all = await db.query.viagens.findMany({
    where: eq(viagens.householdId, dbUser.householdId),
    orderBy: [desc(viagens.startDate), desc(viagens.createdAt)],
  });

  // Rascunho do ano: anotação leve por mês ("Agosto: Noronha"). Não tem
  // ligação com `viagens` cadastradas nem com roteiros.
  const draftYear = sp.draftYear && /^\d{4}$/.test(sp.draftYear)
    ? parseInt(sp.draftYear, 10)
    : new Date().getFullYear();
  const draftsRaw = await db.query.travelDrafts.findMany({
    where: and(
      eq(travelDrafts.householdId, dbUser.householdId),
      eq(travelDrafts.year, draftYear)
    ),
    orderBy: [asc(travelDrafts.month)],
  });
  const draftsForGrid = draftsRaw.map((d) => ({
    id: d.id,
    year: d.year,
    month: d.month,
    title: d.title,
    notes: d.notes,
  }));
  const draftYearOptions = [draftYear - 1, draftYear, draftYear + 1];

  const planned = all.filter((v) => v.status === "planned" || v.status === "in_progress");
  const past = all.filter((v) => v.status === "past");

  // próximo: a viagem planejada mais próxima
  const nextTrip = planned
    .filter((v) => v.startDate)
    .sort((a, b) => (a.startDate! < b.startDate! ? -1 : 1))[0];
  const nextDays = nextTrip ? daysFromToday(nextTrip.startDate) : null;

  // resumo ano
  const currentYear = new Date().getFullYear();
  const yearPast = past.filter((v) => v.startDate?.startsWith(String(currentYear)));
  const totalNights = yearPast.reduce((sum, v) => sum + (v.nights ?? 0), 0);
  const totalCities = new Set(yearPast.map((v) => v.destinationCity).filter(Boolean)).size;
  const totalCountries = new Set(
    yearPast.map((v) => v.destinationCountry).filter(Boolean)
  ).size;

  return (
    <ScreenShell
      userQ="Como tá o ano de viagens?"
      insight={
        nextTrip ? (
          <>
            Próxima: <b>{nextTrip.title}</b> {nextDays !== null ? (nextDays === 0 ? "hoje" : `em ${nextDays} dias`) : ""}
            {nextTrip.ticketsBought ? " · passagens compradas" : " · sem passagens"}.
          </>
        ) : yearPast.length > 0 ? (
          <>Esse ano: {yearPast.length} viagens · {totalNights} noites. Quer planejar a próxima?</>
        ) : (
          <>Nenhuma viagem registrada. Adiciona uma — pode ser do passado ou futura.</>
        )
      }
    >
      <SectionRow
        icon="plane"
        label={isList ? "Todas as viagens" : `Viagens de ${currentYear}`}
        action={
          <ViewToggle basePath="/viagens" current={sp.view} />
        }
      />

      <BigNumber
        value={`${totalNights} noites`}
        sub={`${totalCities} ${totalCities === 1 ? "cidade" : "cidades"} · ${totalCountries} ${totalCountries === 1 ? "país" : "países"} · histórico de ${currentYear}`}
      />

      {/* Rascunho do ano — anotações leves por mês. Independente das
          viagens cadastradas abaixo (que têm datas, custo, status etc). */}
      <div style={{ marginTop: 18 }}>
        <TravelDraftGrid
          year={draftYear}
          drafts={draftsForGrid}
          yearOptions={draftYearOptions}
        />
      </div>

      <div style={{ padding: "14px 0 0" }}>
        <InlineForm buttonLabel="Cadastrar viagem">
          <form action={createViagem}>
            <FormField label="Pra onde? *">
              <input
                name="title"
                required
                autoFocus
                placeholder="Ex: Lisboa + Porto"
                style={fieldStyle}
              />
            </FormField>
            <div style={{ display: "grid", gap: 8, gridTemplateColumns: "1fr 90px" }}>
              <FormField label="Cidade">
                <input name="destinationCity" placeholder="Lisboa" style={fieldStyle} />
              </FormField>
              <FormField label="País" hint="2 letras">
                <input
                  name="destinationCountry"
                  maxLength={2}
                  placeholder="PT"
                  style={{ ...fieldStyle, textTransform: "uppercase" }}
                />
              </FormField>
            </div>
            <div style={{ display: "grid", gap: 8, gridTemplateColumns: "1fr 1fr" }}>
              <FormField label="Saída">
                <input type="date" name="startDate" style={fieldStyle} />
              </FormField>
              <FormField label="Volta">
                <input type="date" name="endDate" style={fieldStyle} />
              </FormField>
            </div>
            <FormField label="Status *">
              <select name="status" style={fieldStyle} defaultValue="planned">
                <option value="planned">Planejada</option>
                <option value="in_progress">Em curso</option>
                <option value="past">Já fizemos</option>
              </select>
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
                + custo, voo, capa, notas (opcionais)
              </summary>
              <div style={{ marginTop: 8 }}>
                <FormField label="Custo estimado (R$)">
                  <input
                    type="number"
                    step="0.01"
                    name="estimatedCost"
                    placeholder="12000"
                    style={fieldStyle}
                  />
                </FormField>
                <FormField label="Info do voo">
                  <input
                    name="flightInfo"
                    placeholder="LATAM 8084 · 27/05 22h05"
                    style={fieldStyle}
                  />
                </FormField>
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    fontSize: 12.5,
                    marginBottom: 10,
                  }}
                >
                  <input type="checkbox" name="ticketsBought" />
                  Passagens já compradas
                </label>
                <FormField label="URL da capa" hint="imagem do destino">
                  <input type="url" name="coverImageUrl" placeholder="https://..." style={fieldStyle} />
                </FormField>
                <FormField label="Notas">
                  <textarea name="notes" rows={2} style={fieldStyle} />
                </FormField>
              </div>
            </details>

            <SubmitButton>Salvar viagem</SubmitButton>
          </form>
        </InlineForm>
      </div>

      {isList ? (
        <div style={{ padding: "0 20px" }}>
          {all.length === 0 ? (
            <div style={{ fontSize: 13, color: "var(--muted)", textAlign: "center", padding: "20px 0" }}>
              Nenhuma viagem cadastrada.
            </div>
          ) : (
            all.map((v, i) => (
              <Link
                key={v.id}
                href={`/viagens/${v.id}`}
                style={{ textDecoration: "none", color: "inherit" }}
              >
                <div
                  style={{
                    display: "flex",
                    gap: 12,
                    alignItems: "center",
                    padding: "12px 0",
                    borderBottom: i < all.length - 1 ? "0.5px solid var(--line-d)" : "none",
                  }}
                >
                  <div
                    style={{
                      width: 38,
                      height: 38,
                      borderRadius: 10,
                      background:
                        v.status === "past" ? "var(--card2)" : "var(--accent)",
                      color:
                        v.status === "past" ? "var(--ink)" : "var(--accent-on)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 11,
                      fontWeight: 800,
                      flexShrink: 0,
                    }}
                  >
                    {v.destinationCountry?.toUpperCase() ?? "··"}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 700 }}>{v.title}</div>
                    <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>
                      {[
                        formatDateBr(v.startDate),
                        v.nights ? `${v.nights}n` : null,
                        v.destinationCity,
                      ]
                        .filter(Boolean)
                        .join(" · ") || "—"}
                    </div>
                  </div>
                  <Pill
                    tone={
                      v.status === "past"
                        ? "muted"
                        : v.status === "in_progress"
                          ? "accent"
                          : "ok"
                    }
                  >
                    {v.status === "past"
                      ? "feita"
                      : v.status === "in_progress"
                        ? "em curso"
                        : "planejada"}
                  </Pill>
                </div>
              </Link>
            ))
          )}
        </div>
      ) : (
        <>
          {planned.length > 0 && (
            <>
              <SectionRow icon="plane" label="Planejadas" action={`${planned.length}`} />
              <div style={{ padding: "0 20px", display: "flex", flexDirection: "column", gap: 10 }}>
                {planned.map((v) => (
                  <TripCard key={v.id} v={v} accent />
                ))}
              </div>
            </>
          )}

          {past.length > 0 && (
            <>
              <SectionRow icon="cal" label="Já realizadas" action={`${past.length}`} />
              <div style={{ padding: "0 20px", display: "flex", flexDirection: "column", gap: 10 }}>
                {past.map((v) => (
                  <TripCard key={v.id} v={v} />
                ))}
              </div>
            </>
          )}
        </>
      )}
    </ScreenShell>
  );
}

function TripCard({
  v,
  accent,
}: {
  v: typeof viagens.$inferSelect;
  accent?: boolean;
}) {
  const dates = [formatDateBr(v.startDate), formatDateBr(v.endDate)].filter(Boolean).join(" – ");
  return (
    <Card raised={accent} pad={14} style={{ display: "flex", gap: 14, alignItems: "center" }}>
      <Link
        href={`/viagens/${v.id}`}
        aria-label={`Abrir ${v.title}`}
        style={{
          width: 52,
          height: 52,
          borderRadius: 14,
          background: accent ? "var(--accent)" : "var(--card2)",
          color: accent ? "var(--accent-on)" : "var(--ink)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontWeight: 800,
          fontSize: 17,
          letterSpacing: "-0.02em",
          flexShrink: 0,
          textDecoration: "none",
        }}
      >
        {v.destinationCountry?.toUpperCase() ?? "··"}
      </Link>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            justifyContent: "space-between",
            gap: 8,
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <InlineEditInput
              initialValue={v.title}
              action={patchViagem}
              hiddenFields={{ id: v.id }}
              fieldName="title"
              fontSize={15}
              fontWeight={700}
            />
          </div>
          <ChipToggle
            current={v.status}
            states={[
              { value: "planned", label: "planejada", background: "var(--card2)", color: "var(--ink-d)" },
              { value: "in_progress", label: "em curso", background: "var(--accent)", color: "var(--accent-on)" },
              { value: "past", label: "feita", background: "var(--card2)", color: "var(--muted-d)" },
            ]}
            action={patchViagem}
            hiddenFields={{ id: v.id }}
            fieldName="status"
          />
          {v.ticketsBought && <Pill tone="ok">passagens</Pill>}
        </div>
        {/* Metadata é o segundo alvo de toque pra entrar na viagem */}
        <Link
          href={`/viagens/${v.id}`}
          style={{
            display: "block",
            fontSize: 11.5,
            color: "var(--muted)",
            marginTop: 3,
            textDecoration: "none",
          }}
        >
          {[dates, v.nights ? `${v.nights} noites` : null, v.destinationCity]
            .filter(Boolean)
            .join(" · ") || "—"}
        </Link>
      </div>
      <Link
        href={`/viagens/${v.id}`}
        aria-label={`Abrir ${v.title}`}
        style={{
          width: 40,
          height: 40,
          borderRadius: 10,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--muted-d)",
          textDecoration: "none",
          flexShrink: 0,
          fontSize: 18,
          fontWeight: 700,
        }}
      >
        ›
      </Link>
      <DeleteBtn action={deleteViagem.bind(null, v.id)} confirmMsg={null} />
    </Card>
  );
}
