import { ApiProperty } from '@nestjs/swagger';

/**
 * Domain entity representing an authentication token pair.
 *
 * This is a clean domain entity — not a Prisma model.
 * It is returned by AuthService methods (register, login, refresh)
 * and contains only the data that should be exposed to the client.
 *
 * Note: The refreshToken is set as an HttpOnly cookie by the controller,
 * so it is included here for internal use but the controller decides
 * how to deliver each token.
 */
export class AuthTokens {
  @ApiProperty({
    description: 'JWT access token',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  accessToken!: string;

  @ApiProperty({
    description: 'JWT refresh token (set as HttpOnly cookie)',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  refreshToken!: string;
}
