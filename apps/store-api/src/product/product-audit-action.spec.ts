import { entityTypeFromController } from '../audit/audit.interceptor';
import { ProductController } from './product.controller';
import { PRODUCT_DELETE_AUDIT } from './product.constants';

/**
 * The «who deleted it» of the admin product list (TASK-1830) reads the action log by
 * the action name `AuditInterceptor` derives from the controller class and handler
 * name. Nothing else ties the two together: renaming `ProductController.remove` would
 * silently empty `deletedBy` on every row. This spec is that tie.
 */
describe('PRODUCT_DELETE_AUDIT', () => {
  it('is the action AuditInterceptor records for DELETE /api/products/:id', () => {
    const entityType = entityTypeFromController(ProductController.name);

    expect(PRODUCT_DELETE_AUDIT).toEqual({
      action: `${entityType}.${ProductController.prototype.remove.name}`,
      entityType,
    });
  });
});
