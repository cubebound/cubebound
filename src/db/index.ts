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

/**
 * The connection pool, sized for serverless.
 *
 * **Every Vercel instance builds its own pool**, so the meaningful number is
 * `max × concurrent instances`, not `max`. Left unset, postgres-js defaults to
 * 10 and never closes an idle connection — so a burst of traffic spins up
 * instances that each grab up to ten, then get frozen still holding them. The
 * transaction pooler runs out of client slots and every later request queues
 * for one with no deadline, which is why the site hung rather than erroring:
 * different routes timed out on different attempts while the database itself
 * answered `/explore` in 240ms.
 *
 * That happened in production while adding cards quickly from the editor's
 * browse tab, which is the heaviest path there is — see `getFilterOptions`.
 *
 * - `max` is 6 rather than 1 because pages deliberately run independent
 *   queries in `Promise.all`; one connection would serialise them and undo
 *   that. Six covers the widest fan-out we have.
 * - `idle_timeout` is the one that actually fixes this: a frozen instance's
 *   connections are handed back after 20s instead of being held forever.
 * - `connect_timeout` turns exhaustion into a fast, visible error with a
 *   digest in Sentry, rather than a request that hangs until the platform
 *   gives up. A page that fails is far easier to diagnose than one that
 *   stalls, which cost real time here.
 *
 * prepare: false is required when connecting through Supabase's transaction
 * pooler (port 6543), which does not support prepared statements.
 */
const client = postgres(required("DATABASE_URL"), {
  prepare: false,
  max: 6,
  idle_timeout: 20,
  connect_timeout: 10,
});

export const db = drizzle(client, { schema });

export * as schema from "./schema";
