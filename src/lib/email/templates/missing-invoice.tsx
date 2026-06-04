import { EmailLayout, Paragraph, PrimaryButton } from "./layout";

export type MissingInvoiceProps = {
  recipientName?: string | null;
  cardName: string;
  monthLabel: string;
  daysIntoMonth: number;
  ruleId?: string;
};

export function MissingInvoiceEmail({
  recipientName,
  cardName,
  monthLabel,
  daysIntoMonth,
  ruleId,
}: MissingInvoiceProps) {
  return (
    <EmailLayout
      preview={`Fatura de ${monthLabel} do ${cardName} ainda não foi enviada`}
      title={`Falta a fatura de ${monthLabel}`}
      ruleId={ruleId}
    >
      <Paragraph>
        {recipientName ? `Olá, ${recipientName}.` : "Olá."} Hoje é dia{" "}
        {daysIntoMonth} e a fatura do cartão <b>{cardName}</b> ainda não foi
        carregada no sistema.
      </Paragraph>
      <Paragraph>
        Suba o PDF da fatura e o sistema categoriza cada transação, vincula
        com o pagamento no extrato e atualiza o saldo automaticamente.
      </Paragraph>
      <PrimaryButton href="/financeiro/upload">
        Enviar fatura →
      </PrimaryButton>
    </EmailLayout>
  );
}
