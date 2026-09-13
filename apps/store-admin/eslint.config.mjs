import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';
import tailwindcss from 'eslint-plugin-tailwindcss';

/**
 * Toast policy guard (TASK-422).
 *
 * Errors must stay on screen until the operator dismisses them; successes fade
 * after 6 s. sonner cannot express that at the `<Toaster>` — its `ToastOptions`
 * is flat and type-agnostic, so the rule can only live at the call site. It
 * lives in exactly one: `@/shared/ui/toast`. Importing `sonner` anywhere else
 * re-opens the hole silently, because a `toast.error` from the raw package
 * simply inherits the 6 s default and looks completely normal in review.
 *
 * Added to each FSD block's existing options object rather than declared in a
 * config object of its own: ESLint flat config REPLACES a rule's options instead
 * of merging them, so a second object carrying `no-restricted-imports` would
 * silently delete the layer-boundary rules for every file it matched. (The same
 * trap as `no-restricted-syntax` in `rawFetchGuard` below.)
 *
 * `paths`, not `patterns`, and that distinction is load-bearing: as a pattern,
 * `sonner` also matches the RELATIVE `./sonner` — so `shared/ui/index.ts`, which
 * legitimately re-exports the local `sonner.tsx` wrapper, was reported as a
 * violation. `paths` matches the exact specifier only.
 */
const noSonnerOutsideWrapper = {
  name: 'sonner',
  message:
    'Імпортуй toast із «@/shared/ui/toast», а не напряму з sonner: лише там помилки отримують duration: Infinity (успіх зникає за 6 с, помилка чекає, поки її прочитають). Прямий toast.error із sonner мовчки зникне за 6 с. Виняток — shared/ui/toast.ts і shared/ui/sonner.tsx.',
};

/**
 * FSD (Feature-Sliced Design) layer boundary rules.
 *
 * Import direction is strictly downward:
 *   app → widgets → features → entities → shared
 *
 * Each layer may only import from layers below it, never above.
 * These rules enforce path-alias imports (e.g. @/entities/...).
 * Relative cross-layer imports are discouraged by convention and
 * caught in code review.
 */
const fsdBoundaryRules = [
  // shared — cannot import from any other layer
  {
    name: 'fsd-shared-boundaries',
    files: ['src/shared/**/*.{ts,tsx,js,jsx,mjs,mts,cts}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/app/**', '@/widgets/**', '@/features/**', '@/entities/**'],
              message:
                'FSD boundary violation: "shared" layer must not import from "app", "widgets", "features", or "entities" layers. Use @/shared/ instead.',
            },
          ],
          paths: [noSonnerOutsideWrapper],
        },
      ],
    },
  },
  // entities — can only import from shared
  {
    name: 'fsd-entities-boundaries',
    files: ['src/entities/**/*.{ts,tsx,js,jsx,mjs,mts,cts}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/app/**', '@/widgets/**', '@/features/**'],
              message:
                'FSD boundary violation: "entities" layer must not import from "app", "widgets", or "features" layers. Only @/shared/ and @/entities/ imports are allowed.',
            },
          ],
          paths: [noSonnerOutsideWrapper],
        },
      ],
    },
  },
  // features — can import from entities and shared only
  {
    name: 'fsd-features-boundaries',
    files: ['src/features/**/*.{ts,tsx,js,jsx,mjs,mts,cts}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/app/**', '@/widgets/**'],
              message:
                'FSD boundary violation: "features" layer must not import from "app" or "widgets" layers. Only @/shared/, @/entities/, and @/features/ imports are allowed.',
            },
          ],
          paths: [noSonnerOutsideWrapper],
        },
      ],
    },
  },
  // widgets — can import from features, entities, and shared only
  {
    name: 'fsd-widgets-boundaries',
    files: ['src/widgets/**/*.{ts,tsx,js,jsx,mjs,mts,cts}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/app/**'],
              message:
                'FSD boundary violation: "widgets" layer must not import from "app" layer. Only @/shared/, @/entities/, and @/features/ imports are allowed.',
            },
          ],
          paths: [noSonnerOutsideWrapper],
        },
      ],
    },
  },
];

/**
 * The two files that are ALLOWED to import sonner: the `<Toaster>` wrapper and
 * the `toast` wrapper that owns the per-type duration policy.
 *
 * This re-declares `no-restricted-imports` for them rather than switching it
 * `off`, so they keep the shared-layer boundary check and lose only the sonner
 * clause. Switching the rule off wholesale would let exactly these two files
 * reach upward into `features`/`widgets` unnoticed.
 */
const sonnerWrapperExemption = [
  {
    name: 'sonner-wrapper-exemption',
    files: ['src/shared/ui/sonner.tsx', 'src/shared/ui/toast.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/app/**', '@/widgets/**', '@/features/**', '@/entities/**'],
              message:
                'FSD boundary violation: "shared" layer must not import from "app", "widgets", "features", or "entities" layers. Use @/shared/ instead.',
            },
          ],
        },
      ],
    },
  },
];

/**
 * Test infrastructure is cross-cutting: a component test renders a widget/feature
 * while wiring providers from the shared test helper. Exempt test files and
 * `shared/test/` from the FSD import-direction rule (it still applies to all
 * production code).
 */
const testOverrides = [
  {
    name: 'fsd-test-exemptions',
    files: ['src/**/*.test.{ts,tsx}', 'src/shared/test/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': 'off',
    },
  },
];

/**
 * Design-token guard (TASK-260): forbid Tailwind arbitrary values like
 * `text-[13.5px]` / `w-[137px]` — new code must use the design-token scale
 * (or add a proper `@theme` token in globals.css). Pre-existing violations
 * are grandfathered in `eslint-suppressions.json`; structurally necessary
 * cases carry an inline eslint-disable comment with a reason.
 * Only `no-arbitrary-value` is enabled — not the plugin's full preset.
 */
const tailwindTokenGuard = [
  {
    name: 'tailwind-no-arbitrary-value',
    plugins: { tailwindcss },
    settings: {
      tailwindcss: {
        cssConfigPath: './src/app/globals.css',
      },
    },
    rules: {
      'tailwindcss/no-arbitrary-value': 'error',
    },
  },
];

/**
 * Raw-`fetch` guard (TASK-346 — mirrors the storefront rule from TASK-327).
 *
 * WHY THIS IS HERE EVEN THOUGH THE ADMIN PANEL HAS ZERO VIOLATIONS TODAY.
 * In the storefront this rule was written *after* the damage: a build-time
 * `fetch` with no deadline hung `next build` for 213 s and then failed it.
 * `fetch` has no default timeout, so an API that accepts the TCP connection and
 * then goes silent — a half-started container, a paused VPS, an API booting in
 * parallel in CI — hangs the request forever. `catch → null` does not save you:
 * it protects against an *error*, not against *silence*. Next then burns
 * `staticPageGenerationTimeout` per page, retries 3 times, and dies with
 * `Failed to build /<page> after 3 attempts`.
 *
 * The admin panel is one `next build` away from the identical failure. Today it
 * is clean only because every call goes through Orval/axios by habit — nothing
 * enforces it. This rule turns the habit into a constraint, at the moment it is
 * free (0 violations, so no suppression list and no grandfathering).
 *
 * WHY THE MESSAGE DIFFERS FROM THE STOREFRONT'S. store-client answers "use
 * `serverFetch` from @/shared/api/server-fetch". The admin panel has no such
 * helper and no server-side data fetching at all — it is authenticated,
 * client-rendered, and talks to store-api exclusively through the Orval hooks
 * over the shared axios instance (`@/shared/api/instance`), which already
 * carries auth refresh, CSRF and the response envelope. Pointing at a module
 * that does not exist here would be a worse rule, so the message points at what
 * this app actually has. If server-side fetching is ever introduced in the
 * admin panel, port `shared/api/server-fetch.ts` from the storefront first and
 * add it to `ignores` below — do not weaken the selector.
 *
 * Both selectors are kept, including the second one: banning only `fetch(...)`
 * would leave `globalThis.fetch(...)` / `window.fetch(...)` as a trivial escape
 * hatch that reads as deliberate evasion in review but passes lint.
 *
 * Exception: `shared/api/generated/**` (Orval output, never hand-edited).
 *
 * ────────────────────────────────────────────────────────────────────────────
 * THIS OBJECT ALSO CARRIES THE DATE-FORMATTING GUARD (TASK-421), AND THAT IS
 * DELIBERATE — DO NOT SPLIT IT OUT.
 *
 * ESLint flat config REPLACES a rule's options rather than merging them. A
 * second config object that also sets `no-restricted-syntax` would win for every
 * matched file and silently switch the raw-`fetch` selectors above OFF — lint
 * would stay green while the guard no longer existed. Anything new that this
 * rule should forbid is appended to the SAME array below.
 *
 * The date selectors close the drift documented in `shared/lib/format/
 * formatDate.ts`: 18 hand-rolled `Intl.DateTimeFormat` singletons that disagreed
 * with each other, plus bare `toLocale*String()` calls with no locale at all.
 * `shared/lib/format/**` is exempted via `ignores` — that folder is where the
 * canonical formatters are allowed to construct Intl objects.
 *
 * Only ZERO-ARGUMENT `toLocale*String()` is banned. `toLocaleString("uk-UA")` on
 * a NUMBER is legitimate (see `DashboardTrafficCard`), and flagging it would
 * push people back to hand-rolled formatting.
 */
const rawFetchGuard = [
  {
    name: "no-raw-fetch",
    files: ["src/**/*.{ts,tsx,js,jsx,mjs,mts,cts}"],
    ignores: ["src/shared/api/generated/**", "src/shared/lib/format/**"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "CallExpression[callee.name='fetch']",
          message:
            "Заборонений «голий» fetch: він не має таймауту за замовчуванням, тому мовчазний API вішає збірку (кожна сторінка вигорає staticPageGenerationTimeout, Next ретраїть її 3 рази і build падає з «Failed to build … after 3 attempts»). В адмінці всі запити йдуть через згенеровані Orval-хуки поверх axios-інстансу @/shared/api/instance — він уже несе авторизацію, CSRF і конверт відповіді. Якщо колись знадобиться запит на сервері, спершу перенеси shared/api/server-fetch.ts зі store-client (він завжди накладає AbortSignal.timeout).",
        },
        {
          selector:
            "CallExpression[callee.object.name=/^(globalThis|global|window|self)$/][callee.property.name='fetch']",
          message:
            "Заборонений «голий» fetch (через globalThis/window/global/self) — обхід того самого правила. Використовуй згенеровані Orval-хуки поверх @/shared/api/instance.",
        },
        {
          selector:
            "CallExpression[arguments.length=0][callee.property.name=/^toLocale(Date|Time)?String$/]",
          message:
            "Дата без локалі: toLocaleDateString()/toLocaleTimeString()/toLocaleString() без аргументів беруть локаль і часовий пояс браузера, тож кожен оператор бачить свій формат — а сервер віддає UTC, тому час ще й з'їжджає на 2–3 години без жодної позначки. Використовуй спільні форматери з @/shared/lib: formatDate (09.09.2026), formatDateTime (09.09.2026, 18:40), formatTime (18:40), formatRelative («5 хвилин тому»). Вони фіксують uk-UA, 24-годинний час і timeZone Europe/Kyiv. Для ЧИСЕЛ toLocaleString(\"uk-UA\") з явною локаллю дозволений.",
        },
        {
          selector:
            "NewExpression[callee.object.name='Intl'][callee.property.name=/^(DateTimeFormat|RelativeTimeFormat)$/]",
          message:
            "Власний Intl.DateTimeFormat/RelativeTimeFormat поза shared/lib/format: саме так в адмінці з'явилося 18 різних форматерів — вісім з них в американському форматі («Sep 9, 2026, 6:40 PM») — і жоден не задавав timeZone, тому на сервері (UTC) час показувався зміщеним. Імпортуй formatDate / formatDateTime / formatTime / formatRelative з @/shared/lib. Якщо потрібен НОВИЙ формат дати — додай його у shared/lib/format/formatDate.ts, а не тут.",
        },
      ],
    },
  },
];

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  ...fsdBoundaryRules,
  ...sonnerWrapperExemption,
  ...testOverrides,
  ...tailwindTokenGuard,
  ...rawFetchGuard,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    '.next/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
    // CommonJS test tooling (must use require; runs outside the app bundle).
    'jest.polyfills.js',
  ]),
]);

export default eslintConfig;