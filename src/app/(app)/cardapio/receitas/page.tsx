import { asc, desc, eq } from "drizzle-orm";
import Link from "next/link";

import { BigNumber, SectionRow } from "@/components/ap/atoms";
import { ScreenShell } from "@/components/ap/screen-shell";
import { auth } from "@/auth";
import { db } from "@/db";
import { receitas, users } from "@/db/schema";
import { ImportRecipeForm } from "./import-recipe-form";

export default async function ReceitasPage() {
  const session = await auth();
  if (!session?.user?.id) return null;
  const dbUser = await db.query.users.findFirst({
    where: eq(users.id, session.user.id),
  });
  if (!dbUser?.householdId) return null;

  const all = await db.query.receitas.findMany({
    where: eq(receitas.householdId, dbUser.householdId),
    orderBy: [desc(receitas.isFavorite), desc(receitas.updatedAt)],
  });

  const favoritas = all.filter((r) => r.isFavorite);
  const outras = all.filter((r) => !r.isFavorite);

  return (
    <ScreenShell
      insight={
        all.length === 0 ? (
          <>
            Sem receitas ainda. Cole um link aqui em cima ou cadastre na mão —
            depois é só agendar pro dia.
          </>
        ) : (
          <>
            <b>{all.length}</b> {all.length === 1 ? "receita" : "receitas"} no livro
            {favoritas.length > 0 ? ` · ${favoritas.length} favoritas` : ""}.
          </>
        )
      }
    >
      <SectionRow icon="bag" label="Livro de receitas" action={`${all.length}`} />

      <BigNumber value={String(all.length)} sub="receitas no total" />

      {/* Importar via URL — a IA extrai */}
      <div style={{ padding: "14px 16px 0" }}>
        <ImportRecipeForm />
      </div>

      {/* Lista — favoritas primeiro */}
      {all.length > 0 && (
        <div style={{ padding: "16px 16px 0" }}>
          {favoritas.length > 0 && (
            <>
              <div
                style={{
                  fontSize: 9,
                  fontWeight: 800,
                  letterSpacing: "0.18em",
                  textTransform: "uppercase",
                  color: "var(--accent)",
                  padding: "0 0 8px",
                }}
              >
                ★ favoritas
              </div>
              <div style={cardsGridStyle}>
                {favoritas.map((r) => (
                  <ReceitaCard key={r.id} r={r} />
                ))}
              </div>
            </>
          )}
          {outras.length > 0 && (
            <>
              {favoritas.length > 0 && (
                <div
                  style={{
                    fontSize: 9,
                    fontWeight: 800,
                    letterSpacing: "0.18em",
                    textTransform: "uppercase",
                    color: "var(--muted)",
                    padding: "16px 0 8px",
                  }}
                >
                  todas
                </div>
              )}
              <div style={cardsGridStyle}>
                {outras.map((r) => (
                  <ReceitaCard key={r.id} r={r} />
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </ScreenShell>
  );
}

const cardsGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 10,
};

function ReceitaCard({ r }: { r: typeof receitas.$inferSelect }) {
  return (
    <Link
      href={`/cardapio/receitas/${r.id}`}
      style={{
        background: "var(--card)",
        borderRadius: 14,
        border: "0.5px solid var(--line-d)",
        overflow: "hidden",
        textDecoration: "none",
        color: "inherit",
        display: "flex",
        flexDirection: "column",
        minHeight: 160,
      }}
    >
      {r.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={r.imageUrl}
          alt={r.title}
          style={{
            width: "100%",
            height: 100,
            objectFit: "cover",
            display: "block",
          }}
        />
      ) : (
        <div
          style={{
            height: 100,
            background: "var(--card2)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--muted)",
            fontSize: 11,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
          }}
        >
          sem foto
        </div>
      )}
      <div style={{ padding: "10px 12px", display: "flex", flexDirection: "column", gap: 4 }}>
        <div
          style={{
            fontSize: 13,
            fontWeight: 700,
            color: "var(--ink)",
            lineHeight: 1.25,
            overflow: "hidden",
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
          }}
        >
          {r.title}
        </div>
        {(r.prepTimeMin || r.servings) && (
          <div style={{ fontSize: 10.5, color: "var(--muted)", display: "flex", gap: 8 }}>
            {r.prepTimeMin ? <span>{r.prepTimeMin}min</span> : null}
            {r.servings ? <span>{r.servings} porções</span> : null}
          </div>
        )}
      </div>
    </Link>
  );
}
