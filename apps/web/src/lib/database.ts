import { Pool } from "pg";

const globalForDatabase = globalThis as unknown as { padalixCustomerPool?: Pool };

export const customerDatabase = globalForDatabase.padalixCustomerPool ?? new Pool({
  connectionString: process.env.DATABASE_URL,
  options: "-c search_path=customer_auth",
  max: 5,
});

if (process.env.NODE_ENV !== "production") {
  globalForDatabase.padalixCustomerPool = customerDatabase;
}

