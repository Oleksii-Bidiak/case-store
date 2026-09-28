import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateProductSpecsDto } from './update-product-specs.dto';

const DEFINITION_ID = '550e8400-e29b-41d4-a716-446655440000';

const errorsFor = (value: unknown) =>
  validate(
    plainToInstance(UpdateProductSpecsDto, { specs: [{ definitionId: DEFINITION_ID, value }] }),
  );

/**
 * TASK-514 guards facet values on the definition's OPTIONS, not here. This DTO
 * cannot see a definition's type, and the values a separator rule would catch
 * on this path are free-text specs that never become facets — refusing them
 * would make every protective case in the catalogue unsavable.
 */
describe('UpdateProductSpecsDto — values (TASK-514)', () => {
  it('keeps a free-text value with commas savable', async () => {
    expect(await errorsFor('Посилені кути, бортик над екраном 1.2 мм')).toHaveLength(0);
  });

  it('still requires a string value', async () => {
    expect(await errorsFor(12)).not.toHaveLength(0);
  });
});
