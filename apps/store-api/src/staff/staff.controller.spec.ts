import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import type { PermissionActor } from '../auth/permissions';
import type { AuditService } from '../audit';
import { StaffController } from './staff.controller';
import type { StaffService } from './staff.service';

/**
 * The refused ownership transfer (TASK-637), at the unit level: which refusals
 * write an audit row, and that the caller still gets the original error.
 *
 * Constructed by hand rather than through the Nest testing module — the route's
 * guards are the e2e spec's business; this pins the handler's own branching.
 */
describe('StaffController.transferOwnership — refused attempts (TASK-637)', () => {
  const staffService = { transferOwnership: jest.fn() };
  const auditService = { record: jest.fn().mockResolvedValue(undefined) };
  const controller = new StaffController(
    staffService as unknown as StaffService,
    auditService as unknown as AuditService,
  );

  const owner = {
    id: 'owner-1',
    email: 'owner@example.com',
    role: 'ADMIN',
    isOwner: true,
  } as unknown as PermissionActor;
  const request = { ip: '203.0.113.5', headers: { 'user-agent': 'jest' } } as unknown as Request;

  beforeEach(() => jest.clearAllMocks());

  it('records a wrong password under the success key, marked rejected, and rethrows', async () => {
    const refusal = new UnauthorizedException('Invalid credentials');
    staffService.transferOwnership.mockRejectedValue(refusal);

    await expect(
      controller.transferOwnership('deputy-1', { password: 'guess' }, owner, request),
    ).rejects.toBe(refusal);

    expect(auditService.record).toHaveBeenCalledTimes(1);
    expect(auditService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 'owner-1',
        action: 'staff.transferOwnership',
        entityType: 'staff',
        entityId: 'deputy-1',
        diff: { outcome: { from: null, to: 'rejected' } },
        ip: '203.0.113.5',
      }),
    );
    expect(JSON.stringify(auditService.record.mock.calls[0][0])).not.toContain('guess');
  });

  it('records nothing for a refusal about the request itself', async () => {
    const refusal = new BadRequestException(
      'Ownership can only be transferred to an administrator',
    );
    staffService.transferOwnership.mockRejectedValue(refusal);

    await expect(
      controller.transferOwnership('manager-1', { password: 'right' }, owner, request),
    ).rejects.toBe(refusal);

    expect(auditService.record).not.toHaveBeenCalled();
  });
});
