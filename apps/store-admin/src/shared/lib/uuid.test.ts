import { readdirSync, readFileSync, statSync } from "fs";
import { join, relative } from "path";
import { UUID_PATTERN } from "./uuid";

/**
 * TASK-808 — the admin half of the TASK-397 invariant.
 *
 * The forms post back ids the database issued (the category, brand, group or
 * device brand the admin just read), and the legacy seed wrote ids that are
 * UUID-shaped without a valid version/variant nibble. zod's `.uuid()` is
 * shape-only on zod 3, but on zod 4 it is a strict RFC 9562 check — the day the
 * dependency is bumped, every such form would reject its own ids with a field
 * error the operator cannot fix, i.e. TASK-397 again, this time in the browser.
 * The forms therefore check the 8-4-4-4-12 shape with `UUID_PATTERN` (what the
 * API's `@IsUUID('loose')` checks) and never call `.uuid()`.
 */

const SRC_ROOT = join(__dirname, "..", "..");
const GENERATED = `${join("shared", "api", "generated")}`;

function collectSourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (!full.endsWith(GENERATED)) collectSourceFiles(full, out);
    } else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) {
      out.push(full);
    }
  }
  return out;
}

describe("UUID_PATTERN (TASK-808)", () => {
  it.each([
    ["a version nibble outside [1-8]", "aaaaaaaa-bbbb-0ccc-0ddd-eeeeeeeeeeee"],
    ["a variant nibble outside [89ab]", "3f2a9c10-1b2c-4d3e-7f40-123456789abc"],
    ["a valid v4 id", "550e8400-e29b-41d4-a716-446655440000"],
    ["upper-case hex", "550E8400-E29B-41D4-A716-446655440000"],
  ])("accepts %s", (_label, id) => {
    expect(UUID_PATTERN.test(id)).toBe(true);
  });

  it.each([
    ["not a uuid at all", "not-a-uuid"],
    ["a uuid missing a group", "aaaaaaaa-bbbb-cccc-eeeeeeeeeeee"],
    ["a non-hex character", "zaaaaaaa-bbbb-0ccc-0ddd-eeeeeeeeeeee"],
    ["surrounding text", "x550e8400-e29b-41d4-a716-446655440000"],
    ["an empty string", ""],
  ])("rejects %s", (_label, id) => {
    expect(UUID_PATTERN.test(id)).toBe(false);
  });
});

describe("zod .uuid() guard (TASK-808): no admin form version-checks an id", () => {
  it("finds no .uuid( call anywhere under src/ outside the generated client", () => {
    const files = collectSourceFiles(SRC_ROOT);
    expect(files.some((f) => f.endsWith("product-schema.ts"))).toBe(true);

    const offenders = files.flatMap((file) => {
      const source = readFileSync(file, "utf8");
      const lines: string[] = [];
      for (const match of source.matchAll(/\.uuid\(/g)) {
        const line = source.slice(0, match.index).split("\n").length;
        lines.push(`${relative(SRC_ROOT, file).split("\\").join("/")}:${line}`);
      }
      return lines;
    });

    expect(offenders).toEqual([]);
  });
});
