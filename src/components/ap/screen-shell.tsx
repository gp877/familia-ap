import type { ReactNode } from "react";

import { ChatInput, Insight, UserBubble } from "@/components/ap/atoms";

type Props = {
  userQ?: ReactNode;
  children: ReactNode;
  insight?: ReactNode;
};

/**
 * ScreenShell — wrap padrão de cada tela.
 * Estrutura: user-bubble (opcional) → conteúdo scrollável → insight da AP → chat input.
 * O header (módulo + chips) é responsabilidade do layout principal (MobileTop ou WebSidebar).
 */
export function ScreenShell({ userQ, children, insight }: Props) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        minHeight: "100%",
        maxWidth: 480,
        margin: "0 auto",
        width: "100%",
      }}
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
