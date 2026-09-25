import {
  Controller,
  Get,
  Post,
  Body,
  Req,
  Res,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request, Response } from 'express';
import { Throttle } from '@nestjs/throttler';
import { FailClosedThrottle } from '../throttler';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiCookieAuth,
  ApiExcludeEndpoint,
  ApiExtraModels,
  ApiProperty,
} from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RequestPasswordResetDto } from './dto/request-password-reset.dto';
import { ConfirmPasswordResetDto } from './dto/confirm-password-reset.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ConfirmEmailVerificationDto } from './dto/confirm-email-verification.dto';
import { EmailChangeTokenDto, RequestEmailChangeDto } from './dto/email-change.dto';
import { EmailChangeService } from './email-change.service';
import { EmailVerificationService } from './email-verification.service';
import { JwtRefreshGuard } from './guards';
import { JwtAuthGuard } from './guards';
import { GoogleAuthGuard } from './guards';
import { CurrentUser } from './decorators';
import { AuthTokens } from './entities';
import { GoogleOAuthProfile } from './oauth/google-oauth-profile';
import { CART_TOKEN_COOKIE, buildCartTokenCookieOptions } from '../cart/cart-identity.types';
import {
  WISHLIST_TOKEN_COOKIE,
  buildWishlistTokenCookieOptions,
} from '../wishlist/wishlist-identity.types';
import {
  REFRESH_TOKEN_COOKIE,
  buildRefreshCookieOptions,
  expiredCookieOptions,
} from './auth-cookies';
import { GuestStateMergeService } from './guest-state-merge.service';
import { PermissionService, type EffectivePermissions } from './permissions';

/**
 * Response envelope for register / login / refresh.
 *
 * `@ApiProperty` is what makes it a contract (TASK-825): without it the class
 * reached Swagger with no properties at all, and Orval typed every one of these
 * responses as `{ [key: string]: unknown }`.
 */
class AuthResponseEnvelope {
  @ApiProperty({ type: AuthTokens })
  data!: AuthTokens;
}

/** A human-readable acknowledgement. */
class MessageResponse {
  @ApiProperty({ example: 'Logged out' })
  message!: string;
}

/**
 * Response envelope for routes that answer with a message only (TASK-825 — see
 * {@link AuthResponseEnvelope} for why the decorator matters).
 */
class MessageResponseEnvelope {
  @ApiProperty({ type: MessageResponse })
  data!: MessageResponse;
}

/**
 * What `POST /auth/email/verify/confirm` answers (TASK-485).
 *
 * Its own class rather than a field bolted onto the shared
 * {@link MessageResponseEnvelope}: that envelope is the return type of six other
 * routes, and widening it would put a meaningless `claimedOrders` on the
 * generated client type of every one of them.
 */
class EmailVerificationConfirmed {
  @ApiProperty({ example: 'Email address verified.' })
  message!: string;

  @ApiProperty({
    example: 2,
    description:
      'How many orders placed as a guest with this address were attached to the account. ' +
      '0 for anyone who never ordered as a guest, and on a second confirm — claiming is idempotent.',
  })
  claimedOrders!: number;
}

class EmailVerificationConfirmEnvelope {
  @ApiProperty({ type: EmailVerificationConfirmed })
  data!: EmailVerificationConfirmed;
}

/** One held permission with its display label (TASK-725). */
class PermissionEntryEntity {
  @ApiProperty({ example: 'orders:read' })
  key!: string;

  @ApiProperty({ example: 'Переглядати замовлення' })
  label!: string;
}

/** Effective-permission payload for `GET /auth/me/permissions` (TASK-334). */
class EffectivePermissionsEntity {
  @ApiProperty({ enum: UserRole, example: UserRole.MANAGER })
  role!: UserRole;

  @ApiProperty({
    example: false,
    description:
      'True for the ONE account that owns the shop. Gates the owner’s reserve in the UI — ' +
      'transferring ownership, appointing an admin, and any action on an admin’s account.',
  })
  isOwner!: boolean;

  @ApiProperty({
    example: false,
    description:
      'True for any ADMIN, owner or deputy: holds every permission in the catalogue without ' +
      'being granted one. Reported separately from isOwner (TASK-475) because a deputy sees ' +
      'every operational control and none of the owner’s reserve.',
  })
  isAdmin!: boolean;

  @ApiProperty({ type: [String], example: ['orders:read', 'products:write'] })
  permissions!: string[];

  @ApiProperty({
    type: [PermissionEntryEntity],
    description:
      'The same keys with their Ukrainian catalogue labels, in catalogue (zone) order — ' +
      'for the caller’s own profile screen (TASK-725). A key missing from the catalogue ' +
      'is labelled with the key itself.',
  })
  entries!: PermissionEntryEntity[];
}

class PermissionsResponseEnvelope {
  @ApiProperty({ type: EffectivePermissionsEntity })
  data!: EffectivePermissionsEntity;
}

@ApiTags('Auth')
@ApiExtraModels(
  AuthTokens,
  AuthResponseEnvelope,
  MessageResponse,
  MessageResponseEnvelope,
  PermissionEntryEntity,
  EffectivePermissionsEntity,
  PermissionsResponseEnvelope,
  // TASK-485: the confirm route's own envelope — it reports the guest orders it
  // attached, which no other message route has to say anything about.
  EmailVerificationConfirmed,
  EmailVerificationConfirmEnvelope,
)
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
    private readonly guestStateMerge: GuestStateMergeService,
    private readonly permissionService: PermissionService,
    private readonly emailVerificationService: EmailVerificationService,
    private readonly emailChangeService: EmailChangeService,
  ) {}

  /**
   * POST /api/auth/register
   *
   * Register a new user. Returns an access token in the response body
   * and sets the refresh token as an HttpOnly cookie.
   */
  @Post('register')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  // Account creation with no working limiter is a bulk-signup faucet (TASK-401).
  @FailClosedThrottle()
  @ApiOperation({
    summary: 'Register a new user (merges guest cart if cartToken cookie present)',
  })
  @ApiResponse({
    status: 201,
    description: 'User registered successfully',
    type: AuthResponseEnvelope,
  })
  @ApiResponse({ status: 400, description: 'Invalid input data' })
  @ApiResponse({ status: 409, description: 'Email already exists' })
  async register(
    @Body() dto: RegisterDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ data: AuthTokens }> {
    const tokens = await this.authService.register(dto);

    this.setRefreshCookie(response, tokens.refreshToken);
    await this.mergeGuestState(request, response, tokens.userId);

    return {
      data: { accessToken: tokens.accessToken },
    };
  }

  /**
   * POST /api/auth/login
   *
   * Authenticate an existing user. Returns an access token in the response body
   * and sets the refresh token as an HttpOnly cookie.
   */
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  // The one route where "the limiter is down" and "there is no brute-force
  // protection" are the same sentence. 503 beats unlimited password guessing;
  // the per-account lockout in AuthService is a second line, not a substitute
  // (it cannot see a spray across many accounts). TASK-401.
  @FailClosedThrottle()
  @ApiOperation({
    summary: 'Authenticate user (merges guest cart if cartToken cookie present)',
  })
  @ApiResponse({
    status: 200,
    description: 'Login successful',
    type: AuthResponseEnvelope,
  })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  async login(
    @Body() dto: LoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ data: AuthTokens }> {
    const tokens = await this.authService.login(dto.email, dto.password);

    this.setRefreshCookie(response, tokens.refreshToken);
    await this.mergeGuestState(request, response, tokens.userId);

    return {
      data: { accessToken: tokens.accessToken },
    };
  }

  /**
   * POST /api/auth/password-reset/request
   *
   * Begin a password reset. Always responds 200 with a generic message —
   * whether or not the email belongs to an account — so the endpoint cannot be
   * used to enumerate registered accounts (existence-hiding). Public.
   */
  @Post('password-reset/request')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  // Uncapped, this mails an arbitrary address on demand — an account-enumeration
  // oracle by timing and a way to have us spam a stranger's inbox (TASK-401).
  @FailClosedThrottle()
  @ApiOperation({ summary: 'Request a password-reset link (existence-hiding, always 200)' })
  @ApiResponse({
    status: 200,
    description: 'Generic acknowledgement (identical for existing and unknown emails)',
    type: MessageResponseEnvelope,
  })
  @ApiResponse({ status: 400, description: 'Invalid email' })
  async requestPasswordReset(
    @Body() dto: RequestPasswordResetDto,
  ): Promise<{ data: MessageResponse }> {
    await this.authService.requestPasswordReset(dto.email);

    return {
      data: {
        message: 'If an account with that email exists, a password reset link has been sent.',
      },
    };
  }

  /**
   * POST /api/auth/password-reset/confirm
   *
   * Complete a password reset with a single-use token + new password. Any
   * invalid/used/expired/deactivated-owner token yields the same generic 401 so
   * token/account state is never revealed. On success every refresh token for
   * the user is revoked (forced re-login everywhere). Public.
   */
  @Post('password-reset/confirm')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  // Fail CLOSED for UNIFORMITY (TASK-493, owner decision B-11 2026-09-23) — NOT
  // as a brute-force defence: the reset token is 256-bit, so guessing it is
  // hopeless with or without a limiter. The rule is simply that every
  // unauthenticated action that mutates an account is fail-closed, so nobody has
  // to re-argue it route by route. The named exceptions are `POST auth/refresh`
  // (fail-closed there would log everyone out during a Redis blip) and the
  // LiqPay callback (a 503 makes the provider give up on payments we took).
  // Pinned by `src/throttler/fail-closed-routes.spec.ts`.
  @FailClosedThrottle()
  @ApiOperation({ summary: 'Confirm a password reset with a single-use token' })
  @ApiResponse({
    status: 200,
    description: 'Password updated; all sessions revoked',
    type: MessageResponseEnvelope,
  })
  @ApiResponse({ status: 400, description: 'Invalid input (weak password / missing fields)' })
  @ApiResponse({ status: 401, description: 'Invalid or expired reset token' })
  async confirmPasswordReset(
    @Body() dto: ConfirmPasswordResetDto,
  ): Promise<{ data: MessageResponse }> {
    await this.authService.confirmPasswordReset(dto.token, dto.newPassword);

    return {
      data: { message: 'Password has been reset successfully.' },
    };
  }

  /**
   * POST /api/auth/password/change (TASK-333)
   *
   * Change the signed-in user's own password. ONE endpoint for both frontends —
   * the storefront `/account` screen and the admin panel — because the mechanism
   * is identical and a second copy is a second place to forget the session
   * revocation.
   *
   * Requires the current password (a stolen access token alone must not be
   * enough to take an account over permanently). On success every refresh token
   * is revoked, so the refresh cookie is cleared here too: leaving a
   * now-revoked cookie in the browser buys nothing and turns the next silent
   * refresh into a confusing 401.
   */
  @Post('password/change')
  @HttpCode(HttpStatus.OK)
  // Same budget as the reset-confirm route: this is a credential-checking
  // surface (it verifies `currentPassword`), so it must not become a place to
  // guess passwords at an unlimited rate with a stolen token.
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Change your own password (requires the current one)' })
  @ApiResponse({
    status: 200,
    description: 'Password updated; all other sessions revoked',
    type: MessageResponseEnvelope,
  })
  @ApiResponse({ status: 400, description: 'Invalid input (weak new password / missing fields)' })
  @ApiResponse({ status: 401, description: 'Not signed in, or the current password is wrong' })
  async changePassword(
    @CurrentUser('id') userId: string,
    @Body() dto: ChangePasswordDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ data: MessageResponse }> {
    await this.authService.changePassword(userId, dto.currentPassword, dto.newPassword);

    this.clearRefreshCookie(response);

    return {
      data: { message: 'Password has been changed successfully.' },
    };
  }

  /**
   * POST /api/auth/refresh
   *
   * Rotate the refresh token. Expects a valid refresh token in the cookie.
   * Returns a new access token and sets a new refresh token cookie.
   * The raw token is extracted by JwtRefreshStrategy and passed via request.user.
   */
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  // Looser than login/register: both frontends call refresh on every page load
  // (twice under dev StrictMode), so 5/min turned a burst of reloads into a
  // spurious 429 → forced logout (fix/196). Possession of the HttpOnly cookie +
  // CSRF token guards this route — it is not a credential-guessing surface.
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  // Deliberately NOT @FailClosedThrottle() — the named exception to the
  // "unauthenticated account writes fail closed" rule (TASK-493 / B-11): every
  // page load refreshes, so a 503 here during a Redis blip would log everyone out.
  @UseGuards(JwtRefreshGuard)
  @ApiCookieAuth('refresh-token')
  @ApiOperation({ summary: 'Refresh access token' })
  @ApiResponse({
    status: 200,
    description: 'Token refreshed successfully',
    type: AuthResponseEnvelope,
  })
  @ApiResponse({ status: 401, description: 'Invalid or expired refresh token' })
  async refresh(
    // The refresh token alone identifies the session — AuthService resolves
    // its owner from the stored row. The `@CurrentUser('id')` that used to sit
    // here was never read (TASK-815).
    @CurrentUser('refreshToken') refreshToken: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ data: AuthTokens }> {
    const tokens = await this.authService.refreshToken(refreshToken);

    this.setRefreshCookie(response, tokens.refreshToken);

    return {
      data: { accessToken: tokens.accessToken },
    };
  }

  /**
   * POST /api/auth/logout
   *
   * Revoke all refresh tokens for the authenticated user and clear the cookie.
   */
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Logout user' })
  @ApiResponse({
    status: 200,
    description: 'Logged out successfully',
    type: MessageResponseEnvelope,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async logout(
    @CurrentUser('id') userId: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ data: MessageResponse }> {
    await this.authService.logout(userId);

    this.clearRefreshCookie(response);

    return {
      data: { message: 'Logged out' },
    };
  }

  /**
   * POST /api/auth/email/verify/request (TASK-342)
   *
   * Send a verification link to the signed-in user's current address. Always
   * 200 with the same generic message — for an already-verified account, a
   * banned one, or a missing one — so the response cannot be used to probe
   * account state, and so hammering it cannot be turned into a mail sprayer.
   */
  @Post('email/verify/request')
  @HttpCode(HttpStatus.OK)
  // Tighter than most: every accepted call sends a real email to a real inbox.
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Send a verification link to your own email address' })
  @ApiResponse({
    status: 200,
    description: 'Generic acknowledgement (identical whatever the account state)',
    type: MessageResponseEnvelope,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async requestEmailVerification(
    @CurrentUser('id') userId: string,
  ): Promise<{ data: MessageResponse }> {
    await this.emailVerificationService.requestVerification(userId);

    return {
      data: { message: 'If the address still needs verifying, a link has been sent.' },
    };
  }

  /**
   * POST /api/auth/email/verify/confirm (TASK-342)
   *
   * Complete verification with a single-use token. PUBLIC: the click arrives
   * from an email client that carries no session, and requiring one would break
   * the flow for anyone who opens their mail on a different device.
   *
   * The token proves ONE address, recorded on the token itself. If the account
   * has changed address since the link was issued, the proof does not transfer
   * and the request is refused.
   */
  @Post('email/verify/confirm')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  // Fail CLOSED (review of plan 180). TASK-485 changed what this route does:
  // it no longer flips a boolean, it moves another party's orders — with their
  // phone, address and totals — onto the account holding the token. That is the
  // decorator's stated criterion: an unauthenticated write whose only defence IS
  // the limiter. Every sibling public write on this controller already has it.
  @FailClosedThrottle()
  @ApiOperation({ summary: 'Confirm an email address with a single-use token' })
  @ApiResponse({
    status: 200,
    description: 'Address verified; `claimedOrders` counts guest orders moved onto the account',
    type: EmailVerificationConfirmEnvelope,
  })
  @ApiResponse({ status: 400, description: 'Invalid, used, expired or superseded token' })
  async confirmEmailVerification(
    @Body() dto: ConfirmEmailVerificationDto,
  ): Promise<{ data: EmailVerificationConfirmed }> {
    // TASK-485: proving the address is what makes earlier guest orders provably
    // this person's, so they are attached here. The count is reported so the
    // storefront can say what happened instead of silently growing the list.
    const { claimedOrders } = await this.emailVerificationService.confirm(dto.token);

    return {
      data: { message: 'Email address verified.', claimedOrders },
    };
  }

  /**
   * POST /api/auth/email-change/request (TASK-396)
   *
   * Ask to sign in with a different address. Requires the current password; the
   * login does NOT change here — a link goes to the new address, and a warning
   * with a revert link goes to the current one.
   */
  @Post('email-change/request')
  @HttpCode(HttpStatus.OK)
  // Every accepted call sends TWO real emails, and it checks a password.
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Request a change of the sign-in email (requires the current password)',
    operationId: 'requestEmailChange',
  })
  @ApiResponse({
    status: 200,
    description: 'Confirmation link sent to the new address; notice sent to the current one',
    type: MessageResponseEnvelope,
  })
  @ApiResponse({ status: 400, description: 'Invalid address, or the address you already have' })
  @ApiResponse({ status: 401, description: 'Not signed in, or the current password is wrong' })
  @ApiResponse({ status: 409, description: 'The address belongs to another account' })
  async requestEmailChange(
    @CurrentUser('id') userId: string,
    @Body() dto: RequestEmailChangeDto,
  ): Promise<{ data: MessageResponse }> {
    await this.emailChangeService.requestChange(userId, dto.newEmail, dto.currentPassword);

    return {
      data: {
        message: 'A confirmation link has been sent to the new address.',
      },
    };
  }

  /**
   * POST /api/auth/email-change/confirm (TASK-396)
   *
   * Apply the change from the link in the NEW inbox. Public — the click carries
   * no session. Every session ends, so the refresh cookie is cleared too.
   */
  @Post('email-change/confirm')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  // An unauthenticated write that changes a login: fail closed (TASK-493 rule).
  @FailClosedThrottle()
  @ApiOperation({
    summary: 'Confirm a change of the sign-in email with the emailed token',
    operationId: 'confirmEmailChange',
  })
  @ApiResponse({
    status: 200,
    description: 'The new address is the login; all sessions were signed out',
    type: MessageResponseEnvelope,
  })
  @ApiResponse({ status: 400, description: 'Invalid, used, expired or superseded link' })
  @ApiResponse({ status: 409, description: 'The address was registered by someone else meanwhile' })
  async confirmEmailChange(
    @Body() dto: EmailChangeTokenDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ data: MessageResponse }> {
    await this.emailChangeService.confirmChange(dto.token);

    this.clearRefreshCookie(response);

    return { data: { message: 'Email address changed. Please sign in again.' } };
  }

  /**
   * POST /api/auth/email-change/revert (TASK-396)
   *
   * "This wasn't me" — from the link in the OLD inbox. Cancels a pending change
   * or restores the old address, and signs every session out. Public.
   */
  @Post('email-change/revert')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @FailClosedThrottle()
  @ApiOperation({
    summary: 'Undo a change of the sign-in email from the link sent to the old address',
    operationId: 'revertEmailChange',
  })
  @ApiResponse({
    status: 200,
    description: 'The old address is the login again; all sessions were signed out',
    type: MessageResponseEnvelope,
  })
  @ApiResponse({ status: 400, description: 'Invalid, used or expired link' })
  @ApiResponse({ status: 409, description: 'The old address now belongs to another account' })
  async revertEmailChange(
    @Body() dto: EmailChangeTokenDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ data: MessageResponse }> {
    await this.emailChangeService.revertChange(dto.token);

    this.clearRefreshCookie(response);

    return {
      data: { message: 'The change was undone and every session signed out.' },
    };
  }

  /**
   * GET /api/auth/me/permissions (TASK-334)
   *
   * What the signed-in caller may actually do — the admin frontend's single
   * source of truth for which nav items, dashboard tiles and row actions to
   * render.
   *
   * Deliberately NOT derived from the JWT the frontend already holds: the role
   * in that token is a 15-minute-old snapshot, and the whole point of this
   * design is that a permission revoked a moment ago is gone now. Any
   * authenticated user may call it; a shopper simply gets an empty list.
   *
   * A hidden menu is a convenience, never a security boundary — the server
   * guard is what actually protects the data. This endpoint exists so the two
   * agree, not so one can replace the other.
   */
  @Get('me/permissions')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Effective permissions of the signed-in user (resolved from the database)',
    operationId: 'getMyPermissions',
  })
  @ApiResponse({
    status: 200,
    description: 'Effective permissions',
    type: PermissionsResponseEnvelope,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getMyPermissions(
    @CurrentUser('id') userId: string,
  ): Promise<{ data: EffectivePermissions }> {
    return { data: await this.permissionService.getEffectivePermissions(userId) };
  }

  /**
   * GET /api/auth/google (TASK-168)
   *
   * Leg 1 of the Google OAuth redirect flow: a plain browser navigation that
   * 302s to Google's consent screen (503 when Google credentials are not
   * configured — see GoogleAuthGuard). Excluded from Swagger: it is a pure
   * redirect endpoint, never called via fetch/axios/Orval.
   */
  @Get('google')
  @UseGuards(GoogleAuthGuard)
  @ApiExcludeEndpoint()
  googleAuth(): void {
    // The guard performs the redirect to Google as a side effect
    // (passport-oauth2's standard "no code param yet → res.redirect(
    // authorizationURL)" behavior). This body never runs for a well-formed
    // request.
  }

  /**
   * GET /api/auth/google/callback (TASK-168)
   *
   * Leg 2: Google redirects back here. On success the refresh cookie is set
   * and guest cart/wishlist are merged — the exact same helpers the password
   * login uses — then the browser is 302'd to the state-carried same-origin
   * redirect target. NO token ever appears in any URL: the redirected-to page
   * picks the session up via the existing bootstrap-refresh flow.
   *
   * Every failure — Google-side denial (no profile), unverified email, locked
   * account — funnels to the single fixed `/login?oauthError=1` target with
   * no reason code (TASK-274 generic-refusal policy).
   *
   * Uses @Res() WITHOUT `passthrough: true` (deliberate deviation from every
   * other handler here): these two routes are pure redirects and must fully
   * own the response.
   */
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
      // Google denied/cancelled, or the guard saw no user (bad/expired state,
      // provider error). Fixed failure target — the login page already has
      // the TASK-287 support-link escape hatch.
      response.redirect(302, `${storeClientUrl}/login?oauthError=1`);
      return;
    }

    try {
      const tokens = await this.authService.loginWithGoogleProfile(profile);

      this.setRefreshCookie(response, tokens.refreshToken);
      await this.mergeGuestState(request, response, tokens.userId);

      response.redirect(302, `${storeClientUrl}${profile.redirect}`);
    } catch {
      // Every AuthService rejection (unverified email, locked account)
      // funnels here — same generic failure target as the !profile branch.
      response.redirect(302, `${storeClientUrl}/login?oauthError=1`);
    }
  }

  /**
   * Set the refresh token as an HttpOnly cookie on the response, scoped to the
   * one route that reads it.
   */
  private setRefreshCookie(response: Response, refreshToken: string): void {
    response.cookie(
      REFRESH_TOKEN_COOKIE,
      refreshToken,
      // Max-Age = the token's own lifetime (TASK-789), never a constant.
      buildRefreshCookieOptions(this.isProduction(), this.authService.refreshTokenTtlMs),
    );
  }

  /** Expire the refresh cookie with the same attributes it was set with. */
  private clearRefreshCookie(response: Response): void {
    response.cookie(
      REFRESH_TOKEN_COOKIE,
      '',
      expiredCookieOptions(buildRefreshCookieOptions(this.isProduction(), 0)),
    );
  }

  /**
   * Hand the request's guest cart and wishlist to {@link GuestStateMergeService}
   * and drop the cookie of each collection that actually merged (TASK-824).
   *
   * Only the HTTP half lives here — reading the cookies and clearing them. The
   * merge itself, and the rule that a failure never blocks sign-in, belong to
   * the service. A cookie is cleared ONLY for a merge that succeeded, so a
   * failed merge leaves the guest token in the browser for the next sign-in.
   *
   * Each guest cookie is expired with the options its own interceptor SET it
   * with, so the clear cannot drift from the set.
   *
   * `userId` comes from AuthService with the tokens (TASK-792) — not from
   * decoding the access token just minted, which is how an empty decode used to
   * clear the guest cookies without merging anything.
   */
  private async mergeGuestState(
    request: Request,
    response: Response,
    userId: string,
  ): Promise<void> {
    const cartToken: string | undefined = request.cookies?.[CART_TOKEN_COOKIE];
    const wishlistToken: string | undefined = request.cookies?.[WISHLIST_TOKEN_COOKIE];

    if (!cartToken && !wishlistToken) {
      return;
    }

    const { cartMerged, wishlistMerged } = await this.guestStateMerge.mergeInto(userId, {
      cartToken,
      wishlistToken,
    });

    if (cartMerged) {
      response.cookie(
        CART_TOKEN_COOKIE,
        '',
        expiredCookieOptions(buildCartTokenCookieOptions(this.isProduction())),
      );
    }

    if (wishlistMerged) {
      response.cookie(
        WISHLIST_TOKEN_COOKIE,
        '',
        expiredCookieOptions(buildWishlistTokenCookieOptions(this.isProduction())),
      );
    }
  }

  // A method, not a getter: route-discovery specs walk the prototype and would
  // invoke a getter on an instance-less prototype.
  private isProduction(): boolean {
    return this.configService.get<string>('NODE_ENV') === 'production';
  }
}
