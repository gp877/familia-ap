import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Entrada no ambiente de teste (Vercel Preview, branch `dev`) sem Google:
 * a produção, com a pessoa já logada, assina um passe de 2 minutos com o
 * segredo compartilhado; o teste confere o passe e abre a sessão no banco
 * de teste. Produção lê o segredo de AUTH_SECRET_1; o teste, de AUTH_SECRET
 * (os dois têm o mesmo valor).
 */
export const DEV_URL = "https://familia-ap-git-dev-familia-ap.vercel.app";
export const isPreview = () => process.env.VERCEL_ENV === "preview";

type Passe = { email: string; name: string | null; image: string | null; exp: number };

function segredo() {
  const s = isPreview() ? process.env.AUTH_SECRET : process.env.AUTH_SECRET_1;
  if (!s) throw new Error("segredo do ambiente de teste não configurado");
  return s;
}

const assinar = (corpo: string) => createHmac("sha256", segredo()).update(corpo).digest("base64url");

export function criarPasse(p: Omit<Passe, "exp">): string {
  const corpo = Buffer.from(JSON.stringify({ ...p, exp: Date.now() + 120_000 })).toString("base64url");
  return `${corpo}.${assinar(corpo)}`;
}

export function lerPasse(passe: string): Passe | null {
  const [corpo, assinatura] = passe.split(".");
  if (!corpo || !assinatura) return null;
  const esperado = Buffer.from(assinar(corpo));
  const recebido = Buffer.from(assinatura);
  if (esperado.length !== recebido.length || !timingSafeEqual(esperado, recebido)) return null;
  try {
    const p = JSON.parse(Buffer.from(corpo, "base64url").toString("utf8")) as Passe;
    return typeof p.email === "string" && p.exp > Date.now() ? p : null;
  } catch {
    return null;
  }
}

export function emailPermitido(email: string) {
  return (process.env.ALLOWED_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
    .includes(email.toLowerCase());
}
