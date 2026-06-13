import { Controller, Get, Res } from '@nestjs/common';
import type { Response } from 'express';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CsrfService } from './csrf.service';

/**
 * Response envelope for the CSRF token endpoint.
 */
class CsrfTokenResponseEnvelope {
  data!: { csrfToken: string };
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
    data: { csrfToken: string };
  } {
    const csrfToken = this.csrfService.issueToken(response);
    return { data: { csrfToken } };
  }
}
