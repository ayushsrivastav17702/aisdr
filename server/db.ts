import * as schema from "@shared/schema";

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// Neon's serverless driver only speaks Neon's WebSocket proxy protocol, not
// plain Postgres wire protocol. For local development against a vanilla
// Postgres container (e.g. `docker run postgres`), fall back to the standard
// `pg` driver. Any real DATABASE_URL host (Neon, RDS, etc.) keeps using the
// neon-serverless driver unchanged.
const dbHost = new URL(process.env.DATABASE_URL).hostname;
const isLocalPostgres = dbHost === "localhost" || dbHost === "127.0.0.1";

export let pool: any;
export let db: any;

if (isLocalPostgres) {
  const { Pool: PgPool } = await import("pg");
  const { drizzle: drizzlePg } = await import("drizzle-orm/node-postgres");

  pool = new PgPool({
    connectionString: process.env.DATABASE_URL,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  });

  db = drizzlePg(pool, { schema });
} else {
  const { Pool, neonConfig } = await import("@neondatabase/serverless");
  const { drizzle } = await import("drizzle-orm/neon-serverless");
  const ws = (await import("ws")).default;

  neonConfig.webSocketConstructor = ws;

  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  });

  db = drizzle({ client: pool, schema });
}

export function getPoolStats() {
  return {
    totalCount: pool.totalCount,
    idleCount: pool.idleCount,
    waitingCount: pool.waitingCount,
  };
}