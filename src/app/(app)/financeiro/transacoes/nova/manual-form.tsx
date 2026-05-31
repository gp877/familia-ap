"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Card } from "@/components/ap/atoms";
import { CategoryBulkPicker } from "@/components/category-bulk-picker";
import type { CategoryOption } from "@/components/category-select";

import { createManualTransaction } from "@/app/actions/transactions";

type Account = { id: string; name: string; type: string };

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function ManualTransactionForm({
  accounts,
  categoryOptions,
}: {
  accounts: Account[];
  categoryOptions: CategoryOption[];
}) {
  const router = useRouter();
  const [bankAccountId, setBankAccountId] = useState(accounts[0]?.id ?? "");
  const [occurredOn, setOccurredOn] = useState(todayIso());
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [kind, setKind] = useState<"debit" | "credit">("debit");
  const [categoryId, setCategoryId] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    // Normaliza valor "1.234,56" → "1234.56"
    const normalized = amount.replace(/\./g, "").replace(",", ".");
    if (!/^\d+(\.\d{1,2})?$/.test(normalized)) {
      setError("Valor inválido. Use formato 123,45");
      return;
    }
    startTransition(async () => {
      try {
        await createManualTransaction({
          bankAccountId,
          occurredOn,
          description,
          amount: normalized,
          kind,
          categoryId: categoryId || null,
          notes: notes || undefined,
        });
        router.push("/financeiro/transacoes");
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    });
  }

  if (accounts.length === 0) {
    return (
      <Card pad={16}>
        <div style={{ fontSize: 13, color: "var(--muted-d)" }}>
          Sem conta cadastrada.{" "}
          <a href="/financeiro/contas" style={{ color: "var(--accent)" }}>
            Cadastrar uma
          </a>{" "}
          primeiro.
        </div>
      </Card>
    );
  }

  return (
    <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <Field label="Conta / cartão *">
        <select
          value={bankAccountId}
          onChange={(e) => setBankAccountId(e.target.value)}
          required
          style={fieldStyle}
        >
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name} ({typeLabel(a.type)})
            </option>
          ))}
        </select>
      </Field>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <Field label="Data *">
          <input
            type="date"
            value={occurredOn}
            onChange={(e) => setOccurredOn(e.target.value)}
            required
            style={fieldStyle}
          />
        </Field>
        <Field label="Tipo *">
          <div style={{ display: "flex", gap: 6 }}>
            <button
              type="button"
              onClick={() => setKind("debit")}
              style={kindBtn(kind === "debit", "alert")}
            >
              − Saída
            </button>
            <button
              type="button"
              onClick={() => setKind("credit")}
              style={kindBtn(kind === "credit", "ok")}
            >
              + Entrada
            </button>
          </div>
        </Field>
      </div>

      <Field label="Descrição *">
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          required
          placeholder="ex: Padaria do bairro"
          style={fieldStyle}
        />
      </Field>

      <Field label="Valor (R$) *">
        <input
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          required
          placeholder="0,00"
          inputMode="decimal"
          style={fieldStyle}
        />
      </Field>

      <Field label="Categoria">
        <div>
          <CategoryBulkPicker
            options={categoryOptions}
            value={categoryId}
            onChange={setCategoryId}
            buttonContrast={false}
            placeholder="(vazia → aplica regras)"
          />
        </div>
      </Field>

      <Field label="Observação" hint="opcional · fica no rawDescription pra debug">
        <input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder=""
          style={fieldStyle}
        />
      </Field>

      {error && (
        <div
          style={{
            padding: "10px 12px",
            borderRadius: 10,
            background: "color-mix(in oklab, var(--alert) 12%, var(--card))",
            border: "1px solid var(--alert)",
            color: "var(--alert)",
            fontSize: 12,
          }}
        >
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={isPending}
        style={{
          padding: "12px 18px",
          borderRadius: 14,
          background: isPending ? "var(--card)" : "var(--accent)",
          color: isPending ? "var(--muted)" : "var(--accent-on)",
          border: "none",
          fontSize: 14,
          fontWeight: 700,
          cursor: isPending ? "wait" : "pointer",
        }}
      >
        {isPending ? "Salvando…" : "Criar transação"}
      </button>
    </form>
  );
}

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

const fieldStyle: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: 10,
  background: "var(--card2)",
  color: "var(--ink)",
  border: "0.5px solid var(--line-d)",
  fontSize: 13.5,
  fontFamily: "inherit",
  outline: "none",
};

function kindBtn(active: boolean, tone: "alert" | "ok"): React.CSSProperties {
  return {
    flex: 1,
    padding: "10px 14px",
    borderRadius: 10,
    background: active
      ? `color-mix(in oklab, var(--${tone}) 20%, var(--card2))`
      : "var(--card2)",
    color: active ? `var(--${tone})` : "var(--muted-d)",
    border: active ? `1px solid var(--${tone})` : "0.5px solid var(--line-d)",
    fontSize: 13,
    fontWeight: 700,
    cursor: "pointer",
    fontFamily: "inherit",
  };
}

function typeLabel(t: string) {
  return t === "checking"
    ? "CC"
    : t === "savings"
      ? "Poupança"
      : t === "credit_card"
        ? "Cartão"
        : t === "investment"
          ? "Inv."
          : "Outra";
}
