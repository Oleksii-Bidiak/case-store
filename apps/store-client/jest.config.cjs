/**
 * Jest config for store-client unit tests (pure-logic only, e.g. zod schemas).
 * React component / integration coverage is deferred to a future E2E suite.
 *
 * @type {import('jest').Config}
 */
module.exports = {
  rootDir: "src",
  testEnvironment: "node",
  testMatch: ["**/*.test.ts"],
  moduleFileExtensions: ["ts", "tsx", "js", "json"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/$1",
  },
  transform: {
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
  },
};
