import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

/**
 * The `@/shared/lib` barrel carries no Orval fetcher (TASK-819).
 *
 * It used to `export * from "./schema"`, and `schema/index.ts` re-exported the
 * five sitemap / merchant-feed paginators, each built on an Orval plain fetcher
 * (`productControllerFindAll`, …) and through it the axios instance. 26
 * `"use client"` modules import this barrel for `formatMoney` or `cn`, so all of
 * them carried the fetchers in their graph. The paginators now live in
 * `@/shared/lib/schema/server`.
 *
 * STATIC check, like `seo/seo-barrel.test.ts` (TASK-570): it follows every
 * runtime `import` / `export … from` of the barrel through the source tree, so a
 * fetcher reached two hops away fails here too, not only a direct re-export.
 */
const SRC = resolve(__dirname, "../..");
const BARREL = join(__dirname, "index.ts");

/** Module specifiers that must never be reachable from the barrel. */
const FORBIDDEN: RegExp[] = [
  // Orval endpoint modules (`generated/products/products`, …). The `models`
  // folder is types only and reached through `import type`, which is skipped.
  /^@\/shared\/api\/generated\/(?!models(\/|$))/,
  /^@\/shared\/api\/[^/]*-server$/, // pages-server, seo-settings-server, …
  /^@\/shared\/api\/server-fetch$/,
  /^next\/(cache|headers|server)$/,
  /(^|\/)server$/, // `./schema/server`, `@/shared/lib/seo/server`
];

const SPECIFIER = /(?:import|export)\s[^'"]*?from\s*["']([^"']+)["']/g;

/** Resolve an `@/…` or relative specifier to a source file, or null (package). */
function resolveLocal(specifier: string, fromFile: string): string | null {
  let base: string;
  if (specifier.startsWith("@/")) base = join(SRC, specifier.slice(2));
  else if (specifier.startsWith("."))
    base = resolve(dirname(fromFile), specifier);
  else return null;
  for (const candidate of [
    `${base}.ts`,
    `${base}.tsx`,
    join(base, "index.ts"),
    join(base, "index.tsx"),
  ]) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

/** Every specifier reachable from `entry`, following local modules only. */
function reachableSpecifiers(entry: string): Set<string> {
  const seen = new Set<string>();
  const specifiers = new Set<string>();
  const queue = [entry];
  while (queue.length > 0) {
    const file = queue.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    const source = readFileSync(file, "utf8");
    for (const match of source.matchAll(SPECIFIER)) {
      const specifier = match[1];
      // `import type` never reaches the runtime graph.
      if (/^(?:import|export)\s+type\s/.test(match[0])) continue;
      specifiers.add(specifier);
      const next = resolveLocal(specifier, file);
      if (next) queue.push(next);
    }
  }
  return specifiers;
}

describe("@/shared/lib barrel (TASK-819)", () => {
  it("reaches no Orval fetcher and no server-only module", () => {
    const reached = [...reachableSpecifiers(BARREL)];

    expect(
      reached.filter((specifier) =>
        FORBIDDEN.some((pattern) => pattern.test(specifier)),
      ),
    ).toEqual([]);
  });

  it("still sees the JSON-LD builders and the formatters — the walk is not vacuous", () => {
    const reached = reachableSpecifiers(BARREL);

    expect(reached).toContain("./schema");
    expect(reached).toContain("./buildProductSchema");
    expect(reached).toContain("./formatMoney");
  });

  it("the server entry point is where the sitemap paginators live now", () => {
    const reached = [
      ...reachableSpecifiers(join(__dirname, "schema", "server.ts")),
    ];

    expect(reached).toEqual(
      expect.arrayContaining([
        "@/shared/api/generated/products/products",
        "@/shared/api/generated/categories/categories",
      ]),
    );
  });
});
