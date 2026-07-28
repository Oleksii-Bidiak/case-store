import { Test, TestingModule } from '@nestjs/testing';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { BrandService } from './brand.service';
import { BrandController } from './brand.controller';
import { AdminBrandController } from './admin-brand.controller';
import { PermissionGuard } from '../auth/permissions';

const serviceMock = {
  findAllActive: jest.fn(),
  findAllAdmin: jest.fn(),
  findById: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  setActive: jest.fn(),
};

describe('BrandController (public)', () => {
  let controller: BrandController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [BrandController],
      providers: [{ provide: BrandService, useValue: serviceMock }],
    })
      .overrideGuard(PermissionGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<BrandController>(BrandController);
  });

  it('returns the active brand list envelope from the service', async () => {
    const payload = { data: [] };
    serviceMock.findAllActive.mockResolvedValue(payload);

    const result = await controller.findAll();

    expect(result).toBe(payload);
    expect(serviceMock.findAllActive).toHaveBeenCalledTimes(1);
  });

  it('is NOT admin-guarded (public endpoint)', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, BrandController) ?? [];
    expect(guards).not.toContain(PermissionGuard);
  });
});

describe('AdminBrandController', () => {
  let controller: AdminBrandController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminBrandController],
      providers: [{ provide: BrandService, useValue: serviceMock }],
    })
      .overrideGuard(PermissionGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<AdminBrandController>(AdminBrandController);
  });

  it('is guarded by PermissionGuard at the controller level', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, AdminBrandController) ?? [];
    expect(guards).toContain(PermissionGuard);
  });

  it('returns the paginated list envelope from the service', async () => {
    const payload = { data: [], meta: { total: 0, page: 1, limit: 20, totalPages: 0 } };
    serviceMock.findAllAdmin.mockResolvedValue(payload);

    const result = await controller.findAllAdmin({});

    expect(result).toBe(payload);
  });

  it('wraps findById in a { data } envelope', async () => {
    const brand = { id: 'b1', name: 'Spigen' };
    serviceMock.findById.mockResolvedValue(brand);

    const result = await controller.findById('b1');

    expect(result).toEqual({ data: brand });
  });

  it('wraps create in a { data } envelope', async () => {
    const brand = { id: 'b1', name: 'Spigen' };
    serviceMock.create.mockResolvedValue(brand);

    const result = await controller.create({ name: 'Spigen' });

    expect(result).toEqual({ data: brand });
    expect(serviceMock.create).toHaveBeenCalledWith({ name: 'Spigen' });
  });

  it('wraps update in a { data } envelope', async () => {
    const brand = { id: 'b1', name: 'Spigen UA' };
    serviceMock.update.mockResolvedValue(brand);

    const result = await controller.update('b1', { name: 'Spigen UA' });

    expect(result).toEqual({ data: brand });
    expect(serviceMock.update).toHaveBeenCalledWith('b1', { name: 'Spigen UA' });
  });

  it('toggles status and wraps it in a { data } envelope', async () => {
    const brand = { id: 'b1', isActive: false };
    serviceMock.setActive.mockResolvedValue(brand);

    const result = await controller.setStatus('b1', { isActive: false });

    expect(result).toEqual({ data: brand });
    expect(serviceMock.setActive).toHaveBeenCalledWith('b1', false);
  });
});
