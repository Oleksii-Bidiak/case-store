import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { IsOptional } from 'class-validator';
import { IsDeviceSlugList, MAX_DEVICE_FILTER_SLUGS, parseDeviceSlugs } from './device-slug-list';
import { SLUG_MAX_LENGTH } from './slug-filter.dto-util';

class Probe {
  @IsOptional()
  @IsDeviceSlugList()
  device?: string;
}

async function errorsFor(device: unknown): Promise<number> {
  const errors = await validate(plainToInstance(Probe, { device }));
  return errors.length;
}

describe('parseDeviceSlugs (TASK-2077)', () => {
  it('reads the classic single slug as a list of one', () => {
    expect(parseDeviceSlugs('iphone-15')).toEqual(['iphone-15']);
  });

  it('splits, trims, drops empties and dedupes', () => {
    expect(parseDeviceSlugs(' iphone-15 ,,galaxy-s24,iphone-15, ')).toEqual([
      'iphone-15',
      'galaxy-s24',
    ]);
  });

  it('returns [] for an absent value', () => {
    expect(parseDeviceSlugs(undefined)).toEqual([]);
  });
});

describe('IsDeviceSlugList (TASK-2077)', () => {
  const slugs = (n: number) => Array.from({ length: n }, (_, i) => `model-${i}`).join(',');

  it('accepts one slug and a list up to the cap', async () => {
    expect(await errorsFor('iphone-15')).toBe(0);
    expect(await errorsFor(slugs(MAX_DEVICE_FILTER_SLUGS))).toBe(0);
  });

  it(`rejects more than ${MAX_DEVICE_FILTER_SLUGS} distinct slugs`, async () => {
    expect(await errorsFor(slugs(MAX_DEVICE_FILTER_SLUGS + 1))).toBe(1);
  });

  it('does not count a repeated slug against the cap', async () => {
    const repeated = [slugs(MAX_DEVICE_FILTER_SLUGS), 'model-0', 'model-1'].join(',');
    expect(await errorsFor(repeated)).toBe(0);
  });

  it('rejects an over-long slug inside the list', async () => {
    expect(await errorsFor(`iphone-15,${'a'.repeat(SLUG_MAX_LENGTH + 1)}`)).toBe(1);
  });

  it('rejects a non-string', async () => {
    expect(await errorsFor(['iphone-15'])).toBe(1);
  });
});
