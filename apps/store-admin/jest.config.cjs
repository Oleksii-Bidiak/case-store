/**
 * Jest config for store-admin component tests (RTL + MSW in jsdom).
 *
 * store-admin has no pre-existing unit tests, so a single jsdom project covers
 * everything. Mirrors the `component` project of store-client. Run with
 * `npm run test -w apps/store-admin`.
 *
 * @type {import('jest').Config}
 */
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

const moduleNameMapper = {
  // Pin react/react-dom to ONE copy so app code under test and the react-dom
  // used by RTL share a single React instance (avoids a null dispatcher).
  "^react$": resolveSingleCopy("react"),
  "^react-dom$": resolveSingleCopy("react-dom"),
  "^react-dom/client$": resolveSingleCopy("react-dom/client"),
  "^react/jsx-runtime$": resolveSingleCopy("react/jsx-runtime"),
  "^react/jsx-dev-runtime$": resolveSingleCopy("react/jsx-dev-runtime"),
  "^@/(.*)$": "<rootDir>/$1",
};

module.exports = {
  rootDir: "src",
  displayName: "component",
  testEnvironment: "jsdom",
  // jsdom defaults to the "browser" export condition, which hides msw/node.
  testEnvironmentOptions: { customExportConditions: [""] },
  testMatch: ["**/*.test.{ts,tsx}"],
  moduleFileExtensions: ["ts", "tsx", "js", "mjs", "cjs", "json"],
  moduleNameMapper,
  setupFiles: ["<rootDir>/../jest.polyfills.js"],
  setupFilesAfterEnv: ["<rootDir>/shared/test/setup.ts"],
  transform: {
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
  },
  // MSW v2 + several deps ship ESM only; un-ignore them for transformation.
  transformIgnorePatterns: [
    "/node_modules/(?!(msw|@mswjs|@bundled-es-modules|@open-draft|rettime|until-async|strict-event-emitter|headers-polyfill|outvariant|is-node-process)/)",
  ],
};
