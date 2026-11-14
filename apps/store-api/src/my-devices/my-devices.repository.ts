import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma';
import { DEFAULT_MY_DEVICES_SETTINGS } from './my-devices.constants';
import { MyDeviceEntity, MyDevicesStateEntity } from './entities';
import type { AccountDevicesSnapshot, DevicesStateWrite } from './my-devices.types';

/** Enrichment for the read: the model's public fields and its brand. */
const DEVICE_READ_SELECT = {
  deviceModelId: true,
  label: true,
  lastUsedAt: true,
  deviceModel: {
    select: {
      slug: true,
      name: true,
      series: true,
      brand: { select: { name: true, slug: true } },
    },
  },
} satisfies Prisma.UserDeviceSelect;

type Db = PrismaService | Prisma.TransactionClient;

/**
 * Persistence of «Мої пристрої» in the account (TASK-1959). Every query is
 * scoped by the `userId` the caller passes — which is always the JWT subject —
 * so no method can reach another account's rows.
 */
@Injectable()
export class MyDevicesRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * The account's devices (newest first) and settings. A device whose model was
   * deactivated is hidden but its row is kept, so reactivating the model brings
   * it back. No settings row → the defaults.
   */
  findState(userId: string): Promise<MyDevicesStateEntity> {
    return this.readState(this.prisma, userId);
  }

  /** The subset of `ids` that name an existing, active device model. */
  async findActiveModelIds(ids: string[]): Promise<string[]> {
    if (ids.length === 0) return [];
    const rows = await this.prisma.deviceModel.findMany({
      where: { id: { in: ids }, isActive: true },
      select: { id: true },
    });
    const active = new Set(rows.map((row) => row.id));
    return ids.filter((id) => active.has(id));
  }

  /** Replace the visible list and the settings in one transaction. */
  replaceState(userId: string, state: DevicesStateWrite): Promise<MyDevicesStateEntity> {
    return this.prisma.$transaction(async (tx) => {
      await this.lockUser(tx, userId);
      await this.writeState(tx, userId, state);
      return this.readState(tx, userId);
    });
  }

  /**
   * Read the account rows, let `compute` decide the merged state, write it —
   * all inside one transaction, so a concurrent PUT cannot interleave between
   * the read and the write, and a failure leaves the account untouched.
   */
  mergeState(
    userId: string,
    compute: (account: AccountDevicesSnapshot) => DevicesStateWrite,
  ): Promise<MyDevicesStateEntity> {
    return this.prisma.$transaction(async (tx) => {
      await this.lockUser(tx, userId);
      // Sequential, not Promise.all: an interactive transaction is one connection.
      // Visible rows only: the hidden ones (inactive model) stay as they are
      // and never count towards the cap.
      const devices = await tx.userDevice.findMany({
        where: { userId, deviceModel: { isActive: true } },
        select: { deviceModelId: true, label: true, lastUsedAt: true },
      });
      const settings = await tx.userDeviceSettings.findUnique({
        where: { userId },
        select: { compatOnly: true, compatScope: true },
      });
      const next = compute({
        devices: devices.map((d) => ({
          modelId: d.deviceModelId,
          label: d.label,
          lastUsedAt: d.lastUsedAt,
        })),
        settings,
      });
      await this.writeState(tx, userId, next);
      return this.readState(tx, userId);
    });
  }

  // ─── internals ────────────────────────────────────────────────────────────

  /**
   * Serialise writers of ONE account: two tabs merging / replacing at once
   * would otherwise both delete and both insert, and the loser hits the
   * `(user_id, device_model_id)` unique key with a 500.
   */
  private async lockUser(tx: Prisma.TransactionClient, userId: string): Promise<void> {
    // NO KEY: serialises these writers without blocking the FK checks of the
    // user's other inserts (cart, orders) the way a plain FOR UPDATE would.
    await tx.$queryRaw`SELECT 1 FROM users WHERE id = ${userId} FOR NO KEY UPDATE`;
  }

  /**
   * Replace the VISIBLE list. A row whose model is inactive is not in the
   * storefront's copy, so it is not in the write either — it must survive,
   * or reactivating the model could not bring it back.
   */
  private async writeState(
    tx: Prisma.TransactionClient,
    userId: string,
    state: DevicesStateWrite,
  ): Promise<void> {
    await tx.userDevice.deleteMany({ where: { userId, deviceModel: { isActive: true } } });
    if (state.devices.length > 0) {
      await tx.userDevice.createMany({
        // A model deactivated after `sanitize` may still have its hidden row.
        skipDuplicates: true,
        data: state.devices.map((d) => ({
          userId,
          deviceModelId: d.modelId,
          label: d.label,
          lastUsedAt: d.lastUsedAt,
        })),
      });
    }
    await tx.userDeviceSettings.upsert({
      where: { userId },
      create: { userId, ...state.settings },
      update: { ...state.settings },
    });
  }

  private async readState(db: Db, userId: string): Promise<MyDevicesStateEntity> {
    const rows = await db.userDevice.findMany({
      where: { userId, deviceModel: { isActive: true } },
      orderBy: [{ lastUsedAt: 'desc' }, { deviceModelId: 'asc' }],
      select: DEVICE_READ_SELECT,
    });
    const settings = await db.userDeviceSettings.findUnique({
      where: { userId },
      select: { compatOnly: true, compatScope: true },
    });
    const state = new MyDevicesStateEntity();
    state.devices = rows.map((row) => MyDeviceEntity.fromPrisma(row));
    state.settings = settings ?? { ...DEFAULT_MY_DEVICES_SETTINGS };
    return state;
  }
}
