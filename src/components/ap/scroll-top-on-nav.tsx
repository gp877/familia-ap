"use client";

import { usePathname } from "next/navigation";
import { useEffect, useLayoutEffect } from "react";

// useLayoutEffect só roda no client. Em SSR fingimos com useEffect pra
// evitar warning.
const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

/**
 * Scrolla pra o topo SEMPRE que o pathname mudar, INCLUSIVE no 1º render.
 *
 * Tentativa anterior pulava o 1º render pra preservar anchors (#…), mas
 * isso fazia a Home aparecer no meio quando o browser restaurava posição
 * antiga (refresh, back, ou cache de scroll). Agora:
 *
 * - Desliga `history.scrollRestoration` (não deixa o browser restaurar)
 * - Roda na primeira render também — mas se a URL tem #anchor, deixa o
 *   navegador honrar o anchor sem mexer
 * - Roda imediatamente + via requestAnimationFrame (cobre paint tardio)
 * - Scrolla window, documentElement e body (cobre quirks de browser)
 */
export function ScrollTopOnNav() {
  const pathname = usePathname();

  // Desabilita scroll restoration do browser uma vez ao montar — assim
  // refresh/back/forward não tentam restaurar posição antiga.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if ("scrollRestoration" in window.history) {
      window.history.scrollRestoration = "manual";
    }
  }, []);

  useIsoLayoutEffect(() => {
    if (typeof window === "undefined") return;
    // Se vier com #anchor, deixa o browser posicionar lá
    if (window.location.hash) return;

    const scrollAllToTop = () => {
      window.scrollTo({ top: 0, left: 0, behavior: "instant" as ScrollBehavior });
      document.documentElement.scrollTop = 0;
      if (document.body) document.body.scrollTop = 0;
    };

    // 3 snaps escalonados que cobrem 95% dos casos sem segurar a main
    // thread:
    // - imediato (pre-paint via useLayoutEffect)
    // - 1º frame após paint
    // - ~200ms depois (cobre lazy-load próximo)
    scrollAllToTop();
    const raf = requestAnimationFrame(scrollAllToTop);
    const t = window.setTimeout(scrollAllToTop, 200);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(t);
    };
  }, [pathname]);

  return null;
}
