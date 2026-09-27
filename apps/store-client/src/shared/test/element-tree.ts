import type { DehydratedState } from "@tanstack/react-query";

/**
 * Helpers for tests that call a server page component directly and inspect the
 * React element tree it returns (no rendering — the widgets are stubbed).
 */

/** Every value of prop `name` on any element in the tree, depth-first. */
export function findPropValues(node: unknown, name: string): unknown[] {
  if (!node || typeof node !== "object") return [];
  if (Array.isArray(node)) return node.flatMap((n) => findPropValues(n, name));
  const props = (node as { props?: Record<string, unknown> }).props;
  if (!props) return [];
  const own = name in props && props[name] !== undefined ? [props[name]] : [];
  return [...own, ...findPropValues(props.children, name)];
}

/** Every JSON-LD graph (`<JsonLd schema>`) in the tree. */
export function findJsonLdSchemas(node: unknown): Record<string, unknown>[] {
  return findPropValues(node, "schema").filter(
    (value): value is Record<string, unknown> =>
      typeof value === "object" && value !== null,
  );
}

/**
 * The query keys a page hands to the client through its `HydrationBoundary`
 * (TASK-563) — i.e. what the first HTML is rendered with.
 */
export function findDehydratedQueryKeys(node: unknown): unknown[] {
  return findPropValues(node, "state").flatMap((state) =>
    ((state as DehydratedState).queries ?? []).map((query) => query.queryKey),
  );
}
