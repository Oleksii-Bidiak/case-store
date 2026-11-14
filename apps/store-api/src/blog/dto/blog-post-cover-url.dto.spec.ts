import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateBlogPostDto } from './create-blog-post.dto';
import { UpdateBlogPostDto } from './update-blog-post.dto';

/**
 * TASK-1984 (forms Rule 5) — the cover link follows the admin's `isHttpUrl`: an
 * absolute http(s) URL. Only the `coverImageUrl` errors are read.
 */
const coverErrors = async (
  dto: typeof CreateBlogPostDto | typeof UpdateBlogPostDto,
  coverImageUrl: string,
): Promise<string[]> => {
  const errors = await validate(plainToInstance(dto, { coverImageUrl }));
  return errors
    .filter((e) => e.property === 'coverImageUrl')
    .flatMap((e) => Object.keys(e.constraints ?? {}));
};

describe.each([
  ['CreateBlogPostDto', CreateBlogPostDto],
  ['UpdateBlogPostDto', UpdateBlogPostDto],
])('%s coverImageUrl (TASK-1984)', (_name, dto) => {
  it.each(['https://cdn.example.com/blog/a.jpg', 'http://localhost:3001/uploads/a.jpg'])(
    'accepts %s',
    async (url) => {
      expect(await coverErrors(dto, url)).toEqual([]);
    },
  );

  it.each(['cdn.example.com/blog/a.jpg', 'ftp://cdn.example.com/a.jpg', 'mailto:a@b.c'])(
    'refuses %s',
    async (url) => {
      expect(await coverErrors(dto, url)).toContain('isUrl');
    },
  );
});
