"use client";

import * as Sentry from "@sentry/nextjs";
import NextError from "next/error";
import { useEffect } from "react";

/**
 * GlobalError boundary — catch errors no ROOT layout (acima do (app)/layout).
 * Sem isso, erros do root passam silenciosamente em produção.
 *
 * O `(app)/error.tsx` continua capturando erros das páginas dentro de (app),
 * mas erros do root (ex: auth setup quebrado, root provider) caem aqui.
 *
 * Renderiza a UI padrão de erro do Next porque o root layout pode estar
 * quebrado — usar nossos próprios componentes pode falhar também.
 */
export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="pt-BR">
      <body>
        <NextError statusCode={0} />
      </body>
    </html>
  );
}
