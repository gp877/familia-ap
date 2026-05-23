import { BigNumber, Card, ListRow, Pill, Progress, SectionRow } from "@/components/ap/atoms";
import { ScreenShell } from "@/components/ap/screen-shell";

const trips = [
  { city: "Buenos Aires", country: "AR", dates: "12–17 fev", nights: 5, status: "feito" },
  { city: "Maragogi", country: "BR", dates: "4–10 abr", nights: 6, status: "feito" },
  { city: "Lisboa+Porto", country: "PT", dates: "27 mai–10 jun", nights: 14, status: "próxima" as const },
];

export default function ViagensPage() {
  return (
    <ScreenShell
      userQ="Como tá o ano de viagens?"
      insight={
        <>
          Em 4 dias vocês embarcam pra <b>Lisboa</b>. Faltam 2 reservas de restaurante no roteiro — quer que eu liste?
        </>
      }
    >
      <SectionRow icon="plane" label="Resumo de 2026" action="3 destinos" />
      <BigNumber value="25 noites" sub="14k km · 3 cidades · 2 países" />

      <div
        style={{
          padding: "14px 20px 0",
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        {trips.map((t, i) => (
          <Card
            key={i}
            pad={14}
            raised={t.status === "próxima"}
            style={{ display: "flex", gap: 14, alignItems: "center" }}
          >
            <div
              style={{
                width: 52,
                height: 52,
                borderRadius: 14,
                background:
                  t.status === "próxima" ? "var(--accent)" : "var(--card2)",
                color: t.status === "próxima" ? "var(--accent-on)" : "var(--ink)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: 800,
                fontSize: 17,
                letterSpacing: "-0.02em",
                flexShrink: 0,
              }}
            >
              {t.country}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  justifyContent: "space-between",
                  gap: 8,
                }}
              >
                <span style={{ fontSize: 15, fontWeight: 700, letterSpacing: "-0.01em" }}>
                  {t.city}
                </span>
                {t.status === "próxima" && <Pill tone="accent">próxima</Pill>}
              </div>
              <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 3 }}>
                {t.dates} · {t.nights} noites
              </div>
            </div>
          </Card>
        ))}
      </div>

      <SectionRow icon="bank" label="Orçamento da viagem" action={null} />
      <div style={{ padding: "0 20px" }}>
        <ListRow
          title="Reservado"
          sub="meta · R$ 12.000"
          value="R$ 6.450"
          valueSub="54%"
          last
        />
        <Progress value={54} h={3} color="var(--accent)" />
      </div>
    </ScreenShell>
  );
}
