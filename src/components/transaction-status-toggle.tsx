"use client";

import { Check, EyeOff } from "lucide-react";
import { useTransition } from "react";

import { setTransactionStatus } from "@/app/actions/transactions";
import { Button } from "@/components/ui/button";

type Props = {
  transactionId: string;
  status: "pending" | "confirmed" | "ignored";
};

export function TransactionStatusToggle({ transactionId, status }: Props) {
  const [isPending, startTransition] = useTransition();

  function set(next: "pending" | "confirmed" | "ignored") {
    startTransition(async () => {
      await setTransactionStatus(transactionId, next);
    });
  }

  return (
    <div className="flex gap-1">
      {status !== "confirmed" && (
        <Button
          size="sm"
          variant="ghost"
          disabled={isPending}
          onClick={() => set("confirmed")}
          title="Confirmar"
        >
          <Check className="size-4" />
        </Button>
      )}
      {status !== "ignored" && (
        <Button
          size="sm"
          variant="ghost"
          disabled={isPending}
          onClick={() => set("ignored")}
          title="Ignorar"
        >
          <EyeOff className="size-4" />
        </Button>
      )}
    </div>
  );
}
