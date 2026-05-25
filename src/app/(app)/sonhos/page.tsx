import { desc, eq } from "drizzle-orm";

import { BigNumber, Card, SectionRow } from "@/components/ap/atoms";
import { DeleteBtn, FormField, InlineForm, SubmitButton, fieldStyle } from "@/components/ap/inline-form";
import { QuickAddInput } from "@/components/ap/quick-add-input";
import { ScreenShell } from "@/components/ap/screen-shell";
import { ViewToggle } from "@/components/ap/view-toggle";
import {
  createSonho,
  deleteSonho,
  markSonhoRealized,
  reopenSonho,
} from "@/app/actions/sonhos";
import { auth } from "@/auth";
import { db } from "@/db";
import { sonhos, users } from "@/db/schema";

type SearchParams = Promise<{ view?: string }>;

export default async function SonhosPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = await searchParams;
  const isList = sp.view === "list";

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
        label={isList ? "Histórico de sonhos" : active.length > 0 ? "Sonhos ativos" : "Comece um sonho"}
        action={
          <ViewToggle basePath="/sonhos" current={sp.view} />
        }
      />

      {isList ? (
        <BigNumber
          value={String(all.length)}
          sub={`${active.length} ativos · ${realized.length} realizados`}
        />
      ) : active[0] ? (
        <BigNumber value={active[0].title} sub={active[0].description ?? "ainda sem descrição"} accent />
      ) : (
        <BigNumber value="—" sub="nenhum sonho cadastrado" />
      )}

      {/* Quick-add: só título, Enter cria */}
      <div style={{ padding: "12px 20px 0" }}>
        <Card pad={10}>
          <QuickAddInput
            action={createSonho}
            placeholder="+ qual o sonho? (Enter pra salvar)"
            fontSize={13.5}
          />
        </Card>
      </div>

      {/* Form completo: só pra quem quer adicionar descrição + imagem */}
      <div style={{ padding: "10px 0 0" }}>
        <InlineForm buttonLabel="+ descrição e imagem">
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
                placeholder="Como vocês visualizam?"
                style={fieldStyle}
              />
            </FormField>
            <FormField label="URL de imagem" hint="opcional · cole link de imagem inspiração">
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

      {isList ? (
        <div style={{ padding: "16px 20px 0" }}>
          {all.length === 0 ? (
            <div style={{ fontSize: 13, color: "var(--muted)", textAlign: "center", padding: "20px 0" }}>
              Nenhum sonho ainda.
            </div>
          ) : (
            all.map((s, i) => (
              <div
                key={s.id}
                style={{
                  display: "flex",
                  gap: 12,
                  alignItems: "center",
                  padding: "12px 0",
                  borderBottom: i < all.length - 1 ? "0.5px solid var(--line-d)" : "none",
                  opacity: s.status === "realized" ? 0.6 : 1,
                }}
              >
                <div
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: 3,
                    background:
                      s.status === "realized" ? "var(--ok)" : "var(--accent)",
                    flexShrink: 0,
                  }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 14,
                      fontWeight: 700,
                      textDecoration: s.status === "realized" ? "line-through" : "none",
                    }}
                  >
                    {s.title}
                  </div>
                  {s.description && (
                    <div style={{ fontSize: 11.5, color: "var(--muted-d)", marginTop: 2 }}>
                      {s.description}
                    </div>
                  )}
                  <div style={{ fontSize: 10.5, color: "var(--muted)", marginTop: 3 }}>
                    {s.status === "realized"
                      ? `realizado ${s.realizedDate ?? ""}`
                      : `cadastrado ${new Date(s.createdAt).toLocaleDateString("pt-BR")}`}
                  </div>
                </div>
                <DeleteBtn
                  action={deleteSonho.bind(null, s.id)}
                  confirmMsg={`Excluir "${s.title}"?`}
                />
              </div>
            ))
          )}
        </div>
      ) : (
        <>
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
