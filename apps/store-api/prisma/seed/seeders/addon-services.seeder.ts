import { PrismaClient } from '@prisma/client';
import { categoryTemplates, deltas, expectedAddons, servicesData } from '../data/addons.data';
import {
  AddonApplicabilityResolver,
  AddonServiceRepository,
  CategoryRepository,
} from '../lib/domain';

/**
 * Add-on services / protection plans (TASK-174).
 *
 * Seeds the catalog plus a worked example of the whole applicability model, so
 * inheritance can be exercised in dev/QA without any manual admin entry:
 *   - a CategoryAddonTemplate on the PARENT `smartphones` category — every
 *     product in its `iphone` subcategory (which has no template of its own)
 *     inherits it via nearest-ancestor-wins;
 *   - one delta of EACH type on three distinct iPhone products — an exclusive
 *     ADD, a REMOVE opt-out, and a price OVERRIDE;
 *   - (TASK-2569) a child template that replaces its parent's («Samsung»), a
 *     second tree («Навушники»), an inactive service and a priced ADD — see
 *     `addons.data.ts`. The resolver is asked to confirm the outcome at the end.
 */
export async function seedAddonServices(
  prisma: PrismaClient,
  categories: Record<string, { id: string }>,
) {
  // `AddonService.name` is not unique in the schema (an admin may legitimately
  // reuse a name), so the seed is made idempotent by name lookup rather than by
  // `upsert` — re-running it updates the existing row instead of duplicating it.
  const services: Record<string, { id: string }> = {};
  for (const s of servicesData) {
    const existing = await prisma.addonService.findFirst({ where: { name: s.name } });
    const record = existing
      ? await prisma.addonService.update({ where: { id: existing.id }, data: s })
      : await prisma.addonService.create({ data: s });
    services[s.name] = record;
  }

  const inactive = servicesData.filter((s) => s.isActive === false).length;
  console.log(`  ✓ AddonServices: ${servicesData.length} services (${inactive} inactive)`);

  // Templates on the planned categories. Replaced wholesale for the same reason
  // as the deltas below: dropping a name from `categoryTemplates` has to actually
  // remove the row, or the category keeps offering a service the data stopped
  // declaring. Scoped to the planned categories × seeded services.
  const templateCategoryIds = categoryTemplates.map((t) => {
    const category = categories[t.categorySlug];
    if (!category) throw new Error(`seedAddonServices: unknown category "${t.categorySlug}"`);
    return category.id;
  });
  await prisma.categoryAddonTemplate.deleteMany({
    where: {
      categoryId: { in: templateCategoryIds },
      addonServiceId: { in: Object.values(services).map((s) => s.id) },
    },
  });
  await prisma.categoryAddonTemplate.createMany({
    data: categoryTemplates.flatMap((t) =>
      t.serviceNames.map((name) => ({
        categoryId: categories[t.categorySlug].id,
        addonServiceId: services[name].id,
      })),
    ),
  });

  console.log(
    `  ✓ CategoryAddonTemplate: ${categoryTemplates
      .map((t) => `${t.categorySlug} ${t.serviceNames.length}`)
      .join(', ')} (a child template replaces its parent's)`,
  );

  // One delta of each type, on the three iPhone positions named in the data.
  const productIdBySlug = new Map(
    (
      await prisma.product.findMany({
        where: { slug: { in: deltas.map((d) => d.positionSlug) } },
        select: { id: true, slug: true },
      })
    ).map((p) => [p.slug, p.id]),
  );

  const missing = deltas.map((d) => d.positionSlug).filter((slug) => !productIdBySlug.has(slug));
  if (missing.length) {
    throw new Error(
      `seedAddonServices: addons.data.ts targets position(s) that do not exist: ${missing.join(', ')}. ` +
        'Position slugs come from data/catalogue/** (entry slug + variant slugPart).',
    );
  }

  // Replace the deltas on the seeded services wholesale, rather than upserting
  // the three the data names.
  //
  // Upserting alone is not enough. The targets used to be picked
  // non-deterministically (`orderBy: createdAt, take: 3` over positions that share
  // a millisecond), so a dev database seeded before this change carries deltas on
  // whichever products happened to come back on each earlier run — five rows where
  // the data declares three, sitting on products nobody can explain. Same trap the
  // moderation queue fell into (see `reviews.seeder.ts`): moving from an implicit
  // target to an explicit one has to clean up after the implicit one. Deleting only
  // by `productId` would not do it either — a stale row on a *planned* product but a
  // different service survives that filter. The pair is the identity, so the whole
  // set goes.
  //
  // Scoped to the four seeded services, so an add-on an admin created in the panel
  // keeps its deltas. A delta an admin attached to a *seeded* service counts as
  // seed-owned demo data and is replaced — the same wholesale rule the seed already
  // applies to group axes, images and reviews.
  const seededServiceIds = Object.values(services).map((s) => s.id);
  await prisma.addonServiceDelta.deleteMany({
    where: { addonServiceId: { in: seededServiceIds } },
  });
  await prisma.addonServiceDelta.createMany({
    data: deltas.map((d) => ({
      productId: productIdBySlug.get(d.positionSlug)!,
      addonServiceId: services[d.serviceName].id,
      type: d.type,
      price: d.price ?? null,
    })),
  });

  console.log(`  ✓ AddonServiceDelta: ${deltas.length} deltas (ADD / REMOVE / OVERRIDE)`);

  await assertResolvedAddons(prisma);
}

/**
 * Ask the real applicability resolver what checkout would offer on a few
 * positions and compare with `expectedAddons` — the seed's claim about the
 * override, the inactive service and the priced ADD, checked by the domain.
 */
async function assertResolvedAddons(prisma: PrismaClient) {
  const repo = prisma as unknown as ConstructorParameters<typeof AddonServiceRepository>[0];
  const resolver = new AddonApplicabilityResolver(
    new AddonServiceRepository(repo),
    // The slug-redirect repository is not on the resolver's read path.
    new CategoryRepository(repo, null as never),
  );
  const products = await prisma.product.findMany({
    where: { slug: { in: expectedAddons.map((e) => e.positionSlug) } },
    select: { id: true, slug: true, categoryId: true },
  });
  const resolved = await resolver.resolveForProducts(products);
  for (const expected of expectedAddons) {
    const product = products.find((p) => p.slug === expected.positionSlug);
    if (!product) throw new Error(`seedAddonServices: no position "${expected.positionSlug}"`);
    const actual = Object.fromEntries(
      (resolved.get(product.id) ?? []).map((a) => [a.name, Number(a.price)]),
    );
    const want = JSON.stringify(expected.addons, Object.keys(expected.addons).sort());
    const got = JSON.stringify(actual, Object.keys(actual).sort());
    if (want !== got) {
      throw new Error(
        `seedAddonServices: the resolver offers ${got} on "${expected.positionSlug}", ` +
          `addons.data.ts expects ${want}`,
      );
    }
  }
}
