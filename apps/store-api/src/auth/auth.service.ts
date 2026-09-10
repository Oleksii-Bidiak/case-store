import {
  Injectable,
  BadRequestException,
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, type JwtSignOptions } from '@nestjs/jwt';
import { PinoLogger } from 'nestjs-pino';
import { randomBytes } from 'crypto';
import { OAuthProvider, User, UserRole } from '@prisma/client';
import { AuthRepository, CreateUserInput } from './auth.repository';
import { AuthTokens } from './entities';
import { RegisterDto } from './dto';
import { GoogleOAuthProfile } from './oauth/google-oauth-profile';
import { MailOutboxService } from '../mail-outbox/mail-outbox.service';
import { hashPassword, verifyPassword } from '../common/security';
import { STAFF_PASSWORD_MESSAGE, STAFF_PASSWORD_REGEX } from '../common/validators';

/** Bytes of entropy for an opaque password-reset token (→ 64 hex chars). */
const PASSWORD_RESET_TOKEN_BYTES = 32;

/** Generic error message for every confirm-reset failure — never leaks which
 * specific check failed (not-found / used / expired / deactivated owner). */
const INVALID_RESET_TOKEN_MESSAGE = 'Invalid or expired reset token';

/** Generic error message for every `login` failure — never leaks which specific
 * check failed (unknown email / wrong password / deactivated / soft-deleted). */
const INVALID_CREDENTIALS_MESSAGE = 'Invalid credentials';

/** Generic error message for a refresh attempt that fails on a fact about OUR
 * account rather than about the credential presented: no such token, or a token
 * whose owner is banned / tombstoned (TASK-314).
 *
 * The other two refresh rejections stay distinct on purpose — "expired" and
 * "token reuse detected" are facts about the token the caller just handed us,
 * which the caller already holds; that is the same line
 * {@link GOOGLE_EMAIL_UNVERIFIED_MESSAGE} draws. Account state sits on the far
 * side of it: whoever holds a stolen refresh cookie must not learn from us that
 * the account was banned or deleted — that the theft was noticed and acted on —
 * nor which of the two it was, a difference `login()` already refuses to
 * reveal about the same row. */
const INVALID_REFRESH_TOKEN_MESSAGE = 'Invalid refresh token';

/** Not a secret — a fixed input whose only purpose is to drive argon2's cost
 * function on the argon2-free rejection branches of `requestPasswordReset`
 * (TASK-273) and `login` (TASK-274). See {@link AuthService.burnTimingCost}. */
const DUMMY_TIMING_PASSWORD = 'dummy-timing-equalizer-password';

/** Rejection for a Google profile whose email is absent or unverified
 * (TASK-168). Checked FIRST, before any repository call, so this branch can
 * never leak whether a matching store account exists (the DB is never even
 * queried). This is a fact about the caller's GOOGLE account, not ours, so —
 * unlike every other rejection in this file — a distinct, actionable message
 * is safe here. */
const GOOGLE_EMAIL_UNVERIFIED_MESSAGE = "Google account's email is not verified";

/** Default rate limit for the locked-account owner notice (TASK-287): at most
 * one mail per address per 24h, however many times the login is retried. */
const DEFAULT_ACCOUNT_LOCKED_NOTICE_WINDOW_HOURS = 24;

/** Failed password attempts tolerated before the account's password login is
 * temporarily locked (TASK-314).
 *
 * Five deliberately matches the per-IP throttle on POST /api/auth/login
 * (`@Throttle({ limit: 5, ttl: 60000 })`): the throttle already stops five
 * guesses per minute from ONE address, but a distributed attacker sidesteps it
 * by rotating source IPs, and `User.isActive` is a MANUAL admin ban switch, not
 * an automatic lockout. This counter follows the ACCOUNT, so rotating IPs buys
 * nothing. */
const MAX_FAILED_LOGIN_ATTEMPTS = 5;

/** How long the lock holds once tripped (TASK-314).
 *
 * 15 minutes caps an online brute force at 20 guesses/hour — useless against
 * any password the store's own policy accepts — while keeping a self-inflicted
 * lockout short enough that the real owner just makes coffee instead of filing
 * a support ticket. The password-reset path is deliberately NOT gated by the
 * lock, so a genuinely stuck owner always has a way back in. */
const LOGIN_LOCKOUT_MS = 15 * 60 * 1000;

@Injectable()
export class AuthService {
  private readonly jwtSecret: string;
  private readonly jwtRefreshSecret: string;
  private readonly jwtExpiration: string;
  private readonly jwtRefreshExpiration: string;
  private readonly passwordResetExpiration: string;
  private readonly storeClientUrl: string;
  private readonly accountLockedNoticeWindowHours: number;

  constructor(
    private readonly authRepository: AuthRepository,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly mailOutboxService: MailOutboxService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(AuthService.name);

    // Secrets are required — never fall back to a default (env is validated at startup)
    this.jwtSecret = this.configService.getOrThrow<string>('JWT_SECRET');
    this.jwtRefreshSecret = this.configService.getOrThrow<string>('JWT_REFRESH_SECRET');
    this.jwtExpiration = this.configService.get<string>('JWT_EXPIRATION', '15m');
    this.jwtRefreshExpiration = this.configService.get<string>('JWT_REFRESH_EXPIRATION', '7d');
    this.passwordResetExpiration = this.configService.get<string>(
      'PASSWORD_RESET_TOKEN_EXPIRATION',
      '1h',
    );
    this.storeClientUrl = this.configService.get<string>(
      'STORE_CLIENT_URL',
      'http://localhost:3000',
    );
    this.accountLockedNoticeWindowHours = Number(
      this.configService.get<number>(
        'ACCOUNT_LOCKED_NOTICE_WINDOW_HOURS',
        DEFAULT_ACCOUNT_LOCKED_NOTICE_WINDOW_HOURS,
      ),
    );
  }

  /**
   * Register a new user.
   * Checks email uniqueness, hashes password, creates user, returns token pair.
   */
  async register(dto: RegisterDto): Promise<AuthTokens> {
    // Check if email is already taken
    const existingUser = await this.authRepository.findByEmail(dto.email);
    if (existingUser) {
      throw new ConflictException('Email already registered');
    }

    // Hash password with argon2
    const passwordHash = await hashPassword(dto.password);

    // Create user
    const createUserInput: CreateUserInput = {
      email: dto.email,
      passwordHash,
      firstName: dto.firstName,
      lastName: dto.lastName,
    };
    const user = await this.authRepository.createUser(createUserInput);

    // Critical business event — never log the password/hash.
    this.logger.info(
      { event: 'user.registered', userId: user.id, email: dto.email },
      'User registered',
    );

    // Generate and return token pair
    return this.generateTokenPair(user.id, user.role);
  }

  /**
   * Login with email and password (TASK-274 timing-hardened).
   *
   * Every failure — unknown email, wrong password, deactivated or soft-deleted
   * account — throws the SAME generic {@link INVALID_CREDENTIALS_MESSAGE}, so the
   * response body can never be used to enumerate accounts or probe their state.
   *
   * The unknown-email branch additionally burns a fixed argon2 cost: returning
   * before doing any hashing work would make it measurably faster than the
   * found-user branch (which pays for `argon2.verify`), i.e. a timing oracle.
   */
  async login(email: string, password: string): Promise<AuthTokens> {
    const user = await this.authRepository.findByEmail(email);

    // `!user.passwordHash` (TASK-168): a Google-only account has no password —
    // treated exactly like "no such user" (same generic message, same timing
    // burn) and never passed to argon2.verify, which would crash on null (a
    // distinguishable failure mode, violating the TASK-274 policy).
    if (!user || !user.passwordHash) {
      await this.burnTimingCost();
      throw new UnauthorizedException(INVALID_CREDENTIALS_MESSAGE);
    }

    const isPasswordValid = await verifyPassword(user.passwordHash, password);
    const isLocked = !user.isActive || Boolean(user.deletedAt);

    // TASK-287: the owner — and only the owner — gets the truth, by email. The
    // notice is gated on a CORRECT password so it can be triggered by nobody but
    // someone who already holds the credentials (an anonymous prober cannot use
    // it to confirm a ban, nor to spray mail at the address).
    if (isPasswordValid && isLocked) {
      await this.notifyLockedAccountOwner(user.id, user.email);
    }

    // TASK-314 lockout. Checked AFTER argon2.verify on purpose: returning here
    // before paying the hashing cost would make the locked branch measurably
    // faster than every other branch — a timing oracle that answers "is this
    // account currently locked", hence "does this email exist". No mail is sent
    // for an automatic lockout (unlike the manual ban above): anyone can drive a
    // stranger's account into lockout with wrong passwords, so mailing on it
    // would turn the login form into a mail sprayer. The counter is not touched
    // either — an attacker hammering a locked account must not be able to extend
    // its deadline into a permanent denial of service for the real owner.
    if (this.isTemporarilyLocked(user)) {
      throw new UnauthorizedException(INVALID_CREDENTIALS_MESSAGE);
    }

    if (!isPasswordValid) {
      await this.registerFailedLogin(user);
      throw new UnauthorizedException(INVALID_CREDENTIALS_MESSAGE);
    }

    // Deactivated (banned) and soft-deleted (tombstoned) accounts must never
    // obtain tokens. Same message as the wrong-password branch above so the two
    // are indistinguishable to the client — and each has already paid the
    // argon2.verify cost, so no branch here is a timing outlier.
    if (isLocked) {
      throw new UnauthorizedException(INVALID_CREDENTIALS_MESSAGE);
    }

    // The owner just proved themselves — wipe the slate, so a counter built up
    // from occasional typos over months can never lock out someone who never
    // had MAX_FAILED_LOGIN_ATTEMPTS failures in a row. Skipped when there is
    // nothing to clear: the common path stays a pure read.
    if (user.failedLoginAttempts > 0 || user.lockedUntil) {
      await this.authRepository.clearFailedLogins(user.id);
    }

    return this.generateTokenPair(user.id, user.role);
  }

  /** Is this account's password login currently held shut by TASK-314's
   * automatic lockout? A `lockedUntil` in the past is a spent lock, not a
   * live one. */
  private isTemporarilyLocked(user: Pick<User, 'lockedUntil'>): boolean {
    return Boolean(user.lockedUntil && user.lockedUntil.getTime() > Date.now());
  }

  /**
   * Count one failed password attempt against the account and trip the lock
   * once the threshold is reached (TASK-314).
   *
   * A non-null `lockedUntil` at this point can only be a lock that has already
   * expired (a live one throws before we get here), so the window restarts.
   */
  private async registerFailedLogin(user: Pick<User, 'id' | 'lockedUntil'>): Promise<void> {
    const attempts = await this.authRepository.recordFailedLogin(
      user.id,
      Boolean(user.lockedUntil),
    );

    if (attempts < MAX_FAILED_LOGIN_ATTEMPTS) {
      return;
    }

    const lockedUntil = new Date(Date.now() + LOGIN_LOCKOUT_MS);
    await this.authRepository.lockLoginUntil(user.id, lockedUntil);

    // The client is told nothing (same generic 401 as attempt #1) — the record
    // of the lock lives here, where an operator can alert on it.
    this.logger.warn(
      { event: 'auth.loginLockedOut', userId: user.id, attempts, lockedUntil },
      'Password login locked out after repeated failures',
    );
  }

  /**
   * Sign in (or sign up) with a normalized Google OAuth profile (TASK-168).
   *
   * Resolution order (plan 153 §Locked-account resolution — load-bearing):
   * 1. Reject an absent/unverified Google email BEFORE any repository call —
   *    that branch can never probe our account state.
   * 2. Fast path: an existing (provider, providerId) link resolves the user.
   * 3. Otherwise match by verified email; a brand-new email auto-provisions a
   *    password-less user + link atomically (Google doubles as registration).
   * 4. The lock check runs strictly AFTER user resolution and strictly BEFORE
   *    linking or token issuance: a locked account gets the exact same generic
   *    {@link INVALID_CREDENTIALS_MESSAGE} + {@link notifyLockedAccountOwner}
   *    treatment as a password login (TASK-274/287), and never accumulates a
   *    working OAuth link (no silent-reactivation side channel).
   * 5. The role gate ({@link assertStorefrontRole}) runs strictly AFTER the lock
   *    check and strictly BEFORE linking or token issuance (TASK-314).
   */
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

        // Defence in depth (TASK-314): createUserFromOAuth pins CUSTOMER, but
        // the rule is re-checked on the row that actually came back, so a future
        // change there cannot reopen the hole through the signup branch. Checked
        // before the "registered" log — a refused login is not a registration.
        this.assertStorefrontRole(created.user);

        this.logger.info(
          { event: 'user.registeredViaGoogle', userId: created.user.id },
          'User registered via Google',
        );

        return this.generateTokenPair(created.user.id, created.user.role);
      }

      user = matchedUser;
      // Only actually link AFTER the lock check below passes.
      needsLink = true;
    }

    const isLocked = !user.isActive || Boolean(user.deletedAt);

    // Mirrors login()'s TASK-274/287 shape exactly: same notify mechanism, same
    // generic message, same "reject before any state-revealing side effect"
    // ordering. `needsLink` is NEVER honored on this branch — an OAuth login
    // must not become a side channel that silently restores a banned or
    // tombstoned account's ability to sign in.
    if (isLocked) {
      await this.notifyLockedAccountOwner(user.id, user.email);
      throw new UnauthorizedException(INVALID_CREDENTIALS_MESSAGE);
    }

    // TASK-314. Deliberately AFTER the lock check: run first, it would make
    // "there is an ADMIN with this email" and "there is a locked account with
    // this email" distinguishable by their side effects (the TASK-287 owner
    // notice fires for one and not the other) — a fresh oracle. Deliberately
    // BEFORE `needsLink`: a refused login must leave no link behind, the same
    // rule the lock check follows.
    this.assertStorefrontRole(user);

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

  /**
   * Refresh authentication tokens.
   * Validates stored token, checks not revoked/expired, revokes old, issues new pair.
   *
   * Security: If a revoked token is reused, this indicates a potential token theft.
   * Per RFC 6819 §5.2.2, we revoke ALL tokens for the user to terminate all sessions,
   * forcing re-authentication and preventing the attacker from continuing to use stolen tokens.
   *
   * The account check mirrors `login()` exactly (TASK-314): a session must never
   * outlive the account it belongs to.
   */
  async refreshToken(oldToken: string): Promise<AuthTokens> {
    // Find the refresh token in the database
    const storedToken = await this.authRepository.findRefreshToken(oldToken);
    if (!storedToken) {
      throw new UnauthorizedException(INVALID_REFRESH_TOKEN_MESSAGE);
    }

    // Check if token is revoked — reuse detection
    if (storedToken.isRevoked) {
      // Token reuse detected: revoke ALL tokens for this user to terminate all sessions.
      // This prevents an attacker who stole a token from continuing to use it.
      await this.authRepository.revokeAllUserTokens(storedToken.user.id);
      throw new UnauthorizedException('Token reuse detected — all sessions terminated');
    }

    // Check if token is expired
    if (storedToken.expiresAt < new Date()) {
      throw new UnauthorizedException('Refresh token has expired');
    }

    // Reject deactivated (banned) AND soft-deleted (tombstoned) owners — the
    // same pair of conditions login() and loginWithGoogleProfile() reject
    // (TASK-314). Checking only `isActive` here let a tombstoned account keep
    // rotating for the full refresh lifetime (7 days), where the access token
    // alone would have expired in 15 minutes.
    //
    // deactivateUser/deleteUser do revoke every token, but this check must not
    // lean on that: a token minted in the race window, a row flipped by
    // SQL/seed/import, or a future flow that forgets the revoke would each
    // reopen the gap. Rejection comes BEFORE revokeToken, so a refused attempt
    // leaves the row untouched.
    if (!storedToken.user.isActive || storedToken.user.deletedAt) {
      throw new UnauthorizedException(INVALID_REFRESH_TOKEN_MESSAGE);
    }

    // Revoke the old refresh token (rotation)
    await this.authRepository.revokeToken(storedToken.id);

    // Issue a new token pair
    return this.generateTokenPair(storedToken.user.id, storedToken.user.role);
  }

  /**
   * Logout by revoking all refresh tokens for a user.
   */
  async logout(userId: string): Promise<void> {
    await this.authRepository.revokeAllUserTokens(userId);
  }

  /**
   * Request a password reset (TASK-169).
   *
   * Existence-hiding: for a missing, deactivated, or soft-deleted account this
   * resolves silently — no token, no email, no thrown error — so neither the
   * response shape nor a thrown exception can be used to enumerate accounts. The
   * controller always responds 200 regardless.
   *
   * For a valid active user: any still-active prior tokens are invalidated (one
   * honorable link at a time), a fresh opaque token is generated + persisted
   * (hashed at rest), and the reset email is enqueued via the outbox. The raw
   * token only ever lives in the email link — it is never logged.
   */
  async requestPasswordReset(email: string): Promise<void> {
    const user = await this.authRepository.findByEmail(email);

    // Silent no-op for a non-existent / banned / soft-deleted account.
    if (!user || !user.isActive || user.deletedAt) {
      // TASK-273: without this the no-op branch would return near-instantly.
      await this.burnTimingCost();
      return;
    }

    // Only the most recent request stays valid.
    await this.authRepository.invalidateActivePasswordResetTokens(user.id);

    // Opaque (non-JWT) token: used once, synchronously, against the DB anyway.
    const rawToken = randomBytes(PASSWORD_RESET_TOKEN_BYTES).toString('hex');
    const expiresAt = new Date(Date.now() + this.parseExpirationToMs(this.passwordResetExpiration));

    await this.authRepository.savePasswordResetToken(user.id, rawToken, expiresAt);

    const resetUrl = `${this.storeClientUrl}/reset-password?token=${rawToken}`;
    await this.mailOutboxService.enqueuePasswordReset({
      to: user.email,
      resetUrl,
      expiresInHuman: this.formatExpirationHuman(this.passwordResetExpiration),
    });

    // Critical business event — never log the raw token or the reset URL.
    this.logger.info(
      { event: 'user.passwordResetRequested', userId: user.id },
      'Password reset requested',
    );
  }

  /**
   * Confirm a password reset (TASK-169).
   *
   * Validates the single-use token, sets the new password hash, marks the token
   * used, and revokes every refresh token for the user (forces re-login on all
   * devices). Every failure — token not found, already used, expired, or owned
   * by a deactivated/soft-deleted account — throws the SAME generic
   * `UnauthorizedException` so the response never reveals token/account state.
   */
  async confirmPasswordReset(rawToken: string, newPassword: string): Promise<void> {
    const stored = await this.authRepository.findPasswordResetToken(rawToken);

    const isInvalid =
      !stored ||
      Boolean(stored.usedAt) ||
      stored.expiresAt < new Date() ||
      !stored.user.isActive ||
      Boolean(stored.user.deletedAt);

    if (isInvalid || !stored) {
      // Server-side log still captures the specific reason for internal diagnosis.
      this.logger.warn({ event: 'user.passwordResetRejected' }, 'Password reset token rejected');
      throw new UnauthorizedException(INVALID_RESET_TOKEN_MESSAGE);
    }

    // The DTO could only validate against the shopper policy — a reset token
    // says nothing about whose account it opens. Now that it does, staff are
    // held to the strict rule (TASK-407). Checked after the token has been
    // accepted, so a rejection here cannot be used to probe whether a token is
    // valid.
    this.assertPasswordMeetsRolePolicy(stored.user.role, newPassword);

    // Hash + clear the lockout + terminate every existing session. Routed
    // through the shared tail (TASK-333) so a reset can never drift from a
    // change; clearing `lockedUntil` here also closes a real trap — the owner
    // who locked themselves out, reset their password, and then found the new
    // one rejected for another 15 minutes with no explanation.
    await this.setPassword(stored.user.id, newPassword);
    await this.authRepository.markPasswordResetTokenUsed(stored.id);

    this.logger.info(
      { event: 'user.passwordResetCompleted', userId: stored.user.id },
      'Password reset completed',
    );
  }

  /**
   * Change the signed-in user's own password (TASK-333).
   *
   * ONE endpoint serves both the storefront `/account` screen and the admin
   * panel — the mechanism is identical, and two implementations would be two
   * places for the session-revocation step to be forgotten.
   *
   * Requires the CURRENT password. A valid access token is not sufficient proof
   * on its own: a token lifted from an unlocked laptop or an XSS payload would
   * otherwise be enough to take the account over permanently, which is exactly
   * the escalation this check exists to stop.
   *
   * On success every refresh token is revoked, mirroring
   * {@link confirmPasswordReset}. That is the point of changing a password you
   * suspect is compromised: whoever else was signed in is signed out. The
   * caller's own access token stays valid until it expires (≤15 min) — the
   * frontend simply re-authenticates on its next refresh.
   *
   * Both failure modes throw the same generic message. A distinct "no password
   * on this account" would tell an attacker holding a stolen token that the
   * victim signs in with Google, i.e. where to aim next.
   */
  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    const user = await this.authRepository.findById(userId);

    // A Google-only account genuinely has no password to prove. Routed to the
    // same rejection as a wrong password (and paying the same argon2 cost) so
    // the two are indistinguishable from outside.
    if (!user || !user.passwordHash) {
      await this.burnTimingCost();
      throw new UnauthorizedException(INVALID_CREDENTIALS_MESSAGE);
    }

    const isCurrentValid = await verifyPassword(user.passwordHash, currentPassword);
    if (!isCurrentValid) {
      this.logger.warn(
        { event: 'user.passwordChangeRejected', userId },
        'Password change rejected — current password did not match',
      );
      throw new UnauthorizedException(INVALID_CREDENTIALS_MESSAGE);
    }

    this.assertPasswordMeetsRolePolicy(user.role, newPassword);

    await this.setPassword(userId, newPassword);

    this.logger.info(
      { event: 'user.passwordChanged', userId },
      'Password changed by the account owner',
    );
  }

  /**
   * Hold a STAFF account to the strict password policy (TASK-407).
   *
   * The shopper policy was loosened by owner decision on 2026-09-10 — 8+ chars
   * with a letter and a digit, no uppercase requirement — while ADMIN/MANAGER
   * accounts keep the original rule. Neither of the two endpoints a user changes
   * their OWN password through can express that in its DTO: `ChangePasswordDto`
   * carries no role, and `ConfirmPasswordResetDto` carries only an opaque token.
   * Both therefore validate loosely and land here, where the user row is in hand.
   *
   * Without this check the strict staff rule would be exactly one «Забули
   * пароль?» away from not existing.
   */
  private assertPasswordMeetsRolePolicy(role: UserRole, newPassword: string): void {
    if (role === UserRole.CUSTOMER) return;
    if (STAFF_PASSWORD_REGEX.test(newPassword)) return;

    throw new BadRequestException(STAFF_PASSWORD_MESSAGE);
  }

  /**
   * Write a new password hash and terminate every existing session (TASK-333).
   *
   * The shared tail of "the password just changed", whatever proved the right to
   * change it: the owner's current password ({@link changePassword}), a
   * single-use reset token ({@link confirmPasswordReset}), or the shop owner
   * resetting an employee's ({@link UserService.setUserPassword}). Keeping the
   * hash write and the revoke together is what stops a future path from doing
   * one without the other.
   *
   * `clearFailedLogins` is included deliberately: an account that got locked out
   * is the most likely one to be having its password reset, and leaving the lock
   * armed would mean the new password does not work for another 15 minutes —
   * indistinguishable, to the user, from the reset having silently failed.
   */
  async setPassword(userId: string, newPassword: string): Promise<void> {
    const passwordHash = await hashPassword(newPassword);

    await this.authRepository.updatePasswordHash(userId, passwordHash);
    await this.authRepository.clearFailedLogins(userId);
    await this.authRepository.revokeAllUserTokens(userId);
  }

  /**
   * Generate an access/refresh token pair.
   * Access token uses JWT_SECRET, refresh token uses JWT_REFRESH_SECRET.
   * The refresh token is persisted in the database for tracking and rotation.
   */
  async generateTokenPair(userId: string, role: string): Promise<AuthTokens> {
    // Sign access token with JWT_SECRET
    const accessToken = this.jwtService.sign(
      { sub: userId, role },
      {
        secret: this.jwtSecret,
        // See auth.module.ts: `expiresIn` is a template-literal union since
        // @nestjs/jwt 11, so a runtime config string needs the cast (TASK-304).
        expiresIn: this.jwtExpiration as JwtSignOptions['expiresIn'],
      },
    );

    // Sign refresh token with JWT_REFRESH_SECRET
    const refreshToken = this.jwtService.sign(
      { sub: userId, role, type: 'refresh' },
      {
        secret: this.jwtRefreshSecret,
        expiresIn: this.jwtRefreshExpiration as JwtSignOptions['expiresIn'],
      },
    );

    // Persist refresh token in the database
    const refreshExpirationMs = this.parseExpirationToMs(this.jwtRefreshExpiration);
    const expiresAt = new Date(Date.now() + refreshExpirationMs);

    await this.authRepository.saveRefreshToken(userId, refreshToken, expiresAt);

    const tokens = new AuthTokens();
    tokens.accessToken = accessToken;
    tokens.refreshToken = refreshToken;
    return tokens;
  }

  /**
   * Enforce the storefront-Google role policy (TASK-314): the storefront's
   * "Sign in with Google" button may only ever mint a token for a CUSTOMER.
   *
   * Staff — ADMIN today, any future MANAGER — sign in with a password (plus 2FA
   * once it lands). Without this gate, any privileged row whose email happens to
   * be a Gmail address turns Google's consent screen into a full admin login:
   * the store's password policy, `IsStaffPassword` and the login lockout are all
   * bypassed, and the entire trust boundary silently moves onto that Google
   * account.
   *
   * The refusal is the same generic {@link INVALID_CREDENTIALS_MESSAGE} used
   * everywhere else in this file (TASK-274/287) — never "you are an admin, use
   * the admin login", which would confirm both that the account exists and that
   * it is privileged. The truth is recorded server-side only, at `warn` so an
   * operator can alert on it: a hit here is either a misconfigured admin or
   * someone who has learned an admin's Gmail address.
   *
   * There is intentionally NO env toggle to relax this — such a flag only ever
   * gets switched on "temporarily".
   */
  private assertStorefrontRole(user: Pick<User, 'id' | 'role'>): void {
    if (user.role === UserRole.CUSTOMER) {
      return;
    }

    this.logger.warn(
      { event: 'auth.googleAdminBlocked', userId: user.id },
      'Storefront Google sign-in refused for a privileged role',
    );
    throw new UnauthorizedException(INVALID_CREDENTIALS_MESSAGE);
  }

  /**
   * Enqueue the "your account is not accessible — contact support" notice to the
   * owner of a deactivated/soft-deleted account (TASK-287), rate-limited to one
   * mail per {@link accountLockedNoticeWindowHours} per address.
   *
   * The rate limit is enforced against the mail-outbox rows themselves (a row of
   * this type for this recipient inside the window ⇒ skip), so repeated logins —
   * whether by the owner retrying or by an attacker holding the password — cannot
   * be amplified into a mail bomb, and no extra table is needed to remember it.
   *
   * Failures are swallowed: a mail-outbox hiccup must not convert the caller's
   * 401 into a 500, since that difference would itself signal account state.
   * Nothing identifying is logged beyond the userId already used elsewhere — no
   * email, no password, no lock reason.
   */
  private async notifyLockedAccountOwner(userId: string, email: string): Promise<void> {
    try {
      const since = new Date(Date.now() - this.accountLockedNoticeWindowHours * 60 * 60 * 1000);
      const alreadyNotified = await this.mailOutboxService.hasRecentAccountLockedNotice(
        email,
        since,
      );
      if (alreadyNotified) {
        return;
      }

      await this.mailOutboxService.enqueueAccountLockedNotice({
        to: email,
        supportUrl: `${this.storeClientUrl}/contact`,
      });

      this.logger.info(
        { event: 'user.lockedAccountLoginNotified', userId },
        'Locked-account login notice enqueued',
      );
    } catch (err) {
      this.logger.error(
        { event: 'user.lockedAccountLoginNotifyFailed', userId, err },
        'Failed to enqueue locked-account login notice',
      );
    }
  }

  /**
   * Spend a fixed amount of argon2 work on a branch that would otherwise do no
   * hashing at all, so its latency stays in the same ballpark as the branch that
   * does (`argon2.verify` on login, the full token+email path on password reset).
   * Without it, "no such account" answers back measurably faster than "wrong
   * password" — a timing oracle for account enumeration.
   *
   * The hash is deliberately discarded, and nothing about the account is logged.
   */
  private async burnTimingCost(): Promise<void> {
    await hashPassword(DUMMY_TIMING_PASSWORD);
  }

  /**
   * Parse a duration string like "7d", "15m", "2h" into milliseconds.
   */
  private parseExpirationToMs(expiration: string): number {
    const match = expiration.match(/^(\d+)([smhd])$/);
    if (!match) {
      // Default to 7 days if format is unexpected
      return 7 * 24 * 60 * 60 * 1000;
    }

    const value = parseInt(match[1], 10);
    const unit = match[2];

    switch (unit) {
      case 's':
        return value * 1000;
      case 'm':
        return value * 60 * 1000;
      case 'h':
        return value * 60 * 60 * 1000;
      case 'd':
        return value * 24 * 60 * 60 * 1000;
      default:
        return 7 * 24 * 60 * 60 * 1000;
    }
  }

  /**
   * Render a duration string like "1h"/"30m" into Ukrainian email copy
   * ("1 годину", "30 хвилин"), applying Ukrainian plural rules. Falls back to
   * the raw string if the format is unexpected.
   */
  private formatExpirationHuman(expiration: string): string {
    const match = expiration.match(/^(\d+)([smhd])$/);
    if (!match) {
      return expiration;
    }

    const value = parseInt(match[1], 10);
    // [one, few, many] forms per Ukrainian pluralization.
    const forms: Record<string, [string, string, string]> = {
      s: ['секунду', 'секунди', 'секунд'],
      m: ['хвилину', 'хвилини', 'хвилин'],
      h: ['годину', 'години', 'годин'],
      d: ['день', 'дні', 'днів'],
    };
    const [one, few, many] = forms[match[2]];

    const mod10 = value % 10;
    const mod100 = value % 100;
    let word = many;
    if (mod10 === 1 && mod100 !== 11) {
      word = one;
    } else if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
      word = few;
    }

    return `${value} ${word}`;
  }
}
