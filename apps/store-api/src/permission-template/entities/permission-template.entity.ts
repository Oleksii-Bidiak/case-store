import { ApiProperty } from '@nestjs/swagger';
import type { PermissionTemplateRecord } from '../permission-template.repository';

/**
 * A permission template as the admin panel sees it (TASK-477, plan 181).
 *
 * NOTE WHAT IS ABSENT: any count or list of people "on" this template. Not an
 * oversight — applying a template copies it, so nobody is ever on one (plan 178,
 * decision 2). A `memberCount` here would be the first step towards the live link
 * the design rejected, and there would be no honest way to compute it.
 */
export class PermissionTemplateEntity {
  @ApiProperty({ description: 'Template id' })
  id!: string;

  @ApiProperty({ description: 'Template name, unique', example: 'Оператор замовлень' })
  name!: string;

  @ApiProperty({ description: 'What this template is for', nullable: true, type: String })
  description!: string | null;

  @ApiProperty({
    description: 'The permission keys this template carries, sorted',
    type: [String],
    example: ['orders:read', 'orders:write'],
  })
  permissions!: string[];

  @ApiProperty({ description: 'Creation timestamp' })
  createdAt!: Date;

  @ApiProperty({ description: 'Last update timestamp' })
  updatedAt!: Date;

  static fromRecord(record: PermissionTemplateRecord): PermissionTemplateEntity {
    const entity = new PermissionTemplateEntity();
    entity.id = record.id;
    entity.name = record.name;
    entity.description = record.description;
    entity.permissions = [...record.permissions];
    entity.createdAt = record.createdAt;
    entity.updatedAt = record.updatedAt;
    return entity;
  }
}

/**
 * The result of applying a template — what changed, for whom.
 *
 * `before` travels back to the caller as well as into the audit row so the admin
 * panel can show «було 2 права, стало 5» without a second request, and so a
 * screen that applied the wrong template to the wrong person can say exactly what
 * it replaced.
 */
export class AppliedTemplateEntity {
  @ApiProperty({ description: 'The template that was copied', type: PermissionTemplateEntity })
  template!: PermissionTemplateEntity;

  @ApiProperty({ description: 'The account it was copied onto' })
  userId!: string;

  @ApiProperty({ description: 'What that person held before', type: [String] })
  before!: string[];

  @ApiProperty({ description: 'What they hold now — a copy of the template', type: [String] })
  after!: string[];
}
