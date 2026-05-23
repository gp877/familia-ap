import { BigNumber, Card, Progress, SectionRow } from "@/components/ap/atoms";
import { ScreenShell } from "@/components/ap/screen-shell";

const dreams = [
  { title: "Meia-maratona do Rio", pct: 84, sub: "12 km feitos · 4×/sem", deadline: "ago/26", who: "Augusto" },
  { title: "Itália em maio", pct: 62, sub: "R$ 18.600 reservado", deadline: "em 12 meses", who: "Casal" },
  { title: "Aprender italiano", pct: 41, sub: "Nível A2 · Duolingo 220d", deadline: "sem prazo", who: "Camila" },
  { title: "Casa na praia", pct: 38, sub: "R$ 76 mil de R$ 200 mil", deadline: "até 2028", who: "Casal" },
];

export default function SonhosPage() {
  return (
    <ScreenShell
      userQ="O que a gente mais quer pros próximos 3 anos?"
      insight={
        <>
          A <b>meia-maratona tá quase</b> — se você bater 14km no domingo, passa de 90%. E se sobrar R$ 600/mês, a Itália vira em fevereiro.
        </>
      }
    >
      <SectionRow icon="star" label="4 sonhos em andamento" action="2 com prazo" />
      <BigNumber value="84%" sub="meia-maratona do Rio · agosto" accent />

      <div
        style={{
          padding: "14px 20px 0",
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        {dreams.map((d, i) => (
          <Card key={i} pad={14} raised>
            <div
              style={{
                display: "flex",
                alignItems: "baseline",
                justifyContent: "space-between",
                gap: 10,
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 9.5,
                    fontWeight: 700,
                    letterSpacing: "0.18em",
                    textTransform: "uppercase",
                    color: "var(--muted)",
                  }}
                >
                  {d.deadline} · {d.who}
                </div>
                <div
                  style={{
                    fontSize: 17,
                    fontWeight: 700,
                    color: "var(--ink)",
                    marginTop: 4,
                    letterSpacing: "-0.01em",
                  }}
                >
                  {d.title}
                </div>
                <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 2 }}>
                  {d.sub}
                </div>
              </div>
              <div
                className="ap-num"
                style={{
                  fontSize: 22,
                  color: d.pct >= 80 ? "var(--accent)" : "var(--ink)",
                }}
              >
                {d.pct}%
              </div>
            </div>
            <div style={{ marginTop: 10 }}>
              <Progress
                value={d.pct}
                color={d.pct >= 80 ? "var(--accent)" : "var(--ink-d)"}
                h={3}
              />
            </div>
          </Card>
        ))}
      </div>
    </ScreenShell>
  );
}
