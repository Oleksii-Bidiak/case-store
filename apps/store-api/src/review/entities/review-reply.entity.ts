import { ApiProperty } from '@nestjs/swagger';
import { ReviewReply } from '@prisma/client';

/**
 * The shop's answer to a review, as everybody outside the database sees it
 * (TASK-587).
 *
 * TWO FIELDS, AND THE OMISSION IS THE POINT. `ReviewReply.authorUserId` is
 * recorded — somebody has to be answerable internally for what the shop said —
 * but it is NOT here, because the storefront renders the SHOP and not a person.
 * That is the owner's decision of 2026-09-14, and keeping the id off the wire is
 * what makes it stick: an entity that carried it would sooner or later have a
 * name rendered from it by someone who assumed it was there to be shown.
 *
 * There is also no `updatedAt`. A corrected answer is still the shop's answer;
 * showing a customer that it was edited invites a conversation about what it used
 * to say, which is a thread — and the owner decided there is no thread.
 */
export class ReviewReplyEntity {
  @ApiProperty({
    description: 'The shop’s reply text',
    example: 'Дякуємо за відгук! Передали ваші зауваження постачальнику.',
  })
  body!: string;

  @ApiProperty({ description: 'When the shop answered', example: '2026-07-02T09:15:00.000Z' })
  createdAt!: Date;

  static fromPrisma(reply: ReviewReply): ReviewReplyEntity {
    const entity = new ReviewReplyEntity();
    entity.body = reply.body;
    entity.createdAt = reply.createdAt;
    return entity;
  }
}
