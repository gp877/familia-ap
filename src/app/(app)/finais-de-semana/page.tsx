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

const DOW_LABEL = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

function formatDateBr(dStr: string) {
  const [y, m, d] = dStr.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
  });
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

  // Em modo lista: pega TODAS as entradas, ordenadas por data desc (mais recentes primeiro).
  // Em modo resumo: só as do mês selecionado.
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

  const entriesByDate = new Map<string, typeof entries>();
  for (const e of entries) {
    const arr = entriesByDate.get(e.weekendDate) ?? [];
    arr.push(e);
    entriesByDate.set(e.weekendDate, arr);
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

  return (
    <ScreenShell
      userQ="Como tão nossos finais de semana esse mês?"
      insight={
        entries.length > 0 ? (
          <>
            <b>{entries.length}</b> {entries.length === 1 ? "programação" : "programações"} em {monthLabel}. Digite direto no dia pra adicionar.
          </>
        ) : (
          <>Nenhum plano ainda. Clique no dia abaixo e <b>digite</b> direto pra adicionar — Enter salva.</>
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
        value={`${entries.length}`}
        sub={
          isList
            ? `${entries.length === 1 ? "programação" : "programações"} no histórico`
            : `${entries.length === 1 ? "programação" : "programações"} em ${monthLabel}`
        }
      />

      {isList ? (
        <div style={{ padding: "14px 20px 0" }}>
          {entries.length === 0 ? (
            <div style={{ fontSize: 13, color: "var(--muted)", textAlign: "center", padding: "20px 0" }}>
              Nenhuma programação ainda.
            </div>
          ) : (
            entries.map((e, i) => (
              <div
                key={e.id}
                style={{
                  display: "flex",
                  gap: 12,
                  alignItems: "center",
                  padding: "10px 0",
                  borderBottom:
                    i < entries.length - 1 ? "0.5px solid var(--line-d)" : "none",
                }}
              >
                <div
                  style={{
                    width: 50,
                    textAlign: "right",
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    color: "var(--muted)",
                  }}
                >
                  {formatDateBr(e.weekendDate)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600 }}>{e.title}</div>
                  {e.notes && (
                    <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 1 }}>
                      {e.notes}
                    </div>
                  )}
                </div>
                <DeleteBtn
                  action={deleteFimDeSemana.bind(null, e.id)}
                  confirmMsg="Excluir?"
                />
              </div>
            ))
          )}
        </div>
      ) : (
        <div
          style={{
            padding: "14px 20px 0",
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          {weekends.map((w, idx) => {
            const days = [w.friday, w.saturday, w.sunday].filter(Boolean) as {
              date: string;
              dow: number;
            }[];
            if (days.length === 0) return null;
            return (
              <div
                key={idx}
                style={{
                  borderRadius: 16,
                  background: "var(--surf)",
                  padding: 12,
                }}
              >
                {days.map((d) => {
                  const items = entriesByDate.get(d.date) ?? [];
                  return <DayRow key={d.date} day={d} items={items} />;
                })}
              </div>
            );
          })}
        </div>
      )}
    </ScreenShell>
  );
}

function DayRow({
  day,
  items,
}: {
  day: { date: string; dow: number };
  items: typeof finsDeSemana.$inferSelect[];
}) {
  return (
    <div style={{ marginBottom: 8, borderBottom: "0.5px solid var(--line-d)", paddingBottom: 8 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 4,
        }}
      >
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: "var(--muted)",
            width: 30,
          }}
        >
          {DOW_LABEL[day.dow]}
        </span>
        <span className="ap-num" style={{ fontSize: 16, color: "var(--ink)" }}>
          {formatDateBr(day.date)}
        </span>
      </div>

      {items.map((item) => (
        <div
          key={item.id}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "3px 0 3px 38px",
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{item.title}</div>
            {item.notes && (
              <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 1 }}>
                {item.notes}
              </div>
            )}
          </div>
          <DeleteBtn
            action={deleteFimDeSemana.bind(null, item.id)}
            confirmMsg="Excluir?"
          />
        </div>
      ))}

      {/* Linha inline pra adicionar — sem botão, só Enter */}
      <div style={{ paddingLeft: 38, paddingTop: 2 }}>
        <QuickAddInput
          action={createFimDeSemana}
          hiddenFields={{ weekendDate: day.date }}
          placeholder={items.length === 0 ? "+ que tal? (Enter pra salvar)" : "+ adicionar mais..."}
        />
      </div>
    </div>
  );
}
