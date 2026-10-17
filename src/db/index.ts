import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";

import * as schema from "./schema";

/**
 * Ambiente de teste (Vercel Preview, branch `dev`) usa o banco próprio
 * DEV_DATABASE_URL e NUNCA cai no de produção: sem ele, falha.
 */
const isPreview = process.env.VERCEL_ENV === "preview";
const databaseUrl = isPreview ? process.env.DEV_DATABASE_URL : process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error(isPreview ? "DEV_DATABASE_URL not set (preview nunca usa o banco de produção)" : "DATABASE_URL not set");
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
  connectionString: databaseUrl,
  // Conexão idle é descartada rápido pra não segurar slot — serverless é
  // efêmero.
  idleTimeoutMillis: 5_000,
});

export const db = drizzle({ client: pool, schema, casing: "snake_case" });
