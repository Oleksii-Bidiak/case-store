import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';

/**
 * TASK-808 — grep guard for the TASK-397 invariant.
 *
 * Every `@IsUUID` in `src/` must pass `'loose'` explicitly. A mode-less
 * `@IsUUID()` silently means validator's `'all'` (version nibble `[1-8]`,
 * variant `[89ab]` — node_modules/validator/lib/isUUID.js), and a pinned
 * version (`@IsUUID(4)`, `@IsUUID('4')`) is stricter still. Both answer 400 on
 * ids the database itself issued: the legacy seed's `deterministicUuid` wrote
 * ids that are UUID-shaped without being a UUID of any version (see
 * `product/dto/update-product.dto.ts` and its spec for the measurement).
 *
 * The invariant was fixed in five places by two commits and then re-broken by a
 * sixth DTO written afterwards (`attach-image.dto.ts`, TASK-441) — a rule held
 * only by a comment does not survive the next DTO. This spec is what holds it:
 * a new `@IsUUID` without `'loose'` anywhere under `src/` fails here, naming the
 * file and line.
 *
 * `ParseUUIDPipe` is deliberately NOT checked: NestJS's own default regex is
 * shape-only (equivalent to validator's `'loose'`), and pinning a version there
 * is what would break — see the note in `update-product.dto.ts`.
 */

const SRC_ROOT = join(__dirname, '..', '..');

function collectSourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      collectSourceFiles(full, out);
    } else if (name.endsWith('.ts') && !name.endsWith('.spec.ts')) {
      out.push(full);
    }
  }
  return out;
}

/**
 * Every `IsUUID(` call whose first argument is not the literal `'loose'`
 * (single or double quotes, any whitespace or line break in between). Matches
 * the decorator, not the `isUUID` function or the import specifier.
 */
const NON_LOOSE_IS_UUID = /\bIsUUID\((?!\s*['"]loose['"])/g;

function findNonLooseIsUuid(source: string): number[] {
  const lines: number[] = [];
  for (const match of source.matchAll(NON_LOOSE_IS_UUID)) {
    lines.push(source.slice(0, match.index).split('\n').length);
  }
  return lines;
}

describe("@IsUUID mode guard (TASK-808): every site in src/ passes 'loose'", () => {
  it('the matcher flags a mode-less or version-pinned decorator and passes a loose one', () => {
    expect(findNonLooseIsUuid('  @IsUUID()\n  id!: string;')).toEqual([1]);
    expect(findNonLooseIsUuid('  @IsUUID(4)\n')).toEqual([1]);
    expect(findNonLooseIsUuid("  @IsUUID('4', { each: true })\n")).toEqual([1]);
    expect(findNonLooseIsUuid("  @IsUUID('all')\n")).toEqual([1]);
    expect(findNonLooseIsUuid("x\n  @IsUUID(undefined, { message: 'm' })\n")).toEqual([2]);

    expect(findNonLooseIsUuid("  @IsUUID('loose')\n")).toEqual([]);
    expect(findNonLooseIsUuid('  @IsUUID("loose", { each: true })\n')).toEqual([]);
    expect(findNonLooseIsUuid("  @IsUUID(\n    'loose',\n    { message: 'm' },\n  )\n")).toEqual(
      [],
    );
    expect(findNonLooseIsUuid("import { IsUUID } from 'class-validator';")).toEqual([]);
    expect(findNonLooseIsUuid("isUUID(value, 'all')")).toEqual([]);
  });

  it("finds no @IsUUID without 'loose' anywhere under src/", () => {
    const files = collectSourceFiles(SRC_ROOT);
    // Sanity: the walk actually reached the DTOs, so an empty result means clean
    // rather than "looked at nothing".
    expect(files.some((f) => f.endsWith('update-product.dto.ts'))).toBe(true);

    const offenders = files.flatMap((file) =>
      findNonLooseIsUuid(readFileSync(file, 'utf8')).map(
        (line) => `${relative(SRC_ROOT, file).split('\\').join('/')}:${line}`,
      ),
    );

    expect(offenders).toEqual([]);
  });
});
