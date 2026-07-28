import { Module } from '@nestjs/common';
import { JwtModule, type JwtSignOptions } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthRepository } from './auth.repository';
import { AuthService } from './auth.service';
import { EmailVerificationService } from './email-verification.service';
import { AuthController } from './auth.controller';
import { RefreshTokenCleanupService } from './refresh-token-cleanup.service';
import { JwtAccessStrategy, JwtRefreshStrategy, GoogleStrategy } from './strategies';
import { GoogleAuthGuard } from './guards';
import { GoogleOAuthStateStore } from './oauth/google-oauth-state.store';
import { CartModule } from '../cart/cart.module';
import { WishlistModule } from '../wishlist/wishlist.module';

@Module({
  imports: [
    // JwtModule configured globally with async factory reading from ConfigService.
    // Note: AuthService signs tokens with explicit secret/expiresIn per call,
    // so this global config is primarily used by Passport JWT strategies.
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.getOrThrow<string>('JWT_SECRET'),
        signOptions: {
          // TASK-304: since @nestjs/jwt 11 (jsonwebtoken 9) `expiresIn` is typed
          // `number | ms.StringValue`, where StringValue is a template-literal
          // union such as `${number}m`. A value read from the environment at
          // runtime can never be narrowed to that statically, so the cast is
          // unavoidable; the format itself is validated at boot by
          // config/env.validation.ts.
          expiresIn: configService.get<string>(
            'JWT_EXPIRATION',
            '15m',
          ) as JwtSignOptions['expiresIn'],
        },
      }),
      global: true,
    }),
    // Provides CartService so login/register can merge a guest cart.
    CartModule,
    // Provides WishlistService so login/register can merge a guest wishlist.
    WishlistModule,
  ],
  controllers: [AuthController],
  providers: [
    AuthRepository,
    AuthService,
    EmailVerificationService,
    RefreshTokenCleanupService,
    JwtAccessStrategy,
    JwtRefreshStrategy,
    // Google OAuth (TASK-168). GoogleStrategy always constructs (inert
    // placeholders when unconfigured); GoogleAuthGuard 503s both routes when
    // GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET are absent.
    GoogleOAuthStateStore,
    GoogleStrategy,
    GoogleAuthGuard,
  ],
  exports: [AuthRepository, AuthService, EmailVerificationService],
})
export class AuthModule {}
