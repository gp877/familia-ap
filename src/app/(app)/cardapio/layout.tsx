import type { ReactNode } from "react";

import { ModuleNavBar } from "@/components/ap/module-nav";

export default function CardapioLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <ModuleNavBar
        items={[
          { href: "/cardapio", label: "Cardápio" },
          { href: "/cardapio/receitas", label: "Receitas" },
        ]}
      />
      {children}
    </>
  );
}
