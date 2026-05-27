import type { ReactNode } from "react";

import { Insight } from "@/components/ap/atoms";
import { ChatBar } from "@/components/ap/chat-bar";

type Props = {
  /** @deprecated bubble de pergunta foi removido; prop mantida pra compat com call sites antigos */
  userQ?: ReactNode;
  children: ReactNode;
  insight?: ReactNode;
  wide?: boolean;
  hideChat?: boolean; // pra /chat que tem chat próprio
};

/**
 * ScreenShell — wrap padrão de cada tela.
 * Mobile: max 480px centrado · Desktop (lg+): até 4xl (~896px) ou 7xl se wide
 * Estrutura: conteúdo → insight → ChatBar (funcional)
 */
export function ScreenShell({ children, insight, wide, hideChat }: Props) {
  return (
    <div
      className={`mx-auto flex w-full flex-col max-w-[480px] ${
        wide ? "lg:max-w-7xl" : "lg:max-w-4xl"
      }`}
      style={{ minHeight: "100%" }}
    >
      <div style={{ flex: 1 }}>{children}</div>
      {insight && <Insight>{insight}</Insight>}
      {!hideChat && (
        <div style={{ paddingBottom: 16 }}>
          <ChatBar />
        </div>
      )}
    </div>
  );
}
