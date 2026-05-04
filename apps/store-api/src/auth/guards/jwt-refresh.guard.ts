import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Guard that protects the refresh token endpoint.
 * Uses the 'jwt-refresh' Passport strategy to validate the
 * refreshToken cookie.
 *
 * Usage: @UseGuards(JwtRefreshGuard)
 */
@Injectable()
export class JwtRefreshGuard extends AuthGuard('jwt-refresh') {}
