/**
 * Guard: every dictionary key has a consumer (TASK-816).
 *
 * The admin dictionary grew ~55 dead strings — labels of removed fields, columns
 * of tables that became trees, hints for toggles that no longer exist. Nothing
 * caught them because an unused property of an object literal is invisible to
 * both TypeScript and ESLint. A dead string is not harmless: it is exactly the
 * copy someone later "fixes" or translates, and the one a reviewer reads as
 * proof that a feature still exists.
 *
 * HOW IT WORKS. The TypeScript compiler API collects every leaf path of `dict`
 * in `dictionary.ts`, then scans the production `.ts`/`.tsx` under `src/` for
 * `dict.a.b…` chains. Aliases are resolved by SYMBOL, not by name —
 * `const d = dict.x; d.y` counts as `x.y`, and so does `const e = d.errors;
 * e.z` — because the short alias names (`d`, `e`, `f`) collide with callback
 * parameters in the same files. A bare alias (`const d = dict.x` passed along
 * whole) does NOT count as using every key under `x`: that would let one
 * `labels={d}` hide a whole block of dead strings.
 *
 * A key is used when a recorded chain equals it or goes through it
 * (`dict.x.y.replace(…)` uses `x.y`). Keys read with a computed index
 * (`placements[placement]`) cannot be seen statically; their parents are in
 * {@link DYNAMIC_ACCESS} below, each with the consumer that reads them.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import * as ts from "typescript";

const SRC = path.resolve(__dirname, "../..");
const DICTIONARY = path.join(SRC, "shared/config/dictionary.ts");

/**
 * Subtrees the scan cannot see through: read with a computed key, or handed
 * whole to a function or component that reads the keys itself. A key is covered
 * when it is, or sits under, one of these paths. Each value names the consumer —
 * keep them honest: when the consumer goes away, the entry goes with it (and an
 * entry whose keys are all read statically fails the last test below).
 */
const DYNAMIC_ACCESS: Record<string, string> = {
  "banners.placements":
    "widgets/banner-list/ui/admin-banner-table.tsx — placements[placement]",
  "banners.statusLabels":
    "widgets/banner-list/ui/admin-banner-table.tsx — statusLabels[status]",
  "bannerForm.placements":
    "features/banner-form/ui/banner-form.tsx — <option> per placement enum",
  "bannerPreview.shape":
    "shared/ui/banner-placement-preview/banner-placement-preview.tsx — shape[placement]",
  "carousels.placementLabels":
    "widgets/carousel-list/ui/admin-carousel-table.tsx — section heading per placement",
  "carousels.sourceLabels":
    "widgets/carousel-list/ui/admin-carousel-table.tsx — badge per source",
  "carousels.statusLabels":
    "widgets/carousel-list/ui/admin-carousel-table.tsx — badge per status",
  "carouselForm.sourceOptions":
    "features/carousel-form/ui/carousel-form.tsx, widgets/carousel-form-view/ui/edit-carousel-view.tsx — per source",
  "carouselForm.placementOptions":
    "features/carousel-form/ui/carousel-form.tsx — <option> per placement",
  "catalogImport.status":
    "widgets/catalog-import-view/ui/catalog-import-view.tsx — d.status[run.status]",
  "auditLog.entityLabels":
    "widgets/audit-log/model/action-label.ts, ui/AuditLogView.tsx — per entity type",
  "auditLog.actionVerbs":
    "widgets/audit-log/model/action-label.ts — verb per action",
  // Only the leaves the messenger fields read by computed key —
  // `siteContactForm[name]` and `[`${name}Placeholder`]` over LINK_FIELDS. The
  // rest of the block (email and phone since TASK-1053, working hours, submit,
  // errors) is read statically and stays under the scan.
  ...Object.fromEntries(
    ["viberLink", "telegramLink", "instagramLink"].flatMap((name) =>
      [name, `${name}Placeholder`].map((leaf) => [
        `siteContactForm.${leaf}`,
        "features/site-contact-form/ui/site-contact-form.tsx — siteContactForm[name] / [`${name}Placeholder`]",
      ]),
    ),
  ),
  "bannerForm.imageUpload":
    "features/banner-form/ui/banner-form.tsx — `copy` of useImageUploadField/ContentImageField",
  "blogPostForm.coverUpload":
    "features/blog-post-form/ui/blog-post-form.tsx — `copy` of useImageUploadField/ContentImageField",
  "brandForm.logoUpload":
    "features/brand-form/ui/brand-form.tsx — `copy` of useImageUploadField/ContentImageField",
  "categoryForm.imageUpload":
    "features/category-form/ui/category-form.tsx — `copy` of useImageUploadField/ContentImageField",
  "seoFields.ogImageUpload":
    "features/product-form/ui/product-form.tsx, features/category-form/ui/category-form.tsx — `copy` of useImageUploadField/ContentImageField (TASK-728)",
  "mediaLibrary.usageKinds":
    "entities/media/model/media-metadata.ts — usage label per usage kind",
  // imageUploadErrorMessage(error, copy) reads errorTooLarge / errorUnsupportedType
  // / errorGeneric off whatever block it is handed.
  "mediaLibrary.errorTooLarge":
    "features/media-picker/ui/media-upload-zone.tsx — imageUploadErrorMessage(error, t)",
  "mediaLibrary.errorUnsupportedType":
    "features/media-picker/ui/media-upload-zone.tsx — imageUploadErrorMessage(error, t)",
  "mediaLibrary.errorGeneric":
    "features/media-picker/ui/media-upload-zone.tsx — imageUploadErrorMessage(error, t)",
  // Same helper, handed the whole `productImages` block — only its three error
  // keys are read that way; the rest of the block is read statically.
  "productImages.errorTooLarge":
    "features/product-image-manager/model/use-product-image-upload-queue.ts — imageUploadErrorMessage(error, dict.productImages)",
  "productImages.errorUnsupportedType":
    "features/product-image-manager/model/use-product-image-upload-queue.ts — imageUploadErrorMessage(error, dict.productImages)",
  "productImages.errorGeneric":
    "features/product-image-manager/model/use-product-image-upload-queue.ts — imageUploadErrorMessage(error, dict.productImages)",
  // Not listed, because the scan sees through them: `reorderList` (read via the
  // `a = dict.reorderList.announce` / `rejected` aliases in shared/lib/list-reorder)
  // and every `*.errors` block the zod schemas alias as `e`.
};

/**
 * Keys whose consumer is being written in a parallel branch. They are NOT dead:
 * the strings are right, the screen that shows them lands with the other
 * cluster. Remove each entry when that branch merges — the test fails on an
 * entry that has a consumer, so a forgotten one cannot linger.
 */
const PENDING_CONSUMERS: Record<string, string> = {};

function unwrap(node: ts.Expression): ts.Expression {
  let current = node;
  while (
    ts.isAsExpression(current) ||
    ts.isSatisfiesExpression(current) ||
    ts.isParenthesizedExpression(current) ||
    ts.isNonNullExpression(current)
  ) {
    current = current.expression;
  }
  return current;
}

function propertyName(name: ts.PropertyName): string | null {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name)) return name.text;
  if (ts.isNumericLiteral(name)) return name.text;
  if (ts.isComputedPropertyName(name) && ts.isStringLiteral(name.expression)) {
    return name.expression.text;
  }
  return null;
}

/** Every leaf path of `dict`, plus every intermediate (object) path. */
function collectDictionaryPaths(): { leaves: string[]; objects: Set<string> } {
  const source = ts.createSourceFile(
    DICTIONARY,
    fs.readFileSync(DICTIONARY, "utf8"),
    ts.ScriptTarget.Latest,
    true,
  );
  const leaves: string[] = [];
  const objects = new Set<string>();

  const walk = (object: ts.ObjectLiteralExpression, prefix: string[]) => {
    for (const property of object.properties) {
      if (ts.isSpreadAssignment(property)) {
        throw new Error(
          `Spread in dict at ${prefix.join(".")} — the guard cannot see its keys`,
        );
      }
      const name = property.name ? propertyName(property.name) : null;
      if (name === null) {
        throw new Error(`Computed key in dict at ${prefix.join(".")}`);
      }
      const keyPath = [...prefix, name];
      if (ts.isPropertyAssignment(property)) {
        const value = unwrap(property.initializer);
        if (ts.isObjectLiteralExpression(value)) {
          objects.add(keyPath.join("."));
          walk(value, keyPath);
          continue;
        }
      }
      leaves.push(keyPath.join("."));
    }
  };

  source.forEachChild(function find(node) {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === "dict" &&
      node.initializer
    ) {
      const value = unwrap(node.initializer);
      if (!ts.isObjectLiteralExpression(value)) {
        throw new Error("dict is not an object literal");
      }
      walk(value, []);
      return;
    }
    node.forEachChild(find);
  });

  if (leaves.length === 0) throw new Error("no keys found in dictionary.ts");
  return { leaves, objects };
}

function productionFiles(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    const rel = path.relative(SRC, full).replace(/\\/g, "/");
    if (entry.isDirectory()) {
      if (rel === "shared/test" || rel === "shared/api/generated") continue;
      productionFiles(full, out);
      continue;
    }
    if (!/\.tsx?$/.test(entry.name)) continue;
    if (/\.(test|spec)\.tsx?$/.test(entry.name)) continue;
    if (/\.fixture\.tsx?$/.test(entry.name)) continue;
    if (entry.name.endsWith(".d.ts")) continue;
    if (full === DICTIONARY) continue;
    out.push(full);
  }
  return out;
}

/** Every `dict.…` chain the production code reads, as dotted paths. */
function collectUsedPaths(files: string[]): Set<string> {
  const program = ts.createProgram(files, {
    noResolve: true,
    noLib: true,
    types: [],
    jsx: ts.JsxEmit.Preserve,
    target: ts.ScriptTarget.ES2020,
  });
  const checker = program.getTypeChecker();
  const used = new Set<string>();

  for (const file of files) {
    const source = program.getSourceFile(file);
    if (!source || !source.text.includes("dict")) continue;
    const aliases = new Map<ts.Symbol, string[]>();

    const chain = (expr: ts.Expression): string[] | null => {
      const node = unwrap(expr);
      if (ts.isIdentifier(node)) {
        if (node.text === "dict") return [];
        const symbol = checker.getSymbolAtLocation(node);
        return symbol ? (aliases.get(symbol) ?? null) : null;
      }
      if (ts.isPropertyAccessExpression(node)) {
        const base = chain(node.expression);
        return base ? [...base, node.name.text] : null;
      }
      if (
        ts.isElementAccessExpression(node) &&
        (ts.isStringLiteral(node.argumentExpression) ||
          ts.isNoSubstitutionTemplateLiteral(node.argumentExpression))
      ) {
        const base = chain(node.expression);
        return base ? [...base, node.argumentExpression.text] : null;
      }
      return null;
    };

    // Pass 1: aliases, to a fixpoint so `const e = d.errors` resolves after `d`.
    const bind = (name: ts.BindingName, value: string[]): boolean => {
      if (ts.isIdentifier(name)) {
        const symbol = checker.getSymbolAtLocation(name);
        if (!symbol || aliases.has(symbol)) return false;
        aliases.set(symbol, value);
        return true;
      }
      let changed = false;
      if (ts.isObjectBindingPattern(name)) {
        for (const element of name.elements) {
          if (element.dotDotDotToken) continue;
          const key = element.propertyName
            ? propertyName(element.propertyName)
            : ts.isIdentifier(element.name)
              ? element.name.text
              : null;
          if (key !== null)
            changed = bind(element.name, [...value, key]) || changed;
        }
      }
      return changed;
    };
    for (let changed = true; changed;) {
      changed = false;
      source.forEachChild(function visit(node) {
        if (ts.isVariableDeclaration(node) && node.initializer) {
          const value = chain(node.initializer);
          if (value) changed = bind(node.name, value) || changed;
        }
        node.forEachChild(visit);
      });
    }

    // Pass 2: record the longest resolvable prefix of every top-level chain.
    const isChainLink = (node: ts.Node) =>
      ts.isPropertyAccessExpression(node) ||
      ts.isElementAccessExpression(node) ||
      ts.isIdentifier(node);
    source.forEachChild(function visit(node) {
      const parent = node.parent;
      const isInnerLink =
        parent &&
        (ts.isPropertyAccessExpression(parent) ||
          ts.isElementAccessExpression(parent)) &&
        parent.expression === node;
      const isPropertyName =
        parent && ts.isPropertyAccessExpression(parent) && parent.name === node;
      // `const d = dict.x` is the alias itself, not a read of `x`.
      const isAliasInitializer =
        parent &&
        ts.isVariableDeclaration(parent) &&
        parent.initializer === node;
      // The alias's own name in `const d = …` / `{ placements }` is not a read.
      const isDeclarationName =
        parent &&
        (ts.isVariableDeclaration(parent) || ts.isBindingElement(parent)) &&
        parent.name === node;
      if (
        isChainLink(node) &&
        !isInnerLink &&
        !isPropertyName &&
        !isAliasInitializer &&
        !isDeclarationName
      ) {
        let current: ts.Expression | null = node as ts.Expression;
        while (current) {
          const found = chain(current);
          if (found) {
            if (found.length > 0) used.add(found.join("."));
            break;
          }
          current =
            ts.isPropertyAccessExpression(current) ||
            ts.isElementAccessExpression(current)
              ? current.expression
              : null;
        }
      }
      node.forEachChild(visit);
    });
  }

  return used;
}

const covers = (parent: string, key: string) =>
  key === parent || key.startsWith(`${parent}.`);

describe("admin dictionary — every key has a consumer (TASK-816)", () => {
  const { leaves, objects } = collectDictionaryPaths();
  const used = collectUsedPaths(productionFiles(SRC));
  const usedList = [...used];
  const isUsed = (key: string) => usedList.some((path) => covers(key, path));

  it("finds the dictionary and its consumers (the scan is not vacuous)", () => {
    expect(leaves.length).toBeGreaterThan(1000);
    expect(used.size).toBeGreaterThan(1000);
  });

  it("has no key without a consumer", () => {
    const dead = leaves.filter(
      (key) =>
        !isUsed(key) &&
        !Object.keys(DYNAMIC_ACCESS).some((parent) => covers(parent, key)) &&
        !Object.keys(PENDING_CONSUMERS).some((parent) => covers(parent, key)),
    );
    expect(dead).toEqual([]);
  });

  it("allowlists only paths that exist in the dictionary", () => {
    const known = new Set([...leaves, ...objects]);
    const stale = [
      ...Object.keys(DYNAMIC_ACCESS),
      ...Object.keys(PENDING_CONSUMERS),
    ].filter((entry) => !known.has(entry));
    expect(stale).toEqual([]);
  });

  it("drops a pending entry once its consumer exists", () => {
    const wired = Object.keys(PENDING_CONSUMERS).filter((key) => isUsed(key));
    expect(wired).toEqual([]);
  });

  it("allowlists only subtrees the scan cannot see through", () => {
    // An entry whose every key is read statically hides nothing today — and
    // would hide the next dead key added under it tomorrow.
    const needless = Object.keys(DYNAMIC_ACCESS).filter((parent) =>
      leaves.filter((key) => covers(parent, key)).every((key) => isUsed(key)),
    );
    expect(needless).toEqual([]);
  });
});
