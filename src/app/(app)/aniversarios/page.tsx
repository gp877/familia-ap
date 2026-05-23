import { SectionRow } from "@/components/ap/atoms";
import { ScreenShell } from "@/components/ap/screen-shell";

const dates = [
  { name: "Vó Inês", d: "26 mai", days: 3, detail: "faz 78 · avó da Camila" },
  { name: "Augusto + Camila", d: "14 jun", days: 22, detail: "12 anos de casados" },
  { name: "Pedro Piffer", d: "02 jul", days: 40, detail: "sobrinho · 8 anos" },
  { name: "Camila", d: "11 ago", days: 80, detail: "esposa · 40 anos" },
  { name: "Sogro", d: "03 set", days: 103, detail: "pai da Camila · 72 anos" },
];

export default function AniversariosPage() {
  return (
    <ScreenShell
      userQ="Quem faz aniversário esse mês?"
      insight={
        <>
          Vó Inês <b>em 3 dias</b>. Já tem presente? Ano passado vocês deram um xale — eu lembro se quiser uma sugestão.
        </>
      }
    >
      <SectionRow icon="cake" label="Próximos 5" action="3 meses" />
      <div style={{ padding: "0 20px" }}>
        <div className="ap-num" style={{ fontSize: 36, color: "var(--accent)" }}>
          3 dias
        </div>
        <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>
          até o aniversário da vó Inês · faz 78
        </div>
      </div>

      <div style={{ padding: "14px 20px 0" }}>
        {dates.map((d, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              gap: 14,
              alignItems: "center",
              padding: "12px 0",
              borderBottom: i < dates.length - 1 ? "0.5px solid var(--line-d)" : "none",
            }}
          >
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                background: i === 0 ? "var(--accent)" : "var(--card2)",
                color: i === 0 ? "var(--accent-on)" : "var(--ink)",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <span className="ap-num" style={{ fontSize: 14, lineHeight: 1 }}>
                {d.d.split(" ")[0]}
              </span>
              <span
                style={{
                  fontSize: 8,
                  fontWeight: 700,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  marginTop: 2,
                }}
              >
                {d.d.split(" ")[1]}
              </span>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 700 }}>{d.name}</div>
              <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>
                {d.detail}
              </div>
            </div>
            <span style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600 }}>
              {d.days < 10 ? `em ${d.days}d` : `${d.days}d`}
            </span>
          </div>
        ))}
      </div>
    </ScreenShell>
  );
}
