# План 151 — Loyalty & account extras (бали/кешбек + історія покупок + сповіщення)

> **Статус:** 🔄 In Progress
> **Фаза:** BACKLOG.md → «Пізніша хвиля» (оркестровано планом 149, Фаза 1)
> **Створено:** 2026-07-11
> **Останнє оновлення:** 2026-07-11
> **BACKLOG task:** TASK-175 — «Loyalty & account extras: points/cashback model + accrual/redeem
> API + purchases feed + persisted notification prefs (account UI stubs exist)»

## Overview

`/account` (Account.dc.html редизайн, Етап 6/Design import) містить три вкладки, які сьогодні є
чесними «coming soon»-заглушками без бекенду (аудит — план 129, рядки 2–5):

- **«Бонуси»** (`account-bonuses-section.tsx`) — хардкоджений `0 ₴`, текст-заглушка
  `d.bonusesStub`.
- **«Налаштування» → сповіщення** (`account-settings-section.tsx`) — 3 тумблери в локальному
  `useState`, ніде не зберігаються (`d.notifStub`).
- **«Покупки»** (`account-placeholder-section.tsx` через `account-view.tsx`) — картка-заглушка з
  CTA на `/orders`.

Ця задача:

1. Додає модель балів лояльності (append-only ledger, не мутабельний баланс — обґрунтування
   нижче) + нарахування при доставці оплаченого замовлення + списання балів.
2. Персистить 3 тумблери сповіщень (`NotificationPreference`, 1:1 з `User`).
3. Замінює заглушку «Покупки» реальним фідом — і тут велике спрощення: `GET /api/orders`
   (список замовлень поточного користувача, з ownership-скоупом і пагінацією) **вже існує**
   (`order.controller.ts:122`, `OrderService.getOrders`) і вже використовується на `/orders`
   (`widgets/order-history/ui/order-history-view.tsx`). Бекенд для «фіда покупок» писати не
   треба — потрібно лише вбудувати той самий фід у вкладку «Покупки» акаунта (переговорити
   рендер рядків у спільний компонент, щоб не дублювати розмітку).
4. Вкладка **«Історія»** (`d.nav.history` = «Історія перегляду») — це НЕ історія покупок, а
   історія переглянутих товарів, яка **вже реалізована** на головній сторінці (TASK-211, блок
   «Ви переглядали»). Вона поза скоупом цієї задачі — заглушка з CTA на головну лишається як є
   (текст `d.historyBody` вже коректно це пояснює).

## Scope

### In Scope

- Prisma: `LoyaltyAccount`, `PointsTransaction` (+ `PointsTransactionType` enum),
  `NotificationPreference`; дві однорядкові back-relation-поля на існуючій моделі `User`.
- `LoyaltyModule` (repository → service → controller): нарахування балів при переході
  замовлення в «завершене» (DELIVERED + оплачено), списання балів, читання балансу/історії
  нарахувань — **TDD** (money-adjacent, критичний модуль за AGENTS.md).
- Точка інтеграції в `OrderService`/`OrderRepository`: тригер нарахування, атомарний з
  оновленням статусу/платіжного статусу замовлення — **TDD**.
- `NotificationPreferenceModule` (repository → service → controller): читання/запис 3 тумблерів
  — звичайні unit-тести (не money-critical, TDD не обов'язковий).
- Swagger-декоратори + DTO (`class-validator`) для всіх нових ендпоінтів; Orval-регенерація
  (виконується на `develop`, не в робочому дереві плану — див. Notes).
- Фронтенд `store-client`: `AccountBonusesSection` (реальний баланс + історія нарахувань +
  форма списання), `AccountSettingsSection` (персистовані тумблери, sync-guard за
  `docs/conventions/forms.md`), нова `AccountPurchasesSection` (реальний фід, спільний з
  `/orders` компонент рендеру рядка), i18n — **власний вкладений namespace** для лоялті/
  сповіщень/покупок у словнику (не плоскі ключі поверх існуючих `bonusesStub`/`notifStub`).

### Out of Scope

- **Admin-перегляд/ручне коригування балів.** Немає жодного admin-UI чи admin-ендпоінта в цій
  задачі. Схема вже передбачає `PointsTransactionType.ADJUSTMENT` + nullable `changedBy` —
  форвард-сумісна структура під майбутнє ручне коригування, коли власник це запросить, без нової
  міграції. Явно винесено, бо: (а) MVP не потребує ручного втручання одразу, (б) власний
  admin-CRUD для лояльності — це окрема, самодостатня задача (нова сторінка `/loyalty` в
  store-admin, права доступу, аудит-лог), яку варто планувати окремо, коли з'явиться реальна
  потреба (наприклад, скарга клієнта на неправильний баланс).
- **Реальне застосування списаних балів до суми замовлення на checkout.** `checkout-payment-stub.tsx`
  (рядок 14 аудиту плану 129) і далі лишається локальним стабом — «списати бонуси» там НЕ
  зменшує `total` замовлення. Причина: справжня інтеграція вимагала б повторити патерн
  `Discount` (авторитетний перерахунок на сервері під час `createOrder`, транзакційний
  `redeem`-замок, DTO-поле в `CreateOrderDto`) — це окрема, теж money-critical, зміна порівняну
  за розміром з половиною цього плану. Ця задача постачає **лише** ledger-примітив
  (`POST /api/loyalty/redeem` — «списати N балів із рахунку», без прив'язки до конкретного
  замовлення) і UI для нього на вкладці «Бонуси» акаунта. Прив'язку до чекауту явно залишаю як
  наступний natural follow-up (не блокер — власник вирішить, коли реальні гроші-бали почнуть
  накопичуватись і виникне попит).
- Персистовані тумблери сповіщень **не гейтять жодного існуючого листа**. Лист
  «підтвердження замовлення» (`mail-outbox`, enqueue в `OrderService.createOrder`) — це
  транзакційний / сервісний лист, не маркетинговий, і має надсилатись завжди незалежно від
  тумблера «Статус замовлень». Сьогодні в кодовій базі взагалі немає окремих листів на
  «зміна статусу», «акції», чи «зниження ціни» — усі три тумблери зберігаються на майбутнє
  (коли ці типи листів з'являться, вони читатимуть `NotificationPreference`). Це узгоджено з
  тим, що сама заглушка вже чесно казала «зберігаються лише в браузері» — тепер зберігаються на
  сервері, але й досі нічого не гейтять.
- Вкладка «Історія» (перегляду) — не чіпається, поза скоупом (див. Overview, п.4).
- Термін згоряння балів (expiry) — схема НЕ додає `expiresAt` на `PointsTransaction`/
  `LoyaltyAccount` у v1 (жодного cron-воркера на згоряння). Дефолт = бали не згоряють. Якщо
  власник забажає термін дії — окрема колонка + `PointsExpiryScheduler` (мирор
  `PublishingScheduler`) додаються без ламання наявної схеми (адитивна зміна).
- Клоубек балів при рефанді доставленого замовлення (order уже DELIVERED+PAID→нараховано, потім
  адмін ставить REFUNDED) — у v1 бали НЕ списуються назад автоматично. Явний ризик у розділі
  «Ризики».
- `prisma migrate dev`/`db push`, Swagger export, Orval regen, e2e/int/Playwright — прогони на
  `develop` після мержу (див. Notes, той самий порядок, що й в інших планах цієї хвилі).

## User Stories

1. Як покупець, я хочу бачити реальний баланс бонусних балів і історію їх нарахування на
   сторінці акаунта, щоб розуміти, скільки я накопичив і за що.
2. Як покупець, чиє замовлення доставлене й оплачене, я хочу автоматично отримати бали
   кешбеку, щоб відчувати вигоду від повторних покупок.
3. Як покупець, я хочу списати частину балів (зменшити свій баланс) з рахунку лояльності, щоб
   у майбутньому ними скористатись.
4. Як покупець, я хочу бачити реальний список своїх покупок прямо на вкладці «Покупки» в
   акаунті (не лише переходити на окрему сторінку `/orders`).
5. Як покупець, я хочу вмикати/вимикати сповіщення (акції, статус замовлень, зниження ціни) і
   щоб цей вибір зберігався між сесіями/пристроями, а не лише в поточному браузері.

## Technical Design

### Data Model

Усі нові моделі — **append в кінець** `schema.prisma` (після `SlugRedirect`, останньої моделі
файлу) — паралельна гілка TASK-174 (план 150) також лише додає моделі в кінець, тож мерж обох
гілок у `develop` — тривіальний keep-both без конфлікту рядків. **Єдиний виняток** — Prisma
вимагає back-relation поле на протилежній стороні зв'язку 1:1, тож `User` (модель на початку
файлу) отримує два нових однорядкових поля (`loyaltyAccount`, `notificationPreference`) у своєму
блоці relations — мінімальна, суто адитивна вставка, яка не повинна перетнутися з TASK-174
(add-on-сервіси не чіпають `User`).

```prisma
// ─── User (існуюча модель, ДОДАТИ 2 рядки у блок relations) ──────────────────
model User {
  // ...existing fields unchanged...

  // TASK-175: 1:1 loyalty ledger + notification prefs. Nullable — a user has no
  // row until their first accrual / first prefs read (repository upserts on
  // first touch).
  loyaltyAccount        LoyaltyAccount?
  notificationPreference NotificationPreference?

  // ...existing relations unchanged (cart, wishlist, orders, ...)...
}

// ─── Append at end of schema.prisma ──────────────────────────────────────────

/// Discriminates a PointsTransaction row (TASK-175). ACCRUAL = automatic
/// cashback credit on a delivered+paid order (one row per order, enforced by
/// the (orderId, type) unique constraint below). REDEMPTION = customer-
/// initiated debit (`orderId` always null — not yet tied to a specific order,
/// see plan §Out of Scope). ADJUSTMENT = reserved for a future admin manual
/// correction UI (not implemented in this plan; forward-compat only).
enum PointsTransactionType {
  ACCRUAL
  REDEMPTION
  ADJUSTMENT
}

/// One loyalty/cashback account per user (TASK-175). `balance` is a DERIVED
/// CACHE column — always written in the SAME transaction as the PointsTransaction
/// row that changes it (never mutated independently), mirroring the
/// `Discount.redeemedCount` atomic-counter-beside-an-audit-table pattern already
/// used in this codebase. The ledger (`PointsTransaction`) is the source of
/// truth for audit/debugging; `balance` exists purely so a balance read is a
/// single-row lookup instead of a SUM aggregate.
model LoyaltyAccount {
  id        String   @id @default(uuid())
  userId    String   @unique @map("user_id")
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  balance   Int      @default(0)
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  transactions PointsTransaction[]

  @@map("loyalty_accounts")
}

/// Append-only ledger of every points movement (TASK-175). `amount` is signed
/// (+ for ACCRUAL, − for REDEMPTION/ADJUSTMENT-down); `balanceAfter` snapshots
/// the resulting balance for audit/debugging without needing to replay the
/// ledger. `orderId` is set ONLY for ACCRUAL rows (one order → at most one
/// accrual); REDEMPTION/ADJUSTMENT rows always leave it null.
///
/// IDEMPOTENCY: `@@unique([orderId, type])` guarantees one accrual per order —
/// Postgres treats each NULL as distinct in a unique constraint, so the many
/// REDEMPTION/ADJUSTMENT rows (orderId always null) never collide with each
/// other or with this guard; only two ACCRUAL rows for the SAME orderId would
/// violate it, which is exactly the double-credit this constraint prevents.
/// Mirrors `DiscountRedemption.orderId @unique`'s idempotency-via-unique-
/// constraint precedent.
model PointsTransaction {
  id               String                @id @default(uuid())
  loyaltyAccountId String                @map("loyalty_account_id")
  loyaltyAccount   LoyaltyAccount        @relation(fields: [loyaltyAccountId], references: [id], onDelete: Cascade)
  type             PointsTransactionType
  amount           Int
  balanceAfter     Int                   @map("balance_after")
  orderId          String?               @map("order_id")
  description      String?
  /// Acting admin's id for a future ADJUSTMENT row; null for system-driven
  /// ACCRUAL/REDEMPTION rows (mirrors OrderStatusHistory.changedBy).
  changedBy        String?               @map("changed_by")
  createdAt        DateTime              @default(now()) @map("created_at")

  @@unique([orderId, type])
  @@index([loyaltyAccountId, createdAt(sort: Desc)])
  @@map("points_transactions")
}

/// Persisted notification toggles (TASK-175) — replaces the account-settings
/// stub's local `useState`. One row per user (upserted on first read/write).
/// None of the three flags gate any EXISTING email yet (order-confirmation mail
/// is transactional and always sends regardless) — they are read by future
/// marketing/status/price-alert mail features when those ship. Defaults mirror
/// the stub's current local defaults (`promo: true, orders: true, price: false`).
model NotificationPreference {
  id              String   @id @default(uuid())
  userId          String   @unique @map("user_id")
  user            User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  promoEmails     Boolean  @default(true) @map("promo_emails")
  orderUpdates    Boolean  @default(true) @map("order_updates")
  priceDropAlerts Boolean  @default(false) @map("price_drop_alerts")
  createdAt       DateTime @default(now()) @map("created_at")
  updatedAt       DateTime @updatedAt @map("updated_at")

  @@map("notification_preferences")
}
```

**Чому ledger, а не мутабельний баланс без історії:** аналогічно до `Discount`/
`DiscountRedemption`, гроше-подібні лічильники в цій кодовій базі завжди мають audit trail поруч
із кешованим числом (`redeemedCount` + `DiscountRedemption`; тут — `balance` +
`PointsTransaction`). Чистий ledger без кешу вимагав би `SUM()` на кожне читання балансу; чистий
кеш без ledger не має аудиту (звідки взявся баланс, чи не було подвійного нарахування) і не дає
основи для майбутньої вкладки «історія нарахувань», яку прямо обіцяє існуючий текст-заглушка
(`bonusesStub`: «...тут з'являться ваші бали **та історія нарахувань**»). Гібрид — стандартний і
вже прецедентний у цій кодовій базі підхід.

Міграційні SQL — gitignored (див. пам'ять «Migrations gitignored»); джерело правди —
`schema.prisma`. Застосування: `npx prisma db push` (dev/staging), НЕ `prisma migrate dev`.
`prisma.config.ts` тримає URL БД.

### Backend (NestJS — Clean Architecture)

#### Конфіг (env, з дефолтами — див. блокери в кінці плану)

```
LOYALTY_ACCRUAL_RATE_PERCENT=5        # % кешбеку від бази нарахування
LOYALTY_ACCRUAL_BASE=subtotal         # 'subtotal' | 'total' — subtotal виключає доставку/податок
LOYALTY_REDEMPTION_RATE_UAH_PER_POINT=1   # 1 бал = 1 ₴ у майбутньому застосуванні на чекауті
# LOYALTY_POINTS_EXPIRY_DAYS не заведено в v1 — бали не згоряють (дефолт)
```

Читаються через існуючий `ConfigService`/env-валідацію (мирор того, як `deliveryService`/
throttler-конфіги вже читають env у цьому проєкті); значення за замовчуванням прописані в коді
на випадок відсутності змінної, щоб dev/staging без нових env-записів не ламались.

#### `LoyaltyModule` (`src/loyalty/`)

**`LoyaltyRepository`** (єдиний шар Prisma-доступу):

- `findAccountByUserId(userId): Promise<LoyaltyAccount | null>`
- `upsertAccount(userId, tx?): Promise<LoyaltyAccount>` — створює рахунок з `balance=0` при
  першому зверненні (лінива ініціалізація — немає seed-рядка при реєстрації).
- `findTransactions(loyaltyAccountId, { page, limit }): Promise<{ transactions, total }>` —
  пагінована, `createdAt desc`.
- `insertAccrual(loyaltyAccountId, { amount, orderId, description }, tx): Promise<PointsTransaction>`
  — інкрементує `LoyaltyAccount.balance` і вставляє ACCRUAL-рядок **в одній транзакції**; ловить
  унікальне порушення `(orderId, type)` (Prisma `P2002`) як idempotent no-op (повертає вже
  наявний рядок, не кидає далі).
- `redeem(loyaltyAccountId, amount, tx): Promise<{ account, transaction } | null>` — умовний
  декремент **тим самим патерном, що й списання складських залишків при створенні замовлення**
  (`WHERE balance >= amount`, через `updateMany` + перевірку `count === 1`), плюс вставка
  REDEMPTION-рядка в тій самій транзакції; повертає `null`, якщо умова не виконалась
  (недостатньо балів) — сервіс мапить це на `BadRequestException`.

**`LoyaltyService`** (бізнес-логіка, **TDD**):

- `getAccountSummary(userId): Promise<{ balance: number }>` — ліниво створює рахунок, якщо його
  ще немає (перший візит на вкладку «Бонуси»).
- `getTransactions(userId, query): Promise<{ transactions: PointsTransactionEntity[]; meta }>`.
- `redeemPoints(userId, points: number): Promise<{ balance: number; transaction: PointsTransactionEntity }>`
  — валідація `points > 0` на рівні DTO; кидає `BadRequestException`, якщо балансу не вистачає.
- `accrueForOrder(order: { id, userId, subtotal, total, shippingCost }, tx: Prisma.TransactionClient): Promise<void>`
  — обчислює бали за конфігом (`LOYALTY_ACCRUAL_BASE`/`LOYALTY_ACCRUAL_RATE_PERCENT`) цілими
  «копійка-safe» операціями (мирор `computeSubtotalString` в `order.service.ts`, щоб уникнути
  плаваючої коми), апсертить рахунок і вставляє ACCRUAL-рядок ВСЕРЕДИНІ переданої транзакції —
  викликається виключно з `OrderService`, ніколи напряму з контролера.

**TDD unit-кейси для `LoyaltyService`/`LoyaltyRepository` (Red→Green→Refactor):**

- нарахування при DELIVERED+PAID створює рівно один ACCRUAL-рядок і коректно інкрементує
  `balance`;
- повторний виклик `accrueForOrder` для того самого `orderId` — ідемпотентний no-op (унікальний
  констрейнт ловиться, баланс не подвоюється);
- нарахування НЕ відбувається, якщо замовлення DELIVERED, але ще не PAID;
- нарахування НЕ відбувається, якщо замовлення PAID, але ще не DELIVERED;
- нарахування відбувається рівно один раз незалежно від порядку переходів (DELIVERED→PAID чи
  PAID→DELIVERED) — обидва виклики-тригери в підсумку дають один ACCRUAL-рядок;
- нарахування коректно рахує бали від `subtotal` (виключаючи доставку) при дефолтному конфігу;
- списання балів у межах балансу зменшує `balance` і створює REDEMPTION-рядок з `amount < 0`;
- списання балів понад баланс кидає `BadRequestException`, стан рахунку не змінюється (жодного
  частково застосованого запису);
- списання від'ємної/нульової кількості балів відхиляється на рівні DTO-валідації ще до сервісу;
- баланс ніколи не стає від'ємним — жодна комбінація конкурентних викликів редіму (симульована
  послідовними викликами репозиторію з проміжним читанням оновленого балансу) не проходить
  умовний декремент двічі понад залишок.

**`LoyaltyController`** (`@Controller('loyalty')`, `JwtAuthGuard`, ownership через
`@CurrentUser('id')` — жодного параметра userId з клієнта):

| Метод | Шлях                                   | Опис                                                             | operationId              |
| ----- | -------------------------------------- | ---------------------------------------------------------------- | ------------------------ |
| GET   | `/api/loyalty/account`                 | `{ data: { balance } }`                                          | `getLoyaltyAccount`      |
| GET   | `/api/loyalty/transactions?page&limit` | `{ data: PointsTransactionEntity[], meta }`                      | `getLoyaltyTransactions` |
| POST  | `/api/loyalty/redeem`                  | body `{ points: number }` → `{ data: { balance, transaction } }` | `redeemLoyaltyPoints`    |

#### Інтеграція в `OrderModule` (не новий модуль — точкова зміна)

`OrderModule` імпортує `LoyaltyModule` (експортує `LoyaltyService`), аналогічно наявним прямим
ін'єкціям `DiscountService`/`DeliveryService`/`MailOutboxService` в `OrderService` — без
додаткової абстракції на кшталт `PublishablePort` (та навмисно розрахована на content-модулі, не
на цей кейс).

Тригер нарахування має спрацювати рівно один раз незалежно від того, який перехід трапляється
другим — DELIVERED чи PAID. Обидва місця мутації дзеркалять один і той самий приватний
хелпер-виклик:

1. **`OrderService.updateStatus`** — після успішного «плоского» переходу (гілка, де НЕ
   спрацьовує revive/restock — саме туди й веде перехід у DELIVERED), якщо
   `newStatus === DELIVERED && existing.paymentStatus === PaymentStatus.PAID` →
   `loyaltyService.accrueForOrder(order, tx)`.
2. **`OrderService.adminUpdatePaymentStatus`** — після оновлення платіжного статусу, якщо
   `newPaymentStatus === PaymentStatus.PAID && existing.status === OrderStatus.DELIVERED` →
   той самий виклик.

Щоб нарахування було атомарним з відповідним записом (без вікна «статус оновлено, бали — ні»),
`OrderRepository.updateStatus` і `OrderRepository.updatePaymentStatus` отримують опціональний
`onCommitted?: (tx, order) => Promise<void>` callback, що виконується ВСЕРЕДИНІ тієї самої
`prisma.$transaction`, яка вже пише статус/платіжний статус — той самий патерн, що вже
використовує `createFromCart` для транзакційного mail-outbox enqueue (TASK-103-F,
`order.service.ts:161-176`). Ідемпотентний унікальний констрейнт на `PointsTransaction`
залишається останньою лінією захисту навіть якщо обидва тригери спрацюють практично одночасно.

**TDD unit-кейси для інтеграції (`order.service.spec.ts`):**

- `updateStatus(→DELIVERED)` на вже PAID-замовленні викликає `loyaltyService.accrueForOrder`
  рівно один раз з правильним `order`/`tx`;
- `updateStatus(→DELIVERED)` на ще НЕ PAID-замовленні НЕ викликає нарахування;
- `adminUpdatePaymentStatus(→PAID)` на вже DELIVERED-замовленні викликає нарахування;
- `adminUpdatePaymentStatus(→PAID)` на ще не DELIVERED-замовленні НЕ викликає нарахування;
- нарахування не викликається на жодному іншому переході статусу (PENDING→CONFIRMED,
  →CANCELLED, →REFUNDED тощо);
- мок `LoyaltyService` не блокує коміт транзакції статусу — якщо `accrueForOrder` кидає (для
  негативного тесту), решта тестів на самé оновлення статусу лишаються зеленими (ізольований
  мок, не інтеграційний виклик реальної БД у цьому спек-файлі — реальна атомарність
  перевіряється в repository int-spec, якщо такий заведений для order.repository).

#### `NotificationPreferenceModule` (`src/notification-preference/`)

Простий CRUD-модуль (repository → service → controller), без TDD-вимоги (не money/inventory/
auth-критичний), але зі звичайними unit-тестами:

- `NotificationPreferenceRepository.findByUserId` / `upsert(userId, data)`.
- `NotificationPreferenceService.getPreferences(userId)` — лінива ініціалізація дефолтами при
  першому читанні; `updatePreferences(userId, dto)` — часткове оновлення (тільки передані поля).
- `NotificationPreferenceController`:

| Метод | Шлях                               | operationId                     |
| ----- | ---------------------------------- | ------------------------------- |
| GET   | `/api/notification-preferences/me` | `getNotificationPreferences`    |
| PUT   | `/api/notification-preferences/me` | `updateNotificationPreferences` |

`UpdateNotificationPreferenceDto` — три опціональних `@IsBoolean()` поля (`promoEmails`,
`orderUpdates`, `priceDropAlerts`), кожне окремо PATCH-семантики (лише передані ключі
змінюються) — мирор часткових update-DTO в `discount`/`category` модулях.

### Frontend (Next.js — FSD, `store-client`)

#### entities

Прямі Orval-хуки (жодних ручних fetch): `useLoyaltyControllerGetAccount`,
`useLoyaltyControllerGetTransactions`, `useLoyaltyControllerRedeemLoyaltyPoints`,
`useNotificationPreferenceControllerGetNotificationPreferences`,
`useNotificationPreferenceControllerUpdateNotificationPreferences` (точні імена залежать від
Orval-конфігу — фіксуються після регенерації; `operationId` вище підібрані так, щоб хук-неймінг
був читабельним). Якщо в проєкті вже є `entities/order` як обгортка над `useGetOrders` — новий
`entities/loyalty` заводиться аналогічно (тонка реекспорт-обгортка, не бізнес-логіка).

#### widgets/account (переписати 2 файли, додати 1)

- **`account-bonuses-section.tsx`** → `"use client"`, реальні дані:
  - `useLoyaltyControllerGetAccount` — баланс замість хардкоджного `0`;
  - `useLoyaltyControllerGetTransactions` (перша сторінка, напр. 10 останніх) — список
    нарахувань/списань під балансом замість `bonusesStub`-тексту;
  - невелика форма «Списати бали» (RHF+zod, `points: number`, клієнтський guard `points <=
balance` — сервер усе одно авторитетно перевіряє) → мутація `redeemLoyaltyPoints`,
    інвалідує обидва query (баланс + транзакції) при успіху.
  - skeleton/error-стани мирорять наявний `AccountView`-патерн (`Skeleton` з `shared/ui`).
- **`account-settings-section.tsx`** → тумблери читають/пишуть реальні дані:
  - `useNotificationPreferenceControllerGetNotificationPreferences` на вході;
  - **обов'язковий sync-guard за `docs/conventions/forms.md` Rule 1a** (render-time guard,
    непередпольовий не-текстовий інпут — чекбокси) — локальний `useState` тумблерів
    ІНІЦІАЛІЗУЄТЬСЯ і РЕСИНХРОНІЗУЄТЬСЯ з сервера тим самим патерном, що й
    `cart-item-row.tsx` (TASK-116): проста ре-присвоєнність під час рендеру, не `useEffect`,
    не `key`-ремаунт;
  - кожен toggle викликає `updateNotificationPreferences` мутацію (одне поле за раз або
    debounced-batch — простіше й безпечніше слати одне поле на клік, без дебаунсу, бо це не
    текстовий інпут і Rule 3 тут не застосовна);
  - прибрати `d.notifStub` («зберігаються лише в цьому браузері») — замінити на нейтральний
    індикатор збереження (напр. короткий `toast`/inline «Збережено», без нового namespace-е
    правила — деталь імплементації).
- **новий `account-purchases-section.tsx`**: реальний фід замовлень поточного користувача,
  замінює `AccountPlaceholderSection` у `case "purchases"` (`account-view.tsx:240-247`).
  **Дизайн-рішення:** рядок замовлення (badge статусу + сума + дата + посилання) вже повністю
  реалізований у `widgets/order-history/ui/order-history-view.tsx:79-119` — щоб не дублювати
  розмітку/статус-кольори, винести рендер одного рядка в спільний презентаційний компонент
  (напр. `widgets/order-history/ui/order-list-item.tsx`, чистий пропс-компонент без власного
  фетчингу) і використати його з обох місць: повної сторінки `/orders`
  (`OrderHistoryView`) і нової вкладки акаунта (яка сама викликає `useGetOrders`, без
  auth-редиректу — `AccountView` вже гейтить автентифікацію на рівні всього дашборду).
  Порожній стан / стан помилки — власні (коротший текст, ніж на повній сторінці, з CTA на
  каталог, мирор інших `AccountPlaceholderSection`-текстів).
- **`account-view.tsx`**: замінити `case "purchases"` виклик `AccountPlaceholderSection` на
  `<AccountPurchasesSection />`; `case "history"` НЕ чіпати (поза скоупом).

#### i18n — власний namespace (обов'язкова вимога)

Не додавати нові плоскі ключі поруч зі старими (`bonusesStub`, `notifStub` тощо) — згрупувати
нові рядки під вкладеними об'єктами всередині `dict.account.dashboard`, наприклад:

```ts
dashboard: {
  // ...existing top-level keys unchanged (nav, greeting, logout, ...)...
  loyalty: {
    heading: "Бонуси",
    available: "Доступно бонусів",
    hint: "знижки на наступні покупки",
    historyHeading: "Історія нарахувань",
    historyEmpty: "Поки що немає нарахувань",
    redeemLabel: "Списати бали",
    redeemCta: "Списати",
    redeemSuccess: "Бали списано",
    redeemInsufficientBalance: "Недостатньо балів на рахунку",
    transactionTypeLabels: { ACCRUAL: "Нарахування", REDEMPTION: "Списання", ADJUSTMENT: "Коригування" },
  },
  notifications: {
    heading: "Сповіщення",
    saved: "Збережено",
    items: [ /* existing notifs array, key/label/desc unchanged */ ],
  },
  purchases: {
    heading: "Покупки",
    empty: "Замовлень поки немає",
    emptyCta: "До каталогу",
    loadError: "Не вдалося завантажити замовлення",
  },
},
```

Старі `bonusesStub`/`notifStub`/`purchasesBody`/`purchasesCta` ключі видаляються разом з їхніми
викликами (жодних orphan-рядків у словнику). `appearanceNote`/`appearanceHeading` лишаються без
змін (тема — і досі поза скоупом, немає ручного перемикача).

### API Contract

| Метод | Шлях                               | Тіло запиту                                         | Відповідь                                                             |
| ----- | ---------------------------------- | --------------------------------------------------- | --------------------------------------------------------------------- |
| GET   | `/api/loyalty/account`             | —                                                   | `{ data: { balance: number } }`                                       |
| GET   | `/api/loyalty/transactions`        | `?page&limit`                                       | `{ data: PointsTransactionEntity[], meta }`                           |
| POST  | `/api/loyalty/redeem`              | `{ points: number }`                                | `{ data: { balance: number, transaction: PointsTransactionEntity } }` |
| GET   | `/api/notification-preferences/me` | —                                                   | `{ data: NotificationPreferenceEntity }`                              |
| PUT   | `/api/notification-preferences/me` | `{ promoEmails?, orderUpdates?, priceDropAlerts? }` | `{ data: NotificationPreferenceEntity }`                              |
| GET   | `/api/orders`                      | _(без змін — вже існує)_                            | _(перевикористовується для фіда покупок)_                             |

Усі нові ендпоінти — `JwtAuthGuard` + ownership виключно через `@CurrentUser('id')` (жодного
`userId` у query/body клієнтського запиту — той самий шаблон, що й `orders`/`wishlist`).

## Tasks

### TASK-175-A: Prisma-схема — LoyaltyAccount / PointsTransaction / NotificationPreference

**Type:** feat
**Scope:** store-api
**Complexity:** S (1-2h)
**TDD Required:** No (schema-only)
**Depends on:** —

**Acceptance Criteria:**

- [ ] `schema.prisma`: нові моделі додані **в кінець файлу** (після `SlugRedirect`); enum
      `PointsTransactionType`; `User` отримує 2 нові back-relation поля.
- [ ] `npx prisma generate` + `npx prisma db push` проходять без помилок на dev/`store_test`.
- [ ] Prisma Client типи (`LoyaltyAccount`, `PointsTransaction`, `NotificationPreference`,
      `PointsTransactionType`) доступні для імпорту в наступних тасках.

**Files to create/modify:**

- `apps/store-api/prisma/schema.prisma`

---

### TASK-175-B: `LoyaltyRepository` + `LoyaltyService` (TDD)

**Type:** feat
**Scope:** store-api
**Complexity:** L (4-8h)
**TDD Required:** Yes — money-adjacent критичний модуль (AGENTS.md §Testing Strategy)
**Depends on:** TASK-175-A

**Acceptance Criteria:**

- [ ] Усі unit-кейси зі списку в §Technical Design написані RED-first, потім GREEN, потім
      рефакторинг без втрати зелені.
- [ ] `insertAccrual`/`redeem` — атомарні (одна транзакція на баланс+ledger-рядок).
- [ ] Ідемпотентність нарахування через унікальний `(orderId, type)` підтверджена тестом:
      повторний виклик не подвоює баланс.
- [ ] Умовний декремент списання (`WHERE balance >= amount`) підтверджений тестом — недостатній
      баланс не змінює стан і кидає `BadRequestException`.
- [ ] `npm run test -w apps/store-api` — нові специ зелені; `npm run lint`/`typecheck` чисті.

**Files to create/modify:**

- `apps/store-api/src/loyalty/loyalty.repository.ts`
- `apps/store-api/src/loyalty/loyalty.repository.spec.ts`
- `apps/store-api/src/loyalty/loyalty.service.ts`
- `apps/store-api/src/loyalty/loyalty.service.spec.ts`
- `apps/store-api/src/loyalty/entities/points-transaction.entity.ts`
- `apps/store-api/src/loyalty/entities/index.ts`

---

### TASK-175-C: Інтеграція нарахування в `OrderService`/`OrderRepository` (TDD)

**Type:** feat
**Scope:** store-api
**Complexity:** M (2-4h)
**TDD Required:** Yes — торкається грошового/inventory-суміжного шляху замовлення
**Depends on:** TASK-175-B

**Acceptance Criteria:**

- [ ] Усі unit-кейси інтеграції зі списку в §Technical Design зелені (обидва порядки
      DELIVERED/PAID тригерять рівно одне нарахування).
- [ ] `OrderRepository.updateStatus`/`updatePaymentStatus` приймають опціональний
      `onCommitted` callback, що виконується всередині тієї самої транзакції (мирор
      `createFromCart`).
- [ ] Жоден існуючий `order.service.spec.ts`/`order.repository.spec.ts` тест не зламаний.
- [ ] `npm run test -w apps/store-api` (order + loyalty specs) зелені; lint/typecheck чисті.

**Files to create/modify:**

- `apps/store-api/src/order/order.service.ts`
- `apps/store-api/src/order/order.repository.ts`
- `apps/store-api/src/order/order.service.spec.ts`
- `apps/store-api/src/order/order.repository.spec.ts`
- `apps/store-api/src/order/order.module.ts` (імпорт `LoyaltyModule`)

---

### TASK-175-D: `LoyaltyController` + DTO + Swagger + `LoyaltyModule`

**Type:** feat
**Scope:** store-api
**Complexity:** M (2-4h)
**TDD Required:** No (тонкий controller-шар over вже протестований сервіс)
**Depends on:** TASK-175-B, TASK-175-C

**Acceptance Criteria:**

- [ ] 3 ендпоінти зі §API Contract, кожен з `@ApiOperation`/`@ApiResponse`/`operationId`.
- [ ] `RedeemPointsDto` — `@IsInt() @Min(1) points`.
- [ ] Ownership виключно через `@CurrentUser('id')`; `JwtAuthGuard` на контролері.
- [ ] e2e-специ (запускаються пізніше на `develop`, не в робочому дереві) заплановані як окремий
      пункт у Notes.
- [ ] `npm run build`/`lint`/`typecheck` (store-api) чисті.

**Files to create/modify:**

- `apps/store-api/src/loyalty/loyalty.controller.ts`
- `apps/store-api/src/loyalty/loyalty.module.ts`
- `apps/store-api/src/loyalty/dto/redeem-points.dto.ts`
- `apps/store-api/src/loyalty/dto/loyalty-transaction-query.dto.ts`
- `apps/store-api/src/loyalty/dto/index.ts`
- `apps/store-api/src/loyalty/index.ts`
- `apps/store-api/src/app.module.ts` (реєстрація `LoyaltyModule`)

---

### TASK-175-E: `NotificationPreferenceModule` (repository → service → controller)

**Type:** feat
**Scope:** store-api
**Complexity:** M (2-4h)
**TDD Required:** No
**Depends on:** TASK-175-A

**Acceptance Criteria:**

- [ ] `GET`/`PUT /api/notification-preferences/me` за §API Contract; часткове оновлення (лише
      передані поля змінюються).
- [ ] Лінива ініціалізація дефолтами (`promo: true, orders: true, price: false`) при першому
      читанні для юзера без рядка.
- [ ] Unit-тести repository+service (upsert-семантика, дефолти, ownership через `userId`
      з JWT, не з body).
- [ ] `npm run build`/`lint`/`typecheck` (store-api) чисті.

**Files to create/modify:**

- `apps/store-api/src/notification-preference/notification-preference.repository.ts`
- `apps/store-api/src/notification-preference/notification-preference.service.ts`
- `apps/store-api/src/notification-preference/notification-preference.controller.ts`
- `apps/store-api/src/notification-preference/notification-preference.module.ts`
- `apps/store-api/src/notification-preference/dto/update-notification-preference.dto.ts`
- `apps/store-api/src/notification-preference/dto/index.ts`
- `apps/store-api/src/notification-preference/entities/notification-preference.entity.ts`
- `apps/store-api/src/notification-preference/entities/index.ts`
- `apps/store-api/src/notification-preference/index.ts`
- `apps/store-api/src/app.module.ts` (реєстрація модуля)
- Unit-специ поруч із кожним файлом вище.

---

### TASK-175-F: Swagger export + Orval regen (store-client)

**Type:** chore
**Scope:** shared
**Complexity:** S (1-2h)
**TDD Required:** No
**Depends on:** TASK-175-D, TASK-175-E

**Acceptance Criteria:**

- [ ] `npm run swagger:export` (чи еквівалент) + Orval regen для `store-client` (лоялті тут не
      потрібен store-admin — немає admin UI в цій задачі).
- [ ] Згенеровані хуки (`shared/api/generated/**`) НЕ редагуються вручну.
- [ ] `store-client` typecheck зелений після регенерації.

**Files to create/modify:**

- `apps/store-client/src/shared/api/generated/**` (генеровано, не редагувати вручну)

---

### TASK-175-G: `AccountBonusesSection` — реальний баланс + історія + списання

**Type:** feat
**Scope:** store-client
**Complexity:** M (2-4h)
**TDD Required:** No (money-логіка вже покрита TDD на бекенді; тут — RTL-тести на UI-стани)
**Depends on:** TASK-175-F

**Acceptance Criteria:**

- [ ] Реальний баланс замість хардкоджного `0`; список останніх нарахувань/списань під ним.
- [ ] Форма «Списати бали» — RHF+zod, клієнтський guard `points <= balance`, мутація інвалідує
      і баланс, і транзакції; сервер-side помилка (недостатньо балів) показується користувачу.
- [ ] Loading/error/empty-стани покриті (skeleton, `role="alert"`, порожня історія).
- [ ] RTL-тест: рендер балансу з мокованих даних, успішне списання оновлює UI, помилка сервера
      показує повідомлення.
- [ ] `npm run test -w apps/store-client`, build/lint/typecheck чисті.

**Files to create/modify:**

- `apps/store-client/src/widgets/account/ui/account-bonuses-section.tsx`
- `apps/store-client/src/widgets/account/ui/account-bonuses-section.test.tsx` (новий)
- `apps/store-client/src/shared/config/dictionary.ts` (`dashboard.loyalty` namespace)

---

### TASK-175-H: `AccountSettingsSection` — персистовані сповіщення

**Type:** feat
**Scope:** store-client
**Complexity:** M (2-4h)
**TDD Required:** No
**Depends on:** TASK-175-F

**Acceptance Criteria:**

- [ ] Тумблери читають реальні дані (`useNotificationPreferenceControllerGetNotificationPreferences`)
      з sync-guard за `docs/conventions/forms.md` Rule 1a (render-time guard, не `useEffect`/не
      `key`-ремаунт).
- [ ] Кожен клік по тумблеру викликає `updateNotificationPreferences`, стан оптимістично
      оновлюється, відкат при помилці.
- [ ] `d.notifStub` видалено разом з обома текстовими рядками про локальне зберігання.
- [ ] RTL-тест: seed з сервера показує коректні початкові тумблери; toggle-клік викликає
      мутацію з правильним payload; повторний рендер з новими серверними даними ре-синхронізує
      (regression-тест саме на sync-guard).
- [ ] `npm run test -w apps/store-client`, build/lint/typecheck чисті.

**Files to create/modify:**

- `apps/store-client/src/widgets/account/ui/account-settings-section.tsx`
- `apps/store-client/src/widgets/account/ui/account-settings-section.test.tsx` (новий/оновлений)
- `apps/store-client/src/shared/config/dictionary.ts` (`dashboard.notifications` namespace)

---

### TASK-175-I: `AccountPurchasesSection` — реальний фід покупок

**Type:** feat
**Scope:** store-client
**Complexity:** M (2-4h)
**TDD Required:** No
**Depends on:** TASK-175-F

**Acceptance Criteria:**

- [ ] Спільний презентаційний компонент рядка замовлення (`order-list-item.tsx` чи еквівалент)
      винесений з `order-history-view.tsx` і перевикористаний в обох місцях — без дублювання
      статус-badge/кольорової мапи/розмітки суми.
- [ ] `case "purchases"` в `account-view.tsx` рендерить `<AccountPurchasesSection />` замість
      `AccountPlaceholderSection`.
- [ ] Порожній/помилковий стан — власний текст (`dashboard.purchases.*`), CTA на `/products`.
- [ ] Регресія: повна сторінка `/orders` (`OrderHistoryView`) продовжує працювати ідентично
      (той самий `useGetOrders`, той самий вигляд рядка через спільний компонент).
- [ ] RTL-тест на новий компонент + оновлений/незламаний тест на `OrderHistoryView`.
- [ ] `npm run test -w apps/store-client`, build/lint/typecheck чисті.

**Files to create/modify:**

- `apps/store-client/src/widgets/order-history/ui/order-list-item.tsx` (новий, винесений)
- `apps/store-client/src/widgets/order-history/ui/order-history-view.tsx` (використовує
  винесений компонент)
- `apps/store-client/src/widgets/account/ui/account-purchases-section.tsx` (новий)
- `apps/store-client/src/widgets/account/ui/account-purchases-section.test.tsx` (новий)
- `apps/store-client/src/widgets/account/ui/account-view.tsx`
- `apps/store-client/src/shared/config/dictionary.ts` (`dashboard.purchases` namespace)

---

### TASK-175-J: Прибирання застарілих плоских i18n-ключів + фінальний прогін

**Type:** chore
**Scope:** store-client
**Complexity:** S (1-2h)
**TDD Required:** No
**Depends on:** TASK-175-G, TASK-175-H, TASK-175-I

**Acceptance Criteria:**

- [ ] Жодних orphan-ключів у `dictionary.ts` (старі `bonusesStub`, `notifStub`, `purchasesBody`,
      `purchasesCta` видалені разом із рефакторингом G/H/I; `historyBody`/`historyCta`
      лишаються — поза скоупом).
- [ ] Повний `npm run build`/`lint`/`typecheck` для `store-api` + `store-client` зелений.
- [ ] Усі нові/змінені unit-тести зелені (`npm run test -w apps/store-api`,
      `npm run test -w apps/store-client`).

**Files to create/modify:**

- `apps/store-client/src/shared/config/dictionary.ts`

## Migration Steps

1. TASK-175-A: Prisma-схема → `npx prisma generate` + `npx prisma db push` (dev + `store_test`).
2. TASK-175-B → C: бекенд-логіка нарахування/списання (TDD, знизу вгору: repository → service →
   інтеграція в order).
3. TASK-175-D → E: контролери/DTO/модулі (loyalty, потім notification-preference — незалежні
   одна від одної, можна паралельно).
4. TASK-175-F: Swagger export + Orval regen (store-client) — виконується один раз після D+E.
5. TASK-175-G → I: фронтенд-віджети (можна паралельно між собою, усі три залежать лише від F).
6. TASK-175-J: прибирання застарілих ключів + фінальні гейти.
7. **Поза цим планом, на `develop` після мержу:** e2e (`store-api`), Playwright — повний гейт
   не запускається в робочому дереві плану/фічі-гілки (пам'ять «store-api e2e serial» /
   «Playwright DB wiring» — потребують стабільної спільної БД, не сумісні з ізольованою
   worktree-розробкою).

## Risks & Mitigations

| Ризик                                                                                                                                                                                   | Мітигація                                                                                                                                                                                                                                                                         |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Нарахування балів рахується від суми, яка може змінитися після знижки/промокоду (order.discount)                                                                                        | Дефолтна база нарахування — `subtotal` (сума товарів **до** знижки) чи `total` (**після** знижки, доставки, податку) — точний вибір винесено в БЛОКЕР нижче; обидва варіанти реалізовані через один конфіг-перемикач (`LOYALTY_ACCRUAL_BASE`), зміна дефолту не потребує міграції |
| Клоубек балів при рефанді доставленого (вже нарахованого) замовлення не реалізований у v1                                                                                               | Явно задокументовано в Out of Scope; ризик прийнятний для MVP (низький обсяг замовлень пре-лонч); якщо стане проблемою — окрема задача на «негативне ACCRUAL-сторно» при переході DELIVERED→REFUNDED, без ламання наявної схеми                                                   |
| Два незалежні тригери нарахування (`updateStatus` і `adminUpdatePaymentStatus`) можуть теоретично гонитися одночасно за одне й те саме замовлення (адмін клікає обидва майже синхронно) | Унікальний `(orderId, type)` — остання лінія захисту незалежно від порядку/паралельності: другий INSERT ловить P2002 і стає no-op, перший, що встиг, залишається джерелом правди                                                                                                  |
| Форма «списати бали» без прив'язки до конкретного замовлення (Out of Scope) може виглядати «незрозуміло навіщо» для реального покупця                                                   | Прийнятний компроміс v1 — сама вкладка «Бонуси» вже сьогодні описує це як baseline-програму лояльності (кешбек-рахунок), а не «знижку на конкретне замовлення»; реальне застосування на чекауті — наступний крок, коли з'явиться попит                                            |
| `LoyaltyAccount`/`NotificationPreference` — нові `User`-relation поля на початку файлу теоретично можуть конфліктувати з паралельною гілкою TASK-174, якщо та теж чіпає `User`          | Малоймовірно (add-on-сервіси — це Product/Cart/Order-скоуп, не User) — якщо все ж конфлікт, це два однорядкові adds, тривіальний ручний мерж, не структурний конфлікт                                                                                                             |
| Слабка обробка одночасних кліків «Списати бали» на фронтенді (подвійний сабміт)                                                                                                         | Кнопка дизейблиться на час `isPending` мутації (стандартний RHF-патерн, вже використаний в `cancel-order-button.tsx`/`login-form.tsx`); сервер усе одно гарантує коректність через умовний декремент незалежно від фронтенд-гейту                                                 |

## Notes

- **Знахідка, що суттєво звужує скоуп:** «фід покупок» із формулювання BACKLOG TASK-175 **вже
  має готовий бекенд** — `GET /api/orders` (ownership-скоуп через `CurrentUser`, пагінація,
  фільтр за статусом) існує з Фази 3 і вже споживається на `/orders`
  (`order-history-view.tsx`). Ця задача не пише жоден новий backend-ендпоінт для покупок —
  лише фронтенд-вкладку, яка споживає той самий існуючий хук.
- Вкладка «Історія» (`d.nav.history`) навмисно НЕ зачіпається — це історія переглянутих товарів
  (вже реалізована TASK-211 на головній), а не історія покупок; сплутування цих двох назв у
  дизайні акаунта — не помилка цього плану, лишається як є.
- `checkout-payment-stub.tsx`'s чекбокс «списати бонуси» лишається стабом навіть після цієї
  задачі — реальна прив'язка списання до суми замовлення явно винесена з Out of Scope (див.
  вище) як окремий майбутній крок.
- e2e/int/Playwright-гейти для нових ендпоінтів пишуться на `develop` після мержу цього плану
  (той самий порядок, що й у сусідній worktree-оркестрації плану 149), не всередині ізольованого
  робочого дерева фічі-гілки.

---

## ⚠️ БЛОКЕР — рішення власника потрібні перед фіналізацією конфігу (НЕ перед стартом розробки)

Розробку можна починати одразу з наведеними нижче дефолтами (усі — env-змінні, зміна не
потребує міграції схеми чи редеплою коду) — але власник має підтвердити або скоригувати
фінальні значення до продакшн-релізу цієї фічі:

1. **Курс нарахування (% кешбеку).** Дефолт: **5% від бази нарахування**
   (`LOYALTY_ACCRUAL_RATE_PERCENT=5`).
2. **База нарахування — чи входить доставка.** Дефолт: **НІ** — нараховується тільки від
   `subtotal` (вартість товарів, без доставки й податку) (`LOYALTY_ACCRUAL_BASE=subtotal`).
   Типова практика кешбек-програм — не винагороджувати за вартість пересилки.
3. **Курс списання балів у грошах.** Дефолт: **1 бал = 1 ₴** (`LOYALTY_REDEMPTION_RATE_UAH_PER_POINT=1`,
   «бонусна гривня» — найпростіша й найпрозоріша для покупця модель; курс поки що НЕ
   застосовується ніде функціонально в v1, бо реальне списання на чекауті — поза скоупом, але
   визначає, скільки коштуватиме бал, коли ця прив'язка з'явиться).
4. **Термін дії (згоряння) балів.** Дефолт: **бали не згоряють** у v1 (жодного
   `expiresAt`/cron-воркера). Якщо власник хоче термін дії — адитивна зміна схеми пізніше, не
   блокер зараз.

Ці чотири пункти НЕ блокують імплементацію (дефолти дозволяють рухатись одразу), але
оркестратор має підтвердити їх із власником до того, як фіча вважатиметься production-ready
(тобто до фінального ✅ в BACKLOG, а не до старту кодування).
