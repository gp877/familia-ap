import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";

import * as schema from "./schema";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL not set");
}

/**
 * Pool via WebSocket — várias queries da mesma página reusam uma conexão.
 *
 * Antes (`drizzle-orm/neon-http`): cada `db.query.X` virava 1 HTTP request
 * separado pra Neon. Numa página com 5 queries em paralelo, isso é 5 TCP
 * handshakes + 5 TLS handshakes. ~150-300ms a mais por página.
 *
 * Agora (`drizzle-orm/neon-serverless` + Pool): a Vercel function abre 1
 * WebSocket pra Neon e despacha todas as queries naquela conexão. Reduz
 * round-trips, mantém pipelining.
 */
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Conexão idle é descartada rápido pra não segurar slot — serverless é
  // efêmero.
  idleTimeoutMillis: 5_000,
});

export const db = drizzle({ client: pool, schema, casing: "snake_case" });
