import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";

export type Db = ReturnType<typeof createDb>["db"];

function resolveSqlitePath(databaseUrl: string): string {
  const raw = databaseUrl.startsWith("file:") ? databaseUrl.slice("file:".length) : databaseUrl;
  if (raw.startsWith("./") || raw.startsWith("../") || !path.isAbsolute(raw)) {
    const root = process.env.NORTHSTAR_ROOT ?? process.cwd();
    return path.resolve(root, raw);
  }
  return raw;
}

/**
 * Create a SQLite database client (default for local/dev/CI).
 *
 * Production Postgres: apply `postgres.migrate.sql`, then use `createPostgresDb`
 * from `./client.postgres` (also selected automatically by apps/web `getDb()`
 * when DATABASE_URL is a postgres URL).
 */
export function createDb(databaseUrl = process.env.DATABASE_URL ?? "file:./data/northstar.db"): {
  db: ReturnType<typeof drizzle<typeof schema>>;
  sqlite: Database.Database;
  filePath: string;
  dialect: "sqlite";
  close: () => void;
} {
  if (databaseUrl.startsWith("postgres://") || databaseUrl.startsWith("postgresql://")) {
    throw new Error(
      "Postgres URL passed to createDb(). Use createPostgresDb() from @northstar/db/postgres, or apps/web getDb() which selects the dialect automatically.",
    );
  }
  const filePath = resolveSqlitePath(databaseUrl);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const sqlite: Database.Database = new Database(filePath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite, { schema });
  return {
    db,
    sqlite,
    filePath,
    dialect: "sqlite",
    close: () => {
      sqlite.close();
    },
  };
}

export * from "./schema";
