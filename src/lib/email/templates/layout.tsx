import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components";

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || "https://familia-ap.vercel.app";

/**
 * Layout base de todos os emails. Visual minimal e clean:
 * - Container 540px centrado
 * - Tipografia sans-serif do sistema
 * - Acento lima discreto no header
 * - Footer com link pro app e opção de pausar
 */
export function EmailLayout({
  preview,
  title,
  children,
  ruleId,
}: {
  preview: string;
  title: string;
  children: React.ReactNode;
  /** Se passado, mostra link "pausar este lembrete" no footer */
  ruleId?: string;
}) {
  return (
    <Html lang="pt-BR">
      <Head />
      <Preview>{preview}</Preview>
      <Body style={bodyStyle}>
        <Container style={containerStyle}>
          {/* Header com brand */}
          <Section style={{ padding: "0 0 20px" }}>
            <Text style={brandStyle}>FAMÍLIA AP</Text>
          </Section>

          {/* Conteúdo */}
          <Section style={{ paddingBottom: 24 }}>
            <Heading as="h1" style={titleStyle}>
              {title}
            </Heading>
            {children}
          </Section>

          {/* Footer */}
          <Section style={footerStyle}>
            <Text style={footerTextStyle}>
              <Link href={BASE_URL} style={footerLinkStyle}>
                Abrir o app
              </Link>
              {ruleId && (
                <>
                  {" · "}
                  <Link
                    href={`${BASE_URL}/configuracoes/notificacoes?pausar=${ruleId}`}
                    style={footerLinkStyle}
                  >
                    Pausar este lembrete
                  </Link>
                </>
              )}
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

export function PrimaryButton({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link href={href.startsWith("http") ? href : `${BASE_URL}${href}`} style={buttonStyle}>
      {children}
    </Link>
  );
}

export function StatBox({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div style={statBoxStyle}>
      <Text style={statLabelStyle}>{label}</Text>
      <Text style={statValueStyle}>{value}</Text>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Styles
// ────────────────────────────────────────────────────────────

const bodyStyle: React.CSSProperties = {
  background: "#0A0A0A",
  color: "#FAFAFA",
  fontFamily:
    "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif",
  margin: 0,
  padding: 0,
};

const containerStyle: React.CSSProperties = {
  maxWidth: 540,
  margin: "0 auto",
  padding: "32px 24px",
  background: "#141414",
};

const brandStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 800,
  letterSpacing: "0.14em",
  color: "#B8FF5C",
  margin: 0,
};

const titleStyle: React.CSSProperties = {
  fontSize: 22,
  fontWeight: 700,
  letterSpacing: "-0.02em",
  color: "#FAFAFA",
  margin: "0 0 16px",
  lineHeight: 1.2,
};

const paragraphStyle: React.CSSProperties = {
  fontSize: 14,
  lineHeight: 1.6,
  color: "#E8E8E8",
  margin: "0 0 12px",
};

const buttonStyle: React.CSSProperties = {
  display: "inline-block",
  padding: "10px 18px",
  background: "#B8FF5C",
  color: "#0A0A0A",
  fontWeight: 700,
  fontSize: 13.5,
  textDecoration: "none",
  borderRadius: 12,
  marginTop: 8,
};

const footerStyle: React.CSSProperties = {
  borderTop: "0.5px solid #333",
  paddingTop: 16,
  marginTop: 8,
};

const footerTextStyle: React.CSSProperties = {
  fontSize: 11,
  color: "#7A7A7A",
  margin: 0,
};

const footerLinkStyle: React.CSSProperties = {
  color: "#7A7A7A",
  textDecoration: "underline",
};

const statBoxStyle: React.CSSProperties = {
  display: "inline-block",
  padding: "10px 14px",
  background: "#1C1C1C",
  borderRadius: 10,
  marginRight: 8,
  marginBottom: 8,
};

const statLabelStyle: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 600,
  letterSpacing: "0.08em",
  color: "#7A7A7A",
  textTransform: "uppercase",
  margin: 0,
};

const statValueStyle: React.CSSProperties = {
  fontSize: 18,
  fontWeight: 800,
  color: "#FAFAFA",
  margin: "2px 0 0",
  letterSpacing: "-0.02em",
};
