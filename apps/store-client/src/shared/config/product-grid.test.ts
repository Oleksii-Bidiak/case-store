import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { PRODUCT_GRID_CLASS, PRODUCT_GRID_IMAGE_SIZES } from "./product-grid";

/**
 * TASK-1957 — the catalogue grid goes 4 → 3 → 2 as the viewport narrows (one
 * card below 390px stays, TASK-415), and every listing grid and its skeleton
 * read it from one constant so they cannot drift apart.
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

describe("PRODUCT_GRID_CLASS (TASK-1957)", () => {
  const classes = PRODUCT_GRID_CLASS.split(" ");

  it("steps 1 / 2 / 3 / 4 columns at 0 / 390 / md / xl", () => {
    expect(classes).toEqual(
      expect.arrayContaining([
        "grid",
        "grid-cols-1",
        "min-[390px]:grid-cols-2",
        "md:grid-cols-3",
        "xl:grid-cols-4",
      ]),
    );
    // No 4-up beside the 268px rail at `lg` — that is the squeeze this task removes.
    expect(classes).not.toContain("lg:grid-cols-4");
  });

  it("keeps a row one height and uses the mockup gap rhythm", () => {
    expect(classes).toEqual(
      expect.arrayContaining(["items-stretch", "gap-3", "md:gap-4"]),
    );
  });

  it("is the only hand-written catalogue column ladder in the storefront", () => {
    const offenders = sourceFiles(SRC)
      .filter((file) => !file.endsWith(join("config", "product-grid.ts")))
      .filter((file) =>
        readFileSync(file, "utf8").includes("min-[390px]:grid-cols-2"),
      )
      .map((file) => relative(SRC, file));
    expect(offenders).toEqual([]);
  });
});

describe("PRODUCT_GRID_IMAGE_SIZES (TASK-1957)", () => {
  it("has a stop at every column change of the grid", () => {
    const stops = [
      ...PRODUCT_GRID_IMAGE_SIZES.matchAll(/max-width: (\d+)px/g),
    ].map((match) => Number(match[1]));
    // 389: 1 → 2 columns; 767: 2 → 3; 1023: the rail joins; 1279: 3 → 4.
    expect(stops).toEqual([389, 767, 1023, 1279]);
  });

  it("caps the four-up slot at a fixed width instead of a vw value", () => {
    expect(PRODUCT_GRID_IMAGE_SIZES.split(", ").at(-1)).toBe("228px");
  });
});
