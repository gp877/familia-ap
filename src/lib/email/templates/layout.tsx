import {
  Body,
  Container,
  Font,
  Head,
  Heading,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components";

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || "https://familia-ap.vercel.app";

/**
 * Layout base de todos os emails — espelho do visual do app:
 * fundo preto profundo, card escuro arredondado, acento lima (Gabriel)
 * ou rosa (Marília) destacando o brand. Logo "ap." em cursive como
 * no header do app, tagline em uppercase abaixo.
 */
export function EmailLayout({
  preview,
  title,
  eyebrow,
  children,
  ruleId,
  accent = "lima",
}: {
  preview: string;
  title: string;
  /** Texto pequeno em uppercase acima do título (ex: "TESTE DE CONFIGURAÇÃO") */
  eyebrow?: string;
  children: React.ReactNode;
  /** Se passado, mostra link "pausar este lembrete" no footer */
  ruleId?: string;
  /** Acento de cor — lima (Gabriel/default) ou rosa (Marília) */
  accent?: "lima" | "rosa";
}) {
  const accentColor = accent === "rosa" ? ROSA : LIMA;
  return (
    <Html lang="pt-BR">
      <Head>
        <Font
          fontFamily="Caveat"
          fallbackFontFamily={["cursive"]}
          webFont={{
            url: "https://fonts.gstatic.com/s/caveat/v18/Wnz6HAc5bAfYB2QRah7pcpNvOx-pjfJ9.woff2",
            format: "woff2",
          }}
          fontWeight={700}
          fontStyle="normal"
        />
        <Font
          fontFamily="Inter"
          fallbackFontFamily={["Helvetica", "Arial", "sans-serif"]}
          webFont={{
            url: "https://fonts.gstatic.com/s/inter/v13/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMa1ZL7.woff2",
            format: "woff2",
          }}
          fontWeight={400}
          fontStyle="normal"
        />
      </Head>
      <Preview>{preview}</Preview>
      <Body style={bodyStyle}>
        {/* Wrapper escuro full-bleed — alguns clientes (Gmail) usam essa
            margem como cor de fundo do panel. */}
        <Container style={outerStyle}>
          {/* Card principal — replica visual dos Card do app */}
          <Container style={cardStyle}>
            {/* Brand row — logo "ap" + tagline */}
            <Section style={brandRowStyle}>
              <Text style={apStyle}>
                <span style={{ color: accentColor }}>ap</span>
                <span style={{ color: INK }}>.</span>
              </Text>
              <Text style={taglineStyle}>FAMÍLIA AUGUSTO PIFFER</Text>
            </Section>

            {/* Linha decorativa lima fina */}
            <Hr style={{ ...accentRuleStyle, borderColor: accentColor }} />

            {/* Eyebrow opcional */}
            {eyebrow && (
              <Text style={{ ...eyebrowStyle, color: accentColor }}>{eyebrow}</Text>
            )}

            {/* Título principal */}
            <Heading as="h1" style={titleStyle}>
              {title}
            </Heading>

            {/* Conteúdo */}
            <Section style={contentStyle}>{children}</Section>
          </Container>

          {/* Footer fora do card — mini logo + links */}
          <Section style={footerStyle}>
            <Text style={footerBrandStyle}>
              <span style={{ color: accentColor, fontWeight: 700 }}>ap</span>
              <span style={{ color: MUTED }}>.</span>
            </Text>
            <Text style={footerTextStyle}>
              <Link href={BASE_URL} style={footerLinkStyle}>
                Abrir o app
              </Link>
              {ruleId && (
                <>
                  <span style={footerSeparator}> · </span>
                  <Link
                    href={`${BASE_URL}/configuracoes/notificacoes?pausar=${ruleId}`}
                    style={footerLinkStyle}
                  >
                    Pausar este lembrete
                  </Link>
                </>
              )}
            </Text>
            <Text style={footerNoteStyle}>
              Família AP · gestão financeira + dia-a-dia da casa
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

// ────────────────────────────────────────────────────────────
// Atoms reutilizáveis
// ────────────────────────────────────────────────────────────

export function Paragraph({ children }: { children: React.ReactNode }) {
  return <Text style={paragraphStyle}>{children}</Text>;
}

/**
 * Botão CTA principal — pílula bem arredondada, acento lima sobre
 * preto. Aceita href relativo (vira absoluto via BASE_URL) ou absoluto.
 */
export function PrimaryButton({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Section style={{ paddingTop: 8, paddingBottom: 4 }}>
      <Link
        href={href.startsWith("http") ? href : `${BASE_URL}${href}`}
        style={buttonStyle}
      >
        {children}
      </Link>
    </Section>
  );
}

/**
 * Card destacado pra mostrar uma métrica/destaque dentro do email
 * (ex: "R$ 12.102,37 · fatura vencendo em 3d"). Espelha o BigNumber
 * do app.
 */
export function StatBox({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <Section style={statBoxStyle}>
      <Text style={statLabelStyle}>{label}</Text>
      <Text style={statValueStyle}>{value}</Text>
      {hint && <Text style={statHintStyle}>{hint}</Text>}
    </Section>
  );
}

// ────────────────────────────────────────────────────────────
// Tokens
// ────────────────────────────────────────────────────────────

const BG = "#0A0A0A"; // var(--bg)
const SURF = "#141414"; // var(--surf)
const CARD = "#1C1C1C"; // var(--card)
const INK = "#FAFAFA"; // var(--ink)
const INK_D = "#E8E8E8"; // var(--ink-d)
const MUTED = "#7A7A7A"; // var(--muted)
const MUTED_D = "#9C9C9C"; // var(--muted-d)
const LINE_D = "#333333"; // var(--line-d)
const LIMA = "#B8FF5C"; // var(--accent) lima
const ROSA = "#FF8FB1"; // var(--accent) rosa (Marília)

// ────────────────────────────────────────────────────────────
// Styles
// ────────────────────────────────────────────────────────────

const SYS_FONT =
  "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";

const SCRIPT_FONT = "Caveat, 'Brush Script MT', cursive";

const bodyStyle: React.CSSProperties = {
  background: BG,
  color: INK,
  fontFamily: SYS_FONT,
  margin: 0,
  padding: 0,
};

const outerStyle: React.CSSProperties = {
  background: BG,
  maxWidth: 600,
  margin: "0 auto",
  padding: "32px 16px 24px",
};

const cardStyle: React.CSSProperties = {
  background: SURF,
  borderRadius: 24,
  padding: "32px 28px 36px",
  border: `0.5px solid ${LINE_D}`,
};

const brandRowStyle: React.CSSProperties = {
  padding: 0,
  marginBottom: 4,
};

const apStyle: React.CSSProperties = {
  fontFamily: SCRIPT_FONT,
  fontSize: 56,
  fontWeight: 700,
  lineHeight: 0.85,
  letterSpacing: "-0.02em",
  margin: 0,
  padding: 0,
};

const taglineStyle: React.CSSProperties = {
  fontSize: 9,
  fontWeight: 700,
  letterSpacing: "0.22em",
  textTransform: "uppercase",
  color: MUTED,
  margin: "4px 0 0",
  padding: 0,
};

const accentRuleStyle: React.CSSProperties = {
  border: "none",
  borderTop: "1.5px solid",
  width: 36,
  margin: "18px 0 18px",
};

const eyebrowStyle: React.CSSProperties = {
  fontSize: 10.5,
  fontWeight: 800,
  letterSpacing: "0.14em",
  textTransform: "uppercase",
  margin: "0 0 8px",
};

const titleStyle: React.CSSProperties = {
  fontSize: 28,
  fontWeight: 800,
  letterSpacing: "-0.02em",
  color: INK,
  lineHeight: 1.15,
  margin: "0 0 18px",
};

const contentStyle: React.CSSProperties = {
  padding: 0,
};

const paragraphStyle: React.CSSProperties = {
  fontSize: 14.5,
  lineHeight: 1.65,
  color: INK_D,
  margin: "0 0 14px",
};

const buttonStyle: React.CSSProperties = {
  display: "inline-block",
  padding: "12px 22px",
  background: LIMA,
  color: BG,
  fontFamily: SYS_FONT,
  fontWeight: 800,
  fontSize: 13.5,
  letterSpacing: "-0.01em",
  textDecoration: "none",
  borderRadius: 999,
};

const statBoxStyle: React.CSSProperties = {
  background: CARD,
  borderRadius: 16,
  padding: "14px 16px",
  margin: "8px 0 12px",
  border: `0.5px solid ${LINE_D}`,
};

const statLabelStyle: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: "0.08em",
  color: MUTED_D,
  textTransform: "uppercase",
  margin: 0,
};

const statValueStyle: React.CSSProperties = {
  fontSize: 24,
  fontWeight: 800,
  color: INK,
  margin: "4px 0 0",
  letterSpacing: "-0.02em",
};

const statHintStyle: React.CSSProperties = {
  fontSize: 11.5,
  fontWeight: 600,
  color: MUTED_D,
  margin: "4px 0 0",
};

const footerStyle: React.CSSProperties = {
  padding: "20px 28px 8px",
  textAlign: "center" as const,
};

const footerBrandStyle: React.CSSProperties = {
  fontFamily: SCRIPT_FONT,
  fontSize: 22,
  lineHeight: 1,
  margin: "0 0 8px",
};

const footerTextStyle: React.CSSProperties = {
  fontSize: 11.5,
  color: MUTED_D,
  margin: 0,
};

const footerSeparator: React.CSSProperties = {
  color: LINE_D,
  margin: "0 4px",
};

const footerLinkStyle: React.CSSProperties = {
  color: MUTED_D,
  textDecoration: "underline",
  fontWeight: 600,
};

const footerNoteStyle: React.CSSProperties = {
  fontSize: 10,
  color: MUTED,
  margin: "10px 0 0",
  letterSpacing: "0.04em",
};
