import { desc, eq } from "drizzle-orm";

import { BigNumber, SectionRow } from "@/components/ap/atoms";
import { CheckboxToggle } from "@/components/ap/checkbox-toggle";
import { DeleteBtn } from "@/components/ap/inline-form";
import { InlineEditInput } from "@/components/ap/inline-edit-input";
import { ScreenShell } from "@/components/ap/screen-shell";
import {
  createSonho,
  deleteSonho,
  patchSonho,
  toggleSonhoStatus,
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
            <b>{active.length}</b> {active.length === 1 ? "sonho ativo" : "sonhos ativos"}
            {realized.length > 0 ? ` · ${realized.length} já realizados` : ""}.
          </>
        ) : (
          <>Comece um sonho — digite abaixo · Enter salva.</>
        )
      }
    >
      <SectionRow icon="star" label="Sonhos" action={`${all.length}`} />

      <BigNumber
        value={String(active.length)}
        sub={`ativos · ${realized.length} realizados`}
        accent={active.length > 0}
      />

      {/* Quick-add */}
      <div style={{ padding: "12px 20px 0" }}>
        <div
          style={{
            background: "var(--card)",
            borderRadius: 12,
            padding: "10px 14px",
            border: "1px dashed var(--line-d)",
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <span style={{ fontSize: 14, color: "var(--accent)", fontWeight: 800 }}>+</span>
          <InlineEditInput
            initialValue=""
            action={createSonho}
            placeholder="qual é o próximo sonho? · Enter salva"
            fontSize={13.5}
            fontWeight={600}
            clearAfterSubmit
          />
        </div>
      </div>

      {/* Carrossel horizontal de sonhos ativos com imagem */}
      {active.length > 0 && (
        <>
          <SectionRow icon="star" label="Ativos" action={`${active.length}`} />
          <div
            style={{
              padding: "0 16px",
              display: "flex",
              gap: 12,
              overflowX: "auto",
              scrollbarWidth: "thin",
              scrollSnapType: "x mandatory",
            }}
          >
            {active.map((s) => (
              <SonhoCarouselCard key={s.id} s={s} />
            ))}
          </div>
        </>
      )}

      {/* Realizados — sempre em lista compacta */}
      {realized.length > 0 && (
        <>
          <SectionRow icon="heart" label="Já realizados" action={`${realized.length}`} />
          <div style={{ padding: "0 20px 20px" }}>
            {realized.map((s, i) => (
              <div
                key={s.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "auto 1fr auto",
                  alignItems: "center",
                  gap: 12,
                  padding: "10px 0",
                  borderBottom: i < realized.length - 1 ? "0.5px solid var(--line-d)" : "none",
                  opacity: 0.75,
                }}
              >
                <CheckboxToggle
                  checked={true}
                  action={toggleSonhoStatus}
                  hiddenFields={{ id: s.id }}
                  size={18}
                  ariaLabel="Reabrir sonho"
                />
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      textDecoration: "line-through",
                      color: "var(--muted-d)",
                    }}
                  >
                    {s.title}
                  </div>
                  {s.realizedDate && (
                    <div style={{ fontSize: 10.5, color: "var(--muted)", marginTop: 1 }}>
                      realizado em {new Date(s.realizedDate + "T00:00:00").toLocaleDateString("pt-BR")}
                    </div>
                  )}
                </div>
                <DeleteBtn action={deleteSonho.bind(null, s.id)} confirmMsg={null} />
              </div>
            ))}
          </div>
        </>
      )}
    </ScreenShell>
  );
}

function SonhoCarouselCard({ s }: { s: typeof sonhos.$inferSelect }) {
  return (
    <div
      style={{
        background: "var(--card)",
        borderRadius: 16,
        border: "0.5px solid var(--line-d)",
        overflow: "hidden",
        minWidth: 260,
        maxWidth: 260,
        flexShrink: 0,
        scrollSnapAlign: "start",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {s.imageUrl ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={s.imageUrl}
          alt={s.title}
          style={{
            width: "100%",
            aspectRatio: "4 / 3",
            objectFit: "cover",
            display: "block",
          }}
        />
      ) : (
        <div
          style={{
            width: "100%",
            aspectRatio: "4 / 3",
            background: "var(--card2)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--muted)",
            fontSize: 24,
            fontWeight: 800,
            letterSpacing: "-0.04em",
          }}
        >
          ★
        </div>
      )}
      <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 8, flex: 1 }}>
        <div style={{ display: "flex", alignItems: "start", gap: 8 }}>
          <CheckboxToggle
            checked={false}
            action={toggleSonhoStatus}
            hiddenFields={{ id: s.id }}
            size={18}
            ariaLabel="Marcar como realizado"
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            <InlineEditInput
              initialValue={s.title}
              action={patchSonho}
              hiddenFields={{ id: s.id }}
              fieldName="title"
              fontSize={14}
              fontWeight={700}
            />
          </div>
          <DeleteBtn action={deleteSonho.bind(null, s.id)} confirmMsg={null} />
        </div>

        {/* Descrição — campo OBVIAMENTE editável (bg + border) */}
        <EditableField
          icon="✎"
          label="descrição"
          value={s.description ?? ""}
          fieldName="description"
          id={s.id}
        />

        {/* URL da imagem */}
        <EditableField
          icon="🖼"
          label="url da imagem"
          value={s.imageUrl ?? ""}
          fieldName="imageUrl"
          id={s.id}
          monospace
        />
      </div>
    </div>
  );
}

/**
 * Campo editável visivelmente sinalizado: ícone + label muted + valor
 * em chip com background/border. Estado vazio mostra "clique pra
 * adicionar {label}" — afordância de input clara.
 */
function EditableField({
  icon,
  label,
  value,
  fieldName,
  id,
  monospace = false,
}: {
  icon: string;
  label: string;
  value: string;
  fieldName: string;
  id: string;
  monospace?: boolean;
}) {
  return (
    <div
      style={{
        background: "var(--card2)",
        border: "0.5px dashed var(--line-d)",
        borderRadius: 10,
        padding: "8px 10px",
        display: "flex",
        flexDirection: "column",
        gap: 4,
      }}
    >
      <div
        style={{
          fontSize: 9.5,
          fontWeight: 700,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: "var(--muted)",
          display: "flex",
          alignItems: "center",
          gap: 4,
        }}
      >
        <span aria-hidden>{icon}</span>
        {label}
      </div>
      <InlineEditInput
        initialValue={value}
        action={patchSonho}
        hiddenFields={{ id }}
        fieldName={fieldName}
        placeholder={`clique pra adicionar ${label}`}
        fontSize={12.5}
        fontWeight={500}
        color={monospace ? "var(--muted-d)" : "var(--ink-d)"}
      />
    </div>
  );
}
