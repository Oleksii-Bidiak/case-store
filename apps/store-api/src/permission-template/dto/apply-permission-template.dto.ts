import { IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * Body of `POST /api/admin/permission-templates/:id/apply` (TASK-477, plan 181).
 *
 * The TARGET travels in the body while the template is in the path, because the
 * resource being acted on is the template — «застосувати цей шаблон» — and the
 * person is the argument. It also keeps the person's id out of the URL, and out
 * of the access logs that URLs end up in.
 *
 * Who may be a target is not a question a DTO can answer: `assertMayManage`
 * decides it once the target's row is read, which is why this validates the SHAPE
 * of an id and nothing more.
 */
export class ApplyPermissionTemplateDto {
  @ApiProperty({
    description: 'The account to copy this template onto',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsUUID('loose', { message: 'userId must be a valid UUID' })
  userId!: string;
}
