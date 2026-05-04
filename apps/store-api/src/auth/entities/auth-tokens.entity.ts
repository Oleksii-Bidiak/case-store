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
  accessToken!: string;
  refreshToken!: string;
}
