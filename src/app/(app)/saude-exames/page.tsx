import { asc, desc, eq } from "drizzle-orm";
import Link from "next/link";

import { BigNumber, Card, Pill, SectionRow, Sparkline } from "@/components/ap/atoms";
import { DeleteBtn, FormField, InlineForm, SubmitButton, fieldStyle } from "@/components/ap/inline-form";
import { ExameUpload } from "@/components/ap/exame-upload";
import { PersonPicker } from "@/components/ap/person-picker";
import { ScreenShell } from "@/components/ap/screen-shell";
import { createExame, deleteExame } from "@/app/actions/saude";
import { auth } from "@/auth";
import { db } from "@/db";
import { exameResultados, exames, users } from "@/db/schema";
import { HOUSEHOLD_PEOPLE } from "@/lib/people";

function formatDate(d: string) {
  const [y, m, day] = d.split("-").map(Number);
  return new Date(y, m - 1, day).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "2-digit",
  });
}

function formatDateShort(d: string) {
  const [, m, day] = d.split("-").map(Number);
  return `${String(day).padStart(2, "0")}/${String(m).padStart(2, "0")}`;
}

type SearchParams = Promise<{ view?: string; who?: string }>;

export default async function ExamesPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = await searchParams;
  const view = sp.view ?? "resumo"; // resumo | tabela | grafico
  const whoFilter = sp.who;

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

  // Markers: todos os resultados, filtra por whoFilter se fornecido
  const allResultados = await db.query.exameResultados.findMany({
    where: eq(exameResultados.householdId, dbUser.householdId),
    orderBy: [asc(exameResultados.marker), asc(exameResultados.examDate)],
  });

  // Pessoas: sempre os 3 do household + qualquer outra pessoa que apareça em dados antigos
  const dataPeople = new Set<string>();
  for (const e of all) dataPeople.add(e.who);
  for (const r of allResultados) dataPeople.add(r.who);
  const peopleList = [
    ...HOUSEHOLD_PEOPLE,
    ...[...dataPeople].filter(
      (p) => !(HOUSEHOLD_PEOPLE as readonly string[]).includes(p)
    ),
  ];

  const activeWho =
    whoFilter && peopleList.includes(whoFilter)
      ? whoFilter
      : HOUSEHOLD_PEOPLE[0];
  const filteredResultados = allResultados.filter((r) => r.who === activeWho);
  const filteredExames = all.filter((e) => e.who === activeWho);

  // Tabela pivot: markers (linhas) × datas (colunas)
  const byMarker = new Map<
    string,
    { label: string; unit: string | null; entries: typeof allResultados }
  >();
  for (const r of filteredResultados) {
    const k = r.marker;
    const e = byMarker.get(k);
    if (e) {
      e.entries.push(r);
      if (!e.unit && r.unit) e.unit = r.unit;
    } else {
      byMarker.set(k, { label: r.markerLabel, unit: r.unit, entries: [r] });
    }
  }
  const allDatesSet = new Set<string>();
  for (const r of filteredResultados) allDatesSet.add(r.examDate);
  const allDates = [...allDatesSet].sort().reverse(); // mais recente primeiro

  const last = filteredExames[0];
  const totalMarkers = filteredResultados.length;
  const totalAnormais = filteredResultados.filter(
    (r) => r.flag === "high" || r.flag === "low"
  ).length;

  return (
    <ScreenShell
      userQ="Quando foi o último check-up nosso?"
      insight={
        last ? (
          <>
            Último: <b>{last.name}</b> ({last.who}) em {formatDate(last.examDate)}.
            {totalAnormais > 0 && activeWho
              ? ` ${totalAnormais} marcadores alterados em ${activeWho}.`
              : ""}
          </>
        ) : (
          <>Sem exames cadastrados. Suba um PDF abaixo — a IA extrai cada marcador.</>
        )
      }
    >
      <SubNav active="exames" />

      <PersonPicker
        basePath="/saude-exames"
        activeWho={activeWho}
        extraParams={{ view: view !== "resumo" ? view : undefined }}
      />

      <SectionRow
        icon="file"
        label={`Exames · ${activeWho}`}
        action={`${filteredExames.length}/${all.length}`}
      />

      {/* Tabs de view */}
      <div style={{ padding: "0 20px 8px", display: "flex", gap: 6 }}>
        {[
          { key: "resumo", label: "Resumo" },
          { key: "tabela", label: "Tabela" },
          { key: "grafico", label: "Gráficos" },
        ].map((v) => {
          const isActive = view === v.key;
          const params = new URLSearchParams();
          if (v.key !== "resumo") params.set("view", v.key);
          if (activeWho) params.set("who", activeWho);
          return (
            <Link
              key={v.key}
              href={`/saude-exames${params.toString() ? "?" + params.toString() : ""}`}
              style={{
                padding: "5px 14px",
                borderRadius: 999,
                fontSize: 11.5,
                fontWeight: 700,
                background: isActive ? "var(--card)" : "transparent",
                color: isActive ? "var(--ink)" : "var(--muted-d)",
                textDecoration: "none",
                border: "1px solid var(--line-d)",
              }}
            >
              {v.label}
            </Link>
          );
        })}
      </div>

      {view === "resumo" ? (
        <>
          {last ? (
            <BigNumber
              value={last.name}
              sub={`${last.who} · ${formatDate(last.examDate)}${last.doctor ? ` · ${last.doctor}` : ""}`}
            />
          ) : (
            <BigNumber value="—" sub="sem exames" />
          )}
          {activeWho && totalMarkers > 0 && (
            <div style={{ padding: "12px 20px 0", display: "grid", gap: 8, gridTemplateColumns: "1fr 1fr" }}>
              <Card pad={12}>
                <div className="ap-eyebrow">total marcadores</div>
                <div className="ap-num" style={{ fontSize: 22, marginTop: 4 }}>
                  {totalMarkers}
                </div>
              </Card>
              <Card pad={12}>
                <div className="ap-eyebrow">alterados</div>
                <div
                  className="ap-num"
                  style={{
                    fontSize: 22,
                    marginTop: 4,
                    color: totalAnormais > 0 ? "var(--alert)" : "var(--ok)",
                  }}
                >
                  {totalAnormais}
                </div>
              </Card>
            </div>
          )}
        </>
      ) : view === "tabela" ? (
        <TabelaView dates={allDates} byMarker={byMarker} />
      ) : (
        <GraficoView byMarker={byMarker} />
      )}

      {/* Upload PDF */}
      <div style={{ padding: "14px 0 0" }}>
        <ExameUpload knownPeople={peopleList.length ? peopleList : undefined} />
      </div>

      {/* Form manual (escondido) */}
      <div style={{ padding: "10px 0 0" }}>
        <InlineForm buttonLabel="+ cadastrar manualmente">
          <form action={createExame}>
            <div style={{ display: "grid", gap: 8, gridTemplateColumns: "1fr 1fr" }}>
              <FormField label="Quem *">
                <input
                  name="who"
                  required
                  list="exame-who"
                  placeholder="ex: Gabriel"
                  style={fieldStyle}
                />
                <datalist id="exame-who">
                  {peopleList.map((p) => (
                    <option key={p} value={p} />
                  ))}
                </datalist>
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
                <input
                  type="date"
                  name="examDate"
                  required
                  defaultValue={new Date().toISOString().slice(0, 10)}
                  style={fieldStyle}
                />
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
              <input name="result" style={fieldStyle} />
            </FormField>
            <FormField label="Observações">
              <textarea name="notes" rows={2} style={fieldStyle} />
            </FormField>
            <SubmitButton>Salvar exame</SubmitButton>
          </form>
        </InlineForm>
      </div>

      {/* Lista de documentos — só da pessoa ativa */}
      <SectionRow icon="file" label={`Documentos · ${activeWho}`} action={`${filteredExames.length}`} />
      <div style={{ padding: "0 20px 20px" }}>
        {filteredExames.length === 0 ? (
          <div style={{ fontSize: 13, color: "var(--muted)", textAlign: "center", padding: "20px 0" }}>
            Nenhum exame de {activeWho} ainda.
          </div>
        ) : (
          filteredExames.map((e, i) => (
            <div
              key={e.id}
              style={{
                display: "flex",
                gap: 12,
                alignItems: "flex-start",
                padding: "12px 0",
                borderBottom: i < filteredExames.length - 1 ? "0.5px solid var(--line-d)" : "none",
              }}
            >
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 16,
                  background: e.who === activeWho ? "var(--accent)" : "var(--card2)",
                  color: e.who === activeWho ? "var(--accent-on)" : "var(--ink)",
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
              </div>
              <DeleteBtn
                action={deleteExame.bind(null, e.id)}
                confirmMsg={`Excluir "${e.name}"? Marcadores extraídos também serão removidos.`}
              />
            </div>
          ))
        )}
      </div>
    </ScreenShell>
  );
}

function TabelaView({
  dates,
  byMarker,
}: {
  dates: string[];
  byMarker: Map<
    string,
    {
      label: string;
      unit: string | null;
      entries: { examDate: string; value: string | null; valueText: string | null; flag: string }[];
    }
  >;
}) {
  if (byMarker.size === 0 || dates.length === 0) {
    return (
      <div
        style={{
          padding: "30px 20px",
          textAlign: "center",
          color: "var(--muted)",
          fontSize: 13,
        }}
      >
        Sem marcadores extraídos. Suba um PDF abaixo.
      </div>
    );
  }

  return (
    <div style={{ padding: "8px 20px 0", overflowX: "auto" }}>
      <table
        style={{
          width: "100%",
          minWidth: 320,
          borderCollapse: "collapse",
          fontSize: 12,
        }}
      >
        <thead>
          <tr>
            <th
              style={{
                textAlign: "left",
                padding: "8px 6px",
                fontWeight: 700,
                fontSize: 10.5,
                color: "var(--muted)",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                borderBottom: "0.5px solid var(--line-d)",
                position: "sticky",
                left: 0,
                background: "var(--surf)",
                zIndex: 1,
              }}
            >
              Marcador
            </th>
            {dates.map((d) => (
              <th
                key={d}
                style={{
                  padding: "8px 8px",
                  textAlign: "right",
                  fontWeight: 700,
                  fontSize: 10,
                  color: "var(--muted)",
                  letterSpacing: "0.06em",
                  borderBottom: "0.5px solid var(--line-d)",
                  whiteSpace: "nowrap",
                }}
              >
                {formatDateShort(d)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {[...byMarker.entries()].map(([key, { label, unit, entries }]) => {
            const byDate = new Map(entries.map((e) => [e.examDate, e]));
            return (
              <tr key={key}>
                <td
                  style={{
                    padding: "8px 6px",
                    fontSize: 12,
                    fontWeight: 600,
                    color: "var(--ink-d)",
                    borderBottom: "0.5px solid var(--line-d)",
                    position: "sticky",
                    left: 0,
                    background: "var(--surf)",
                  }}
                >
                  {label}
                  {unit && (
                    <span style={{ fontWeight: 400, color: "var(--muted)", marginLeft: 4 }}>
                      ({unit})
                    </span>
                  )}
                </td>
                {dates.map((d) => {
                  const entry = byDate.get(d);
                  if (!entry) {
                    return (
                      <td
                        key={d}
                        style={{
                          padding: "8px 8px",
                          textAlign: "right",
                          color: "var(--muted)",
                          borderBottom: "0.5px solid var(--line-d)",
                        }}
                      >
                        —
                      </td>
                    );
                  }
                  const color =
                    entry.flag === "high"
                      ? "var(--alert)"
                      : entry.flag === "low"
                        ? "#5DA9FF"
                        : "var(--ink)";
                  return (
                    <td
                      key={d}
                      className="ap-num"
                      style={{
                        padding: "8px 8px",
                        textAlign: "right",
                        color,
                        fontWeight: entry.flag !== "normal" ? 700 : 500,
                        borderBottom: "0.5px solid var(--line-d)",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {entry.value ?? entry.valueText ?? "—"}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function GraficoView({
  byMarker,
}: {
  byMarker: Map<
    string,
    {
      label: string;
      unit: string | null;
      entries: {
        examDate: string;
        value: string | null;
        refMin: string | null;
        refMax: string | null;
      }[];
    }
  >;
}) {
  const markers = [...byMarker.entries()].filter(([, m]) =>
    m.entries.some((e) => e.value !== null)
  );
  if (markers.length === 0) {
    return (
      <div
        style={{
          padding: "30px 20px",
          textAlign: "center",
          color: "var(--muted)",
          fontSize: 13,
        }}
      >
        Sem marcadores numéricos pra plotar.
      </div>
    );
  }

  return (
    <div
      style={{
        padding: "8px 20px 0",
        display: "grid",
        gap: 10,
        gridTemplateColumns: "1fr 1fr",
      }}
    >
      {markers.map(([key, { label, unit, entries }]) => {
        const numericData = entries
          .filter((e) => e.value !== null)
          .map((e) => ({
            x: e.examDate,
            y: parseFloat(e.value!),
            refMin: e.refMin ? parseFloat(e.refMin) : null,
            refMax: e.refMax ? parseFloat(e.refMax) : null,
          }))
          .sort((a, b) => a.x.localeCompare(b.x));
        if (numericData.length === 0) return null;
        const last = numericData[numericData.length - 1];
        const refMax = last.refMax;
        const refMin = last.refMin;
        const isHigh = refMax !== null && last.y > refMax;
        const isLow = refMin !== null && last.y < refMin;
        const color = isHigh ? "var(--alert)" : isLow ? "#5DA9FF" : "var(--accent)";

        const first = numericData[0];
        const delta = numericData.length >= 2 ? last.y - first.y : 0;

        return (
          <Card key={key} pad={10}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--ink-d)" }}>
              {label}
            </div>
            <div
              className="ap-num"
              style={{
                fontSize: 18,
                color,
                marginTop: 2,
              }}
            >
              {last.y}
              <span style={{ fontSize: 10, color: "var(--muted)", marginLeft: 4 }}>
                {unit ?? ""}
              </span>
            </div>
            {(refMin !== null || refMax !== null) && (
              <div style={{ fontSize: 10, color: "var(--muted)" }}>
                ref: {refMin ?? "—"} – {refMax ?? "—"}
              </div>
            )}
            {numericData.length >= 2 ? (
              <div style={{ marginTop: 6 }}>
                <Sparkline data={numericData.map((p) => p.y)} w={140} h={32} color={color} />
                <div
                  style={{
                    fontSize: 10,
                    color: delta < 0 ? "var(--ok)" : delta > 0 ? "var(--alert)" : "var(--muted)",
                    fontWeight: 700,
                    marginTop: 4,
                  }}
                >
                  {delta > 0 ? "▲" : delta < 0 ? "▼" : "→"} {Math.abs(delta).toFixed(2)} desde {formatDateShort(first.x)}
                </div>
              </div>
            ) : (
              <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 4 }}>
                primeiro registro · adicione mais
              </div>
            )}
          </Card>
        );
      })}
    </div>
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
