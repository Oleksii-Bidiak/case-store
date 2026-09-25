/**
 * What AuthService hands the controller after a successful sign-in, sign-up or
 * refresh — an INTERNAL value, never serialised as-is.
 *
 * Split from {@link AuthTokens} (the Swagger shape of the response body): the
 * body carries the access token only, while the refresh token travels in an
 * HttpOnly cookie and `userId` is for the server alone.
 *
 * `userId` is here for TASK-792. The controller used to recover it by decoding
 * the access token it had just been handed — reading back a claim the service
 * already knew — and when that decode came up empty it cleared the guest
 * cookies without merging anything, orphaning the guest cart.
 */
export interface IssuedSession {
  userId: string;
  accessToken: string;
  refreshToken: string;
}
