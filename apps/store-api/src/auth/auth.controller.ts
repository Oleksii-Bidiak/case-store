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
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
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
  getSchemaPath,
} from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RequestPasswordResetDto } from './dto/request-password-reset.dto';
import { ConfirmPasswordResetDto } from './dto/confirm-password-reset.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ConfirmEmailVerificationDto } from './dto/confirm-email-verification.dto';
import { EmailVerificationService } from './email-verification.service';
import { JwtRefreshGuard } from './guards';
import { JwtAuthGuard } from './guards';
import { GoogleAuthGuard } from './guards';
import { CurrentUser } from './decorators';
import { AuthTokens } from './entities';
import { GoogleOAuthProfile } from './oauth/google-oauth-profile';
import { CartService } from '../cart/cart.service';
import { CART_TOKEN_COOKIE } from '../cart/cart-identity.types';
import { WishlistService } from '../wishlist/wishlist.service';
import { WISHLIST_TOKEN_COOKIE } from '../wishlist/wishlist-identity.types';
import { PermissionService, type EffectivePermissions } from './permissions';

/**
 * Response envelope for auth operations.
 */
class AuthResponseEnvelope {
  data!: { accessToken: string };
}

/**
 * Response envelope for message operations.
 */
class MessageResponseEnvelope {
  data!: { message: string };
}

/** Effective-permission payload for `GET /auth/me/permissions` (TASK-334). */
class EffectivePermissionsEntity {
  @ApiProperty({ enum: UserRole, example: UserRole.MANAGER })
  role!: UserRole;

  @ApiProperty({
    example: false,
    description: 'True for ADMIN — the owner, who always holds every permission',
  })
  isOwner!: boolean;

  @ApiProperty({ type: [String], example: ['orders:read', 'products:write'] })
  permissions!: string[];
}

class PermissionsResponseEnvelope {
  @ApiProperty({ type: EffectivePermissionsEntity })
  data!: EffectivePermissionsEntity;
}

/**
 * Type aliases for controller return types.
 */
type AuthResponse = { accessToken: string };
type MessageResponse = { message: string };

@ApiTags('Auth')
@ApiExtraModels(
  AuthTokens,
  AuthResponseEnvelope,
  MessageResponseEnvelope,
  EffectivePermissionsEntity,
  PermissionsResponseEnvelope,
)
@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
    private readonly cartService: CartService,
    private readonly wishlistService: WishlistService,
    private readonly permissionService: PermissionService,
    private readonly emailVerificationService: EmailVerificationService,
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
    schema: {
      allOf: [
        { $ref: getSchemaPath(AuthResponseEnvelope) },
        { properties: { data: { $ref: getSchemaPath(AuthTokens) } } },
      ],
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid input data' })
  @ApiResponse({ status: 409, description: 'Email already exists' })
  async register(
    @Body() dto: RegisterDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ data: AuthResponse }> {
    const tokens = await this.authService.register(dto);

    this.setRefreshCookie(response, tokens.refreshToken);
    await this.mergeGuestCartIfPresent(request, response, tokens.accessToken);
    await this.mergeGuestWishlistIfPresent(request, response, tokens.accessToken);

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
    schema: {
      allOf: [
        { $ref: getSchemaPath(AuthResponseEnvelope) },
        { properties: { data: { $ref: getSchemaPath(AuthTokens) } } },
      ],
    },
  })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  async login(
    @Body() dto: LoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ data: AuthResponse }> {
    const tokens = await this.authService.login(dto.email, dto.password);

    this.setRefreshCookie(response, tokens.refreshToken);
    await this.mergeGuestCartIfPresent(request, response, tokens.accessToken);
    await this.mergeGuestWishlistIfPresent(request, response, tokens.accessToken);

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
  @UseGuards(JwtRefreshGuard)
  @ApiCookieAuth('refresh-token')
  @ApiOperation({ summary: 'Refresh access token' })
  @ApiResponse({
    status: 200,
    description: 'Token refreshed successfully',
    schema: {
      allOf: [
        { $ref: getSchemaPath(AuthResponseEnvelope) },
        { properties: { data: { $ref: getSchemaPath(AuthTokens) } } },
      ],
    },
  })
  @ApiResponse({ status: 401, description: 'Invalid or expired refresh token' })
  async refresh(
    @CurrentUser('id') userId: string,
    @CurrentUser('refreshToken') refreshToken: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ data: AuthResponse }> {
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
  @ApiOperation({ summary: 'Confirm an email address with a single-use token' })
  @ApiResponse({ status: 200, description: 'Address verified', type: MessageResponseEnvelope })
  @ApiResponse({ status: 400, description: 'Invalid, used, expired or superseded token' })
  async confirmEmailVerification(
    @Body() dto: ConfirmEmailVerificationDto,
  ): Promise<{ data: MessageResponse }> {
    await this.emailVerificationService.confirm(dto.token);

    return {
      data: { message: 'Email address verified.' },
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
      await this.mergeGuestCartIfPresent(request, response, tokens.accessToken);
      await this.mergeGuestWishlistIfPresent(request, response, tokens.accessToken);

      response.redirect(302, `${storeClientUrl}${profile.redirect}`);
    } catch {
      // Every AuthService rejection (unverified email, locked account)
      // funnels here — same generic failure target as the !profile branch.
      response.redirect(302, `${storeClientUrl}/login?oauthError=1`);
    }
  }

  /**
   * Set the refresh token as an HttpOnly cookie on the response.
   * Cookie is scoped to /api/auth/refresh path so it's only sent on refresh requests.
   */
  private setRefreshCookie(response: Response, refreshToken: string): void {
    const isProduction = this.configService.get<string>('NODE_ENV') === 'production';

    response.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'strict',
      path: '/api/auth/refresh',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in milliseconds
    });
  }

  /**
   * Clear the refresh token cookie by setting it with an expired maxAge.
   */
  private clearRefreshCookie(response: Response): void {
    const isProduction = this.configService.get<string>('NODE_ENV') === 'production';

    response.cookie('refreshToken', '', {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'strict',
      path: '/api/auth/refresh',
      maxAge: 0,
    });
  }

  /**
   * If the request carries a guest `cartToken` cookie, merge that guest cart
   * into the authenticated user's cart and clear the cookie. The user ID is
   * read from the freshly-signed access token's `sub` claim.
   *
   * A merge failure must never block authentication — errors are logged and
   * swallowed. The guest cookie is cleared ONLY after a successful merge, so a
   * transient failure leaves the guest cart intact and the merge can be retried
   * on the next authenticated request.
   */
  private async mergeGuestCartIfPresent(
    request: Request,
    response: Response,
    accessToken: string,
  ): Promise<void> {
    const cartToken: string | undefined = request.cookies?.[CART_TOKEN_COOKIE];

    if (!cartToken) {
      return;
    }

    try {
      const payload = this.jwtService.decode(accessToken) as { sub?: string } | null;
      const userId = payload?.sub;

      if (userId) {
        await this.cartService.mergeGuestCart(cartToken, userId);
      }

      // Clear the guest cookie only on success — never in a finally block —
      // so a failed merge does not discard the guest cart token.
      this.clearCartTokenCookie(response);
    } catch (error) {
      this.logger.error('Guest cart merge on authentication failed', error as Error);
    }
  }

  /**
   * Clear the guest cart token cookie after a successful merge.
   */
  private clearCartTokenCookie(response: Response): void {
    const isProduction = this.configService.get<string>('NODE_ENV') === 'production';

    response.cookie(CART_TOKEN_COOKIE, '', {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'strict',
      path: '/api',
      maxAge: 0,
    });
  }

  /**
   * If the request carries a guest `wishlistToken` cookie, merge that guest
   * wishlist into the authenticated user's wishlist and clear the cookie. The
   * user ID is read from the freshly-signed access token's `sub` claim.
   *
   * Sibling of {@link mergeGuestCartIfPresent} — same defensive contract: a
   * merge failure must never block authentication (errors are logged and
   * swallowed), and the guest cookie is cleared ONLY after a successful merge so
   * a transient failure leaves the guest wishlist intact for a later retry.
   */
  private async mergeGuestWishlistIfPresent(
    request: Request,
    response: Response,
    accessToken: string,
  ): Promise<void> {
    const wishlistToken: string | undefined = request.cookies?.[WISHLIST_TOKEN_COOKIE];

    if (!wishlistToken) {
      return;
    }

    try {
      const payload = this.jwtService.decode(accessToken) as { sub?: string } | null;
      const userId = payload?.sub;

      if (userId) {
        await this.wishlistService.mergeGuestWishlist(wishlistToken, userId);
      }

      // Clear the guest cookie only on success — never in a finally block.
      this.clearWishlistTokenCookie(response);
    } catch (error) {
      this.logger.error('Guest wishlist merge on authentication failed', error as Error);
    }
  }

  /**
   * Clear the guest wishlist token cookie after a successful merge.
   */
  private clearWishlistTokenCookie(response: Response): void {
    const isProduction = this.configService.get<string>('NODE_ENV') === 'production';

    response.cookie(WISHLIST_TOKEN_COOKIE, '', {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'strict',
      path: '/api',
      maxAge: 0,
    });
  }
}
