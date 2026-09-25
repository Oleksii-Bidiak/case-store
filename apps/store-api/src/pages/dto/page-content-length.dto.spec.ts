import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { MAX_RICH_TEXT_CONTENT_LENGTH } from '../../common/sanitize';
import { CreatePageDto } from './create-page.dto';
import { UpdatePageDto } from './update-page.dto';

/**
 * TASK-571 — `Page.content` had no length limit at all, so a content manager
 * could park base64 blobs in the database. Only the `content` errors are read,
 * so the rest of each DTO can evolve without touching this spec.
 */
const contentErrors = async (
  dto: typeof CreatePageDto | typeof UpdatePageDto,
  content: string,
): Promise<string[]> => {
  const errors = await validate(plainToInstance(dto, { title: 'T', content }));
  return errors
    .filter((e) => e.property === 'content')
    .flatMap((e) => Object.keys(e.constraints ?? {}));
};

describe.each([
  ['CreatePageDto', CreatePageDto],
  ['UpdatePageDto', UpdatePageDto],
])('%s content length (TASK-571)', (_name, dto) => {
  it('accepts a body exactly at the limit', async () => {
    expect(await contentErrors(dto, 'a'.repeat(MAX_RICH_TEXT_CONTENT_LENGTH))).toEqual([]);
  });

  it('rejects a body one character over the limit', async () => {
    expect(await contentErrors(dto, 'a'.repeat(MAX_RICH_TEXT_CONTENT_LENGTH + 1))).toEqual([
      'maxLength',
    ]);
  });
});
