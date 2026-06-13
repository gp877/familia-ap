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

// Parse YYYY-MM-DD como data LOCAL (não UTC). Sem isso, "2026-05-07" vira
// 00:00 UTC e o navegador em BRT (-3) exibe 06/05 — bug clássico de off-by-one.
function parseDateLocal(d: string): Date {
  const iso = d.slice(0, 10);
  const [y, m, day] = iso.split("-").map((n) => parseInt(n, 10));
  return new Date(y, (m || 1) - 1, day || 1);
}

function formatDateNum(d: string) {
  const dt = parseDateLocal(d);
  return `${String(dt.getDate()).padStart(2, "0")}/${String(dt.getMonth() + 1).padStart(2, "0")}`;
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
  // Filtro "só não categorizadas" — acelera o ritual de categorização:
  // mostra só o que falta, preservando a ordem do PDF. Client-side, vale
  // tanto pro extrato quanto pra fatura (componente compartilhado).
  const [onlyUncategorized, setOnlyUncategorized] = useState(false);
  const [isPending, startTransition] = useTransition();

  const uncategorizedCount = useMemo(
    () =>
      transactions.filter(
        (t) => !t.categoryId && !t.isInternalTransfer && t.status !== "ignored"
      ).length,
    [transactions]
  );

  const visible = useMemo(
    () =>
      onlyUncategorized
        ? transactions.filter(
            (t) => !t.categoryId && !t.isInternalTransfer && t.status !== "ignored"
          )
        : transactions,
    [transactions, onlyUncategorized]
  );

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
    if (selected.size === visible.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(visible.map((t) => t.id)));
    }
  }

  // Quantas tx têm a mesma descrição (case-insensitive)? Alimenta o botão
  // "+N iguais" — seleciona o grupo inteiro sem mexer na ordem da lista.
  const descCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const t of visible) {
      const k = t.description.toLowerCase();
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    return counts;
  }, [visible]);

  function selectSameDescription(tx: { id: string; description: string }) {
    const k = tx.description.toLowerCase();
    const next = new Set(selected);
    for (const t of visible) {
      if (t.description.toLowerCase() === k) next.add(t.id);
    }
    setSelected(next);
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
      // Ignored não conta em lugar nenhum — bate com o header da página.
      if (tx.status === "ignored") continue;
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
            {/* Filtro "só não categorizadas" — acelera a categorização.
                Só aparece quando ainda há o que categorizar. */}
            {uncategorizedCount > 0 && (
              <div style={{ display: "flex", gap: 6, padding: "4px 0 2px" }}>
                <button
                  type="button"
                  onClick={() => {
                    setOnlyUncategorized((v) => !v);
                    setSelected(new Set());
                  }}
                  style={{
                    padding: "5px 12px",
                    borderRadius: 999,
                    fontSize: 11,
                    fontWeight: 700,
                    cursor: "pointer",
                    border: onlyUncategorized ? "none" : "0.5px solid var(--line-d)",
                    background: onlyUncategorized ? "var(--accent)" : "var(--card)",
                    color: onlyUncategorized ? "var(--accent-on)" : "var(--muted-d)",
                  }}
                >
                  {onlyUncategorized ? "✓ " : ""}só não categorizadas ({uncategorizedCount})
                </button>
              </div>
            )}

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
                checked={visible.length > 0 && selected.size === visible.length}
                onChange={toggleAll}
                style={{ accentColor: "var(--accent)" }}
              />
              <span>
                {selected.size > 0
                  ? `${selected.size} selecionada${selected.size === 1 ? "" : "s"}`
                  : `selecionar todas (${visible.length})`}
              </span>
            </div>

            {visible.length === 0 ? (
              <div style={{ fontSize: 13, color: "var(--ok)", textAlign: "center", padding: "20px 0", fontWeight: 600 }}>
                Tudo categorizado nesta lista ✓
              </div>
            ) : null}

            {visible.map((tx, i) => {
              const amount = parseFloat(tx.amount);
              const isSelected = selected.has(tx.id);
              const isInternal = !!tx.isInternalTransfer;
              return (
                <div
                  key={tx.id}
                  style={{
                    display: "flex",
                    alignItems: "stretch",
                    gap: 10,
                    padding: "10px 8px",
                    borderBottom:
                      i < visible.length - 1 ? "0.5px solid var(--line-d)" : "none",
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
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggle(tx.id)}
                    style={{
                      accentColor: "var(--accent)",
                      flexShrink: 0,
                      alignSelf: "center",
                    }}
                  />

                  {/* COLUNA DATA — box dedicado à esquerda, altura total da
                      linha. Fica visualmente separado da descrição, com cor
                      accent, número grande, igual à coluna "Data" do PDF. */}
                  <div
                    style={{
                      flexShrink: 0,
                      width: 54,
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      padding: "4px 6px",
                      background: "color-mix(in oklab, var(--accent) 16%, transparent)",
                      border: "0.5px solid color-mix(in oklab, var(--accent) 30%, transparent)",
                      borderRadius: 8,
                      color: "var(--accent)",
                      lineHeight: 1,
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    <span style={{ fontSize: 15, fontWeight: 800, letterSpacing: "0.01em" }}>
                      {formatDateNum(tx.occurredOn)}
                    </span>
                  </div>

                  <div
                    style={{
                      flex: 1,
                      minWidth: 0,
                      display: "flex",
                      flexDirection: "column",
                      gap: 4,
                      justifyContent: "center",
                    }}
                  >
                  {/* Linha 1: descrição + categoria + status + valor */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      flexWrap: "wrap",
                    }}
                  >
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
                    {/* Status saiu da linha: confirmada = categorizada (automático).
                        Ignorar continua possível via seleção em massa. */}
                    <CategorySelect
                      transactionId={tx.id}
                      currentCategoryId={tx.categoryId}
                      options={categoryOptions}
                      isInternal={isInternal}
                    />
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

                  {/* Linha 2: raw description + botão split + override manual.
                      A data NÃO vai mais aqui — ela tem coluna própria à
                      esquerda agora. */}
                  <div
                    style={{
                      fontSize: 10.5,
                      color: "var(--muted)",
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
                        opacity: 0.85,
                      }}
                    >
                      {tx.rawDescription.slice(0, 96)}
                      {tx.rawDescription.length > 96 ? "…" : ""}
                    </span>
                    {!isInternal &&
                      (descCounts.get(tx.description.toLowerCase()) ?? 0) > 1 && (
                        <button
                          type="button"
                          onClick={() => selectSameDescription(tx)}
                          title={`Selecionar todas as transações "${tx.description}" pra categorizar de uma vez`}
                          style={{
                            flexShrink: 0,
                            background: "transparent",
                            border: "0.5px solid color-mix(in oklab, var(--accent) 45%, transparent)",
                            color: "var(--accent)",
                            fontSize: 9.5,
                            fontWeight: 700,
                            padding: "2px 8px",
                            borderRadius: 999,
                            cursor: "pointer",
                          }}
                        >
                          ⊕ {descCounts.get(tx.description.toLowerCase())} iguais
                        </button>
                      )}
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
