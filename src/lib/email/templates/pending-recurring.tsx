import { EmailLayout, Paragraph, PrimaryButton, StatBox } from "./layout";

export type PendingRecurringPaymentsProps = {
  recipientName?: string | null;
  items: {
    name: string;
    status: "due" | "overdue";
    formattedDue: string;
    expectedAmount: string | null;
  }[];
  overdueCount: number;
  dueSoonCount: number;
  ruleId?: string;
};

export function PendingRecurringPaymentsEmail({
  recipientName,
  items,
  overdueCount,
  dueSoonCount,
  ruleId,
}: PendingRecurringPaymentsProps) {
  return (
    <EmailLayout
      preview={`${overdueCount > 0 ? `${overdueCount} atrasado(s) · ` : ""}${items.length} pagamento(s) pendente(s)`}
      title="Pagamentos recorrentes pendentes"
      ruleId={ruleId}
    >
      <Paragraph>
        {recipientName ? `Olá, ${recipientName}.` : "Olá."} Aqui estão os
        pagamentos recorrentes que ainda não foram marcados como pagos.
      </Paragraph>

      <div style={{ margin: "16px 0" }}>
        {overdueCount > 0 && <StatBox label="atrasados" value={String(overdueCount)} />}
        {dueSoonCount > 0 && <StatBox label="a vencer" value={String(dueSoonCount)} />}
      </div>

      <ul style={listStyle}>
        {items.map((it, i) => (
          <li key={i} style={listItemStyle}>
            <b style={{ color: it.status === "overdue" ? "#FF7A35" : "#E8E8E8" }}>
              {it.name}
            </b>
            {" — "}
            <span style={{ color: it.status === "overdue" ? "#FF7A35" : "#7A7A7A" }}>
              {it.formattedDue}
            </span>
            {it.expectedAmount && (
              <>
                {" · "}
                <span style={{ color: "#9C9C9C" }}>R$ {it.expectedAmount}</span>
              </>
            )}
          </li>
        ))}
      </ul>

      <PrimaryButton href="/financeiro/recorrentes">
        Marcar como pago →
      </PrimaryButton>
    </EmailLayout>
  );
}

const listStyle: React.CSSProperties = {
  fontSize: 14,
  color: "#E8E8E8",
  paddingLeft: 18,
  margin: "0 0 20px",
  lineHeight: 1.6,
};

const listItemStyle: React.CSSProperties = {
  marginBottom: 6,
};
