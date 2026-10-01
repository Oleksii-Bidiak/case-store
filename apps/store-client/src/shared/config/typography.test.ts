import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { H1_CLASS, H2_CLASS, HERO_CLASS } from "./typography";

/**
 * TASK-861 — page headings on the design-system §3 scale (owner decision 7.5).
 * The class lists live in `typography.ts`; a page that hard-codes its own h1
 * size, or an h1/h2 with an arbitrary `text-[..]`, is a regression.
 */
const SRC = join(__dirname, "..", "..");
const DOC = join(SRC, "..", "..", "..", "docs", "design-system.md");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      return name === "generated" ? [] : sourceFiles(full);
    }
    return /\.tsx$/.test(name) && !/\.test\.tsx$/.test(name) ? [full] : [];
  });
}

/** Every opening `<h1 …>` / `<h2 …>` tag in production source. */
function headingTags(level: 1 | 2): { file: string; tag: string }[] {
  const re = new RegExp(`<h${level}\\b[\\s\\S]*?>`, "g");
  return sourceFiles(SRC).flatMap((file) =>
    (readFileSync(file, "utf8").match(re) ?? []).map((tag) => ({
      file: relative(SRC, file).replace(/\\/g, "/"),
      tag,
    })),
  );
}

describe("heading scale (TASK-861)", () => {
  it("matches the design-system §3 class lists", () => {
    expect(HERO_CLASS).toBe(
      "font-display text-4xl md:text-6xl font-bold tracking-tight",
    );
    expect(H1_CLASS).toBe(
      "font-display text-3xl md:text-4xl font-bold tracking-tight",
    );
    expect(H2_CLASS).toBe("font-display text-2xl md:text-3xl font-semibold");
  });

  it("is the same scale the design-system document prescribes", () => {
    const doc = readFileSync(DOC, "utf8");
    for (const cls of [HERO_CLASS, H1_CLASS, H2_CLASS]) {
      expect(doc).toContain(`\`${cls}\``);
    }
  });

  it("styles every page h1 with H1_CLASS (HERO_CLASS on the homepage slider)", () => {
    // Guards the scan itself: a regex that matched nothing would pass vacuously.
    expect(headingTags(1).length).toBeGreaterThan(30);
    const offenders = headingTags(1)
      .filter(({ tag }) => !/\bH1_CLASS\b/.test(tag))
      .filter(
        ({ file, tag }) =>
          !(
            file.startsWith("widgets/hero-banner/") &&
            /\bHERO_CLASS\b/.test(tag)
          ),
      );
    expect(offenders).toEqual([]);
  });

  it("keeps HERO_CLASS to the homepage hero slider", () => {
    const users = sourceFiles(SRC)
      .filter((file) =>
        /\$\{HERO_CLASS\}|\{HERO_CLASS\}/.test(readFileSync(file, "utf8")),
      )
      .map((file) => relative(SRC, file).replace(/\\/g, "/"));
    expect(users).toEqual(["widgets/hero-banner/ui/hero-slider.tsx"]);
  });

  it("leaves no arbitrary text size on any h1 or h2", () => {
    const offenders = [...headingTags(1), ...headingTags(2)].filter(({ tag }) =>
      /\btext-\[/.test(tag),
    );
    expect(offenders).toEqual([]);
  });
});
