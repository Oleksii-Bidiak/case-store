import { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'crypto';
import { PageKind, Prisma, PublishStatus } from '@prisma/client';
import { PageRepository } from '../src/pages/pages.repository';
import { SlugRedirectRepository, SlugRedirectService } from '../src/slug-redirect';
import { PrismaService } from '../src/prisma';

/**
 * TASK-566 against a real Postgres: a page slug is unique per KIND, and the
 * redirect ledger keeps the two page namespaces apart.
 *
 * Before the fix `/legal/<slug>` and `/info/<slug>` could not coexist (the
 * `pages.slug` key was global), and relaxing that alone would have let an INFO
 * rename overwrite — or its chain collapse repoint — a LEGAL page's redirects of
 * the same slug. Only the live constraint and the live upsert/updateMany prove
 * neither happens.
 */
describe('Page slugs per kind + address-keyed redirects (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let pages: PageRepository;
  let lookup: SlugRedirectService;

  const ns = `it566-${randomUUID().slice(0, 8)}`;
  const slug = (s: string) => `${ns}-${s}`;

  const create = (s: string, kind: PageKind) =>
    pages.create({
      slug: slug(s),
      kind,
      title: `${kind} ${s}`,
      content: '<p>x</p>',
      status: PublishStatus.PUBLISHED,
      publishedAt: new Date(),
      scheduledAt: null,
    });

  const clean = async () => {
    await prisma.slugRedirect.deleteMany({ where: { oldSlug: { startsWith: `${ns}-` } } });
    await prisma.page.deleteMany({ where: { slug: { startsWith: `${ns}-` } } });
  };

  beforeAll(async () => {
    const url = process.env.DATABASE_URL ?? '';
    if (!/test/i.test(url)) {
      throw new Error(`Refusing to run integration tests against a non-test database: "${url}"`);
    }

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true })],
      providers: [PrismaService, SlugRedirectRepository, SlugRedirectService, PageRepository],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    prisma = moduleRef.get(PrismaService);
    pages = moduleRef.get(PageRepository);
    lookup = moduleRef.get(SlugRedirectService);
  });

  afterEach(clean);

  afterAll(async () => {
    if (!prisma) return;
    await clean();
    await app.close();
  });

  it('lets /legal/<slug> and /info/<slug> coexist and still refuses a same-kind duplicate', async () => {
    const legal = await create('delivery', PageKind.LEGAL);
    const info = await create('delivery', PageKind.INFO);

    expect(legal.id).not.toBe(info.id);
    await expect(pages.findBySlugAny(slug('delivery'), PageKind.LEGAL)).resolves.toMatchObject({
      id: legal.id,
    });
    await expect(pages.findBySlugAny(slug('delivery'), PageKind.INFO)).resolves.toMatchObject({
      id: info.id,
    });

    await expect(create('delivery', PageKind.INFO)).rejects.toMatchObject({
      code: 'P2002',
    } satisfies Partial<Prisma.PrismaClientKnownRequestError>);
  });

  it('a HUB row no longer blocks a document of the same slug', async () => {
    await create('contact', PageKind.HUB);

    await expect(create('contact', PageKind.LEGAL)).resolves.toMatchObject({
      kind: PageKind.LEGAL,
    });
  });

  it('renaming the INFO page never overwrites or repoints the LEGAL page redirects of the same slug', async () => {
    const legal = await create('delivery', PageKind.LEGAL);
    const info = await create('delivery', PageKind.INFO);

    await pages.update(
      legal.id,
      { slug: slug('dostavka') },
      {
        from: { kind: PageKind.LEGAL, slug: slug('delivery') },
        to: { kind: PageKind.LEGAL, slug: slug('dostavka') },
      },
    );
    await pages.update(
      info.id,
      { slug: slug('yak-otrymaty') },
      {
        from: { kind: PageKind.INFO, slug: slug('delivery') },
        to: { kind: PageKind.INFO, slug: slug('yak-otrymaty') },
      },
    );

    await expect(lookup.lookup('PAGE', slug('delivery'), 'LEGAL')).resolves.toEqual({
      newSlug: slug('dostavka'),
      newScope: 'LEGAL',
    });
    await expect(lookup.lookup('PAGE', slug('delivery'), 'INFO')).resolves.toEqual({
      newSlug: slug('yak-otrymaty'),
      newScope: 'INFO',
    });
  });

  it('a kind move is resolved to the page new namespace', async () => {
    const page = await create('garantiya', PageKind.LEGAL);

    await pages.update(
      page.id,
      { kind: PageKind.INFO },
      {
        from: { kind: PageKind.LEGAL, slug: slug('garantiya') },
        to: { kind: PageKind.INFO, slug: slug('garantiya') },
      },
    );

    await expect(lookup.lookup('PAGE', slug('garantiya'), 'LEGAL')).resolves.toEqual({
      newSlug: slug('garantiya'),
      newScope: 'INFO',
    });
    await expect(lookup.lookup('PAGE', slug('garantiya'), 'INFO')).resolves.toBeNull();
  });
});
