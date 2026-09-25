import { expect, type Locator } from "@playwright/test";

/**
 * Wait until React has hydrated `target` — i.e. its event handlers are live.
 *
 * The admin login is a server-rendered `<form onSubmit>` with no `method` or
 * `action` (checked with JavaScript disabled: under `next dev` the form is in
 * the HTML). Clicked before hydration, the browser performs a native GET submit
 * to the same URL and the React handler never runs. On a cold run the HTML can
 * arrive well before the client chunks, so a spec that clicks as soon as `goto`
 * resolves can race it (TASK-753). The storefront's login form is rendered on
 * the client (its Suspense boundary has a `null` fallback), so there this
 * returns at once — kept for symmetry and in case that boundary changes. The
 * cold-run failure actually captured for TASK-753 was the other mechanism, a
 * redirect target still compiling — see `warm-up.ts`.
 *
 * The signal is React's own: hydration attaches a `__reactProps$<id>` property
 * to every host element it adopts, and that property is what React's event
 * system reads the `onSubmit` from. Present on the form means a submit reaches
 * the handler. With JavaScript disabled this was verified to time out on the
 * admin form, so the check is not vacuous. No sleeping, no app-side test hook.
 */
export async function waitForHydration(target: Locator): Promise<void> {
  await expect
    .poll(
      () =>
        target.evaluate((el) =>
          Object.keys(el).some((key) => key.startsWith("__reactProps$")),
        ),
      {
        message:
          "the form was never hydrated — its submit would not reach React",
        // The client chunks of a cold route can take this long to compile.
        timeout: 30_000,
      },
    )
    .toBe(true);
}
