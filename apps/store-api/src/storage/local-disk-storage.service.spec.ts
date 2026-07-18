import { ConfigService } from '@nestjs/config';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LocalDiskStorageService } from './local-disk-storage.service';
import { BRANDING_SUBDIR, PRODUCTS_SUBDIR, StorageSubdir } from './storage-subdirs';

describe('LocalDiskStorageService', () => {
  let uploadRoot: string;
  let service: LocalDiskStorageService;

  beforeEach(async () => {
    uploadRoot = await mkdtemp(join(tmpdir(), 'case-store-uploads-'));
    service = new LocalDiskStorageService({
      get: () => uploadRoot,
    } as unknown as ConfigService);
  });

  afterEach(async () => {
    await rm(uploadRoot, { recursive: true, force: true });
  });

  describe('save', () => {
    it('writes into the requested sub-directory and returns a URL-relative path', async () => {
      const relativePath = await service.save(Buffer.from('logo'), 'svg', BRANDING_SUBDIR);

      expect(relativePath).toMatch(/^branding\/[0-9a-f-]{36}\.svg$/);
      const written = await readFile(join(uploadRoot, relativePath), 'utf8');
      expect(written).toBe('logo');
    });

    it('keeps product images in their own sub-directory', async () => {
      const relativePath = await service.save(Buffer.from('img'), 'webp', PRODUCTS_SUBDIR);

      expect(relativePath.startsWith('products/')).toBe(true);
      expect(existsSync(join(uploadRoot, relativePath))).toBe(true);
    });

    it('refuses a sub-directory that is not whitelisted', async () => {
      await expect(
        service.save(Buffer.from('x'), 'svg', '../../etc' as unknown as StorageSubdir),
      ).rejects.toThrow(/non-whitelisted sub-directory/);
    });

    it('refuses an extension that could alter the written path', async () => {
      await expect(
        service.save(Buffer.from('x'), '../../evil.html', BRANDING_SUBDIR),
      ).rejects.toThrow(/unsafe extension/);
    });
  });

  describe('delete', () => {
    it('removes a file inside a whitelisted sub-directory', async () => {
      const relativePath = await service.save(Buffer.from('logo'), 'svg', BRANDING_SUBDIR);

      await service.delete(relativePath);

      expect(existsSync(join(uploadRoot, relativePath))).toBe(false);
    });

    it('does not throw when the file is already gone (disk/DB divergence)', async () => {
      await expect(service.delete('branding/does-not-exist.svg')).resolves.toBeUndefined();
    });

    it('refuses to traverse out of the upload root', async () => {
      const outside = join(uploadRoot, '..', 'victim.txt');
      await writeFile(outside, 'secret');

      await service.delete('branding/../../victim.txt');

      expect(existsSync(outside)).toBe(true);
      await rm(outside, { force: true });
    });

    it('refuses a path whose first segment is not a whitelisted sub-directory', async () => {
      const secrets = join(uploadRoot, 'secrets');
      await mkdir(secrets, { recursive: true });
      const target = join(secrets, 'keys.txt');
      await writeFile(target, 'secret');

      await service.delete('secrets/keys.txt');

      expect(existsSync(target)).toBe(true);
    });

    it('refuses a sibling directory that merely shares the sub-directory prefix', async () => {
      // `startsWith(<root>/products)` alone would happily match `<root>/products-evil`.
      const sibling = join(uploadRoot, 'products-evil');
      await mkdir(sibling, { recursive: true });
      const target = join(sibling, 'x.txt');
      await writeFile(target, 'secret');

      await service.delete('products-evil/x.txt');

      expect(existsSync(target)).toBe(true);
    });
  });
});
