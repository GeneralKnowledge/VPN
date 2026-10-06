import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

/**
 * Postgres client for production. Prefer importing via createDb() when
 * DATABASE_URL is a postgres URL — this module is split so the default
 * SQLite type graph stays clean for apps/web typecheck.
 */
export function createPostgresDb(databaseUrl: string) {
  const pool = new pg.Pool({ connectionString: databaseUrl });
  const db = drizzle(pool, { schema });
  return {
    db,
    dialect: "postgres" as const,
    close: () => {
      void pool.end();
    },
  };
}
