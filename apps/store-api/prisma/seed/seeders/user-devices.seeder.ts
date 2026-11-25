import { PrismaClient } from '@prisma/client';
import {
  MAX_DEVICE_LABEL_LENGTH,
  MAX_MY_DEVICES,
} from '../../../src/my-devices/my-devices.constants';
import { userDevicePlans } from '../data/user-devices.data';
import type { SeededUser } from '../types';

const HOUR_MS = 60 * 60 * 1000;

/**
 * Saved devices («Мої пристрої») for a few demo customers (TASK-2569).
 *
 * Rows upsert on the domain's own key `(userId, deviceModelId)`, and
 * `lastUsedAt` is rewritten from `now` on every run, so the active device (the
 * latest `lastUsedAt`) is the same one on every demo day. Only planned models
 * are touched; a device the customer added through the storefront stays.
 *
 * Planned states are checked against the domain's bounds before writing: an
 * unknown or inactive model would be dropped by `MyDevicesService.sanitize`, a
 * label over the cap would be cut, so either is a seed bug, not data.
 */
export async function seedUserDevices(prisma: PrismaClient, customers: SeededUser[]) {
  const userByEmail = new Map(customers.map((c) => [c.email, c.id]));
  const slugs = [...new Set(userDevicePlans.flatMap((p) => p.devices.map((d) => d.modelSlug)))];
  const models = await prisma.deviceModel.findMany({
    where: { slug: { in: slugs }, isActive: true },
    select: { id: true, slug: true },
  });
  const modelBySlug = new Map(models.map((m) => [m.slug, m.id]));

  const now = Date.now();
  let deviceCount = 0;
  let settingsCount = 0;

  for (const plan of userDevicePlans) {
    const userId = userByEmail.get(plan.email);
    if (!userId) throw new Error(`seedUserDevices: no seeded customer ${plan.email}`);
    if (plan.devices.length > MAX_MY_DEVICES) {
      throw new Error(`seedUserDevices: ${plan.email} plans more than ${MAX_MY_DEVICES} devices`);
    }

    for (const device of plan.devices) {
      const deviceModelId = modelBySlug.get(device.modelSlug);
      if (!deviceModelId) {
        throw new Error(
          `seedUserDevices: "${device.modelSlug}" is not an active device model (devices.data.ts)`,
        );
      }
      if (device.label && device.label.length > MAX_DEVICE_LABEL_LENGTH) {
        throw new Error(
          `seedUserDevices: label "${device.label}" exceeds ${MAX_DEVICE_LABEL_LENGTH} characters`,
        );
      }
      const fields = { label: device.label, lastUsedAt: new Date(now - device.hoursAgo * HOUR_MS) };
      await prisma.userDevice.upsert({
        where: { userId_deviceModelId: { userId, deviceModelId } },
        update: fields,
        create: { userId, deviceModelId, ...fields },
      });
      deviceCount++;
    }

    if (plan.settings) {
      await prisma.userDeviceSettings.upsert({
        where: { userId },
        update: plan.settings,
        create: { userId, ...plan.settings },
      });
      settingsCount++;
    }
  }

  console.log(
    `  ✓ Saved devices: ${deviceCount} across ${userDevicePlans.length} customers, ` +
      `${settingsCount} settings rows`,
  );
}
