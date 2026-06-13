import { eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";

import { SectionRow } from "@/components/ap/atoms";
import { DeleteBtn } from "@/components/ap/inline-form";
import { InlineEditInput } from "@/components/ap/inline-edit-input";
import { ScreenShell } from "@/components/ap/screen-shell";
import {
  deleteReceita,
  patchReceita,
  toggleReceitaFavorita,
} from "@/app/actions/cardapio";
import { auth } from "@/auth";
import { db } from "@/db";
import { receitas, users } from "@/db/schema";

type Params = Promise<{ id: string }>;

export default async function ReceitaDetailPage({ params }: { params: Params }) {
  const { id } = await params;

  const session = await auth();
  if (!session?.user?.id) return null;
  const dbUser = await db.query.users.findFirst({
    where: eq(users.id, session.user.id),
  });
  if (!dbUser?.householdId) return null;

  const r = await db.query.receitas.findFirst({
    where: eq(receitas.id, id),
  });
  if (!r || r.householdId !== dbUser.householdId) return notFound();

  return (
    <ScreenShell>
      <SectionRow
        icon="bag"
        label="Receita"
        action={
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <form action={toggleReceitaFavorita.bind(null, r.id)}>
              <button
                type="submit"
                aria-label={r.isFavorite ? "Desfavoritar" : "Favoritar"}
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 18,
                  background: r.isFavorite ? "var(--accent)" : "var(--card)",
                  color: r.isFavorite ? "var(--accent-on)" : "var(--muted)",
                  border: "0.5px solid var(--line-d)",
                  cursor: "pointer",
                  fontSize: 14,
                  fontWeight: 700,
                }}
              >
                ★
              </button>
            </form>
            <DeleteBtn
              action={deleteReceita.bind(null, r.id)}
              confirmMsg={`Excluir receita "${r.title}"?`}
            />
          </div>
        }
      />

      {/* Foto */}
      <div style={{ padding: "0 20px 4px" }}>
        {r.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={r.imageUrl}
            alt={r.title}
            style={{
              width: "100%",
              maxHeight: 280,
              objectFit: "cover",
              borderRadius: 16,
              display: "block",
            }}
          />
        ) : null}
      </div>

      {/* Título + meta */}
      <div style={{ padding: "12px 20px 0", display: "flex", flexDirection: "column", gap: 6 }}>
        <InlineEditInput
          initialValue={r.title}
          action={patchReceita}
          hiddenFields={{ id: r.id }}
          fieldName="title"
          fontSize={22}
          fontWeight={800}
        />

        {r.sourceUrl && (
          <a
            href={r.sourceUrl}
            target="_blank"
            rel="noopener"
            style={{
              fontSize: 11,
              color: "var(--accent)",
              textDecoration: "none",
              fontWeight: 600,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              display: "block",
            }}
          >
            ↗ {new URL(r.sourceUrl).hostname}
          </a>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 6 }}>
          <div>
            <div className="ap-eyebrow" style={{ fontSize: 9 }}>tempo (min)</div>
            <InlineEditInput
              initialValue={r.prepTimeMin ? String(r.prepTimeMin) : ""}
              action={patchReceita}
              hiddenFields={{ id: r.id }}
              fieldName="prepTimeMin"
              placeholder="—"
              fontSize={14}
              fontWeight={700}
            />
          </div>
          <div>
            <div className="ap-eyebrow" style={{ fontSize: 9 }}>porções</div>
            <InlineEditInput
              initialValue={r.servings ? String(r.servings) : ""}
              action={patchReceita}
              hiddenFields={{ id: r.id }}
              fieldName="servings"
              placeholder="—"
              fontSize={14}
              fontWeight={700}
            />
          </div>
        </div>

        <div style={{ marginTop: 6 }}>
          <div className="ap-eyebrow" style={{ fontSize: 9 }}>tags (CSV)</div>
          <InlineEditInput
            initialValue={r.tags ?? ""}
            action={patchReceita}
            hiddenFields={{ id: r.id }}
            fieldName="tags"
            placeholder="rápido,vegetariano,frango"
            fontSize={12}
            color="var(--muted-d)"
          />
        </div>
      </div>

      {/* Ingredientes */}
      <SectionRow icon="bag" label="Ingredientes" />
      <div style={{ padding: "0 20px" }}>
        <InlineEditInput
          initialValue={r.ingredients ?? ""}
          action={patchReceita}
          hiddenFields={{ id: r.id }}
          fieldName="ingredients"
          placeholder={"- 200g de arroz\n- 2 colheres de óleo\n- …"}
          fontSize={14}
          fontWeight={500}
          multiline
        />
      </div>

      {/* Passo-a-passo */}
      <SectionRow icon="cal" label="Passo-a-passo" />
      <div style={{ padding: "0 20px" }}>
        <InlineEditInput
          initialValue={r.steps ?? ""}
          action={patchReceita}
          hiddenFields={{ id: r.id }}
          fieldName="steps"
          placeholder={"1. Aqueça o óleo\n2. Refogue a cebola\n3. …"}
          fontSize={14}
          fontWeight={500}
          multiline
        />
      </div>

      {/* Notas */}
      <SectionRow icon="cal" label="Notas" />
      <div style={{ padding: "0 20px 16px" }}>
        <InlineEditInput
          initialValue={r.notes ?? ""}
          action={patchReceita}
          hiddenFields={{ id: r.id }}
          fieldName="notes"
          placeholder="dicas, substituições, lembretes…"
          fontSize={13}
          color="var(--muted-d)"
          italic
          multiline
        />
      </div>

      {/* Atalho pra agendar */}
      <div style={{ padding: "0 20px 12px" }}>
        <Link
          href="/cardapio"
          style={{
            display: "block",
            padding: "12px 14px",
            borderRadius: 12,
            background: "var(--accent)",
            color: "var(--accent-on)",
            textAlign: "center",
            textDecoration: "none",
            fontSize: 13,
            fontWeight: 700,
          }}
        >
          Agendar no cardápio →
        </Link>
      </div>

      {/* Excluir receita — botão explícito */}
      <div style={{ padding: "0 20px 20px" }}>
        <form action={deleteReceita.bind(null, r.id)}>
          <button
            type="submit"
            style={{
              display: "block",
              width: "100%",
              padding: "12px 14px",
              borderRadius: 12,
              background: "transparent",
              color: "var(--alert)",
              border: "1px solid var(--alert)",
              fontSize: 13,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Excluir receita
          </button>
        </form>
      </div>
    </ScreenShell>
  );
}
