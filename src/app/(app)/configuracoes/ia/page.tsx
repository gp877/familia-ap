import { eq } from "drizzle-orm";
import Link from "next/link";

import { Card, SectionRow } from "@/components/ap/atoms";
import { BackButton } from "@/components/ap/inline-form";
import { InlineEditInput } from "@/components/ap/inline-edit-input";
import { ScreenShell } from "@/components/ap/screen-shell";
import {
  getOrCreateAiSettings,
  patchAiSettings,
  resetAiSettings,
} from "@/app/actions/ai-settings";
import { auth } from "@/auth";
import { db } from "@/db";
import { memories, users } from "@/db/schema";

const TONE_OPTIONS = [
  { value: "intimo", label: "Íntimo", hint: "informal, conversacional, 'vocês', 'a gente'" },
  { value: "formal", label: "Formal", hint: "profissional, cortês" },
  { value: "divertido", label: "Divertido", hint: "leve, com brincadeiras sutis" },
];

const LENGTH_OPTIONS = [
  { value: "curto", label: "Curto", hint: "1-2 frases" },
  { value: "medio", label: "Médio", hint: "2-4 frases" },
  { value: "detalhado", label: "Detalhado", hint: "estruturado quando precisar" },
];

const MODEL_OPTIONS = [
  { value: "", label: "Default (gemini-flash-latest)" },
  { value: "gemini-flash-latest", label: "gemini-flash-latest (rápido)" },
  { value: "gemini-2.5-flash", label: "gemini-2.5-flash (estável)" },
  { value: "gemini-2.5-flash-lite", label: "gemini-2.5-flash-lite (mais quota)" },
];

export default async function IaConfigPage() {
  const session = await auth();
  if (!session?.user?.id) return null;
  const dbUser = await db.query.users.findFirst({
    where: eq(users.id, session.user.id),
  });
  if (!dbUser?.householdId) return null;

  const settings = await getOrCreateAiSettings(dbUser.householdId);
  const memCount = await db
    .select({ id: memories.id })
    .from(memories)
    .where(eq(memories.householdId, dbUser.householdId))
    .then((rs) => rs.length);

  return (
    <ScreenShell>
      <div style={{ padding: "0 20px 8px" }}>
        <BackButton href="/configuracoes" label="Configurações" />
      </div>

      <SectionRow
        icon="spark"
        label="Configurar a AP"
        action={
          <form action={resetAiSettings}>
            <button
              type="submit"
              style={{
                padding: "5px 12px",
                borderRadius: 999,
                background: "transparent",
                color: "var(--muted)",
                border: "1px solid var(--line-d)",
                fontSize: 11,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              restaurar padrão
            </button>
          </form>
        }
      />

      {/* Alma */}
      <div style={{ padding: "14px 20px 0" }}>
        <Card pad={16} raised>
          <SubLabel
            title="Alma"
            hint="Personalidade, valores, o que a AP é pra família. Texto livre — vai junto do system prompt."
          />
          <InlineEditInput
            initialValue={settings.alma ?? ""}
            action={patchAiSettings}
            fieldName="alma"
            placeholder={
              "Ex: A AP é como uma amiga próxima dos pais. Conhece a rotina da família, valoriza tempo de qualidade, ajuda a fazer escolhas conscientes sem moralizar."
            }
            fontSize={14}
            fontWeight={500}
            multiline
          />
        </Card>
      </div>

      {/* Linguagem & Tom */}
      <div style={{ padding: "14px 20px 0", display: "grid", gap: 12 }}>
        <Card pad={16}>
          <SubLabel title="Tom" hint="Como ela conversa no dia a dia." />
          <form
            action={patchAiSettings}
            style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 6 }}
          >
            {TONE_OPTIONS.map((opt) => (
              <RadioRow
                key={opt.value}
                name="tone"
                value={opt.value}
                label={opt.label}
                hint={opt.hint}
                selected={settings.tone}
              />
            ))}
            <SubmitInline label="Salvar tom" />
          </form>
        </Card>

        <Card pad={16}>
          <SubLabel title="Tamanho da resposta" hint="Quanto a AP escreve por mensagem." />
          <form
            action={patchAiSettings}
            style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 6 }}
          >
            {LENGTH_OPTIONS.map((opt) => (
              <RadioRow
                key={opt.value}
                name="responseLength"
                value={opt.value}
                label={opt.label}
                hint={opt.hint}
                selected={settings.responseLength}
              />
            ))}
            <SubmitInline label="Salvar tamanho" />
          </form>
        </Card>
      </div>

      {/* Preferências booleans */}
      <div style={{ padding: "14px 20px 0" }}>
        <Card pad={16}>
          <SubLabel
            title="Preferências"
            hint="Liga/desliga comportamentos. Cada toggle salva sozinho."
          />
          <ToggleRow
            label="Permite emoji"
            hint="Default é sem. Se a família curte, marca aqui."
            name="allowEmoji"
            value={settings.allowEmoji}
          />
          <ToggleRow
            label="Chama pelo nome"
            hint="Usa Gabriel/Marília no texto."
            name="callsUserByName"
            value={settings.callsUserByName}
          />
          <ToggleRow
            label="Salva memórias automaticamente"
            hint="A AP decide o que vale lembrar. Desligue se quiser controle manual."
            name="autoSaveMemories"
            value={settings.autoSaveMemories}
          />
        </Card>
      </div>

      {/* Modelo */}
      <div style={{ padding: "14px 20px 0" }}>
        <Card pad={16}>
          <SubLabel
            title="Modelo da Gemini"
            hint="Troque se estiver batendo limite de quota. lite tem mais quota mas é menos esperto."
          />
          <form
            action={patchAiSettings}
            style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}
          >
            {MODEL_OPTIONS.map((opt) => (
              <RadioRow
                key={opt.value || "default"}
                name="modelOverride"
                value={opt.value}
                label={opt.label}
                selected={settings.modelOverride ?? ""}
              />
            ))}
            <SubmitInline label="Salvar modelo" />
          </form>
        </Card>
      </div>

      {/* Instruções extras */}
      <div style={{ padding: "14px 20px 0" }}>
        <Card pad={16}>
          <SubLabel
            title="Instruções adicionais"
            hint="Regras extras que devem entrar em toda conversa."
          />
          <InlineEditInput
            initialValue={settings.customInstructions ?? ""}
            action={patchAiSettings}
            fieldName="customInstructions"
            placeholder="Ex: Nunca proponha ideias que custem mais de R$ 200 sem perguntar antes. Sempre cite valor BRL com 'R$ X,XX'."
            fontSize={13}
            color="var(--muted-d)"
            italic
            multiline
          />
        </Card>
      </div>

      {/* Memória — atalhos */}
      <div style={{ padding: "14px 20px 20px" }}>
        <Card pad={16}>
          <SubLabel
            title="Memória"
            hint="A AP carrega as últimas 20 memórias no contexto. Você pode revisar todas e apagar via chat: 'consultar memórias' + 'esquecer memória X'."
          />
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              justifyContent: "space-between",
              marginTop: 8,
            }}
          >
            <div className="ap-num" style={{ fontSize: 26, color: "var(--accent)" }}>
              {memCount}
            </div>
            <Link
              href="/chat"
              style={{
                fontSize: 11,
                color: "var(--accent)",
                fontWeight: 700,
                textDecoration: "none",
              }}
            >
              ir pro chat →
            </Link>
          </div>
          <div style={{ fontSize: 10.5, color: "var(--muted)", marginTop: 2 }}>
            memórias salvas
          </div>
        </Card>
      </div>
    </ScreenShell>
  );
}

function SubLabel({ title, hint }: { title: string; hint?: string }) {
  return (
    <div>
      <div
        style={{
          fontSize: 11,
          fontWeight: 800,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: "var(--accent)",
        }}
      >
        {title}
      </div>
      {hint && (
        <div
          style={{
            fontSize: 11.5,
            color: "var(--muted-d)",
            marginTop: 4,
            lineHeight: 1.4,
          }}
        >
          {hint}
        </div>
      )}
    </div>
  );
}

function RadioRow({
  name,
  value,
  label,
  hint,
  selected,
}: {
  name: string;
  value: string;
  label: string;
  hint?: string;
  selected: string | null;
}) {
  const isActive = (selected ?? "") === value;
  return (
    <label
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 10,
        padding: "10px 12px",
        borderRadius: 10,
        background: isActive ? "var(--card2)" : "transparent",
        border: isActive ? "1px solid var(--accent)" : "0.5px solid var(--line-d)",
        cursor: "pointer",
      }}
    >
      <input
        type="radio"
        name={name}
        value={value}
        defaultChecked={isActive}
        style={{ accentColor: "var(--accent)", marginTop: 3 }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 700, color: "var(--ink)" }}>{label}</div>
        {hint && (
          <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>{hint}</div>
        )}
      </div>
    </label>
  );
}

function ToggleRow({
  label,
  hint,
  name,
  value,
}: {
  label: string;
  hint: string;
  name: string;
  value: boolean;
}) {
  return (
    <form
      action={patchAiSettings}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "10px 0",
        borderTop: "0.5px solid var(--line-d)",
      }}
    >
      <input type="hidden" name={`_present_${name}`} value="1" />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 700 }}>{label}</div>
        <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>{hint}</div>
      </div>
      <label
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          fontSize: 12,
          fontWeight: 600,
          color: value ? "var(--accent)" : "var(--muted)",
        }}
      >
        <input
          type="checkbox"
          name={name}
          defaultChecked={value}
          style={{ accentColor: "var(--accent)", width: 18, height: 18 }}
        />
        {value ? "ligado" : "desligado"}
      </label>
      <button
        type="submit"
        style={{
          padding: "5px 12px",
          borderRadius: 8,
          background: "var(--card2)",
          color: "var(--ink)",
          border: "0.5px solid var(--line-d)",
          fontSize: 11,
          fontWeight: 700,
          cursor: "pointer",
        }}
      >
        salvar
      </button>
    </form>
  );
}

function SubmitInline({ label }: { label: string }) {
  return (
    <button
      type="submit"
      style={{
        marginTop: 4,
        padding: "8px 14px",
        borderRadius: 10,
        background: "var(--accent)",
        color: "var(--accent-on)",
        border: "none",
        fontSize: 12,
        fontWeight: 700,
        cursor: "pointer",
        alignSelf: "flex-start",
      }}
    >
      {label}
    </button>
  );
}
