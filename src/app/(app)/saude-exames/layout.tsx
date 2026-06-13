import type { ReactNode } from "react";

import { ModuleNavBar } from "@/components/ap/module-nav";

export default function SaudeExamesLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <ModuleNavBar
        items={[
          { href: "/saude-exames", label: "Exames" },
          { href: "/saude-peso", label: "Peso" },
        ]}
      />
      {children}
    </>
  );
}
