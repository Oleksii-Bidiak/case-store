import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma';

/** A template with its items flattened to the keys it carries. */
export interface PermissionTemplateRecord {
  id: string;
  name: string;
  description: string | null;
  /** The template's keys, sorted. */
  permissions: string[];
  createdAt: Date;
  updatedAt: Date;
}

/** Fields accepted when creating a template. Already validated by the service. */
export interface CreatePermissionTemplateInput {
  name: string;
  description: string | null;
  permissions: string[];
}

/** Fields accepted on edit. An absent key means "leave it alone". */
export interface UpdatePermissionTemplateInput {
  name?: string;
  description?: string | null;
  /** When present, the COMPLETE new set — see {@link PermissionTemplateRepository}. */
  permissions?: string[];
}

/**
 * Data access for permission templates (TASK-477, plan 181).
 *
 * REPLACE, NEVER DIFF — the same rule `PermissionGrantRepository` follows, and
 * for the same reason. A template's items are deleted and reinserted inside one
 * transaction, so "the rows that exist are exactly the rows the owner submitted"
 * holds at every instant, including after a failure. Merging a partial delta
 * would leave a template describing a set nobody chose, and the next person it is
 * applied to would silently inherit it.
 *
 * NOTHING HERE REFERENCES A USER, and that absence is load-bearing rather than an
 * omission: applying a template is a COPY (plan 178, decision 2), so there is no
 * join to maintain, no cascade to reason about, and no query that could answer
 * "who is on this template". See `permission-template.service.ts` and
 * `copy-rule.spec.ts`.
 */
@Injectable()
export class PermissionTemplateRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Every template, by name — the order the picker shows them in. */
  async findAll(): Promise<PermissionTemplateRecord[]> {
    const rows = await this.prisma.permissionTemplate.findMany({
      orderBy: { name: 'asc' },
      include: { items: { select: { permission: true }, orderBy: { permission: 'asc' } } },
    });

    return rows.map(toRecord);
  }

  /** One template, or null. */
  async findById(id: string): Promise<PermissionTemplateRecord | null> {
    const row = await this.prisma.permissionTemplate.findUnique({
      where: { id },
      include: { items: { select: { permission: true }, orderBy: { permission: 'asc' } } },
    });

    return row ? toRecord(row) : null;
  }

  /**
   * One template by its exact name.
   *
   * The name is `@unique` in the schema, so this exists to turn a would-be
   * database error into a 409 the owner can read — the same shape
   * `UserRepository.findByEmail` serves on the account side.
   */
  async findByName(name: string): Promise<PermissionTemplateRecord | null> {
    const row = await this.prisma.permissionTemplate.findUnique({
      where: { name },
      include: { items: { select: { permission: true }, orderBy: { permission: 'asc' } } },
    });

    return row ? toRecord(row) : null;
  }

  async create(input: CreatePermissionTemplateInput): Promise<PermissionTemplateRecord> {
    const row = await this.prisma.permissionTemplate.create({
      data: {
        name: input.name,
        description: input.description,
        items: { create: input.permissions.map((permission) => ({ permission })) },
      },
      include: { items: { select: { permission: true }, orderBy: { permission: 'asc' } } },
    });

    return toRecord(row);
  }

  /**
   * Edit a template. Items, when given, are replaced wholesale inside the same
   * transaction as the name and description, so a half-applied edit cannot leave
   * a template named for one job and stocked for another.
   */
  async update(
    id: string,
    input: UpdatePermissionTemplateInput,
  ): Promise<PermissionTemplateRecord> {
    const row = await this.prisma.$transaction(async (tx) => {
      if (input.permissions) {
        await tx.permissionTemplateItem.deleteMany({ where: { templateId: id } });
        if (input.permissions.length > 0) {
          await tx.permissionTemplateItem.createMany({
            data: input.permissions.map((permission) => ({ templateId: id, permission })),
            skipDuplicates: true,
          });
        }
      }

      return tx.permissionTemplate.update({
        where: { id },
        data: {
          ...(input.name === undefined ? {} : { name: input.name }),
          ...(input.description === undefined ? {} : { description: input.description }),
        },
        include: { items: { select: { permission: true }, orderBy: { permission: 'asc' } } },
      });
    });

    return toRecord(row);
  }

  /**
   * Delete a template.
   *
   * Safe at any moment, and that is a property of the copy rule rather than of
   * this method: nobody's access depends on a template once it has been applied,
   * so there is nothing to orphan. Items go with it via `onDelete: Cascade`.
   */
  async remove(id: string): Promise<void> {
    await this.prisma.permissionTemplate.delete({ where: { id } });
  }
}

function toRecord(row: {
  id: string;
  name: string;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
  items: { permission: string }[];
}): PermissionTemplateRecord {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    permissions: row.items.map((item) => item.permission).sort(),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
