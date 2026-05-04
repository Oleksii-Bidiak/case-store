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
 * Attaches { id, role } to request.user.
 */
@Injectable()
export class JwtRefreshStrategy extends PassportStrategy(Strategy, 'jwt-refresh') {
  constructor(configService: ConfigService) {
    super({
      jwtFromRequest: (req: Request): string | null => {
        if (req && req.cookies && typeof req.cookies.refreshToken === 'string') {
          return req.cookies.refreshToken;
        }
        return null;
      },
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_REFRESH_SECRET', 'dev-refresh-secret'),
      passReqToCallback: false,
    });
  }

  /**
   * Called automatically when a valid JWT is decoded.
   * Validates that the token is a refresh token (type: 'refresh').
   * Returns the object that will be set as request.user.
   */
  validate(payload: { sub: string; type: string; role?: string }): { id: string; role: string } {
    if (payload.type !== 'refresh') {
      throw new UnauthorizedException('Invalid token type');
    }

    return { id: payload.sub, role: payload.role ?? 'CUSTOMER' };
  }
}
