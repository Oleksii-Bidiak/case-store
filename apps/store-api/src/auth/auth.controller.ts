import { Controller, Post, Body, Res, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Response } from 'express';
import { Throttle } from '@nestjs/throttler';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiCookieAuth } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { JwtRefreshGuard } from './guards';
import { JwtAuthGuard } from './guards';
import { CurrentUser } from './decorators';

/**
 * Response envelope types for consistent API responses.
 */
interface AuthResponse {
  accessToken: string;
}

interface MessageResponse {
  message: string;
}

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * POST /api/auth/register
   *
   * Register a new user. Returns an access token in the response body
   * and sets the refresh token as an HttpOnly cookie.
   */
  @Post('register')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({ summary: 'Register a new user' })
  @ApiResponse({ status: 201, description: 'User registered successfully' })
  @ApiResponse({ status: 400, description: 'Invalid input data' })
  @ApiResponse({ status: 409, description: 'Email already exists' })
  async register(
    @Body() dto: RegisterDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ data: AuthResponse }> {
    const tokens = await this.authService.register(dto);

    this.setRefreshCookie(response, tokens.refreshToken);

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
  @ApiOperation({ summary: 'Authenticate user' })
  @ApiResponse({ status: 200, description: 'Login successful' })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ data: AuthResponse }> {
    const tokens = await this.authService.login(dto.email, dto.password);

    this.setRefreshCookie(response, tokens.refreshToken);

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
  @ApiResponse({ status: 200, description: 'Token refreshed successfully' })
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
  @ApiResponse({ status: 200, description: 'Logged out successfully' })
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
}
