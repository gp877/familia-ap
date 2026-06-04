import { EmailLayout, Paragraph, PrimaryButton, StatBox } from "./layout";

export type WeeklyDigestProps = {
  recipientName?: string | null;
  weekRange: string; // ex: "26/mai – 01/jun"
  txCount: number;
  totalDebit: string; // já formatado, ex: "12.345,67"
  totalCredit: string;
  topCategories: { name: string; amount: string }[]; // top 3
  pendingCount: number;
  ruleId?: string;
};

export function WeeklyDigestEmail({
  recipientName,
  weekRange,
  txCount,
  totalDebit,
  totalCredit,
  topCategories,
  pendingCount,
  ruleId,
}: WeeklyDigestProps) {
  return (
    <EmailLayout
      preview={`Resumo da semana: R$ ${totalDebit} em despesas`}
      title={`Resumo da semana ${weekRange}`}
      ruleId={ruleId}
    >
      <Paragraph>
        {recipientName ? `Olá, ${recipientName}.` : "Olá."} Aqui está o que
        aconteceu nas suas finanças entre {weekRange}.
      </Paragraph>

      <div style={{ margin: "16px 0" }}>
        <StatBox label="lançamentos" value={String(txCount)} />
        <StatBox label="saídas" value={`R$ ${totalDebit}`} />
        <StatBox label="entradas" value={`R$ ${totalCredit}`} />
      </div>

      {topCategories.length > 0 && (
        <>
          <Paragraph>
            <b>Top categorias da semana:</b>
          </Paragraph>
          <ul style={listStyle}>
            {topCategories.map((c, i) => (
              <li key={i} style={listItemStyle}>
                {c.name} — <b>R$ {c.amount}</b>
              </li>
            ))}
          </ul>
        </>
      )}

      {pendingCount > 0 && (
        <Paragraph>
          ⚠️ <b>{pendingCount}</b>{" "}
          {pendingCount === 1 ? "transação ainda aguarda" : "transações ainda aguardam"}{" "}
          classificação.
        </Paragraph>
      )}

      <PrimaryButton href="/financeiro/dre">
        Ver DRE completo →
      </PrimaryButton>
    </EmailLayout>
  );
}

const listStyle: React.CSSProperties = {
  fontSize: 14,
  color: "#E8E8E8",
  paddingLeft: 18,
  margin: "0 0 16px",
};

const listItemStyle: React.CSSProperties = {
  marginBottom: 4,
};
