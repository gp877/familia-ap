"use client";

import { useState, useTransition } from "react";

import { Card } from "@/components/ap/atoms";

import {
  createRecipient,
  createRule,
  deleteRecipient,
  deleteRule,
  sendTestEmail,
  setRuleRecipients,
  updateNotificationSettings,
  updateRuleActive,
  updateRuleFrequency,
  type RuleFrequency,
  type RuleType,
} from "@/app/actions/notifications";

type Rule = {
  id: string;
  type: string;
  frequency: string;
  isActive: boolean;
  lastSentAt: string | null;
  recipientIds: string[];
};

type Recipient = { id: string; email: string; name: string | null };

const TYPE_LABEL: Record<string, { title: string; desc: string; icon: string }> = {
  missing_statement: {
    title: "Extrato faltando",
    desc: "Lembra se você não enviou ainda o extrato do mês.",
    icon: "📥",
  },
  missing_invoice: {
    title: "Fatura faltando",
    desc: "Lembra se você não enviou ainda a fatura do cartão do mês.",
    icon: "💳",
  },
  pending_classifications: {
    title: "Lançamentos pendentes",
    desc: "Alerta quando >10 transações ficam sem categorizar por >5 dias.",
    icon: "🏷️",
  },
  pending_recurring_payments: {
    title: "Pagamentos recorrentes pendentes",
    desc: "Avisa pagamentos recorrentes (mensais e anuais) ainda não marcados como pagos.",
    icon: "🔁",
  },
  weekly_digest: {
    title: "Resumo semanal",
    desc: "Recap dos últimos 7 dias: total gasto, top categorias, pendentes.",
    icon: "📊",
  },
};

const FREQ_LABEL: Record<string, string> = {
  daily: "todo dia",
  weekly_monday: "toda 2ª-feira",
  weekly_friday: "toda 6ª-feira",
  weekly_sunday: "todo domingo",
  monthly_first: "dia 1º do mês",
};

type MasterSettings = {
  emailEnabled: boolean;
  inAppEnabled: boolean;
  perTypeSettings: Record<string, { email?: boolean; inApp?: boolean }>;
};

export function NotificationsClient({
  rules,
  recipients,
  settings,
}: {
  rules: Rule[];
  recipients: Recipient[];
  settings: MasterSettings;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18, padding: "14px 20px 24px" }}>
      <MasterTogglesSection settings={settings} />
      <TestSection recipients={recipients} />
      <RecipientsSection recipients={recipients} />
      <RulesSection rules={rules} recipients={recipients} />
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Master toggles — liga/desliga email + in-app por household
// ────────────────────────────────────────────────────────────
function MasterTogglesSection({ settings }: { settings: MasterSettings }) {
  const [isPending, startTransition] = useTransition();

  function toggleEmail() {
    startTransition(async () => {
      await updateNotificationSettings({ emailEnabled: !settings.emailEnabled });
    });
  }
  function toggleInApp() {
    startTransition(async () => {
      await updateNotificationSettings({ inAppEnabled: !settings.inAppEnabled });
    });
  }

  return (
    <Card pad={14} raised>
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: "0.04em",
          color: "var(--accent)",
          marginBottom: 8,
        }}
      >
        CANAIS DE NOTIFICAÇÃO
      </div>
      <div style={{ fontSize: 12, color: "var(--muted-d)", lineHeight: 1.5, marginBottom: 10 }}>
        Liga/desliga cada canal globalmente. Se você desligar o email,
        nenhuma regra envia email (mesmo as ativas) — viram só in-app.
        Mesma lógica pra in-app.
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <ToggleRow
          label="E-mail"
          desc="Envia pra destinatários nas regras"
          checked={settings.emailEnabled}
          onChange={toggleEmail}
          disabled={isPending}
        />
        <ToggleRow
          label="Sino in-app"
          desc="Notificações aparecem no sino do topo"
          checked={settings.inAppEnabled}
          onChange={toggleInApp}
          disabled={isPending}
        />
      </div>
    </Card>
  );
}

function ToggleRow({
  label,
  desc,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  desc: string;
  checked: boolean;
  onChange: () => void;
  disabled: boolean;
}) {
  return (
    <label
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "8px 12px",
        background: checked ? "color-mix(in oklab, var(--ok) 8%, var(--card2))" : "var(--card2)",
        borderRadius: 10,
        cursor: "pointer",
      }}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        disabled={disabled}
        style={{ accentColor: "var(--accent)", width: 18, height: 18 }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "var(--ink)" }}>{label}</div>
        <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 1 }}>{desc}</div>
      </div>
      <span
        style={{
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          color: checked ? "var(--ok)" : "var(--muted)",
        }}
      >
        {checked ? "ligado" : "desligado"}
      </span>
    </label>
  );
}

// ────────────────────────────────────────────────────────────
// Botão de teste — manda um email simples sem esperar cron
// ────────────────────────────────────────────────────────────
function TestSection({ recipients }: { recipients: Recipient[] }) {
  const [target, setTarget] = useState<string>("");
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<
    | { ok: true; to: string; providerId?: string }
    | { ok: false; error: string }
    | null
  >(null);

  function fire() {
    setResult(null);
    startTransition(async () => {
      try {
        const r = await sendTestEmail(target || undefined);
        setResult({ ok: true, to: r.to, providerId: r.providerId });
      } catch (err) {
        setResult({ ok: false, error: err instanceof Error ? err.message : String(err) });
      }
    });
  }

  return (
    <Card pad={14}>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.04em", color: "var(--accent)", marginBottom: 6 }}>
        TESTE DE CONFIGURAÇÃO
      </div>
      <div style={{ fontSize: 12, color: "var(--muted-d)", lineHeight: 1.5, marginBottom: 10 }}>
        Manda um e-mail simples agora pra confirmar que o Resend está
        configurado. Default é seu e-mail logado; pode escolher outro
        destinatário.
      </div>
      <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
        <select
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          disabled={isPending}
          style={selectStyle}
        >
          <option value="">(seu e-mail logado)</option>
          {recipients.map((r) => (
            <option key={r.id} value={r.email}>
              {r.name ? `${r.name} (${r.email})` : r.email}
            </option>
          ))}
        </select>
        <button type="button" onClick={fire} disabled={isPending} style={primaryBtnStyle}>
          {isPending ? "Enviando…" : "Enviar e-mail de teste"}
        </button>
      </div>
      {result && (
        <div
          style={{
            marginTop: 10,
            padding: "8px 12px",
            borderRadius: 8,
            background: result.ok
              ? "color-mix(in oklab, var(--ok) 14%, transparent)"
              : "color-mix(in oklab, var(--alert) 14%, transparent)",
            color: result.ok ? "var(--ok)" : "var(--alert)",
            fontSize: 11.5,
          }}
        >
          {result.ok
            ? `✓ Enviado pra ${result.to}${result.providerId ? ` (id: ${result.providerId.slice(0, 8)}…)` : ""}`
            : `✗ ${result.error}`}
        </div>
      )}
    </Card>
  );
}

// ────────────────────────────────────────────────────────────
// Destinatários
// ────────────────────────────────────────────────────────────

function RecipientsSection({ recipients }: { recipients: Recipient[] }) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function add() {
    setError(null);
    startTransition(async () => {
      try {
        await createRecipient({ email, name: name || null });
        setEmail("");
        setName("");
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    });
  }

  function remove(id: string) {
    if (!confirm("Remover este destinatário? Vai desvincular de todas as regras.")) return;
    startTransition(async () => {
      await deleteRecipient(id);
    });
  }

  return (
    <div>
      <h2 style={sectionTitleStyle}>Destinatários</h2>
      <p style={sectionDescStyle}>
        E-mails que vão receber as notificações. Pode ser o seu próprio e-mail
        ou de terceiros (ex: contador).
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {recipients.map((r) => (
          <Card key={r.id} pad={12}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600 }}>
                  {r.name || r.email}
                </div>
                {r.name && (
                  <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>
                    {r.email}
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={() => remove(r.id)}
                disabled={isPending}
                style={removeBtnStyle}
                aria-label="Remover"
              >
                ×
              </button>
            </div>
          </Card>
        ))}

        {recipients.length === 0 && (
          <div style={emptyHintStyle}>Nenhum destinatário cadastrado.</div>
        )}
      </div>

      <Card pad={12} raised>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.04em", color: "var(--muted)", marginBottom: 8 }}>
          ADICIONAR NOVO
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="email@exemplo.com"
            type="email"
            style={inputStyle}
          />
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nome (opcional)"
            style={inputStyle}
          />
          {error && (
            <div style={{ fontSize: 11.5, color: "var(--alert)" }}>{error}</div>
          )}
          <button
            type="button"
            onClick={add}
            disabled={isPending || !email.trim()}
            style={primaryBtnStyle}
          >
            + adicionar
          </button>
        </div>
      </Card>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Regras
// ────────────────────────────────────────────────────────────

function RulesSection({ rules, recipients }: { rules: Rule[]; recipients: Recipient[] }) {
  const existingTypes = new Set(rules.map((r) => r.type));
  const availableTypes = Object.keys(TYPE_LABEL).filter((t) => !existingTypes.has(t));

  return (
    <div>
      <h2 style={sectionTitleStyle}>Regras de notificação</h2>
      <p style={sectionDescStyle}>
        Cada regra dispara um tipo de lembrete numa frequência. Crie uma de
        cada tipo que faz sentido pra você.
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {rules.map((r) => (
          <RuleCard key={r.id} rule={r} recipients={recipients} />
        ))}

        {rules.length === 0 && (
          <div style={emptyHintStyle}>Nenhuma regra criada ainda.</div>
        )}
      </div>

      {availableTypes.length > 0 && (
        <CreateRuleSection
          availableTypes={availableTypes as RuleType[]}
          recipients={recipients}
        />
      )}
    </div>
  );
}

function RuleCard({ rule, recipients }: { rule: Rule; recipients: Recipient[] }) {
  const [isPending, startTransition] = useTransition();
  const [editingRecips, setEditingRecips] = useState(false);
  const [selectedRecips, setSelectedRecips] = useState<string[]>(rule.recipientIds);

  const meta = TYPE_LABEL[rule.type];

  function toggle() {
    startTransition(async () => {
      await updateRuleActive(rule.id, !rule.isActive);
    });
  }
  function changeFreq(freq: RuleFrequency) {
    startTransition(async () => {
      await updateRuleFrequency(rule.id, freq);
    });
  }
  function del() {
    if (!confirm(`Remover a regra "${meta?.title}"?`)) return;
    startTransition(async () => {
      await deleteRule(rule.id);
    });
  }
  function saveRecips() {
    startTransition(async () => {
      await setRuleRecipients(rule.id, selectedRecips);
      setEditingRecips(false);
    });
  }

  const ruleRecipObjs = rule.recipientIds
    .map((id) => recipients.find((r) => r.id === id))
    .filter(Boolean) as Recipient[];

  return (
    <Card pad={14} raised={rule.isActive}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
        <span style={{ fontSize: 18 }}>{meta?.icon}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 14,
              fontWeight: 700,
              color: rule.isActive ? "var(--ink)" : "var(--muted)",
            }}
          >
            {meta?.title}
          </div>
          <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>
            {meta?.desc}
          </div>
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={rule.isActive}
            onChange={toggle}
            disabled={isPending}
            style={{ accentColor: "var(--accent)" }}
          />
          <span style={{ fontSize: 11, fontWeight: 600, color: rule.isActive ? "var(--accent)" : "var(--muted)" }}>
            {rule.isActive ? "ativa" : "pausada"}
          </span>
        </label>
      </div>

      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", fontSize: 12 }}>
        <span style={labelStyle}>quando:</span>
        <select
          value={rule.frequency}
          onChange={(e) => changeFreq(e.target.value as RuleFrequency)}
          disabled={isPending}
          style={selectStyle}
        >
          {Object.entries(FREQ_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </div>

      <div style={{ marginTop: 10 }}>
        <div style={{ ...labelStyle, marginBottom: 4 }}>destinatários:</div>
        {!editingRecips ? (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            {ruleRecipObjs.length === 0 ? (
              <span style={{ fontSize: 11.5, color: "var(--alert)" }}>
                nenhum (não vai disparar)
              </span>
            ) : (
              ruleRecipObjs.map((r) => (
                <span key={r.id} style={chipStyle}>
                  {r.name || r.email}
                </span>
              ))
            )}
            <button
              type="button"
              onClick={() => setEditingRecips(true)}
              style={linkBtnStyle}
            >
              editar
            </button>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {recipients.map((r) => {
              const checked = selectedRecips.includes(r.id);
              return (
                <label
                  key={r.id}
                  style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, cursor: "pointer" }}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => {
                      setSelectedRecips((arr) =>
                        e.target.checked ? [...arr, r.id] : arr.filter((x) => x !== r.id)
                      );
                    }}
                    style={{ accentColor: "var(--accent)" }}
                  />
                  {r.name || r.email}
                </label>
              );
            })}
            {recipients.length === 0 && (
              <span style={{ fontSize: 11.5, color: "var(--muted)" }}>
                adicione destinatários acima primeiro
              </span>
            )}
            <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
              <button type="button" onClick={saveRecips} disabled={isPending} style={primaryBtnStyle}>
                salvar
              </button>
              <button
                type="button"
                onClick={() => {
                  setEditingRecips(false);
                  setSelectedRecips(rule.recipientIds);
                }}
                style={ghostBtnStyle}
              >
                cancelar
              </button>
            </div>
          </div>
        )}
      </div>

      <div style={{ marginTop: 10, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontSize: 10.5, color: "var(--muted)" }}>
          {rule.lastSentAt
            ? `enviada por último em ${new Date(rule.lastSentAt).toLocaleDateString("pt-BR")}`
            : "nunca disparou"}
        </div>
        <button type="button" onClick={del} disabled={isPending} style={deleteBtnStyle}>
          remover
        </button>
      </div>
    </Card>
  );
}

function CreateRuleSection({
  availableTypes,
  recipients,
}: {
  availableTypes: RuleType[];
  recipients: Recipient[];
}) {
  const [type, setType] = useState<RuleType>(availableTypes[0]);
  const [frequency, setFrequency] = useState<RuleFrequency>("weekly_monday");
  const [recipIds, setRecipIds] = useState<string[]>(recipients.map((r) => r.id));
  const [isPending, startTransition] = useTransition();

  function create() {
    startTransition(async () => {
      await createRule({ type, frequency, recipientIds: recipIds });
    });
  }

  return (
    <Card pad={14} style={{ marginTop: 10 }}>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.04em", color: "var(--muted)", marginBottom: 8 }}>
        CRIAR NOVA REGRA
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <select
          value={type}
          onChange={(e) => setType(e.target.value as RuleType)}
          style={selectStyle}
        >
          {availableTypes.map((t) => (
            <option key={t} value={t}>
              {TYPE_LABEL[t].icon} {TYPE_LABEL[t].title}
            </option>
          ))}
        </select>
        <select
          value={frequency}
          onChange={(e) => setFrequency(e.target.value as RuleFrequency)}
          style={selectStyle}
        >
          {Object.entries(FREQ_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={create}
          disabled={isPending}
          style={primaryBtnStyle}
        >
          + criar regra
        </button>
      </div>
    </Card>
  );
}

// ────────────────────────────────────────────────────────────
// Styles
// ────────────────────────────────────────────────────────────

const sectionTitleStyle: React.CSSProperties = {
  fontSize: 15,
  fontWeight: 700,
  color: "var(--ink)",
  marginBottom: 4,
};

const sectionDescStyle: React.CSSProperties = {
  fontSize: 12,
  color: "var(--muted)",
  marginBottom: 10,
  lineHeight: 1.5,
};

const emptyHintStyle: React.CSSProperties = {
  fontSize: 12.5,
  color: "var(--muted)",
  fontStyle: "italic",
  padding: 14,
  textAlign: "center",
};

const labelStyle: React.CSSProperties = {
  fontSize: 10.5,
  fontWeight: 600,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: "var(--muted)",
};

const inputStyle: React.CSSProperties = {
  padding: "8px 12px",
  borderRadius: 8,
  background: "var(--card2)",
  color: "var(--ink)",
  border: "0.5px solid var(--line-d)",
  fontSize: 12.5,
  fontFamily: "inherit",
  outline: "none",
};

const selectStyle: React.CSSProperties = {
  padding: "8px 12px",
  borderRadius: 8,
  background: "var(--card2)",
  color: "var(--ink)",
  border: "0.5px solid var(--line-d)",
  fontSize: 12.5,
  fontWeight: 600,
  cursor: "pointer",
  fontFamily: "inherit",
};

const chipStyle: React.CSSProperties = {
  fontSize: 11,
  padding: "3px 10px",
  borderRadius: 999,
  background: "color-mix(in oklab, var(--accent) 14%, transparent)",
  color: "var(--accent)",
  fontWeight: 600,
};

const primaryBtnStyle: React.CSSProperties = {
  padding: "8px 14px",
  borderRadius: 10,
  background: "var(--accent)",
  color: "var(--accent-on)",
  border: "none",
  fontSize: 12,
  fontWeight: 700,
  cursor: "pointer",
};

const ghostBtnStyle: React.CSSProperties = {
  padding: "8px 14px",
  borderRadius: 10,
  background: "transparent",
  color: "var(--muted-d)",
  border: "0.5px solid var(--line-d)",
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
};

const linkBtnStyle: React.CSSProperties = {
  background: "transparent",
  color: "var(--accent)",
  border: "none",
  fontSize: 11,
  cursor: "pointer",
  padding: 0,
  textDecoration: "underline",
};

const removeBtnStyle: React.CSSProperties = {
  width: 26,
  height: 26,
  borderRadius: 13,
  background: "transparent",
  color: "var(--alert)",
  border: "0.5px solid var(--line-d)",
  fontSize: 14,
  cursor: "pointer",
};

const deleteBtnStyle: React.CSSProperties = {
  background: "transparent",
  color: "var(--alert)",
  border: "0.5px solid var(--alert)",
  padding: "4px 10px",
  borderRadius: 8,
  fontSize: 10.5,
  fontWeight: 600,
  cursor: "pointer",
};
