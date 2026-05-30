"use client";

import { useMemo, useState, useTransition } from "react";

import {
  bulkDelete,
  bulkSetCategory,
  bulkSetStatus,
} from "@/app/actions/transactions-bulk";
import { CategorySelect, type CategoryOption } from "@/components/category-select";
import { TransactionStatusToggle } from "@/components/transaction-status-toggle";

type TxRow = {
  id: string;
  occurredOn: string;
  description: string;
  rawDescription: string;
  amount: string;
  kind: "debit" | "credit";
  categoryId: string | null;
  status: "pending" | "confirmed" | "ignored";
  bankAccountId: string | null;
};

type Props = {
  transactions: TxRow[];
  categoryOptions: CategoryOption[];
};

function formatBRL(n: number) {
  return n.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
  });
}

export function TransactionsMultiSelect({ transactions, categoryOptions }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkCategoryId, setBulkCategoryId] = useState<string>("");
  const [isPending, startTransition] = useTransition();

  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  }

  function toggleAll() {
    if (selected.size === transactions.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(transactions.map((t) => t.id)));
    }
  }

  const totals = useMemo(() => {
    let debit = 0;
    let credit = 0;
    for (const id of selected) {
      const tx = transactions.find((t) => t.id === id);
      if (!tx) continue;
      const amt = parseFloat(tx.amount);
      if (tx.kind === "debit") debit += amt;
      else credit += amt;
    }
    return { debit, credit, net: credit - debit };
  }, [selected, transactions]);

  function handleBulkCategory(createRules: boolean) {
    if (!bulkCategoryId) return;
    const ids = [...selected];
    startTransition(async () => {
      await bulkSetCategory(ids, bulkCategoryId, createRules);
      setSelected(new Set());
      setBulkCategoryId("");
    });
  }

  function handleBulkStatus(status: "pending" | "confirmed" | "ignored") {
    const ids = [...selected];
    startTransition(async () => {
      await bulkSetStatus(ids, status);
      setSelected(new Set());
    });
  }

  function handleBulkDelete() {
    if (!confirm(`Excluir ${selected.size} transações?`)) return;
    const ids = [...selected];
    startTransition(async () => {
      await bulkDelete(ids);
      setSelected(new Set());
    });
  }

  return (
    <>
      <div style={{ padding: "0 20px" }}>
        {transactions.length === 0 ? (
          <div style={{ fontSize: 13, color: "var(--muted)", textAlign: "center", padding: "20px 0" }}>
            Nenhuma transação.
          </div>
        ) : (
          <>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "8px 0",
                fontSize: 11,
                color: "var(--muted)",
              }}
            >
              <input
                type="checkbox"
                checked={selected.size === transactions.length}
                onChange={toggleAll}
                style={{ accentColor: "var(--accent)" }}
              />
              <span>
                {selected.size > 0
                  ? `${selected.size} selecionada${selected.size === 1 ? "" : "s"}`
                  : `selecionar todas (${transactions.length})`}
              </span>
            </div>

            {transactions.map((tx, i) => {
              const amount = parseFloat(tx.amount);
              const isSelected = selected.has(tx.id);
              return (
                <div
                  key={tx.id}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 4,
                    padding: "10px 8px",
                    borderBottom:
                      i < transactions.length - 1 ? "0.5px solid var(--line-d)" : "none",
                    opacity: tx.status === "ignored" ? 0.5 : 1,
                    background: isSelected ? "var(--card2)" : "transparent",
                    margin: "0 -8px",
                    borderRadius: 10,
                    transition: "background-color 0.12s",
                  }}
                >
                  {/* Linha 1: checkbox + descrição + categoria + status + valor */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      flexWrap: "wrap",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggle(tx.id)}
                      style={{ accentColor: "var(--accent)", flexShrink: 0 }}
                    />
                    <div
                      style={{
                        flex: 1,
                        minWidth: 160,
                        fontSize: 13.5,
                        fontWeight: 600,
                        color: "var(--ink)",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {tx.description}
                    </div>
                    <CategorySelect
                      transactionId={tx.id}
                      currentCategoryId={tx.categoryId}
                      options={categoryOptions}
                    />
                    <div style={{ flexShrink: 0 }}>
                      <TransactionStatusToggle
                        transactionId={tx.id}
                        status={tx.status}
                      />
                    </div>
                    <div
                      className="ap-num"
                      style={{
                        fontSize: 14.5,
                        fontWeight: 700,
                        color: tx.kind === "debit" ? "var(--ink)" : "var(--ok)",
                        flexShrink: 0,
                        minWidth: 96,
                        textAlign: "right",
                      }}
                    >
                      {tx.kind === "debit" ? "−" : "+"}R$ {formatBRL(amount)}
                    </div>
                  </div>

                  {/* Linha 2: data · raw (contexto secundário) */}
                  <div
                    style={{
                      fontSize: 10.5,
                      color: "var(--muted)",
                      paddingLeft: 28,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {formatDate(tx.occurredOn)} ·{" "}
                    <span style={{ opacity: 0.85 }}>{tx.rawDescription.slice(0, 96)}</span>
                    {tx.rawDescription.length > 96 ? "…" : ""}
                  </div>
                </div>
              );
            })}
          </>
        )}
      </div>

      {/* Sticky sum bar + bulk actions */}
      {selected.size > 0 && (
        <div
          style={{
            position: "sticky",
            bottom: 0,
            margin: "12px 20px 0",
            padding: "12px 14px",
            background: "var(--accent)",
            color: "var(--accent-on)",
            borderRadius: 14,
            display: "flex",
            flexDirection: "column",
            gap: 10,
            fontSize: 12.5,
            zIndex: 20,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <span style={{ fontWeight: 700 }}>
              {selected.size} {selected.size === 1 ? "selecionada" : "selecionadas"}
            </span>
            <span style={{ fontSize: 11.5, fontWeight: 600 }}>
              − R$ {formatBRL(totals.debit)}
            </span>
            <span style={{ fontSize: 11.5, fontWeight: 600 }}>
              + R$ {formatBRL(totals.credit)}
            </span>
            <span style={{ marginLeft: "auto", fontSize: 11.5, fontWeight: 700 }}>
              líq. {totals.net < 0 ? "−" : "+"} R$ {formatBRL(Math.abs(totals.net))}
            </span>
            <button
              type="button"
              onClick={() => setSelected(new Set())}
              disabled={isPending}
              style={{
                background: "transparent",
                color: "var(--accent-on)",
                border: "1px solid currentColor",
                padding: "4px 10px",
                borderRadius: 999,
                fontSize: 11,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              limpar
            </button>
          </div>

          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            <select
              value={bulkCategoryId}
              onChange={(e) => setBulkCategoryId(e.target.value)}
              disabled={isPending}
              style={{
                padding: "5px 10px",
                borderRadius: 8,
                background: "rgba(0,0,0,0.15)",
                color: "var(--accent-on)",
                border: "none",
                fontSize: 11.5,
                fontWeight: 600,
                cursor: "pointer",
                maxWidth: 220,
              }}
            >
              <option value="">Aplicar categoria...</option>
              {categoryOptions.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => handleBulkCategory(true)}
              disabled={!bulkCategoryId || isPending}
              style={bulkBtnStyle}
            >
              + criar regras
            </button>
            <button
              type="button"
              onClick={() => handleBulkCategory(false)}
              disabled={!bulkCategoryId || isPending}
              style={bulkBtnStyle}
            >
              só aplicar
            </button>
          </div>

          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => handleBulkStatus("confirmed")}
              disabled={isPending}
              style={bulkBtnStyle}
            >
              ✓ confirmar
            </button>
            <button
              type="button"
              onClick={() => handleBulkStatus("ignored")}
              disabled={isPending}
              style={bulkBtnStyle}
            >
              ignorar
            </button>
            <button
              type="button"
              onClick={() => handleBulkStatus("pending")}
              disabled={isPending}
              style={bulkBtnStyle}
            >
              voltar a pendente
            </button>
            <button
              type="button"
              onClick={handleBulkDelete}
              disabled={isPending}
              style={{ ...bulkBtnStyle, marginLeft: "auto", color: "var(--accent-on)" }}
            >
              excluir
            </button>
          </div>
        </div>
      )}
    </>
  );
}

const bulkBtnStyle: React.CSSProperties = {
  padding: "5px 10px",
  borderRadius: 8,
  background: "rgba(0,0,0,0.15)",
  color: "var(--accent-on)",
  border: "none",
  fontSize: 11.5,
  fontWeight: 600,
  cursor: "pointer",
};
