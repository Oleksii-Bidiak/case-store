# Plan: Password Reset

> **Status:** ✅ Done (TASK-169 shipped; hardening follow-up TASK-273 ✅, plan 136)
> **Phase:** Roadmap Етап 6 (Wave 4 — pre-launch features), plan `docs/roadmap.md` Phase 1 Auth module extension
> **Created:** 2026-07-08
> **Last Updated:** 2026-07-08
> **Backlog:** TASK-169 `[C/H]` — critical auth module, **TDD required (Red → Green → Refactor)**

## Overview

Users who forget their password currently have no self-service recovery path — the
storefront's "Забули пароль?" link is a toast stub (`login-form.tsx:176-183`,
`dict.auth.login.forgotSoon`). This plan adds the full slice:

1. **`POST /api/auth/password-reset/request`** — accepts an email, silently enqueues a
   reset email via the existing mail-outbox if (and only if) an active account exists,
   but **always returns a generic 200** so the endpoint never reveals account existence.
2. **`POST /api/auth/password-reset/confirm`** — accepts a single-use opaque token +
   new password, verifies it, updates the password hash, and revokes every refresh
   token for that user (forces re-login on all devices/sessions).
3. Two new mail-outbox pieces: a `password-reset` outbox type + a pure
   `password-reset.template.ts` (mirrors `order-confirmation.template.ts`).
4. One new Prisma model, `PasswordResetToken`, mirroring `RefreshToken`'s
   hash-at-rest pattern.
5. Storefront forms: a "forgot password" (request) form reachable from the existing
   `AuthSheet` slide-out (replacing the toast stub) + a standalone `/reset-password`
   page (the emailed link's landing page) with the confirm form.

This is a **critical auth module** per `AGENTS.md` §Testing Strategy — the backend
service logic (token issuance, verification, single-use/expiry/revocation rules) must
be built Red → Green → Refactor.

## Scope

### In Scope

- Prisma schema: `PasswordResetToken` model + `User.passwordResetTokens` relation.
- `AuthRepository`: token persistence (hash-at-rest, lookup, mark-used) + password
  update.
- `AuthService`: `requestPasswordReset()` / `confirmPasswordReset()` business rules
  (existence-hiding, single-use, TTL, refresh-token revocation on success).
- `AuthController`: two new public endpoints, DTOs, Swagger docs, rate limiting.
- Mail: `password-reset` outbox type + pure email template + `MailService`/
  `MailOutboxService` wiring (no outbox schema change — the table is already generic).
- Storefront: request form wired into `AuthSheet` (replaces the toast stub) +
  standalone `/forgot-password` page (parity with `/login`, `/register`) +
  standalone `/reset-password` page (confirm form, reads `?token=`).
- Unit tests (TDD, red-first) for repository + service; e2e tests for the controller;
  RTL tests for the new forms.

### Out of Scope

- Admin-triggered password reset (admin "force reset" action) — not requested here.
- Rate-limiting the confirm endpoint beyond the global default `ThrottlerGuard` +
  one light explicit `@Throttle` (brute-forcing a 256-bit token is computationally
  infeasible; this is defense-in-depth, not the primary control).
- A dedicated cleanup cron for expired/used `PasswordResetToken` rows — the table
  stays small (one row per reset attempt); folding it into the existing
  `RefreshTokenCleanupService` cadence is a trivial follow-up, noted in Risks.
- Social sign-in (TASK-168, parked) and account "change password while logged in"
  (not part of this slice — that would be a separate authenticated endpoint).
- Swagger export, Orval regen, and `prisma migrate dev` — these run once on `develop`
  after merge per repo convention (see **Notes** below); this plan only edits
  `schema.prisma` and hand-written backend/frontend source.

## User Stories

1. As a customer who forgot their password, I want to request a reset link by email,
   so that I can regain access to my account without contacting support.
2. As a customer who received a reset email, I want to set a new password via a
   secure, single-use link, so that my account is recovered and old sessions are
   invalidated.
3. As a security-conscious platform, I want reset requests to never reveal whether an
   email is registered, so that the endpoint cannot be used to enumerate accounts.

## Technical Design

### Data Model

```prisma
model PasswordResetToken {
  id        String    @id @default(uuid())
  /// SHA-256 hash of the raw token (same at-rest pattern as RefreshToken —
  /// see auth.repository.ts hashToken()). The raw token only ever exists in
  /// the outgoing email link and the client's one-time confirm request.
  token     String    @unique
  userId    String    @map("user_id")
  user      User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  expiresAt DateTime  @map("expires_at")
  /// Null = unused. Set once, on successful confirm — makes the token single-use.
  usedAt    DateTime? @map("used_at")
  createdAt DateTime  @default(now()) @map("created_at")

  @@index([userId])
  @@index([expiresAt])
  @@map("password_reset_tokens")
}
```

Add to `User` (mirrors the existing `refreshTokens RefreshToken[]` line,
`schema.prisma:99`):

```prisma
passwordResetTokens PasswordResetToken[]
```

No change to `MailOutbox` (`schema.prisma:595-610`) — the `type` + `payload Json`
columns are already generic; a new `type` string is all a new mail kind needs
(`mail-outbox.types.ts:1-8` explicitly names password-reset as a future consumer).

**New env vars** (add to `apps/store-api/.env.example`, non-secret defaults):

| Var                               | Default                 | Purpose                                                                                                                                                          |
| --------------------------------- | ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PASSWORD_RESET_TOKEN_EXPIRATION` | `1h`                    | Parsed via the existing `parseExpirationToMs` (`auth.service.ts:178-200`)                                                                                        |
| `STORE_CLIENT_URL`                | `http://localhost:3000` | Base URL used to build the `/reset-password?token=…` link embedded in the email — no equivalent var exists today (checked `main.ts` CORS config, `.env.example`) |

### Backend (NestJS — Clean Architecture)

#### `AuthRepository` (new methods, alongside the existing refresh-token methods)

- `savePasswordResetToken(userId: string, rawToken: string, expiresAt: Date): Promise<PasswordResetToken>`
  — hashes via the existing private `hashToken()` (`auth.repository.ts:26-28`, reused
  as-is — same class, no duplication) and inserts a row.
- `findPasswordResetToken(rawToken: string): Promise<(PasswordResetToken & { user: User }) | null>`
  — hash-then-lookup, `include: { user: true }` (mirrors `findRefreshToken`,
  `auth.repository.ts:59-64`).
- `markPasswordResetTokenUsed(id: string): Promise<void>` — sets `usedAt = now()`.
- `invalidateActivePasswordResetTokens(userId: string): Promise<void>` — on a fresh
  request, mark any still-unused/unexpired prior tokens for that user as used (single
  active token per user at a time; prevents an old, unused link from silently working
  as your "current" reset months later, no schema change needed — reuses `usedAt`).
- `updatePasswordHash(userId: string, passwordHash: string): Promise<void>` — simple
  `user.update`.

#### `AuthService` (new methods)

- `async requestPasswordReset(email: string): Promise<void>`
  - Look up user by email (`authRepository.findByEmail`).
  - If no user, OR user is deactivated (`!isActive`), OR soft-deleted
    (`deletedAt` set) → **return silently** (no error, no email). The controller
    always responds 200 regardless — this method never throws for a "not found"
    case, so timing/response shape cannot leak existence.
  - Otherwise: invalidate prior active tokens for the user, generate a raw token
    (`randomBytes(32).toString('hex')` — opaque, not a JWT; simpler than the
    refresh-token JWT approach and appropriate since it's a one-shot emailed
    link, not a bearer credential parsed by a Passport strategy), persist it
    (hashed) with `expiresAt = now + parseExpirationToMs(PASSWORD_RESET_TOKEN_EXPIRATION)`,
    and call `mailOutboxService.enqueuePasswordReset({ to, resetUrl, ... })`.
  - Log the business event (`event: 'user.passwordResetRequested'`) — never log the
    raw token.
- `async confirmPasswordReset(rawToken: string, newPassword: string): Promise<void>`
  - `findPasswordResetToken(rawToken)` → if null, throw
    `UnauthorizedException('Invalid or expired reset token')`.
  - If `usedAt` is set → same generic error (do not distinguish "already used" from
    "not found" in the response — avoids leaking token validity structure).
  - If `expiresAt < now()` → same generic error.
  - If the owning user is deactivated/soft-deleted → same generic error (a banned
    account must not be able to reset its way back to a working password).
  - Otherwise: `argon2.hash(newPassword)` (reuse the existing import, `auth.service.ts:5,44`),
    `updatePasswordHash(userId, hash)`, `markPasswordResetTokenUsed(id)`, then
    `revokeAllUserTokens(userId)` (existing method, `auth.repository.ts:95-100` —
    reused verbatim so the reset also logs out every other session per the security
    requirement).
  - Log the business event (`event: 'user.passwordResetCompleted'`).

`IsStrongAppPassword()` (`is-strong-app-password.decorator.ts:39-45`) is reused as-is
on the confirm DTO's `newPassword` field — same policy as registration.

#### `AuthController` (new endpoints)

```
POST /api/auth/password-reset/request
  @Throttle({ default: { limit: 5, ttl: 60000 } })   // same budget as register/login
  Body: RequestPasswordResetDto { email: string }
  200 always: { data: { message: string } }           // generic, existence-hiding

POST /api/auth/password-reset/confirm
  @Throttle({ default: { limit: 10, ttl: 60000 } })   // lighter defense-in-depth throttle
  Body: ConfirmPasswordResetDto { token: string; newPassword: string }
  200: { data: { message: string } }
  401: invalid/expired/used token (generic message, no distinction)
  400: validation failure (weak password, missing fields)
```

Both are **public** — no `@UseGuards`. Confirmed against the current guard wiring:
the only `APP_GUARD` is `ThrottlerGuard` (`app.module.ts` — no global `JwtAuthGuard`),
so, like `register`/`login`, these two routes need no bypass decorator.

DTOs (new files, mirroring `register.dto.ts` conventions):

- `apps/store-api/src/auth/dto/request-password-reset.dto.ts`
  - `email: string` — `@IsEmail()`.
- `apps/store-api/src/auth/dto/confirm-password-reset.dto.ts`
  - `token: string` — `@IsString()`, `@IsNotEmpty()`.
  - `newPassword: string` — `@IsStrongAppPassword()` (imported from
    `../../common/validators`, same as `register.dto.ts:3`).

Response envelope matches the existing `MessageResponseEnvelope` pattern already
declared in `auth.controller.ts:47-49` — reuse it for both new endpoints (no new
envelope class needed).

### Mail (mail-outbox wiring)

- `mail-outbox.types.ts`: add `export const PASSWORD_RESET_MAIL_TYPE = 'password-reset';`
  alongside the existing `ORDER_CONFIRMATION_MAIL_TYPE` (`mail-outbox.types.ts:11`).
- New pure template `apps/store-api/src/mail/templates/password-reset.template.ts`
  (no NestJS/nodemailer imports, mirrors `order-confirmation.template.ts:1-8` style):
  - `PasswordResetMailPayload { to: string; resetUrl: string; expiresInHuman: string }`
    (JSON-safe — no `Date`, just the pre-built URL and a human string like "1 годину"
    for the email copy; avoids re-deriving TTL wording at render time).
  - `buildPasswordResetEmail(payload): MailTemplate` → `{ subject, html, text }`,
    UA copy ("Скидання пароля", a button/link to `resetUrl`, a note that the link
    expires and that the request can be ignored if not initiated by the user).
- `mail.service.ts`: add `sendPasswordResetPayload(payload: PasswordResetMailPayload): Promise<void>`
  sibling to `sendOrderConfirmationPayload` (`mail.service.ts:65-89`) — same
  "disabled → logged no-op, else render + transporter.sendMail" shape.
- `mail-outbox.service.ts`:
  - `enqueuePasswordReset(payload: PasswordResetMailPayload, tx?): Promise<void>` —
    sibling to `enqueueOrderConfirmation` (`mail-outbox.service.ts:60-73`), writes
    `type: PASSWORD_RESET_MAIL_TYPE`. **No `tx` is actually needed here** (unlike
    order creation, there is no wrapping transaction to join) but keep the optional
    param for signature symmetry / future-proofing.
  - `deliver()` switch (`mail-outbox.service.ts:154-164`): add a
    `case PASSWORD_RESET_MAIL_TYPE:` branch calling `mailService.sendPasswordResetPayload(...)`.
- `AuthModule` needs `MailOutboxService` injected into `AuthService` — no explicit
  import required since `MailOutboxModule` is `@Global()` (`mail-outbox.module.ts:17-27`,
  exports `MailOutboxService`) — same reason `OrderService` doesn't import it either.

### Frontend (Next.js — FSD, store-client)

Import direction check: `features/auth` → `entities/session` (generated hooks) →
`shared` (dict, ui, password-policy). No upward imports. Matches existing
`login-form.tsx` / `register-form.tsx`.

#### entities/session

- Re-export the two new Orval-generated hooks in
  `apps/store-client/src/entities/session/index.ts` (mirrors the existing block,
  `index.ts:6-11`): `useAuthControllerRequestPasswordReset`,
  `useAuthControllerConfirmPasswordReset`, plus the generated
  `RequestPasswordResetDto` / `ConfirmPasswordResetDto` model types. (Hook names are
  the Orval default `use{Controller}Controller{Method}` — confirmed against the
  existing `useAuthControllerLogin`/`useAuthControllerRegister` naming for `login`/
  `register`; our new service methods are named `requestPasswordReset` /
  `confirmPasswordReset` to match.) **This edit happens post-merge after Orval
  regen** — see Notes.

#### features/auth (new UI)

- `apps/store-client/src/features/auth/ui/forgot-password-form.tsx`
  - Zod: `{ email: z.string().email(...) }`.
  - Props mirror `LoginFormProps`: optional `onSubmitted?: () => void` (sheet mode:
    show an inline "check your email" success state instead of closing) and
    `onSwitchToLogin?: () => void`.
  - On submit: `useAuthControllerRequestPasswordReset`, **always** shows the generic
    success message on `onSuccess` (never branches on response content — the backend
    intentionally returns the same 200 for existing and non-existing emails; the UI
    must not undermine that by, e.g., showing a different message for a 404).
  - No `onAuthenticated` — this never logs the user in.
- `apps/store-client/src/features/auth/ui/reset-password-form.tsx`
  - Reads `token` via `useSearchParams()` (wrap the page in `<Suspense>`, same
    pattern as `login-form.tsx:57` / `auth-sheet.tsx:71`).
  - Zod: reuse `passwordSchema` from `@/shared/lib/password-policy` (direct import,
    not the barrel — same note as `register-form.tsx:14-16`) for `newPassword` +
    a `confirmPassword` field with a `.refine()` match check (mirrors
    `register-form.tsx:26-33`).
  - If `token` is missing from the URL, render an inline error state (no form) —
    do not silently submit an empty token.
  - On submit: `useAuthControllerConfirmPasswordReset({ token, newPassword })`.
    - `onSuccess`: success message + `router.push('/login')` (do **not** auto-login
      — sessions were just revoked server-side, and the user should re-authenticate
      with the new password to confirm it stuck).
    - `onError`: map 401 → `dict.auth.resetPassword.errorInvalidToken` ("Посилання
      недійсне або застаріло"), else generic error (same envelope-reading helper
      pattern as `login-form.tsx:26-30`).
  - Export both from `features/auth/index.ts` (`index.ts:1-4`).

#### widgets (AuthSheet change)

- `apps/store-client/src/features/auth/ui/auth-sheet.tsx`: extend `Tab` to
  `"login" | "register" | "forgot"`. Add a `"forgot"` branch to the tab-content
  switch rendering `<ForgotPasswordForm onSwitchToLogin={() => setTab("login")} />`.
  The header tab strip (`tabClass` buttons) stays login/register only — "forgot" is
  reached only via the in-form link, not a top-level tab (matches the mockup
  convention of "forgot password" being a link, not a tab).
- `apps/store-client/src/features/auth/ui/login-form.tsx`: replace the toast stub
  (lines 176-183) with a real navigation:
  - Sheet mode (`onSwitchToLogin`-style prop, new `onForgotPassword?: () => void`):
    calls `onForgotPassword()` to flip the sheet to the `"forgot"` view.
  - Page mode (no callback passed): renders a `<Link href="/forgot-password">`
    instead of a button (same pattern as the existing `registerLink`/`signInLink`
    `Link` vs. button branching at `login-form.tsx:226-238`).

#### app (pages)

- `apps/store-client/src/app/(auth)/forgot-password/page.tsx` — standalone wrapper,
  structurally identical to `app/(auth)/login/page.tsx` (metadata + centered card
  shell + `<ForgotPasswordForm />`, no sheet-mode props passed).
- `apps/store-client/src/app/(auth)/reset-password/page.tsx` — same shell,
  `<ResetPasswordForm />` (must be wrapped in `<Suspense>` per the `useSearchParams`
  rule already applied to `login`/`register` pages).

#### shared

- `dict.auth.forgotPassword` (new): `heading`, `email`, `submit`, `submitting`,
  `success` ("Якщо такий email зареєстровано, ми надіслали посилання для скидання
  пароля."), `backToLogin`.
- `dict.auth.resetPassword` (new): `heading`, `newPassword`, `confirmPassword`,
  `submit`, `submitting`, `success`, `errorInvalidToken`, `errorMissingToken`,
  `validationPasswordMatch` (can reuse `dict.auth.register.validationPasswordMatch`
  instead of duplicating).
- `dict.auth.login.forgot` / `forgotSoon` (`dictionary.ts:1206,1211`): drop
  `forgotSoon` (no longer a stub); `forgot` label stays ("Забули пароль?").
- No new `shared/ui` primitives needed — reuses the existing `fieldClass` input
  style + form layout conventions already inline in `login-form.tsx`/`register-form.tsx`.

### API Contract

| Method | Path                               | Request Body                                     | Response                                                                                |
| ------ | ---------------------------------- | ------------------------------------------------ | --------------------------------------------------------------------------------------- |
| POST   | `/api/auth/password-reset/request` | `RequestPasswordResetDto { email }`              | `200 { data: { message } }` (always, existence-hiding)                                  |
| POST   | `/api/auth/password-reset/confirm` | `ConfirmPasswordResetDto { token, newPassword }` | `200 { data: { message } }` / `401` invalid-or-expired-or-used token / `400` validation |

## TDD Test List (Red-first — write these failing before implementation)

Per `AGENTS.md` §Testing Strategy, this is a critical auth module: Red → Green →
Refactor, most granular at the repository/service layer.

### `auth.repository.spec.ts` (extend existing file)

1. `savePasswordResetToken` stores a **SHA-256 hash**, never the raw token (assert
   the mocked `prisma.passwordResetToken.create` call args do not contain the raw
   string).
2. `findPasswordResetToken('raw')` looks up by the hash of `'raw'`, includes `user`.
3. `findPasswordResetToken` returns `null` when the mocked lookup misses.
4. `markPasswordResetTokenUsed(id)` sets `usedAt` (assert `update` payload shape,
   not a literal `Date.now()` — accept "is a Date").
5. `invalidateActivePasswordResetTokens(userId)` only touches unused, unexpired rows
   for that user (assert the `where` clause: `userId`, `usedAt: null`, `expiresAt: { gt: <now> }` or equivalent — the exact predicate should mirror `revokeAllUserTokens`'s `updateMany` style, `auth.repository.ts:95-100`).
6. `updatePasswordHash(userId, hash)` updates the correct user by id with the hash.

### `auth.service.spec.ts` (extend existing file)

7. `requestPasswordReset('missing@x.com')` when `findByEmail` resolves `null` →
   resolves without throwing, and **never** calls `savePasswordResetToken` or
   `mailOutboxService.enqueuePasswordReset`.
8. `requestPasswordReset(email)` for a **deactivated** user (`isActive: false`) →
   same as (7): silent no-op, no token, no email (mirrors the login-blocked test
   style at `auth.service.spec.ts` existing deactivated-user cases).
9. `requestPasswordReset(email)` for a **soft-deleted** user (`deletedAt` set) →
   same silent no-op.
10. `requestPasswordReset(email)` for a valid active user → calls
    `invalidateActivePasswordResetTokens`, then `savePasswordResetToken` with an
    `expiresAt` computed from `PASSWORD_RESET_TOKEN_EXPIRATION` (assert via the
    config mock, same style as the existing `testConfig` object,
    `auth.service.spec.ts:48-53`), then `mailOutboxService.enqueuePasswordReset`
    with a `resetUrl` containing the raw token and `STORE_CLIENT_URL`.
11. `requestPasswordReset` never logs the raw token (grep the logger mock calls'
    serialized args for the token value — regression guard).
12. `confirmPasswordReset('bad-token', pass)` when `findPasswordResetToken` resolves
    `null` → throws `UnauthorizedException`; `argon2.hash` and
    `updatePasswordHash`/`revokeAllUserTokens` are never called.
13. `confirmPasswordReset(token, pass)` when the found row has `usedAt` set →
    throws the same generic `UnauthorizedException` (assert message does not
    differ from the "not found" case — string-equality check across tests 12/13/14
    is the regression guard against leaking token state).
14. `confirmPasswordReset(token, pass)` when `expiresAt < now` → throws the same
    generic error.
15. `confirmPasswordReset(token, pass)` when the owning user is deactivated →
    throws the same generic error, no password change.
16. `confirmPasswordReset(token, newPass)` happy path → calls `argon2.hash(newPass)`,
    `updatePasswordHash(userId, hash)`, `markPasswordResetTokenUsed(id)`, **and**
    `revokeAllUserTokens(userId)` — assert call order (mark-used and revoke must
    both happen; order between them is not security-critical but both must occur
    exactly once).

### `password-reset.template.spec.ts` (new, mirrors `order-confirmation.template.spec.ts`)

17. `buildPasswordResetEmail` returns non-empty `subject`/`html`/`text`.
18. The rendered `html`/`text` contain the given `resetUrl` verbatim (link is
    clickable in HTML, present in plain text).
19. HTML-escapes any interpolated dynamic string (defensive, even though `resetUrl`
    is server-generated, not user input) — mirrors the `escapeHtml` discipline in
    `order-confirmation.template.ts:80-88`.

### `mail-outbox.service.spec.ts` (extend existing file)

20. `enqueuePasswordReset` writes a row with `type: PASSWORD_RESET_MAIL_TYPE` and
    the given `recipient`.
21. `dispatchDue`'s `deliver()` switch calls `mailService.sendPasswordResetPayload`
    for a row of that type (mirrors the existing order-confirmation dispatch test).

### `auth.e2e-spec.ts` (extend existing file — mock `AuthRepository` + `PrismaService`, `ThrottlerGuard` pass-through, per the existing harness)

22. `POST /api/auth/password-reset/request` with an existing active user's email →
    `200`, generic message body.
23. `POST /api/auth/password-reset/request` with a **non-existent** email → `200`,
    **byte-identical** response body/shape to test 22 (the core existence-hiding
    assertion — compare full `response.body` equality, not just status code).
24. `POST /api/auth/password-reset/request` with an invalid email format → `400`.
25. `POST /api/auth/password-reset/confirm` with an unknown token → `401`.
26. `POST /api/auth/password-reset/confirm` with a weak `newPassword` (e.g. no
    uppercase) → `400` (policy enforced via `IsStrongAppPassword`).
27. `POST /api/auth/password-reset/confirm` happy path (mock
    `findPasswordResetToken` to resolve a valid unused row) → `200`; assert
    `authRepositoryMock.revokeAllUserTokens` was called with the token's `userId`.
28. Rate limiting: request endpoint carries `@Throttle` metadata consistent with
    register/login (spot-checked the same way existing throttle behavior is
    implicitly trusted — via the pass-through guard in this suite; a live-limit
    check is out of scope for e2e, same convention as the current file).

### Frontend RTL (`frontend-testing` skill conventions — jsdom project, MSW)

29. `forgot-password-form.test.tsx`: submits email → shows the generic success
    copy regardless of a mocked 200 either way (no branching UI); invalid email →
    inline validation error, no request fired.
30. `reset-password-form.test.tsx`: missing `?token=` → renders the error state,
    no form; mismatched password/confirm → inline validation error; weak password
    → inline validation error (mirrors `passwordSchema` messages); happy path →
    calls the mutation with `{ token, newPassword }` and redirects to `/login` on
    success; mocked 401 → shows `errorInvalidToken`.
31. `auth-sheet.test.tsx` (extend if it exists, else add): clicking "Забули
    пароль?" inside the sheet's login view switches to the forgot-password view
    without closing the sheet.

## Tasks

### TASK-169-A: Prisma schema — `PasswordResetToken` model

**Type:** feat
**Scope:** shared (schema.prisma, store-api migration)
**Complexity:** S
**TDD Required:** No (schema-only; behavior is tested at the repository layer in -B)
**Depends on:** —

**Acceptance Criteria:**

- [ ] `PasswordResetToken` model added exactly as specified in **Technical Design →
      Data Model**, with `@@map("password_reset_tokens")` and both indexes.
- [ ] `User.passwordResetTokens PasswordResetToken[]` relation added.
- [ ] `npx prisma generate` succeeds locally (client types available for -B); the
      actual `prisma migrate dev` run happens once on `develop` post-merge (see
      **Notes**).
- [ ] `.env.example` gains `PASSWORD_RESET_TOKEN_EXPIRATION=1h` and
      `STORE_CLIENT_URL=http://localhost:3000` with a one-line comment each.

**Files to create/modify:**

- `apps/store-api/prisma/schema.prisma` — new model + `User` relation line.
- `apps/store-api/.env.example` — two new documented vars.

---

### TASK-169-B: `AuthRepository` — password-reset token persistence

**Type:** feat
**Scope:** store-api
**Complexity:** M
**TDD Required:** Yes — write repository tests 1–6 (Red) before implementing.
**Depends on:** TASK-169-A

**Acceptance Criteria:**

- [ ] All 6 repository tests (see TDD list) pass.
- [ ] The raw token is never persisted or logged — only its SHA-256 hash (reuses
      the existing private `hashToken()`).
- [ ] `npm run test -w apps/store-api -- auth.repository.spec` green.

**Files to create/modify:**

- `apps/store-api/src/auth/auth.repository.ts` — 5 new methods (see Technical
  Design → Backend → AuthRepository).
- `apps/store-api/src/auth/auth.repository.spec.ts` — new test cases.

---

### TASK-169-C: Mail — `password-reset` outbox type + template

**Type:** feat
**Scope:** store-api
**Complexity:** M
**TDD Required:** Yes — write template tests 17–19 and mail-outbox tests 20–21
(Red) before implementing.
**Depends on:** —

**Acceptance Criteria:**

- [ ] New pure template `password-reset.template.ts` has zero NestJS/nodemailer
      imports (grep-checkable, mirrors the existing template file's header
      comment discipline).
- [ ] `MailOutboxService.deliver()` switch handles `PASSWORD_RESET_MAIL_TYPE`
      without touching the `ORDER_CONFIRMATION_MAIL_TYPE` branch.
- [ ] `MailService.sendPasswordResetPayload` no-ops (logged) when
      `MAIL_ENABLED !== 'true'`, matching `sendOrderConfirmationPayload`'s
      contract.
- [ ] `npm run test -w apps/store-api -- password-reset.template mail-outbox.service` green.

**Files to create/modify:**

- `apps/store-api/src/mail/templates/password-reset.template.ts` — new.
- `apps/store-api/src/mail/templates/password-reset.template.spec.ts` — new.
- `apps/store-api/src/mail/mail.service.ts` — add `sendPasswordResetPayload`.
- `apps/store-api/src/mail-outbox/mail-outbox.types.ts` — add
  `PASSWORD_RESET_MAIL_TYPE`.
- `apps/store-api/src/mail-outbox/mail-outbox.service.ts` — add
  `enqueuePasswordReset` + `deliver()` case.
- `apps/store-api/src/mail-outbox/mail-outbox.service.spec.ts` — new test cases.

---

### TASK-169-D: `AuthService` — request/confirm business logic

**Type:** feat
**Scope:** store-api
**Complexity:** L
**TDD Required:** Yes — write service tests 7–16 (Red) before implementing. This is
the security-critical core of the task; do not skip ahead to the controller.
**Depends on:** TASK-169-B, TASK-169-C

**Acceptance Criteria:**

- [ ] All 10 service tests (7–16) pass.
- [ ] `requestPasswordReset` is existence-hiding: identical (no-throw, no side
      effect) behavior for missing/deactivated/soft-deleted users.
- [ ] `confirmPasswordReset` throws the **same** generic `UnauthorizedException`
      message for not-found/used/expired/deactivated-owner cases (string-equality
      asserted across tests 12–15).
- [ ] Successful confirm calls `revokeAllUserTokens` — verified by test 16.
- [ ] No raw token ever reaches the logger (test 11).
- [ ] `npm run test -w apps/store-api -- auth.service.spec` green.

**Files to create/modify:**

- `apps/store-api/src/auth/auth.service.ts` — 2 new public methods + `MailOutboxService`
  - `randomBytes` (`crypto`) added to constructor deps/imports.
- `apps/store-api/src/auth/auth.service.spec.ts` — new test cases + `MailOutboxService`
  mock.

---

### TASK-169-E: `AuthController` — endpoints, DTOs, e2e tests

**Type:** feat
**Scope:** store-api
**Complexity:** M
**TDD Required:** Yes — write e2e tests 22–27 (Red) before wiring the routes.
**Depends on:** TASK-169-D

**Acceptance Criteria:**

- [ ] `POST /api/auth/password-reset/request` and `POST /api/auth/password-reset/confirm`
      wired exactly per **API Contract** (paths, throttle limits, response shapes).
- [ ] Both endpoints are public (no guard) — confirmed no global `JwtAuthGuard`
      exists (only `ThrottlerGuard` via `APP_GUARD`), so no bypass decorator is
      needed.
- [ ] Request endpoint returns a **byte-identical** body for existing vs.
      non-existent emails (test 23).
- [ ] Swagger decorators (`@ApiOperation`, `@ApiResponse`, `@ApiTags('Auth')`)
      added, consistent with the existing `register`/`login` documentation style.
- [ ] `npm run test:e2e -w apps/store-api -- auth.e2e-spec` green (run
      `--runInBand` per the `store-api-e2e-serial` project convention).

**Files to create/modify:**

- `apps/store-api/src/auth/dto/request-password-reset.dto.ts` — new.
- `apps/store-api/src/auth/dto/confirm-password-reset.dto.ts` — new.
- `apps/store-api/src/auth/dto/index.ts` — export both.
- `apps/store-api/src/auth/auth.controller.ts` — 2 new route handlers.
- `apps/store-api/test/auth.e2e-spec.ts` — new `describe` blocks (tests 22–28).

---

### TASK-169-F: Storefront — forgot/reset forms + `AuthSheet` wiring

**Type:** feat
**Scope:** store-client
**Complexity:** L
**TDD Required:** No per AGENTS.md's critical-module list (frontend forms are not
cart/discounts/inventory/auth-token logic), but RTL coverage is still required
per the `frontend-testing` skill — write tests 29–31 alongside implementation.
**Depends on:** TASK-169-E (needs the Orval-generated hooks — see Notes on
sequencing)

**Acceptance Criteria:**

- [ ] `ForgotPasswordForm` and `ResetPasswordForm` built per **Technical Design →
      Frontend**, using Orval-generated hooks only (no manual fetch/axios).
- [ ] `AuthSheet` gains the `"forgot"` view; `LoginForm`'s "Забули пароль?" switches
      to it in sheet mode, links to `/forgot-password` in page mode. The
      `forgotSoon` toast stub and its dict key are removed.
- [ ] `/forgot-password` and `/reset-password` standalone pages exist, structurally
      consistent with `/login`/`/register`.
- [ ] `dict.auth.forgotPassword` / `dict.auth.resetPassword` added; no
      hardcoded UA strings inline in the new components.
- [ ] `passwordSchema` (shared) reused for the new-password field — not
      re-implemented.
- [ ] All new/changed RTL specs (29–31) green; `npm run test -w apps/store-client`
      and `npm run build -w apps/store-client` green.

**Files to create/modify:**

- `apps/store-client/src/features/auth/ui/forgot-password-form.tsx` — new.
- `apps/store-client/src/features/auth/ui/forgot-password-form.test.tsx` — new.
- `apps/store-client/src/features/auth/ui/reset-password-form.tsx` — new.
- `apps/store-client/src/features/auth/ui/reset-password-form.test.tsx` — new.
- `apps/store-client/src/features/auth/ui/auth-sheet.tsx` — add `"forgot"` view.
- `apps/store-client/src/features/auth/ui/login-form.tsx` — replace toast stub
  with real navigation/callback.
- `apps/store-client/src/features/auth/index.ts` — export new components.
- `apps/store-client/src/app/(auth)/forgot-password/page.tsx` — new.
- `apps/store-client/src/app/(auth)/reset-password/page.tsx` — new.
- `apps/store-client/src/entities/session/index.ts` — re-export the 2 new
  generated hooks + DTO types (post Orval regen).
- `apps/store-client/src/shared/config/dictionary.ts` — new `forgotPassword`/
  `resetPassword` sections; remove `forgotSoon`.

---

### TASK-169-G: Post-merge housekeeping (swagger/orval/migration)

**Type:** chore
**Scope:** shared
**Complexity:** S
**TDD Required:** No
**Depends on:** TASK-169-A…F merged to `develop`

**Acceptance Criteria:**

- [ ] `npx prisma migrate dev --name add_password_reset_token` run against the dev
      DB on `develop` (migrations are gitignored per the
      `migrations-gitignored` project convention — `schema.prisma` is already the
      source of truth from TASK-169-A).
- [ ] Swagger spec re-exported and Orval regenerated for **both** store-client and
      store-admin configs (`npm run generate:api` or the project's documented
      command from the `api-contract` skill) so `useAuthControllerRequestPasswordReset`
      / `useAuthControllerConfirmPasswordReset` exist in
      `**/shared/api/generated/`.
- [ ] `apps/store-client/src/entities/session/index.ts` re-export line (deferred
      from TASK-169-F) added once the generated hooks exist.
- [ ] All 3 workspaces: `npm run typecheck` + `npm run lint` + `npm run build` green.

**Files to create/modify:**

- (generated) `apps/store-api/prisma/migrations/<timestamp>_add_password_reset_token/`
- (generated) `**/shared/api/generated/**` (Orval output, both frontends)
- `apps/store-client/src/entities/session/index.ts` — finalize re-exports if not
  already done in -F.

## Migration Steps

1. TASK-169-A — schema change (no migration run yet locally beyond `prisma generate`
   for typed client access during development).
2. TASK-169-B — repository (Red → Green → Refactor).
3. TASK-169-C — mail template + outbox wiring (Red → Green → Refactor) — can run in
   parallel with -B (no dependency between them).
4. TASK-169-D — service business logic (Red → Green → Refactor), depends on -B and -C.
5. TASK-169-E — controller + DTOs + e2e (Red → Green → Refactor), depends on -D.
6. TASK-169-F — storefront forms; can be scaffolded in parallel with -E using hand-typed
   interim request shapes, but the final Orval-hook wiring depends on -G's regen (see
   Risks — sequencing note).
7. TASK-169-G — one-time post-merge housekeeping on `develop`.

## Risks & Mitigations

| Risk                                                                                                                                                                                     | Mitigation                                                                                                                                                                                                                                                                                                                        |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Frontend built against hooks that don't exist yet (Orval regen is post-merge)                                                                                                            | TASK-169-F can stub the mutation calls against a local Orval regen run in the feature branch during development (the branch has its own working tree/DB), then TASK-169-G re-confirms on `develop` after merge — this mirrors how every other backend+frontend slice in this repo has shipped (see e.g. plans 116/118 sequencing) |
| Response-timing side channel (existing-user path does more work: token gen + email enqueue vs. non-existing path's early return) could theoretically leak existence via response latency | Explicitly out of scope for this pass (documented under **Out of Scope**) — the response **body** is byte-identical (the primary, cheap defense); timing-safe equalization would need artificial delay padding and is not requested by the security requirements in the task brief                                                |
| `PasswordResetToken` rows accumulate indefinitely (no cleanup cron)                                                                                                                      | Low-volume table (one row per reset attempt, single-use); folding cleanup into the existing `RefreshTokenCleanupService` cadence is a trivial follow-up if it becomes a concern — not blocking for launch                                                                                                                         |
| A user requests multiple resets in a row, leaving several valid tokens active                                                                                                            | Mitigated by `invalidateActivePasswordResetTokens` in `requestPasswordReset` — only the most recent request's token is honorable                                                                                                                                                                                                  |
| Generic 401 on confirm makes debugging support tickets harder (support can't tell the customer _why_ it failed)                                                                          | Acceptable trade-off per the explicit security requirement (existence/state hiding); server-side Pino logs still capture the specific reason (used/expired/not-found) for internal diagnosis — just never returned to the client                                                                                                  |

## Notes

- **Reusable assets consumed (file:line references, verified during planning):**
  - Hash-at-rest pattern: `apps/store-api/src/auth/auth.repository.ts:26-28` (private
    `hashToken()`, reused directly — no new hashing helper needed).
  - argon2 hashing: `auth.service.ts:5,44`. Strong-password policy:
    `apps/store-api/src/common/validators/is-strong-app-password.decorator.ts:39-45`
    (`IsStrongAppPassword()` + `PASSWORD_POLICY_DESCRIPTION`), storefront mirror
    `apps/store-client/src/shared/lib/password-policy.ts:24-27` (`passwordSchema`).
  - TTL parsing: `auth.service.ts:178-200` (`parseExpirationToMs`).
  - Mail-outbox generic pattern: `apps/store-api/src/mail-outbox/mail-outbox.types.ts:1-8`
    (doc comment explicitly names password-reset as the intended second consumer),
    `mail-outbox.service.ts:60-73` (`enqueueOrderConfirmation` as the template for
    `enqueuePasswordReset`), `mail-outbox.service.ts:154-164` (`deliver()` switch).
  - Order-confirmation template as the pure-function template model:
    `apps/store-api/src/mail/templates/order-confirmation.template.ts:1-8` (header
    comment convention) and its escaping discipline (`escapeHtml`, lines 80-88).
  - `RefreshToken` model as the Prisma mirror: `schema.prisma:395-407`.
  - `MailOutbox` model (already generic, no change needed): `schema.prisma:595-610`.
  - E2E harness to extend: `apps/store-api/test/auth.e2e-spec.ts` (mocked
    `AuthRepository` + `PrismaService` at the Clean-Architecture boundary,
    `ThrottlerGuardPassThrough` override, supertest, `--runInBand` convention per
    the `store-api-e2e-serial` project memory).
  - Existing toast stub to remove:
    `apps/store-client/src/features/auth/ui/login-form.tsx:176-183` +
    `dict.auth.login.forgotSoon` (`dictionary.ts:1204-1211`).
  - `AuthSheet` slide-out to extend: `apps/store-client/src/features/auth/ui/auth-sheet.tsx`.

- **Global-guard confirmation:** the only `APP_GUARD` registered app-wide is
  `ThrottlerGuard` (no global `JwtAuthGuard`) — verified against
  `apps/store-api/src/auth/auth.controller.ts`, where `register`/`login`/the new
  password-reset routes carry no auth guard, while `logout` explicitly adds
  `@UseGuards(JwtAuthGuard)`. This confirms the two new endpoints need **no**
  "public route" bypass decorator — they are public by default.

- **Swagger/Orval/migration timing:** per repo convention (and explicit note from
  the orchestrator), running `prisma migrate dev`, the Swagger export, and the
  Orval regen for both frontends happens **once on `develop` after this feature
  merges** — not per-task in this plan. TASK-169-G captures that as an explicit,
  trackable step so it isn't silently dropped.

- **Why an opaque token instead of a JWT** for the reset link: `RefreshToken`s are
  JWTs because they're parsed by a Passport strategy (`JwtRefreshStrategy`) that
  needs signature verification independent of a DB round-trip. A password-reset
  token is used exactly once, synchronously, against the DB anyway (to check
  single-use/expiry) — a `crypto.randomBytes(32).toString('hex')` opaque token is
  simpler, carries no decodable claims, and still gets the same hash-at-rest
  protection via the shared `hashToken()` method.
