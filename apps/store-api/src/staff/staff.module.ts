import { Module } from '@nestjs/common';
import { StaffRepository } from './staff.repository';
import { StaffService } from './staff.service';
import { StaffController } from './staff.controller';
import { UserModule } from '../user';
import { AuthModule } from '../auth';
import { ReviewModule } from '../review/review.module';

/**
 * StaffModule — the «Персонал» section (TASK-476, plan 181).
 *
 * `UserModule` for `UserRepository`: the account-row lifecycle (find, deactivate,
 * activate, soft-delete) is one aggregate, and a second module with its own idea
 * of what "this user exists" means — soft-deleted? inactive? — is the drift
 * `deletedAt` filters are famous for. Same reason `UserNoteModule` imports it.
 *
 * `AuthModule` for `AuthRepository` (revoking a demoted or banned person's
 * sessions) and `AuthService` (so an administrator-initiated password reset is
 * literally the same operation as a self-service one).
 *
 * `ReviewModule` for `ReviewService`: deactivating an account withdraws what it
 * wrote (TASK-589), and that must happen whether the ban is performed here or on
 * the customer surface.
 */
@Module({
  imports: [UserModule, AuthModule, ReviewModule],
  controllers: [StaffController],
  providers: [StaffRepository, StaffService],
  exports: [StaffService],
})
export class StaffModule {}
