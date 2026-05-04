import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Guard that protects endpoints requiring a valid JWT access token.
 * Uses the 'jwt-access' Passport strategy to validate the
 * Authorization: Bearer <token> header.
 *
 * Usage: @UseGuards(JwtAuthGuard)
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt-access') {}
