/**
 * Jest config for store-admin component tests (RTL + MSW in jsdom).
 *
 * store-admin has no pre-existing unit tests, so a single jsdom project covers
 * everything. Mirrors the `component` project of store-client. Run with
 * `npm run test -w apps/store-admin`.
 *
 * @type {import('jest').Config}
 */
const moduleNameMapper = {
  // Pin react/react-dom to the single store-admin copy so app code under test
  // and react-dom used by RTL share one React instance (avoids null dispatcher).
  "^react$": "<rootDir>/../node_modules/react",
  "^react-dom$": "<rootDir>/../node_modules/react-dom",
  "^react-dom/client$": "<rootDir>/../node_modules/react-dom/client",
  "^react/jsx-runtime$": "<rootDir>/../node_modules/react/jsx-runtime",
  "^react/jsx-dev-runtime$": "<rootDir>/../node_modules/react/jsx-dev-runtime",
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
