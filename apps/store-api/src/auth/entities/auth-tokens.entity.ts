import { ApiProperty } from '@nestjs/swagger';

/**
 * The body of a successful register / login / refresh — what the client
 * actually receives (TASK-825).
 *
 * Only the access token. The refresh token is delivered as an HttpOnly cookie
 * and never appears in a body; this class used to declare it anyway, as a
 * REQUIRED string, so Orval generated a `refreshToken: string` in both apps that
 * no response ever filled — destructure it and you get `undefined`, and the
 * natural next step with a "token" is `localStorage`, exactly where a refresh
 * token must never go.
 *
 * Internally AuthService returns an {@link IssuedSession}, which carries the
 * refresh token and the owner's id for the controller alone.
 */
export class AuthTokens {
  @ApiProperty({
    description:
      'JWT access token. The refresh token is set as an HttpOnly cookie, never sent here.',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  accessToken!: string;
}
