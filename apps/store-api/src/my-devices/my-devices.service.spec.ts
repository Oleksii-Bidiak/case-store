import { Test, TestingModule } from '@nestjs/testing';
import { MyDevicesService } from './my-devices.service';
import { MyDevicesRepository } from './my-devices.repository';
import type { MyDevicesDto } from './dto';
import type { AccountDevicesSnapshot, DevicesStateWrite } from './my-devices.types';
import { MAX_MY_DEVICES } from './my-devices.constants';

/**
 * «Мої пристрої» in the account (TASK-1959). The service owns the merge and
 * replace RULES; the repository owns atomicity. `mergeState` hands the service's
 * pure merge to the repository, which runs it inside its transaction against the
 * account rows it just read — so these tests capture what that function returns
 * for a given account snapshot.
 */

const USER_ID = 'user-uuid-1';
const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const C = '33333333-3333-4333-8333-333333333333';
const UNKNOWN = '99999999-9999-4999-8999-999999999999';

const at = (ms: number) => new Date(ms);
const iso = (ms: number) => new Date(ms).toISOString();

const STATE = { devices: [], settings: { compatOnly: true, compatScope: 'active' } };

const repositoryMock = {
  findState: jest.fn(),
  findActiveModelIds: jest.fn(),
  replaceState: jest.fn(),
  mergeState: jest.fn(),
};

/** Run the merge against `account` and return what it would write. */
let account: AccountDevicesSnapshot;
let mergedWrite: DevicesStateWrite | undefined;

function body(
  devices: Array<{ modelId: string; label?: string | null; lastUsedAt: number }>,
  settings: MyDevicesDto['settings'] = { compatOnly: true, compatScope: 'active' },
): MyDevicesDto {
  return {
    devices: devices.map((d) => ({ ...d, lastUsedAt: iso(d.lastUsedAt) })),
    settings,
  } as MyDevicesDto;
}

describe('MyDevicesService', () => {
  let service: MyDevicesService;

  beforeEach(async () => {
    jest.clearAllMocks();
    account = { devices: [], settings: null };
    mergedWrite = undefined;
    // Every requested id is a known, active model unless a test says otherwise.
    repositoryMock.findActiveModelIds.mockImplementation((ids: string[]) =>
      Promise.resolve(ids.filter((id) => id !== UNKNOWN)),
    );
    repositoryMock.mergeState.mockImplementation(
      (_userId: string, compute: (a: AccountDevicesSnapshot) => DevicesStateWrite) => {
        mergedWrite = compute(account);
        return Promise.resolve(STATE);
      },
    );
    repositoryMock.replaceState.mockResolvedValue(STATE);
    repositoryMock.findState.mockResolvedValue(STATE);

    const module: TestingModule = await Test.createTestingModule({
      providers: [MyDevicesService, { provide: MyDevicesRepository, useValue: repositoryMock }],
    }).compile();

    service = module.get(MyDevicesService);
  });

  // ─── GET ──────────────────────────────────────────────────────────────────

  describe('getState', () => {
    it('reads the state of the authenticated user only', async () => {
      await expect(service.getState(USER_ID)).resolves.toBe(STATE);
      expect(repositoryMock.findState).toHaveBeenCalledWith(USER_ID);
    });
  });

  // ─── POST /merge ──────────────────────────────────────────────────────────

  describe('mergeGuestState', () => {
    it('unions the guest and account lists by modelId', async () => {
      account = { devices: [{ modelId: A, label: null, lastUsedAt: at(100) }], settings: null };

      await service.mergeGuestState(USER_ID, body([{ modelId: B, lastUsedAt: 200 }]));

      expect(mergedWrite!.devices.map((d) => d.modelId).sort()).toEqual([A, B].sort());
    });

    it('keeps one row per model with the LATER lastUsedAt of the two', async () => {
      account = {
        devices: [
          { modelId: A, label: null, lastUsedAt: at(500) },
          { modelId: B, label: null, lastUsedAt: at(100) },
        ],
        settings: null,
      };

      await service.mergeGuestState(
        USER_ID,
        body([
          { modelId: A, lastUsedAt: 300 },
          { modelId: B, lastUsedAt: 900 },
        ]),
      );

      expect(mergedWrite!.devices).toEqual([
        { modelId: B, label: null, lastUsedAt: at(900) },
        { modelId: A, label: null, lastUsedAt: at(500) },
      ]);
    });

    it('takes the guest label when the guest set one', async () => {
      account = { devices: [{ modelId: A, label: 'Мама', lastUsedAt: at(100) }], settings: null };

      await service.mergeGuestState(
        USER_ID,
        body([{ modelId: A, label: 'Робочий', lastUsedAt: 50 }]),
      );

      expect(mergedWrite!.devices[0].label).toBe('Робочий');
    });

    it('keeps the account label when the guest has none (absent, null or blank)', async () => {
      account = {
        devices: [
          { modelId: A, label: 'Мама', lastUsedAt: at(100) },
          { modelId: B, label: 'Тато', lastUsedAt: at(90) },
          { modelId: C, label: 'Син', lastUsedAt: at(80) },
        ],
        settings: null,
      };

      await service.mergeGuestState(
        USER_ID,
        body([
          { modelId: A, lastUsedAt: 50 },
          { modelId: B, label: null, lastUsedAt: 50 },
          { modelId: C, label: '   ', lastUsedAt: 50 },
        ]),
      );

      expect(Object.fromEntries(mergedWrite!.devices.map((d) => [d.modelId, d.label]))).toEqual({
        [A]: 'Мама',
        [B]: 'Тато',
        [C]: 'Син',
      });
    });

    it('keeps the account settings when the account already has a settings row', async () => {
      account = { devices: [], settings: { compatOnly: false, compatScope: 'active' } };

      await service.mergeGuestState(USER_ID, body([], { compatOnly: true, compatScope: 'all' }));

      expect(mergedWrite!.settings).toEqual({ compatOnly: false, compatScope: 'active' });
    });

    it('adopts the guest settings when the account has no settings row yet', async () => {
      account = { devices: [], settings: null };

      await service.mergeGuestState(USER_ID, body([], { compatOnly: false, compatScope: 'all' }));

      expect(mergedWrite!.settings).toEqual({ compatOnly: false, compatScope: 'all' });
    });

    it('silently drops guest devices whose model is unknown or inactive', async () => {
      account = { devices: [{ modelId: A, label: null, lastUsedAt: at(100) }], settings: null };

      await service.mergeGuestState(
        USER_ID,
        body([
          { modelId: UNKNOWN, lastUsedAt: 900 },
          { modelId: B, lastUsedAt: 200 },
        ]),
      );

      expect(mergedWrite!.devices.map((d) => d.modelId)).toEqual([B, A]);
    });

    it(`bounds the merged list to the ${MAX_MY_DEVICES} most recent devices`, async () => {
      const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
      account = {
        devices: Array.from({ length: 80 }, (_, i) => ({
          modelId: id(i),
          label: null,
          lastUsedAt: at(i), // 0…79 — the oldest
        })),
        settings: null,
      };

      await service.mergeGuestState(
        USER_ID,
        body(
          Array.from({ length: 30 }, (_, i) => ({ modelId: id(100 + i), lastUsedAt: 1000 + i })),
        ),
      );

      expect(mergedWrite!.devices).toHaveLength(MAX_MY_DEVICES);
      // The ten oldest account devices (lastUsedAt 0…9) are the ones cut.
      expect(mergedWrite!.devices.map((d) => d.modelId)).not.toContain(id(9));
      expect(mergedWrite!.devices.map((d) => d.modelId)).toContain(id(10));
    });

    it('merges into the authenticated user and returns the repository state', async () => {
      await expect(
        service.mergeGuestState(USER_ID, body([{ modelId: A, lastUsedAt: 1 }])),
      ).resolves.toBe(STATE);
      expect(repositoryMock.mergeState).toHaveBeenCalledWith(USER_ID, expect.any(Function));
      expect(repositoryMock.replaceState).not.toHaveBeenCalled();
    });
  });

  // ─── PUT ──────────────────────────────────────────────────────────────────

  describe('replaceState', () => {
    it('replaces the whole account state with the body — no merge with what is stored', async () => {
      await service.replaceState(
        USER_ID,
        body([{ modelId: A, label: 'Мама', lastUsedAt: 100 }], {
          compatOnly: false,
          compatScope: 'all',
        }),
      );

      expect(repositoryMock.mergeState).not.toHaveBeenCalled();
      expect(repositoryMock.replaceState).toHaveBeenCalledWith(USER_ID, {
        devices: [{ modelId: A, label: 'Мама', lastUsedAt: at(100) }],
        settings: { compatOnly: false, compatScope: 'all' },
      });
    });

    it('accepts an empty list (the user forgot every device)', async () => {
      await service.replaceState(USER_ID, body([]));

      expect(repositoryMock.replaceState).toHaveBeenCalledWith(
        USER_ID,
        expect.objectContaining({ devices: [] }),
      );
    });

    it('silently drops devices whose model is unknown or inactive', async () => {
      await service.replaceState(
        USER_ID,
        body([
          { modelId: A, lastUsedAt: 100 },
          { modelId: UNKNOWN, lastUsedAt: 200 },
        ]),
      );

      const write = repositoryMock.replaceState.mock.calls[0][1] as DevicesStateWrite;
      expect(write.devices.map((d) => d.modelId)).toEqual([A]);
    });

    it('collapses a model sent twice into one row with the later lastUsedAt', async () => {
      await service.replaceState(
        USER_ID,
        body([
          { modelId: A, label: 'Старий', lastUsedAt: 100 },
          { modelId: A, label: 'Новий', lastUsedAt: 300 },
        ]),
      );

      const write = repositoryMock.replaceState.mock.calls[0][1] as DevicesStateWrite;
      expect(write.devices).toEqual([{ modelId: A, label: 'Новий', lastUsedAt: at(300) }]);
    });

    it('normalises labels: trims, collapses spaces, blank → null', async () => {
      await service.replaceState(
        USER_ID,
        body([
          { modelId: A, label: '  Моя   мама ', lastUsedAt: 200 },
          { modelId: B, label: '   ', lastUsedAt: 100 },
        ]),
      );

      const write = repositoryMock.replaceState.mock.calls[0][1] as DevicesStateWrite;
      expect(write.devices.map((d) => d.label)).toEqual(['Моя мама', null]);
    });

    it('returns the state the repository read back', async () => {
      await expect(service.replaceState(USER_ID, body([]))).resolves.toBe(STATE);
    });
  });
});
