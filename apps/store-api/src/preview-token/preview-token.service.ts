import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PageKind } from '@prisma/client';
import { PermissionService, type Permission, type PermissionActor } from '../auth/permissions';
import { PreviewTokenRepository } from './preview-token.repository';
import {
  PREVIEW_TOKEN_TTL_SECONDS,
  PreviewScope,
  PreviewScopeType,
  PreviewTokenPayload,
  derivePreviewKey,
  formatScope,
  parseScope,
  signPreviewToken,
  verifyPreviewToken,
} from './preview-token.util';
import { PreviewTokenEntity, ResolvedPreviewTokenEntity } from './entities';

/**
 * Who may issue a preview of what (decision B-9 №6): the same right that lets you SEE
 * the thing in the admin — its `:read` key or its `:write` key. A product has only
 * `products:read` for looking, and `products:write` holders hold it by backfill.
 */
const ISSUE_PERMISSIONS: Record<PreviewScopeType, readonly Permission[]> = {
  home: ['home:read', 'home:write'],
  product: ['products:read'],
  page: ['pages:read', 'pages:write'],
  post: ['blog:read', 'blog:write'],
};

/** Every key that can issue SOME preview — the coarse route gate. */
export const ANY_PREVIEW_PERMISSIONS = [
  ...new Set(Object.values(ISSUE_PERMISSIONS).flat()),
] as Permission[];

/**
 * Signed preview links (TASK-668, plan 186). See `preview-token.util.ts` for the token
 * format and why the secret never leaves the API.
 */
@Injectable()
export class PreviewTokenService {
  private readonly key: Buffer;

  constructor(
    private readonly repository: PreviewTokenRepository,
    private readonly permissionService: PermissionService,
    config: ConfigService,
  ) {
    this.key = derivePreviewKey(config.getOrThrow<string>('JWT_SECRET'));
  }

  /**
   * Issue a 24-hour link to the draft of ONE thing. The caller must hold the right to
   * see that kind of thing; the thing must exist (any publish status).
   */
  async issue(
    input: { type: PreviewScopeType; id?: string },
    actor: PermissionActor,
    now: Date = new Date(),
  ): Promise<PreviewTokenEntity> {
    const allowed = ISSUE_PERMISSIONS[input.type];
    if (!allowed.some((key) => this.permissionService.actorHasPermission(actor, key))) {
      throw new ForbiddenException('Admin access required');
    }
    if (input.type !== 'home' && !input.id) {
      throw new BadRequestException(`id is required for a ${input.type} preview`);
    }
    if (input.type === 'home' && input.id) {
      throw new BadRequestException('A home preview takes no id');
    }

    const scope: PreviewScope = input.type === 'home' ? { type: 'home' } : input;
    const path = await this.pathFor(scope);
    if (path === null) {
      throw new NotFoundException('Nothing to preview');
    }

    const exp = Math.floor(now.getTime() / 1000) + PREVIEW_TOKEN_TTL_SECONDS;
    const token = signPreviewToken(
      { sc: formatScope(scope), exp, v: await this.repository.getVersion() },
      this.key,
    );

    const entity = new PreviewTokenEntity();
    entity.token = token;
    entity.path = path;
    entity.expiresAt = new Date(exp * 1000);
    return entity;
  }

  /**
   * The scope a token opens RIGHT NOW, or null — forged, tampered, expired, revoked
   * (older generation) and absent all read the same. Public reads call this and act
   * on the result only when it is the scope of the thing they serve.
   */
  async validScope(
    token: string | undefined,
    now: Date = new Date(),
  ): Promise<PreviewScope | null> {
    return (await this.verify(token, now))?.scope ?? null;
  }

  /**
   * What the storefront's `/preview` entry point asks: is this token good, and where
   * does it lead? The path is recomputed from the CURRENT slug, so a link issued before
   * a rename still lands on the right page. 404 for anything invalid, and for a target
   * that no longer exists.
   */
  async resolve(
    token: string | undefined,
    now: Date = new Date(),
  ): Promise<ResolvedPreviewTokenEntity> {
    const verified = await this.verify(token, now);
    const path = verified ? await this.pathFor(verified.scope) : null;
    if (!verified || path === null) {
      throw new NotFoundException('Preview link is invalid or has expired');
    }
    const { scope, payload } = verified;
    const entity = new ResolvedPreviewTokenEntity();
    entity.scope = formatScope(scope);
    entity.path = path;
    entity.expiresAt = new Date(payload.exp * 1000);
    return entity;
  }

  /** «Відкликати всі прев'ю» — every token issued so far stops working. */
  async revokeAll(): Promise<void> {
    await this.repository.bumpVersion();
  }

  /** Signature, expiry, scope shape AND the current generation — or null. */
  private async verify(
    token: string | undefined,
    now: Date,
  ): Promise<{ scope: PreviewScope; payload: PreviewTokenPayload } | null> {
    if (!token) return null;
    const payload = verifyPreviewToken(token, this.key, Math.floor(now.getTime() / 1000));
    if (!payload) return null;
    if (payload.v !== (await this.repository.getVersion())) return null;
    const scope = parseScope(payload.sc);
    return scope ? { scope, payload } : null;
  }

  /** The storefront path of a scope's target, or null when it is gone / has no page. */
  private async pathFor(scope: PreviewScope): Promise<string | null> {
    switch (scope.type) {
      case 'home':
        return '/';
      case 'product': {
        const product = await this.repository.findProduct(scope.id ?? '');
        return product ? `/products/${product.slug}` : null;
      }
      case 'page': {
        const page = await this.repository.findPage(scope.id ?? '');
        if (!page) return null;
        if (page.kind === PageKind.LEGAL) return `/legal/${page.slug}`;
        if (page.kind === PageKind.INFO) return `/info/${page.slug}`;
        // A HUB row describes a listing route's meta tags, not a page of its own.
        return null;
      }
      case 'post': {
        const post = await this.repository.findPost(scope.id ?? '');
        return post ? `/blog/${post.slug}` : null;
      }
    }
  }
}
