import { ExecutionContext, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthGuard } from '@nestjs/passport';
import { Observable } from 'rxjs';

/** Google sign-in is enabled only when both OAuth credentials are present. */
function isGoogleOAuthConfigured(config: ConfigService): boolean {
  return (
    Boolean(config.get<string>('GOOGLE_CLIENT_ID')) &&
    Boolean(config.get<string>('GOOGLE_CLIENT_SECRET'))
  );
}

/**
 * Guard for both Google OAuth routes (TASK-168).
 *
 * Config-presence gate: when GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET are unset
 * the routes answer 503 — mirroring the NovaPoshtaClient/NP_API_KEY graceful
 * degradation pattern — while the app boots normally (GoogleStrategy itself
 * always constructs, with inert placeholders; the guard is the real gate).
 */
@Injectable()
export class GoogleAuthGuard extends AuthGuard('google') {
  constructor(private readonly configService: ConfigService) {
    super();
  }

  canActivate(context: ExecutionContext): boolean | Promise<boolean> | Observable<boolean> {
    if (!isGoogleOAuthConfigured(this.configService)) {
      throw new ServiceUnavailableException('Google sign-in is not configured');
    }
    return super.canActivate(context);
  }

  /**
   * Never throws on a failed/denied Google auth (user clicked "Cancel", bad
   * or expired state, provider error) — instead of NestJS rendering a bare
   * JSON 401 mid top-level browser navigation, `request.user` is simply left
   * undefined and the callback HANDLER (not the guard) decides how to
   * redirect.
   */
  handleRequest<TUser = unknown>(_err: unknown, user: TUser): TUser {
    return user;
  }
}
