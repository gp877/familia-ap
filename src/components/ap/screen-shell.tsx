import type { ReactNode } from "react";

import { ChatInput, Insight, UserBubble } from "@/components/ap/atoms";

type Props = {
  userQ?: ReactNode;
  children: ReactNode;
  insight?: ReactNode;
  wide?: boolean; // se true, usa todo o espaço disponível no desktop
};

/**
 * ScreenShell — wrap padrão de cada tela.
 * Mobile: max 480px centrado · Desktop (lg+): até 4xl (~896px) ou 7xl se wide
 * Estrutura: user-bubble (opcional) → conteúdo → insight → chat input
 */
export function ScreenShell({ userQ, children, insight, wide }: Props) {
  return (
    <div
      className={`mx-auto flex w-full flex-col max-w-[480px] ${
        wide ? "lg:max-w-7xl" : "lg:max-w-4xl"
      }`}
      style={{ minHeight: "100%" }}
    >
      {userQ && <UserBubble>{userQ}</UserBubble>}
      <div style={{ flex: 1 }}>{children}</div>
      {insight && <Insight>{insight}</Insight>}
      <div style={{ paddingBottom: 16 }}>
        <ChatInput />
      </div>
    </div>
  );
}
