"use client";

import { useState, useTransition } from "react";

import { Card } from "@/components/ap/atoms";
import { CategoryBulkPicker } from "@/components/category-bulk-picker";
import type { CategoryOption } from "@/components/category-select";

import {
  clearRecurringMocks,
  createRecurringPayment,
  deleteRecurringPayment,
  markRecurringPaid,
  seedRecurringMocks,
  unmarkRecurringPaid,
  updateRecurringPayment,
  type RecurringFreq,
} from "@/app/actions/recurring-payments";
import { formatPeriod, type UrgencyLevel } from "@/lib/recurring-payments";

type Account = { id: string; name: string; type: string };

type PaymentRecord = {
  id: string;
  period: string;
  paidOn: string | null;
  paidAmount: string | null;
  notes: string | null;
};

type Payment = {
  id: string;
  name: string;
  frequency: RecurringFreq;
  dueDay: number;
  dueMonth: number | null;
  expectedAmount: string | null;
  bankAccountId: string | null;
  categoryId: string | null;
  notes: string | null;
  isActive: boolean;
  currentPeriod: string;
  currentStatus: "paid" | "due" | "overdue";
  currentUrgency: UrgencyLevel;
  currentDueDate: string;
  currentDaysUntilDue: number;
  records: PaymentRecord[];
};

export function RecurringClient({
  monthly,
  yearly,
  inactive,
  focusMonth,
  focusYear,
  accounts,
  categoryOptions,
}: {
  monthly: Payment[];
  yearly: Payment[];
  inactive: Payment[];
  focusMonth: string;
  focusYear: number;
  accounts: Account[];
  categoryOptions: CategoryOption[];
}) {
  const [hasMocks, setHasMocks] = useState(
    [...monthly, ...yearly, ...inactive].some((p) => p.name.includes("(demo)"))
  );

  return (
    <div style={{ padding: "10px 20px 24px", display: "flex", flexDirection: "column", gap: 18 }}>
      <NewPaymentForm accounts={accounts} categoryOptions={categoryOptions} />

      {/* MENSAIS — depende do mês focado */}
      <section>
        <SectionHeader
          title={`Mensais · ${formatMonthLabel(focusMonth)}`}
          count={monthly.length}
        />
        {monthly.length === 0 ? (
          <EmptyHint text="Nenhum pagamento mensal cadastrado." />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {monthly.map((p) => (
              <PaymentRow
                key={p.id}
                payment={p}
                accounts={accounts}
                categoryOptions={categoryOptions}
              />
            ))}
          </div>
        )}
      </section>

      {/* ANUAIS — sempre visíveis */}
      <section>
        <SectionHeader title={`Anuais · ${focusYear}`} count={yearly.length} />
        {yearly.length === 0 ? (
          <EmptyHint text="Nenhum pagamento anual cadastrado." />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {yearly.map((p) => (
              <PaymentRow
                key={p.id}
                payment={p}
                accounts={accounts}
                categoryOptions={categoryOptions}
              />
            ))}
          </div>
        )}
      </section>

      {inactive.length > 0 && (
        <details>
          <summary
            style={{
              cursor: "pointer",
              listStyle: "none",
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              color: "var(--muted)",
              padding: "4px 0",
            }}
          >
            + {inactive.length} pausado{inactive.length === 1 ? "" : "s"}
          </summary>
          <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 8 }}>
            {inactive.map((p) => (
              <PaymentRow
                key={p.id}
                payment={p}
                accounts={accounts}
                categoryOptions={categoryOptions}
                dimmed
              />
            ))}
          </div>
        </details>
      )}

      {/* Botão de mocks pra teste */}
      <MockSection
        hasMocks={hasMocks}
        onChange={(v) => setHasMocks(v)}
      />
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Linha compacta — caber 20+ na tela
// ────────────────────────────────────────────────────────────

function PaymentRow({
  payment,
  accounts,
  categoryOptions,
  dimmed,
}: {
  payment: Payment;
  accounts: Account[];
  categoryOptions: CategoryOption[];
  dimmed?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [isPending, startTransition] = useTransition();

  const color = urgencyColor(payment.currentUrgency);
  const dueDate = new Date(payment.currentDueDate + "T00:00:00");

  function markPaid() {
    startTransition(async () => {
      await markRecurringPaid({
        paymentId: payment.id,
        period: payment.currentPeriod,
        paidOn: new Date().toISOString().slice(0, 10),
      });
    });
  }
  function unmark() {
    if (!confirm(`Desfazer "${payment.name}" em ${formatPeriod(payment.currentPeriod)}?`)) return;
    startTransition(async () => {
      await unmarkRecurringPaid(payment.id, payment.currentPeriod);
    });
  }
  function toggleActive() {
    startTransition(async () => {
      await updateRecurringPayment(payment.id, { isActive: !payment.isActive });
    });
  }
  function del() {
    if (!confirm(`Excluir "${payment.name}" e o histórico?`)) return;
    startTransition(async () => {
      await deleteRecurringPayment(payment.id);
    });
  }

  return (
    <div
      style={{
        background: "var(--card)",
        borderRadius: 10,
        borderLeft: `3px solid ${color}`,
        opacity: dimmed ? 0.55 : 1,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "8px 12px",
          minHeight: 44,
        }}
      >
      {/* Status check button — pequeno mas clicável */}
      <CheckButton
        urgency={payment.currentUrgency}
        isPaid={payment.currentStatus === "paid"}
        isPending={isPending}
        onClick={payment.currentStatus === "paid" ? unmark : markPaid}
      />

      {/* Conteúdo central */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        style={{
          flex: 1,
          minWidth: 0,
          background: "transparent",
          border: "none",
          textAlign: "left",
          cursor: "pointer",
          padding: 0,
          fontFamily: "inherit",
          color: "inherit",
        }}
      >
        <div
          style={{
            fontSize: 12.5,
            fontWeight: payment.currentStatus === "paid" ? 500 : 700,
            color: payment.currentStatus === "paid" ? "var(--muted-d)" : "var(--ink)",
            textDecoration: payment.currentStatus === "paid" ? "line-through" : "none",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {payment.name}
        </div>
        <div style={{ fontSize: 10.5, color: "var(--muted)", marginTop: 1 }}>
          {dueDate.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }).replace(".", "")}
          {payment.currentStatus !== "paid" && (
            <span style={{ color, fontWeight: 700 }}>
              {" "}
              {payment.currentDaysUntilDue === 0
                ? "· hoje"
                : payment.currentDaysUntilDue > 0
                  ? `· em ${payment.currentDaysUntilDue}d`
                  : `· ${Math.abs(payment.currentDaysUntilDue)}d atrasado`}
            </span>
          )}
        </div>
      </button>

      {/* Valor */}
      {payment.expectedAmount && (
        <span
          className="ap-num"
          style={{
            fontSize: 12.5,
            fontWeight: 700,
            color: payment.currentStatus === "paid" ? "var(--muted)" : "var(--ink-d)",
            flexShrink: 0,
            textAlign: "right",
            minWidth: 80,
          }}
        >
          R$ {formatBRL(parseFloat(payment.expectedAmount))}
        </span>
      )}

      {/* Menu dot */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setExpanded((v) => !v);
        }}
        title="Mais opções"
        style={{
          width: 22,
          height: 22,
          borderRadius: 11,
          background: "transparent",
          color: "var(--muted)",
          border: "none",
          fontSize: 14,
          cursor: "pointer",
          flexShrink: 0,
          padding: 0,
          lineHeight: 1,
        }}
      >
        ⋯
      </button>

      </div>
      {expanded && (
        <ExpandedRowDetails
          payment={payment}
          accounts={accounts}
          categoryOptions={categoryOptions}
          editing={editing}
          setEditing={setEditing}
          onToggleActive={toggleActive}
          onDelete={del}
        />
      )}
    </div>
  );
}

function ExpandedRowDetails({
  payment,
  accounts,
  categoryOptions,
  editing,
  setEditing,
  onToggleActive,
  onDelete,
}: {
  payment: Payment;
  accounts: Account[];
  categoryOptions: CategoryOption[];
  editing: boolean;
  setEditing: (v: boolean) => void;
  onToggleActive: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      style={{
        background: "var(--card2)",
        padding: 10,
        borderTop: "0.5px solid var(--line-d)",
      }}
    >
      {editing ? (
        <EditForm
          payment={payment}
          accounts={accounts}
          categoryOptions={categoryOptions}
          onClose={() => setEditing(false)}
        />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {payment.records.length > 0 && (
            <div>
              <div
                style={{
                  fontSize: 9.5,
                  fontWeight: 700,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: "var(--muted)",
                  marginBottom: 4,
                }}
              >
                histórico ({payment.records.length})
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                {payment.records.slice(0, 6).map((r) => (
                  <div
                    key={r.id}
                    style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}
                  >
                    <span style={{ color: "var(--muted-d)" }}>{formatPeriod(r.period)}</span>
                    <span style={{ color: "var(--muted)" }}>
                      {r.paidOn &&
                        new Date(r.paidOn + "T00:00:00").toLocaleDateString("pt-BR", {
                          day: "2-digit",
                          month: "short",
                        }).replace(".", "")}
                      {r.paidAmount && ` · R$ ${formatBRL(parseFloat(r.paidAmount))}`}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div style={{ display: "flex", gap: 6 }}>
            <button type="button" onClick={() => setEditing(true)} style={ghostBtnStyle}>
              editar
            </button>
            <button type="button" onClick={onToggleActive} style={ghostBtnStyle}>
              {payment.isActive ? "pausar" : "reativar"}
            </button>
            <button
              type="button"
              onClick={onDelete}
              style={{ ...ghostBtnStyle, color: "var(--alert)", borderColor: "var(--alert)" }}
            >
              excluir
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Botão check (icon-only, pequeno)
// ────────────────────────────────────────────────────────────

function CheckButton({
  urgency,
  isPaid,
  isPending,
  onClick,
}: {
  urgency: UrgencyLevel;
  isPaid: boolean;
  isPending: boolean;
  onClick: () => void;
}) {
  const color = urgencyColor(urgency);
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isPending}
      title={isPaid ? "Desfazer pago" : "Marcar como pago"}
      style={{
        width: 28,
        height: 28,
        borderRadius: 14,
        background: isPaid ? "var(--ok)" : "transparent",
        color: isPaid ? "var(--accent-on)" : color,
        border: isPaid ? "none" : `1.5px solid ${color}`,
        cursor: "pointer",
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 14,
        fontWeight: 800,
        padding: 0,
        lineHeight: 1,
      }}
    >
      {isPaid ? "✓" : ""}
    </button>
  );
}

// ────────────────────────────────────────────────────────────
// Section header + Empty hint + Mock section
// ────────────────────────────────────────────────────────────

function SectionHeader({ title, count }: { title: string; count: number }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        marginBottom: 8,
      }}
    >
      <span style={{ fontSize: 13, fontWeight: 700, color: "var(--ink)" }}>{title}</span>
      <span
        style={{
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          color: "var(--muted)",
        }}
      >
        {count}
      </span>
      <div style={{ flex: 1, height: 0.5, background: "var(--line-d)" }} />
    </div>
  );
}

function EmptyHint({ text }: { text: string }) {
  return (
    <div
      style={{
        padding: "10px 12px",
        fontSize: 11.5,
        color: "var(--muted)",
        fontStyle: "italic",
        textAlign: "center",
      }}
    >
      {text}
    </div>
  );
}

function MockSection({
  hasMocks,
  onChange,
}: {
  hasMocks: boolean;
  onChange: (v: boolean) => void;
}) {
  const [isPending, startTransition] = useTransition();
  function seed() {
    startTransition(async () => {
      await seedRecurringMocks();
      onChange(true);
    });
  }
  function clear() {
    if (!confirm("Remover todos os pagamentos marcados como (demo)?")) return;
    startTransition(async () => {
      await clearRecurringMocks();
      onChange(false);
    });
  }
  return (
    <Card pad={12}>
      <div
        style={{
          fontSize: 10.5,
          fontWeight: 700,
          letterSpacing: "0.06em",
          color: "var(--muted)",
          marginBottom: 6,
        }}
      >
        TESTE / DEMO
      </div>
      <div style={{ fontSize: 11.5, color: "var(--muted-d)", lineHeight: 1.4, marginBottom: 8 }}>
        Popula 15 mensais + 5 anuais marcados como <code>(demo)</code> pra testar
        densidade. Remove só os <code>(demo)</code>, mantém o resto.
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        <button
          type="button"
          onClick={seed}
          disabled={isPending || hasMocks}
          style={primaryBtnStyle}
        >
          {hasMocks ? "Já populado" : "Popular com mocks"}
        </button>
        {hasMocks && (
          <button
            type="button"
            onClick={clear}
            disabled={isPending}
            style={{ ...ghostBtnStyle, color: "var(--alert)", borderColor: "var(--alert)" }}
          >
            Remover mocks
          </button>
        )}
      </div>
    </Card>
  );
}

// ────────────────────────────────────────────────────────────
// New payment form (collapsed)
// ────────────────────────────────────────────────────────────

function NewPaymentForm({
  accounts,
  categoryOptions,
}: {
  accounts: Account[];
  categoryOptions: CategoryOption[];
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [frequency, setFrequency] = useState<RecurringFreq>("monthly");
  const [dueDay, setDueDay] = useState("10");
  const [dueMonth, setDueMonth] = useState("1");
  const [expectedAmount, setExpectedAmount] = useState("");
  const [bankAccountId, setBankAccountId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function save() {
    setError(null);
    if (!name.trim()) {
      setError("Nome obrigatório");
      return;
    }
    const day = parseInt(dueDay, 10);
    if (isNaN(day) || day < 1 || day > 31) {
      setError("Dia inválido (1-31)");
      return;
    }
    const month = frequency === "yearly" ? parseInt(dueMonth, 10) : null;
    if (frequency === "yearly" && (isNaN(month!) || month! < 1 || month! > 12)) {
      setError("Mês inválido");
      return;
    }
    const amountNorm = expectedAmount
      ? expectedAmount.replace(/\./g, "").replace(",", ".")
      : null;
    startTransition(async () => {
      try {
        await createRecurringPayment({
          name,
          frequency,
          dueDay: day,
          dueMonth: month,
          expectedAmount: amountNorm,
          bankAccountId: bankAccountId || null,
          categoryId: categoryId || null,
          notes: notes || null,
        });
        setName("");
        setExpectedAmount("");
        setNotes("");
        setOpen(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{
          padding: "10px 14px",
          borderRadius: 10,
          background: "var(--card)",
          color: "var(--ink-d)",
          border: "1px dashed var(--line-d)",
          fontSize: 12.5,
          fontWeight: 600,
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        + Cadastrar pagamento recorrente
      </button>
    );
  }

  return (
    <Card pad={14} raised>
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: "0.04em",
          color: "var(--muted)",
          marginBottom: 8,
        }}
      >
        NOVO PAGAMENTO RECORRENTE
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nome (ex: IPVA Onix, Gás, Internet)"
          style={inputStyle}
        />
        <div style={{ display: "flex", gap: 6 }}>
          {(["monthly", "yearly"] as RecurringFreq[]).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFrequency(f)}
              style={{
                flex: 1,
                padding: "7px 14px",
                borderRadius: 8,
                border:
                  frequency === f
                    ? "1px solid var(--accent)"
                    : "0.5px solid var(--line-d)",
                background:
                  frequency === f
                    ? "color-mix(in oklab, var(--accent) 18%, var(--card2))"
                    : "var(--card2)",
                color: frequency === f ? "var(--accent)" : "var(--muted-d)",
                fontSize: 12,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              {f === "monthly" ? "Mensal" : "Anual"}
            </button>
          ))}
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: frequency === "yearly" ? "1fr 1fr 1fr" : "1fr 1fr",
            gap: 6,
          }}
        >
          {frequency === "yearly" && (
            <select
              value={dueMonth}
              onChange={(e) => setDueMonth(e.target.value)}
              style={inputStyle}
            >
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                <option key={m} value={m}>
                  {new Date(2026, m - 1, 1)
                    .toLocaleDateString("pt-BR", { month: "short" })
                    .replace(".", "")}
                </option>
              ))}
            </select>
          )}
          <input
            value={dueDay}
            onChange={(e) => setDueDay(e.target.value)}
            type="number"
            min="1"
            max="31"
            placeholder="Dia"
            style={inputStyle}
          />
          <input
            value={expectedAmount}
            onChange={(e) => setExpectedAmount(e.target.value)}
            placeholder="Valor (R$)"
            inputMode="decimal"
            style={inputStyle}
          />
        </div>
        {accounts.length > 0 && (
          <select
            value={bankAccountId}
            onChange={(e) => setBankAccountId(e.target.value)}
            style={inputStyle}
          >
            <option value="">(sem conta)</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        )}
        <CategoryBulkPicker
          options={categoryOptions}
          value={categoryId}
          onChange={setCategoryId}
          buttonContrast={false}
          placeholder="(sem categoria)"
        />
        <input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Observação (opcional)"
          style={inputStyle}
        />
        {error && <div style={{ fontSize: 11.5, color: "var(--alert)" }}>{error}</div>}
        <div style={{ display: "flex", gap: 6 }}>
          <button type="button" onClick={save} disabled={isPending} style={primaryBtnStyle}>
            {isPending ? "Salvando…" : "Cadastrar"}
          </button>
          <button type="button" onClick={() => setOpen(false)} style={ghostBtnStyle}>
            Cancelar
          </button>
        </div>
      </div>
    </Card>
  );
}

// ────────────────────────────────────────────────────────────
// Edit form inline
// ────────────────────────────────────────────────────────────

function EditForm({
  payment,
  accounts,
  categoryOptions,
  onClose,
}: {
  payment: Payment;
  accounts: Account[];
  categoryOptions: CategoryOption[];
  onClose: () => void;
}) {
  const [name, setName] = useState(payment.name);
  const [dueDay, setDueDay] = useState(String(payment.dueDay));
  const [dueMonth, setDueMonth] = useState(String(payment.dueMonth ?? 1));
  const [expectedAmount, setExpectedAmount] = useState(payment.expectedAmount ?? "");
  const [bankAccountId, setBankAccountId] = useState(payment.bankAccountId ?? "");
  const [categoryId, setCategoryId] = useState(payment.categoryId ?? "");
  const [notes, setNotes] = useState(payment.notes ?? "");
  const [isPending, startTransition] = useTransition();

  function save() {
    const amountNorm = expectedAmount
      ? expectedAmount.replace(/\./g, "").replace(",", ".")
      : null;
    startTransition(async () => {
      await updateRecurringPayment(payment.id, {
        name: name.trim(),
        dueDay: parseInt(dueDay, 10),
        dueMonth: payment.frequency === "yearly" ? parseInt(dueMonth, 10) : null,
        expectedAmount: amountNorm,
        bankAccountId: bankAccountId || null,
        categoryId: categoryId || null,
        notes: notes.trim() || null,
      });
      onClose();
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <input value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} placeholder="Nome" />
      <div
        style={{
          display: "grid",
          gridTemplateColumns: payment.frequency === "yearly" ? "1fr 1fr" : "1fr",
          gap: 6,
        }}
      >
        {payment.frequency === "yearly" && (
          <select value={dueMonth} onChange={(e) => setDueMonth(e.target.value)} style={inputStyle}>
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
              <option key={m} value={m}>
                {new Date(2026, m - 1, 1).toLocaleDateString("pt-BR", { month: "short" }).replace(".", "")}
              </option>
            ))}
          </select>
        )}
        <input
          value={dueDay}
          onChange={(e) => setDueDay(e.target.value)}
          type="number"
          min="1"
          max="31"
          placeholder="Dia"
          style={inputStyle}
        />
      </div>
      <input
        value={expectedAmount}
        onChange={(e) => setExpectedAmount(e.target.value)}
        placeholder="Valor (R$)"
        inputMode="decimal"
        style={inputStyle}
      />
      {accounts.length > 0 && (
        <select value={bankAccountId} onChange={(e) => setBankAccountId(e.target.value)} style={inputStyle}>
          <option value="">(sem conta)</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      )}
      <CategoryBulkPicker
        options={categoryOptions}
        value={categoryId}
        onChange={setCategoryId}
        buttonContrast={false}
        placeholder="(sem categoria)"
      />
      <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Observação" style={inputStyle} />
      <div style={{ display: "flex", gap: 6 }}>
        <button type="button" onClick={save} disabled={isPending} style={primaryBtnStyle}>
          Salvar
        </button>
        <button type="button" onClick={onClose} style={ghostBtnStyle}>
          Cancelar
        </button>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────

function urgencyColor(u: UrgencyLevel): string {
  switch (u) {
    case "paid":
      return "var(--ok)";
    case "overdue":
      return "var(--alert)";
    case "urgent":
      return "#FF8866"; // coral — atenção urgente
    case "soon":
      return "var(--accent)"; // accent lima/rosa — chegando
    case "ok":
    default:
      return "var(--muted)";
  }
}

function formatMonthLabel(yyyymm: string): string {
  const [y, m] = yyyymm.split("-").map(Number);
  return new Date(y, m - 1, 1)
    .toLocaleDateString("pt-BR", { month: "long", year: "numeric" })
    .replace(/^\w/, (c) => c.toUpperCase());
}

function formatBRL(n: number): string {
  return n.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

const inputStyle: React.CSSProperties = {
  padding: "7px 10px",
  borderRadius: 7,
  background: "var(--card2)",
  color: "var(--ink)",
  border: "0.5px solid var(--line-d)",
  fontSize: 12,
  fontFamily: "inherit",
  outline: "none",
};

const primaryBtnStyle: React.CSSProperties = {
  padding: "7px 14px",
  borderRadius: 8,
  background: "var(--accent)",
  color: "var(--accent-on)",
  border: "none",
  fontSize: 12,
  fontWeight: 700,
  cursor: "pointer",
};

const ghostBtnStyle: React.CSSProperties = {
  padding: "6px 12px",
  borderRadius: 8,
  background: "transparent",
  color: "var(--muted-d)",
  border: "0.5px solid var(--line-d)",
  fontSize: 11.5,
  fontWeight: 600,
  cursor: "pointer",
};
