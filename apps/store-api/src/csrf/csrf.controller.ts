import { Controller, Get, Res } from '@nestjs/common';
import type { Response } from 'express';
import { ApiOperation, ApiProperty, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CsrfService } from './csrf.service';

/** The CSRF token the client echoes in the `x-csrf-token` header. */
class CsrfToken {
  @ApiProperty({ example: 'a1b2c3…', description: 'Echo this in the x-csrf-token header' })
  csrfToken!: string;
}

/**
 * Response envelope for the CSRF token endpoint.
 *
 * `@ApiProperty` is what puts `data` into the contract (TASK-825): without it
 * Orval typed this response `{ [key: string]: unknown }`.
 */
class CsrfTokenResponseEnvelope {
  @ApiProperty({ type: CsrfToken })
  data!: CsrfToken;
}

@ApiTags('Security')
@Controller('csrf-token')
export class CsrfController {
  constructor(private readonly csrfService: CsrfService) {}

  /**
   * GET /api/csrf-token
   *
   * Issue a CSRF token: sets the readable CSRF cookie and returns the token in
   * the body. The frontend calls this once (or lazily before its first
   * state-changing request) so it can echo the token in the `x-csrf-token`
   * header. Public by design — issuing a token is harmless; the cookie binding
   * is what makes it useful.
   */
  @Get()
  @ApiOperation({ summary: 'Issue a CSRF token (sets cookie + returns token)' })
  @ApiResponse({
    status: 200,
    description: 'CSRF token issued',
    type: CsrfTokenResponseEnvelope,
  })
  getToken(@Res({ passthrough: true }) response: Response): {
    data: CsrfToken;
  } {
    const csrfToken = this.csrfService.issueToken(response);
    return { data: { csrfToken } };
  }
}
