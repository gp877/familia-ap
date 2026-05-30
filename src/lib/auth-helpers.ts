import { eq } from "drizzle-orm";
import { cache } from "react";

import { auth } from "@/auth";
import { db } from "@/db";
import { users } from "@/db/schema";

/**
 * Lê o usuário atual + household dele, com `cache()` por request.
 *
 * Por que: o layout `(app)` e cada page chamam `auth()` + `db.query.users
 * .findFirst()`. Sem cache, isso é 2x cada (e às vezes 3x) no mesmo
 * request — round-trips desnecessários ao Neon. Com `cache()`, a primeira
 * chamada faz o trabalho e as próximas no mesmo request leem o resultado
 * memoizado.
 *
 * Comportamento: retorna `null` se não estiver autenticado ou sem
 * household. Use `requireUserAndHousehold()` se quiser lançar erro.
 */
export const getCurrentUser = cache(async () => {
  const session = await auth();
  if (!session?.user?.id) return null;
  const dbUser = await db.query.users.findFirst({
    where: eq(users.id, session.user.id),
  });
  if (!dbUser?.householdId) return null;
  return {
    userId: dbUser.id,
    householdId: dbUser.householdId,
    email: dbUser.email,
    name: dbUser.name,
    phone: dbUser.phone,
  };
});

/**
 * Mesma coisa que `getCurrentUser`, mas lança Error se não estiver
 * autenticado. Use em server actions.
 */
export async function requireUserAndHousehold() {
  const u = await getCurrentUser();
  if (!u) throw new Error("Não autenticado ou sem household");
  return u;
}
