import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AttachImageDto } from './attach-image.dto';

/**
 * TASK-808. `mediaAssetId` is an id the database issued (the operator picks an
 * asset the admin just listed), so it follows the TASK-397 rule: shape-checked
 * with `'loose'`, not version-checked. Under the old mode-less `@IsUUID()`
 * (validator's `'all'`) the ids below answered 400.
 */
const errorsFor = (mediaAssetId: unknown) =>
  validate(plainToInstance(AttachImageDto, { mediaAssetId }));

describe('AttachImageDto — mediaAssetId (TASK-808)', () => {
  it.each([
    ['a version nibble outside [1-8]', 'aaaaaaaa-bbbb-0ccc-0ddd-eeeeeeeeeeee'],
    ['a variant nibble outside [89ab]', '3f2a9c10-1b2c-4d3e-7f40-123456789abc'],
    ['a sha1-shaped legacy seed id', '1e8a6f0b-7c2d-a3e4-f5a6-b7c8d9e0f1a2'],
    ['a valid v4 id', '550e8400-e29b-41d4-a716-446655440000'],
  ])('accepts %s', async (_label, id) => {
    expect(await errorsFor(id)).toHaveLength(0);
  });

  it.each([
    ['not a uuid at all', 'not-a-uuid'],
    ['a uuid missing a group', 'aaaaaaaa-bbbb-cccc-eeeeeeeeeeee'],
    ['a non-hex character', 'zaaaaaaa-bbbb-0ccc-0ddd-eeeeeeeeeeee'],
    ['an empty string', ''],
    ['a missing value', undefined],
  ])('still rejects %s', async (_label, id) => {
    const errors = await errorsFor(id);
    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('mediaAssetId');
  });
});
