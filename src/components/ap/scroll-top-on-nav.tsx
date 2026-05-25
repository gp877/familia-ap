"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

/**
 * Scrolla pra o topo da página sempre que o pathname muda.
 * Resolve o problema do Next.js manter scroll position ao trocar de rota
 * via Link (especialmente quando a rota destino renderiza alto e o usuário
 * estava no meio da rota anterior).
 */
export function ScrollTopOnNav() {
  const pathname = usePathname();
  useEffect(() => {
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, left: 0, behavior: "instant" as ScrollBehavior });
    }
  }, [pathname]);
  return null;
}
