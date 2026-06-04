import { EmailLayout, Paragraph, PrimaryButton, StatBox } from "./layout";

export type PendingClassificationsProps = {
  recipientName?: string | null;
  pendingCount: number;
  oldestDays: number;
  ruleId?: string;
};

export function PendingClassificationsEmail({
  recipientName,
  pendingCount,
  oldestDays,
  ruleId,
}: PendingClassificationsProps) {
  return (
    <EmailLayout
      preview={`${pendingCount} transações aguardando sua revisão`}
      title="Lançamentos esperando classificação"
      ruleId={ruleId}
    >
      <Paragraph>
        {recipientName ? `Olá, ${recipientName}.` : "Olá."} O sistema acumulou
        transações que ainda não foram revisadas. Categorizar agora cria
        regras automáticas que aceleram os próximos extratos.
      </Paragraph>

      <div style={{ margin: "16px 0" }}>
        <StatBox label="pendentes" value={String(pendingCount)} />
        <StatBox label="dias acumulando" value={String(oldestDays)} />
      </div>

      <PrimaryButton href="/financeiro/transacoes?status=pending">
        Revisar pendentes →
      </PrimaryButton>
    </EmailLayout>
  );
}
