import { ApiProperty } from '@nestjs/swagger';
import { StaffUserEntity } from './staff-user.entity';

/**
 * The result of `POST /api/admin/staff/:id/transfer-ownership` (TASK-478).
 *
 * BOTH SIDES, NOT JUST THE NEW OWNER. The transfer changes two rows, and the
 * screen that fired it is showing both of them — the caller's own account is in
 * the same table. Returning only the incoming owner would leave the client to
 * assume what happened to the outgoing one, and "assume" is the word that turns
 * into a stale badge saying «Власник» next to somebody who is not.
 *
 * `previousOwner.level` is the field worth reading: it is 2, an ordinary deputy
 * admin. That is the state the outgoing owner is deliberately left in — see the
 * service's docblock for why they are not demoted further.
 */
export class OwnershipTransferEntity {
  @ApiProperty({
    description: 'The account that now owns the shop',
    type: StaffUserEntity,
  })
  owner!: StaffUserEntity;

  @ApiProperty({
    description: 'The account that owned it until this call; now an ordinary admin (level 2)',
    type: StaffUserEntity,
  })
  previousOwner!: StaffUserEntity;

  static fromParts(owner: StaffUserEntity, previousOwner: StaffUserEntity) {
    const entity = new OwnershipTransferEntity();
    entity.owner = owner;
    entity.previousOwner = previousOwner;
    return entity;
  }
}
