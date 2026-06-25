import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import { Pool as PgPool } from "pg";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import ws from "ws";
import * as schema from "@shared/schema";

neonConfig.webSocketConstructor = ws;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// Neon's serverless driver only speaks Neon's WebSocket proxy protocol, not
// plain Postgres wire protocol. For local development against a vanilla
// Postgres container (e.g. `docker run postgres`), fall back to the standard
// `pg` driver. Any real DATABASE_URL host (Neon, RDS, etc.) keeps using the
// neon-serverless driver unchanged. Both branches are cast to the same
// drizzle type so the rest of the codebase keeps its existing type-checking —
// the query-builder surface used throughout this app is identical either way.
const dbHost = new URL(process.env.DATABASE_URL).hostname;
const isLocalPostgres = dbHost === "localhost" || dbHost === "127.0.0.1";

type AppDb = ReturnType<typeof drizzle<typeof schema>>;

export const pool = isLocalPostgres
  ? new PgPool({
      connectionString: process.env.DATABASE_URL,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    })
  : new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });

export const db: AppDb = isLocalPostgres
  ? (drizzlePg(pool as PgPool, { schema }) as unknown as AppDb)
  : drizzle({ client: pool as Pool, schema });

export function getPoolStats() {
  return {
    totalCount: pool.totalCount,
    idleCount: pool.idleCount,
    waitingCount: pool.waitingCount,
  };
}