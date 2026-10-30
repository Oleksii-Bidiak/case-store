import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { cn } from "@/shared/lib/utils";

/**
 * Contract test for the role radii (owner decision 7.9, design-system.md §5,
 * TASK-862). The storefront's role radii are named tokens in `@theme inline`
 * (→ `rounded-panel` / `rounded-card` / `rounded-pad` / `rounded-cta` /
 * `rounded-menu`), so a component picks a role instead of retyping the px.
 * Values of direction В (Д3-0, TASK-1951): panel 32, card 26, photo pad 18,
 * large CTA a pill, menu item 16 (were card 18, CTA 13, menu 11).
 *
 *  1. the tokens are declared inside `@theme inline` with today's values;
 *  2. no source file goes back to a raw `rounded-[..px]` form of a role.
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
    ["--radius-panel", "32px"],
    ["--radius-card", "26px"],
    ["--radius-pad", "18px"],
    ["--radius-cta", "9999px"],
    ["--radius-menu", "16px"],
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

  it("leaves no raw rounded-[..px] form of a role radius in the source tree", () => {
    const offenders = sourceFiles(SRC).filter((file) =>
      /rounded-\[(32|26|18|16|13|11)px\]/.test(readFileSync(file, "utf8")),
    );
    expect(offenders).toEqual([]);
  });
});
