import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { criarPasse, DEV_URL, emailPermitido, isPreview } from "@/lib/dev-login";

/** Produção → ambiente de teste: quem está logado aqui entra lá já logado. */
export async function GET(req: Request) {
  if (isPreview()) return NextResponse.redirect(new URL("/", req.url));
  const session = await auth();
  const email = session?.user?.email;
  if (!email) return NextResponse.redirect(new URL("/login", req.url));
  if (!emailPermitido(email)) return new NextResponse("Sem acesso", { status: 403 });
  const passe = criarPasse({ email, name: session.user?.name ?? null, image: session.user?.image ?? null });
  return NextResponse.redirect(`${DEV_URL}/api/dev-login/entrar?passe=${encodeURIComponent(passe)}`);
}
