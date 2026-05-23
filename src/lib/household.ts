import { eq } from "drizzle-orm";

import { db } from "@/db";
import { SEED_CATEGORIES } from "@/db/seed-categories";
import { categories, households, users } from "@/db/schema";

/**
 * Garante que o usuário está vinculado a um household.
 * Idempotente — chamado em `events.signIn` do Auth.js.
 *
 * Lógica:
 * 1. Se o user já tem householdId, retorna.
 * 2. Se já existe algum household, atribui o user a ele (modelo "casal compartilha 1 household").
 * 3. Se não existe nenhum, cria "Família AP" + seed de categorias + atribui o user.
 */
export async function ensureUserHasHousehold(userId: string): Promise<void> {
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
  });

  if (!user || user.householdId) return;

  let household = await db.query.households.findFirst();

  if (!household) {
    const [created] = await db
      .insert(households)
      .values({ name: "Família AP" })
      .returning();
    household = created;

    // Seed inicial de categorias só na primeira criação do household
    await seedCategoriesForHousehold(household.id);
  }

  await db
    .update(users)
    .set({ householdId: household.id })
    .where(eq(users.id, userId));
}

async function seedCategoriesForHousehold(householdId: string): Promise<void> {
  for (const seed of SEED_CATEGORIES) {
    const { children, ...parentData } = seed;

    const [parent] = await db
      .insert(categories)
      .values({ ...parentData, householdId })
      .returning();

    if (children?.length) {
      await db.insert(categories).values(
        children.map((child) => ({
          ...child,
          householdId,
          parentId: parent.id,
        }))
      );
    }
  }
}
