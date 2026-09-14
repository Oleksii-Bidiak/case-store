/**
 * The catalogue of every permission that exists (TASK-334, plan 164).
 *
 * WHY THIS IS CODE AND NOT DATA: a permission exists because an endpoint exists.
 * `products:write` is meaningful only because `PATCH /admin/products/:id` is
 * there — it is a property of the code, so it belongs with the code, where
 * TypeScript can check it (`@RequirePermission('produtcs:write')` does not
 * compile) and where a reviewer sees it in the diff. A catalogue kept only in the
 * database drifts the moment someone ships an endpoint without adding a row, and
 * that drift is silent in the dangerous direction.
 *
 * WHAT IS DATA: which PERSON holds which of these. That lives in `UserPermission`
 * (TASK-475) and the owner edits it without a release. It used to live on the
 * ROLE; two managers in a real shop are never the same job, so it does not.
 *
 * ZONES are a display grouping, carried as a field on each permission rather than
 * kept as a separate list. The granting screen groups by `zone` dynamically, so a
 * new admin section appears there simply by being declared here — no UI change, no
 * migration. A zone that grows too coarse is split by editing one field, and the
 * screen follows.
 *
 * DEFAULT IS DENIED. A permission with no `UserPermission` row is granted to
 * nobody below admin level. So shipping a new admin section never silently hands
 * it to an existing MANAGER.
 *
 * THREE LEVELS READ THIS CATALOGUE DIFFERENTLY (plan 178, decision 1):
 *   - the OWNER (`User.isOwner`, exactly one) holds everything, plus the reserve
 *     `@OwnerOnly` marks — the four doors that decide who runs the shop;
 *   - an ADMIN holds every permission in here without a single row of their own,
 *     but never the reserve;
 *   - a MANAGER holds exactly their own rows.
 */

/** Display grouping for the granting screen. */
export const PERMISSION_ZONES = {
  ORDERS: 'orders',
  CATALOG: 'catalog',
  CONTENT: 'content',
  MARKETING: 'marketing',
  CUSTOMERS: 'customers',
  SUPPORT: 'support',
  SETTINGS: 'settings',
  ANALYTICS: 'analytics',
  /** Non-grantable by construction — see {@link GRANTABLE_PERMISSIONS}. */
  STAFF: 'staff',
} as const;

export type PermissionZone = (typeof PERMISSION_ZONES)[keyof typeof PERMISSION_ZONES];

/** Ukrainian zone labels for the admin UI, in the order they should be shown. */
export const PERMISSION_ZONE_LABELS: ReadonlyArray<{ zone: PermissionZone; label: string }> = [
  { zone: PERMISSION_ZONES.ORDERS, label: 'Замовлення' },
  { zone: PERMISSION_ZONES.CATALOG, label: 'Каталог і ціни' },
  { zone: PERMISSION_ZONES.CONTENT, label: 'Контент і блог' },
  { zone: PERMISSION_ZONES.MARKETING, label: 'Знижки та маркетинг' },
  { zone: PERMISSION_ZONES.CUSTOMERS, label: 'Клієнти (персональні дані)' },
  { zone: PERMISSION_ZONES.SUPPORT, label: 'Звернення' },
  { zone: PERMISSION_ZONES.SETTINGS, label: 'Налаштування сайту' },
  { zone: PERMISSION_ZONES.ANALYTICS, label: 'Аналітика' },
  { zone: PERMISSION_ZONES.STAFF, label: 'Персонал і журнал дій' },
];

export interface PermissionDefinition {
  /** Stable key stored in UserPermission.permission. Never renamed casually — a
   *  rename orphans every granted row and silently revokes access. */
  readonly key: string;
  readonly zone: PermissionZone;
  /** Ukrainian label shown on the granting screen. */
  readonly label: string;
  /**
   * `false` = a real, enforced key that is never OFFERED to anybody
   * (TASK-475). See {@link GRANTABLE_PERMISSIONS}. Omitted means grantable —
   * the default, so a new permission is an ordinary one unless its author says
   * otherwise.
   */
  readonly grantable?: false;
}

/**
 * Every permission in the system.
 *
 * Note what is NOT here: the four doors that decide who runs the shop — changing
 * a role, setting somebody's password, deactivating and deleting an account.
 * Those are `@OwnerOnly()` by construction and have no key at all, because a key
 * is something that can be handed over and those cannot.
 */
export const PERMISSIONS = [
  // ── Замовлення ────────────────────────────────────────────────────────────
  { key: 'orders:read', zone: PERMISSION_ZONES.ORDERS, label: 'Переглядати замовлення' },
  { key: 'orders:write', zone: PERMISSION_ZONES.ORDERS, label: 'Змінювати статуси та ТТН' },
  { key: 'payments:read', zone: PERMISSION_ZONES.ORDERS, label: 'Бачити платежі' },
  { key: 'payments:refund', zone: PERMISSION_ZONES.ORDERS, label: 'Повертати гроші' },
  { key: 'returns:read', zone: PERMISSION_ZONES.ORDERS, label: 'Переглядати повернення' },
  { key: 'returns:write', zone: PERMISSION_ZONES.ORDERS, label: 'Опрацьовувати повернення' },

  // ── Каталог і ціни ────────────────────────────────────────────────────────
  { key: 'products:read', zone: PERMISSION_ZONES.CATALOG, label: 'Переглядати товари' },
  { key: 'products:write', zone: PERMISSION_ZONES.CATALOG, label: 'Редагувати товари й ціни' },
  { key: 'products:delete', zone: PERMISSION_ZONES.CATALOG, label: 'Видаляти товари' },
  // NOTE: there is deliberately no `stock:write`. Stock is edited through the
  // ordinary product update, so it is not a separable capability — and a
  // permission that cannot be enforced is worse than a missing one: the owner
  // ticks a box believing stock is separately controlled while anyone holding
  // `products:write` can still change it. Splitting stock into its own endpoint
  // would make the permission real; until someone does, it must not be offered.
  { key: 'categories:write', zone: PERMISSION_ZONES.CATALOG, label: 'Категорії' },
  { key: 'brands:write', zone: PERMISSION_ZONES.CATALOG, label: 'Бренди' },
  { key: 'devices:write', zone: PERMISSION_ZONES.CATALOG, label: 'Пристрої та сумісність' },
  { key: 'attributes:write', zone: PERMISSION_ZONES.CATALOG, label: 'Характеристики' },
  { key: 'addons:write', zone: PERMISSION_ZONES.CATALOG, label: 'Додаткові послуги' },
  // Its own permission rather than a fold into `products:write` (TASK-360): one
  // confirmed import rewrites the whole catalogue and creates categories,
  // brands, devices and characteristics along the way. That is a different
  // blast radius from editing one product, and it deserves a separate tick.
  {
    key: 'catalog:import',
    zone: PERMISSION_ZONES.CATALOG,
    label: 'Імпорт каталогу з файлу',
  },

  // ── Контент і блог ────────────────────────────────────────────────────────
  { key: 'blog:write', zone: PERMISSION_ZONES.CONTENT, label: 'Блог' },
  { key: 'pages:write', zone: PERMISSION_ZONES.CONTENT, label: 'Сторінки' },
  { key: 'banners:write', zone: PERMISSION_ZONES.CONTENT, label: 'Банери' },
  { key: 'carousels:write', zone: PERMISSION_ZONES.CONTENT, label: 'Каруселі головної' },
  { key: 'faq:write', zone: PERMISSION_ZONES.CONTENT, label: 'FAQ' },
  { key: 'reviews:moderate', zone: PERMISSION_ZONES.CONTENT, label: 'Модерувати відгуки' },
  // Deliberately NOT folded into `reviews:moderate` (TASK-591). Moderating is a
  // judgement about somebody ELSE's sentence — publish it or do not. Replying is
  // the shop SPEAKING, under its own name, on a public page, in an answer no
  // second person reads before a customer does. Those are different amounts of
  // trust, and an owner who hands out the first should not silently be handing
  // out the second. Denied by default like every new key, so ticking it is a
  // deliberate act.
  //
  // And deliberately WITHOUT the data migration `media:read`/`media:write` carry
  // below: those two backfill because they carved an capability out of keys
  // people already held, so a silent backfill preserves what an operator could
  // do yesterday. Replying to a customer in public is something nobody could do
  // yesterday. There is nothing to preserve, so granting it is the owner's call
  // (TASK-597).
  { key: 'reviews:write', zone: PERMISSION_ZONES.CONTENT, label: 'Відповідати на відгуки' },
  // The media library (TASK-441). Two keys, because reading and writing really
  // are different capabilities here: the picker embedded in every content form
  // needs to LIST assets, while uploading, retagging and deleting them is the
  // librarian's job. See MEDIA_BACKFILL_SOURCE_PERMISSIONS below for why these
  // two — uniquely in this catalogue — ship with a data migration attached.
  { key: 'media:read', zone: PERMISSION_ZONES.CONTENT, label: 'Переглядати медіатеку' },
  { key: 'media:write', zone: PERMISSION_ZONES.CONTENT, label: 'Завантажувати та видаляти медіа' },

  // ── Знижки та маркетинг ───────────────────────────────────────────────────
  { key: 'discounts:write', zone: PERMISSION_ZONES.MARKETING, label: 'Промокоди та знижки' },
  { key: 'newsletter:read', zone: PERMISSION_ZONES.MARKETING, label: 'Підписники розсилки' },

  // ── Клієнти ───────────────────────────────────────────────────────────────
  { key: 'customers:read', zone: PERMISSION_ZONES.CUSTOMERS, label: 'Картки клієнтів' },
  // One key, two capabilities — and the label has to say so (TASK-430).
  // `customers:write` gates BOTH account deactivation (`user.controller.ts:356`,
  // `:387`) AND the customer-notes journal (`POST /admin/users/:userId/notes`).
  // A label that mentions only blocking makes the screen dishonest in the
  // dangerous direction: an owner who just wants an order operator to file call
  // notes ticks this box and also hands them the power to deactivate accounts,
  // with nothing on screen saying so.
  //
  // Deliberately NOT split into a separate `customers:notes` key. A new key is
  // denied by default (see the DEFAULT IS DENIED note at the top of this file),
  // so the split would silently strip the notes textarea from every manager who
  // can write notes today, and it would stay stripped until the owner noticed
  // the «Нове» badge and ticked it. Widening the label costs nothing and lies
  // about nothing.
  {
    key: 'customers:write',
    zone: PERMISSION_ZONES.CUSTOMERS,
    label: 'Блокувати / розблоковувати, нотатки',
  },

  // ── Звернення ─────────────────────────────────────────────────────────────
  { key: 'messages:read', zone: PERMISSION_ZONES.SUPPORT, label: 'Читати звернення' },
  { key: 'messages:write', zone: PERMISSION_ZONES.SUPPORT, label: 'Опрацьовувати звернення' },

  // ── Налаштування сайту ────────────────────────────────────────────────────
  { key: 'settings:seo', zone: PERMISSION_ZONES.SETTINGS, label: 'SEO' },
  { key: 'settings:contacts', zone: PERMISSION_ZONES.SETTINGS, label: 'Контакти' },
  { key: 'settings:delivery', zone: PERMISSION_ZONES.SETTINGS, label: 'Доставка' },
  { key: 'settings:search', zone: PERMISSION_ZONES.SETTINGS, label: 'Переіндексація пошуку' },

  // ── Аналітика ─────────────────────────────────────────────────────────────
  { key: 'analytics:read', zone: PERMISSION_ZONES.ANALYTICS, label: 'Дашборд і показники' },

  // ── Персонал і журнал дій (NON-GRANTABLE) ─────────────────────────────────
  // See GRANTABLE_PERMISSIONS below for the whole argument. In short: these are
  // the deputy's job, not the owner's alone and never an operator's.
  {
    key: 'staff:read',
    zone: PERMISSION_ZONES.STAFF,
    label: 'Переглядати службові акаунти',
    grantable: false,
  },
  {
    key: 'staff:write',
    zone: PERMISSION_ZONES.STAFF,
    label: 'Створювати службові акаунти та видавати права',
    grantable: false,
  },
  {
    key: 'audit:read',
    zone: PERMISSION_ZONES.STAFF,
    label: 'Читати журнал дій',
    grantable: false,
  },
] as const satisfies ReadonlyArray<PermissionDefinition>;

/** Every valid permission key, as a union type. */
export type Permission = (typeof PERMISSIONS)[number]['key'];

/**
 * The permissions the owner may actually hand to somebody (TASK-475, plan 181).
 *
 * WHY A THIRD CATEGORY EXISTS AT ALL. Until now there were two: a key in the
 * catalogue (grantable to a manager) or `@OwnerOnly` (nobody but the owner,
 * ever). The access model adds a level between them — the deputy admin, who
 * exists so the shop runs while the owner is on holiday — and staff management
 * and the action log fall exactly in that gap:
 *
 *   - they cannot be `@OwnerOnly`, because a deputy who cannot see who works
 *     here, cannot hire, and cannot read the log is not a deputy; the owner is
 *     back on the phone the first day they are away;
 *   - they cannot be an ordinary grantable key either. An operator holding
 *     `audit:read` can check whether their own actions were noticed, which is
 *     the one reader the log is kept from. An operator holding `staff:write`
 *     can grant themselves everything else in this file, which makes every
 *     other tick on the screen decorative.
 *
 * So they are real keys that `@RequirePermission` enforces, and they are never
 * OFFERED. An admin passes them by level (see `PermissionService`); a manager
 * cannot be given them because the granting UI does not list them and the grant
 * API refuses them (TASK-477). "By construction" rather than "by policy": there
 * is no screen on which the wrong tick can be made.
 *
 * Adding `grantable: false` to a key is therefore a decision about DELEGATION,
 * not about danger. `payments:refund` moves real money and is grantable — an
 * owner may well want their order operator issuing refunds. The test is narrower:
 * would holding this let someone change who runs the shop, or hide that they did?
 */
export const GRANTABLE_PERMISSIONS: ReadonlyArray<PermissionDefinition> = (
  PERMISSIONS as ReadonlyArray<PermissionDefinition>
).filter((permission) => permission.grantable !== false);

/** The complement of {@link GRANTABLE_PERMISSIONS} — the staff/audit keys. */
export const NON_GRANTABLE_PERMISSIONS: ReadonlyArray<PermissionDefinition> = (
  PERMISSIONS as ReadonlyArray<PermissionDefinition>
).filter((permission) => permission.grantable === false);

/** Fast membership test for the granting API and its UI. */
export const GRANTABLE_PERMISSION_KEYS: ReadonlySet<string> = new Set(
  GRANTABLE_PERMISSIONS.map((permission) => permission.key),
);

/**
 * May this key be written into somebody's `UserPermission` rows?
 *
 * An unknown key answers false, like a non-grantable one: both mean "not
 * something to write", and collapsing them here means a caller cannot forget the
 * second check after remembering the first.
 */
export function isGrantablePermission(value: string): value is Permission {
  return GRANTABLE_PERMISSION_KEYS.has(value);
}

/**
 * The permissions whose holders were granted `media:read` + `media:write` by the
 * TASK-441 backfill migration (`…_backfill_media_permissions`).
 *
 * WHY A BACKFILL AT ALL, WHEN THE RULE AT THE TOP OF THIS FILE SAYS DEFAULT IS
 * DENIED. Because these two keys are not a new admin SECTION — they are a
 * capability every one of these roles already exercises today, through a
 * different door. A manager who may edit banners already uploads banner artwork
 * (`POST /admin/uploads/banners`); the media library only gives that same upload
 * a place to live afterwards. Shipping the keys denied-by-default would take the
 * picker out of every content form the moment it appears there, and the symptom
 * — an empty "Обрати з медіатеки" panel, no error, no 403 visible to the
 * operator — reads as a broken screen rather than as a missing permission.
 *
 * That is the narrow case where a backfill is right, and it is narrow on purpose:
 * the grant follows an EXISTING grant one-for-one and adds no reach. It is not a
 * licence to backfill the next new key. Compare `customers:write`, where the
 * opposite call was made (see its note above): splitting a key would have
 * silently REMOVED something, so the label was widened instead.
 *
 * This list is the code half of the contract; the SQL is the other half, and
 * `permission.catalog.spec.ts` asserts the two say the same thing — including
 * that the migration only counts a row as a grant where `allowed = true`, which
 * is how a deliberate revocation was written down. That predicate was pinned
 * against the runtime query which read it, until TASK-475 removed both the query
 * and the `role_permissions` table; the statement still replays in migration
 * order on a fresh database, so the SQL half of the assertion stays.
 */
export const MEDIA_BACKFILL_SOURCE_PERMISSIONS = [
  'products:write',
  'categories:write',
  'brands:write',
  'banners:write',
  'blog:write',
] as const satisfies ReadonlyArray<Permission>;

/** The keys that backfill grants. */
export const MEDIA_PERMISSIONS = [
  'media:read',
  'media:write',
] as const satisfies ReadonlyArray<Permission>;

/**
 * The template the access-model migration leaves behind (TASK-474, plan 181).
 *
 * That migration moves permissions off the ROLE and onto the PERSON: every live
 * MANAGER is handed their own copy of whatever `role_permissions` granted the
 * MANAGER role, and this template records the same set under a name. Two
 * different jobs, which is why both exist:
 *
 *   - the per-person rows keep today's employees working after the guard stops
 *     reading `role_permissions` (TASK-475);
 *   - this template keeps the SHAPE of "a manager, as the shop had it" available
 *     for the next hire, because once the rows are per-person there is otherwise
 *     nothing left that remembers what a manager used to be.
 *
 * It is an ordinary, editable template with no special status — applying one
 * COPIES its permissions onto a person (plan 178, decision 2), so editing it
 * later cannot silently change anyone's access, and the owner may rename or
 * delete it. The constant exists only so the migration's SQL and the code that
 * looks the template up spell the name identically; `permission.catalog.spec.ts`
 * asserts the migration uses exactly this literal.
 */
export const MANAGER_BACKFILL_TEMPLATE_NAME = 'Менеджер (як було)';

/** Fast membership test for validating rows read out of the database. */
export const PERMISSION_KEYS: ReadonlySet<string> = new Set(PERMISSIONS.map((p) => p.key));

export function isKnownPermission(value: string): value is Permission {
  return PERMISSION_KEYS.has(value);
}
