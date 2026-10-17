import type { ReactNode } from "react";

import { ComprasNav } from "@/components/ap/compras-nav";

export default function ComprasLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <ComprasNav />
      {children}
    </>
  );
}
