import { EmailLayout, Paragraph, PrimaryButton, StatBox } from "./layout";

export function TestEmail() {
  return (
    <EmailLayout
      preview="Configuração das notificações ok ✓"
      eyebrow="Teste de configuração"
      title="Tudo certo, o e-mail chegou."
    >
      <Paragraph>
        Se você está vendo essa mensagem, a integração com o Resend está
        funcionando direitinho. Os lembretes vão chegar nessa mesma caixa
        no horário programado.
      </Paragraph>

      <StatBox
        label="Status"
        value="Conectado"
        hint="Resend · onboarding@resend.dev"
      />

      <Paragraph>
        Você ainda pode ajustar destinatários, frequência e quais lembretes
        ficam ativos no painel de configurações.
      </Paragraph>

      <PrimaryButton href="/configuracoes/notificacoes">
        Abrir notificações
      </PrimaryButton>
    </EmailLayout>
  );
}
