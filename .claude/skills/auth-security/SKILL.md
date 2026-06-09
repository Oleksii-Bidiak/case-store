---
name: auth-security
description: Implement JWT authentication with refresh token rotation, guards, CORS, Helmet, rate limiting, and security best practices for NestJS e-commerce backend.
license: MIT
compatibility: claude-code
metadata:
  audience: developers
  workflow: scaffolding
---

## What I Do

I implement authentication and security patterns for the NestJS e-commerce backend, including JWT with refresh token rotation, role-based guards, CORS, Helmet, rate limiting, and input validation.

## When to Use Me

Use me when implementing authentication, authorization, or security features in `apps/store-api/src/`. This includes: auth module, JWT guards, RBAC, rate limiting, CORS configuration, and security middleware.

## Auth Module Architecture

### Module Structure

```
src/auth/
  auth.module.ts
  auth.controller.ts
  auth.service.ts
  auth.repository.ts
  dto/
    register.dto.ts
    login.dto.ts
    refresh-token.dto.ts
  entities/
    auth-token.entity.ts
  guards/
    jwt-auth.guard.ts
    jwt-refresh.guard.ts
    roles.guard.ts
  decorators/
    current-user.decorator.ts
    roles.decorator.ts
  strategies/
    jwt.strategy.ts
    jwt-refresh.strategy.ts
```

### Prisma Schema for Auth

```prisma
model User {
  id           String   @id @default(cuid())
  email        String   @unique
  passwordHash String   @map("password_hash")
  firstName    String?  @map("first_name")
  lastName     String?  @map("last_name")
  role         Role     @default(CUSTOMER)
  isActive     Boolean  @default(true) @map("is_active")
  createdAt    DateTime @default(now()) @map("created_at")
  updatedAt    DateTime @updatedAt @map("updated_at")
  deletedAt    DateTime? @map("deleted_at")

  refreshTokens RefreshToken[]
  orders        Order[]

  @@map("users")
}

model RefreshToken {
  id        String   @id @default(cuid())
  token     String   @unique
  userId    String   @map("user_id")
  expiresAt DateTime @map("expires_at")
  isRevoked Boolean  @default(false) @map("is_revoked")
  createdAt DateTime @default(now()) @map("created_at")

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@map("refresh_tokens")
}

enum Role {
  CUSTOMER
  ADMIN
}
```

### Auth Service

```typescript
// src/auth/auth.service.ts
import {
  Injectable,
  UnauthorizedException,
  ConflictException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { AuthRepository } from "./auth.repository";
import { RegisterDto } from "./dto/register.dto";
import { LoginDto } from "./dto/login.dto";
import * as bcrypt from "bcrypt";

@Injectable()
export class AuthService {
  constructor(
    private readonly authRepository: AuthRepository,
    private readonly jwtService: JwtService,
  ) {}

  async register(dto: RegisterDto) {
    const existing = await this.authRepository.findByEmail(dto.email);
    if (existing) throw new ConflictException("Email already registered");

    const passwordHash = await bcrypt.hash(dto.password, 12);
    const user = await this.authRepository.createUser({
      email: dto.email,
      passwordHash,
      firstName: dto.firstName,
      lastName: dto.lastName,
    });

    return this.generateTokenPair(user.id, user.role);
  }

  async login(dto: LoginDto) {
    const user = await this.authRepository.findByEmail(dto.email);
    if (!user) throw new UnauthorizedException("Invalid credentials");

    const isPasswordValid = await bcrypt.compare(
      dto.password,
      user.passwordHash,
    );
    if (!isPasswordValid)
      throw new UnauthorizedException("Invalid credentials");

    return this.generateTokenPair(user.id, user.role);
  }

  async refreshToken(token: string) {
    const storedToken = await this.authRepository.findRefreshToken(token);
    if (
      !storedToken ||
      storedToken.isRevoked ||
      storedToken.expiresAt < new Date()
    ) {
      throw new UnauthorizedException("Invalid refresh token");
    }

    await this.authRepository.revokeToken(storedToken.id);
    return this.generateTokenPair(storedToken.userId, storedToken.user.role);
  }

  async logout(userId: string, token: string) {
    await this.authRepository.revokeAllUserTokens(userId);
  }

  private async generateTokenPair(userId: string, role: string) {
    const accessToken = this.jwtService.sign(
      { sub: userId, role },
      { expiresIn: "15m" },
    );

    const refreshToken = this.jwtService.sign(
      { sub: userId, type: "refresh" },
      { expiresIn: "7d" },
    );

    await this.authRepository.saveRefreshToken(
      userId,
      refreshToken,
      new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    );

    return { accessToken, refreshToken };
  }
}
```

### Auth Controller

```typescript
// src/auth/auth.controller.ts
import {
  Controller,
  Post,
  Body,
  Res,
  Req,
  HttpCode,
  UseGuards,
} from "@nestjs/common";
import { ApiTags, ApiOperation, ApiBearerAuth } from "@nestjs/swagger";
import { Request, Response } from "express";
import { AuthService } from "./auth.service";
import { RegisterDto } from "./dto/register.dto";
import { LoginDto } from "./dto/login.dto";
import { JwtRefreshGuard } from "./guards/jwt-refresh.guard";

@ApiTags("auth")
@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post("register")
  @ApiOperation({ summary: "Register a new user" })
  async register(
    @Body() dto: RegisterDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const tokens = await this.authService.register(dto);
    this.setRefreshCookie(res, tokens.refreshToken);
    return { data: { accessToken: tokens.accessToken } };
  }

  @Post("login")
  @HttpCode(200)
  @ApiOperation({ summary: "Login" })
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const tokens = await this.authService.login(dto);
    this.setRefreshCookie(res, tokens.refreshToken);
    return { data: { accessToken: tokens.accessToken } };
  }

  @Post("refresh")
  @HttpCode(200)
  @UseGuards(JwtRefreshGuard)
  @ApiOperation({ summary: "Refresh access token" })
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const tokens = await this.authService.refreshToken(
      req.cookies?.refreshToken,
    );
    this.setRefreshCookie(res, tokens.refreshToken);
    return { data: { accessToken: tokens.accessToken } };
  }

  @Post("logout")
  @HttpCode(200)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Logout" })
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const userId = req.user?.sub;
    await this.authService.logout(userId, req.cookies?.refreshToken);
    res.clearCookie("refreshToken");
    return { data: { message: "Logged out" } };
  }

  private setRefreshCookie(res: Response, token: string) {
    res.cookie("refreshToken", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/auth/refresh",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
  }
}
```

### JWT Strategy

```typescript
// src/auth/strategies/jwt.strategy.ts
import { Injectable } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, "jwt") {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET,
    });
  }

  async validate(payload: { sub: string; role: string }) {
    return { id: payload.sub, role: payload.role };
  }
}
```

### Guards

```typescript
// src/auth/guards/jwt-auth.guard.ts
import { Injectable } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";

@Injectable()
export class JwtAuthGuard extends AuthGuard("jwt") {}

// src/auth/guards/roles.guard.ts
import { Injectable, CanActivate, ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { ROLES_KEY } from "../decorators/roles.decorator";

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!requiredRoles) return true;

    const { role } = context.switchToHttp().getRequest().user;
    return requiredRoles.includes(role);
  }
}
```

### Decorators

```typescript
// src/auth/decorators/current-user.decorator.ts
import { createParamDecorator, ExecutionContext } from "@nestjs/common";

export const CurrentUser = createParamDecorator(
  (data: string, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user;
    return data ? user?.[data] : user;
  },
);

// src/auth/decorators/roles.decorator.ts
import { SetMetadata } from "@nestjs/common";

export const ROLES_KEY = "roles";
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);
```

## Security Middleware

### Helmet + CORS (main.ts)

```typescript
// src/main.ts
import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import { SwaggerModule } from "@nestjs/swagger";
import helmet from "helmet";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.use(helmet());

  app.enableCors({
    origin: process.env.CORS_ORIGINS?.split(",") || ["http://localhost:3000"],
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  await app.listen(process.env.PORT || 3000);
}
bootstrap();
```

### Rate Limiting

```typescript
// src/app.module.ts
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';

@Module({
  imports: [
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }]),
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}

// src/auth/auth.controller.ts вЂ” stricter limits for auth endpoints
@Throttle({ default: { ttl: 60000, limit: 5 } })
@Post('login')
async login(...) { ... }
```

### Global Exception Filter

```typescript
// src/common/filters/all-exceptions.filter.ts
import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from "@nestjs/common";
import { Response } from "express";

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;
    const message =
      exception instanceof HttpException
        ? exception.getMessage()
        : "Internal server error";

    response.status(status).json({
      error: status >= 500 ? "INTERNAL_ERROR" : "REQUEST_ERROR",
      message: typeof message === "string" ? message : message,
      statusCode: status,
    });
  }
}
```

## DTOs with Validation

```typescript
// src/auth/dto/register.dto.ts
import { IsEmail, IsString, MinLength, IsOptional } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

export class RegisterDto {
  @ApiProperty({ example: "user@example.com" })
  @IsEmail()
  email: string;

  @ApiProperty({ example: "StrongP@ss123" })
  @IsString()
  @MinLength(8)
  password: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  firstName?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  lastName?: string;
}

// src/auth/dto/login.dto.ts
import { IsEmail, IsString } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

export class LoginDto {
  @ApiProperty({ example: "user@example.com" })
  @IsEmail()
  email: string;

  @ApiProperty({ example: "StrongP@ss123" })
  @IsString()
  password: string;
}
```

## Environment Variables

```env
# .env.example (apps/store-api/.env.example)
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/store_dev
JWT_SECRET=your-jwt-secret-min-32-chars
JWT_REFRESH_SECRET=your-refresh-secret-min-32-chars
JWT_EXPIRATION=15m
JWT_REFRESH_EXPIRATION=7d
BCRYPT_SALT_ROUNDS=12
CORS_ORIGINS=http://localhost:3000,http://localhost:3001
PORT=3000
```

## Rules

- ALWAYS use HttpOnly cookies for refresh tokens вЂ” never expose them to JavaScript.
- ALWAYS use `bcrypt` with salt rounds >= 12 for password hashing.
- ALWAYS rotate refresh tokens on every use вЂ” revoke the old one and issue a new pair.
- ALWAYS use `ValidationPipe` with `whitelist: true` and `forbidNonWhitelisted: true` globally.
- ALWAYS use `@UseGuards(JwtAuthGuard)` on protected endpoints.
- ALWAYS use `@Roles()` decorator + `RolesGuard` for admin-only endpoints.
- ALWAYS set `secure: true` on cookies in production.
- ALWAYS set `sameSite: 'strict'` on refresh token cookies.
- ALWAYS apply rate limiting to auth endpoints (login, register, refresh).
- NEVER store passwords in plain text or with weak hashing.
- NEVER return password hashes in API responses.
- NEVER use wildcard CORS origins in production.
