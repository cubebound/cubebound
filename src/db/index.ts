import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

// prepare: false is required when connecting through Supabase's transaction
// pooler (port 6543), which does not support prepared statements.
const client = postgres(required("DATABASE_URL"), { prepare: false });

export const db = drizzle(client, { schema });

export * as schema from "./schema";
