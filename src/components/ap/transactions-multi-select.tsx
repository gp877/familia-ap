"use client";

import { useMemo, useState, useTransition } from "react";

import {
  bulkDelete,
  bulkSetCategory,
  bulkSetStatus,
} from "@/app/actions/transactions-bulk";
import {
  markAsInternalManually,
  unmarkAsInternalManually,
} from "@/app/actions/transactions";
import { CategoryBulkPicker } from "@/components/category-bulk-picker";
import { CategorySelect, type CategoryOption } from "@/components/category-select";
import { SplitDialog } from "@/components/split-dialog";
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
  isInternalTransfer?: boolean;
  internalTransferType?: string | null;
  splits?: Array<{ categoryId: string; amount: string; note?: string }> | null;
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

/**
 * Botão discreto pra alternar manualmente o status interno. Visual minúsculo
 * (linha 2 da transação), só aparece quando você passa o mouse. Honra o
 * princípio: toda automação tem override manual.
 */
function InternalOverrideButton({
  transactionId,
  isInternal,
}: {
  transactionId: string;
  isInternal: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  function handle() {
    if (
      isInternal &&
      !confirm("Tornar essa transação real novamente? Vai voltar a contar em DRE/balanço.")
    ) {
      return;
    }
    startTransition(async () => {
      if (isInternal) {
        await unmarkAsInternalManually(transactionId);
      } else {
        await markAsInternalManually(transactionId, null);
      }
    });
  }
  return (
    <button
      type="button"
      onClick={handle}
      disabled={isPending}
      title={
        isInternal
          ? "Tornar real (contar em DRE)"
          : "Marcar como interna (não contar em DRE)"
      }
      style={{
        flexShrink: 0,
        background: "transparent",
        border: "0.5px solid var(--line-d)",
        color: "var(--muted)",
        fontSize: 9.5,
        fontWeight: 600,
        padding: "2px 8px",
        borderRadius: 999,
        cursor: isPending ? "wait" : "pointer",
        opacity: isPending ? 0.5 : 1,
      }}
    >
      {isInternal ? "tornar real" : "marcar interna"}
    </button>
  );
}

function internalLabel(type: string | null | undefined) {
  switch (type) {
    case "card_payment":
      return "Pagamento de fatura (sai da conta)";
    case "card_payment_received":
      return "Pagamento recebido (quita a fatura)";
    case "pix_refund":
      return "Estorno PIX";
    case "annuity_bonus":
      return "Bonificação anuidade";
    case "manual":
      return "Marcada manualmente como interna";
    default:
      return "Transferência interna — não entra em DRE/balanço";
  }
}

export function TransactionsMultiSelect({ transactions, categoryOptions }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkCategoryId, setBulkCategoryId] = useState<string>("");
  const [splittingTxId, setSplittingTxId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const splittingTx = splittingTxId
    ? transactions.find((t) => t.id === splittingTxId)
    : null;

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

  // Totais GLOBAIS pra footer fixo: ignoram transferências internas
  // (pagamento de fatura, "Pagamento Recebido", estornos, bonificações).
  const globalTotals = useMemo(() => {
    let debit = 0;
    let credit = 0;
    let countReal = 0;
    let countInternal = 0;
    for (const tx of transactions) {
      if (tx.isInternalTransfer) {
        countInternal++;
        continue;
      }
      countReal++;
      const amt = parseFloat(tx.amount);
      if (tx.kind === "debit") debit += amt;
      else credit += amt;
    }
    return { debit, credit, countReal, countInternal };
  }, [transactions]);

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
              const isInternal = !!tx.isInternalTransfer;
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
                    opacity: tx.status === "ignored" ? 0.5 : isInternal ? 0.7 : 1,
                    background: isSelected
                      ? "var(--card2)"
                      : isInternal
                        ? "color-mix(in oklab, var(--muted) 6%, transparent)"
                        : "transparent",
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
                        color: isInternal ? "var(--muted-d)" : "var(--ink)",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                      }}
                    >
                      {isInternal && (
                        <span
                          title={internalLabel(tx.internalTransferType)}
                          style={{
                            fontSize: 9.5,
                            fontWeight: 800,
                            letterSpacing: "0.06em",
                            textTransform: "uppercase",
                            color: "var(--muted)",
                            border: "0.5px solid var(--line-d)",
                            padding: "2px 6px",
                            borderRadius: 999,
                            flexShrink: 0,
                          }}
                        >
                          ↔ interna
                        </span>
                      )}
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
                        {tx.description}
                      </span>
                    </div>
                    {isInternal ? (
                      <span
                        title="Transações internas não recebem categoria — não entram em DRE/balanço"
                        style={{
                          fontSize: 11,
                          color: "var(--muted)",
                          padding: "4px 10px",
                          border: "0.5px dashed var(--line-d)",
                          borderRadius: 999,
                          flexShrink: 0,
                        }}
                      >
                        sem categoria
                      </span>
                    ) : (
                      <CategorySelect
                        transactionId={tx.id}
                        currentCategoryId={tx.categoryId}
                        options={categoryOptions}
                      />
                    )}
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
                        color: isInternal
                          ? "var(--muted-d)"
                          : tx.kind === "debit"
                            ? "var(--ink)"
                            : "var(--ok)",
                        flexShrink: 0,
                        minWidth: 96,
                        textAlign: "right",
                      }}
                    >
                      {tx.kind === "debit" ? "−" : "+"}R$ {formatBRL(amount)}
                    </div>
                  </div>

                  {/* Linha 2: data · raw + override manual (canto direito) */}
                  <div
                    style={{
                      fontSize: 10.5,
                      color: "var(--muted)",
                      paddingLeft: 28,
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    <span
                      style={{
                        flex: 1,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {formatDate(tx.occurredOn)} ·{" "}
                      <span style={{ opacity: 0.85 }}>{tx.rawDescription.slice(0, 96)}</span>
                      {tx.rawDescription.length > 96 ? "…" : ""}
                    </span>
                    {!isInternal && (
                      <button
                        type="button"
                        onClick={() => setSplittingTxId(tx.id)}
                        title={
                          tx.splits && tx.splits.length > 0
                            ? `Splitada em ${tx.splits.length} partes — clique pra editar`
                            : "Dividir em múltiplas categorias"
                        }
                        style={{
                          flexShrink: 0,
                          background: "transparent",
                          border: "0.5px solid var(--line-d)",
                          color:
                            tx.splits && tx.splits.length > 0
                              ? "var(--accent)"
                              : "var(--muted)",
                          fontSize: 9.5,
                          fontWeight: 600,
                          padding: "2px 8px",
                          borderRadius: 999,
                          cursor: "pointer",
                        }}
                      >
                        {tx.splits && tx.splits.length > 0
                          ? `⇎ ${tx.splits.length} cats`
                          : "dividir"}
                      </button>
                    )}
                    <InternalOverrideButton
                      transactionId={tx.id}
                      isInternal={isInternal}
                    />
                  </div>
                </div>
              );
            })}

            {/* Footer global — totais REAIS (excluindo internas) */}
            <div
              style={{
                marginTop: 12,
                padding: "12px 14px",
                background: "var(--card)",
                border: "0.5px solid var(--line-d)",
                borderRadius: 14,
                display: "flex",
                alignItems: "center",
                gap: 16,
                flexWrap: "wrap",
                fontSize: 12,
                color: "var(--muted-d)",
              }}
            >
              <span style={{ fontWeight: 700 }}>
                {globalTotals.countReal}{" "}
                {globalTotals.countReal === 1 ? "lançamento real" : "lançamentos reais"}
              </span>
              {globalTotals.countInternal > 0 && (
                <span style={{ fontSize: 10.5, color: "var(--muted)" }}>
                  + {globalTotals.countInternal}{" "}
                  {globalTotals.countInternal === 1 ? "interna" : "internas"}
                </span>
              )}
              <span
                className="ap-num"
                style={{ color: "var(--ink-d)", fontWeight: 700, marginLeft: "auto" }}
              >
                ↓ R$ {formatBRL(globalTotals.debit)}
              </span>
              <span className="ap-num" style={{ color: "var(--ok)", fontWeight: 700 }}>
                ↑ R$ {formatBRL(globalTotals.credit)}
              </span>
            </div>
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
            <CategoryBulkPicker
              options={categoryOptions}
              value={bulkCategoryId}
              onChange={setBulkCategoryId}
              disabled={isPending}
            />
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

      {splittingTx && (
        <SplitDialog
          transactionId={splittingTx.id}
          totalAmount={splittingTx.amount}
          description={splittingTx.description}
          categoryOptions={categoryOptions}
          initialSplits={splittingTx.splits ?? undefined}
          onClose={() => setSplittingTxId(null)}
        />
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
