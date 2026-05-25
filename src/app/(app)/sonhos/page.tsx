import { desc, eq } from "drizzle-orm";

import { BigNumber, SectionRow } from "@/components/ap/atoms";
import { DeleteBtn, FormField, InlineForm, SubmitButton, fieldStyle } from "@/components/ap/inline-form";
import { ScreenShell } from "@/components/ap/screen-shell";
import {
  createSonho,
  deleteSonho,
  markSonhoRealized,
  reopenSonho,
} from "@/app/actions/sonhos";
import { auth } from "@/auth";
import { db } from "@/db";
import { sonhos, users } from "@/db/schema";

export default async function SonhosPage() {
  const session = await auth();
  if (!session?.user?.id) return null;

  const dbUser = await db.query.users.findFirst({
    where: eq(users.id, session.user.id),
  });
  if (!dbUser?.householdId) return null;

  const all = await db.query.sonhos.findMany({
    where: eq(sonhos.householdId, dbUser.householdId),
    orderBy: [desc(sonhos.createdAt)],
  });

  const active = all.filter((s) => s.status === "active");
  const realized = all.filter((s) => s.status === "realized");

  return (
    <ScreenShell
      userQ="O que vocês mais querem?"
      insight={
        active.length > 0 ? (
          <>
            <b>{active.length}</b> {active.length === 1 ? "sonho" : "sonhos"} ativos
            {realized.length > 0 ? <> · {realized.length} já realizados</> : null}. Continua lembrando deles todo dia.
          </>
        ) : (
          <>Sonhos não foram feitos pra ficar guardados. Adiciona um abaixo — vou te lembrar deles sempre que voltar aqui.</>
        )
      }
    >
      <SectionRow
        icon="star"
        label={active.length > 0 ? "Sonhos ativos" : "Comece um sonho"}
        action={`${active.length} ativos`}
      />

      {active[0] ? (
        <BigNumber value={active[0].title} sub={active[0].description ?? "ainda sem descrição"} accent />
      ) : (
        <BigNumber value="—" sub="nenhum sonho cadastrado" />
      )}

      <div style={{ padding: "14px 0 0" }}>
        <InlineForm buttonLabel="Adicionar sonho">
          <form action={createSonho}>
            <FormField label="Título *">
              <input
                name="title"
                required
                placeholder="Ex: casa na praia"
                style={fieldStyle}
              />
            </FormField>
            <FormField label="Descrição">
              <textarea
                name="description"
                rows={2}
                placeholder="Como vocês visualizam esse sonho?"
                style={fieldStyle}
              />
            </FormField>
            <FormField label="URL de imagem" hint="opcional · cole link de uma imagem inspiração">
              <input
                type="url"
                name="imageUrl"
                placeholder="https://..."
                style={fieldStyle}
              />
            </FormField>
            <SubmitButton>Salvar sonho</SubmitButton>
          </form>
        </InlineForm>
      </div>

      {active.length > 0 && (
        <div style={{ padding: "16px 20px 0", display: "grid", gap: 12 }}>
          {active.map((s) => (
            <SonhoCard
              key={s.id}
              s={s}
              actionLabel="Realizado"
              onAction={markSonhoRealized.bind(null, s.id)}
              onDelete={deleteSonho.bind(null, s.id)}
            />
          ))}
        </div>
      )}

      {realized.length > 0 && (
        <>
          <SectionRow icon="heart" label="Já realizados" action={`${realized.length}`} />
          <div style={{ padding: "0 20px", display: "grid", gap: 12 }}>
            {realized.map((s) => (
              <SonhoCard
                key={s.id}
                s={s}
                actionLabel="Reabrir"
                onAction={reopenSonho.bind(null, s.id)}
                onDelete={deleteSonho.bind(null, s.id)}
                realized
              />
            ))}
          </div>
        </>
      )}
    </ScreenShell>
  );
}

function SonhoCard({
  s,
  actionLabel,
  onAction,
  onDelete,
  realized,
}: {
  s: typeof sonhos.$inferSelect;
  actionLabel: string;
  onAction: () => Promise<void>;
  onDelete: () => Promise<void>;
  realized?: boolean;
}) {
  return (
    <div
      style={{
        borderRadius: 16,
        background: "var(--card)",
        overflow: "hidden",
        opacity: realized ? 0.75 : 1,
      }}
    >
      {s.imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={s.imageUrl}
          alt={s.title}
          style={{
            width: "100%",
            aspectRatio: "16 / 9",
            objectFit: "cover",
            display: "block",
          }}
        />
      )}
      <div style={{ padding: 14 }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: 16,
                fontWeight: 700,
                letterSpacing: "-0.01em",
                color: realized ? "var(--muted-d)" : "var(--ink)",
                textDecoration: realized ? "line-through" : "none",
              }}
            >
              {s.title}
            </div>
            {s.description && (
              <div style={{ fontSize: 12.5, color: "var(--muted-d)", marginTop: 4 }}>
                {s.description}
              </div>
            )}
          </div>
          <DeleteBtn action={onDelete} confirmMsg={`Excluir "${s.title}"?`} />
        </div>
        <form action={onAction} style={{ marginTop: 10 }}>
          <button
            type="submit"
            style={{
              padding: "6px 14px",
              borderRadius: 999,
              background: "var(--card2)",
              color: "var(--ink-d)",
              border: "none",
              fontSize: 11.5,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {actionLabel}
          </button>
        </form>
      </div>
    </div>
  );
}
