import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthRepository } from './auth.repository';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtAccessStrategy, JwtRefreshStrategy } from './strategies';
import { CartModule } from '../cart/cart.module';

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
          expiresIn: configService.get<string>('JWT_EXPIRATION', '15m'),
        },
      }),
      global: true,
    }),
    // Provides CartService so login/register can merge a guest cart.
    CartModule,
  ],
  controllers: [AuthController],
  providers: [AuthRepository, AuthService, JwtAccessStrategy, JwtRefreshStrategy],
  exports: [AuthRepository, AuthService],
})
export class AuthModule {}
