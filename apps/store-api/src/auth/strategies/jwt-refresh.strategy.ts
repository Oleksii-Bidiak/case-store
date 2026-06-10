import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-jwt';
import { Request } from 'express';

/**
 * JWT Refresh Token Strategy.
 *
 * Extracts the token from the refreshToken cookie,
 * validates it using JWT_REFRESH_SECRET, and checks that
 * the payload contains type: 'refresh'.
 * Attaches { id, role, refreshToken } to request.user.
 * The raw refreshToken is included so the controller can pass
 * it to the service for hash-based database lookup.
 */
@Injectable()
export class JwtRefreshStrategy extends PassportStrategy(Strategy, 'jwt-refresh') {
  constructor(configService: ConfigService) {
    super({
      jwtFromRequest: (req: Request): string | null => {
        if (req && req.cookies && typeof req.cookies.refreshToken === 'string') {
          // Store the raw token on the request so it's available in validate()
          req._refreshToken = req.cookies.refreshToken;
          return req.cookies.refreshToken;
        }
        return null;
      },
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
      passReqToCallback: true,
    });
  }

  /**
   * Called automatically when a valid JWT is decoded.
   * Validates that the token is a refresh token (type: 'refresh').
   * Returns the object that will be set as request.user.
   *
   * The raw token is included so the controller can pass it to
   * AuthService.refreshToken() for hash-based lookup in the database.
   */
  validate(
    req: Request,
    payload: { sub: string; type: string; role: string },
  ): {
    id: string;
    role: string;
    refreshToken: string;
  } {
    if (payload.type !== 'refresh') {
      throw new UnauthorizedException('Invalid token type');
    }

    const refreshToken = req._refreshToken;
    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token not found in request');
    }

    return { id: payload.sub, role: payload.role, refreshToken };
  }
}

// Extend Express Request type to include the internal refreshToken property
declare module 'express' {
  interface Request {
    _refreshToken?: string;
  }
}
