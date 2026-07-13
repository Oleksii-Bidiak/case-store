import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Regression guard for the widgets/product-detail ⇄ widgets/product-quick-view
 * cycle: the PDP renders quick-view triggers in its "related"/"compatible"
 * rails, while the quick-view modal used to reach back into product-detail's
 * leaf files for the gallery + stock indicator. Those primitives now live in
 * `entities/product`, so the dependency is one-way again.
 *
 * The eslint FSD rules only police layer direction (widgets → features →
 * entities → shared); a widget importing a peer widget is legal, so nothing
 * else catches a cycle re-appearing.
 */
const WIDGETS_ROOT = join(__dirname, "..", "..");

function sourceFiles(widget: string): string[] {
  const root = join(WIDGETS_ROOT, widget);
  const walk = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) return walk(full);
      if (!/\.tsx?$/.test(entry.name) || /\.test\.tsx?$/.test(entry.name)) {
        return [];
      }
      return [full];
    });
  return walk(root);
}

const read = (widget: string) =>
  sourceFiles(widget).map((file) => ({
    file,
    code: readFileSync(file, "utf8"),
  }));

describe("product-detail ⇄ product-quick-view import boundary", () => {
  it("product-quick-view never imports widgets/product-detail", () => {
    const offenders = read("product-quick-view")
      .filter(({ code }) => code.includes("@/widgets/product-detail"))
      .map(({ file }) => file);

    expect(offenders).toEqual([]);
  });

  it("neither widget deep-imports past a peer widget's public barrel", () => {
    // Anything past `@/widgets/<slice>` — i.e. a path segment after the barrel.
    const deepImport = /@\/widgets\/[a-z0-9-]+\//;
    const offenders = [...read("product-detail"), ...read("product-quick-view")]
      .filter(({ code }) => deepImport.test(code))
      .map(({ file }) => file);

    expect(offenders).toEqual([]);
  });

  it("the shared primitives are published by the entities layer", () => {
    const barrel = readFileSync(
      join(WIDGETS_ROOT, "..", "entities", "product", "index.ts"),
      "utf8",
    );

    expect(barrel).toContain("ProductImageGallery");
    expect(barrel).toContain("ProductStockIndicator");
  });
});
