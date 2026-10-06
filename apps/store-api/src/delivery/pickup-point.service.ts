import { Injectable, NotFoundException } from '@nestjs/common';
import { reorderErrorToHttp } from '../common/reorder';
import {
  PickupPointRepository,
  type AdminPickupPoint,
  type CreatePickupPointInput,
  type UpdatePickupPointInput,
} from './pickup-point.repository';
import type { ReorderPickupPointsDto } from './dto';

/**
 * PickupPointService — the admin side of the shop's pickup points (TASK-645).
 *
 * No cache to evict: the checkout reads (`GET /api/delivery/methods` and the
 * order-time point check) are deliberately uncached in `DeliveryService`, so a
 * point switched off here is gone from the very next checkout.
 */
@Injectable()
export class PickupPointService {
  constructor(private readonly repository: PickupPointRepository) {}

  /** Every point, inactive included, in display order. */
  listAdmin(): Promise<AdminPickupPoint[]> {
    return this.repository.listAll();
  }

  /** Create a point; it is appended to the end of the list. */
  create(input: CreatePickupPointInput): Promise<AdminPickupPoint> {
    return this.repository.create(input);
  }

  /** @throws NotFoundException for an unknown id. */
  async update(id: string, input: UpdatePickupPointInput): Promise<AdminPickupPoint> {
    await this.requireExisting(id);
    return this.repository.update(id, input);
  }

  /**
   * Hard-delete a point. Orders that referenced it lose the FK (SetNull) and
   * keep their snapshot of its name and address.
   *
   * @throws NotFoundException for an unknown id.
   */
  async remove(id: string): Promise<{ id: string }> {
    await this.requireExisting(id);
    await this.repository.delete(id);
    return { id };
  }

  /**
   * Rewrite the complete ordering and return the refreshed list. The
   * repository's domain errors become the stable `REORDER_*` HTTP codes the
   * admin panel already announces for every other sortable list.
   */
  async reorder(dto: ReorderPickupPointsDto): Promise<AdminPickupPoint[]> {
    try {
      return await this.repository.reorderAll(dto.orderedIds);
    } catch (error) {
      throw reorderErrorToHttp(error);
    }
  }

  private async requireExisting(id: string): Promise<void> {
    const existing = await this.repository.findById(id);
    if (!existing) {
      throw new NotFoundException('Pickup point not found');
    }
  }
}
