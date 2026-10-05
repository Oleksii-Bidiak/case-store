import nestConfig from '@store/eslint-config/nest';
import tseslint from 'typescript-eslint';

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
