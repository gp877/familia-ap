import type { ReactNode } from "react";

import { ModuleNavBar } from "@/components/ap/module-nav";

export default function SupermercadoLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <ModuleNavBar
        items={[
          { href: "/supermercado", label: "Resumo" },
          { href: "/supermercado/contagens", label: "Contagens" },
          { href: "/supermercado/produtos", label: "Produtos" },
          { href: "/supermercado/fornecedores", label: "Fornecedores" },
          // Pedidos individuais (/pedidos/[id]) acendem o chip Histórico
          { href: "/supermercado/historico", label: "Histórico", match: ["/supermercado/pedidos"] },
        ]}
      />
      {children}
    </>
  );
}
