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

      {/* Quick-add card */}
      <div style={{ padding: "12px 20px 0" }}>
        <div
          style={{
            background: "var(--card)",
            borderRadius: 14,
            padding: "12px 14px",
            border: "1px dashed var(--line-d)",
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <span style={{ fontSize: 16, color: "var(--accent)", fontWeight: 800 }}>+</span>
          <InlineEditInput
            initialValue=""
            action={createSonho}
            placeholder="qual é o próximo sonho? · Enter salva"
            fontSize={14}
            fontWeight={600}
          />
        </div>
      </div>

      {/* Lista de sonhos ativos */}
      <div style={{ padding: "16px 20px 0", display: "grid", gap: 12 }}>
        {active.map((s) => (
          <SonhoCard key={s.id} s={s} />
        ))}
      </div>

      {/* Realizados */}
      {realized.length > 0 && (
        <>
          <SectionRow icon="heart" label="Já realizados" action={`${realized.length}`} />
          <div style={{ padding: "0 20px 20px", display: "grid", gap: 12 }}>
            {realized.map((s) => (
              <SonhoCard key={s.id} s={s} />
            ))}
          </div>
        </>
      )}
    </ScreenShell>
  );
}

function SonhoCard({ s }: { s: typeof sonhos.$inferSelect }) {
  const realized = s.status === "realized";
  return (
    <div
      style={{
        borderRadius: 18,
        background: "var(--card)",
        overflow: "hidden",
        border: "0.5px solid var(--line-d)",
        opacity: realized ? 0.7 : 1,
      }}
    >
      {s.imageUrl && (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={s.imageUrl}
          alt={s.title}
          style={{
            width: "100%",
            aspectRatio: "16 / 9",
            objectFit: "cover",
            display: "block",
            filter: realized ? "grayscale(0.5)" : "none",
          }}
        />
      )}
      <div
        style={{
          padding: 14,
          display: "grid",
          gridTemplateColumns: "auto 1fr auto",
          gap: 12,
          alignItems: "start",
        }}
      >
        <CheckboxToggle
          checked={realized}
          action={toggleSonhoStatus}
          hiddenFields={{ id: s.id }}
          size={22}
          ariaLabel="Marcar como realizado"
        />
        <div style={{ minWidth: 0 }}>
          <InlineEditInput
            initialValue={s.title}
            action={patchSonho}
            hiddenFields={{ id: s.id }}
            fieldName="title"
            fontSize={16}
            fontWeight={700}
            color={realized ? "var(--muted-d)" : "var(--ink)"}
          />
          <div style={{ marginTop: 4 }}>
            <InlineEditInput
              initialValue={s.description ?? ""}
              action={patchSonho}
              hiddenFields={{ id: s.id }}
              fieldName="description"
              placeholder="+ descrição"
              fontSize={12.5}
              fontWeight={400}
              color="var(--muted-d)"
            />
          </div>
          <div style={{ marginTop: 4 }}>
            <InlineEditInput
              initialValue={s.imageUrl ?? ""}
              action={patchSonho}
              hiddenFields={{ id: s.id }}
              fieldName="imageUrl"
              placeholder="+ url de imagem"
              fontSize={11}
              fontWeight={400}
              color="var(--muted)"
            />
          </div>
        </div>
        <DeleteBtn action={deleteSonho.bind(null, s.id)} confirmMsg={null} />
      </div>
    </div>
  );
}
