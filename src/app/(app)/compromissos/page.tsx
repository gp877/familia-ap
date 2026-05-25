import { asc, eq, gte, lte } from "drizzle-orm";
import Link from "next/link";

import { BigNumber, SectionRow } from "@/components/ap/atoms";
import { DeleteBtn } from "@/components/ap/inline-form";
import { InlineEditInput } from "@/components/ap/inline-edit-input";
import { ScreenShell } from "@/components/ap/screen-shell";
import { ViewToggle } from "@/components/ap/view-toggle";
import {
  createCompromisso,
  deleteCompromisso,
  patchCompromisso,
} from "@/app/actions/compromissos";
import { auth } from "@/auth";
import { db } from "@/db";
import { compromissos, users } from "@/db/schema";

const DOW_LABEL = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}
function dateAhead(days: number) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}
function formatDay(d: string) {
  return d.slice(8, 10);
}

type SearchParams = Promise<{ range?: string; view?: string }>;

export default async function CompromissosPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = await searchParams;
  const range = sp.range ?? "week"; // today | week | month | all
  const isList = sp.view === "list";

  const session = await auth();
  if (!session?.user?.id) return null;
  const dbUser = await db.query.users.findFirst({
    where: eq(users.id, session.user.id),
  });
  if (!dbUser?.householdId) return null;

  const t = todayStr();
  const rangeDays =
    range === "today" ? 1 : range === "week" ? 7 : range === "month" ? 30 : null;

  let upcoming: (typeof compromissos.$inferSelect)[];

  if (isList || range === "all") {
    upcoming = await db.query.compromissos.findMany({
      where: eq(compromissos.householdId, dbUser.householdId),
      orderBy: isList
        ? [asc(compromissos.occurredOn), asc(compromissos.time)]
        : [asc(compromissos.occurredOn), asc(compromissos.time)],
      limit: 300,
    });
  } else {
    const end = dateAhead(rangeDays! - 1);
    upcoming = await db.query.compromissos.findMany({
      where: (c, { and: a }) =>
        a(
          eq(c.householdId, dbUser.householdId!),
          gte(c.occurredOn, t),
          lte(c.occurredOn, end)
        ),
      orderBy: [asc(compromissos.occurredOn), asc(compromissos.time)],
    });
  }

  // Para o modo "day cards": gera N dias a partir de hoje
  const days: string[] = [];
  if (!isList && rangeDays) {
    for (let i = 0; i < rangeDays; i++) days.push(dateAhead(i));
  }

  const byDate = new Map<string, typeof upcoming>();
  for (const c of upcoming) {
    const arr = byDate.get(c.occurredOn) ?? [];
    arr.push(c);
    byDate.set(c.occurredOn, arr);
  }

  const next = upcoming.find((c) => c.occurredOn >= t);

  return (
    <ScreenShell
      userQ="O que tem nos próximos dias?"
      insight={
        next ? (
          <>
            Próximo: <b>{next.title}</b>{" "}
            {next.occurredOn === t ? "hoje" : `· ${next.occurredOn.slice(8, 10)}/${next.occurredOn.slice(5, 7)}`}
            {next.time ? ` às ${next.time}` : ""}.
          </>
        ) : (
          <>Sem compromissos. Digite no campo de cada dia abaixo · Enter salva.</>
        )
      }
    >
      <SectionRow
        icon="cal"
        label="Compromissos"
        action={
          <ViewToggle
            basePath="/compromissos"
            current={sp.view}
            extraParams={{ range: sp.range }}
          />
        }
      />

      {!isList && (
        <div style={{ padding: "0 20px 8px", display: "flex", gap: 6, flexWrap: "wrap" }}>
          {[
            { key: "today", label: "Hoje" },
            { key: "week", label: "7 dias" },
            { key: "month", label: "30 dias" },
            { key: "all", label: "Tudo" },
          ].map((r) => {
            const isActive = range === r.key;
            return (
              <Link
                key={r.key}
                href={`/compromissos?range=${r.key}`}
                style={{
                  padding: "5px 14px",
                  borderRadius: 999,
                  fontSize: 11.5,
                  fontWeight: 700,
                  background: isActive ? "var(--accent)" : "var(--card)",
                  color: isActive ? "var(--accent-on)" : "var(--muted-d)",
                  textDecoration: "none",
                  border: isActive ? "none" : "1px solid var(--line-d)",
                }}
              >
                {r.label}
              </Link>
            );
          })}
        </div>
      )}

      <BigNumber
        value={isList || range === "all" ? String(upcoming.length) : `${upcoming.length}`}
        sub={
          range === "today"
            ? "hoje"
            : range === "week"
              ? "nos próximos 7 dias"
              : range === "month"
                ? "nos próximos 30 dias"
                : isList
                  ? "no histórico"
                  : "no total"
        }
      />

      {isList || range === "all" ? (
        <ListView upcoming={upcoming} />
      ) : (
        <DayCardsView days={days} byDate={byDate} />
      )}
    </ScreenShell>
  );
}

function DayCardsView({
  days,
  byDate,
}: {
  days: string[];
  byDate: Map<string, (typeof compromissos.$inferSelect)[]>;
}) {
  const t = todayStr();
  return (
    <div
      style={{
        padding: "14px 16px 0",
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      {days.map((date) => {
        const items = byDate.get(date) ?? [];
        const dt = new Date(date + "T00:00:00");
        const dow = dt.getDay();
        const isToday = date === t;
        const isWeekend = dow === 0 || dow === 6;
        return (
          <div
            key={date}
            style={{
              background: "var(--card)",
              borderRadius: 16,
              border: isToday ? "1px solid var(--accent)" : "0.5px solid var(--line-d)",
              overflow: "hidden",
            }}
          >
            {/* Header do dia */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "10px 14px",
                background: "var(--surf)",
                borderBottom: items.length > 0 ? "1px solid var(--line-d)" : "none",
              }}
            >
              <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                <span
                  className="ap-num"
                  style={{
                    fontSize: 22,
                    fontWeight: 800,
                    color: isToday ? "var(--accent)" : "var(--ink)",
                    letterSpacing: "-0.04em",
                    lineHeight: 1,
                  }}
                >
                  {formatDay(date)}
                </span>
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 800,
                    letterSpacing: "0.14em",
                    textTransform: "uppercase",
                    color: isWeekend ? "var(--accent)" : "var(--muted)",
                  }}
                >
                  {DOW_LABEL[dow]}
                  {isToday ? " · hoje" : ""}
                </span>
              </div>
              <span
                style={{
                  fontSize: 10.5,
                  color: "var(--muted)",
                  fontWeight: 600,
                }}
              >
                {items.length === 0
                  ? "livre"
                  : `${items.length} ${items.length === 1 ? "evento" : "eventos"}`}
              </span>
            </div>

            {/* Lista de itens */}
            {items.length > 0 && (
              <div>
                {items.map((c, i) => (
                  <CompromissoRow
                    key={c.id}
                    c={c}
                    isLast={i === items.length - 1}
                  />
                ))}
              </div>
            )}

            {/* Quick add inline (sempre presente) */}
            <QuickAddDayRow date={date} />
          </div>
        );
      })}
    </div>
  );
}

function CompromissoRow({
  c,
  isLast,
}: {
  c: typeof compromissos.$inferSelect;
  isLast: boolean;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "56px 1fr auto",
        alignItems: "center",
        gap: 10,
        padding: "10px 14px",
        borderBottom: isLast ? "1px solid var(--line-d)" : "0.5px solid var(--line-d)",
      }}
    >
      <InlineEditInput
        initialValue={c.time ?? ""}
        action={patchCompromisso}
        hiddenFields={{ id: c.id }}
        fieldName="time"
        placeholder="--:--"
        fontSize={12}
        fontWeight={700}
        color="var(--accent)"
      />
      <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 1 }}>
        <InlineEditInput
          initialValue={c.title}
          action={patchCompromisso}
          hiddenFields={{ id: c.id }}
          fieldName="title"
          placeholder="(título)"
          fontSize={13.5}
          fontWeight={600}
        />
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <InlineEditInput
            initialValue={c.who ?? ""}
            action={patchCompromisso}
            hiddenFields={{ id: c.id }}
            fieldName="who"
            placeholder="+ quem"
            fontSize={11}
            fontWeight={400}
            color="var(--muted-d)"
          />
          {c.location && (
            <InlineEditInput
              initialValue={c.location}
              action={patchCompromisso}
              hiddenFields={{ id: c.id }}
              fieldName="location"
              placeholder="+ local"
              fontSize={11}
              fontWeight={400}
              color="var(--muted-d)"
            />
          )}
        </div>
      </div>
      <DeleteBtn action={deleteCompromisso.bind(null, c.id)} confirmMsg={null} />
    </div>
  );
}

function QuickAddDayRow({ date }: { date: string }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "56px 1fr",
        alignItems: "center",
        gap: 10,
        padding: "8px 14px",
      }}
    >
      <span
        style={{
          fontSize: 11,
          color: "var(--muted)",
          fontWeight: 700,
        }}
      >
        +
      </span>
      <InlineEditInput
        initialValue=""
        action={createCompromisso}
        hiddenFields={{ occurredOn: date }}
        placeholder="adicionar compromisso · Enter salva"
        fontSize={12.5}
        fontWeight={500}
        color="var(--muted-d)"
      />
    </div>
  );
}

function ListView({
  upcoming,
}: {
  upcoming: (typeof compromissos.$inferSelect)[];
}) {
  if (upcoming.length === 0) {
    return (
      <div
        style={{
          fontSize: 13,
          color: "var(--muted)",
          textAlign: "center",
          padding: "20px 0",
        }}
      >
        Nenhum compromisso.
      </div>
    );
  }
  return (
    <div style={{ padding: "14px 20px 0" }}>
      {upcoming.map((c, i) => {
        const dt = new Date(c.occurredOn + "T00:00:00");
        const dow = dt.getDay();
        return (
          <div
            key={c.id}
            style={{
              display: "grid",
              gridTemplateColumns: "52px 1fr auto",
              alignItems: "center",
              gap: 12,
              padding: "10px 0",
              borderBottom:
                i < upcoming.length - 1 ? "0.5px solid var(--line-d)" : "none",
            }}
          >
            <div style={{ textAlign: "center" }}>
              <div
                className="ap-num"
                style={{
                  fontSize: 16,
                  fontWeight: 700,
                  color: "var(--ink-d)",
                  lineHeight: 1,
                }}
              >
                {formatDay(c.occurredOn)}
              </div>
              <div
                style={{
                  fontSize: 9,
                  fontWeight: 700,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  color: dow === 0 || dow === 6 ? "var(--accent)" : "var(--muted)",
                  marginTop: 2,
                }}
              >
                {DOW_LABEL[dow]}
              </div>
            </div>
            <div style={{ minWidth: 0 }}>
              <InlineEditInput
                initialValue={c.title}
                action={patchCompromisso}
                hiddenFields={{ id: c.id }}
                fieldName="title"
                fontSize={13.5}
                fontWeight={600}
              />
              <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 1 }}>
                {[c.time, c.who, c.location].filter(Boolean).join(" · ") || "—"}
              </div>
            </div>
            <DeleteBtn
              action={deleteCompromisso.bind(null, c.id)}
              confirmMsg={null}
            />
          </div>
        );
      })}
    </div>
  );
}
