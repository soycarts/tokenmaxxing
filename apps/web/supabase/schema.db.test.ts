import { execFileSync, spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Runs supabase/schema.test.sql against a real database, only when one is available:
 * set SUPABASE_DB_URL (a Postgres connection string with schema.sql applied) and have psql on
 * PATH. Otherwise skipped. See supabase/README.md for a throwaway local Postgres recipe.
 */
const url = process.env.SUPABASE_DB_URL;
const hasPsql = spawnSync("psql", ["--version"]).status === 0;

describe.skipIf(!url || !hasPsql)("schema.test.sql", () => {
  it("passes every assertion", () => {
    const out = execFileSync("psql", [url!, "-v", "ON_ERROR_STOP=1", "-q", "-f", resolve(__dirname, "schema.test.sql")], {
      encoding: "utf8",
    });
    expect(out).toContain("all assertions passed");
  }, 60_000);
});
