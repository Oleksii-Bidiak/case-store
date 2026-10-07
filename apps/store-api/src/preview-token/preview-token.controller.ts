import { Body, Controller, Delete, Get, Headers, HttpCode, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  ApiBearerAuth,
  ApiExtraModels,
  ApiHeader,
  ApiOperation,
  ApiProperty,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import {
  CurrentActor,
  PermissionGuard,
  RequireAnyPermission,
  RequirePermission,
  type PermissionActor,
} from '../auth/permissions';
import { PreviewTokenService } from './preview-token.service';
import { CreatePreviewTokenDto } from './dto/create-preview-token.dto';
import { PreviewTokenEntity, ResolvedPreviewTokenEntity } from './entities';
import { PREVIEW_TOKEN_HEADER } from './preview-response';

class PreviewTokenResponse {
  @ApiProperty({ type: PreviewTokenEntity })
  data!: PreviewTokenEntity;
}

class ResolvedPreviewTokenResponse {
  @ApiProperty({ type: ResolvedPreviewTokenEntity })
  data!: ResolvedPreviewTokenEntity;
}

/**
 * Issuing and revoking signed preview links (TASK-668):
 *
 *   POST   /api/admin/preview-tokens — issue a 24 h link to one draft
 *   DELETE /api/admin/preview-tokens — revoke every link ever issued
 *
 * The route gate is "holds SOME right that lets you see a previewable thing"; the
 * service then checks the right for the thing actually asked for (home → home:read
 * or home:write, product → products:read, page → pages:read or pages:write, post →
 * blog:read or blog:write), because which key applies depends on the body. Issuing a
 * link changes no content — it is a READ capability, hence the `:read` keys open it.
 *
 * Revoking is a settings action under `settings:seo`: the generation lives on the SEO
 * settings singleton and the switch sits on `/settings/seo`.
 */
@ApiTags('Preview tokens')
@ApiExtraModels(PreviewTokenEntity, PreviewTokenResponse)
@Controller('admin/preview-tokens')
@UseGuards(PermissionGuard)
@RequirePermission('settings:seo')
export class AdminPreviewTokenController {
  constructor(private readonly previewTokenService: PreviewTokenService) {}

  @Post()
  @RequireAnyPermission(
    'home:read',
    'home:write',
    'products:read',
    'pages:read',
    'pages:write',
    'blog:read',
    'blog:write',
  )
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Issue a 24-hour signed preview link to one draft (admin)' })
  @ApiResponse({ status: 201, type: PreviewTokenResponse })
  @ApiResponse({ status: 400, description: 'Invalid body (id missing, or id given for home)' })
  @ApiResponse({ status: 403, description: 'No right to see this kind of thing' })
  @ApiResponse({ status: 404, description: 'The thing does not exist (or has no page)' })
  async create(
    @Body() dto: CreatePreviewTokenDto,
    @CurrentActor() actor: PermissionActor,
  ): Promise<PreviewTokenResponse> {
    return { data: await this.previewTokenService.issue(dto, actor) };
  }

  @Delete()
  @HttpCode(204)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Revoke every preview link issued so far (admin)' })
  @ApiResponse({ status: 204, description: 'All previous links stop working' })
  @ApiResponse({ status: 403, description: 'Forbidden — needs settings:seo' })
  async revokeAll(): Promise<void> {
    await this.previewTokenService.revokeAll();
  }
}

/**
 *   GET /api/preview-tokens/resolve — is this token good, and where does it lead?
 *
 * Public: the person opening a preview link need not have an admin account
 * (decision B-9 №8). Throttled, because it is an oracle for "is this a valid token".
 */
@ApiTags('Preview tokens')
@ApiExtraModels(ResolvedPreviewTokenEntity, ResolvedPreviewTokenResponse)
@Controller('preview-tokens')
export class PreviewTokenController {
  constructor(private readonly previewTokenService: PreviewTokenService) {}

  @Get('resolve')
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @ApiHeader({ name: 'X-Preview-Token', required: true, description: 'The preview token' })
  @ApiOperation({ summary: 'Check a preview token and get the path it opens' })
  @ApiResponse({ status: 200, type: ResolvedPreviewTokenResponse })
  @ApiResponse({ status: 404, description: 'Invalid, expired or revoked — or its target is gone' })
  async resolve(
    @Headers(PREVIEW_TOKEN_HEADER) token: string | undefined,
  ): Promise<ResolvedPreviewTokenResponse> {
    return { data: await this.previewTokenService.resolve(token) };
  }
}
