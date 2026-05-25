import { asc, desc, eq, gte, lte } from "drizzle-orm";

import { BigNumber, SectionRow } from "@/components/ap/atoms";
import { DeleteBtn } from "@/components/ap/inline-form";
import { InlineEditInput } from "@/components/ap/inline-edit-input";
import { MonthChips } from "@/components/ap/month-chips";
import { ScreenShell } from "@/components/ap/screen-shell";
import { ViewToggle } from "@/components/ap/view-toggle";
import {
  createFimDeSemana,
  deleteFimDeSemana,
  updateFimDeSemanaNotes,
} from "@/app/actions/finais-de-semana";
import { auth } from "@/auth";
import { db } from "@/db";
import { finsDeSemana, users } from "@/db/schema";

const DOW_LABEL = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const ORDINAL = ["1º", "2º", "3º", "4º", "5º", "6º"];

function formatDay(dStr: string) {
  const [, , day] = dStr.split("-").map(Number);
  return String(day).padStart(2, "0");
}

function formatMonthAbbrev(dStr: string) {
  const [y, m, d] = dStr.split("-").map(Number);
  return new Date(y, m - 1, d)
    .toLocaleDateString("pt-BR", { month: "short" })
    .replace(".", "");
}

function dateToISO(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

type DayCell = { date: string; dow: number };
type WeekendCluster = {
  days: DayCell[]; // sex, sáb, dom (ou subset, mas sempre completo se houver sáb)
  startMonth: number; // 1-12
  endMonth: number;
};

/**
 * Devolve os fins-de-semana COMPLETOS (sex+sáb+dom) que tocam o mês target.
 * - Inclui FDS que começam em sex do mês anterior se o sáb estiver no mês atual.
 * - Inclui FDS que vão pro mês seguinte se a sex estiver no mês atual.
 */
function weekendsThatTouchMonth(year: number, month1: number): WeekendCluster[] {
  // Acha o primeiro sábado de calendário cujo FDS toca o mês.
  // Estratégia: itera dia por dia de (1 do mês target - 2 dias) até (último dia + 2).
  // Pra cada sábado encontrado, monta FDS (sex anterior, sáb, dom posterior).
  const monthStart = new Date(year, month1 - 1, 1);
  const monthEnd = new Date(year, month1, 0);
  // Janela: pegar do começo da semana do dia 1 até o fim da semana do último dia.
  const windowStart = new Date(monthStart);
  windowStart.setDate(monthStart.getDate() - 7);
  const windowEnd = new Date(monthEnd);
  windowEnd.setDate(monthEnd.getDate() + 7);

  const clusters: WeekendCluster[] = [];
  const seen = new Set<string>();

  for (let d = new Date(windowStart); d <= windowEnd; d.setDate(d.getDate() + 1)) {
    if (d.getDay() === 6) {
      const sat = new Date(d);
      const fri = new Date(d);
      fri.setDate(sat.getDate() - 1);
      const sun = new Date(d);
      sun.setDate(sat.getDate() + 1);

      // Considera o FDS se QUALQUER dos 3 dias estiver no mês target
      const inTarget = [fri, sat, sun].some(
        (x) => x.getFullYear() === year && x.getMonth() + 1 === month1
      );
      if (!inTarget) continue;

      const key = dateToISO(sat);
      if (seen.has(key)) continue;
      seen.add(key);

      const days: DayCell[] = [
        { date: dateToISO(fri), dow: 5 },
        { date: dateToISO(sat), dow: 6 },
        { date: dateToISO(sun), dow: 0 },
      ];
      clusters.push({
        days,
        startMonth: fri.getMonth() + 1,
        endMonth: sun.getMonth() + 1,
      });
    }
  }
  return clusters;
}

// Estilo bem sutil — diferenciação pequena por dia, sem destaque exagerado
function dayLabelColor(dow: number) {
  if (dow === 5) return "var(--muted)";
  if (dow === 6) return "var(--ink-d)";
  return "var(--muted-d)";
}

type SearchParams = Promise<{ month?: string; view?: string }>;

export default async function FinaisDeSemanaPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = await searchParams;
  const session = await auth();
  if (!session?.user?.id) return null;

  const dbUser = await db.query.users.findFirst({
    where: eq(users.id, session.user.id),
  });
  if (!dbUser?.householdId) return null;

  const view = sp.view; // undefined = resumo (mes), "list", "calendar"

  const now = new Date();
  const monthStr =
    sp.month ?? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const [yearN, monthN] = monthStr.split("-").map(Number);

  // Clusters de FDS que tocam o mês (inclui transbordos)
  const clusters = weekendsThatTouchMonth(yearN, monthN);

  // Range total das datas pra buscar entries: do primeiro dia do primeiro cluster
  // até o último dia do último cluster
  const allDates = clusters.flatMap((c) => c.days.map((d) => d.date));
  const minDate = allDates.length > 0 ? allDates.reduce((a, b) => (a < b ? a : b)) : `${yearN}-${String(monthN).padStart(2, "0")}-01`;
  const maxDate = allDates.length > 0 ? allDates.reduce((a, b) => (a > b ? a : b)) : `${yearN}-${String(monthN).padStart(2, "0")}-28`;

  // Entries: depende da view
  const isList = view === "list";
  const isCalendar = view === "calendar";

  const entries = isList
    ? await db.query.finsDeSemana.findMany({
        where: eq(finsDeSemana.householdId, dbUser.householdId),
        orderBy: [desc(finsDeSemana.weekendDate), desc(finsDeSemana.createdAt)],
        limit: 200,
      })
    : await db.query.finsDeSemana.findMany({
        where: (f, { and: a }) =>
          a(
            eq(f.householdId, dbUser.householdId!),
            gte(f.weekendDate, minDate),
            lte(f.weekendDate, maxDate)
          ),
        orderBy: [asc(finsDeSemana.weekendDate), asc(finsDeSemana.createdAt)],
      });

  const entryByDate = new Map<string, typeof entries[number]>();
  for (const e of entries) entryByDate.set(e.weekendDate, e);

  const monthLabel = new Date(yearN, monthN - 1, 1).toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
  });

  const filledInMonth = clusters
    .flatMap((c) => c.days)
    .filter((d) => entryByDate.has(d.date)).length;
  const totalDaysInMonth = clusters.flatMap((c) => c.days).length;

  return (
    <ScreenShell
      userQ="Como tão nossos finais de semana?"
      insight={
        entries.length > 0 ? (
          <>
            <b>{filledInMonth}</b> de {totalDaysInMonth} dias preenchidos em {monthLabel}. Digite direto no dia. Esc descarta.
          </>
        ) : (
          <>Sem planos ainda. Digite no campo do dia (Enter salva). Apertar × apaga sem confirmação.</>
        )
      }
    >
      <SectionRow
        icon="heart"
        label="Finais de semana"
        action={
          <ViewToggle
            basePath="/finais-de-semana"
            current={view}
            extraParams={{ month: sp.month }}
            options={[
              { key: null, label: "Resumo" },
              { key: "calendar", label: "Calendário" },
              { key: "list", label: "Lista" },
            ]}
          />
        }
      />

      {!isList && !isCalendar && (
        <MonthChips basePath="/finais-de-semana" currentMonth={monthStr} />
      )}

      {!isList && !isCalendar && (
        <BigNumber
          value={`${filledInMonth}/${totalDaysInMonth}`}
          sub={`dias preenchidos · ${monthLabel}`}
        />
      )}
      {isList && (
        <BigNumber value={String(entries.length)} sub="programações no histórico" />
      )}

      {isList ? (
        <ListView entries={entries} />
      ) : isCalendar ? (
        <CalendarView year={yearN} month={monthN} entryByDate={entryByDate} monthStr={monthStr} />
      ) : (
        <ClustersView clusters={clusters} entryByDate={entryByDate} targetMonth={monthN} />
      )}
    </ScreenShell>
  );
}

// ────────────────────────────────────────────────────────────
// VIEW: Clusters (default) — 1º/2º/3º... FDS · com transbordo
// ────────────────────────────────────────────────────────────
function ClustersView({
  clusters,
  entryByDate,
  targetMonth,
}: {
  clusters: WeekendCluster[];
  entryByDate: Map<string, typeof finsDeSemana.$inferSelect>;
  targetMonth: number;
}) {
  return (
    <div
      style={{
        padding: "14px 20px 0",
        display: "flex",
        flexDirection: "column",
        gap: 18,
      }}
    >
      {clusters.map((cluster, idx) => {
        const fri = cluster.days[0];
        const sun = cluster.days[2];
        const crossesMonth = cluster.startMonth !== cluster.endMonth;
        const ordinal = ORDINAL[idx] ?? `${idx + 1}º`;
        const rangeLabel = crossesMonth
          ? `${formatDay(fri.date)} ${formatMonthAbbrev(fri.date)} – ${formatDay(sun.date)} ${formatMonthAbbrev(sun.date)}`
          : `${formatDay(fri.date)} – ${formatDay(sun.date)} ${formatMonthAbbrev(fri.date)}`;
        return (
          <div key={idx} style={{ display: "flex", flexDirection: "column", gap: 0 }}>
            {/* Header do FDS */}
            <div
              style={{
                display: "flex",
                alignItems: "baseline",
                gap: 8,
                marginBottom: 6,
                paddingBottom: 4,
                borderBottom: "0.5px solid var(--line-d)",
              }}
            >
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 800,
                  color: "var(--accent)",
                  letterSpacing: "-0.01em",
                }}
              >
                {ordinal} FDS
              </span>
              <span
                style={{
                  fontSize: 10.5,
                  color: "var(--muted)",
                  fontWeight: 600,
                  letterSpacing: "0.04em",
                }}
              >
                {rangeLabel}
              </span>
            </div>

            {/* Dias do cluster */}
            <div style={{ display: "flex", flexDirection: "column" }}>
              {cluster.days.map((d) => {
                const inTargetMonth =
                  new Date(d.date + "T00:00:00").getMonth() + 1 === targetMonth;
                return (
                  <DayCellRow
                    key={d.date}
                    day={d}
                    entry={entryByDate.get(d.date) ?? null}
                    dimmed={!inTargetMonth}
                  />
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function DayCellRow({
  day,
  entry,
  dimmed,
}: {
  day: DayCell;
  entry: typeof finsDeSemana.$inferSelect | null;
  dimmed: boolean;
}) {
  const hasEntry = !!entry;
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "52px 1fr 28px",
        alignItems: "start",
        gap: 10,
        padding: "8px 0",
        borderBottom: "0.5px solid var(--line-d)",
        opacity: dimmed ? 0.55 : 1,
      }}
    >
      {/* Coluna data + dia */}
      <div style={{ paddingTop: 2 }}>
        <div
          className="ap-num"
          style={{
            fontSize: 16,
            fontWeight: 700,
            color: dayLabelColor(day.dow),
            lineHeight: 1,
          }}
        >
          {formatDay(day.date)}
        </div>
        <div
          style={{
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: "var(--muted)",
            marginTop: 3,
          }}
        >
          {DOW_LABEL[day.dow]}
        </div>
      </div>

      {/* Coluna título + notes (sempre editável) */}
      <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
        <InlineEditInput
          initialValue={entry?.title ?? ""}
          action={createFimDeSemana}
          hiddenFields={{ weekendDate: day.date }}
          placeholder="livre · digite pra programar"
          fontSize={13.5}
          fontWeight={600}
        />
        {hasEntry && (
          <InlineEditInput
            initialValue={entry?.notes ?? ""}
            action={updateFimDeSemanaNotes}
            hiddenFields={{ weekendDate: day.date }}
            fieldName="notes"
            placeholder="+ observação"
            fontSize={11.5}
            fontWeight={400}
            color="var(--muted-d)"
            italic
          />
        )}
      </div>

      {/* Coluna delete (sem confirm) */}
      {hasEntry ? (
        <div style={{ paddingTop: 2 }}>
          <DeleteBtn
            action={deleteFimDeSemana.bind(null, entry!.id)}
            confirmMsg={null}
          />
        </div>
      ) : (
        <div />
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// VIEW: Calendar — calendário mensal completo
// ────────────────────────────────────────────────────────────
function CalendarView({
  year,
  month,
  entryByDate,
  monthStr,
}: {
  year: number;
  month: number;
  entryByDate: Map<string, typeof finsDeSemana.$inferSelect>;
  monthStr: string;
}) {
  const firstDay = new Date(year, month - 1, 1);
  const lastDay = new Date(year, month, 0);
  const startDow = firstDay.getDay(); // 0=dom
  const totalDays = lastDay.getDate();

  // Monta uma matriz 6×7 de células: cada célula tem { date | null, inMonth, dow }
  type Cell = { date: string; dow: number; inMonth: boolean };
  const cells: Cell[] = [];
  // dias do mes anterior
  for (let i = startDow - 1; i >= 0; i--) {
    const d = new Date(year, month - 1, -i);
    cells.push({ date: dateToISO(d), dow: d.getDay(), inMonth: false });
  }
  // dias do mes
  for (let i = 1; i <= totalDays; i++) {
    const d = new Date(year, month - 1, i);
    cells.push({ date: dateToISO(d), dow: d.getDay(), inMonth: true });
  }
  // completa última semana
  while (cells.length % 7 !== 0) {
    const last = cells[cells.length - 1];
    const d = new Date(last.date + "T00:00:00");
    d.setDate(d.getDate() + 1);
    cells.push({ date: dateToISO(d), dow: d.getDay(), inMonth: false });
  }

  const weeks: Cell[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  return (
    <>
      <div style={{ padding: "0 20px 8px" }}>
        <MonthChips basePath="/finais-de-semana" currentMonth={monthStr} extraParams={{ view: "calendar" }} />
      </div>
      <div style={{ padding: "0 14px 0" }}>
        {/* Header DOW */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(7, 1fr)",
            gap: 4,
            marginBottom: 4,
          }}
        >
          {["dom", "seg", "ter", "qua", "qui", "sex", "sáb"].map((d) => (
            <div
              key={d}
              style={{
                fontSize: 9.5,
                fontWeight: 700,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                color: "var(--muted)",
                textAlign: "center",
                paddingBottom: 4,
              }}
            >
              {d}
            </div>
          ))}
        </div>

        {/* Semanas */}
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {weeks.map((wk, wi) => (
            <div
              key={wi}
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(7, 1fr)",
                gap: 4,
              }}
            >
              {wk.map((c) => {
                const isWeekend = c.dow === 0 || c.dow === 5 || c.dow === 6;
                const e = entryByDate.get(c.date);
                const hasEntry = !!e;
                return (
                  <div
                    key={c.date}
                    style={{
                      minHeight: 64,
                      padding: 6,
                      borderRadius: 8,
                      background: hasEntry
                        ? "var(--card)"
                        : isWeekend
                          ? "var(--card)"
                          : "transparent",
                      border: isWeekend
                        ? "1px solid var(--line-d)"
                        : "1px solid transparent",
                      opacity: c.inMonth ? 1 : 0.4,
                      display: "flex",
                      flexDirection: "column",
                      gap: 2,
                    }}
                  >
                    <div
                      className="ap-num"
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        color: hasEntry ? "var(--accent)" : "var(--muted-d)",
                        lineHeight: 1,
                      }}
                    >
                      {formatDay(c.date)}
                    </div>
                    {hasEntry && (
                      <div
                        style={{
                          fontSize: 9.5,
                          fontWeight: 600,
                          lineHeight: 1.2,
                          color: "var(--ink-d)",
                          overflow: "hidden",
                          display: "-webkit-box",
                          WebkitLineClamp: 3,
                          WebkitBoxOrient: "vertical",
                        }}
                        title={e!.title}
                      >
                        {e!.title}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
        <p style={{ fontSize: 10.5, color: "var(--muted)", marginTop: 10, padding: "0 6px" }}>
          Calendário mostra o mês completo (não editável). Volte ao "Resumo" pra adicionar/editar.
        </p>
      </div>
    </>
  );
}

// ────────────────────────────────────────────────────────────
// VIEW: List (histórico cronológico)
// ────────────────────────────────────────────────────────────
function ListView({
  entries,
}: {
  entries: (typeof finsDeSemana.$inferSelect)[];
}) {
  if (entries.length === 0) {
    return (
      <div style={{ fontSize: 13, color: "var(--muted)", textAlign: "center", padding: "20px 0" }}>
        Nenhuma programação ainda.
      </div>
    );
  }
  return (
    <div style={{ padding: "14px 20px 0" }}>
      {entries.map((e, i) => {
        const dt = new Date(e.weekendDate + "T00:00:00");
        return (
          <div
            key={e.id}
            style={{
              display: "grid",
              gridTemplateColumns: "60px 1fr auto",
              alignItems: "center",
              gap: 10,
              padding: "10px 0",
              borderBottom: i < entries.length - 1 ? "0.5px solid var(--line-d)" : "none",
            }}
          >
            <div>
              <div
                className="ap-num"
                style={{
                  fontSize: 16,
                  fontWeight: 700,
                  color: dayLabelColor(dt.getDay()),
                  lineHeight: 1,
                }}
              >
                {formatDay(e.weekendDate)}
              </div>
              <div
                style={{
                  fontSize: 9,
                  fontWeight: 700,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  color: "var(--muted)",
                  marginTop: 3,
                }}
              >
                {DOW_LABEL[dt.getDay()]} · {formatMonthAbbrev(e.weekendDate)}
              </div>
            </div>
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  fontSize: 13.5,
                  fontWeight: 600,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {e.title}
              </div>
              {e.notes && (
                <div
                  style={{
                    fontSize: 11,
                    color: "var(--muted)",
                    marginTop: 1,
                    fontStyle: "italic",
                  }}
                >
                  {e.notes}
                </div>
              )}
            </div>
            <DeleteBtn
              action={deleteFimDeSemana.bind(null, e.id)}
              confirmMsg={null}
            />
          </div>
        );
      })}
    </div>
  );
}
