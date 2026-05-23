import { BigNumber, SectionRow } from "@/components/ap/atoms";
import { ScreenShell } from "@/components/ap/screen-shell";

const events = [
  { d: "Hoje", t: "19:00", label: "Jantar com vó Inês", who: "Casal", tone: "accent" as const },
  { d: "Seg 25", t: "08:00", label: "Check-up Dra. Reis", who: "Camila", tone: "muted" as const },
  { d: "Qua 27", t: "22:05", label: "Voo SP → Lisboa", who: "Casal", tone: "accent" as const },
  { d: "Sex 29", t: "15:00", label: "Reunião condomínio", who: "Augusto", tone: "muted" as const },
  { d: "Dom 31", t: "09:00", label: "Caminhada juntos · 6km", who: "Casal", tone: "muted" as const },
];

export default function CalendarioPage() {
  return (
    <ScreenShell
      userQ="O que tem essa semana?"
      insight={
        <>
          Cinco compromissos. O <b>voo pra Lisboa</b> é o mais importante — check-in já liberado pelo app da LATAM.
        </>
      }
    >
      <SectionRow icon="cal" label="Próximos 7 dias" action="23 – 31 mai" />
      <BigNumber value="Hoje · 19h" sub="jantar com vó Inês · em 4h" accent />

      <div style={{ padding: "14px 20px 0" }}>
        {events.map((e, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              gap: 14,
              alignItems: "center",
              padding: "12px 0",
              borderBottom: i < events.length - 1 ? "0.5px solid var(--line-d)" : "none",
            }}
          >
            <div
              style={{
                width: 56,
                textAlign: "right",
                display: "flex",
                flexDirection: "column",
              }}
            >
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  color: "var(--muted)",
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                }}
              >
                {e.d}
              </span>
              <span
                className="ap-num"
                style={{
                  fontSize: 15,
                  color: e.tone === "accent" ? "var(--accent)" : "var(--ink)",
                  marginTop: 2,
                }}
              >
                {e.t}
              </span>
            </div>
            <div
              style={{
                width: 2,
                height: 30,
                background: e.tone === "accent" ? "var(--accent)" : "var(--line-d)",
              }}
            />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13.5, fontWeight: 600 }}>{e.label}</div>
              <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 1 }}>
                {e.who}
              </div>
            </div>
          </div>
        ))}
      </div>
    </ScreenShell>
  );
}
