import { Injectable } from '@nestjs/common';
import { MyDevicesRepository } from './my-devices.repository';
import type { MyDevicesDto } from './dto';
import type { MyDevicesStateEntity } from './entities';
import { MAX_DEVICE_LABEL_LENGTH, MAX_MY_DEVICES } from './my-devices.constants';
import type { AccountDevicesSnapshot, DevicesStateWrite, StoredDevice } from './my-devices.types';

/** Trim, collapse inner whitespace, cap — the storefront's own rule; blank → null. */
function normalizeLabel(label: string | null | undefined): string | null {
  if (typeof label !== 'string') return null;
  const trimmed = label.trim().replace(/\s+/g, ' ');
  return trimmed ? trimmed.slice(0, MAX_DEVICE_LABEL_LENGTH) : null;
}

/** Newest first; the list never grows past {@link MAX_MY_DEVICES}. */
function newestFirst(devices: StoredDevice[]): StoredDevice[] {
  return [...devices]
    .sort((a, b) => b.lastUsedAt.getTime() - a.lastUsedAt.getTime())
    .slice(0, MAX_MY_DEVICES);
}

/**
 * The guest → account merge (TASK-1959), a pure function of both sides:
 *   - one row per model (union by `modelId`);
 *   - `lastUsedAt` = the later of the two;
 *   - label = the guest's when set, else the account's;
 *   - settings = the account's when its row exists, else the guest's.
 */
export function mergeDeviceStates(
  account: AccountDevicesSnapshot,
  guest: DevicesStateWrite,
): DevicesStateWrite {
  const byModel = new Map<string, StoredDevice>();
  for (const device of account.devices) byModel.set(device.modelId, device);
  for (const device of guest.devices) {
    const existing = byModel.get(device.modelId);
    if (!existing) {
      byModel.set(device.modelId, device);
      continue;
    }
    byModel.set(device.modelId, {
      modelId: device.modelId,
      label: device.label ?? existing.label,
      lastUsedAt:
        device.lastUsedAt.getTime() > existing.lastUsedAt.getTime()
          ? device.lastUsedAt
          : existing.lastUsedAt,
    });
  }
  return {
    devices: newestFirst([...byModel.values()]),
    settings: account.settings ?? guest.settings,
  };
}

/**
 * «Мої пристрої» in the account (TASK-1959). The guest list never reaches the
 * server on its own — it lives in the browser — so the storefront pushes it in
 * with {@link mergeGuestState} once a session appears, and afterwards mirrors
 * every local change with {@link replaceState}.
 */
@Injectable()
export class MyDevicesService {
  constructor(private readonly repository: MyDevicesRepository) {}

  getState(userId: string): Promise<MyDevicesStateEntity> {
    return this.repository.findState(userId);
  }

  /** `PUT`: the body IS the new state — last write wins. */
  async replaceState(userId: string, dto: MyDevicesDto): Promise<MyDevicesStateEntity> {
    return this.repository.replaceState(userId, await this.sanitize(dto));
  }

  /** `POST /merge`: fold the guest state into the account (rules above). */
  async mergeGuestState(userId: string, dto: MyDevicesDto): Promise<MyDevicesStateEntity> {
    const guest = await this.sanitize(dto);
    return this.repository.mergeState(userId, (account) => mergeDeviceStates(account, guest));
  }

  /**
   * Body → write: one entry per model (the later `lastUsedAt` wins), labels
   * normalised, unknown / inactive models dropped without an error — a model
   * the shop removed must not make the shopper's whole list unsavable.
   */
  private async sanitize(dto: MyDevicesDto): Promise<DevicesStateWrite> {
    const byModel = new Map<string, StoredDevice>();
    for (const input of dto.devices) {
      const device: StoredDevice = {
        modelId: input.modelId,
        label: normalizeLabel(input.label),
        lastUsedAt: new Date(input.lastUsedAt),
      };
      const existing = byModel.get(device.modelId);
      if (!existing || device.lastUsedAt.getTime() > existing.lastUsedAt.getTime()) {
        byModel.set(device.modelId, device);
      }
    }
    const active = new Set(await this.repository.findActiveModelIds([...byModel.keys()]));
    return {
      devices: newestFirst([...byModel.values()].filter((d) => active.has(d.modelId))),
      settings: { compatOnly: dto.settings.compatOnly, compatScope: dto.settings.compatScope },
    };
  }
}
