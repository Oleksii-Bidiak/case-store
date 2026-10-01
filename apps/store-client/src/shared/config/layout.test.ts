import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { PAGE_CONTAINER } from "./layout";

/**
 * TASK-860 / TASK-520 — one page-container width for the whole storefront
 * (owner decision 7.1). The token lives in globals.css, the class string in
 * `PAGE_CONTAINER`; any page-level width written by hand is a regression.
 */
const SRC = join(__dirname, "..", "..");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      return name === "generated" ? [] : sourceFiles(full);
    }
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [full] : [];
  });
}

describe("page container (TASK-860)", () => {
  it("declares the 1320px container token in @theme inline", () => {
    const css = readFileSync(join(SRC, "app", "globals.css"), "utf8");
    const theme = css.slice(css.indexOf("@theme inline"));
    expect(theme).toMatch(/--container-page:\s*1320px;/);
  });

  it("uses the token utility and the house gutter", () => {
    expect(PAGE_CONTAINER.split(" ")).toEqual([
      "mx-auto",
      "w-full",
      "max-w-page",
      "px-4",
      "sm:px-6",
      "lg:px-8",
    ]);
  });

  it("leaves no hand-written page width anywhere in src", () => {
    const offenders = sourceFiles(SRC)
      .filter((file) =>
        /max-w-7xl|max-w-\[(?:1320|1180|1160|1000)px\]/.test(
          readFileSync(file, "utf8"),
        ),
      )
      .map((file) => relative(SRC, file));
    expect(offenders).toEqual([]);
  });
});

/**
 * TASK-500 / TASK-517 — card grids sit on the 4px scale (`gap-4 md:gap-6`,
 * design-system §4) and the sticky-aside height cap is a `@theme` token. The
 * per-file suppression count cannot hold this on its own (a file may swap one
 * arbitrary value for another at the same count), and a class string kept in
 * a module constant is invisible to the lint rule — so both are pinned here.
 */
describe("spacing scale (TASK-500, TASK-517)", () => {
  const files = sourceFiles(SRC);

  it("scans the storefront source", () => {
    // Guards the scan itself: a walk that found nothing would pass vacuously.
    expect(files.length).toBeGreaterThan(100);
  });

  it("leaves no 18px gap anywhere in src", () => {
    const offenders = files
      .filter((file) =>
        /\bgap-(?:[xy]-)?\[18px\]/.test(readFileSync(file, "utf8")),
      )
      .map((file) => relative(SRC, file));
    expect(offenders).toEqual([]);
  });

  it("declares the sticky-aside height cap in @theme inline", () => {
    const css = readFileSync(join(SRC, "app", "globals.css"), "utf8");
    const theme = css.slice(css.indexOf("@theme inline"));
    expect(theme).toMatch(
      /--max-height-sticky-aside:\s*calc\(100dvh - 7rem\);/,
    );
  });

  it("caps sticky asides with the token, not a hand-written calc", () => {
    const offenders = files
      .filter((file) => /max-h-\[calc\(100dvh/.test(readFileSync(file, "utf8")))
      .map((file) => relative(SRC, file));
    expect(offenders).toEqual([]);
  });
});
