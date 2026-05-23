import { defineConfig } from "drizzle-kit";

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = require("fs")
    .readFileSync(".env.local", "utf8")
    .match(/^DATABASE_URL="([^"]+)"/m)?.[1];
}

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL not set (check .env.local)");
}

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
  casing: "snake_case",
  verbose: true,
  strict: true,
});
