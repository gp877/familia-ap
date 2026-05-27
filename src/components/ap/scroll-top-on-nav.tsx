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
      // Caso o main ou outro container tenha overflow específico:
      const mains = document.querySelectorAll<HTMLElement>("main");
      for (const m of mains) m.scrollTop = 0;
    };

    // Imediato (antes do paint, via useLayoutEffect)
    scrollAllToTop();
    // E novamente após o próximo paint
    requestAnimationFrame(scrollAllToTop);
    // Snap-back agressivo: a cada 60ms por 1.2s qualquer scroll que
    // tente acontecer (lazy-load de imagem, hidratamento tardio,
    // restauração do browser) é vencido.
    let elapsed = 0;
    const interval = window.setInterval(() => {
      scrollAllToTop();
      elapsed += 60;
      if (elapsed >= 1200) window.clearInterval(interval);
    }, 60);
    return () => window.clearInterval(interval);
  }, [pathname]);

  return null;
}
