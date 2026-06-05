"use client";

import { useState, useTransition } from "react";

import { Card } from "@/components/ap/atoms";
import { CategoryBulkPicker } from "@/components/category-bulk-picker";
import type { CategoryOption } from "@/components/category-select";

import {
  createRecurringPayment,
  deleteRecurringPayment,
  markRecurringPaid,
  unmarkRecurringPaid,
  updateRecurringPayment,
  type RecurringFreq,
} from "@/app/actions/recurring-payments";
import { formatDueDate, formatPeriod } from "@/lib/recurring-payments";

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
  currentDueDate: string;
  currentDaysUntilDue: number;
  records: PaymentRecord[];
};

export function RecurringClient({
  payments,
  accounts,
  categoryOptions,
}: {
  payments: Payment[];
  accounts: Account[];
  categoryOptions: CategoryOption[];
}) {
  const active = payments.filter((p) => p.isActive);
  const inactive = payments.filter((p) => !p.isActive);

  return (
    <div style={{ padding: "14px 20px 24px", display: "flex", flexDirection: "column", gap: 18 }}>
      <NewPaymentForm accounts={accounts} categoryOptions={categoryOptions} />

      <section>
        <h2 style={sectionTitleStyle}>Ativos</h2>
        {active.length === 0 ? (
          <div style={emptyHintStyle}>Nenhum pagamento recorrente cadastrado ainda.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {active.map((p) => (
              <PaymentCard
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
        <section>
          <h2 style={{ ...sectionTitleStyle, color: "var(--muted)" }}>
            Pausados ({inactive.length})
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {inactive.map((p) => (
              <PaymentCard
                key={p.id}
                payment={p}
                accounts={accounts}
                categoryOptions={categoryOptions}
                dimmed
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// New payment form (collapsed por default)
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
      setError("Mês inválido (1-12)");
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
          padding: "12px 16px",
          borderRadius: 12,
          background: "var(--card)",
          color: "var(--ink-d)",
          border: "1px dashed var(--line-d)",
          fontSize: 13,
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
    <Card pad={16} raised>
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: "0.04em",
          color: "var(--muted)",
          marginBottom: 10,
        }}
      >
        NOVO PAGAMENTO RECORRENTE
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <Field label="Nome *">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="ex: IPVA Onix, Gás botijão, Internet"
            style={inputStyle}
          />
        </Field>

        <Field label="Frequência *">
          <div style={{ display: "flex", gap: 6 }}>
            {(["monthly", "yearly"] as RecurringFreq[]).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFrequency(f)}
                style={{
                  flex: 1,
                  padding: "8px 14px",
                  borderRadius: 8,
                  border:
                    frequency === f
                      ? "1px solid var(--accent)"
                      : "0.5px solid var(--line-d)",
                  background: frequency === f ? "color-mix(in oklab, var(--accent) 18%, var(--card2))" : "var(--card2)",
                  color: frequency === f ? "var(--accent)" : "var(--muted-d)",
                  fontSize: 12.5,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                {f === "monthly" ? "Mensal" : "Anual"}
              </button>
            ))}
          </div>
        </Field>

        <div style={{ display: "grid", gridTemplateColumns: frequency === "yearly" ? "1fr 1fr" : "1fr", gap: 10 }}>
          {frequency === "yearly" && (
            <Field label="Mês *">
              <select
                value={dueMonth}
                onChange={(e) => setDueMonth(e.target.value)}
                style={inputStyle}
              >
                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                  <option key={m} value={m}>
                    {new Date(2026, m - 1, 1).toLocaleDateString("pt-BR", { month: "long" })}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <Field label="Dia do vencimento *">
            <input
              value={dueDay}
              onChange={(e) => setDueDay(e.target.value)}
              type="number"
              min="1"
              max="31"
              style={inputStyle}
            />
          </Field>
        </div>

        <Field label="Valor esperado (R$)" hint="opcional · pode ser deixado vazio se varia">
          <input
            value={expectedAmount}
            onChange={(e) => setExpectedAmount(e.target.value)}
            placeholder="0,00"
            inputMode="decimal"
            style={inputStyle}
          />
        </Field>

        {accounts.length > 0 && (
          <Field label="Conta de débito" hint="opcional">
            <select
              value={bankAccountId}
              onChange={(e) => setBankAccountId(e.target.value)}
              style={inputStyle}
            >
              <option value="">(nenhuma)</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </Field>
        )}

        <Field label="Categoria" hint="opcional">
          <div>
            <CategoryBulkPicker
              options={categoryOptions}
              value={categoryId}
              onChange={setCategoryId}
              buttonContrast={false}
              placeholder="(nenhuma)"
            />
          </div>
        </Field>

        <Field label="Observação" hint="opcional">
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="ex: débito automático"
            style={inputStyle}
          />
        </Field>

        {error && (
          <div style={{ fontSize: 11.5, color: "var(--alert)" }}>{error}</div>
        )}

        <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
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
// Payment card
// ────────────────────────────────────────────────────────────

function PaymentCard({
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
  const [isPending, startTransition] = useTransition();
  const [confirmPayOpen, setConfirmPayOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  const account = payment.bankAccountId
    ? accounts.find((a) => a.id === payment.bankAccountId)
    : null;
  const category = payment.categoryId
    ? categoryOptions.find((c) => c.id === payment.categoryId)
    : null;

  const statusColor =
    payment.currentStatus === "paid"
      ? "var(--ok)"
      : payment.currentStatus === "overdue"
        ? "var(--alert)"
        : "var(--accent)";

  const dueDate = new Date(payment.currentDueDate + "T00:00:00");

  function markPaid() {
    startTransition(async () => {
      await markRecurringPaid({
        paymentId: payment.id,
        period: payment.currentPeriod,
        paidOn: new Date().toISOString().slice(0, 10),
      });
      setConfirmPayOpen(false);
    });
  }
  function unmark() {
    if (!confirm(`Desfazer marcação de pago em ${formatPeriod(payment.currentPeriod)}?`)) return;
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
    if (!confirm(`Excluir "${payment.name}" e todo o histórico de pagamentos?`)) return;
    startTransition(async () => {
      await deleteRecurringPayment(payment.id);
    });
  }

  return (
    <Card pad={14} raised={!dimmed && payment.currentStatus !== "paid"}>
      <div style={{ opacity: dimmed ? 0.55 : 1 }}>
        {/* Header com nome + status */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
              <span style={{ fontSize: 14, fontWeight: 700 }}>{payment.name}</span>
              <span
                style={{
                  fontSize: 9.5,
                  fontWeight: 700,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  color: "var(--muted)",
                  padding: "2px 7px",
                  borderRadius: 999,
                  background: "color-mix(in oklab, var(--muted) 10%, transparent)",
                }}
              >
                {payment.frequency === "monthly" ? "mensal" : "anual"}
              </span>
            </div>
            <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>
              vence em <b style={{ color: "var(--ink-d)" }}>{formatDueDate(dueDate, payment.currentDaysUntilDue)}</b>
              {payment.expectedAmount && (
                <>
                  {" · "}<span className="ap-num">R$ {formatBRL(parseFloat(payment.expectedAmount))}</span>
                </>
              )}
              {account && ` · ${account.name}`}
            </div>
            {category && (
              <div style={{ marginTop: 4 }}>
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 600,
                    padding: "1px 8px",
                    borderRadius: 999,
                    background: `color-mix(in oklab, ${category.color ?? "var(--muted)"} 14%, transparent)`,
                    color: "var(--ink-d)",
                  }}
                >
                  {category.label}
                </span>
              </div>
            )}
          </div>
          <span
            style={{
              fontSize: 10,
              fontWeight: 800,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              padding: "3px 10px",
              borderRadius: 999,
              background: `color-mix(in oklab, ${statusColor} 14%, transparent)`,
              color: statusColor,
              flexShrink: 0,
            }}
          >
            {payment.currentStatus === "paid"
              ? "pago"
              : payment.currentStatus === "overdue"
                ? "atrasado"
                : "a pagar"}
          </span>
        </div>

        {/* Ação principal */}
        {payment.currentStatus === "paid" ? (
          <button
            type="button"
            onClick={unmark}
            disabled={isPending}
            style={{
              ...ghostBtnStyle,
              width: "100%",
              borderColor: "var(--ok)",
              color: "var(--ok)",
            }}
          >
            ✓ pago em {formatPeriod(payment.currentPeriod)} — clique pra desfazer
          </button>
        ) : confirmPayOpen ? (
          <div style={{ display: "flex", gap: 6 }}>
            <button type="button" onClick={markPaid} disabled={isPending} style={primaryBtnStyle}>
              Confirmar pago hoje
            </button>
            <button type="button" onClick={() => setConfirmPayOpen(false)} style={ghostBtnStyle}>
              Cancelar
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmPayOpen(true)}
            disabled={isPending}
            style={{ ...primaryBtnStyle, width: "100%" }}
          >
            Marcar como pago
          </button>
        )}

        {payment.notes && (
          <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 8, fontStyle: "italic" }}>
            {payment.notes}
          </div>
        )}

        {/* Footer: histórico + editar + pausa + excluir */}
        <div
          style={{
            display: "flex",
            gap: 8,
            marginTop: 10,
            fontSize: 11,
            color: "var(--muted)",
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          {payment.records.length > 0 && (
            <button
              type="button"
              onClick={() => setHistoryOpen((v) => !v)}
              style={linkBtnStyle}
            >
              {historyOpen ? "esconder" : "ver"} histórico ({payment.records.length})
            </button>
          )}
          <button type="button" onClick={() => setEditOpen((v) => !v)} style={linkBtnStyle}>
            editar
          </button>
          <button type="button" onClick={toggleActive} style={linkBtnStyle}>
            {payment.isActive ? "pausar" : "reativar"}
          </button>
          <button type="button" onClick={del} style={{ ...linkBtnStyle, color: "var(--alert)" }}>
            excluir
          </button>
        </div>

        {historyOpen && payment.records.length > 0 && (
          <div
            style={{
              marginTop: 10,
              padding: "10px 12px",
              background: "var(--card2)",
              borderRadius: 10,
              display: "flex",
              flexDirection: "column",
              gap: 4,
            }}
          >
            {payment.records.map((r) => (
              <div
                key={r.id}
                style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5 }}
              >
                <span style={{ color: "var(--ink-d)", fontWeight: 600 }}>
                  {formatPeriod(r.period)}
                </span>
                <span style={{ color: "var(--muted)" }}>
                  {r.paidOn && new Date(r.paidOn + "T00:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }).replace(".", "")}
                  {r.paidAmount && ` · R$ ${formatBRL(parseFloat(r.paidAmount))}`}
                </span>
              </div>
            ))}
          </div>
        )}

        {editOpen && (
          <EditForm
            payment={payment}
            accounts={accounts}
            categoryOptions={categoryOptions}
            onClose={() => setEditOpen(false)}
          />
        )}
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
    <div
      style={{
        marginTop: 10,
        padding: 12,
        background: "var(--card2)",
        borderRadius: 12,
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      <input value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} placeholder="Nome" />
      <div style={{ display: "grid", gridTemplateColumns: payment.frequency === "yearly" ? "1fr 1fr" : "1fr", gap: 8 }}>
        {payment.frequency === "yearly" && (
          <select value={dueMonth} onChange={(e) => setDueMonth(e.target.value)} style={inputStyle}>
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
              <option key={m} value={m}>
                {new Date(2026, m - 1, 1).toLocaleDateString("pt-BR", { month: "long" })}
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
        placeholder="Valor esperado (R$)"
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
      <input
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Observação"
        style={inputStyle}
      />
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
// Helpers UI
// ────────────────────────────────────────────────────────────

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span
        style={{
          fontSize: 10.5,
          fontWeight: 600,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: "var(--muted)",
        }}
      >
        {label}
      </span>
      {children}
      {hint && <span style={{ fontSize: 10.5, color: "var(--muted)" }}>{hint}</span>}
    </label>
  );
}

function formatBRL(n: number): string {
  return n.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

const sectionTitleStyle: React.CSSProperties = {
  fontSize: 15,
  fontWeight: 700,
  color: "var(--ink)",
  marginBottom: 10,
};

const emptyHintStyle: React.CSSProperties = {
  fontSize: 12.5,
  color: "var(--muted)",
  fontStyle: "italic",
  padding: 14,
  textAlign: "center",
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

const primaryBtnStyle: React.CSSProperties = {
  padding: "8px 16px",
  borderRadius: 10,
  background: "var(--accent)",
  color: "var(--accent-on)",
  border: "none",
  fontSize: 12.5,
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
  color: "var(--muted-d)",
  border: "none",
  fontSize: 11,
  fontWeight: 600,
  cursor: "pointer",
  padding: 0,
  textDecoration: "underline",
};
