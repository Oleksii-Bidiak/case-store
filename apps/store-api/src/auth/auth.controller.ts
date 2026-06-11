import {
  Controller,
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
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiCookieAuth,
  ApiExtraModels,
  getSchemaPath,
} from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { JwtRefreshGuard } from './guards';
import { JwtAuthGuard } from './guards';
import { CurrentUser } from './decorators';
import { AuthTokens } from './entities';
import { CartService } from '../cart/cart.service';
import { CART_TOKEN_COOKIE } from '../cart/cart-identity.types';

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

/**
 * Type aliases for controller return types.
 */
type AuthResponse = { accessToken: string };
type MessageResponse = { message: string };

@ApiTags('Auth')
@ApiExtraModels(AuthTokens, AuthResponseEnvelope, MessageResponseEnvelope)
@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
    private readonly cartService: CartService,
  ) {}

  /**
   * POST /api/auth/register
   *
   * Register a new user. Returns an access token in the response body
   * and sets the refresh token as an HttpOnly cookie.
   */
  @Post('register')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
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

    return {
      data: { accessToken: tokens.accessToken },
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
}
