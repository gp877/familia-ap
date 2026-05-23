import { Pill, SectionRow } from "@/components/ap/atoms";
import { ScreenShell } from "@/components/ap/screen-shell";

const exams = [
  { d: "12 mai 26", name: "Check-up cardio", dr: "Dr. Salles", status: "ok" as const, note: "CK e CKMB normais", who: "A" },
  { d: "04 abr 26", name: "Sangue completo", dr: "Lab Sabin", status: "ok" as const, note: "Tudo dentro", who: "A" },
  { d: "18 fev 26", name: "Colesterol total", dr: "Lab Sabin", status: "atencao" as const, note: "LDL no limite alto", who: "A" },
  { d: "02 mai 26", name: "Mama · USG", dr: "Dra. Reis", status: "ok" as const, note: "Sem alterações", who: "C" },
  { d: "14 mar 26", name: "Tireoide · TSH", dr: "Lab Sabin", status: "ok" as const, note: "2,1 mUI/L", who: "C" },
];

export default function ExamesPage() {
  return (
    <ScreenShell
      userQ="Quando foi o último check-up nosso?"
      insight={
        <>
          Próximo check-up de <b>Augusto em 15 jun</b>. Já marquei lembrete três dias antes — quer convidar a Camila pra ir junto?
        </>
      }
    >
      <SubNav active="exames" />
      <SectionRow icon="file" label="Exames recentes" action="5 nos últimos 90 dias" />
      <div style={{ padding: "0 20px" }}>
        <div className="ap-num" style={{ fontSize: 32, color: "var(--ink)" }}>
          12 mai
        </div>
        <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4, display: "flex", alignItems: "center", gap: 8 }}>
          <span>Check-up cardio · Augusto</span>
          <Pill tone="ok">ok</Pill>
        </div>
      </div>

      <div style={{ padding: "14px 20px 0" }}>
        {exams.map((e, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              gap: 12,
              alignItems: "flex-start",
              padding: "12px 0",
              borderBottom: i < exams.length - 1 ? "0.5px solid var(--line-d)" : "none",
            }}
          >
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 16,
                background: e.who === "A" ? "var(--card2)" : "var(--accent)",
                color: e.who === "A" ? "var(--ink)" : "var(--accent-on)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 11,
                fontWeight: 700,
                flexShrink: 0,
              }}
            >
              {e.who}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "baseline",
                  gap: 8,
                }}
              >
                <span style={{ fontSize: 13.5, fontWeight: 600 }}>{e.name}</span>
                <span style={{ fontSize: 10.5, color: "var(--muted)", flexShrink: 0 }}>
                  {e.d}
                </span>
              </div>
              <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 1 }}>{e.dr}</div>
              <div style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 8 }}>
                <Pill tone={e.status === "ok" ? "ok" : "alert"}>
                  {e.status === "ok" ? "ok" : "atenção"}
                </Pill>
                <span style={{ fontSize: 11.5, color: "var(--ink-d)", opacity: 0.85 }}>
                  {e.note}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </ScreenShell>
  );
}

export function SubNav({ active }: { active: "exames" | "peso" }) {
  return (
    <div style={{ padding: "8px 20px 0", display: "flex", gap: 8 }}>
      <a
        href="/saude-exames"
        style={{
          padding: "6px 14px",
          borderRadius: 999,
          fontSize: 12,
          fontWeight: 600,
          background: active === "exames" ? "var(--card)" : "transparent",
          color: active === "exames" ? "var(--ink)" : "var(--muted-d)",
          textDecoration: "none",
        }}
      >
        Exames
      </a>
      <a
        href="/saude-peso"
        style={{
          padding: "6px 14px",
          borderRadius: 999,
          fontSize: 12,
          fontWeight: 600,
          background: active === "peso" ? "var(--card)" : "transparent",
          color: active === "peso" ? "var(--ink)" : "var(--muted-d)",
          textDecoration: "none",
        }}
      >
        Peso
      </a>
    </div>
  );
}
