import { EmailLayout, Paragraph, PrimaryButton } from "./layout";

export type MissingStatementProps = {
  recipientName?: string | null;
  accountName: string;
  monthLabel: string; // ex: "junho de 2026"
  daysIntoMonth: number;
  ruleId?: string;
};

export function MissingStatementEmail({
  recipientName,
  accountName,
  monthLabel,
  daysIntoMonth,
  ruleId,
}: MissingStatementProps) {
  return (
    <EmailLayout
      preview={`Você ainda não enviou o extrato de ${monthLabel} (${accountName})`}
      title={`Falta o extrato de ${monthLabel}`}
      ruleId={ruleId}
    >
      <Paragraph>
        {recipientName ? `Olá, ${recipientName}.` : "Olá."} Hoje é dia{" "}
        {daysIntoMonth} do mês e a conta <b>{accountName}</b> ainda não tem
        extrato carregado.
      </Paragraph>
      <Paragraph>
        Subir o extrato cedo mantém a categorização em dia, o saldo correto e a
        IA com contexto completo do mês.
      </Paragraph>
      <PrimaryButton href="/financeiro/upload">
        Enviar extrato agora →
      </PrimaryButton>
    </EmailLayout>
  );
}
