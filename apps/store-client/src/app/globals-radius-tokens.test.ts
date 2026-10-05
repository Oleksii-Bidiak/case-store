import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { cn } from "@/shared/lib/utils";

/**
 * Contract test for the role radii (owner decision 7.9, design-system.md §5,
 * TASK-862). The storefront renders three radii that sit off the base scale —
 * card 18px, large CTA 13px, menu item 11px. They are named tokens in
 * `@theme inline` (→ `rounded-card` / `rounded-cta` / `rounded-menu`), so a
 * component picks a role instead of retyping the px.
 *
 *  1. the three tokens are declared inside `@theme inline` with today's values;
 *  2. no source file goes back to the raw `rounded-[18px|13px|11px]` form.
 */

const SRC = join(__dirname, "..");
const css = readFileSync(join(__dirname, "globals.css"), "utf8");

function themeInlineBody(source: string): string {
  const start = source.indexOf("@theme inline");
  expect(start).toBeGreaterThan(-1);
  const open = source.indexOf("{", start);
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === "{") depth++;
    else if (source[i] === "}") {
      depth--;
      if (depth === 0) return source.slice(open + 1, i);
    }
  }
  throw new Error("unterminated @theme inline block");
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)
      ? [path]
      : [];
  });
}

describe("role radius tokens (TASK-862)", () => {
  const theme = themeInlineBody(css);

  it.each([
    ["--radius-card", "18px"],
    ["--radius-cta", "13px"],
    ["--radius-menu", "11px"],
  ])("declares %s: %s in @theme inline", (token, value) => {
    expect(theme).toMatch(new RegExp(`${token}:\\s*${value};`));
  });

  // Tailwind v4 emits radius utilities alphabetically (`card`, `cta` sort
  // before `lg`, `md`, `xl`), so a component default left next to a role
  // radius wins the cascade. `cn` must therefore know the role names as
  // radius classes and drop the default — a source grep cannot catch this.
  it.each([
    ["rounded-xl", "rounded-cta", "rounded-cta"],
    ["rounded-md", "rounded-card", "rounded-card"],
    ["rounded-lg", "rounded-menu", "rounded-menu"],
    ["rounded-card", "rounded-full", "rounded-full"],
  ])("cn(%s, %s) keeps only %s", (base, override, expected) => {
    expect(cn(base, override)).toBe(expected);
  });

  it("merges role radii per corner group like the default scale", () => {
    expect(cn("rounded-t-lg", "rounded-t-card")).toBe("rounded-t-card");
    expect(cn("h-12 rounded-xl px-4", "rounded-cta")).toBe(
      "h-12 px-4 rounded-cta",
    );
  });

  it("leaves no raw rounded-[18px|13px|11px] class in the source tree", () => {
    const offenders = sourceFiles(SRC).filter((file) =>
      /rounded-\[(18|13|11)px\]/.test(readFileSync(file, "utf8")),
    );
    expect(offenders).toEqual([]);
  });
});
