import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

/**
 * Postgres client for production. Prefer importing via createDb() when
 * DATABASE_URL is a postgres URL — this module is split so the default
 * SQLite type graph stays clean for apps/web typecheck.
 */
// The shared schema maps timestamps with SQLite's `timestamp_ms` mode, which calls
// `new Date(value)`. node-postgres returns BIGINT as a string by default, which would
// produce Invalid Date, so parse int8 to a JS number (epoch ms fits in 2^53).
pg.types.setTypeParser(20, (value) => Number(value));

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
