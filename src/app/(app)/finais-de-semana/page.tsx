import { asc, eq, gte, lte } from "drizzle-orm";

import { BigNumber, SectionRow } from "@/components/ap/atoms";
import { DeleteBtn, FormField, InlineForm, SubmitButton, fieldStyle } from "@/components/ap/inline-form";
import { ScreenShell } from "@/components/ap/screen-shell";
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

function dayOfWeek(dStr: string) {
  const [y, m, d] = dStr.split("-").map(Number);
  return new Date(y, m - 1, d).getDay();
}

type SearchParams = Promise<{ month?: string }>;

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

  // Mês selecionado (default: atual)
  const now = new Date();
  const monthStr = sp.month ?? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const [yearN, monthN] = monthStr.split("-").map(Number);

  // Calcular sex/sáb/dom do mês
  const monthStart = new Date(yearN, monthN - 1, 1);
  const monthEnd = new Date(yearN, monthN, 0); // último dia
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
  const entries = await db.query.finsDeSemana.findMany({
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
  type Weekend = { friday?: { date: string; dow: number }; saturday?: { date: string; dow: number }; sunday?: { date: string; dow: number } };
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

  const prevMonth = new Date(yearN, monthN - 2, 1);
  const nextMonth = new Date(yearN, monthN, 1);
  const prevMonthStr = `${prevMonth.getFullYear()}-${String(prevMonth.getMonth() + 1).padStart(2, "0")}`;
  const nextMonthStr = `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, "0")}`;

  return (
    <ScreenShell
      userQ="Como tão nossos finais de semana esse mês?"
      insight={
        entries.length > 0 ? (
          <>
            <b>{entries.length}</b> {entries.length === 1 ? "programação" : "programações"} pra esse mês.
          </>
        ) : (
          <>Nenhum plano ainda. Que tal pensar nos próximos dias livres?</>
        )
      }
    >
      <SectionRow
        icon="heart"
        label="Finais de semana"
        action={
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <a
              href={`/finais-de-semana?month=${prevMonthStr}`}
              style={{
                padding: "2px 8px",
                borderRadius: 6,
                background: "var(--card2)",
                color: "var(--muted-d)",
                fontSize: 11,
                textDecoration: "none",
              }}
            >
              ‹
            </a>
            <span style={{ fontSize: 12, color: "var(--muted)" }}>{monthLabel}</span>
            <a
              href={`/finais-de-semana?month=${nextMonthStr}`}
              style={{
                padding: "2px 8px",
                borderRadius: 6,
                background: "var(--card2)",
                color: "var(--muted-d)",
                fontSize: 11,
                textDecoration: "none",
              }}
            >
              ›
            </a>
          </div>
        }
      />

      <BigNumber
        value={`${entries.length}`}
        sub={`${entries.length === 1 ? "programação" : "programações"} em ${monthLabel}`}
      />

      <div style={{ padding: "14px 20px 0", display: "flex", flexDirection: "column", gap: 14 }}>
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
                padding: 14,
              }}
            >
              {days.map((d) => {
                const items = entriesByDate.get(d.date) ?? [];
                return (
                  <div key={d.date} style={{ marginBottom: 10 }}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        marginBottom: 6,
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
                        {DOW_LABEL[d.dow]}
                      </span>
                      <span
                        className="ap-num"
                        style={{ fontSize: 16, color: "var(--ink)" }}
                      >
                        {formatDateBr(d.date)}
                      </span>
                    </div>
                    {items.length === 0 ? (
                      <div
                        style={{
                          fontSize: 11.5,
                          color: "var(--muted)",
                          padding: "4px 0 4px 38px",
                          fontStyle: "italic",
                        }}
                      >
                        — livre
                      </div>
                    ) : (
                      items.map((item) => (
                        <div
                          key={item.id}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            padding: "4px 0 4px 38px",
                          }}
                        >
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 600 }}>
                              {item.title}
                            </div>
                            {item.notes && (
                              <div
                                style={{
                                  fontSize: 11,
                                  color: "var(--muted)",
                                  marginTop: 1,
                                }}
                              >
                                {item.notes}
                              </div>
                            )}
                          </div>
                          <DeleteBtn
                            action={deleteFimDeSemana.bind(null, item.id)}
                            confirmMsg="Excluir?"
                          />
                        </div>
                      ))
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      <div style={{ padding: "14px 0 0" }}>
        <InlineForm buttonLabel="Adicionar programação">
          <form action={createFimDeSemana}>
            <FormField label="O que vai rolar? *">
              <input
                name="title"
                required
                placeholder="Ex: jantar com os amigos"
                style={fieldStyle}
              />
            </FormField>
            <FormField label="Data *" hint="Use sexta, sábado ou domingo">
              <input type="date" name="weekendDate" required style={fieldStyle} />
            </FormField>
            <FormField label="Detalhes">
              <textarea name="notes" rows={2} style={fieldStyle} />
            </FormField>
            <SubmitButton>Adicionar</SubmitButton>
          </form>
        </InlineForm>
      </div>
    </ScreenShell>
  );
}
