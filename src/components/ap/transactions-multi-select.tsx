"use client";

import { useMemo, useState } from "react";

import { CategorySelect, type CategoryOption } from "@/components/category-select";
import { TransactionStatusToggle } from "@/components/transaction-status-toggle";

type TxRow = {
  id: string;
  occurredOn: string; // ISO string from server
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
                    gap: 6,
                    padding: "10px 0",
                    borderBottom:
                      i < transactions.length - 1 ? "0.5px solid var(--line-d)" : "none",
                    opacity: tx.status === "ignored" ? 0.4 : 1,
                    background: isSelected ? "var(--card2)" : "transparent",
                    margin: "0 -8px",
                    paddingLeft: 8,
                    paddingRight: 8,
                    borderRadius: 8,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggle(tx.id)}
                      style={{ accentColor: "var(--accent)", flexShrink: 0 }}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
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
                      <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>
                        {formatDate(tx.occurredOn)} ·{" "}
                        {tx.rawDescription.slice(0, 56)}
                        {tx.rawDescription.length > 56 ? "…" : ""}
                      </div>
                    </div>
                    <div
                      className="ap-num"
                      style={{
                        fontSize: 14,
                        color: tx.kind === "debit" ? "var(--ink)" : "var(--ok)",
                        flexShrink: 0,
                      }}
                    >
                      {tx.kind === "debit" ? "−" : "+"} R$ {formatBRL(amount)}
                    </div>
                  </div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      paddingLeft: 24,
                    }}
                  >
                    <CategorySelect
                      transactionId={tx.id}
                      currentCategoryId={tx.categoryId}
                      options={categoryOptions}
                    />
                    <div style={{ marginLeft: "auto" }}>
                      <TransactionStatusToggle
                        transactionId={tx.id}
                        status={tx.status}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </>
        )}
      </div>

      {/* Sticky sum bar */}
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
            alignItems: "center",
            gap: 16,
            fontSize: 12.5,
          }}
        >
          <span style={{ fontWeight: 700 }}>
            {selected.size} {selected.size === 1 ? "selecionada" : "selecionadas"}
          </span>
          <div style={{ flex: 1, display: "flex", gap: 14, fontSize: 11.5, fontWeight: 600 }}>
            <span>− R$ {formatBRL(totals.debit)}</span>
            <span>+ R$ {formatBRL(totals.credit)}</span>
            <span style={{ marginLeft: "auto" }}>
              líq. {totals.net < 0 ? "−" : "+"} R$ {formatBRL(Math.abs(totals.net))}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setSelected(new Set())}
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
      )}
    </>
  );
}
