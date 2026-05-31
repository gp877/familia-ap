import { desc, eq } from "drizzle-orm";

import { BigNumber, SectionRow } from "@/components/ap/atoms";
import { CheckboxToggle } from "@/components/ap/checkbox-toggle";
import { DeleteBtn } from "@/components/ap/inline-form";
import { InlineEditInput } from "@/components/ap/inline-edit-input";
import { ScreenShell } from "@/components/ap/screen-shell";
import {
  createSonho,
  deleteSonho,
  toggleSonhoStatus,
} from "@/app/actions/sonhos";
import { auth } from "@/auth";
import { db } from "@/db";
import { sonhos, users } from "@/db/schema";
import { SonhoEditDialog } from "./sonho-edit-dialog";

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
                <div
                  style={{
                    width: 28,
                    height: 28,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <CheckboxToggle
                    checked={true}
                    action={toggleSonhoStatus}
                    hiddenFields={{ id: s.id }}
                    size={20}
                    ariaLabel="Reabrir sonho"
                  />
                </div>
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
      <div
        style={{
          padding: 12,
          display: "flex",
          flexDirection: "column",
          gap: 8,
          flex: 1,
        }}
      >
        {/* Título — fonte grande, ocupa a largura */}
        <div
          style={{
            fontSize: 14,
            fontWeight: 700,
            color: "var(--ink)",
            lineHeight: 1.25,
            // Acomoda até 2 linhas
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
            minHeight: 36, // mantém altura consistente quando título tem 1 linha
          }}
        >
          {s.title}
        </div>

        {/* Descrição (read-only no card; edição via lápis) */}
        {s.description ? (
          <div
            style={{
              fontSize: 11.5,
              color: "var(--muted-d)",
              lineHeight: 1.4,
              display: "-webkit-box",
              WebkitLineClamp: 3,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
            {s.description}
          </div>
        ) : (
          <div
            style={{
              fontSize: 11,
              color: "var(--muted)",
              fontStyle: "italic",
            }}
          >
            sem descrição — clique no lápis pra adicionar
          </div>
        )}

        {/* Spacer pra empurrar barra de ações pro fim */}
        <div style={{ flex: 1 }} />

        {/* Barra de ações ALINHADA — checkbox + lápis + delete, todos
            mesmo tamanho 28x28, no mesmo line-height. */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 4,
            paddingTop: 4,
            borderTop: "0.5px solid var(--line-d)",
            marginTop: 2,
          }}
        >
          <ActionWrapper>
            <CheckboxToggle
              checked={false}
              action={toggleSonhoStatus}
              hiddenFields={{ id: s.id }}
              size={20}
              ariaLabel="Marcar como realizado"
            />
          </ActionWrapper>
          <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
            <SonhoEditDialog
              sonho={{
                id: s.id,
                title: s.title,
                description: s.description,
                imageUrl: s.imageUrl,
              }}
            />
            <DeleteBtn action={deleteSonho.bind(null, s.id)} confirmMsg={null} />
          </div>
        </div>
      </div>
    </div>
  );
}

/** Wrapper de 28x28 que centraliza qualquer botão de ação. */
function ActionWrapper({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        width: 28,
        height: 28,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {children}
    </div>
  );
}
