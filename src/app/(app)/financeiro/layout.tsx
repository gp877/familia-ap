import type { ReactNode } from "react";

import { FinanceiroNav } from "@/components/ap/financeiro-nav";

/**
 * Layout do módulo Financeiro — injeta a sub-navegação por chips no topo
 * de TODAS as subtelas. Mesma largura máxima do ScreenShell pra alinhar.
 */
export default function FinanceiroLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <div className="mx-auto w-full max-w-[480px] lg:max-w-4xl">
        <FinanceiroNav />
      </div>
      {children}
    </>
  );
}
