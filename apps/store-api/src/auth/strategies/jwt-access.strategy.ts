import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

/**
 * JWT Access Token Strategy.
 *
 * Extracts the token from the Authorization: Bearer header,
 * validates it using JWT_SECRET, and attaches { id, role }
 * to request.user.
 */
@Injectable()
export class JwtAccessStrategy extends PassportStrategy(Strategy, 'jwt-access') {
  constructor(configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET', 'dev-secret'),
    });
  }

  /**
   * Called automatically when a valid JWT is decoded.
   * The payload is the decoded token content: { sub, role, iat, exp }.
   * Returns the object that will be set as request.user.
   */
  validate(payload: { sub: string; role: string }): { id: string; role: string } {
    return { id: payload.sub, role: payload.role };
  }
}
