"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

/**
 * Scrolla pra o topo da página em TODA mudança de rota (pathname).
 *
 * Implementação anterior chamava `window.scrollTo` só uma vez em useEffect.
 * Problema: o Next.js às vezes restaura a posição de scroll depois do
 * effect, jogando a página de volta pro meio. E nem todos os browsers
 * scrollam o mesmo elemento (window vs documentElement vs body).
 *
 * Solução:
 *   - Detecta mudança real de pathname (ignora search params, que servem
 *     para drill-down como `?day=` no calendário)
 *   - requestAnimationFrame pra rodar APÓS o paint, vencendo eventual
 *     restauração do Next.js
 *   - Scrolla window + documentElement + body (cobre todos os casos)
 */
export function ScrollTopOnNav() {
  const pathname = usePathname();
  const prevPathRef = useRef<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    // Primeira renderização: marca o pathname e não scrolla (mantém deep-link
    // anchors funcionando se o user vier de um link externo)
    if (prevPathRef.current === null) {
      prevPathRef.current = pathname;
      return;
    }
    if (prevPathRef.current === pathname) return;
    prevPathRef.current = pathname;

    const scrollAllToTop = () => {
      window.scrollTo({ top: 0, left: 0, behavior: "instant" as ScrollBehavior });
      document.documentElement.scrollTop = 0;
      if (document.body) document.body.scrollTop = 0;
    };

    // Roda 2x — uma agora, outra após o próximo paint — pra vencer qualquer
    // restauração de scroll que o framework faça depois do nosso effect.
    scrollAllToTop();
    requestAnimationFrame(scrollAllToTop);
  }, [pathname]);

  return null;
}
