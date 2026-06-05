import { asc, desc, eq, gte, lte } from "drizzle-orm";
import Link from "next/link";

import { BigNumber, SectionRow } from "@/components/ap/atoms";
import { DeleteBtn } from "@/components/ap/inline-form";
import { InlineEditInput } from "@/components/ap/inline-edit-input";
import { MonthChips } from "@/components/ap/month-chips";
import { ScreenShell } from "@/components/ap/screen-shell";
import { ViewToggle } from "@/components/ap/view-toggle";
import {
  createCompromisso,
  deleteCompromisso,
  patchCompromisso,
} from "@/app/actions/compromissos";
import { AddCompromissoCard } from "./add-compromisso-card";
import { auth } from "@/auth";
import { db } from "@/db";
import {
  aniversarios,
  compromissoAttachments,
  compromissos,
  users,
} from "@/db/schema";
import { AttachmentsButton } from "@/components/ap/attachments-button";
import { inArray } from "drizzle-orm";
import { getHolidaysInRange, type Holiday } from "@/lib/holidays";

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
  days: DayCell[];
  startMonth: number;
  endMonth: number;
};

function weekendsThatTouchMonth(year: number, month1: number): WeekendCluster[] {
  const monthStart = new Date(year, month1 - 1, 1);
  const monthEnd = new Date(year, month1, 0);
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
      const inTarget = [fri, sat, sun].some(
        (x) => x.getFullYear() === year && x.getMonth() + 1 === month1
      );
      if (!inTarget) continue;
      const key = dateToISO(sat);
      if (seen.has(key)) continue;
      seen.add(key);
      clusters.push({
        days: [
          { date: dateToISO(fri), dow: 5 },
          { date: dateToISO(sat), dow: 6 },
          { date: dateToISO(sun), dow: 0 },
        ],
        startMonth: fri.getMonth() + 1,
        endMonth: sun.getMonth() + 1,
      });
    }
  }
  return clusters;
}

type SearchParams = Promise<{ month?: string; view?: string; day?: string }>;

export default async function CompromissosPage({
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

  const view = sp.view; // undefined=resumo, "calendar", "list"
  const now = new Date();
  const monthStr =
    sp.month ?? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const [yearN, monthN] = monthStr.split("-").map(Number);

  const clusters = weekendsThatTouchMonth(yearN, monthN);

  const monthStartDate = new Date(yearN, monthN - 1, 1);
  const monthEndDate = new Date(yearN, monthN, 0);
  const monthStartStr = dateToISO(monthStartDate);
  const monthEndStr = dateToISO(monthEndDate);

  // Em modo lista pegamos TUDO; senão só o mês (estendido pra incluir FDS que cruzam)
  const isList = view === "list";
  const isCalendar = view === "calendar";

  const fetchRangeStart = clusters.length
    ? clusters[0].days[0].date
    : monthStartStr;
  const fetchRangeEnd = clusters.length
    ? clusters[clusters.length - 1].days[2].date
    : monthEndStr;
  // Pega o range maior (cobrir mês inteiro + cluster transbordo)
  const rangeStart = fetchRangeStart < monthStartStr ? fetchRangeStart : monthStartStr;
  const rangeEnd = fetchRangeEnd > monthEndStr ? fetchRangeEnd : monthEndStr;

  const allCompromissos = isList
    ? await db.query.compromissos.findMany({
        where: eq(compromissos.householdId, dbUser.householdId),
        orderBy: [desc(compromissos.occurredOn), asc(compromissos.time)],
        limit: 300,
      })
    : await db.query.compromissos.findMany({
        where: (c, { and: a }) =>
          a(
            eq(c.householdId, dbUser.householdId!),
            gte(c.occurredOn, rangeStart),
            lte(c.occurredOn, rangeEnd)
          ),
        orderBy: [asc(compromissos.occurredOn), asc(compromissos.time)],
      });

  // Anexos: 1 query agregada pra todos os compromissos exibidos.
  // attachmentsByCompromisso: compromissoId → Attachment[]
  const compromissoIds = allCompromissos.map((c) => c.id);
  const attachments =
    compromissoIds.length > 0
      ? await db.query.compromissoAttachments.findMany({
          where: inArray(compromissoAttachments.compromissoId, compromissoIds),
        })
      : [];
  const attachmentsByCompromisso = new Map<
    string,
    {
      id: string;
      filename: string;
      blobUrl: string;
      fileSize: number | null;
      mimeType: string | null;
    }[]
  >();
  for (const a of attachments) {
    const arr = attachmentsByCompromisso.get(a.compromissoId) ?? [];
    arr.push({
      id: a.id,
      filename: a.filename,
      blobUrl: a.blobUrl,
      fileSize: a.fileSize,
      mimeType: a.mimeType,
    });
    attachmentsByCompromisso.set(a.compromissoId, arr);
  }

  // Mapa: data → lista de compromissos
  const byDate = new Map<string, typeof allCompromissos>();
  for (const c of allCompromissos) {
    const arr = byDate.get(c.occurredOn) ?? [];
    arr.push(c);
    byDate.set(c.occurredOn, arr);
  }

  // ── Markers: aniversários + feriados ──────────────────────────
  // Não são compromissos editáveis, só "decoração" visual no calendário.
  // Reaparecem todo ano automaticamente (idade recalculada, datas móveis
  // recalculadas pelo getHolidaysForYear).
  const allAniversarios = await db.query.aniversarios.findMany({
    where: eq(aniversarios.householdId, dbUser.householdId),
  });

  // Janela: do range exibido até 1 ano depois (cobre vista anual)
  const markerStart = isList ? `${yearN - 1}-01-01` : rangeStart;
  const markerEnd = isList ? `${yearN + 1}-12-31` : rangeEnd;
  const markerStartYear = parseInt(markerStart.slice(0, 4), 10);
  const markerEndYear = parseInt(markerEnd.slice(0, 4), 10);

  // Aniversários: pra cada ano da janela, materializa a data MM-DD
  const aniversarioMarkers: { date: string; name: string; age: number | null }[] = [];
  for (let y = markerStartYear; y <= markerEndYear; y++) {
    for (const a of allAniversarios) {
      const date = `${y}-${a.monthDay}`;
      if (date < markerStart || date > markerEnd) continue;
      const age = a.birthYear ? y - a.birthYear : null;
      aniversarioMarkers.push({ date, name: a.name, age });
    }
  }

  // Feriados
  const holidayMarkers = getHolidaysInRange(markerStart, markerEnd);

  // Mapa unificado: data → markers do dia (tipos no topo do arquivo)
  const markersByDate: MarkerMap = new Map();
  for (const a of aniversarioMarkers) {
    const arr = markersByDate.get(a.date) ?? [];
    arr.push({ kind: "aniversario", name: a.name, age: a.age });
    markersByDate.set(a.date, arr);
  }
  for (const h of holidayMarkers) {
    const arr = markersByDate.get(h.date) ?? [];
    arr.push({ kind: "holiday", holiday: h });
    markersByDate.set(h.date, arr);
  }

  const totalInMonth = allCompromissos.filter(
    (c) => c.occurredOn >= monthStartStr && c.occurredOn <= monthEndStr
  ).length;

  const monthLabel = new Date(yearN, monthN - 1, 1).toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
  });
  const todayISO = dateToISO(new Date());

  return (
    <ScreenShell
      userQ="O que tem nos próximos dias?"
      insight={
        allCompromissos.length > 0 ? (
          <>
            <b>{isList ? allCompromissos.length : totalInMonth}</b> compromisso
            {(isList ? allCompromissos.length : totalInMonth) === 1 ? "" : "s"}{" "}
            {isList ? "no histórico" : `em ${monthLabel}`}.
          </>
        ) : (
          <>Adicione o próximo compromisso · botão abaixo abre rápido.</>
        )
      }
    >
      <SectionRow
        icon="cal"
        label="Compromissos"
        action={
          <ViewToggle
            basePath="/compromissos"
            current={view}
            extraParams={{ month: sp.month }}
            options={[
              { key: null, label: "FDS" },
              { key: "calendar", label: "Calendário" },
              { key: "list", label: "Lista" },
            ]}
          />
        }
      />

      {!isList && !isCalendar && (
        <MonthChips basePath="/compromissos" currentMonth={monthStr} />
      )}

      <BigNumber
        value={isList ? String(allCompromissos.length) : String(totalInMonth)}
        sub={isList ? "no histórico" : `em ${monthLabel}`}
      />

      {/* Botão GRANDE de adicionar compromisso — visível em todas as views */}
      <div style={{ padding: "20px 16px 0" }}>
        <AddCompromissoCard defaultDate={todayISO} />
      </div>

      {isList ? (
        <ListView
          upcoming={allCompromissos}
          attMap={attachmentsByCompromisso}
          markerMap={markersByDate}
        />
      ) : isCalendar ? (
        <CalendarView
          year={yearN}
          month={monthN}
          byDate={byDate}
          monthStr={monthStr}
          selectedDay={sp.day ?? null}
          attMap={attachmentsByCompromisso}
          markerMap={markersByDate}
        />
      ) : (
        <FdsView
          clusters={clusters}
          byDate={byDate}
          targetYear={yearN}
          targetMonth={monthN}
          attMap={attachmentsByCompromisso}
          markerMap={markersByDate}
        />
      )}
    </ScreenShell>
  );
}

// ────────────────────────────────────────────────────────────
// FDS: cards de fim de semana + compromissos em dias úteis
// (intercalados cronologicamente)
// ────────────────────────────────────────────────────────────
function FdsView({
  clusters,
  byDate,
  targetYear,
  targetMonth,
  attMap,
  markerMap,
}: {
  clusters: WeekendCluster[];
  byDate: Map<string, (typeof compromissos.$inferSelect)[]>;
  targetYear: number;
  targetMonth: number;
  attMap: AttMap;
  markerMap: MarkerMap;
}) {
  // Datas já cobertas pelos clusters de FDS — evita duplicar
  const clusterDates = new Set<string>();
  for (const c of clusters) for (const d of c.days) clusterDates.add(d.date);

  // Dias úteis (seg–qui) do mês alvo que têm compromissos
  type WeekdayEntry = { kind: "weekday"; sortKey: string; date: string; dow: number };
  type ClusterEntry = { kind: "cluster"; sortKey: string; cluster: WeekendCluster; idx: number };
  const feed: (WeekdayEntry | ClusterEntry)[] = [];

  clusters.forEach((cluster, idx) => {
    feed.push({ kind: "cluster", sortKey: cluster.days[0].date, cluster, idx });
  });

  for (const [date, items] of byDate.entries()) {
    if (clusterDates.has(date)) continue;
    if (items.length === 0) continue;
    const dt = new Date(date + "T00:00:00");
    if (dt.getFullYear() !== targetYear || dt.getMonth() + 1 !== targetMonth) continue;
    feed.push({ kind: "weekday", sortKey: date, date, dow: dt.getDay() });
  }

  feed.sort((a, b) => a.sortKey.localeCompare(b.sortKey));

  return (
    <div
      style={{
        padding: "24px 16px 0",
        display: "flex",
        flexDirection: "column",
        gap: 22, // respiro generoso entre cards
      }}
    >
      {feed.map((entry) => {
        if (entry.kind === "weekday") {
          return (
            <WeekdayCard
              key={`wd-${entry.date}`}
              date={entry.date}
              dow={entry.dow}
              items={byDate.get(entry.date) ?? []}
              attMap={attMap}
              markerMap={markerMap}
            />
          );
        }
        const { cluster, idx } = entry;
        const fri = cluster.days[0];
        const sun = cluster.days[2];
        const crossesMonth = cluster.startMonth !== cluster.endMonth;
        const ordinal = ORDINAL[idx] ?? `${idx + 1}º`;
        const filledDays = cluster.days.filter((d) => (byDate.get(d.date)?.length ?? 0) > 0)
          .length;
        const rangeLabel = crossesMonth
          ? `${formatDay(fri.date)} ${formatMonthAbbrev(fri.date)} → ${formatDay(sun.date)} ${formatMonthAbbrev(sun.date)}`
          : `${formatDay(fri.date)}–${formatDay(sun.date)} ${formatMonthAbbrev(fri.date)}`;
        return (
          <div
            key={`cl-${idx}`}
            style={{
              background: "var(--card)",
              borderRadius: 20,
              overflow: "hidden",
              border: "0.5px solid var(--line-d)",
            }}
          >
            {/* Header arejado */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "18px 20px",
              }}
            >
              <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
                <span
                  className="ap-num"
                  style={{
                    fontSize: 28,
                    fontWeight: 800,
                    letterSpacing: "-0.05em",
                    color: "var(--accent)",
                    lineHeight: 1,
                  }}
                >
                  {ordinal}
                </span>
                <span
                  style={{
                    fontSize: 11,
                    color: "var(--muted-d)",
                    fontWeight: 700,
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                  }}
                >
                  fim de semana
                </span>
              </div>
              <div style={{ textAlign: "right" }}>
                <div
                  className="ap-num"
                  style={{
                    fontSize: 11.5,
                    color: "var(--ink-d)",
                    fontWeight: 700,
                  }}
                >
                  {rangeLabel}
                </div>
                <div
                  style={{
                    fontSize: 9,
                    color: filledDays === 3 ? "var(--accent)" : "var(--muted)",
                    fontWeight: 700,
                    letterSpacing: "0.1em",
                    textTransform: "uppercase",
                    marginTop: 3,
                  }}
                >
                  {filledDays}/3 com plano
                </div>
              </div>
            </div>

            {/* Dias do FDS — respiro entre dias */}
            <div style={{ padding: "0 20px 18px", display: "flex", flexDirection: "column", gap: 14 }}>
              {cluster.days.map((d) => {
                const inTarget =
                  new Date(d.date + "T00:00:00").getMonth() + 1 === targetMonth;
                return (
                  <DayBlock
                    key={d.date}
                    day={d}
                    items={byDate.get(d.date) ?? []}
                    dimmed={!inTarget}
                    attMap={attMap}
                    markerMap={markerMap}
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

type AttachmentMeta = {
  id: string;
  filename: string;
  blobUrl: string;
  fileSize: number | null;
  mimeType: string | null;
};
type AttMap = Map<string, AttachmentMeta[]>;

type DayMarker =
  | { kind: "aniversario"; name: string; age: number | null }
  | { kind: "holiday"; holiday: Holiday };
type MarkerMap = Map<string, DayMarker[]>;

function WeekdayCard({
  date,
  dow,
  items,
  attMap,
  markerMap,
}: {
  date: string;
  dow: number;
  items: (typeof compromissos.$inferSelect)[];
  attMap: AttMap;
  markerMap: MarkerMap;
}) {
  return (
    <div
      style={{
        background: "var(--card)",
        borderRadius: 20,
        border: "0.5px solid var(--line-d)",
        padding: "18px 20px",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: 10,
          marginBottom: 14,
        }}
      >
        <span
          style={{
            fontSize: 11,
            color: "var(--muted-d)",
            fontWeight: 700,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
          }}
        >
          dia útil · {formatMonthAbbrev(date)}
        </span>
      </div>
      <DayBlock
        day={{ date, dow }}
        items={items}
        dimmed={false}
        attMap={attMap}
        markerMap={markerMap}
      />
    </div>
  );
}

function DayBlock({
  day,
  items,
  dimmed,
  attMap,
  markerMap,
}: {
  day: DayCell;
  items: (typeof compromissos.$inferSelect)[];
  dimmed: boolean;
  attMap: AttMap;
  markerMap: MarkerMap;
}) {
  const markers = markerMap.get(day.date) ?? [];
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "44px 1fr",
        gap: 14,
        opacity: dimmed ? 0.5 : 1,
      }}
    >
      {/* Data centralizada */}
      <div style={{ textAlign: "center", paddingTop: 4 }}>
        <div
          className="ap-num"
          style={{
            fontSize: 22,
            fontWeight: 800,
            color: items.length > 0 ? "var(--ink)" : "var(--muted-d)",
            lineHeight: 1,
            letterSpacing: "-0.04em",
          }}
        >
          {formatDay(day.date)}
        </div>
        <div
          style={{
            fontSize: 9,
            fontWeight: 800,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            color: day.dow === 6 ? "var(--accent)" : "var(--muted)",
            marginTop: 6,
          }}
        >
          {DOW_LABEL[day.dow]}
        </div>
      </div>

      {/* Um compromisso por dia — a linha É o compromisso (ou input pra criar) */}
      <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 6, paddingTop: 6 }}>
        {markers.length > 0 && <MarkersRow markers={markers} />}
        {items.length === 0 ? (
          <EmptyDayRow date={day.date} />
        ) : (
          items.map((c) => (
            <CompromissoRow key={c.id} c={c} attachments={attMap.get(c.id) ?? []} />
          ))
        )}
      </div>
    </div>
  );
}

/**
 * Linha de "decoração" pra dias com aniversário ou feriado. Não é
 * compromisso editável, só lembrete visual discreto: ícone + nome (+ idade
 * pra aniversário). Cor diferente por tipo.
 */
function MarkersRow({ markers }: { markers: DayMarker[] }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 2 }}>
      {markers.map((m, i) => (
        <MarkerChip key={i} marker={m} />
      ))}
    </div>
  );
}

function MarkerChip({ marker }: { marker: DayMarker }) {
  if (marker.kind === "aniversario") {
    return (
      <span
        title={`Aniversário de ${marker.name}`}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          padding: "2px 8px",
          borderRadius: 999,
          background: "color-mix(in oklab, var(--accent) 12%, transparent)",
          color: "var(--accent)",
          fontSize: 10.5,
          fontWeight: 600,
          lineHeight: 1.4,
        }}
      >
        <span aria-hidden>🎂</span>
        <span>{marker.name}</span>
        {marker.age !== null && (
          <span style={{ opacity: 0.7 }}>· {marker.age}</span>
        )}
      </span>
    );
  }
  // holiday
  const h = marker.holiday;
  return (
    <span
      title={h.name}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "2px 8px",
        borderRadius: 999,
        background: "color-mix(in oklab, var(--muted) 10%, transparent)",
        color: "var(--muted-d)",
        fontSize: 10.5,
        fontWeight: 600,
        lineHeight: 1.4,
      }}
    >
      <span aria-hidden>{h.icon}</span>
      <span>{h.name}</span>
    </span>
  );
}

function CompromissoRow({
  c,
  attachments,
}: {
  c: typeof compromissos.$inferSelect;
  attachments: {
    id: string;
    filename: string;
    blobUrl: string;
    fileSize: number | null;
    mimeType: string | null;
  }[];
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "auto 1fr auto auto",
        alignItems: "start",
        gap: 8,
      }}
    >
      <span
        style={{
          fontSize: 11,
          color: "var(--accent)",
          fontWeight: 700,
          paddingTop: 2,
          minWidth: 28,
        }}
      >
        {c.time ?? "·"}
      </span>
      <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 0 }}>
        <InlineEditInput
          initialValue={c.title}
          action={patchCompromisso}
          hiddenFields={{ id: c.id }}
          fieldName="title"
          fontSize={13.5}
          fontWeight={600}
        />
        {(c.who || c.location) && (
          <div style={{ fontSize: 11, color: "var(--muted-d)", lineHeight: 1.4 }}>
            {[c.who, c.location].filter(Boolean).join(" · ")}
          </div>
        )}
      </div>
      <div style={{ paddingTop: 2 }}>
        <AttachmentsButton
          apiPath={`/api/compromissos/${c.id}`}
          attachments={attachments}
        />
      </div>
      <DeleteBtn action={deleteCompromisso.bind(null, c.id)} confirmMsg={null} />
    </div>
  );
}

function EmptyDayRow({ date }: { date: string }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "auto 1fr",
        gap: 8,
        alignItems: "start",
      }}
    >
      <span
        style={{
          fontSize: 11,
          color: "var(--muted)",
          fontWeight: 700,
          paddingTop: 2,
          minWidth: 28,
        }}
      >
        ·
      </span>
      <InlineEditInput
        initialValue=""
        action={createCompromisso}
        hiddenFields={{ occurredOn: date }}
        placeholder="livre"
        fontSize={13.5}
        fontWeight={600}
        italic
        clearAfterSubmit
      />
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// CALENDÁRIO: mês completo com compromissos
// ────────────────────────────────────────────────────────────
function CalendarView({
  year,
  month,
  byDate,
  monthStr,
  selectedDay,
  attMap,
  markerMap,
}: {
  year: number;
  month: number;
  byDate: Map<string, (typeof compromissos.$inferSelect)[]>;
  monthStr: string;
  selectedDay: string | null;
  attMap: AttMap;
  markerMap: MarkerMap;
}) {
  const firstDay = new Date(year, month - 1, 1);
  const lastDay = new Date(year, month, 0);
  const startDow = firstDay.getDay();
  const totalDays = lastDay.getDate();
  const todayISO = dateToISO(new Date());

  type Cell = { date: string; dow: number; inMonth: boolean };
  const cells: Cell[] = [];
  for (let i = startDow - 1; i >= 0; i--) {
    const d = new Date(year, month - 1, -i);
    cells.push({ date: dateToISO(d), dow: d.getDay(), inMonth: false });
  }
  for (let i = 1; i <= totalDays; i++) {
    const d = new Date(year, month - 1, i);
    cells.push({ date: dateToISO(d), dow: d.getDay(), inMonth: true });
  }
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
      <div style={{ padding: "16px 16px 0" }}>
        <MonthChips
          basePath="/compromissos"
          currentMonth={monthStr}
          extraParams={{ view: "calendar" }}
        />
      </div>
      <div style={{ padding: "12px 14px 24px" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(7, 1fr)",
            gap: 4,
            marginBottom: 6,
          }}
        >
          {DOW_LABEL.map((d) => (
            <div
              key={d}
              style={{
                fontSize: 9,
                fontWeight: 800,
                letterSpacing: "0.12em",
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
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {weeks.map((wk, wi) => (
            <div key={wi} style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4 }}>
              {wk.map((c) => {
                const isWeekend = c.dow === 0 || c.dow === 6;
                const items = byDate.get(c.date) ?? [];
                const cellMarkers = markerMap.get(c.date) ?? [];
                const hasItems = items.length > 0;
                const hasMarkers = cellMarkers.length > 0;
                const isToday = c.date === todayISO;
                const isSelected = selectedDay === c.date;
                const isOpenable = c.inMonth;
                const linkParams = new URLSearchParams();
                linkParams.set("view", "calendar");
                linkParams.set("month", monthStr);
                if (!isSelected) linkParams.set("day", c.date);
                const href = `/compromissos?${linkParams.toString()}`;

                const cellInner = (
                  <>
                    <div
                      className="ap-num"
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        color: isSelected
                          ? "var(--accent-on)"
                          : isToday
                            ? "var(--accent)"
                            : hasItems
                              ? "var(--ink)"
                              : "var(--muted-d)",
                        lineHeight: 1,
                        flexShrink: 0,
                      }}
                    >
                      {formatDay(c.date)}
                    </div>
                    {/* Markers (aniversários/feriados) — emoji só, compacto */}
                    {hasMarkers && (
                      <div
                        style={{
                          display: "flex",
                          flexWrap: "wrap",
                          gap: 2,
                          marginTop: 1,
                        }}
                      >
                        {cellMarkers.slice(0, 3).map((m, i) => (
                          <span
                            key={i}
                            title={
                              m.kind === "aniversario"
                                ? `🎂 ${m.name}${m.age !== null ? ` (${m.age})` : ""}`
                                : m.holiday.name
                            }
                            style={{ fontSize: 11, lineHeight: 1 }}
                            aria-hidden
                          >
                            {m.kind === "aniversario" ? "🎂" : m.holiday.icon}
                          </span>
                        ))}
                      </div>
                    )}
                    {items.slice(0, 2).map((it) => (
                      <div
                        key={it.id}
                        style={{
                          fontSize: 9.5,
                          fontWeight: 600,
                          lineHeight: 1.2,
                          color: isSelected ? "var(--accent-on)" : "var(--ink-d)",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          minWidth: 0,
                          flexShrink: 0,
                        }}
                        title={it.title}
                      >
                        {it.time && (
                          <span
                            style={{
                              color: isSelected ? "var(--accent-on)" : "var(--accent)",
                            }}
                          >
                            {it.time}{" "}
                          </span>
                        )}
                        {it.title}
                      </div>
                    ))}
                    {items.length > 2 && (
                      <div
                        style={{
                          fontSize: 9,
                          color: isSelected ? "var(--accent-on)" : "var(--muted)",
                          flexShrink: 0,
                        }}
                      >
                        +{items.length - 2}
                      </div>
                    )}
                  </>
                );

                const cellStyle: React.CSSProperties = {
                  height: 76,
                  padding: 6,
                  borderRadius: 8,
                  background: isSelected
                    ? "var(--accent)"
                    : hasItems || isWeekend
                      ? "var(--card)"
                      : "transparent",
                  border: isSelected
                    ? "1px solid var(--accent)"
                    : isToday
                      ? "1px solid var(--accent)"
                      : isWeekend
                        ? "1px solid var(--line-d)"
                        : "1px solid transparent",
                  opacity: c.inMonth ? 1 : 0.4,
                  display: "flex",
                  flexDirection: "column",
                  gap: 2,
                  overflow: "hidden",
                  minWidth: 0,
                };

                if (!isOpenable) {
                  return (
                    <div key={c.date} style={cellStyle}>
                      {cellInner}
                    </div>
                  );
                }
                return (
                  <Link
                    key={c.date}
                    href={href}
                    scroll={false}
                    style={{ ...cellStyle, textDecoration: "none", color: "inherit" }}
                  >
                    {cellInner}
                  </Link>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {selectedDay && (
        <DayDetailPanel
          date={selectedDay}
          items={byDate.get(selectedDay) ?? []}
          monthStr={monthStr}
          attMap={attMap}
          markerMap={markerMap}
        />
      )}
    </>
  );
}

// Painel expansível com detalhe do dia clicado no calendário.
// Mostra todos os compromissos em tamanho legível (sem cell cramping).
function DayDetailPanel({
  date,
  items,
  monthStr,
  attMap,
  markerMap,
}: {
  date: string;
  items: (typeof compromissos.$inferSelect)[];
  monthStr: string;
  attMap: AttMap;
  markerMap: MarkerMap;
}) {
  const markers = markerMap.get(date) ?? [];
  const dt = new Date(date + "T00:00:00");
  const fullLabel = dt
    .toLocaleDateString("pt-BR", {
      weekday: "long",
      day: "numeric",
      month: "long",
    })
    .replace(/^\w/, (c) => c.toUpperCase());

  const closeParams = new URLSearchParams();
  closeParams.set("view", "calendar");
  closeParams.set("month", monthStr);
  const closeHref = `/compromissos?${closeParams.toString()}`;

  return (
    <div style={{ padding: "0 16px 16px" }}>
      <div
        style={{
          background: "var(--card)",
          borderRadius: 16,
          border: "1px solid var(--accent)",
          padding: "14px 16px",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 10,
          }}
        >
          <div>
            <div
              style={{
                fontSize: 10,
                fontWeight: 800,
                letterSpacing: "0.16em",
                textTransform: "uppercase",
                color: "var(--accent)",
              }}
            >
              dia selecionado
            </div>
            <div
              style={{
                fontSize: 15,
                fontWeight: 700,
                color: "var(--ink)",
                marginTop: 2,
              }}
            >
              {fullLabel}
            </div>
          </div>
          <Link
            href={closeHref}
            scroll={false}
            aria-label="Fechar"
            style={{
              width: 36,
              height: 36,
              borderRadius: 18,
              background: "var(--card2)",
              color: "var(--muted-d)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 16,
              fontWeight: 700,
              textDecoration: "none",
            }}
          >
            ×
          </Link>
        </div>

        {markers.length > 0 && (
          <div style={{ marginBottom: 10 }}>
            <MarkersRow markers={markers} />
          </div>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {items.length === 0 ? (
            <EmptyDayRow date={date} />
          ) : (
            items.map((c) => (
              <CompromissoRow key={c.id} c={c} attachments={attMap.get(c.id) ?? []} />
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// LISTA: futuro/hoje expandidos · passados em arquivo por mês
// ────────────────────────────────────────────────────────────
function ListView({
  upcoming,
  attMap,
  markerMap,
}: {
  upcoming: (typeof compromissos.$inferSelect)[];
  attMap: AttMap;
  markerMap: MarkerMap;
}) {
  if (upcoming.length === 0) {
    return (
      <div
        style={{
          fontSize: 13,
          color: "var(--muted)",
          textAlign: "center",
          padding: "30px 0",
        }}
      >
        Nenhum compromisso ainda. Adicione com o botão acima.
      </div>
    );
  }

  const todayISO = dateToISO(new Date());
  const future = upcoming
    .filter((c) => c.occurredOn >= todayISO)
    .sort((a, b) =>
      a.occurredOn === b.occurredOn
        ? (a.time ?? "").localeCompare(b.time ?? "")
        : a.occurredOn.localeCompare(b.occurredOn)
    );
  const past = upcoming
    .filter((c) => c.occurredOn < todayISO)
    .sort((a, b) => b.occurredOn.localeCompare(a.occurredOn));

  // Agrupa passados por YYYY-MM (mais recente primeiro)
  const pastByMonth = new Map<string, typeof upcoming>();
  for (const c of past) {
    const k = c.occurredOn.slice(0, 7);
    const arr = pastByMonth.get(k) ?? [];
    arr.push(c);
    pastByMonth.set(k, arr);
  }

  return (
    <div style={{ padding: "20px 20px 0" }}>
      {/* Próximos — com separadores sutis quando o mês muda */}
      {future.length > 0 ? (
        future.map((c, i) => {
          const currentMonth = c.occurredOn.slice(0, 7);
          const prevMonth = i > 0 ? future[i - 1].occurredOn.slice(0, 7) : null;
          const showMonthDivider = i > 0 && currentMonth !== prevMonth;
          return (
            <div key={c.id}>
              {showMonthDivider && <MonthDivider yyyymm={currentMonth} />}
              {(markerMap.get(c.occurredOn) ?? []).length > 0 && (
                <div style={{ padding: "8px 0 0 70px" }}>
                  <MarkersRow markers={markerMap.get(c.occurredOn)!} />
                </div>
              )}
              <ListRow
                c={c}
                isLast={i === future.length - 1 && pastByMonth.size === 0}
                attachments={attMap.get(c.id) ?? []}
              />
            </div>
          );
        })
      ) : (
        <div style={{ fontSize: 12.5, color: "var(--muted)", padding: "10px 0 4px" }}>
          Nenhum compromisso à frente.
        </div>
      )}

      {/* Arquivo: passados por mês (collapsed por padrão) */}
      {pastByMonth.size > 0 && (
        <div style={{ marginTop: 24 }}>
          <div
            style={{
              fontSize: 10,
              fontWeight: 800,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: "var(--muted)",
              padding: "8px 0 6px",
              borderTop: "0.5px solid var(--line-d)",
            }}
          >
            Arquivo
          </div>
          {[...pastByMonth.entries()].map(([yyyymm, items]) => {
            const [y, m] = yyyymm.split("-").map(Number);
            const monthLabel = new Date(y, m - 1, 1).toLocaleDateString("pt-BR", {
              month: "long",
              year: "numeric",
            });
            return (
              <details
                key={yyyymm}
                style={{
                  borderBottom: "0.5px solid var(--line-d)",
                }}
              >
                <summary
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "baseline",
                    padding: "10px 0",
                    cursor: "pointer",
                    listStyle: "none",
                    fontSize: 13,
                    fontWeight: 600,
                    color: "var(--ink-d)",
                  }}
                >
                  <span style={{ textTransform: "capitalize" }}>{monthLabel}</span>
                  <span
                    className="ap-num"
                    style={{
                      fontSize: 11,
                      color: "var(--muted)",
                      fontWeight: 700,
                      letterSpacing: "0.04em",
                    }}
                  >
                    {items.length}{" "}
                    {items.length === 1 ? "compromisso" : "compromissos"}
                  </span>
                </summary>
                <div style={{ paddingBottom: 6 }}>
                  {items.map((c, i) => (
                    <ListRow
                      key={c.id}
                      c={c}
                      isLast={i === items.length - 1}
                      dimmed
                      attachments={attMap.get(c.id) ?? []}
                    />
                  ))}
                </div>
              </details>
            );
          })}
        </div>
      )}
    </div>
  );
}

function MonthDivider({ yyyymm }: { yyyymm: string }) {
  const [y, m] = yyyymm.split("-").map(Number);
  const label = new Date(y, m - 1, 1).toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
  });
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "14px 0 6px",
      }}
    >
      <span
        style={{
          fontSize: 9,
          fontWeight: 800,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          color: "var(--muted)",
        }}
      >
        {label}
      </span>
      <div style={{ flex: 1, height: 0.5, background: "var(--line-d)" }} />
    </div>
  );
}

function ListRow({
  c,
  isLast,
  dimmed = false,
  attachments,
}: {
  c: typeof compromissos.$inferSelect;
  isLast: boolean;
  dimmed?: boolean;
  attachments: AttachmentMeta[];
}) {
  const dt = new Date(c.occurredOn + "T00:00:00");
  const dow = dt.getDay();
  const isWeekend = dow === 0 || dow === 6;
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "56px 1fr auto",
        alignItems: "center",
        gap: 10,
        padding: "12px 0",
        borderBottom: isLast ? "none" : "0.5px solid var(--line-d)",
        opacity: dimmed ? 0.72 : 1,
      }}
    >
      <div style={{ textAlign: "center" }}>
        <div
          className="ap-num"
          style={{
            fontSize: 18,
            fontWeight: 800,
            color: isWeekend ? "var(--accent)" : "var(--ink)",
            lineHeight: 1,
            letterSpacing: "-0.04em",
          }}
        >
          {formatDay(c.occurredOn)}
        </div>
        <div
          style={{
            fontSize: 9,
            fontWeight: 800,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: isWeekend ? "var(--accent)" : "var(--muted)",
            marginTop: 3,
          }}
        >
          {DOW_LABEL[dow]} · {formatMonthAbbrev(c.occurredOn)}
        </div>
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          {c.time && (
            <span style={{ fontSize: 12, color: "var(--accent)", fontWeight: 700 }}>
              {c.time}
            </span>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <InlineEditInput
              initialValue={c.title}
              action={patchCompromisso}
              hiddenFields={{ id: c.id }}
              fieldName="title"
              fontSize={13.5}
              fontWeight={600}
            />
          </div>
        </div>
        {(c.who || c.location) && (
          <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>
            {[c.who, c.location].filter(Boolean).join(" · ")}
          </div>
        )}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <AttachmentsButton apiPath={`/api/compromissos/${c.id}`} attachments={attachments} />
        <DeleteBtn action={deleteCompromisso.bind(null, c.id)} confirmMsg={null} />
      </div>
    </div>
  );
}
