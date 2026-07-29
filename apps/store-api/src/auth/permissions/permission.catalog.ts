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
 * WHAT IS DATA: which role holds which of these. That lives in `RolePermission`
 * and the owner edits it without a release.
 *
 * ZONES are a display grouping, carried as a field on each permission rather than
 * kept as a separate list. The admin screen groups by `zone` dynamically, so a new
 * admin section appears in the permission matrix simply by being declared here —
 * no UI change, no migration. A zone that grows too coarse is split by editing one
 * field, and the screen follows.
 *
 * DEFAULT IS DENIED. A permission with no RolePermission row is granted to nobody
 * except ADMIN (the owner, who is never subject to the matrix — a matrix that can
 * revoke the owner's own access is a lockout waiting to happen). So shipping a new
 * admin section never silently hands it to an existing MANAGER.
 */

/** Display grouping for the permission matrix screen. */
export const PERMISSION_ZONES = {
  ORDERS: 'orders',
  CATALOG: 'catalog',
  CONTENT: 'content',
  MARKETING: 'marketing',
  CUSTOMERS: 'customers',
  SUPPORT: 'support',
  SETTINGS: 'settings',
  ANALYTICS: 'analytics',
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
];

export interface PermissionDefinition {
  /** Stable key stored in RolePermission.permission. Never renamed casually — a
   *  rename orphans every granted row and silently revokes access. */
  readonly key: string;
  readonly zone: PermissionZone;
  /** Ukrainian label shown in the matrix. */
  readonly label: string;
}

/**
 * Every permission in the system.
 *
 * Note what is NOT here: user management and the permission matrix itself. Those
 * are owner-only by construction (`@OwnerOnly()`), never grantable — otherwise a
 * manager could grant themselves anything, which makes the whole matrix
 * decorative.
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

  // ── Знижки та маркетинг ───────────────────────────────────────────────────
  { key: 'discounts:write', zone: PERMISSION_ZONES.MARKETING, label: 'Промокоди та знижки' },
  { key: 'newsletter:read', zone: PERMISSION_ZONES.MARKETING, label: 'Підписники розсилки' },

  // ── Клієнти ───────────────────────────────────────────────────────────────
  { key: 'customers:read', zone: PERMISSION_ZONES.CUSTOMERS, label: 'Картки клієнтів' },
  { key: 'customers:write', zone: PERMISSION_ZONES.CUSTOMERS, label: 'Блокувати / розблоковувати' },

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
] as const satisfies ReadonlyArray<PermissionDefinition>;

/** Every valid permission key, as a union type. */
export type Permission = (typeof PERMISSIONS)[number]['key'];

/** Fast membership test for validating rows read out of the database. */
export const PERMISSION_KEYS: ReadonlySet<string> = new Set(PERMISSIONS.map((p) => p.key));

export function isKnownPermission(value: string): value is Permission {
  return PERMISSION_KEYS.has(value);
}
