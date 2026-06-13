import { asc, desc, eq } from "drizzle-orm";

import { BigNumber, SectionRow } from "@/components/ap/atoms";
import { ScreenShell } from "@/components/ap/screen-shell";
import { auth } from "@/auth";
import { db } from "@/db";
import { cardapioEntries, receitas, users } from "@/db/schema";
import { LunchEditor } from "./lunch-editor";

// 0=segunda .. 6=domingo (alinha com ISO 8601 / pt-BR)
const DAYS = [
  { dow: 0, short: "seg", full: "Segunda-feira" },
  { dow: 1, short: "ter", full: "Terça-feira" },
  { dow: 2, short: "qua", full: "Quarta-feira" },
  { dow: 3, short: "qui", full: "Quinta-feira" },
  { dow: 4, short: "sex", full: "Sexta-feira" },
  { dow: 5, short: "sáb", full: "Sábado" },
  { dow: 6, short: "dom", full: "Domingo" },
];

function todayDow(): number {
  // JS getDay(): 0=dom..6=sáb. Converto pra 0=seg..6=dom.
  const js = new Date().getDay();
  return js === 0 ? 6 : js - 1;
}

export default async function CardapioPage() {
  const session = await auth();
  if (!session?.user?.id) return null;
  const dbUser = await db.query.users.findFirst({
    where: eq(users.id, session.user.id),
  });
  if (!dbUser?.householdId) return null;

  // Cardápio é atemporal: 1 entrada por (household, dayOfWeek)
  const entries = await db.query.cardapioEntries.findMany({
    where: eq(cardapioEntries.householdId, dbUser.householdId),
    with: { receita: true },
  });
  const byDow = new Map(entries.map((e) => [e.dayOfWeek, e]));

  // Receitas pra autocomplete
  const allReceitas = await db.query.receitas.findMany({
    where: eq(receitas.householdId, dbUser.householdId),
    orderBy: [desc(receitas.isFavorite), asc(receitas.title)],
    limit: 200,
  });

  const filledCount = DAYS.filter((d) => byDow.get(d.dow)).length;
  const today = todayDow();

  return (
    <ScreenShell
      insight={
        filledCount === 7 ? (
          <>Semana toda planejada. Esse cardápio vale até vocês mudarem.</>
        ) : filledCount === 0 ? (
          <>
            Nenhum almoço definido. Toque num dia pra agendar — o cardápio é
            fixo, vale pra todas as semanas até mudarem.
          </>
        ) : (
          <>
            <b>{filledCount}/7</b> almoços definidos. Falta encaixar{" "}
            {7 - filledCount}.
          </>
        )
      }
    >
      {/* Link pro livro de receitas saiu daqui — os chips do módulo no topo
          já levam pra lá. */}
      <SectionRow icon="cutlery" label="Cardápio da semana" action={`${filledCount}/7`} />

      <BigNumber
        value={`${filledCount}/7`}
        sub="almoços definidos · fixo até vocês mudarem"
      />

      <div
        style={{
          padding: "14px 16px 0",
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        {DAYS.map((d) => {
          const entry = byDow.get(d.dow);
          return (
            <LunchEditor
              key={d.dow}
              dayOfWeek={d.dow}
              dowShort={d.short}
              dowFull={d.full}
              isToday={d.dow === today}
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
