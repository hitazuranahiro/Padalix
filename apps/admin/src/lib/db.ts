import { Pool } from "pg";

const globalForDatabase = globalThis as unknown as { padalixPool?: Pool };

export const database = globalForDatabase.padalixPool ?? new Pool({
  connectionString: process.env.DATABASE_URL ?? "postgresql://padalix:padalix@localhost:5432/padalix",
  max: 5,
});

if (process.env.NODE_ENV !== "production") {
  globalForDatabase.padalixPool = database;
}
