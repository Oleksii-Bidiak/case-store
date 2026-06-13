import type { ReactElement } from "react";

/**
 * Serialize a JSON-LD graph for safe inlining inside a <script> tag.
 *
 * Escapes `<`, `>`, and `&` to their unicode forms so attacker-controlled string
 * fields (e.g. a product name containing `</script>`) cannot break out of the
 * script context. This is the standard XSS mitigation for inline JSON-LD.
 */
function serializeJsonLd(schema: Record<string, unknown>): string {
  return JSON.stringify(schema)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");
}

/**
 * Dumb UI primitive that renders a Schema.org JSON-LD `<script>` block. Server
 * Component (no `"use client"`); accepts any pre-built schema object from the
 * `shared/lib/schema` builders.
 */
export function JsonLd({
  schema,
}: {
  schema: Record<string, unknown>;
}): ReactElement {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: serializeJsonLd(schema) }}
    />
  );
}
