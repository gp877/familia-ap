"use server";

import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { signIn, signOut } from "@/auth";
import { db } from "@/db";
import { households, sessions, users } from "@/db/schema";
import { SEED_CATEGORIES } from "@/db/seed-categories";
import { categories } from "@/db/schema";
import { seedDemoForHousehold } from "@/app/actions/mock";

const DEMO_EMAIL = "demo@familia-ap.local";
const DEMO_HOUSEHOLD_NAME = "Família AP · Demo";

export async function signInWithGoogle() {
  await signIn("google", { redirectTo: "/" });
}

export async function signOutAction() {
  await signOut({ redirectTo: "/login" });
}

/**
 * Login DEMO — sem Google, sem allowlist.
 *
 * Fluxo:
 *   1. Garante existência de um usuário "demo" + household demo isolado
 *      (não usa o household real da família — vive em paralelo).
 *   2. Popula o household demo com dados mockados (seedDemoForHousehold é
 *      idempotente, então rodar de novo não duplica).
 *   3. Cria uma session row no DB (database strategy do NextAuth) e seta
 *      o cookie `authjs.session-token` apontando pra ela.
 *   4. Redirect pra /.
 *
 * Importante: bypass total do allowlist e Google OAuth. Demo é público.
 * Múltiplos visitantes compartilham o MESMO household demo — dados
 * podem se sobrepor. Aceito pra fins de demonstração.
 */
export async function enterDemo() {
  // 1. Encontra ou cria usuário demo
  let demoUser = await db.query.users.findFirst({
    where: eq(users.email, DEMO_EMAIL),
  });

  if (!demoUser) {
    // Cria household isolado pro demo
    const [household] = await db
      .insert(households)
      .values({ name: DEMO_HOUSEHOLD_NAME })
      .returning();

    // Categorias iniciais
    for (const seed of SEED_CATEGORIES) {
      const { children, ...parentData } = seed;
      const [parent] = await db
        .insert(categories)
        .values({ ...parentData, householdId: household.id })
        .returning();
      if (children?.length) {
        await db.insert(categories).values(
          children.map((child) => ({
            ...child,
            householdId: household.id,
            parentId: parent.id,
          }))
        );
      }
    }

    const [created] = await db
      .insert(users)
      .values({
        email: DEMO_EMAIL,
        name: "Visitante demo",
        householdId: household.id,
      })
      .returning();
    demoUser = created;
  } else if (!demoUser.householdId) {
    // Recuperar: usuário existe mas perdeu o household (não deveria mas defensivo)
    const [household] = await db
      .insert(households)
      .values({ name: DEMO_HOUSEHOLD_NAME })
      .returning();
    await db
      .update(users)
      .set({ householdId: household.id })
      .where(eq(users.id, demoUser.id));
    demoUser = { ...demoUser, householdId: household.id };
  }

  // 2. Seed (idempotente — não duplica se já populou antes)
  if (demoUser.householdId) {
    try {
      await seedDemoForHousehold(demoUser.householdId, demoUser.id);
    } catch (err) {
      // não falha o login se o seed der erro — log e segue
      console.error("[enterDemo] seed falhou:", err);
    }
  }

  // 3. Cria session row + cookie
  const sessionToken = crypto.randomUUID();
  const expires = new Date(Date.now() + 1000 * 60 * 60 * 24); // 24h
  await db.insert(sessions).values({
    sessionToken,
    userId: demoUser.id,
    expires,
  });

  const isSecure = process.env.NODE_ENV === "production";
  const cookieName = isSecure ? "__Secure-authjs.session-token" : "authjs.session-token";
  const cookieStore = await cookies();
  cookieStore.set(cookieName, sessionToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: isSecure,
    path: "/",
    expires,
  });

  // 4. Vai pro app
  redirect("/");
}
