import { EmailLayout, Paragraph, PrimaryButton } from "./layout";

export function TestEmail() {
  return (
    <EmailLayout
      preview="Teste de configuração das notificações"
      title="Configuração ok ✓"
    >
      <Paragraph>
        Se você está vendo esse e-mail, a integração com o Resend está
        funcionando. As notificações configuradas em{" "}
        <b>/configuracoes/notificacoes</b> vão chegar normalmente no horário
        programado.
      </Paragraph>
      <PrimaryButton href="/configuracoes/notificacoes">
        Ver minhas notificações →
      </PrimaryButton>
    </EmailLayout>
  );
}
