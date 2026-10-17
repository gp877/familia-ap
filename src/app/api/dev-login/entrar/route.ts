import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/db";
import { sessions, users } from "@/db/schema";
import { emailPermitido, isPreview, lerPasse } from "@/lib/dev-login";
import { ensureUserHasHousehold } from "@/lib/household";

/** Só no ambiente de teste: confere o passe vindo da produção e abre a sessão no banco de teste. */
export async function GET(req: Request) {
  if (!isPreview()) return new NextResponse("Not found", { status: 404 });
  const passe = lerPasse(new URL(req.url).searchParams.get("passe") ?? "");
  if (!passe || !emailPermitido(passe.email)) return new NextResponse("Passe inválido ou vencido. Volte e clique de novo.", { status: 403 });

  const email = passe.email.toLowerCase();
  let user = await db.query.users.findFirst({ where: eq(users.email, email) });
  if (!user) [user] = await db.insert(users).values({ email, name: passe.name, image: passe.image }).returning();
  await ensureUserHasHousehold(user.id);

  const sessionToken = randomUUID();
  const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  await db.insert(sessions).values({ sessionToken, userId: user.id, expires });

  const res = NextResponse.redirect(new URL("/tarefas", req.url));
  res.cookies.set("__Secure-authjs.session-token", sessionToken, { httpOnly: true, sameSite: "lax", secure: true, path: "/", expires });
  return res;
}
