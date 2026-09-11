/**
 * Stand-in for `@sentry/nextjs` in the `component` Jest project (TASK-402).
 *
 * Not a convenience — a necessity. The component project runs jsdom with
 * `customExportConditions: [""]` (so MSW's node interceptors resolve), and
 * `@sentry/nextjs` publishes an export map with no `require`/`default` entry at
 * the top level: only `browser`, `node`, `edge`, `import`. Under those
 * conditions Node's resolver finds nothing at all, and any component that
 * imports Sentry fails with "Cannot find module '@sentry/nextjs'" before a
 * single assertion runs. `jest.config.cjs` maps the package here instead.
 *
 * The functions are `jest.fn()`s, so a test can assert what was reported:
 *
 *   import * as Sentry from "@sentry/nextjs";
 *   expect(Sentry.addBreadcrumb).toHaveBeenCalledWith(
 *     expect.objectContaining({ data: expect.objectContaining({ statusCode: 401 }) }),
 *   );
 *
 * Jest's `resetMocks` is not enabled for this project, so clear them per-test
 * where the call count matters.
 */
export const addBreadcrumb = jest.fn();
export const captureException = jest.fn();
export const captureMessage = jest.fn();
export const setTag = jest.fn();
export const setContext = jest.fn();
export const setUser = jest.fn();
export const withScope = jest.fn((callback: (scope: unknown) => void) =>
  callback({ setTag: jest.fn(), setContext: jest.fn(), setExtra: jest.fn() }),
);
