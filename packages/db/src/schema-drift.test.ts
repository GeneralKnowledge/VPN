import { describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { is } from "drizzle-orm";
import { SQLiteTable, getTableConfig } from "drizzle-orm/sqlite-core";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { migrate } from "./migrate";
import * as schema from "./schema";

/**
 * The hand-written migration SQL must stay in step with schema.ts (tables, columns, nullability,
 * indexes), otherwise the app compiles against columns the database does not have.
 */
describe("migration vs drizzle schema", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "northstar-drift-"));
  const file = path.join(dir, "drift.db");
  process.env.NORTHSTAR_ROOT = dir;
  migrate(`file:${file}`);
  const sqlite = new Database(file, { readonly: true });

  const tables: SQLiteTable[] = [];
  for (const value of Object.values(schema) as unknown[]) {
    if (is(value, SQLiteTable)) tables.push(value);
  }

  it("covers every schema table", () => {
    expect(tables.length).toBeGreaterThan(10);
  });

  for (const table of tables) {
    const config = getTableConfig(table);
    it(`${config.name}: columns match`, () => {
      const info = sqlite.prepare(`pragma table_info(${config.name})`).all() as Array<{
        name: string;
        notnull: number;
      }>;
      expect(info.length, `table ${config.name} missing`).toBeGreaterThan(0);
      const actual = new Map(info.map((c) => [c.name, c.notnull === 1]));
      for (const col of config.columns) {
        expect(actual.has(col.name), `column ${config.name}.${col.name} missing from migration`).toBe(true);
        if (!col.primary) {
          expect(actual.get(col.name), `nullability of ${config.name}.${col.name}`).toBe(col.notNull);
        }
      }
      expect([...actual.keys()].sort()).toEqual(config.columns.map((c) => c.name).sort());
    });

    it(`${config.name}: indexes match`, () => {
      const actual = new Set(
        (sqlite.prepare(`pragma index_list(${config.name})`).all() as Array<{ name: string }>).map((i) => i.name),
      );
      for (const idx of config.indexes) {
        expect(actual.has(idx.config.name), `index ${idx.config.name} missing from migration`).toBe(true);
      }
    });
  }
});
