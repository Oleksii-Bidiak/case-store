import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import {
  PermissionTemplateRepository,
  type PermissionTemplateRecord,
} from './permission-template.repository';
import { StaffService } from '../staff/staff.service';
import { assertGrantablePermissions, type PermissionActor } from '../auth/permissions';

/** Input for {@link PermissionTemplateService.create}. */
export interface CreateTemplateInput {
  name: string;
  description?: string | null;
  permissions: string[];
}

/** Input for {@link PermissionTemplateService.update}. Absent = leave alone. */
export interface UpdateTemplateInput {
  name?: string;
  description?: string | null;
  permissions?: string[];
}

/** What applying a template produces — the audit row's two halves plus the name. */
export interface AppliedTemplate {
  template: PermissionTemplateRecord;
  /** The keys the person held before, sorted. */
  before: string[];
  /** The keys they hold now, sorted — a copy of the template at this instant. */
  after: string[];
  target: { id: string; email: string };
}

/**
 * Named sets of permissions the owner can apply to a person (TASK-477, plan 181).
 *
 * ══ THE ONE RULE THAT MATTERS: A TEMPLATE IS A COPY, NOT A LINK ══════════════
 *
 * {@link apply} reads a template, reduces it to a plain `string[]`, and hands it
 * to `StaffService.setPermissions` — the same single write an owner's checkbox
 * grid calls. After that call returns, NOTHING anywhere records which template
 * the rows came from. There is no `templateId` column on `UserPermission`, no
 * relation in either direction, and no service that could reconstruct one.
 *
 * **If you are reading this because you want to add that link — stop and read
 * this paragraph first.** The instinct is entirely reasonable: a screen would
 * like to say «Олена — за шаблоном Оператор замовлень», and a foreign key is the
 * obvious way to say it. Plan 178 (decision 2) considered exactly that and
 * rejected it, for two reasons that do not go away:
 *
 *   1. **Editing a template would silently change what somebody already working
 *      may do.** That is a permission change nobody performed on anybody. It
 *      appears in no audit row under that person's name, the owner who made it
 *      was thinking about the NEXT hire, and the first anyone learns of it is an
 *      operator hitting a 403 in the middle of a shift.
 *
 *   2. **The link desynchronises immediately, in the normal case.** The moment
 *      one person is given one key beyond their template — which is the whole
 *      reason per-person rights replaced per-role ones — you need a rule for what
 *      "still on this template" means. Every answer is worse than not asking:
 *      silently re-syncing throws their extra key away, silently not re-syncing
 *      makes the label a lie, and asking the owner each time makes editing a
 *      template a migration.
 *
 * A copy has neither problem, and "what can this person do?" is answerable by
 * looking in exactly one place: their own rows. Templates stay editable and
 * deletable at any moment precisely because nothing depends on them afterwards.
 *
 * If a screen genuinely needs "which template was this person set up from", that
 * is a fact about an EVENT, not about their current rights — it is in the audit
 * entry `apply` writes, where it stays true even after their permissions are
 * edited by hand ten minutes later.
 *
 * `copy-rule.spec.ts` fails the build if the schema grows the link;
 * `permission-template.service.spec.ts` fails it if the behaviour changes.
 *
 * ══ VALIDATION ═══════════════════════════════════════════════════════════════
 *
 * Template items go through `assertGrantablePermissions` on every write, exactly
 * like a person's own set. Without that, a template would be the back door round
 * `grantable: false`: park `staff:write` in a template nobody looks at, apply it,
 * and the manager can now grant themselves everything else. The second check at
 * apply-time (inside `setPermissions`) is deliberate belt-and-braces — it also
 * covers rows written before a key was retired.
 */
@Injectable()
export class PermissionTemplateService {
  constructor(
    private readonly repository: PermissionTemplateRepository,
    // The ONE write that grants a person anything. Reused rather than
    // reimplemented so `assertMayManage` cannot be forgotten on this path, and so
    // there is literally one function to audit for the copy rule.
    private readonly staffService: StaffService,
  ) {}

  /** Every template, by name. */
  findAll(): Promise<PermissionTemplateRecord[]> {
    return this.repository.findAll();
  }

  /** One template. @throws NotFoundException */
  findById(id: string): Promise<PermissionTemplateRecord> {
    return this.requireTemplate(id);
  }

  /**
   * Create a template.
   *
   * @throws ConflictException when the name is taken — the name is how the owner
   *         picks one on the hiring wizard, so two templates called «Продавець»
   *         is a worse outcome than a refusal.
   * @throws BadRequestException on an unknown or non-grantable key
   */
  async create(input: CreateTemplateInput): Promise<PermissionTemplateRecord> {
    const permissions = assertGrantablePermissions(input.permissions);
    await this.assertNameFree(input.name);

    return this.repository.create({
      name: input.name,
      description: input.description ?? null,
      permissions,
    });
  }

  /**
   * Edit a template.
   *
   * Changes nobody's access — see the class docblock. That is what makes this
   * operation ordinary enough to need no level check of its own beyond the
   * `staff:write` the route already requires.
   */
  async update(id: string, input: UpdateTemplateInput): Promise<PermissionTemplateRecord> {
    await this.requireTemplate(id);

    const permissions =
      input.permissions === undefined ? undefined : assertGrantablePermissions(input.permissions);

    if (input.name !== undefined) {
      await this.assertNameFree(input.name, id);
    }

    return this.repository.update(id, {
      ...(input.name === undefined ? {} : { name: input.name }),
      ...(input.description === undefined ? {} : { description: input.description }),
      ...(permissions === undefined ? {} : { permissions }),
    });
  }

  /** Delete a template. Nobody's access depends on it. @throws NotFoundException */
  async remove(id: string): Promise<void> {
    await this.requireTemplate(id);
    await this.repository.remove(id);
  }

  /**
   * Copy a template onto a person.
   *
   * Three lines, and each one is deliberate:
   *
   *   - the template is loaded and reduced to `template.permissions`, a plain
   *     array of strings — the LAST point at which its identity exists;
   *   - `setPermissions` performs the grant, which means `assertMayManage` runs
   *     against the target and the keys are validated again, both in the one
   *     place those rules live;
   *   - the template record is returned alongside the before/after so the caller
   *     can name it in the audit summary — the only place the link survives, and
   *     the right place for it, because it is a fact about what happened rather
   *     than about what is true now.
   *
   * @throws NotFoundException when the template or the target does not exist
   * @throws ForbiddenException when the target is at or above the caller's level
   */
  async apply(
    templateId: string,
    userId: string,
    actor: PermissionActor,
  ): Promise<AppliedTemplate> {
    const template = await this.requireTemplate(templateId);

    const change = await this.staffService.setPermissions(userId, template.permissions, actor);

    return {
      template,
      before: change.before,
      after: change.after,
      target: change.target,
    };
  }

  private async requireTemplate(id: string): Promise<PermissionTemplateRecord> {
    const template = await this.repository.findById(id);
    if (!template) {
      throw new NotFoundException('Permission template not found');
    }
    return template;
  }

  /** @param exceptId the template being renamed, which may keep its own name. */
  private async assertNameFree(name: string, exceptId?: string): Promise<void> {
    const existing = await this.repository.findByName(name);
    if (existing && existing.id !== exceptId) {
      throw new ConflictException('A permission template with this name already exists');
    }
  }
}
