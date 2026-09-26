import { MODULE_METADATA } from '@nestjs/common/constants';
import { PUBLISHABLE_REPOSITORY } from '../publishing';
import type { BlogIndexer } from '../search/blog-indexer';
import type { BlogRepository } from './blog.repository';
import { BlogPublisher } from './blog.publisher';
import { BlogModule } from './blog.module';

/**
 * TASK-525 — a post that goes live on the scheduler's tick must reach search on
 * that tick, not on the next restart. The scheduler used to call
 * `BlogRepository.publishDue` directly, which flips the rows and tells nobody;
 * `BlogPublisher` is the port it calls now, and it hands every flipped id to the
 * {@link BlogIndexer} seam — the same one `BlogService` uses for an admin's
 * publish button.
 */
describe('BlogPublisher (TASK-525)', () => {
  const repository = { publishDuePosts: jest.fn() };
  const indexer = { index: jest.fn(), remove: jest.fn(), search: jest.fn() };

  function build(): BlogPublisher {
    return new BlogPublisher(
      repository as unknown as BlogRepository,
      indexer as unknown as BlogIndexer,
    );
  }

  beforeEach(() => {
    jest.resetAllMocks();
    indexer.index.mockResolvedValue(undefined);
  });

  it('flips due posts through the repository with the tick instant and returns the count', async () => {
    repository.publishDuePosts.mockResolvedValue(['p-1', 'p-2']);
    const now = new Date('2026-09-25T10:00:00.000Z');

    await expect(build().publishDue(now)).resolves.toBe(2);

    expect(repository.publishDuePosts).toHaveBeenCalledWith(now);
  });

  it('indexes every post it published, through the BlogIndexer seam', async () => {
    repository.publishDuePosts.mockResolvedValue(['p-1', 'p-2']);

    await build().publishDue(new Date());

    expect(indexer.index).toHaveBeenCalledTimes(2);
    expect(indexer.index).toHaveBeenCalledWith('p-1');
    expect(indexer.index).toHaveBeenCalledWith('p-2');
  });

  it('touches the index not at all when nothing was due', async () => {
    repository.publishDuePosts.mockResolvedValue([]);

    await expect(build().publishDue(new Date())).resolves.toBe(0);

    expect(indexer.index).not.toHaveBeenCalled();
  });

  it('still reports the flipped count — and indexes the rest — when one index call throws', async () => {
    // The rows are already PUBLISHED by the time the index is asked. A throw
    // here would reach the scheduler as a failed tick and skip the storefront
    // revalidation for posts that ARE live — trading a stale search for a stale
    // hub. Indexing is best-effort; the publish is not.
    repository.publishDuePosts.mockResolvedValue(['p-1', 'p-2']);
    indexer.index.mockRejectedValueOnce(new Error('engine down'));

    await expect(build().publishDue(new Date())).resolves.toBe(2);

    expect(indexer.index).toHaveBeenCalledWith('p-2');
  });

  it('asks the scheduler to purge the blog collection when it published something', () => {
    expect(build().revalidateTarget).toEqual({ tags: ['blog'], paths: ['/blog'] });
  });

  it('is what BlogModule registers under PUBLISHABLE_REPOSITORY — not the bare repository', () => {
    const providers = Reflect.getMetadata(MODULE_METADATA.PROVIDERS, BlogModule) as unknown[];

    expect(providers).toContainEqual({
      provide: PUBLISHABLE_REPOSITORY,
      useExisting: BlogPublisher,
    });
    expect(providers).toContain(BlogPublisher);
  });
});
