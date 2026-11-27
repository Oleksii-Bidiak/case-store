/**
 * Permission templates and the two staff accounts built from them (TASK-2569).
 *
 * The managers are MANAGER, never ADMIN: an ADMIN holds every key by level, so
 * a second admin would show nothing of what the access model is for — rights
 * that belong to a person and are copied onto them from a template. Their
 * password is the customers' `Customer123!` (already published in
 * docs/seed-guide.md); the seed introduces no new password.
 */

export interface PermissionTemplateSeed {
  name: string;
  description: string;
  /**
   * The keys the owner would tick. `:read` partners of every `:write` are added
   * by the seeder (READ_BACKFILL_PAIRS), as the granting screen does.
   */
  permissions: string[];
}

export const permissionTemplatesData: PermissionTemplateSeed[] = [
  {
    name: 'Оператор замовлень',
    description: 'Приймає й веде замовлення, записує оплати, оформлює повернення',
    permissions: [
      'orders:read',
      'orders:write',
      'payments:read',
      'payments:refund',
      'returns:read',
      'returns:write',
      'customers:read',
      'messages:read',
      'messages:write',
      'analytics:read',
    ],
  },
  {
    name: 'Контент-менеджер',
    description: 'Наповнює каталог і сайт: товари, блог, сторінки, банери, відгуки',
    permissions: [
      'products:read',
      'products:write',
      'categories:write',
      'brands:write',
      'blog:write',
      'pages:write',
      'banners:write',
      'carousels:write',
      'home:write',
      'faq:write',
      'reviews:moderate',
      'reviews:write',
      'media:read',
      'media:write',
    ],
  },
];

export interface ManagerSeed {
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
  /** Name of the template copied onto the account. */
  template: string;
  /** How long ago the owner applied the template — the audit row's date. */
  appliedDaysAgo: number;
}

export const managersData: ManagerSeed[] = [
  {
    email: 'orders@store.com',
    firstName: 'Ірина',
    lastName: 'Мельник',
    phone: '380676667788',
    template: 'Оператор замовлень',
    appliedDaysAgo: 60,
  },
  {
    email: 'content@store.com',
    firstName: 'Андрій',
    lastName: 'Савчук',
    phone: '380677778899',
    template: 'Контент-менеджер',
    appliedDaysAgo: 58,
  },
];
