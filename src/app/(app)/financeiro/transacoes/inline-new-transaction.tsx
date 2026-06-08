"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { CategoryBulkPicker } from "@/components/category-bulk-picker";
import type { CategoryOption } from "@/components/category-select";

import { createManualTransaction } from "@/app/actions/transactions";

type Account = { id: string; name: string; type: string };

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
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

/**
 * Linha de inserção manual de transação — renderizada dentro de cada
 * bloco (Extrato / Fatura) na tela /transacoes. Colapsada vira "+
 * adicionar transação"; clicada expande pra form com data, descrição,
 * valor, tipo e categoria. Após salvar, refresh server data.
 *
 * @param accounts contas disponíveis pra escolher (já filtradas pelo bloco)
 * @param defaultAccountId conta sugerida (filtro ativo, se houver)
 * @param defaultKind tipo default — fatura sempre "debit"; extrato escolhe
 */
export function InlineNewTransaction({
  accounts,
  categoryOptions,
  defaultAccountId,
  defaultKind = "debit",
  blockLabel,
}: {
  accounts: Account[];
  categoryOptions: CategoryOption[];
  defaultAccountId?: string | null;
  defaultKind?: "debit" | "credit";
  /** "Extrato" ou "Fatura" — só pra mensagens contextuais */
  blockLabel: "Extrato" | "Fatura";
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [bankAccountId, setBankAccountId] = useState(
    defaultAccountId ?? accounts[0]?.id ?? ""
  );
  const [occurredOn, setOccurredOn] = useState(todayIso());
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [kind, setKind] = useState<"debit" | "credit">(defaultKind);
  const [categoryId, setCategoryId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function reset() {
    setOccurredOn(todayIso());
    setDescription("");
    setAmount("");
    setCategoryId("");
    setError(null);
    setKind(defaultKind);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const normalized = amount.replace(/\./g, "").replace(",", ".");
    if (!/^\d+(\.\d{1,2})?$/.test(normalized)) {
      setError("Valor inválido (ex: 123,45)");
      return;
    }
    if (!description.trim()) {
      setError("Descrição obrigatória");
      return;
    }
    if (!bankAccountId) {
      setError("Selecione a conta");
      return;
    }
    startTransition(async () => {
      try {
        await createManualTransaction({
          bankAccountId,
          occurredOn,
          description: description.trim(),
          amount: normalized,
          kind,
          categoryId: categoryId || null,
        });
        reset();
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    });
  }

  if (accounts.length === 0) return null;

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{
          width: "100%",
          padding: "10px 16px",
          marginBottom: 4,
          borderRadius: 10,
          background: "transparent",
          color: "var(--muted-d)",
          border: "1px dashed var(--line-d)",
          fontSize: 12,
          fontWeight: 600,
          cursor: "pointer",
          fontFamily: "inherit",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 6,
          letterSpacing: "0.02em",
        }}
      >
        <span style={{ fontSize: 13, fontWeight: 700 }}>+</span>
        Lançar transação no {blockLabel.toLowerCase()}
      </button>
    );
  }

  return (
    <form
      onSubmit={submit}
      style={{
        padding: 12,
        marginBottom: 6,
        borderRadius: 12,
        background: "var(--card)",
        border: "1px solid var(--accent)",
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      <div style={headerLabelStyle}>Nova transação · {blockLabel.toLowerCase()}</div>

      {/* Linha 1: conta + data + tipo */}
      <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr 1fr", gap: 6 }}>
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
        <input
          type="date"
          value={occurredOn}
          onChange={(e) => setOccurredOn(e.target.value)}
          required
          style={fieldStyle}
        />
        <div style={{ display: "flex", gap: 4 }}>
          <button
            type="button"
            onClick={() => setKind("debit")}
            style={kindBtn(kind === "debit", "alert")}
          >
            −
          </button>
          <button
            type="button"
            onClick={() => setKind("credit")}
            style={kindBtn(kind === "credit", "ok")}
          >
            +
          </button>
        </div>
      </div>

      {/* Linha 2: descrição + valor */}
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 6 }}>
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          required
          placeholder="Descrição (ex: Padaria do bairro)"
          style={fieldStyle}
          autoFocus
        />
        <input
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          required
          placeholder="0,00"
          inputMode="decimal"
          style={fieldStyle}
        />
      </div>

      {/* Linha 3: categoria (full-width) */}
      <CategoryBulkPicker
        options={categoryOptions}
        value={categoryId}
        onChange={setCategoryId}
        buttonContrast={false}
        placeholder="(sem categoria · aplica regras)"
      />

      {error && (
        <div style={{ fontSize: 11.5, color: "var(--alert)" }}>{error}</div>
      )}

      <div style={{ display: "flex", gap: 6 }}>
        <button
          type="submit"
          disabled={isPending}
          style={{
            flex: 1,
            padding: "8px 14px",
            borderRadius: 8,
            background: isPending ? "var(--card2)" : "var(--accent)",
            color: isPending ? "var(--muted-d)" : "var(--accent-on)",
            border: "none",
            fontSize: 12.5,
            fontWeight: 700,
            cursor: isPending ? "wait" : "pointer",
            fontFamily: "inherit",
          }}
        >
          {isPending ? "Salvando…" : "Salvar transação"}
        </button>
        <button
          type="button"
          onClick={() => {
            reset();
            setOpen(false);
          }}
          style={{
            padding: "8px 14px",
            borderRadius: 8,
            background: "transparent",
            color: "var(--muted-d)",
            border: "0.5px solid var(--line-d)",
            fontSize: 12,
            fontWeight: 600,
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}

const fieldStyle: React.CSSProperties = {
  padding: "7px 10px",
  borderRadius: 8,
  background: "var(--card2)",
  color: "var(--ink)",
  border: "0.5px solid var(--line-d)",
  fontSize: 12.5,
  fontFamily: "inherit",
  outline: "none",
  minWidth: 0,
};

const headerLabelStyle: React.CSSProperties = {
  fontSize: 9.5,
  fontWeight: 800,
  letterSpacing: "0.14em",
  textTransform: "uppercase",
  color: "var(--accent)",
};

function kindBtn(active: boolean, tone: "alert" | "ok"): React.CSSProperties {
  return {
    flex: 1,
    padding: "7px 0",
    borderRadius: 8,
    background: active ? `color-mix(in oklab, var(--${tone}) 22%, var(--card2))` : "var(--card2)",
    color: active ? `var(--${tone})` : "var(--muted-d)",
    border: active ? `1px solid var(--${tone})` : "0.5px solid var(--line-d)",
    fontSize: 14,
    fontWeight: 800,
    cursor: "pointer",
    fontFamily: "inherit",
    lineHeight: 1,
  };
}
