import { BigNumber, Card, SectionRow, Sparkline } from "@/components/ap/atoms";
import { ScreenShell } from "@/components/ap/screen-shell";
import { SubNav } from "@/app/(app)/saude-exames/page";

const augustoData = [86.4, 86.0, 85.8, 85.3, 85.0, 84.7, 84.4, 84.1, 83.8, 84.0, 83.6, 83.4];
const camilaData = [62.2, 62.4, 62.0, 61.8, 61.6, 61.5, 61.3, 61.5, 61.2, 61.0, 60.9, 60.7];

export default function PesoPage() {
  return (
    <ScreenShell
      userQ="Como tá o peso nosso essas semanas?"
      insight={
        <>
          Vocês perderam <b>4,5 kg juntos</b> em 12 semanas. Augusto a 1,4 kg da meta — manda eu lembrar de pesar no domingo?
        </>
      }
    >
      <SubNav active="peso" />
      <SectionRow icon="weight" label="Últimas 12 semanas" action="12 sem" />
      <BigNumber value="−4,5 kg" sub="vocês dois · desde 1º março" />

      <div style={{ padding: "14px 20px 0" }}>
        <Card pad={14} raised>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "baseline",
              marginBottom: 10,
            }}
          >
            <span style={{ fontSize: 12, color: "var(--muted)" }}>Augusto · 83,4 kg</span>
            <span
              style={{
                fontSize: 11,
                color: "var(--ok)",
                fontWeight: 700,
                letterSpacing: "0.08em",
              }}
            >
              ▼ 3,0 kg
            </span>
          </div>
          <Sparkline data={augustoData} w={320} h={48} color="var(--accent)" fill />
        </Card>
        <div style={{ height: 10 }} />
        <Card pad={14} raised>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "baseline",
              marginBottom: 10,
            }}
          >
            <span style={{ fontSize: 12, color: "var(--muted)" }}>Camila · 60,7 kg</span>
            <span
              style={{
                fontSize: 11,
                color: "var(--ok)",
                fontWeight: 700,
                letterSpacing: "0.08em",
              }}
            >
              ▼ 1,5 kg
            </span>
          </div>
          <Sparkline data={camilaData} w={320} h={48} color="#5DA9FF" fill />
        </Card>
      </div>

      <div style={{ padding: "14px 20px 0", display: "flex", gap: 10 }}>
        <Card pad={12} style={{ flex: 1 }}>
          <div className="ap-num" style={{ fontSize: 22, color: "var(--accent)" }}>
            83%
          </div>
          <div style={{ fontSize: 10.5, color: "var(--muted)", marginTop: 4 }}>
            Meta de Augusto · 82 kg
          </div>
        </Card>
        <Card pad={12} style={{ flex: 1 }}>
          <div className="ap-num" style={{ fontSize: 22 }}>
            4×
          </div>
          <div style={{ fontSize: 10.5, color: "var(--muted)", marginTop: 4 }}>
            Caminhadas nesta semana
          </div>
        </Card>
      </div>
    </ScreenShell>
  );
}
