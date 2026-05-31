"use client";

import { useState, useTransition } from "react";

import { CategoryBulkPicker } from "@/components/category-bulk-picker";
import type { CategoryOption } from "@/components/category-select";

import { setTransactionSplits } from "@/app/actions/transactions";

type Split = { categoryId: string; amount: string; note?: string };

/**
 * Modal compacto pra splitar uma transação em N categorias. Visual discreto
 * (caso raro). Mostra valor total + barra de progresso "quanto falta pra
 * fechar a sum". Botão "salvar" só habilita quando bate.
 */
export function SplitDialog({
  transactionId,
  totalAmount,
  description,
  categoryOptions,
  initialSplits,
  onClose,
}: {
  transactionId: string;
  totalAmount: string;
  description: string;
  categoryOptions: CategoryOption[];
  initialSplits?: Split[];
  onClose: () => void;
}) {
  const total = parseFloat(totalAmount);
  const [splits, setSplits] = useState<Split[]>(
    initialSplits && initialSplits.length > 0
      ? initialSplits
      : [
          { categoryId: "", amount: (total / 2).toFixed(2) },
          { categoryId: "", amount: (total - total / 2).toFixed(2) },
        ]
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const sum = splits.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0);
  const diff = total - sum;
  const balanced = Math.abs(diff) < 0.01;
  const allCatsSet = splits.every((s) => s.categoryId);

  function update(idx: number, patch: Partial<Split>) {
    setSplits((arr) => arr.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  }
  function addSplit() {
    setSplits((arr) => [...arr, { categoryId: "", amount: diff > 0 ? diff.toFixed(2) : "0" }]);
  }
  function removeSplit(idx: number) {
    setSplits((arr) => arr.filter((_, i) => i !== idx));
  }
  function distributeEqual() {
    const part = total / splits.length;
    setSplits((arr) =>
      arr.map((s, i) => ({
        ...s,
        amount: (i === arr.length - 1
          ? total - part * (arr.length - 1)
          : part
        ).toFixed(2),
      }))
    );
  }

  function save() {
    setError(null);
    if (!balanced) {
      setError(`Falta R$ ${Math.abs(diff).toFixed(2)} pra fechar.`);
      return;
    }
    if (!allCatsSet) {
      setError("Selecione uma categoria pra cada parte.");
      return;
    }
    startTransition(async () => {
      try {
        await setTransactionSplits(transactionId, splits);
        onClose();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    });
  }

  function clearSplit() {
    if (!confirm("Remover o split? A transação volta a ter só uma categoria.")) {
      return;
    }
    startTransition(async () => {
      await setTransactionSplits(transactionId, []);
      onClose();
    });
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.6)",
        zIndex: 50,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--card)",
          borderRadius: 18,
          padding: 18,
          maxWidth: 520,
          width: "100%",
          maxHeight: "85vh",
          overflowY: "auto",
          boxShadow: "0 12px 40px rgba(0,0,0,0.5)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", marginBottom: 6 }}>
          <span
            style={{
              fontSize: 10,
              fontWeight: 800,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: "var(--muted)",
            }}
          >
            dividir em categorias
          </span>
          <button
            type="button"
            onClick={onClose}
            style={{
              marginLeft: "auto",
              width: 28,
              height: 28,
              borderRadius: 14,
              background: "transparent",
              color: "var(--muted-d)",
              border: "0.5px solid var(--line-d)",
              fontSize: 14,
              cursor: "pointer",
            }}
          >
            ×
          </button>
        </div>
        <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--ink)" }}>
          {description}
        </div>
        <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>
          total: R$ {total.toFixed(2)}
        </div>

        {/* Barra de progresso da sum */}
        <div
          style={{
            marginTop: 10,
            height: 4,
            background: "var(--card2)",
            borderRadius: 2,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: `${Math.min(100, (sum / total) * 100)}%`,
              height: "100%",
              background: balanced ? "var(--ok)" : "var(--accent)",
              transition: "width 0.15s, background-color 0.15s",
            }}
          />
        </div>
        <div
          style={{
            marginTop: 4,
            fontSize: 11,
            color: balanced ? "var(--ok)" : "var(--muted)",
            display: "flex",
            justifyContent: "space-between",
          }}
        >
          <span>R$ {sum.toFixed(2)} alocado</span>
          <span>
            {balanced
              ? "✓ fechado"
              : diff > 0
                ? `falta R$ ${diff.toFixed(2)}`
                : `sobra R$ ${Math.abs(diff).toFixed(2)}`}
          </span>
        </div>

        {/* Partes */}
        <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
          {splits.map((s, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                gap: 6,
                alignItems: "center",
                padding: 8,
                background: "var(--card2)",
                borderRadius: 10,
              }}
            >
              <CategoryBulkPicker
                options={categoryOptions}
                value={s.categoryId}
                onChange={(id) => update(i, { categoryId: id })}
                buttonContrast={false}
              />
              <input
                value={s.amount}
                onChange={(e) => update(i, { amount: e.target.value })}
                inputMode="decimal"
                style={{
                  width: 100,
                  padding: "6px 10px",
                  borderRadius: 8,
                  background: "var(--card)",
                  color: "var(--ink)",
                  border: "0.5px solid var(--line-d)",
                  fontSize: 12.5,
                  textAlign: "right",
                  fontFamily: "var(--font-geist-mono), monospace",
                  outline: "none",
                }}
              />
              {splits.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeSplit(i)}
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: 12,
                    background: "transparent",
                    color: "var(--alert)",
                    border: "0.5px solid var(--line-d)",
                    fontSize: 12,
                    cursor: "pointer",
                  }}
                  title="Remover parte"
                >
                  ×
                </button>
              )}
            </div>
          ))}
        </div>

        <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
          <button type="button" onClick={addSplit} style={ghostBtnStyle}>
            + parte
          </button>
          <button type="button" onClick={distributeEqual} style={ghostBtnStyle}>
            ⟷ dividir igual
          </button>
          {initialSplits && initialSplits.length > 0 && (
            <button
              type="button"
              onClick={clearSplit}
              style={{ ...ghostBtnStyle, color: "var(--alert)" }}
            >
              remover split
            </button>
          )}
        </div>

        {error && (
          <div
            style={{
              marginTop: 10,
              padding: "8px 12px",
              borderRadius: 8,
              background: "color-mix(in oklab, var(--alert) 12%, var(--card2))",
              color: "var(--alert)",
              fontSize: 11.5,
            }}
          >
            {error}
          </div>
        )}

        <button
          type="button"
          onClick={save}
          disabled={isPending || !balanced || !allCatsSet}
          style={{
            marginTop: 14,
            width: "100%",
            padding: "10px",
            borderRadius: 12,
            background: balanced && allCatsSet ? "var(--accent)" : "var(--card2)",
            color: balanced && allCatsSet ? "var(--accent-on)" : "var(--muted)",
            border: "none",
            fontSize: 13,
            fontWeight: 700,
            cursor: balanced && allCatsSet && !isPending ? "pointer" : "not-allowed",
          }}
        >
          {isPending ? "Salvando…" : "Salvar split"}
        </button>
      </div>
    </div>
  );
}

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
