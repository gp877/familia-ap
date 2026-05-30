import { asc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";

import { BigNumber, Card, Money, Pill, SectionRow } from "@/components/ap/atoms";
import {
  BackButton,
  DeleteBtn,
  FormField,
  InlineForm,
  SubmitButton,
  fieldStyle,
} from "@/components/ap/inline-form";
import { InlineEditInput } from "@/components/ap/inline-edit-input";
import { ScreenShell } from "@/components/ap/screen-shell";
import {
  addPassagem,
  addRoteiroDay,
  deletePassagem,
  deleteRoteiroDay,
  deleteViagem,
  patchRoteiroDay,
} from "@/app/actions/viagens";
import { auth } from "@/auth";
import { db } from "@/db";
import {
  roteiros,
  users,
  viagemPassagens,
  viagens,
} from "@/db/schema";

function formatDateBr(d: string | null): string | null {
  if (!d) return null;
  const [y, m, day] = d.split("-").map(Number);
  return new Date(y, m - 1, day).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
  });
}

function formatDateTime(d: Date | string | null): string {
  if (!d) return "—";
  const dt = new Date(d);
  return dt.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtBRL(n: number): string {
  return n.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function num(s: string | null | undefined): number {
  return s ? parseFloat(s) || 0 : 0;
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

  // Roteiro + passagens em paralelo
  const [days, passagens] = await Promise.all([
    db.query.roteiros.findMany({
      where: eq(roteiros.viagemId, viagem.id),
      orderBy: [asc(roteiros.dayNumber)],
    }),
    db.query.viagemPassagens.findMany({
      where: eq(viagemPassagens.viagemId, viagem.id),
      orderBy: [asc(viagemPassagens.segmentOrder)],
    }),
  ]);

  // Totais
  const totalPassagens = passagens.reduce((s, p) => s + num(p.cost), 0);
  const totalDias = days.reduce(
    (sum, d) =>
      sum +
      num(d.costAlimentacao) +
      num(d.costHospedagem) +
      num(d.costPasseios) +
      num(d.costTraslados) +
      num(d.estimatedCost),
    0
  );
  const totalGeral = totalPassagens + totalDias;
  const totalKm = days.reduce((sum, d) => sum + (d.distanceKm ?? 0), 0);

  const dateRange = [formatDateBr(viagem.startDate), formatDateBr(viagem.endDate)]
    .filter(Boolean)
    .join(" – ");

  return (
    <ScreenShell
      insight={
        days.length === 0 && passagens.length === 0 ? (
          <>
            Comece pelas passagens (vôo, custos) e depois monte o roteiro dia
            a dia com custos discriminados.
          </>
        ) : (
          <>
            <b>{passagens.length}</b> {passagens.length === 1 ? "vôo" : "vôos"} ·{" "}
            <b>{days.length}</b> {days.length === 1 ? "dia" : "dias"} no roteiro
            {totalKm > 0 ? ` · ${totalKm} km` : ""}
            {totalGeral > 0 ? (
              <> · custo total <Money value={totalGeral} size={14} /></>
            ) : null}
            .
          </>
        )
      }
    >
      <div style={{ padding: "0 20px 8px" }}>
        <BackButton href="/viagens" label="Viagens" />
      </div>

      <SectionRow
        icon="plane"
        label={viagem.title}
        action={
          <DeleteBtn
            action={deleteViagem.bind(null, viagem.id)}
            confirmMsg={`Excluir viagem "${viagem.title}"?`}
          />
        }
      />

      <BigNumber
        value={viagem.destinationCity ?? viagem.title}
        sub={[
          dateRange,
          viagem.nights ? `${viagem.nights} noites` : null,
        ]
          .filter(Boolean)
          .join(" · ")}
        accent={viagem.status !== "past"}
      />

      {/* Cards de resumo de custo */}
      <div
        style={{
          padding: "14px 20px 0",
          display: "grid",
          gap: 10,
          gridTemplateColumns: "1fr 1fr 1fr",
        }}
      >
        <Card pad={12}>
          <div className="ap-eyebrow">passagens</div>
          <div
            className="ap-num"
            style={{
              fontSize: 17,
              marginTop: 4,
              color: totalPassagens > 0 ? "var(--ink)" : "var(--muted)",
            }}
          >
            R$ {fmtBRL(totalPassagens)}
          </div>
        </Card>
        <Card pad={12}>
          <div className="ap-eyebrow">no destino</div>
          <div
            className="ap-num"
            style={{
              fontSize: 17,
              marginTop: 4,
              color: totalDias > 0 ? "var(--ink)" : "var(--muted)",
            }}
          >
            R$ {fmtBRL(totalDias)}
          </div>
        </Card>
        <Card pad={12} raised>
          <div className="ap-eyebrow">total</div>
          <div
            className="ap-num"
            style={{
              fontSize: 17,
              marginTop: 4,
              color: "var(--accent)",
            }}
          >
            R$ {fmtBRL(totalGeral)}
          </div>
        </Card>
      </div>

      {/* ── PASSAGENS AÉREAS ───────────────────────────────────── */}
      <SectionRow
        icon="plane"
        label="Passagens aéreas"
        action={
          passagens.length > 0 ? (
            <Pill tone={viagem.ticketsBought ? "ok" : "muted"}>
              {viagem.ticketsBought ? "compradas" : "pendente"}
            </Pill>
          ) : (
            "0"
          )
        }
      />

      <div style={{ padding: "0 20px", display: "flex", flexDirection: "column", gap: 10 }}>
        {passagens.map((p) => (
          <PassagemCard key={p.id} p={p} />
        ))}
      </div>

      <div style={{ padding: "12px 0 0" }}>
        <InlineForm buttonLabel="Adicionar vôo / segmento">
          <form action={addPassagem}>
            <input type="hidden" name="viagemId" value={viagem.id} />
            <div style={{ display: "grid", gap: 8, gridTemplateColumns: "1fr 1fr" }}>
              <FormField label="Companhia">
                <input
                  name="airline"
                  list="airlines"
                  placeholder="LATAM"
                  style={fieldStyle}
                />
                <datalist id="airlines">
                  <option value="LATAM" />
                  <option value="GOL" />
                  <option value="Azul" />
                  <option value="TAP" />
                  <option value="American Airlines" />
                  <option value="United" />
                  <option value="Delta" />
                  <option value="Iberia" />
                  <option value="Lufthansa" />
                  <option value="Air France" />
                  <option value="Emirates" />
                  <option value="Qatar" />
                </datalist>
              </FormField>
              <FormField label="Vôo">
                <input
                  name="flightNumber"
                  placeholder="LA 8084"
                  style={fieldStyle}
                />
              </FormField>
            </div>
            <div style={{ display: "grid", gap: 8, gridTemplateColumns: "1fr 1fr" }}>
              <FormField label="Origem (IATA)" hint="GRU, GIG…">
                <input
                  name="departureAirport"
                  maxLength={3}
                  placeholder="GRU"
                  style={{ ...fieldStyle, textTransform: "uppercase" }}
                />
              </FormField>
              <FormField label="Saída">
                <input
                  type="datetime-local"
                  name="departureAt"
                  style={fieldStyle}
                />
              </FormField>
            </div>
            <div style={{ display: "grid", gap: 8, gridTemplateColumns: "1fr 1fr" }}>
              <FormField label="Destino (IATA)" hint="LIS, OPO…">
                <input
                  name="arrivalAirport"
                  maxLength={3}
                  placeholder="LIS"
                  style={{ ...fieldStyle, textTransform: "uppercase" }}
                />
              </FormField>
              <FormField label="Chegada">
                <input
                  type="datetime-local"
                  name="arrivalAt"
                  style={fieldStyle}
                />
              </FormField>
            </div>
            <div style={{ display: "grid", gap: 8, gridTemplateColumns: "1fr 90px 110px" }}>
              <FormField label="Custo total (R$)">
                <input
                  type="number"
                  step="0.01"
                  name="cost"
                  placeholder="3200"
                  style={fieldStyle}
                />
              </FormField>
              <FormField label="Pax">
                <input
                  type="number"
                  name="passengers"
                  placeholder="2"
                  style={fieldStyle}
                />
              </FormField>
              <FormField label="Localizador">
                <input
                  name="bookingReference"
                  placeholder="ABC123"
                  style={{ ...fieldStyle, textTransform: "uppercase" }}
                />
              </FormField>
            </div>
            <FormField label="Notas">
              <input
                name="notes"
                placeholder="ex: assento extra, classe executiva, …"
                style={fieldStyle}
              />
            </FormField>
            <SubmitButton>Adicionar vôo</SubmitButton>
          </form>
        </InlineForm>
      </div>

      {/* ── ROTEIRO DIA A DIA ──────────────────────────────────── */}
      <SectionRow icon="cal" label="Roteiro · dia a dia" action={`${days.length} dias`} />

      <div style={{ padding: "0 20px", display: "flex", flexDirection: "column", gap: 12 }}>
        {days.map((d) => (
          <RoteiroDayCard key={d.id} d={d} />
        ))}
      </div>

      <div style={{ padding: "14px 0 0" }}>
        <InlineForm buttonLabel="Adicionar dia ao roteiro">
          <form action={addRoteiroDay}>
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
            <FormField label="Notas">
              <textarea name="notes" rows={2} style={fieldStyle} />
            </FormField>
            <SubmitButton>Adicionar dia</SubmitButton>
          </form>
        </InlineForm>
      </div>
    </ScreenShell>
  );
}

// ────────────────────────────────────────────────────────────────
// Cards
// ────────────────────────────────────────────────────────────────

function PassagemCard({ p }: { p: typeof viagemPassagens.$inferSelect }) {
  const cost = num(p.cost);
  return (
    <Card pad={14} raised>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          marginBottom: 10,
        }}
      >
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <span style={{ fontSize: 13.5, fontWeight: 700 }}>
            {p.airline || "Companhia"}
          </span>
          {p.flightNumber && (
            <span
              className="ap-num"
              style={{
                fontSize: 11.5,
                color: "var(--accent)",
                fontWeight: 700,
                padding: "2px 8px",
                borderRadius: 999,
                background: "color-mix(in oklab, var(--accent) 14%, transparent)",
              }}
            >
              {p.flightNumber}
            </span>
          )}
        </div>
        <DeleteBtn action={deletePassagem.bind(null, p.id)} confirmMsg={null} />
      </div>

      {/* Itinerário: origem → destino */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr auto 1fr",
          alignItems: "center",
          gap: 12,
        }}
      >
        <div style={{ textAlign: "left" }}>
          <div
            className="ap-num"
            style={{
              fontSize: 24,
              fontWeight: 800,
              letterSpacing: "-0.04em",
              color: p.departureAirport ? "var(--ink)" : "var(--muted)",
            }}
          >
            {p.departureAirport || "?"}
          </div>
          <div style={{ fontSize: 10.5, color: "var(--muted)", marginTop: 2 }}>
            {formatDateTime(p.departureAt)}
          </div>
        </div>
        <div
          style={{
            color: "var(--accent)",
            fontSize: 18,
          }}
          aria-hidden
        >
          →
        </div>
        <div style={{ textAlign: "right" }}>
          <div
            className="ap-num"
            style={{
              fontSize: 24,
              fontWeight: 800,
              letterSpacing: "-0.04em",
              color: p.arrivalAirport ? "var(--ink)" : "var(--muted)",
            }}
          >
            {p.arrivalAirport || "?"}
          </div>
          <div style={{ fontSize: 10.5, color: "var(--muted)", marginTop: 2 }}>
            {formatDateTime(p.arrivalAt)}
          </div>
        </div>
      </div>

      {/* Footer com custo + pax + localizador */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          marginTop: 12,
          paddingTop: 10,
          borderTop: "0.5px dashed var(--line-d)",
          fontSize: 11.5,
          color: "var(--muted-d)",
        }}
      >
        {cost > 0 ? (
          <span
            className="ap-num"
            style={{ fontSize: 13, fontWeight: 700, color: "var(--ink)" }}
          >
            R$ {fmtBRL(cost)}
          </span>
        ) : (
          <span style={{ color: "var(--muted)", fontStyle: "italic" }}>sem custo</span>
        )}
        {p.passengers && <span>{p.passengers} pax</span>}
        {p.bookingReference && (
          <span style={{ marginLeft: "auto" }}>
            <span style={{ color: "var(--muted)" }}>loc:</span>{" "}
            <span className="ap-num">{p.bookingReference}</span>
          </span>
        )}
      </div>
      {p.notes && (
        <div style={{ fontSize: 11, color: "var(--muted-d)", marginTop: 8, fontStyle: "italic" }}>
          {p.notes}
        </div>
      )}
    </Card>
  );
}

function RoteiroDayCard({ d }: { d: typeof roteiros.$inferSelect }) {
  const dayTotal =
    num(d.costAlimentacao) +
    num(d.costHospedagem) +
    num(d.costPasseios) +
    num(d.costTraslados) +
    num(d.estimatedCost);

  return (
    <Card pad={14} raised>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 8,
          marginBottom: 10,
        }}
      >
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <span className="ap-num" style={{ fontSize: 22, color: "var(--accent)" }}>
            D{d.dayNumber}
          </span>
          <span style={{ fontSize: 13, color: "var(--muted-d)" }}>
            {formatDateBr(d.date)} {d.dayOfWeek ? `· ${d.dayOfWeek}` : ""}{" "}
            {d.city ? `· ${d.city}` : ""}
          </span>
        </div>
        <DeleteBtn action={deleteRoteiroDay.bind(null, d.id)} confirmMsg="Excluir dia?" />
      </div>

      {/* Programa do dia (3 períodos) */}
      {[
        { label: "manhã", v: d.programManha },
        { label: "tarde", v: d.programTarde },
        { label: "noite", v: d.programNoite },
      ].map((row) => (
        <div
          key={row.label}
          style={{ display: "flex", gap: 10, padding: "3px 0", fontSize: 12.5 }}
        >
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
          <span
            style={{
              flex: 1,
              color: row.v ? "var(--ink-d)" : "var(--muted)",
            }}
          >
            {row.v || "—"}
          </span>
        </div>
      ))}

      {/* Grid de custos discriminados — editáveis inline */}
      <div
        style={{
          marginTop: 12,
          paddingTop: 10,
          borderTop: "0.5px dashed var(--line-d)",
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 6,
        }}
      >
        <CostChip
          id={d.id}
          field="costAlimentacao"
          label="alimentação"
          value={d.costAlimentacao}
          icon="🍴"
        />
        <CostChip
          id={d.id}
          field="costHospedagem"
          label="hospedagem"
          value={d.costHospedagem}
          icon="🏨"
        />
        <CostChip
          id={d.id}
          field="costPasseios"
          label="passeios"
          value={d.costPasseios}
          icon="🎟"
        />
        <CostChip
          id={d.id}
          field="costTraslados"
          label="traslados"
          value={d.costTraslados}
          icon="🚖"
        />
      </div>

      {/* Total do dia */}
      {dayTotal > 0 && (
        <div
          style={{
            marginTop: 10,
            paddingTop: 8,
            borderTop: "0.5px solid var(--line-d)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            fontSize: 11,
            color: "var(--muted)",
          }}
        >
          <span>
            {d.distanceKm ? `${d.distanceKm} km · ` : ""}total do dia
          </span>
          <span
            className="ap-num"
            style={{
              fontSize: 14,
              fontWeight: 700,
              color: "var(--ink)",
            }}
          >
            R$ {fmtBRL(dayTotal)}
          </span>
        </div>
      )}

      {d.notes && (
        <div
          style={{
            marginTop: 8,
            fontSize: 11.5,
            color: "var(--muted-d)",
            fontStyle: "italic",
          }}
        >
          {d.notes}
        </div>
      )}
    </Card>
  );
}

/**
 * Chip de custo editável — pastel sem borda, eyebrow + valor R$.
 * Cada chip é um form independente que despacha patchRoteiroDay com
 * o campo certo.
 */
function CostChip({
  id,
  field,
  label,
  value,
  icon,
}: {
  id: string;
  field: "costAlimentacao" | "costHospedagem" | "costPasseios" | "costTraslados";
  label: string;
  value: string | null;
  icon: string;
}) {
  const hasValue = value && parseFloat(value) > 0;
  return (
    <div
      style={{
        background: hasValue
          ? "color-mix(in oklab, var(--accent) 10%, transparent)"
          : "var(--card2)",
        border: "0.5px dashed var(--line-d)",
        borderRadius: 10,
        padding: "6px 10px",
        display: "flex",
        flexDirection: "column",
        gap: 2,
      }}
    >
      <div
        style={{
          fontSize: 9,
          fontWeight: 700,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: "var(--muted)",
          display: "flex",
          alignItems: "center",
          gap: 4,
        }}
      >
        <span aria-hidden>{icon}</span>
        {label}
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 3 }}>
        <span style={{ fontSize: 11, color: "var(--muted)" }}>R$</span>
        <InlineEditInput
          initialValue={value ? parseFloat(value).toFixed(2) : ""}
          action={patchRoteiroDay}
          hiddenFields={{ id }}
          fieldName={field}
          placeholder="0,00"
          fontSize={13}
          fontWeight={700}
          color={hasValue ? "var(--ink)" : "var(--muted-d)"}
        />
      </div>
    </div>
  );
}
