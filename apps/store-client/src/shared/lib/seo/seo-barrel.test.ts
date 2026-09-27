import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

/**
 * The `@/shared/lib/seo` barrel stays pure (TASK-570).
 *
 * It used to re-export `buildHubMetadata` (→ `pages-server`, `seo-settings-server`)
 * and the IndexNow submitter (→ `serverFetch`, `@sentry/nextjs`), so every module
 * importing the barrel for `stripFormatting` or `buildListingMetadata` dragged a
 * server fetcher and the Sentry SDK into its graph. Nothing failed while every
 * consumer was a server route; the first client component to need a pure helper
 * would have broken the build — or, under Jest, the whole suite.
 *
 * The check is STATIC — it follows every `import`/`export … from` of the barrel
 * through the source tree — so a server module reached two hops away (a pure
 * helper that starts importing a fetcher) fails here too, not only a direct
 * re-export.
 */
const SRC = resolve(__dirname, "../../..");
const BARREL = join(__dirname, "index.ts");

/** Module specifiers that must never be reachable from the barrel. */
const FORBIDDEN: RegExp[] = [
  /^@\/shared\/api\/[^/]*-server$/, // pages-server, seo-settings-server, …
  /^@\/shared\/api\/server-fetch$/,
  /^@sentry\//,
  /^next\/(cache|headers|server)$/,
  /(^|\/)server$/, // `./server`, `@/shared/lib/seo/server`
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

describe("@/shared/lib/seo barrel (TASK-570)", () => {
  it("reaches no server fetcher, no Sentry and no server-only Next module", () => {
    const reached = [...reachableSpecifiers(BARREL)];

    expect(
      reached.filter((specifier) =>
        FORBIDDEN.some((pattern) => pattern.test(specifier)),
      ),
    ).toEqual([]);
  });

  it("still sees the pure helpers — the walk is not vacuous", () => {
    const reached = reachableSpecifiers(BARREL);

    expect(reached).toContain("./resolveSeo");
    expect(reached).toContain("./listing-metadata");
  });

  it("the server entry point is where buildHubMetadata and IndexNow live now", () => {
    const reached = [...reachableSpecifiers(join(__dirname, "server.ts"))];

    expect(reached).toEqual(
      expect.arrayContaining([
        "@/shared/api/pages-server",
        "@/shared/api/seo-settings-server",
        "@sentry/nextjs",
      ]),
    );
  });
});
