"use client";

import { useTransition } from "react";

import { setTransactionCategory } from "@/app/actions/transactions";

export type CategoryOption = {
  id: string;
  label: string; // "Parent > Child" ou só "Name"
};

type Props = {
  transactionId: string;
  currentCategoryId: string | null;
  options: CategoryOption[];
};

export function CategorySelect({ transactionId, currentCategoryId, options }: Props) {
  const [isPending, startTransition] = useTransition();

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const value = e.target.value;
    const newCategoryId = value === "" ? null : value;
    const createRule = e.target.dataset.createRule !== "false"; // default true
    startTransition(async () => {
      await setTransactionCategory(transactionId, newCategoryId, createRule);
    });
  }

  return (
    <select
      value={currentCategoryId ?? ""}
      onChange={handleChange}
      disabled={isPending}
      className="w-full max-w-[260px] rounded-md border border-input bg-background px-2 py-1 text-xs disabled:opacity-50"
    >
      <option value="">— Sem categoria —</option>
      {options.map((opt) => (
        <option key={opt.id} value={opt.id}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}
