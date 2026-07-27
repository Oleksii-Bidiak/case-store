/**
 * Jest config for store-client.
 *
 * Two projects share one runner:
 *  - `unit`      — pure-logic tests (zod schemas, formatters, builders) in a
 *                  node environment. `*.test.ts` only. ts-jest. (Unchanged from
 *                  the original config — existing tests run exactly as before.)
 *  - `component` — React component tests (RTL + MSW) in a jsdom environment.
 *                  `*.test.tsx` only. @swc/jest for fast JSX transforms, with a
 *                  setup file that loads jest-dom and the MSW server lifecycle.
 *
 * Run both with `npm run test -w apps/store-client`.
 *
 * @type {import('jest').Config}
 */
const moduleNameMapper = {
  "^@/(.*)$": "<rootDir>/$1",
};

/**
 * Resolve a package to the exact copy THIS workspace would load at runtime, as
 * an absolute POSIX path.
 *
 * Deliberately `require.resolve` rather than a hard-coded
 * `<rootDir>/../node_modules/...`: whether a dependency lands in the app's own
 * node_modules or is hoisted to the monorepo root is an npm decision that
 * changes whenever the lockfile is re-resolved. The old hard-coded path silently
 * became invalid the moment react hoisted to the root, and every component suite
 * failed with "Could not locate module react/jsx-runtime". `require.resolve`
 * follows Node's own lookup (app node_modules → root node_modules), so it keeps
 * pointing at the single real copy either way.
 */
const resolveSingleCopy = (id) => require.resolve(id).replace(/\\/g, "/");

/**
 * Component-project module mapper. Pins react/react-dom (and the JSX runtimes)
 * to ONE copy so the app code under test and the react-dom used by RTL share a
 * single React instance — otherwise hooks see a null dispatcher.
 */
const componentModuleNameMapper = {
  "^react$": resolveSingleCopy("react"),
  "^react-dom$": resolveSingleCopy("react-dom"),
  "^react-dom/client$": resolveSingleCopy("react-dom/client"),
  "^react/jsx-runtime$": resolveSingleCopy("react/jsx-runtime"),
  "^react/jsx-dev-runtime$": resolveSingleCopy("react/jsx-dev-runtime"),
  ...moduleNameMapper,
};

/** ts-jest transform used by the unit project (matches the legacy config). */
const tsJestTransform = {
  "^.+\\.tsx?$": [
    "ts-jest",
    {
      isolatedModules: true,
      tsconfig: {
        module: "commonjs",
        target: "es2020",
        esModuleInterop: true,
        jsx: "react-jsx",
        skipLibCheck: true,
        verbatimModuleSyntax: false,
      },
    },
  ],
};

/**
 * @swc/jest transform used by the component project (fast JSX/TSX). The key also
 * matches `.mjs`/`.cjs` so MSW v2's ESM-only transitive deps (rettime, etc.) can
 * be transformed (see `componentTransformIgnore`).
 */
const swcTransform = {
  "^.+\\.(mjs|cjs|jsx?|tsx?)$": [
    "@swc/jest",
    {
      jsc: {
        parser: { syntax: "typescript", tsx: true },
        transform: { react: { runtime: "automatic" } },
        target: "es2020",
      },
    },
  ],
};

/**
 * MSW v2 and several of its deps ship ESM only. Jest ignores node_modules from
 * transformation by default, so these must be explicitly un-ignored to be run
 * under the CJS-style component project.
 */
const componentTransformIgnore = [
  "/node_modules/(?!(msw|@mswjs|@bundled-es-modules|@open-draft|rettime|until-async|strict-event-emitter|headers-polyfill|outvariant|is-node-process)/)",
];

module.exports = {
  projects: [
    {
      displayName: "unit",
      rootDir: "src",
      testEnvironment: "node",
      testMatch: ["**/*.test.ts"],
      moduleFileExtensions: ["ts", "tsx", "js", "json"],
      moduleNameMapper,
      transform: tsJestTransform,
    },
    {
      displayName: "component",
      rootDir: "src",
      testEnvironment: "jsdom",
      // jsdom defaults to the "browser" export condition, which hides msw/node
      // (and its interceptors). Force the default condition so node-mode MSW and
      // axios resolve correctly under Jest.
      testEnvironmentOptions: { customExportConditions: [""] },
      testMatch: ["**/*.test.tsx"],
      moduleFileExtensions: ["ts", "tsx", "js", "mjs", "cjs", "json"],
      moduleNameMapper: componentModuleNameMapper,
      // Polyfills run before the framework so msw/node can load under jsdom.
      setupFiles: ["<rootDir>/../jest.polyfills.js"],
      setupFilesAfterEnv: ["<rootDir>/shared/test/setup.ts"],
      transform: swcTransform,
      transformIgnorePatterns: componentTransformIgnore,
    },
  ],
};
