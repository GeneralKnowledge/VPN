import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";

export type Db = ReturnType<typeof createDb>["db"];

function resolveSqlitePath(databaseUrl: string): string {
  const raw = databaseUrl.startsWith("file:") ? databaseUrl.slice("file:".length) : databaseUrl;
  if (raw.startsWith("./") || raw.startsWith("../") || !path.isAbsolute(raw)) {
    // Resolve relative to monorepo root when possible
    const root = process.env.NORTHSTAR_ROOT ?? process.cwd();
    return path.resolve(root, raw);
  }
  return raw;
}

export function createDb(databaseUrl = process.env.DATABASE_URL ?? "file:./data/northstar.db") {
  if (databaseUrl.startsWith("postgres://") || databaseUrl.startsWith("postgresql://")) {
    throw new Error(
      "Postgres URL detected. Local development uses SQLite. Set DATABASE_URL=file:./data/northstar.db for mock mode, or wire drizzle-orm/node-postgres for production.",
    );
  }
  const filePath = resolveSqlitePath(databaseUrl);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const sqlite = new Database(filePath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite, { schema });
  return { db, sqlite, filePath };
}

export * from "./schema";
