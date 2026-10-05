import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import nestConfig from '@store/eslint-config/nest';
import tseslint from 'typescript-eslint';

/**
 * A module's `index.ts` is its public contract (TASK-818).
 *
 * Another module is entered through one of its OFFICIAL entry points only:
 *   - its barrel (`../order`, `../order/index`);
 *   - a `*.module` file, to import the Nest module class itself;
 *   - one of the sub-barrels listed in `OFFICIAL_SUB_BARRELS`;
 *   - `common/<entry>` — `common` is the shared kernel, not a feature module: it
 *     has no root barrel and no Nest module, and each of its sub-directories
 *     (`common/pagination`, `common/validators`, …) or single-file leaves
 *     (`common/color-axis`) is an entry of its own. Reaching BELOW that
 *     (`common/utils/csv.util`) is still a deep import.
 * Anything else (`../product/product-visibility`, `../../cart/cart.repository`)
 * reaches into the module's internals and is reported.
 *
 * A barrel re-exports the `*.module` file, so importing one loads that module's
 * whole graph — and where that graph leads back to the importer, the require
 * cycle leaves a decorator / `design:paramtypes` value `undefined` at load time
 * ("CurrentUser is not a function", a Nest DI error at bootstrap). That is the ONE
 * accepted reason for a deep path, and it is written down where it happens:
 *   // eslint-disable-next-line local/no-deep-module-import -- cycle: <chain>
 *
 * Why a local rule and not `no-restricted-imports` patterns: a pattern sees only
 * the import string, not the file it sits in, so it cannot tell `../dto/x` inside
 * the importer's own module from `../dto/x` in a sibling module — nor that
 * `../../order/x` leaves `src/order/returns/` for the SAME module. This rule
 * resolves the path against the importing file and compares the top-level
 * directories under `src/`. It also keeps clear of the flat-config trap below:
 * the service block's `no-restricted-imports` is untouched.
 */
const SRC_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'src');
const SHARED_KERNEL = 'common';
const OFFICIAL_SUB_BARRELS = new Set([
  // RBAC: the permission catalogue, `@RequirePermission`, `PermissionGuard`.
  'auth/permissions',
  // `@CurrentUser()` — imported by most admin controllers, and lighter than the
  // auth barrel (no AuthModule graph), which is what keeps them off a cycle.
  'auth/decorators',
]);
const DEEP_IMPORT_MESSAGE =
  "'{{source}}' reaches into the internals of the `{{module}}` module. Import through the " +
  "module's index.ts (or an official sub-barrel / *.module file) — TASK-818. If the barrel " +
  'creates a require cycle, keep the deep path with ' +
  '`// eslint-disable-next-line local/no-deep-module-import -- cycle: <chain>`.';

const noDeepModuleImport = {
  meta: {
    type: 'problem',
    docs: { description: "Import other modules only through their public entry points (TASK-818)." },
    schema: [],
    messages: { deep: DEEP_IMPORT_MESSAGE },
  },
  create(context) {
    const fromSegments = path.relative(SRC_DIR, context.physicalFilename).split(path.sep);
    if (fromSegments[0] === '..') return {};
    // A file directly under `src/` (main.ts, app.module.ts) belongs to no module.
    const fromModule = fromSegments.length > 1 ? fromSegments[0] : null;

    // Reported on the whole statement, so the `eslint-disable-next-line` of a
    // multi-line import sits above its `import {` line, not inside the braces.
    function check(node, reportOn = node) {
      if (!node || node.type !== 'Literal' || typeof node.value !== 'string') return;
      const source = node.value;
      if (!source.startsWith('.')) return;
      const target = path
        .relative(SRC_DIR, path.resolve(path.dirname(context.physicalFilename), source))
        .split(path.sep);
      if (target[0] === '..' || target.length < 2) return; // outside src, or a src-root file
      const [module, ...rest] = target;
      if (module === fromModule) return;
      if (!fs.existsSync(path.join(SRC_DIR, module))) return;
      if (rest[rest.length - 1] === 'index') rest.pop();
      const entry = rest.join('/');
      if (entry === '') return; // the barrel
      if (/\.module$/.test(rest[rest.length - 1])) return;
      if (OFFICIAL_SUB_BARRELS.has(`${module}/${entry}`)) return;
      if (module === SHARED_KERNEL && rest.length === 1) return;
      context.report({ node: reportOn, messageId: 'deep', data: { source, module } });
    }

    return {
      ImportDeclaration: (node) => check(node.source, node),
      ExportNamedDeclaration: (node) => check(node.source, node),
      ExportAllDeclaration: (node) => check(node.source, node),
      ImportExpression: (node) => check(node.source),
      TSImportType: (node) => check(node.argument?.literal ?? node.argument),
      CallExpression: (node) => {
        if (node.callee.type === 'Identifier' && node.callee.name === 'require') {
          check(node.arguments[0]);
        }
      },
    };
  },
};

/**
 * "Services never touch the database client" (AGENTS.md, Clean Architecture),
 * enforced rather than written down (TASK-822). The last exception —
 * `app.service.ts` running `SELECT 1` for the health probe — now goes through
 * `app.repository.ts`, so the rule can hold with no carve-out for a service.
 *
 * `Prisma` (the namespace: error classes, input types) stays importable: a
 * service catching `Prisma.PrismaClientKnownRequestError` is reading an error,
 * not running a query.
 *
 * NOTE for whoever adds another `no-restricted-imports` block here: flat config
 * REPLACES a rule's options when a later object matching the same file sets the
 * rule again — it does not merge them. A second block for `*.service.ts` would
 * silently drop these restrictions; extend this one instead. (No shared config
 * in `@store/eslint-config` sets the rule today — checked with
 * `npx eslint --print-config src/order/order.service.ts`.)
 */
const SERVICE_DATA_ACCESS_RESTRICTIONS = {
  paths: [
    {
      name: '@prisma/client',
      importNames: ['PrismaClient'],
      message:
        'Services must not use PrismaClient — put the query in a repository (AGENTS.md, TASK-822).',
    },
  ],
  patterns: [
    {
      group: ['**/prisma', '**/prisma/prisma.service', '**/prisma/index'],
      importNames: ['PrismaService'],
      message:
        'Services must not inject PrismaService — put the query in a repository (AGENTS.md, TASK-822).',
    },
  ],
};

/**
 * `isOwner` is not a lookup key (TASK-634).
 *
 * `@@unique([isOwner], where: { isOwner: true })` is a PARTIAL unique index —
 * unique for `true` only — but Prisma still generates `isOwner` into
 * `UserWhereUniqueInput`. So `user.update({ where: { isOwner: false } })`
 * type-checks and, at runtime, matches every account that is not the owner.
 * Nothing writes that today; `where: { isOwner: true }` is simply the tempting
 * way to "find the owner" in the next refactor of the transfer, and the `false`
 * half is one keystroke away. Find the owner with `findFirst` / `updateMany` and
 * write by `id`.
 *
 * Matched on the methods that take a UNIQUE selector; `findFirst`, `findMany`,
 * `updateMany`, `count` filter and are fine.
 */
const ISOWNER_UNIQUE_SELECTOR = {
  selector:
    'CallExpression[callee.property.name=/^(findUnique|findUniqueOrThrow|update|upsert|delete)$/]' +
    ' > ObjectExpression > Property[key.name="where"] > ObjectExpression' +
    ' > Property[key.name="isOwner"]',
  message:
    '`isOwner` is not a unique selector: its index is partial, so `where: { isOwner: false }` ' +
    'matches every non-owner. Use findFirst/updateMany to find the owner and write by id ' +
    '(TASK-634, schema.prisma User.isOwner).',
};

/**
 * The `{ data, meta? }` response envelope is built by the CONTROLLER (TASK-806,
 * AGENTS.md "Backend Conventions" rule 5). Services return domain data — an
 * entity, an array, `Paginated<T>` from `common/pagination`, or a small domain
 * result type — so a service can be reused by another service, a job or a
 * script without unwrapping an HTTP shape, and the wire format lives in one layer.
 *
 * Matched: an object literal with a `data` key that a service returns (explicit
 * `return` or an arrow's implicit return, also through `as` / `satisfies` / `!`),
 * and a `data` member declared in an interface / type literal (the old
 * `XxxResponse { data; meta }` types). Spec files (`*.service.spec.ts`) are not
 * matched by the glob, so test doubles may still say `data`. A
 * service that needs a `data` key for a reason other than the HTTP envelope (a
 * payment provider's payload, say) disables the line with that reason, rather
 * than the selector being weakened for everyone.
 */
const ENVELOPE_MESSAGE =
  'Services return domain data, not the `{ data, meta }` response envelope — the controller ' +
  'builds it (TASK-806, AGENTS.md "Backend Conventions" rule 5). Return the entity / array / ' +
  '`Paginated<T>` from common/pagination instead.';

// What a service hands back: an explicit `return` or an arrow's implicit return,
// seen through up to two `as` / `satisfies` / `!` wrappers — a cast must not be the
// way around the rule (`return { data } as Foo`, `{ data } satisfies X as Y`).
const RETURNS = ':matches(ReturnStatement, ArrowFunctionExpression)';
const TS_WRAPPER = ':matches(TSAsExpression, TSSatisfiesExpression, TSNonNullExpression)';
const DATA_KEY = 'ObjectExpression > Property[key.name="data"]';

const SERVICE_ENVELOPE_SELECTORS = [
  { selector: `${RETURNS} > ${DATA_KEY}`, message: ENVELOPE_MESSAGE },
  { selector: `${RETURNS} > ${TS_WRAPPER} > ${DATA_KEY}`, message: ENVELOPE_MESSAGE },
  {
    selector: `${RETURNS} > ${TS_WRAPPER} > ${TS_WRAPPER} > ${DATA_KEY}`,
    message: ENVELOPE_MESSAGE,
  },
  {
    selector: 'TSPropertySignature[key.name="data"]',
    message: ENVELOPE_MESSAGE,
  },
];

export default [
  ...nestConfig,
  {
    languageOptions: {
      parser: tseslint.parser,
    },
  },
  {
    ignores: ['dist/', 'node_modules/', 'coverage/'],
    rules: {
      'prettier/prettier': ['error', { endOfLine: 'auto' }],
      // Same flat-config caveat as `no-restricted-imports` above: a later block
      // setting `no-restricted-syntax` REPLACES this list — add selectors here.
      'no-restricted-syntax': ['error', ISOWNER_UNIQUE_SELECTOR],
    },
  },
  {
    // TASK-818 — see `noDeepModuleImport` above. Specs may reach into internals
    // (they test them); the e2e/int suites live in `test/` and are not matched.
    files: ['src/**/*.ts'],
    ignores: ['src/**/*.spec.ts'],
    plugins: { local: { rules: { 'no-deep-module-import': noDeepModuleImport } } },
    rules: {
      'local/no-deep-module-import': 'error',
    },
  },
  {
    files: ['src/**/*.service.ts'],
    // The Prisma client's own Nest wrapper is the one service that IS the client.
    ignores: ['src/prisma/prisma.service.ts'],
    rules: {
      'no-restricted-imports': ['error', SERVICE_DATA_ACCESS_RESTRICTIONS],
      // Replaces the global list for services (flat config does not merge), so
      // the global selector is repeated here before the service-only ones.
      'no-restricted-syntax': ['error', ISOWNER_UNIQUE_SELECTOR, ...SERVICE_ENVELOPE_SELECTORS],
    },
  },
];
