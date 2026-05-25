import { asc, desc, eq, gte, lte } from "drizzle-orm";

import { BigNumber, SectionRow } from "@/components/ap/atoms";
import { DeleteBtn } from "@/components/ap/inline-form";
import { MonthChips } from "@/components/ap/month-chips";
import { QuickAddInput } from "@/components/ap/quick-add-input";
import { ScreenShell } from "@/components/ap/screen-shell";
import { ViewToggle } from "@/components/ap/view-toggle";
import {
  createFimDeSemana,
  deleteFimDeSemana,
} from "@/app/actions/finais-de-semana";
import { auth } from "@/auth";
import { db } from "@/db";
import { finsDeSemana, users } from "@/db/schema";

const DOW_LABEL = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

function formatDay(dStr: string) {
  const [, , day] = dStr.split("-").map(Number);
  return String(day).padStart(2, "0");
}

function formatMonthShort(dStr: string) {
  const [y, m, d] = dStr.split("-").map(Number);
  return new Date(y, m - 1, d)
    .toLocaleDateString("pt-BR", { month: "short" })
    .replace(".", "");
}

// Cores por dia: sex = neutro com leve borda, sáb = accent, dom = card2 quente
function dayStyle(dow: number): {
  cellBg: string;
  cellBorder: string;
  tagBg: string;
  tagFg: string;
  tagWeight: number;
} {
  if (dow === 5) {
    // sex — leve, dia "warm-up"
    return {
      cellBg: "var(--card)",
      cellBorder: "transparent",
      tagBg: "var(--card2)",
      tagFg: "var(--muted-d)",
      tagWeight: 600,
    };
  }
  if (dow === 6) {
    // sáb — protagonista
    return {
      cellBg: "var(--card)",
      cellBorder: "var(--accent)",
      tagBg: "var(--accent)",
      tagFg: "var(--accent-on)",
      tagWeight: 800,
    };
  }
  // dom — quente, encerramento
  return {
    cellBg: "var(--card)",
    cellBorder: "transparent",
    tagBg: "#3a2d20",
    tagFg: "#e9c89c",
    tagWeight: 700,
  };
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

  const isList = sp.view === "list";

  const now = new Date();
  const monthStr = sp.month ?? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const [yearN, monthN] = monthStr.split("-").map(Number);

  const monthStart = new Date(yearN, monthN - 1, 1);
  const monthEnd = new Date(yearN, monthN, 0);
  const weekendDays: { date: string; dow: number }[] = [];
  for (let d = 1; d <= monthEnd.getDate(); d++) {
    const dt = new Date(yearN, monthN - 1, d);
    const dow = dt.getDay();
    if (dow === 0 || dow === 5 || dow === 6) {
      weekendDays.push({
        date: `${yearN}-${String(monthN).padStart(2, "0")}-${String(d).padStart(2, "0")}`,
        dow,
      });
    }
  }

  const monthStartStr = monthStart.toISOString().slice(0, 10);
  const monthEndStr = monthEnd.toISOString().slice(0, 10);

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
            gte(f.weekendDate, monthStartStr),
            lte(f.weekendDate, monthEndStr)
          ),
        orderBy: [asc(finsDeSemana.weekendDate), asc(finsDeSemana.createdAt)],
      });

  // 1 entry por data (a mais recente vence — action faz upsert mas pode haver
  // legados; pegamos a última inserida)
  const entryByDate = new Map<string, typeof entries[number]>();
  for (const e of entries) {
    entryByDate.set(e.weekendDate, e);
  }

  // Agrupar por fim-de-semana (sex/sáb/dom consecutivos)
  type Weekend = {
    friday?: { date: string; dow: number };
    saturday?: { date: string; dow: number };
    sunday?: { date: string; dow: number };
  };
  const weekends: Weekend[] = [];
  let current: Weekend = {};
  for (const wd of weekendDays) {
    if (wd.dow === 5) {
      if (current.friday || current.saturday || current.sunday) {
        weekends.push(current);
        current = {};
      }
      current.friday = wd;
    } else if (wd.dow === 6) {
      current.saturday = wd;
    } else if (wd.dow === 0) {
      current.sunday = wd;
      weekends.push(current);
      current = {};
    }
  }
  if (current.friday || current.saturday || current.sunday) weekends.push(current);

  const monthLabel = new Date(yearN, monthN - 1, 1).toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
  });

  const filledCount = weekendDays.filter((d) => entryByDate.has(d.date)).length;

  return (
    <ScreenShell
      userQ="Como tão nossos finais de semana esse mês?"
      insight={
        entries.length > 0 ? (
          <>
            <b>{filledCount}</b> de {weekendDays.length} dias preenchidos em {monthLabel}. Digite na linha pra programar.
          </>
        ) : (
          <>Nenhum plano ainda. Digite na linha do dia (Enter salva). Um título por dia.</>
        )
      }
    >
      <SectionRow
        icon="heart"
        label="Finais de semana"
        action={
          <ViewToggle
            basePath="/finais-de-semana"
            current={sp.view}
            extraParams={{ month: sp.month }}
          />
        }
      />

      {!isList && (
        <MonthChips basePath="/finais-de-semana" currentMonth={monthStr} />
      )}

      <BigNumber
        value={isList ? `${entries.length}` : `${filledCount}/${weekendDays.length}`}
        sub={
          isList
            ? `programações no histórico`
            : `dias preenchidos · ${monthLabel}`
        }
      />

      {isList ? (
        <div style={{ padding: "14px 20px 0" }}>
          {entries.length === 0 ? (
            <div style={{ fontSize: 13, color: "var(--muted)", textAlign: "center", padding: "20px 0" }}>
              Nenhuma programação ainda.
            </div>
          ) : (
            entries.map((e, i) => {
              const dt = new Date(e.weekendDate + "T00:00:00");
              const s = dayStyle(dt.getDay());
              return (
                <div
                  key={e.id}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "60px 1fr auto",
                    alignItems: "center",
                    gap: 10,
                    padding: "10px 0",
                    borderBottom:
                      i < entries.length - 1 ? "0.5px solid var(--line-d)" : "none",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "baseline",
                      gap: 6,
                      padding: "4px 8px",
                      borderRadius: 8,
                      background: s.tagBg,
                      color: s.tagFg,
                      justifyContent: "center",
                    }}
                  >
                    <span
                      className="ap-num"
                      style={{ fontSize: 14, fontWeight: s.tagWeight, lineHeight: 1 }}
                    >
                      {formatDay(e.weekendDate)}
                    </span>
                    <span
                      style={{
                        fontSize: 9,
                        fontWeight: 700,
                        letterSpacing: "0.1em",
                        textTransform: "uppercase",
                      }}
                    >
                      {DOW_LABEL[dt.getDay()]}
                    </span>
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
                    <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 1 }}>
                      {formatMonthShort(e.weekendDate)}{" "}
                      {new Date(e.weekendDate + "T00:00:00").getFullYear()}
                    </div>
                  </div>
                  <DeleteBtn
                    action={deleteFimDeSemana.bind(null, e.id)}
                    confirmMsg="Excluir?"
                  />
                </div>
              );
            })
          )}
        </div>
      ) : (
        <div
          style={{
            padding: "14px 20px 0",
            display: "flex",
            flexDirection: "column",
            gap: 16,
          }}
        >
          {weekends.map((w, idx) => {
            const days = [w.friday, w.saturday, w.sunday].filter(Boolean) as {
              date: string;
              dow: number;
            }[];
            if (days.length === 0) return null;
            return (
              <div key={idx} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {days.map((d) => (
                  <DayCell
                    key={d.date}
                    day={d}
                    entry={entryByDate.get(d.date) ?? null}
                  />
                ))}
              </div>
            );
          })}
        </div>
      )}
    </ScreenShell>
  );
}

function DayCell({
  day,
  entry,
}: {
  day: { date: string; dow: number };
  entry: typeof finsDeSemana.$inferSelect | null;
}) {
  const s = dayStyle(day.dow);
  const hasEntry = !!entry;
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "56px 1fr auto",
        alignItems: "center",
        gap: 10,
        padding: "8px 12px",
        background: s.cellBg,
        borderRadius: 12,
        border: `1px solid ${s.cellBorder}`,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: 5,
          padding: "5px 10px",
          borderRadius: 8,
          background: s.tagBg,
          color: s.tagFg,
          justifyContent: "center",
        }}
      >
        <span
          className="ap-num"
          style={{ fontSize: 14, fontWeight: s.tagWeight, lineHeight: 1 }}
        >
          {formatDay(day.date)}
        </span>
        <span
          style={{
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
          }}
        >
          {DOW_LABEL[day.dow]}
        </span>
      </div>

      {/* Título inline: se houver, mostra como texto; se vazio, mostra input quick-add */}
      {hasEntry ? (
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontSize: 13.5,
              fontWeight: 600,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
            title={entry!.title}
          >
            {entry!.title}
          </div>
          {entry!.notes && (
            <div
              style={{
                fontSize: 11,
                color: "var(--muted)",
                marginTop: 1,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {entry!.notes}
            </div>
          )}
        </div>
      ) : (
        <QuickAddInput
          action={createFimDeSemana}
          hiddenFields={{ weekendDate: day.date }}
          placeholder="livre · digite pra programar"
          fontSize={13}
        />
      )}

      {hasEntry ? (
        <DeleteBtn
          action={deleteFimDeSemana.bind(null, entry!.id)}
          confirmMsg="Limpar este dia?"
        />
      ) : (
        <div style={{ width: 28 }} />
      )}
    </div>
  );
}
