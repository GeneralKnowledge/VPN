import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createDb } from "./client";

function monorepoRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
}

export function reset(databaseUrl = process.env.DATABASE_URL ?? "file:./data/northstar.db") {
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
