# Plan 153 — Google OAuth Sign-In (TASK-168)

> **Status:** ⬜ Not started
> **Phase:** Roadmap — «Пізніша хвиля» (post-Етап-7 backlog)
> **Origin:** Auth slide-out social-login stubs (plan 129, stub audit row "social login") +
> owner decision 2026-07-11 (see `docs/plans/152-late-wave-2-orchestration.md`)
> **Created:** 2026-07-11
> **BACKLOG task:** TASK-168 (single task, no sub-task split in BACKLOG — see §Scope note)
> **Implementation:** single `tdd-agent` worktree, branch `feature/168-google-oauth`, per
> `docs/plans/152-late-wave-2-orchestration.md` §Фаза 2 (WT A). Auth is a listed critical
> module (AGENTS.md §Testing Strategy) — strict Red→Green→Refactor for the service-layer
> business logic (§TDD below).

## Overview

The login form (`apps/store-client/src/features/auth/ui/login-form.tsx`) already renders Google
and Apple social sign-in buttons from the Claude Design import, but both are honest stubs — every
click just shows a `dict.auth.login.socialSoon` toast. There is zero OAuth infrastructure on the
backend: no provider fields on `User`, no linking model, `passwordHash` is `NOT NULL`, and neither
`passport-google-oauth20` nor `openid-client` is installed (only `@nestjs/passport` +
`passport-jwt`, wired for the existing JWT access/refresh strategies).

This plan replaces the Google stub with a real, redirect-based OAuth 2.0 flow: `GET
/api/auth/google` → Google's consent screen → `GET /api/auth/google/callback` → account
resolution (link-by-verified-email or auto-provision) → the exact same refresh-cookie +
guest-cart/wishlist-merge flow the password login already uses → redirect back to the storefront,
where the existing bootstrap-on-mount session restore (`AuthProvider`, calls `/api/auth/refresh`
on load) picks up the freshly-set cookie with **zero token-in-URL exposure**.

**Apple is explicitly out of scope** (owner decision 2026-07-11, FINAL) — its button keeps
showing the `socialSoon` toast exactly as it does today; nothing about it changes in this plan.

## Owner-locked decisions (2026-07-11, FINAL — not reopened)

1. **Google only.** Apple stays a stub. No Apple-specific code, dictionary keys, or env vars are
   touched.
2. **Rejection behavior on conflicts follows the TASK-274/287 policy** (`auth.service.ts`,
   `docs/plans/149-late-wave-orchestration.md` plan 149 §TASK-274/287, `docs/plans/136-*.md`):
   generic refusal for every rejection reason, no account-existence or ban-status oracle. This
   plan's design (§Technical Design → "Locked-account resolution") applies that policy literally:
   a Google login that resolves to a deactivated or soft-deleted user throws the **exact same**
   `INVALID_CREDENTIALS_MESSAGE` constant `login()` already throws, and reuses the **exact same**
   `notifyLockedAccountOwner` mail-outbox mechanism TASK-287 built — no new message, no new
   branch shape, no new oracle.

## Scope

### In Scope

- `OAuthAccount` model (provider + providerId unique, linked to `User`), appended to the end of
  `schema.prisma`; `User.passwordHash` becomes nullable (a Google-only account has no password).
- `AuthRepository` additions: find/link an OAuth account, create a user without a password.
- `AuthService.loginWithGoogleProfile()` — the account-resolution business logic (link-by-verified-
  email / auto-provision / locked-account refusal), unit-tested Red→Green→Refactor against a
  **mocked Google profile** (no real Google credentials exist yet — see §Testing strategy).
- A regression guard on the existing `AuthService.login()` for the new `passwordHash: null` case
  (a Google-only user attempting a password login must get the same generic rejection, not a
  crash) — TDD, since it edits `login()`'s existing critical-path logic.
- Passport wiring: `GoogleStrategy` (mirrors `JwtAccessStrategy`/`JwtRefreshStrategy`'s existing
  shape), a **session-free, JWT-signed OAuth `state` store** (no `express-session` is installed —
  see §CSRF/state design), and a `GoogleAuthGuard` that gracefully 503s when Google credentials
  are not configured (mirrors the existing `NovaPoshtaClient`/`NP_API_KEY` graceful-degradation
  pattern) instead of crashing app boot.
- `AuthController` routes `GET /api/auth/google` and `GET /api/auth/google/callback`, reusing the
  controller's **existing** `setRefreshCookie` / `mergeGuestCartIfPresent` /
  `mergeGuestWishlistIfPresent` private helpers unchanged — zero duplication of that logic.
- `apps/store-api/.env.example` + `env.validation.ts`: three new **optional** vars
  (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL`). Absent → the app boots
  normally and the two routes respond 503, exactly like Nova Poshta without `NP_API_KEY`.
- `store-client`: the Google button in `login-form.tsx` navigates to `GET
/api/auth/google?redirect=<sanitized target>` instead of showing a toast; a new generic
  `oauthError` banner (reusing the `useSearchParams()` the component already has) for the
  failure-redirect path. Apple button is untouched.
- New `dict.auth.oauth.*` sub-namespace appended at the end of the existing `auth: {...}` block.
- Manual QA block (`### TASK-168` in `docs/manual-qa-pending.md`) for the live end-to-end flow,
  which cannot be exercised without real Google credentials.

### Out of Scope

- Apple sign-in (owner decision 1).
- Any change to the JWT payload shape (`{ sub, role }` unchanged) — OAuth users get tokens through
  the exact same `generateTokenPair()` every other login path uses.
- A popup/`postMessage`-based OAuth flow for the auth slide-out (`AuthSheet`). The redirect-based
  flow is a full top-level navigation; in slide-out mode the whole page navigates away to Google
  and back, landing on the `redirect` target already authenticated (the sheet itself doesn't stay
  open through the round trip — see §Technical Design → "Sheet-mode UX tradeoff").
- Admin-panel Google sign-in (`store-admin` has no social buttons today; this plan does not add
  any — the storefront's `AuthController.login`/`register` are already shared by both frontends at
  the API level, and Google OAuth is no different in that respect; see §Risks).
- An admin-UI affordance showing "this user signed in via Google" — `OAuthAccount` rows exist and
  are queryable, but no admin screen surfaces them in this plan.
- Account **unlinking** (disconnect Google from a User) — no UI/endpoint for it; out of scope
  until a real user asks for it.
- Retrying a race between two concurrent first-time Google logins for the same brand-new address
  (extremely low probability — mitigated structurally by the DB unique constraint, not explicitly
  handled in application code; see §Risks).

## User Stories

1. As a **customer**, I want to sign in with my Google account instead of creating a password, so
   I can check out faster on a device where I'm already signed into Google.
2. As a **returning customer** who registered with email+password, I want signing in with Google
   using the same email to log me into my existing account (with its order history, cart, etc.)
   instead of creating a duplicate account.
3. As the **store owner**, I want a banned/soft-deleted customer who tries to sign in with Google
   to get the same generic "can't sign in" experience as a banned customer using a password — no
   channel should leak account state to a prober, and I (the owner) should still get the same
   TASK-287 email notice if it really is the account owner trying.
4. As a **developer** running this app locally without Google credentials, I want the app to boot
   normally and the Google button's endpoint to fail gracefully (503), not crash the server.

## Technical Design

### Data Model

Per the orchestration convention (plan 152 §checklist item 8): new models are appended to the end
of `schema.prisma`. The only deviations — required by Prisma relations and by the "Google-only
users have no password" requirement, not a stylistic choice — are two single-line/single-token
edits inside the **existing** `User` model body (`schema.prisma:86-115`), called out explicitly:

```prisma
// Inside `model User { ... }` (schema.prisma:89) — was `String`, now nullable:
// a Google-only account has genuinely no password, so storing a fake/random
// hash would be dishonest at-rest credential material. login() gains a guard
// for this (§Technical Design → "login() regression guard").
passwordHash  String?   @map("password_hash")

// Inside `model User { ... }`, alongside the other relation arrays (schema.prisma:111):
oauthAccounts OAuthAccount[]
```

```prisma
// ── New — appended to the END of schema.prisma ────────────────────────────

/// External OAuth identity providers this store accepts (TASK-168). Google
/// only — Apple stays a client-only stub (owner decision 2026-07-11).
enum OAuthProvider {
  GOOGLE
}

/// Links a `User` to an external OAuth identity. One row per (provider,
/// providerId) pair, created either at first-time signup (brand-new email) or
/// at first-time linking (an existing password-based account signs in with
/// Google using the same verified email — see
/// {@link AuthService.loginWithGoogleProfile}). `providerId` is the
/// provider's stable subject id (Google's `profile.id` — the OIDC `sub`
/// claim), NEVER the email: a Google account's email can change, its `sub`
/// cannot. `email` is a link-time snapshot for admin/diagnostic reads only —
/// `User.email` (kept in sync separately, unaffected by this model) remains
/// the single source of truth for the account's contact address.
model OAuthAccount {
  id         String        @id @default(uuid())
  provider   OAuthProvider
  providerId String        @map("provider_id")
  userId     String        @map("user_id")
  user       User          @relation(fields: [userId], references: [id], onDelete: Cascade)
  email      String
  createdAt  DateTime      @default(now()) @map("created_at")

  @@unique([provider, providerId])
  @@index([userId])
  @@map("oauth_accounts")
}
```

**Migration mechanics** (per the `prisma-migration` skill / memory note `migrations-gitignored`):
migration SQL is gitignored — `schema.prisma` is the source of truth. Apply with
`npx prisma db push` on both the dev DB and `store_test`. In the isolated worktree, `npx prisma
generate` only (no live DB) is enough to unblock typecheck/unit tests — `db push` against real
Postgres instances happens on `develop` after merge (orchestrator's Фаза 3 step 4).

### API Contract

| Method | Path                        | Auth          | Response                                                                                                                                                          |
| ------ | --------------------------- | ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/api/auth/google`          | none (public) | **302** to Google's consent screen; **503** if `GOOGLE_CLIENT_ID`/`_SECRET` unset                                                                                 |
| GET    | `/api/auth/google/callback` | none (public) | **302** to `STORE_CLIENT_URL<redirect>` on success (refresh cookie set); **302** to `STORE_CLIENT_URL/login?oauthError=1` on any failure; **503** if unconfigured |

Both routes are marked `@ApiExcludeEndpoint()` — they are pure browser-navigation redirects, never
called via `fetch`/`axios`/Orval (the frontend does a plain `window.location.href = ...`
navigation, which is not the "manual fetch/axios" AGENTS.md's Orval-only rule is aimed at — that
rule governs JS-initiated API calls, not link navigations). Excluding them keeps Orval from
generating a misleading typed hook for a redirect-only, non-JSON endpoint; no Swagger tag/contract
change otherwise. `npm run swagger:export` / `npm run generate:api` are still run once as a
sanity check (§Migration Steps) — they should produce **zero** diff in the generated trees.

### Backend (NestJS — Clean Architecture)

All new files live under the existing `apps/store-api/src/auth/` module (no new top-level module —
this mirrors how `login`/`register`/password-reset are already colocated in `AuthController`/
`AuthService`, not split into a separate module per auth flow).

#### `AuthRepository` additions (`auth.repository.ts`)

```ts
export interface CreateOAuthUserInput {
  email: string;
  firstName?: string;
  lastName?: string;
  provider: OAuthProvider;
  providerId: string;
}

/** Look up an existing link by (provider, providerId) — the fast path for a
 *  returning Google user, checked BEFORE any email-based lookup. */
findOAuthAccount(
  provider: OAuthProvider,
  providerId: string,
): Promise<(OAuthAccount & { user: User }) | null>;

/** Link a Google identity to an ALREADY-RESOLVED, already-lock-checked User
 *  (the caller — AuthService — is responsible for the lock check; see
 *  §"Locked-account resolution" for why linking must never happen before it). */
linkOAuthAccount(
  userId: string,
  provider: OAuthProvider,
  providerId: string,
  email: string,
): Promise<OAuthAccount>;

/** Brand-new signup via Google: no matching User by providerId OR email
 *  exists yet. Creates the User (passwordHash: null) and its OAuthAccount
 *  link atomically in one transaction — mirrors register()'s single-write
 *  simplicity where possible, but two tables must succeed together here. */
async createUserFromOAuth(
  input: CreateOAuthUserInput,
): Promise<{ user: User; oauthAccount: OAuthAccount }>;
```

`findOAuthAccount` reads via Prisma's compound-unique `where` clause generated from
`@@unique([provider, providerId])` (verify the exact generated key name — `provider_providerId` by
Prisma's default naming — against the actual client after `npx prisma generate`).
`createUserFromOAuth` wraps both writes in `this.prisma.$transaction(async (tx) => { ... })`.

#### `sanitizeRedirectTarget` — pure util, own file (TDD)

`apps/store-api/src/auth/oauth/sanitize-redirect-target.ts`. Server-side mirror of the
same-origin check `login-form.tsx` already does client-side (`redirectParam.startsWith("/")`),
slightly hardened since this value survives a round trip through Google and gets echoed back into
an HTTP redirect `Location` header (open-redirect surface if wrong):

```ts
/** Accepts only a same-origin relative path: must start with a single `/`,
 * never `//` (protocol-relative) or `/\` (browsers treat as protocol-relative
 * too), and contains no CR/LF (header-injection guard). Anything else — or
 * absent — falls back to `/`. */
export function sanitizeRedirectTarget(raw: string | undefined): string;
```

Called twice: once in `GoogleOAuthStateStore.store()` (leg 1, reading `req.query.redirect`) before
it's embedded in the signed state, and once more at the callback before it's used to build the
final success `Location` (defense in depth — the state is server-signed so this second check is
mostly redundant, but cheap and it means a future bug in the signing step can't reintroduce an
open redirect).

#### CSRF / `state` design — `GoogleOAuthStateStore`

No `express-session` is installed in this app (stateless-JWT architecture throughout). Google's
OAuth 2.0 `state` parameter is this codebase's per-request CSRF token for the OAuth flow (RFC 6749
§10.12) — `passport-oauth2`'s default `state: true` behavior needs `req.session` (its bundled
`SessionStore.store(req, callback)`/`verify(req, providedState, callback)` read/write
`req.session[key].state` — confirmed against the library's actual `lib/state/session.js` source),
which this app doesn't have. Rather than adding `express-session` for one flow, this plan supplies
a **custom, self-contained `Store`** conforming to `passport-oauth2`'s documented `{ store(req,
callback), verify(req, providedState, callback) }` interface, backed by a short-lived **signed JWT**
instead of session storage:

```ts
// apps/store-api/src/auth/oauth/google-oauth-state.store.ts
@Injectable()
export class GoogleOAuthStateStore {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  // Leg 1 (GET /auth/google): mint the state value Google will echo back
  // verbatim in the callback's `?state=`. Signed with the existing JWT_SECRET
  // (already required, ≥32 chars — reusing it avoids minting a brand-new
  // secret for a low-value, 10-minute-TTL, narrowly-shaped token; the payload
  // shape `{ nonce, redirect }` never collides with an access/refresh token's
  // `{ sub, role }` shape, so even a hypothetical cross-use attempt fails
  // every downstream guard's field checks harmlessly).
  store(
    req: Request,
    callback: (err: Error | null, state?: string) => void,
  ): void {
    const redirect = sanitizeRedirectTarget(
      req.query.redirect as string | undefined,
    );
    const nonce = randomBytes(16).toString("hex");
    const state = this.jwtService.sign(
      { nonce, redirect },
      {
        secret: this.configService.getOrThrow<string>("JWT_SECRET"),
        expiresIn: "10m",
      },
    );
    callback(null, state);
  }

  // Leg 2 (GET /auth/google/callback): verify Google's echoed `state` is a
  // signature-valid, unexpired token WE minted. On success, stash the decoded
  // redirect target on `req` (same "stash on req for the Strategy to read"
  // pattern JwtRefreshStrategy already uses for `req._refreshToken`) — the
  // Store interface's callback shape (`err, ok, info`) has no channel back to
  // GoogleStrategy.validate() otherwise.
  verify(
    req: Request,
    providedState: string,
    callback: (
      err: Error | null,
      ok?: boolean,
      info?: { message: string },
    ) => void,
  ): void {
    try {
      const decoded = this.jwtService.verify<{
        nonce: string;
        redirect: string;
      }>(providedState, {
        secret: this.configService.getOrThrow<string>("JWT_SECRET"),
      });
      req.oauthRedirect = sanitizeRedirectTarget(decoded.redirect);
      callback(null, true);
    } catch {
      callback(null, false, { message: "Invalid or expired OAuth state" });
    }
  }
}

declare module "express" {
  interface Request {
    oauthRedirect?: string;
  }
}
```

Passed to the strategy via the `store` option (not `state: true`) — see `GoogleStrategy` below.

#### `GoogleStrategy` (`apps/store-api/src/auth/strategies/google.strategy.ts`)

Mirrors `JwtAccessStrategy`/`JwtRefreshStrategy`'s existing shape (constructor reads config,
`validate()` normalizes the payload). **Must be constructible even when Google credentials are
absent** — `passport-oauth2`'s constructor throws synchronously if `clientID`/`clientSecret`/
`callbackURL` are falsy, and Nest eagerly instantiates every provider at module init, so an
unconditional real-or-nothing construction would crash `AppModule` bootstrap (breaking **every**
e2e test — `test/auth.e2e-spec.ts` boots the full `AppModule` — and local `npm run start:dev`
without `.env` Google keys). Fix: fall back to inert placeholder strings when unset; the route-level
`GoogleAuthGuard` (below) is what actually gates real use, independent of whether the strategy
object exists:

```ts
@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, "google") {
  constructor(
    configService: ConfigService,
    stateStore: GoogleOAuthStateStore, // constructor param, not `this.x` — available pre-`super()`
  ) {
    super({
      clientID:
        configService.get<string>("GOOGLE_CLIENT_ID") || "not-configured",
      clientSecret:
        configService.get<string>("GOOGLE_CLIENT_SECRET") || "not-configured",
      callbackURL:
        configService.get<string>("GOOGLE_CALLBACK_URL") ||
        "http://localhost:3001/api/auth/google/callback",
      scope: ["email", "profile"],
      store: stateStore, // custom state store — see above; NOT `state: true`
      passReqToCallback: true,
    });
  }

  validate(
    req: Request,
    _accessToken: string,
    _refreshToken: string,
    profile: Profile, // from `passport-google-oauth20`'s types — verify exact shape at
    // implementation time (§Testing strategy note below)
    done: (err: Error | null, user?: GoogleOAuthProfile | false) => void,
  ): void {
    const primaryEmail = profile.emails?.[0];
    const normalized: GoogleOAuthProfile = {
      providerId: profile.id,
      email: primaryEmail?.value ?? null,
      // Google's userinfo/profile shape marks verification per-email; some
      // library versions surface it as `emails[0].verified` (string|boolean),
      // others only via the raw `profile._json.email_verified` boolean.
      // Check both — confirm the installed version's actual shape during
      // implementation (this thin adapter is intentionally NOT covered by the
      // TDD suite below; §Testing strategy explains why).
      emailVerified:
        primaryEmail?.verified === true ||
        primaryEmail?.verified === "true" ||
        (profile as unknown as { _json?: { email_verified?: boolean } })._json
          ?.email_verified === true,
      firstName: profile.name?.givenName,
      lastName: profile.name?.familyName,
      redirect: req.oauthRedirect ?? "/",
    };
    done(null, normalized);
  }
}
```

`GoogleOAuthProfile` (the clean, internal, library-agnostic shape) is defined once and imported by
both the strategy and `AuthService` — this is the seam that lets `AuthService.loginWithGoogleProfile`
be unit-tested with a **plain object literal**, entirely decoupled from `passport-google-oauth20`'s
actual `Profile` type or any Passport/Express machinery (§Testing strategy).

#### `GoogleAuthGuard` (`apps/store-api/src/auth/guards/google-auth.guard.ts`)

```ts
function isGoogleOAuthConfigured(config: ConfigService): boolean {
  return (
    Boolean(config.get<string>("GOOGLE_CLIENT_ID")) &&
    Boolean(config.get<string>("GOOGLE_CLIENT_SECRET"))
  );
}

@Injectable()
export class GoogleAuthGuard extends AuthGuard("google") {
  constructor(private readonly configService: ConfigService) {
    super();
  }

  canActivate(context: ExecutionContext): Promise<boolean> | boolean {
    if (!isGoogleOAuthConfigured(this.configService)) {
      throw new ServiceUnavailableException("Google sign-in is not configured");
    }
    return super.canActivate(context) as Promise<boolean> | boolean;
  }

  // Never throws on a failed/denied Google auth (user clicked "Cancel", state
  // mismatch, etc.) — instead of NestJS rendering a bare JSON 401 mid
  // top-level browser navigation, `request.user` is simply left undefined and
  // the callback HANDLER (not the guard) decides how to redirect. Overriding
  // this is the standard Nest technique for turning an AuthGuard failure into
  // application-controlled behavior instead of the default thrown exception.
  handleRequest<TUser = GoogleOAuthProfile | undefined>(
    _err: unknown,
    user: TUser,
  ): TUser {
    return user;
  }
}
```

Applied to **both** routes (`@UseGuards(GoogleAuthGuard)`) — the config-presence 503 check gates
both legs identically.

#### `AuthService.loginWithGoogleProfile()` (TDD — the heart of this plan)

```ts
export interface GoogleOAuthProfile {
  providerId: string;
  email: string | null;
  emailVerified: boolean;
  firstName?: string;
  lastName?: string;
  redirect: string;
}

/** Checked FIRST, before any AuthRepository call — so an unverified/absent
 * Google email can never leak anything about whether a matching store
 * account exists (the DB is never even queried on this branch). This is a
 * fact about the caller's GOOGLE account, not ours, so — unlike every other
 * rejection in this file — it is safe to give a distinct, actionable message
 * instead of the generic INVALID_CREDENTIALS_MESSAGE. */
const GOOGLE_EMAIL_UNVERIFIED_MESSAGE = "Google account's email is not verified";

async loginWithGoogleProfile(profile: GoogleOAuthProfile): Promise<AuthTokens> {
  if (!profile.email || !profile.emailVerified) {
    throw new UnauthorizedException(GOOGLE_EMAIL_UNVERIFIED_MESSAGE);
  }

  const existingLink = await this.authRepository.findOAuthAccount(
    OAuthProvider.GOOGLE,
    profile.providerId,
  );

  let user: User;
  let needsLink = false;

  if (existingLink) {
    user = existingLink.user;
  } else {
    const matchedUser = await this.authRepository.findByEmail(profile.email);
    if (!matchedUser) {
      // Brand-new signup — Google doubles as registration. No lock check
      // needed (a row that doesn't exist yet can't be locked).
      const created = await this.authRepository.createUserFromOAuth({
        email: profile.email,
        firstName: profile.firstName,
        lastName: profile.lastName,
        provider: OAuthProvider.GOOGLE,
        providerId: profile.providerId,
      });
      this.logger.info(
        { event: 'user.registeredViaGoogle', userId: created.user.id },
        'User registered via Google',
      );
      return this.generateTokenPair(created.user.id, created.user.role);
    }
    user = matchedUser;
    needsLink = true; // only actually link AFTER the lock check below
  }

  const isLocked = !user.isActive || Boolean(user.deletedAt);

  // Mirrors login()'s TASK-274/287 shape exactly: same notify mechanism, same
  // generic message, same "reject before any state-revealing side effect"
  // ordering. Critically, `needsLink` is NEVER honored on this branch — an
  // OAuth login must not become a side channel that silently reactivates a
  // banned/tombstoned account's ability to sign in.
  if (isLocked) {
    await this.notifyLockedAccountOwner(user.id, user.email);
    throw new UnauthorizedException(INVALID_CREDENTIALS_MESSAGE);
  }

  if (needsLink) {
    await this.authRepository.linkOAuthAccount(
      user.id,
      OAuthProvider.GOOGLE,
      profile.providerId,
      profile.email,
    );
    this.logger.info(
      { event: 'user.googleAccountLinked', userId: user.id },
      'Google account linked to existing user',
    );
  }

  return this.generateTokenPair(user.id, user.role);
}
```

#### `login()` regression guard (TDD — required, edits existing critical-path logic)

`login()` currently calls `argon2.verify(user.passwordHash, password)` unconditionally
(`auth.service.ts:124`). Once `passwordHash` can be `null` (a Google-only user), an unmodified
`login()` would `throw` a raw `TypeError` from inside `argon2.verify` instead of the generic 401 —
a crash, and worse, a **distinguishable** failure mode from every other rejection (violates the
same TASK-274 policy this whole plan is built around). Fix: treat `passwordHash === null` exactly
like the existing "no such user" branch — burn the same fixed timing cost, throw the same generic
message, never call `argon2.verify`:

```ts
async login(email: string, password: string): Promise<AuthTokens> {
  const user = await this.authRepository.findByEmail(email);

  if (!user || !user.passwordHash) {
    await this.burnTimingCost();
    throw new UnauthorizedException(INVALID_CREDENTIALS_MESSAGE);
  }

  const isPasswordValid = await argon2.verify(user.passwordHash, password);
  // ...unchanged from here
}
```

### `AuthController` additions

Reuses the controller's **existing** private helpers unchanged: `setRefreshCookie`,
`mergeGuestCartIfPresent`, `mergeGuestWishlistIfPresent`. Both new routes use `@Res() response:
Response` **without** `passthrough: true` (a deliberate deviation from every other handler in this
file, which use `{ passthrough: true }` because they return a JSON body Nest still serializes —
these two routes are pure redirects and must fully own the response):

```ts
@Get('google')
@UseGuards(GoogleAuthGuard)
@ApiExcludeEndpoint()
googleAuth(): void {
  // Guard performs the redirect to Google as a side effect (passport-oauth2's
  // standard "no code param yet → res.redirect(authorizationURL)" behavior).
  // This handler body never runs for a well-formed request.
}

@Get('google/callback')
@UseGuards(GoogleAuthGuard)
@ApiExcludeEndpoint()
async googleAuthCallback(
  @CurrentUser() profile: GoogleOAuthProfile | undefined,
  @Req() request: Request,
  @Res() response: Response,
): Promise<void> {
  const storeClientUrl = this.configService.get<string>(
    'STORE_CLIENT_URL',
    'http://localhost:3000',
  );

  if (!profile) {
    // Google denied/cancelled, or GoogleAuthGuard's handleRequest saw no user
    // (bad/expired state, provider error). Fixed failure target — does NOT
    // try to honor the original `redirect`, keeping this path simple and
    // funneling every OAuth failure to one page that already has the
    // TASK-287 support-link escape hatch.
    response.redirect(302, `${storeClientUrl}/login?oauthError=1`);
    return;
  }

  try {
    const tokens = await this.authService.loginWithGoogleProfile(profile);

    this.setRefreshCookie(response, tokens.refreshToken);
    await this.mergeGuestCartIfPresent(request, response, tokens.accessToken);
    await this.mergeGuestWishlistIfPresent(request, response, tokens.accessToken);

    response.redirect(302, `${storeClientUrl}${profile.redirect}`);
  } catch {
    // Every AuthService rejection (unverified email, locked account) funnels
    // here too — same generic failure target as the `!profile` branch above.
    response.redirect(302, `${storeClientUrl}/login?oauthError=1`);
  }
}
```

`@CurrentUser()` (the existing decorator, `auth/decorators/`) reads `request.user`, which
`GoogleAuthGuard.handleRequest` set to whatever `GoogleStrategy.validate()`'s `done()` call
produced — `undefined` on any Passport-level failure, the normalized `GoogleOAuthProfile` object on
success. **No access token ever appears in a URL, query string, or redirect fragment** — the
success path relies entirely on the refresh cookie plus the existing bootstrap-refresh flow
(`AuthProvider`, `apps/store-client/src/entities/session/model/auth.context.tsx`) to mint the
access token client-side, the moment the redirected-to page mounts.

`AuthModule` gains `GoogleStrategy`, `GoogleOAuthStateStore`, and `GoogleAuthGuard` to its
`providers` array (no new `imports` — `CartModule`/`WishlistModule`/`JwtModule` are already there).

### Locked-account resolution — why the lock check happens where it does

The single most important invariant in `loginWithGoogleProfile` is **ordering**: the `isLocked`
check happens strictly AFTER resolving which `User` row applies (by providerId or by email) but
strictly BEFORE either (a) linking a new `OAuthAccount` row or (b) issuing tokens. This closes two
distinct failure modes a naïve implementation could introduce:

- **Silent reactivation.** If linking happened before the lock check, a Google login with a banned
  account's verified email would create a live `OAuthAccount` row for a user who should not be able
  to sign in at all — a side channel around the ban, invisible to anyone reviewing password-login
  logs. The `needsLink` flag defers the actual `linkOAuthAccount` write until after the lock check
  passes, so a locked account can never accumulate a working OAuth link.
- **Distinguishable failure.** By reusing the identical `INVALID_CREDENTIALS_MESSAGE` constant (not
  a new "OAuth login failed for account state X" string) and the identical `notifyLockedAccountOwner`
  call, a locked-account Google login is byte-for-byte indistinguishable, from the outside, from an
  unverified-Google-email rejection or a Google-side cancellation — all three funnel to the same
  `/login?oauthError=1` redirect with no reason code in the URL.

One nuance worth naming explicitly, not a blocker: unlike a guessed password, a Google login
requires the caller to have actually authenticated _through Google_ for that email — a materially
stronger identity proof than "supplied a matching password." The generic-refusal policy (owner
decision, FINAL) is still applied literally here rather than re-litigated, because (a) the owner's
instruction did not carve out an OAuth exception, and (b) it costs nothing beyond the
`notifyLockedAccountOwner` mailer already doing the actual disclosure to the one party who should
see it — the account owner, by email, exactly as TASK-287 already established.

### Sheet-mode UX tradeoff

`AuthSheet` (the header's "Кабінет" slide-out) normally keeps the user on the same page and calls
`onAuthenticated()` to close itself without navigating. A redirect-based OAuth flow cannot preserve
that: clicking "Google" inside the sheet does a full top-level navigation to Google and back. This
plan accepts that tradeoff rather than building a popup/`postMessage` flow (materially more complex:
COOP/COEP interactions, a second listener surface, cross-window messaging trust checks) for a
first Google-only iteration — the user lands back on the **same page** they started from (the
`redirect` target defaults to the current path, matching how `LoginForm`'s existing `redirectParam`
logic already resolves it — see §Frontend below) already authenticated, which is a good-enough
outcome even though the sheet itself doesn't "stay open."

### Testing strategy — mocked Google profile, no real credentials

No real Google OAuth credentials exist in this environment (owner-confirmed). Every test in this
plan that touches business logic operates on the internal `GoogleOAuthProfile` **plain object**
shape — never on a real `passport-google-oauth20` `Profile`, never on a live HTTP round trip to
Google. This is why `GoogleStrategy.validate()` is deliberately thin (§Backend above) and NOT part
of the TDD suite: it is the one place where the installed library's actual `Profile` shape matters,
and it has nothing to unit-test beyond "reads a few optional fields defensively," which is exercised
indirectly by keeping the adapter tiny. The live end-to-end flow (real Google consent screen, real
callback) is **not** exercisable here and is deferred to `docs/manual-qa-pending.md` (§Manual QA).

## TDD — Red → Green → Refactor

Per AGENTS.md §Testing Strategy and the `tdd` skill. Auth is a listed critical module — every case
below is written failing first, then made to pass, then refactored with all cases green throughout.

### `sanitizeRedirectTarget` (pure function, `apps/store-api/src/auth/oauth/sanitize-redirect-target.spec.ts`)

1. `/checkout` → `/checkout` (valid relative path, passes through unchanged).
2. `undefined` → `/` (missing param defaults safely).
3. `""` (empty string) → `/`.
4. `https://evil.com` → `/` (absolute URL rejected).
5. `//evil.com` → `/` (protocol-relative rejected).
6. `/\evil.com` → `/` (backslash-variant protocol-relative, a known browser-normalization gotcha,
   rejected).
7. A path containing `\r`/`\n` → `/` (header-injection guard).

### `AuthService.loginWithGoogleProfile` (`auth.service.spec.ts`, new `describe` block)

8. Unverified email (`emailVerified: false`) → throws `UnauthorizedException` with
   `GOOGLE_EMAIL_UNVERIFIED_MESSAGE`; `authRepository.findOAuthAccount`/`findByEmail` are **never
   called** (rejected before any DB access — pins the "can't leak our account state" ordering).
9. `email: null` (Google didn't grant the email scope) → same rejection/same assertion as case 8.
10. Verified email, existing `OAuthAccount` link, linked user active → `generateTokenPair` called
    with that user's id/role; `linkOAuthAccount` is **not** called (nothing new to link);
    `findByEmail` is **not** called (resolved via providerId first, cheaper path).
11. Verified email, existing link, linked user `isActive: false` → `notifyLockedAccountOwner`
    called once (assert via a spy on the already-tested private method, or by asserting
    `mailOutboxService.enqueueAccountLockedNotice` fires — mirror whatever assertion style
    `login()`'s existing TASK-287 tests already use); throws `UnauthorizedException` with the
    **same** `INVALID_CREDENTIALS_MESSAGE` `login()` uses; `generateTokenPair` never called.
12. Verified email, existing link, linked user `deletedAt` set (tombstoned) → same assertions as
    case 11.
13. Verified email, no existing link, `findByEmail` resolves an **active** user → `linkOAuthAccount`
    called exactly once with that user's id + the Google `providerId`; `generateTokenPair` called
    for that (pre-existing) user — **explicitly assert the user's existing `role` is preserved
    unchanged** (regression guard, see §Risks re: ADMIN-role emails).
14. Verified email, no existing link, `findByEmail` resolves a **locked** user (`isActive: false`
    OR `deletedAt` set) → `notifyLockedAccountOwner` called; `linkOAuthAccount` is **never called**
    (pins the "must not silently reactivate via a side channel" invariant — §Technical Design);
    throws the same generic message as case 11.
15. Verified email, no existing link, `findByEmail` resolves nothing → `createUserFromOAuth` called
    with the profile's email/firstName/lastName + `OAuthProvider.GOOGLE`/providerId;
    `generateTokenPair` called with the newly-created user's id/role; `notifyLockedAccountOwner`
    never called; `linkOAuthAccount` never called (the transaction inside `createUserFromOAuth`
    already created the link).

### `AuthService.login()` regression guard (extends the existing `describe('login', ...)` block)

16. An existing user is found but `passwordHash` is `null` (a Google-only account attempting a
    password login) → `burnTimingCost()` is called (assert `argon2.hash` called once, mirroring the
    existing "unknown email" case's assertion shape exactly); `argon2.verify` is **never** called;
    throws `UnauthorizedException` with `INVALID_CREDENTIALS_MESSAGE`. This is a **new** case added
    to the pre-existing `login()` suite, not a new file — all of `login()`'s existing cases (found
    active user, wrong password, deactivated, soft-deleted, unknown email) must remain green
    unmodified.

### `GoogleOAuthStateStore` (`google-oauth-state.store.spec.ts`)

17. `store()` — given a mocked `req` with `query.redirect = '/checkout'`, `callback` is invoked
    with `(null, <a string>)`; decoding that string (via `jwtService.verify` with the same test
    secret) yields `{ redirect: '/checkout', nonce: <a string> }`.
18. `store()` — given `req.query.redirect` absent → the decoded `redirect` is `/` (delegates to
    `sanitizeRedirectTarget`, case 2 above).
19. `verify()` — given a state string produced by `store()` in the same test, `callback` is invoked
    with `(null, true)` and `req.oauthRedirect` is set to the expected sanitized redirect.
20. `verify()` — given a garbage/tampered state string → `callback` is invoked with `(null, false,
{ message: expect.any(String) })`; `req.oauthRedirect` is left unset.
21. `verify()` — given an expired state (mock `jwtService.verify` to throw a
    `TokenExpiredError`-shaped error, or use a real 0-second `expiresIn` + a short `await` in the
    test) → same rejection shape as case 20.

### `GoogleAuthGuard` (`google-auth.guard.spec.ts`)

22. `canActivate` throws `ServiceUnavailableException` when `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`
    are both/either unset — asserted via a mocked `ConfigService`, **without** invoking the real
    Passport `AuthGuard('google').canActivate` at all (spy/mock `super.canActivate` or structure the
    test around a fully mocked `ConfigService` so this stays a pure unit test).
23. `handleRequest` returns whatever `user` it's given (including `undefined`) without throwing —
    pins the "never blocks the callback handler from deciding" contract §Backend relies on.

## Frontend (store-client)

### `login-form.tsx`

- The Google button's `onClick` changes from `() => toast(dict.auth.login.socialSoon)` to a
  navigation: `window.location.href = buildGoogleOAuthUrl(redirectTarget)`, where
  `redirectTarget` is the **same** value the component already computes for password-login
  post-submit navigation (`redirectParam.startsWith("/") ? redirectParam : "/"`, `login-form.tsx:63-64`)
  — one source of truth for "where does a successful sign-in send the user," shared between both
  auth methods.
- **The Apple button is untouched** — still `onClick={() => toast(dict.auth.login.socialSoon)}`,
  still the honest stub the owner explicitly kept (owner decision 1).
- New small helper (co-located in the same file, or a one-function `features/auth/lib/
google-oauth-url.ts` if the build agent prefers a separate file):
  ```ts
  function buildGoogleOAuthUrl(redirect: string): string {
    const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
    return `${apiBase}/api/auth/google?redirect=${encodeURIComponent(redirect)}`;
  }
  ```
  This is a plain `<button>` → `window.location.href` navigation, **not** a `fetch`/`axios` call —
  it does not need (and must not use) an Orval hook, consistent with §API Contract's
  `@ApiExcludeEndpoint()` decision above.
- New failure-path banner: `LoginForm` already calls `useSearchParams()` (for `redirect`). Add a
  read of `searchParams.get("oauthError")`; when present, render the same `role="alert"` error
  paragraph style already used for `errorMessage` (`login-form.tsx:200-204`), showing
  `dict.auth.oauth.error`. This is additive to the existing `errorMessage` logic (both can render;
  they never fire from the same submission), not a replacement of it.
- No change to `RegisterForm`, `ForgotPasswordForm`, `AuthSheet`, or any other file — the Google
  button lives only in `LoginForm` (the stub audit, plan 129, confirmed no other component
  references it).

### Dictionary (`apps/store-client/src/shared/config/dictionary.ts`)

Per the orchestration checklist (plan 152 §7): new keys go at the **end** of the `auth` namespace
block this task owns. Appended as a new sibling key after the existing `sheet: {...}` block
(`dictionary.ts:1320-1324`), immediately before the `auth` block's closing `},`:

```ts
// Google OAuth sign-in (TASK-168). Apple stays a stub (owner decision
// 2026-07-11) — no new keys for it; `socialSoon` (already defined above,
// under `login`) is untouched and still used verbatim for the Apple button.
oauth: {
  error:
    "Не вдалося увійти через Google. Спробуйте ще раз або скористайтеся email і паролем.",
},
```

No `store-admin` dictionary changes — this plan touches `store-client` only.

## `.env.example` + env validation

`apps/store-api/.env.example` — new section, mirrors the existing Nova Poshta
("app boots without it, endpoint 503s") framing:

```bash
# ─── Google OAuth sign-in (TASK-168) ──────────────────────────────────────────
# Both optional. Leave empty to disable Google sign-in entirely — the app boots
# normally and GET /api/auth/google (+ /callback) respond 503, mirroring the
# NP_API_KEY pattern above. Get credentials from Google Cloud Console →
# APIs & Services → Credentials → "OAuth client ID" (Web application). The
# "Authorized redirect URI" configured there must be EXACTLY GOOGLE_CALLBACK_URL.
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_CALLBACK_URL=http://localhost:3001/api/auth/google/callback
```

`apps/store-api/src/config/env.validation.ts` — three new `@IsOptional() @IsString()` fields
(`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL`), grouped under a new comment
section mirroring the file's existing per-feature grouping style (e.g. the Meilisearch/Nova Poshta
sections). No `@MinLength` — unlike `JWT_SECRET`/`CSRF_SECRET` these are not signing secrets whose
weak length would be a security issue; Google itself enforces client-secret format.

## Package dependencies

- **Runtime:** `passport-google-oauth20` (chosen over `openid-client` and a hand-rolled code-flow
  implementation — see §Library choice below).
- **Dev:** `@types/passport-google-oauth20`, mirroring the existing `@types/passport-jwt` devDep.

### Library choice: `passport-google-oauth20`

- **vs. hand-rolled OAuth2 code flow:** this app already has a working `@nestjs/passport` +
  `PassportStrategy` pattern (`JwtAccessStrategy`, `JwtRefreshStrategy`) with an established guard
  convention (`JwtAuthGuard`, `JwtRefreshGuard`). Hand-rolling the authorization-URL construction,
  token exchange, and userinfo fetch would duplicate ~150 lines of well-trodden OAuth2 mechanics
  this codebase gets for free from a library, for no security or flexibility benefit.
- **vs. `openid-client`:** `openid-client` is the more modern, actively-maintained, spec-correct
  choice for pure OIDC (it does discovery, PKCE, ID-token verification natively) — a legitimate
  alternative in a greenfield app. It does **not**, however, ship a `PassportStrategy` adapter with
  the same shape as this codebase's existing two strategies; wiring it in means either (a) writing
  a custom Nest guard/middleware from scratch that doesn't reuse `@UseGuards(AuthGuard(...))` at
  all, or (b) using its own separate community Passport shim, adding a second, less-established
  integration pattern alongside the first. `passport-google-oauth20` (built on `passport-oauth2`,
  the same base library class as `passport-jwt`'s ecosystem) slots into the _exact_ existing
  `PassportStrategy`/`AuthGuard` convention with zero new architectural shape — same strategy
  registration style, same guard style, same `validate()`-returns-`request.user` contract. Given
  this plan only ever talks to ONE provider (Google) and needs no OIDC discovery/multi-provider
  federation, the narrower, house-style-matching library is the better fit. `openid-client`
  remains the natural upgrade path if Apple (a real OIDC provider) or a third provider is ever
  added later.
- **Known tradeoff, accepted:** `passport-google-oauth20` is a thin, long-stable wrapper (Google's
  OAuth2/userinfo endpoints have not broken it) but is not under active feature development. This
  plan takes zero dependency on any of its unmaintained edges beyond the basic authorization-code
  exchange + userinfo profile fetch, which has been stable for years.

## Migration Steps

1. Schema: `OAuthAccount` model + `OAuthProvider` enum appended to the end of `schema.prisma`;
   `User.passwordHash` → nullable; `User.oauthAccounts` back-relation added. `npx prisma generate`
   (dummy `DATABASE_URL` in the worktree is fine — no live DB needed for `generate`).
2. `AuthRepository` additions (`findOAuthAccount`, `linkOAuthAccount`, `createUserFromOAuth`) +
   repository unit tests.
3. `sanitizeRedirectTarget` — TDD (cases 1-7).
4. `AuthService.loginWithGoogleProfile` + `login()` regression guard — TDD (cases 8-16). This is
   the load-bearing core; land it before any Passport/HTTP wiring consumes it.
5. `GoogleOAuthStateStore` — TDD (cases 17-21).
6. `GoogleStrategy` + `GoogleAuthGuard` — TDD where practical (guard cases 22-23); strategy
   `validate()` itself is a thin, deliberately untested adapter (§Testing strategy).
7. `AuthController` routes + `AuthModule` provider registration. Controller-level test(s) asserting
   the redirect `Location` header for: success (mocked `AuthService.loginWithGoogleProfile`
   resolving), locked-account/unverified-email rejection (mocked rejection), and no-profile
   (Google-side denial) — all three landing on the expected URL.
8. `.env.example` + `env.validation.ts` — three new optional vars.
9. `npm run swagger:export -w apps/store-api` + `npm run generate:api` — sanity check only; expect
   **zero** diff in the generated trees (`@ApiExcludeEndpoint()` on both new routes).
10. `store-client`: `login-form.tsx` Google button + `oauthError` banner + `dict.auth.oauth.*` +
    RTL test updates (existing `login-form.test.tsx` — the Google button's onClick assertion
    changes from "shows the stub toast" to "navigates to the expected URL"; a new case for the
    `oauthError` banner).
11. In-worktree gates (per plan 152 §checklist items 4-6): `npm run typecheck` / `npm run lint` /
    `npm run build` for `apps/store-api` and `apps/store-client`; `npm run test -w apps/store-api --
auth google-auth google-oauth-state sanitize-redirect-target` and
    `npm run test -w apps/store-client -- login-form`; full-suite confirmation via `--runInBand` if
    a parallel run shows red (memory notes `store-api-e2e-serial` /
    `store-client-jest-parallel-flake` — though this task adds no e2e/int coverage in-worktree).
12. Post-merge on `develop` (orchestrator, Фаза 3): `npx prisma db push` on the dev DB **and**
    `store_test`; add Google OAuth cases to the existing `test/auth.e2e-spec.ts` (mocked
    `AuthRepository`/`PrismaService`, same pattern the file already uses — success redirect,
    locked-account redirect, no-profile redirect, 503-when-unconfigured); full gate suite.
13. Manual QA block appended to `docs/manual-qa-pending.md` (§Manual QA below) — the live flow
    needs real Google credentials the owner must configure.

## Risks & Mitigations

| Risk                                                                                                                                                                                                                                                  | Mitigation                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `passport-oauth2`'s constructor throws synchronously without real `clientID`/`clientSecret`/`callbackURL`, which would crash `AppModule` bootstrap (breaking every e2e test and local dev without `.env` Google keys)                                 | `GoogleStrategy` always constructs with inert placeholder fallback strings; real gating happens at the route level via `GoogleAuthGuard`'s config-presence check (§Backend) — verified structurally by `test/auth.e2e-spec.ts` continuing to boot the full `AppModule` with zero Google env vars set (existing e2e infra already has none)                                                                                                                                                                                                                          |
| An existing **ADMIN**-role user's email matches their personal Google account; signing into the storefront via Google would issue them an ADMIN-role JWT, same as it would if they used their admin email+password on the storefront's own login form | Not a new vulnerability introduced by this plan — `AuthController.login()` already issues ADMIN-role tokens through the _same_ storefront-facing endpoint for any correct admin email+password; this plan's `loginWithGoogleProfile` reuses the identical `generateTokenPair(user.id, user.role)` call. Explicitly regression-guarded by TDD case 13 (role preserved, not silently downgraded) rather than "fixed," since downgrading it would be a _behavior change_ outside this plan's brief                                                                     |
| A race between two concurrent first-time Google logins for the same brand-new email could both pass the `findByEmail` "no match" check before either finishes `createUserFromOAuth`                                                                   | Structurally bounded by the DB `@@unique([provider, providerId])` constraint (can't create two `OAuthAccount` rows for the same providerId) and `User.email @unique` (can't create two `User` rows for the same email) — the loser of the race gets a Prisma unique-violation error surfaced as a generic 500/failure redirect, not silent data corruption. Not explicitly handled with a retry-and-recover branch in application code (extremely low real-world probability, same "accepted, not blocking" judgment call plan 150 made for its own analogous race) |
| The exact runtime shape of `passport-google-oauth20`'s `Profile.emails[].verified` (or its location on `_json.email_verified`) may differ from what's sketched in `GoogleStrategy.validate()` above                                                   | Isolated to the one deliberately-thin, deliberately-untested adapter function (§Testing strategy) — the TDD-covered business logic (`loginWithGoogleProfile`) only ever sees the already-normalized `GoogleOAuthProfile` shape and is unaffected either way; the implementer verifies the exact library shape against its installed version's type definitions (or via context7/library docs) at implementation time                                                                                                                                                |
| `passport-google-oauth20` is not under active feature development                                                                                                                                                                                     | Accepted (§Library choice) — the surface this plan depends on (authorization-code exchange + userinfo profile fetch) has been stable for years; `openid-client` remains the documented upgrade path if a second/third OIDC provider is added later                                                                                                                                                                                                                                                                                                                  |
| Sheet-mode (`AuthSheet`) users experience a full-page navigation instead of the in-place close-on-success UX every other auth method in that component has                                                                                            | Accepted UX tradeoff (§Technical Design → "Sheet-mode UX tradeoff") — no popup/`postMessage` flow is built for this first Google-only iteration; the user still lands back on the same page, authenticated                                                                                                                                                                                                                                                                                                                                                          |
| The live end-to-end OAuth flow (real Google consent screen) cannot be exercised anywhere in this plan's automated test suite                                                                                                                          | Deferred to `docs/manual-qa-pending.md` (§Manual QA) — the owner must configure real `GOOGLE_CLIENT_ID`/`_SECRET`/`_CALLBACK_URL` and click through the flow once credentials exist                                                                                                                                                                                                                                                                                                                                                                                 |

## Manual QA

Append a `### TASK-168` block to `docs/manual-qa-pending.md` (append-only, at the end of the file)
covering, once real Google credentials are configured on a running stack:

- `GET /api/auth/google` (unconfigured) responds 503; the app still boots and every other auth
  flow works normally.
- With real credentials configured: clicking "Google" on `/login` redirects to Google's consent
  screen; approving it redirects back and lands the browser on `/` (or wherever `?redirect=` was
  set), already signed in — verify via the header showing the authenticated state, no visible
  token in the URL bar at any point.
- A brand-new Google email creates a new account (verify a fresh row appears in `/users` in
  store-admin).
- Signing in with Google using an email that matches an **existing password-based** account logs
  into that same account (same order history/cart) and does not create a duplicate.
- A second Google sign-in with the same Google account reuses the existing link (no duplicate
  `OAuthAccount` row — spot-check via `psql`/Prisma Studio).
- Deactivating a linked account (admin panel) and then retrying Google sign-in with that account
  fails generically (lands on `/login?oauthError=1`, same page/message as an unverified-email
  failure) — **and** the account owner receives the TASK-287 locked-account notice email (check the
  mail outbox / Ethereal inbox).
- Guest cart/wishlist items survive a Google sign-in the same way they survive a password
  login/register (add items as a guest, then sign in with Google, confirm the items are present).
- Clicking "Cancel"/denying consent on Google's screen redirects back to
  `/login?oauthError=1` with a generic error banner, not a raw JSON error page.

## Notes

- **No change to Apple's stub.** Grep-verified during planning: the Apple button in
  `login-form.tsx` is the only reference to `dict.auth.login.apple`/the Apple icon in the
  storefront — nothing else needs touching to keep it exactly as-is.
- **`store-admin` untouched.** No social buttons exist there today (plan 129's stub audit
  confirmed the social-login stub is storefront-only); this plan does not add any.
- **Why the callback funnels every failure to one fixed URL.** `/login?oauthError=1` was chosen
  over "redirect failures to the original target too" specifically to avoid growing the state
  payload/URL-construction logic for a rarely-hit path, and because a fixed, well-known failure
  destination (with the TASK-287 support link already on it) is arguably better UX than dumping the
  user back on an arbitrary page with no context for what to do next.
