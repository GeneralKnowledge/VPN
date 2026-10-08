import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createDb } from "./client";

function monorepoRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
}


/** Seeding or resetting wipes data and creates default credentials — never allow it in production. */
function assertNotProduction(action: string) {
  const isProd = process.env.APP_ENV === "production" || (!process.env.APP_ENV && process.env.NODE_ENV === "production");
  if (isProd && process.env.NORTHSTAR_ALLOW_DESTRUCTIVE_DB !== "true") {
    throw new Error(`Refusing to ${action} in production (set NORTHSTAR_ALLOW_DESTRUCTIVE_DB=true to override)`);
  }
}

export function reset(databaseUrl = process.env.DATABASE_URL ?? "file:./data/northstar.db") {
  assertNotProduction("reset the database");
  process.env.NORTHSTAR_ROOT = process.env.NORTHSTAR_ROOT ?? monorepoRoot();
  const { filePath, close } = createDb(databaseUrl);
  close();
  for (const p of [filePath, `${filePath}-wal`, `${filePath}-shm`]) {
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }
  console.info(`[db] reset removed ${filePath}`);
}

if (process.argv[1]?.includes("reset")) {
  reset();
}
