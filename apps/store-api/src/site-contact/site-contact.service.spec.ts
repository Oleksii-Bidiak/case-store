import { Test, TestingModule } from '@nestjs/testing';
import { SiteContactRepository, SINGLETON_ID } from './site-contact.repository';
import { SiteContactService } from './site-contact.service';
import { SiteContactSettingsEntity } from './entities';

const mockRow = {
  id: SINGLETON_ID,
  email: 'support@mobilestore.ua',
  phone: '+380 44 000 0000',
  workingHours: 'Пн–Нд: 9:00 – 20:00',
  viberLink: null,
  telegramLink: null,
  instagramLink: null,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
};

const repositoryMock = {
  findSettings: jest.fn(),
  upsertSettings: jest.fn(),
};

describe('SiteContactService', () => {
  let service: SiteContactService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [SiteContactService, { provide: SiteContactRepository, useValue: repositoryMock }],
    }).compile();

    service = module.get<SiteContactService>(SiteContactService);
    jest.clearAllMocks();
  });

  describe('getSettings', () => {
    it('returns an empty entity (all null fields) when the row is unseeded', async () => {
      repositoryMock.findSettings.mockResolvedValue(null);

      const result = await service.getSettings();

      expect(result).toBeInstanceOf(SiteContactSettingsEntity);
      expect(result.email).toBeNull();
      expect(result.phone).toBeNull();
      expect(result.workingHours).toBeNull();
      expect(result.viberLink).toBeNull();
    });

    it('returns a mapped entity when the row exists', async () => {
      repositoryMock.findSettings.mockResolvedValue(mockRow);

      const result = await service.getSettings();

      expect(result).toBeInstanceOf(SiteContactSettingsEntity);
      expect(result.email).toBe('support@mobilestore.ua');
      expect(result.phone).toBe('+380 44 000 0000');
      expect(result.workingHours).toBe('Пн–Нд: 9:00 – 20:00');
    });
  });

  describe('updateSettings', () => {
    it('upserts via the repository and maps the result to an entity', async () => {
      const dto = { email: 'hello@test.ua', phone: '+380 67 000 0000' };
      repositoryMock.upsertSettings.mockResolvedValue({ ...mockRow, ...dto });

      const result = await service.updateSettings(dto);

      expect(repositoryMock.upsertSettings).toHaveBeenCalledWith(dto);
      expect(result).toBeInstanceOf(SiteContactSettingsEntity);
      expect(result.email).toBe('hello@test.ua');
      expect(result.phone).toBe('+380 67 000 0000');
    });
  });
});
