import { Test, TestingModule } from '@nestjs/testing';
import { PermissionGuard } from '../auth/permissions';
import { BlogController } from './blog.controller';
import { AdminBlogController } from './admin-blog.controller';
import { BlogService } from './blog.service';

const serviceMock = {
  findAll: jest.fn(),
  findAllCategories: jest.fn(),
  findPublishedBySlug: jest.fn(),
  findAllAdmin: jest.fn(),
  findByIdAdmin: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  publish: jest.fn(),
  unpublish: jest.fn(),
  delete: jest.fn(),
  findCategoryById: jest.fn(),
  createCategory: jest.fn(),
  updateCategory: jest.fn(),
  deleteCategory: jest.fn(),
};

describe('Blog controllers', () => {
  let publicCtrl: BlogController;
  let adminCtrl: AdminBlogController;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [BlogController, AdminBlogController],
      providers: [{ provide: BlogService, useValue: serviceMock }],
    })
      .overrideGuard(PermissionGuard)
      .useValue({ canActivate: () => true })
      .compile();

    publicCtrl = module.get(BlogController);
    adminCtrl = module.get(AdminBlogController);
  });

  describe('public', () => {
    it('findAll delegates to the service and returns the paginated envelope', async () => {
      const payload = { data: [], meta: { total: 0, page: 1, limit: 9, totalPages: 0 } };
      serviceMock.findAll.mockResolvedValue(payload);

      const result = await publicCtrl.findAll({ page: 1, limit: 9 });

      expect(result).toBe(payload);
      expect(serviceMock.findAll).toHaveBeenCalled();
    });

    it('findCategories wraps the list in a data envelope', async () => {
      serviceMock.findAllCategories.mockResolvedValue([{ slug: 'guides' }]);

      const result = await publicCtrl.findCategories();

      expect(result).toEqual({ data: [{ slug: 'guides' }] });
    });

    it('findBySlug wraps the post in a data envelope', async () => {
      serviceMock.findPublishedBySlug.mockResolvedValue({ slug: 'x' });

      const result = await publicCtrl.findBySlug('x');

      expect(result).toEqual({ data: { slug: 'x' } });
      expect(serviceMock.findPublishedBySlug).toHaveBeenCalledWith('x');
    });
  });

  describe('admin', () => {
    it('create delegates to the service and wraps the post', async () => {
      serviceMock.create.mockResolvedValue({ id: 'p1' });

      const result = await adminCtrl.create({
        title: 'T',
        excerpt: 'e',
        content: '<p>x</p>',
        categoryId: 'c1',
        authorName: 'A',
      });

      expect(result).toEqual({ data: { id: 'p1' } });
    });

    it('publish delegates to the service', async () => {
      serviceMock.publish.mockResolvedValue({ id: 'p1' });

      const result = await adminCtrl.publish('p1');

      expect(result).toEqual({ data: { id: 'p1' } });
      expect(serviceMock.publish).toHaveBeenCalledWith('p1');
    });

    it('deleteCategory delegates to the service', async () => {
      serviceMock.deleteCategory.mockResolvedValue(undefined);

      await adminCtrl.deleteCategory('c1');

      expect(serviceMock.deleteCategory).toHaveBeenCalledWith('c1');
    });
  });
});
