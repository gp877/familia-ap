"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

import { Button } from "@/components/ui/button";

type Props = {
  availableMonths: string[]; // YYYY-MM
};

export function TransactionFilters({ availableMonths }: Props) {
  const router = useRouter();
  const params = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const month = params.get("month") ?? "";
  const status = params.get("status") ?? "";
  const onlyUncategorized = params.get("uncategorized") === "1";

  function update(patch: Record<string, string | null>) {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === "") next.delete(k);
      else next.set(k, v);
    }
    startTransition(() => {
      router.replace(`?${next.toString()}`);
    });
  }

  const hasFilters = month || status || onlyUncategorized;

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-lg border bg-card p-3">
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-muted-foreground">Mês</label>
        <select
          value={month}
          disabled={isPending}
          onChange={(e) => update({ month: e.target.value })}
          className="rounded-md border border-input bg-background px-2 py-1 text-sm"
        >
          <option value="">Todos</option>
          {availableMonths.map((m) => (
            <option key={m} value={m}>
              {formatMonth(m)}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-muted-foreground">Status</label>
        <select
          value={status}
          disabled={isPending}
          onChange={(e) => update({ status: e.target.value })}
          className="rounded-md border border-input bg-background px-2 py-1 text-sm"
        >
          <option value="">Todos</option>
          <option value="pending">Pendentes</option>
          <option value="confirmed">Confirmadas</option>
          <option value="ignored">Ignoradas</option>
        </select>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={onlyUncategorized}
          disabled={isPending}
          onChange={(e) => update({ uncategorized: e.target.checked ? "1" : null })}
        />
        Só sem categoria
      </label>

      {hasFilters && (
        <Button
          variant="ghost"
          size="sm"
          disabled={isPending}
          onClick={() =>
            update({ month: null, status: null, uncategorized: null })
          }
        >
          Limpar filtros
        </Button>
      )}
    </div>
  );
}

function formatMonth(yyyymm: string) {
  const [y, m] = yyyymm.split("-");
  const names = [
    "Jan",
    "Fev",
    "Mar",
    "Abr",
    "Mai",
    "Jun",
    "Jul",
    "Ago",
    "Set",
    "Out",
    "Nov",
    "Dez",
  ];
  return `${names[parseInt(m, 10) - 1]}/${y}`;
}
