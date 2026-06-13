import type { ReactNode } from "react";

import { ModuleNavBar } from "@/components/ap/module-nav";

export default function ConfiguracoesLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <ModuleNavBar
        items={[
          { href: "/configuracoes", label: "Geral" },
          { href: "/configuracoes/ia", label: "IA" },
          { href: "/configuracoes/notificacoes", label: "Notificações" },
        ]}
      />
      {children}
    </>
  );
}
