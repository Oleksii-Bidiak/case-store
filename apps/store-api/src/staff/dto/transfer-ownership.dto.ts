import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

/**
 * Body of `POST /api/admin/staff/:id/transfer-ownership` (TASK-478, plan 181).
 *
 * ONE FIELD, AND IT IS THE CALLER'S OWN PASSWORD — not the target's. This is a
 * re-authentication of the person GIVING the shop away, at the moment they give
 * it away. A valid access token proves only that somebody opened this session in
 * the last fifteen minutes; an unlocked laptop or a stolen token would otherwise
 * be enough to hand the shop to an account the thief controls, and that is the
 * one act nobody can undo by signing back in — after it, the victim is a deputy
 * admin and the thief holds the reserve.
 *
 * WHY THERE IS NO `confirm` FLAG OR TYPED-IN EMAIL HERE. Those are UI ceremony
 * and belong in the UI (TASK-480), where they can say what is about to happen in
 * Ukrainian. The API's job is the part a UI cannot fake: proof of the password.
 *
 * NO POLICY VALIDATION on this field, deliberately. `@IsStaffPassword()` would
 * reject an existing owner whose password predates the strict staff rule — they
 * would be unable to hand over at all, which is the exact dead end this route
 * exists to remove. The password is CHECKED against the stored hash, not judged.
 */
export class TransferOwnershipDto {
  @ApiProperty({
    description: "The CALLING owner's own current password, re-entered to confirm",
    example: 'OwnerP@ssw0rd!',
  })
  @IsString()
  @IsNotEmpty({ message: 'password should not be empty' })
  password!: string;
}
