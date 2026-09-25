/**
 * Route warm-up (Playwright `globalSetup`, TASK-753). Runs after `webServer`
 * has booted all three servers — Playwright starts its webServer plugin before
 * any global setup — and before the first test.
 *
 * ## The flake this removes, and how it was measured
 *
 * The frontends run under `next dev`, which compiles a route the first time it
 * is requested. On a cold run (fresh servers, no `.next` cache) the first login
 * of each app therefore pays for two compiles inside a single 5-second
 * `expect(page).not.toHaveURL(/\/login/)`. From the trace of a cold run where
 * `admin-order-filters` failed still on `/login`:
 *
 *     goto /login                          5.2 s   (cold compile of /login)
 *     POST /api/auth/login                 200 after 0.1 s
 *     GET  /?_rsc=…  (router.push("/"))    4.7 s   (cold compile of the dashboard)
 *     expect not /login                    timed out at 5.0 s, URL still /login
 *
 * The login worked; the redirect target was still compiling. Not the
 * "click before hydration" candidate: the URL had no query string (a native GET
 * submit of the form would have put email/password in it), and the login POST
 * was sent by the React handler.
 *
 * ## What this does
 *
 * Requests every route the suite lands on right after a login or opens by deep
 * link, on both frontends, and waits for a 200. It also fetches the page's own
 * `/_next/static/*.js` chunks, because a client navigation needs those too, and
 * turbopack builds them on first request. Nothing is slept: each request simply
 * takes as long as the compile does.
 *
 * Admin routes sit behind `proxy.ts`, which only checks that the
 * `admin_ui_session` marker cookie EXISTS (it cannot see the API's HttpOnly
 * session), so the warm-up sends a dummy marker to get the page itself compiled
 * rather than the /login redirect. The page renders its signed-out shell; no API
 * session is created and no rate-limit bucket is touched.
 *
 * A route that keeps answering 5xx fails the whole run here, in seconds, with
 * the route named — instead of every test that touches it timing out a minute
 * each. One such case was seen during the TASK-753 runs: a cold `store-admin`
 * compile of `/login` failed inside `next/font/google` ("Module not found:
 * Can't resolve '@vercel/turbopack-next/internal/font/google/font'") and kept
 * serving 500 until `apps/store-admin/.next` was deleted.
 */

import { ADMIN_ORIGIN, CLIENT_ORIGIN } from "./ports";

/** Storefront: the login page, its post-login target and the deep links. */
const CLIENT_ROUTES = ["/login", "/", "/checkout", "/cart", "/products"];

/** Admin: the login page, the dashboard it redirects to and the deep links. */
const ADMIN_ROUTES = ["/login", "/", "/orders", "/staff", "/users"];

/** Mirrors `ADMIN_UI_SESSION_COOKIE` in store-admin's shared config. */
const ADMIN_MARKER_COOKIE = "admin_ui_session=warm-up";

/**
 * Per route. A cold compile measured 5–50 s on a dev box; the ceiling only
 * matters when a server is broken, and then the error below is the point.
 */
const ROUTE_DEADLINE_MS = 180_000;
/** Consecutive 5xx answers after which a route counts as broken, not compiling. */
const MAX_SERVER_ERRORS = 3;

interface Warmed {
  url: string;
  ms: number;
  chunks: number;
}

/**
 * GET until the route has compiled. A 2xx/3xx answer means the server ran the
 * route (a redirect — e.g. an empty guest cart bounced off /checkout — still
 * compiled it); the body is returned only for a 200, the one worth scanning for
 * chunks. A 4xx is a wrong route list, not a slow compile, so it fails at once.
 */
async function fetchCompiled(
  url: string,
  headers: Record<string, string>,
): Promise<string> {
  const started = Date.now();
  let serverErrors = 0;
  let lastProblem = "";
  while (Date.now() - started < ROUTE_DEADLINE_MS) {
    try {
      const res = await fetch(url, { headers, redirect: "manual" });
      const body = await res.text();
      if (res.status < 400) return res.status === 200 ? body : "";
      lastProblem = `HTTP ${res.status}`;
      if (res.status < 500) break;
      if (++serverErrors >= MAX_SERVER_ERRORS) break;
    } catch (error) {
      // Connection refused / reset while the server restarts a worker.
      lastProblem = (error as Error).message;
    }
    // Back off a little between attempts; the next request re-joins the compile.
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(
    `e2e warm-up: ${url} did not compile (last: ${lastProblem}). ` +
      "A dev server that keeps returning 500 on a cold compile may have cached " +
      "the failure: delete that app's .next directory and re-run.",
  );
}

/** Same-origin `/_next/static/…js` chunks the HTML asks the browser to load. */
function scriptChunks(html: string): string[] {
  const found = new Set<string>();
  for (const match of html.matchAll(
    /(?:src|href)="(\/_next\/static\/[^"]+\.js)"/g,
  )) {
    found.add(match[1]);
  }
  return [...found];
}

async function warmRoute(
  origin: string,
  route: string,
  headers: Record<string, string>,
): Promise<Warmed> {
  const started = Date.now();
  const html = await fetchCompiled(`${origin}${route}`, headers);
  const chunks = scriptChunks(html);
  await Promise.all(
    chunks.map((chunk) => fetchCompiled(`${origin}${chunk}`, {})),
  );
  return {
    url: `${origin}${route}`,
    ms: Date.now() - started,
    chunks: chunks.length,
  };
}

/** One app's routes in order: a dev server compiles one route at a time anyway. */
async function warmApp(
  origin: string,
  routes: string[],
  headers: Record<string, string>,
): Promise<Warmed[]> {
  const warmed: Warmed[] = [];
  for (const route of routes)
    warmed.push(await warmRoute(origin, route, headers));
  return warmed;
}

export default async function globalSetup(): Promise<void> {
  const started = Date.now();
  // The two apps are separate processes, so they compile in parallel.
  const [client, admin] = await Promise.all([
    warmApp(CLIENT_ORIGIN, CLIENT_ROUTES, {}),
    warmApp(ADMIN_ORIGIN, ADMIN_ROUTES, { cookie: ADMIN_MARKER_COOKIE }),
  ]);
  const summary = [...client, ...admin]
    .map((w) => `${w.url} ${w.ms}ms (${w.chunks} chunks)`)
    .join(", ");
  console.log(`e2e warm-up done in ${Date.now() - started}ms: ${summary}`);
}
