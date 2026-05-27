import { and, asc, desc, eq, gte, lte } from "drizzle-orm";
import Link from "next/link";

import { BigNumber, SectionRow } from "@/components/ap/atoms";
import { ScreenShell } from "@/components/ap/screen-shell";
import { auth } from "@/auth";
import { db } from "@/db";
import { cardapioEntries, receitas, users } from "@/db/schema";
import { LunchEditor } from "./lunch-editor";

const DOW_LABEL_FULL = [
  "domingo",
  "segunda",
  "terça",
  "quarta",
  "quinta",
  "sexta",
  "sábado",
];
const DOW_SHORT = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

function dateToISO(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Pega a segunda-feira da semana que contém a data dada. */
function mondayOf(d: Date): Date {
  const day = d.getDay(); // 0=dom..6=sáb
  const diff = day === 0 ? -6 : 1 - day; // dom→-6, seg→0, ter→-1, ...
  const m = new Date(d);
  m.setDate(d.getDate() + diff);
  m.setHours(0, 0, 0, 0);
  return m;
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(d.getDate() + n);
  return r;
}

type SearchParams = Promise<{ week?: string }>;

export default async function CardapioPage({
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

  // Base = segunda da semana selecionada (param ?week=YYYY-MM-DD da segunda)
  const baseDate = sp.week
    ? new Date(sp.week + "T00:00:00")
    : mondayOf(new Date());
  const monday = mondayOf(baseDate);
  const sunday = addDays(monday, 6);
  const mondayStr = dateToISO(monday);
  const sundayStr = dateToISO(sunday);
  const todayStr = dateToISO(new Date());

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = addDays(monday, i);
    return { date: dateToISO(d), dow: d.getDay() };
  });

  // Carrega entradas da semana + receitas vinculadas
  const entries = await db.query.cardapioEntries.findMany({
    where: and(
      eq(cardapioEntries.householdId, dbUser.householdId),
      gte(cardapioEntries.mealDate, mondayStr),
      lte(cardapioEntries.mealDate, sundayStr)
    ),
    with: { receita: true },
  });
  const byDate = new Map(entries.map((e) => [e.mealDate, e]));

  // Receitas pra autocomplete
  const allReceitas = await db.query.receitas.findMany({
    where: eq(receitas.householdId, dbUser.householdId),
    orderBy: [desc(receitas.isFavorite), asc(receitas.title)],
    limit: 200,
  });

  const filledCount = days.filter((d) => byDate.get(d.date)).length;
  const prevWeek = dateToISO(addDays(monday, -7));
  const nextWeek = dateToISO(addDays(monday, 7));
  const thisWeek = dateToISO(mondayOf(new Date()));
  const weekLabel = `${monday.getDate()}/${monday.getMonth() + 1} – ${sunday.getDate()}/${sunday.getMonth() + 1}`;

  return (
    <ScreenShell
      insight={
        filledCount === 7 ? (
          <>Semana toda planejada. Boa.</>
        ) : filledCount === 0 ? (
          <>Nenhum almoço definido pra essa semana. Toque num dia pra agendar.</>
        ) : (
          <>
            <b>{filledCount}/7</b> almoços definidos. Faltam{" "}
            {7 - filledCount} dias.
          </>
        )
      }
    >
      <SectionRow
        icon="bag"
        label="Cardápio"
        action={
          <Link
            href="/cardapio/receitas"
            style={{
              padding: "5px 12px",
              borderRadius: 999,
              background: "var(--card)",
              color: "var(--ink)",
              fontSize: 11,
              fontWeight: 700,
              textDecoration: "none",
              border: "1px solid var(--line-d)",
            }}
          >
            livro de receitas →
          </Link>
        }
      />

      {/* Navegação de semana */}
      <div
        style={{
          padding: "8px 20px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
        }}
      >
        <Link href={`/cardapio?week=${prevWeek}`} style={navBtnStyle}>
          ‹
        </Link>
        <div style={{ textAlign: "center", flex: 1 }}>
          <div className="ap-num" style={{ fontSize: 16, fontWeight: 800, letterSpacing: "-0.02em" }}>
            {weekLabel}
          </div>
          {mondayStr !== thisWeek && (
            <Link
              href="/cardapio"
              style={{
                fontSize: 10,
                color: "var(--accent)",
                fontWeight: 700,
                textDecoration: "none",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
              }}
            >
              voltar a esta semana
            </Link>
          )}
        </div>
        <Link href={`/cardapio?week=${nextWeek}`} style={navBtnStyle}>
          ›
        </Link>
      </div>

      <BigNumber
        value={`${filledCount}/7`}
        sub={`almoços planejados · semana ${weekLabel}`}
      />

      <div
        style={{
          padding: "12px 16px 0",
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        {days.map((d) => {
          const entry = byDate.get(d.date);
          const isToday = d.date === todayStr;
          return (
            <LunchEditor
              key={d.date}
              date={d.date}
              dowShort={DOW_SHORT[d.dow]}
              dowFull={DOW_LABEL_FULL[d.dow]}
              dayNumber={parseInt(d.date.split("-")[2], 10)}
              isToday={isToday}
              entry={entry ?? null}
              receitas={allReceitas.map((r) => ({
                id: r.id,
                title: r.title,
                imageUrl: r.imageUrl,
              }))}
            />
          );
        })}
      </div>
    </ScreenShell>
  );
}

const navBtnStyle: React.CSSProperties = {
  width: 40,
  height: 40,
  borderRadius: 20,
  background: "var(--card)",
  color: "var(--ink)",
  border: "1px solid var(--line-d)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  textDecoration: "none",
  fontSize: 18,
  fontWeight: 700,
  flexShrink: 0,
};
