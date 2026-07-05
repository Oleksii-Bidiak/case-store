# Plan 097: Coupons v2 — пропозиція можливостей + план автоматизованого покриття

> **Status:** 📋 Discovery (proposal, не implementation-план)
> **Parent task:** TASK-219 · **Базується на:** [[090-coupons-discounts]] (TASK-079, реалізовано)
> **Created:** 2026-07-05

---

## 1. Контекст і поточний стан

Купони v1 (TASK-079) реалізовані та працюють у продакшн-гілці. Факти з коду:

**Модель даних** (`apps/store-api/prisma/schema.prisma:383-419`):

| Поле                                   | Призначення                                              |
| -------------------------------------- | -------------------------------------------------------- |
| `code` (unique, UPPERCASE)             | один код = один запис; матчинг регістронезалежний        |
| `type: PERCENT \| FIXED`, `value`      | відсоток 1–100 або фіксована сума в грн                  |
| `minSpend?`                            | мінімальна сума кошика                                   |
| `maxRedemptions?` / `redeemedCount`    | глобальний ліміт + лічильник                             |
| `perUserLimit?`                        | ліміт на користувача (рахується по `DiscountRedemption`) |
| `startsAt?` / `expiresAt?`, `isActive` | часове вікно + ручний вимикач                            |

`DiscountRedemption` має **унікальний `orderId`** — одне погашення на замовлення,
тобто **рівно один купон на замовлення** зашито в саму схему.

**Логіка** (`apps/store-api/src/discount/discount.service.ts`):

- `computeDiscount(code, subtotal, userId)` — чисте TDD-ядро: усі гейти
  (active/window/minSpend/caps) + розрахунок у **цілих копійках**
  (`toCents`/`centsToDecimalString`, `Math.round` для відсотка), кламп
  `amount <= subtotal`. Типізовані коди помилок у `discount.errors.ts`
  (`NOT_FOUND`, `INACTIVE`, `NOT_STARTED`, `EXPIRED`, `MIN_SPEND_NOT_MET`,
  `MAX_REDEMPTIONS_REACHED`, `USER_LIMIT_REACHED`).
- `redeem(...)` — виконується **всередині `$transaction` створення замовлення**
  (`order.repository.ts:159-161`), з повторною перевіркою лімітів по живому рядку.
  `total = subtotal + shipping − discount` (`order.repository.ts:132`) — знижка
  застосовується **тільки до subtotal**, доставка не дисконтується.
- Превʼю: `POST /api/cart/discount/preview` (`discount.controller.ts`) —
  **тільки для авторизованих** (`JwtAuthGuard`), throttle 20/хв проти перебору кодів.
- Адмін CRUD: `admin-discount.controller.ts` (list/create/edit/soft-deactivate).

**Storefront** (`apps/store-client/src/features/apply-discount/`):

- Застосований код живе **тільки на клієнті** у `sessionStorage`
  (`model/applied-discount-store.ts`), сервер його не знає до моменту
  `createOrder(discountCode)`. Превʼю — advisory, сервер завжди перераховує.

**Ключові обмеження v1** (звідси й виростає v2):

1. Один код на замовлення (unique `orderId` у redemption).
2. Знижка тільки на весь subtotal — жодного скоупінгу по товарах/категоріях.
3. Гість не може застосувати код (превʼю вимагає JWT), хоча кошик гостьовий.
4. Немає автоматичних акцій — тільки ручне введення коду.
5. Стан «застосовано» — клієнтський артефакт (sessionStorage), не частина Cart.
6. У каталозі **немає моделі Brand** (тільки `Category` + `ProductGroup`/`attributes`) —
   пер-бренд скоупінг має передумову в каталозі (див. `requirements.md:11-15`).

**Покриття сьогодні:** 19 unit-кейсів (`discount.service.spec.ts`), 12 e2e-кейсів
(`test/discount.e2e-spec.ts`: preview happy/invalid/expired/minSpend/cap + admin CRUD/RBAC),
інтеграція в `order.service.spec.ts`, RTL-тест `apply-discount.test.tsx`.
**Playwright-спеки для купонів немає** — у `e2e/` лише `auth-flow.spec.ts` і
`cart-flow.spec.ts`; борг зафіксовано в BACKLOG (TASK-198 → «coverage rides on TASK-219»).

---

## 2. Запропоновані можливості

### 2.0 Передумова для всього v2: серверний стан «застосованих» знижок

Майже кожна можливість нижче (стекінг, auto-apply, скоупінг) вимагає, щоб сервер
знав, які знижки застосовані до кошика, **до** створення замовлення. Пропозиція:

```prisma
model CartDiscount {           // застосовані до кошика коди (заміна sessionStorage)
  id         String   @id @default(uuid())
  cartId     String   @map("cart_id")
  discountId String   @map("discount_id")
  appliedAt  DateTime @default(now())
  @@unique([cartId, discountId])
}
```

`CartService.getCart` повертає totals уже з розкладкою знижок; `sessionStorage`-стор
у `apply-discount` зникає. Це також відкриває купони гостям (Cart уже має `token`
для гостей — `schema.prisma:196-200`; перевірку `perUserLimit` для гостя відкладаємо
до логіну на чекауті, як і весь guest-cart флоу).

### 2.1 Stacking (комбінування купонів) + правила пріоритету/ексклюзивності

**Опис.** Кілька знижок на одне замовлення з контрольованими правилами. Запозичуємо
модель Shopify «combines with»: кожна знижка декларує, з якими _класами_ знижок вона
сумісна, а не з конкретними кодами.

**Модель даних:**

```prisma
model Discount {
  // ...існуючі поля...
  stackable        Boolean @default(false)  // чи взагалі комбінується
  combinesWithOrder    Boolean @default(false) // з order-level знижками
  combinesWithProduct  Boolean @default(false) // з product-scoped знижками
  priority         Int     @default(0)      // порядок застосування (менше = раніше)
}
```

Redemption: unique `orderId` → `@@unique([discountId, orderId])`, а на `Order`
замість пари `discount`/`discountCode` — таблиця `OrderDiscount` (снапшот:
code, type, amount на момент замовлення). Старі поля лишаються deprecated-alias
(сума всіх рядків) для сумісності адмінки.

**Правила взаємодії:** застосування строго за `priority`; кожна наступна знижка
рахується від **залишку** (waterfall), а не від початкового subtotal — інакше два
купони по 60% дають від'ємний total. Кламп сумарно `Σamount <= subtotal` лишається.

**Підводні камені:** порядок застосування змінює суму (10% + фікс 100 грн ≠
фікс 100 грн + 10%) — тому `priority` обовʼязковий і детермінований (tie-break по
`createdAt`); UI має пояснювати, чому код «не комбінується»; ускладнення
`redeem` — N погашень в одній транзакції.

### 2.2 Auto-apply promotions (акції без коду)

**Опис.** Знижка активується сама, коли кошик відповідає умовам («мінус 10% на
чохли до 15.07»). Аналог Shopify Automatic Discounts / WooCommerce cart rules.

**Модель даних:** `code String?` (nullable для автоматичних), `isAutomatic Boolean
@default(false)`; partial unique index на `code` (Prisma: unique + nullable вже ок).

**Правила взаємодії:** `CartService.getCart` після підрахунку subtotal викликає
`DiscountEngine.evaluateAutomatic(cart)` — вибірка активних `isAutomatic` знижок
(індекс `@@index([isActive, isAutomatic])`), фільтр по вікну/minSpend/скоупу,
застосування за `priority`. Автоматичні знижки **не** пишуться в `CartDiscount`
(вони ефемерні, переобчислюються щоразу), але **пишуться** в `OrderDiscount` при
створенні замовлення.

**Підводні камені:** продуктивність `getCart` (гарячий шлях — кешувати список
активних авто-акцій у Redis із коротким TTL, модуль `cache` вже є); акція може
зникнути між кошиком і чекаутом (тотали чесно перераховуються — потрібен UX
«ціна змінилась»); взаємодія з `compareAtPrice` (перекреслена ціна) — не подвоювати
знижку на й без того «акційний» товар: правило `excludeDiscountedProducts Boolean`.

### 2.3 First-order coupon (купон на перше замовлення)

**Опис.** Класика онбордингу: «−10% на перше замовлення».

**Модель даних:** `firstOrderOnly Boolean @default(false)`.

**Правила взаємодії:** у `computeDiscount` додатковий гейт —
`orderRepository.countByUser(userId, { excludeStatus: CANCELLED }) === 0`.
Скасовані замовлення не рахуються (інакше невдала перша спроба «спалює» пільгу).

**Підводні камені:** для гостя перевірити «першість» неможливо до авторизації —
превʼю для гостя показує знижку умовно, авторитетна перевірка на `createOrder`
(там userId уже є, чекаут вимагає auth — memory/guest-cart-architecture);
фрод через нові акаунти — мітигація існуючою email-верифікацією + `perUserLimit=1`
за замовчуванням для таких кодів.

### 2.4 Per-category / per-brand скоупінг

**Опис.** Знижка діє лише на частину кошика («−15% на захисне скло»).

**Модель даних:**

```prisma
model DiscountScope {
  id         String  @id @default(uuid())
  discountId String  @map("discount_id")
  categoryId String? @map("category_id")   // включно з піддеревом
  brandId    String? @map("brand_id")      // ⚠ потребує моделі Brand (немає!)
  @@index([discountId])
}
```

Порожній scope = усе замовлення (сумісність із v1).

**Правила взаємодії:** база розрахунку — **subtotal лише eligible-рядків** кошика.
Для PERCENT — відсоток від eligible-бази; для FIXED — кламп по eligible-базі, а не
по всьому subtotal. Розкладка знижки по рядках (для майбутніх часткових повернень) —
пропорційно, з корекцією останнього рядка, щоб `Σ line = total` (алгоритм
largest-remainder; інваріант для property-тестів, §5).

**Підводні камені:** **Brand-сутності в схемі немає** — `requirements.md` прямо
планує «фундамент каталогу під нішу (бренди, сумісність)»; пер-бренд скоупінг
блокується цією роботою і йде у v2.2. Категорії — дерево (`parentId`), скоуп має
матчити піддерево (уже є патерн обходу в каталозі). Мікс-кошик: eligible-база може
бути 0 → typed error `SCOPE_NOT_MATCHED`.

### 2.5 Персональні одноразові коди (batch-генерація)

**Опис.** Кампанія «вибачте за затримку» → 500 унікальних кодів, кожен на 1
використання, опційно привʼязаний до email/user.

**Модель даних:** розділити «правило» і «код»:

```prisma
model DiscountCode {                 // N кодів → 1 правило Discount
  id           String    @id @default(uuid())
  discountId   String    @map("discount_id")
  code         String    @unique     // згенерований, напр. SORRY-7F3K9Q
  assignedUserId String? @map("assigned_user_id") // персоналізація (опц.)
  usedAt       DateTime? @map("used_at")          // одноразовість
  @@index([discountId])
}
```

Лукап у `computeDiscount`: спершу `Discount.code` (v1-шлях), інакше
`DiscountCode.code` → батьківське правило. Адмінка: `POST
/api/admin/discounts/:id/codes { count, prefix }` + CSV-експорт.

**Підводні камені:** генерація без колізій (crypto-random, retry на unique);
`usedAt` ставиться в тій самій транзакції, що й redemption (інакше гонка двох
чекаутів з одним кодом); якщо `assignedUserId` задано — чужий користувач отримує
`NOT_FOUND` (не «код чужий» — не підтверджуємо існування коду).

### 2.6 Gift cards — рекомендація: окремий платіжний інструмент, НЕ купон

**Опис і рекомендація.** Подарунковий сертифікат — це **зобовʼязання з балансом**
(tender), а не знижка: (а) баланс витрачається частинами через кілька замовлень;
(б) при поверненні кошти повертаються на картку; (в) бухгалтерськи це передоплата,
а знижка — зменшення виручки. Так це моделюють і Shopify (Gift Card ≠ Discount),
і Medusa (gift card як payment). Спроба зробити його `FIXED`-купоном ламає
редемпшн-модель (купон «згорає» повністю) і звітність.

**Ескіз (окремий модуль `gift-card`, не в v2.0/v2.1):**

```prisma
model GiftCard        { id, code @unique, initialBalance Decimal, balance Decimal,
                        purchaserUserId?, expiresAt?, isActive }
model GiftCardTxn     { id, giftCardId, orderId?, amountCents Int, type ISSUE|REDEEM|REFUND }
```

Порядок у чекауті: `total = subtotal − discounts + shipping − giftCardRedeemed`
(сертифікат гаситься **після** знижок і **включає** доставку). Це вимагає торкатись
`OrderService`/оплати — тому свідомо виносимо в найпізнішу фазу.

---

## 3. Матриця конфліктів

Правило за замовчуванням: **конфлікт → лишається знижка з більшою вигодою для
клієнта**, якщо `stackable`-прапорці не кажуть інше.

| ↓ застосовано / додається → | Coupon (code)                                        | Auto-apply                                  | First-order                                                         | Scoped                                                                                                         | Personal code                                          | Gift card                                        |
| --------------------------- | ---------------------------------------------------- | ------------------------------------------- | ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------ |
| **Coupon (code)**           | тільки якщо обидва `stackable` + `combinesWithOrder` | так, якщо в auto `combinesWithOrder`        | first-order — це прапорець на купоні, не окремий тип                | так, якщо різні класи (`order` × `product`)                                                                    | personal = той самий клас, що coupon → ті самі правила | завжди сумісні (різні шари: discount vs payment) |
| **Auto-apply**              | —                                                    | кілька авто-акцій: за `priority`, waterfall | сумісні                                                             | авто-акція сама може бути scoped                                                                               | сумісні за `combinesWith*`                             | завжди сумісні                                   |
| **First-order**             | —                                                    | —                                           | лише один first-order код на замовлення (природно: замовлення одне) | прапорець + scope на одному правилі — ок                                                                       | personal-код може бути first-order                     | завжди сумісні                                   |
| **Scoped**                  | —                                                    | —                                           | —                                                                   | два scoped на **різні** категорії — ок; на ту саму eligible-базу — за `stackable`, waterfall від залишку рядка | ок                                                     | завжди сумісні                                   |
| **Personal code**           | —                                                    | —                                           | —                                                                   | —                                                                                                              | один personal-код на замовлення (v2.1-спрощення)       | завжди сумісні                                   |

Інваріанти рушія незалежно від комбінації:
`0 <= Σ discount <= subtotal`; gift card гаситься останнім і `<= total`;
кожен redemption/`usedAt`/списання балансу — в одній `$transaction` із замовленням.

---

## 4. Фазування

| Фаза     | Зміст                                                                                                                                                                                                                                                                       | Effort                             | Залежності                                                                  |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- | --------------------------------------------------------------------------- |
| **v2.0** | `CartDiscount` (серверний стан, гостьове превʼю), `OrderDiscount` (мультирядкові снапшоти, deprecated-alias старих полів), `firstOrderOnly`, per-**category** scope + пропорційна розкладка, рефакторинг `computeDiscount` → чистий `DiscountEngine` (окремий файл без I/O) | **L**                              | cart, order (транзакція), міграція (schema-first на develop — Wave-правило) |
| **v2.1** | Auto-apply (`isAutomatic`, Redis-кеш активних акцій), stacking (`stackable`/`combinesWith*`/`priority`, waterfall), batch personal codes (`DiscountCode` + адмін-генерація + CSV)                                                                                           | **L**                              | v2.0 (рушій + OrderDiscount), cache-модуль                                  |
| **v2.2** | Per-**brand** scope (після появи Brand у каталозі — нішевий roadmap), gift cards як платіжний інструмент (окремий модуль + чекаут/повернення)                                                                                                                               | **M** (brand) + **L** (gift cards) | Brand-сутність; платіжний флоу                                              |

Кожна фаза — окремий implementation-план `docs/plans/NNN-*.md` зі своїми TASK-рядками
в BACKLOG; цей документ — тільки пропозиція.

---

## 5. План автоматизованого покриття (test pyramid)

Рушій знижок — **критичний модуль → TDD** (Red→Green→Refactor, AGENTS.md).

### 5.1 Unit — чиста розрахункова матриця

**Файл:** `apps/store-api/src/discount/discount-engine.spec.ts` (новий, поруч із
винесеним чистим `discount-engine.ts`; існуючий `discount.service.spec.ts`
лишається для гейтів/оркестрації).

Табличні тести (`it.each`) по осях **тип × округлення × копійки × скоуп × стек**:

- PERCENT: 10% від `99.99` → `10.00` (999.9 коп → round); 33% від `0.03`;
  1% від `0.49` → `0.00` (round-half-up поведінка `Math.round` — зафіксувати явно);
  100% → повний subtotal.
- FIXED: кламп по subtotal (є в v1) і по **eligible-базі** (нове, скоуп).
- Waterfall: `[PERCENT 10%, FIXED 100]` vs `[FIXED 100, PERCENT 10%]` — різні
  суми, порядок за `priority` детермінований.
- Розкладка по рядках: largest-remainder; кейс «3 рядки по 33.33, знижка 10.00» —
  `Σ line = 10.00` рівно.
- Гейти: `firstOrderOnly` (0 замовлень / 1 замовлення / 1 CANCELLED),
  `SCOPE_NOT_MATCHED` для мікс-кошика.

### 5.2 Property-based — інваріанти округлення

**Файл:** `apps/store-api/src/discount/discount-engine.property.spec.ts`.
**Інструмент:** `fast-check` (dev-dependency, у репо ще немає — додається у v2.0).

Інваріанти на довільних кошиках (рядки 1–20, ціни 0.01–99999.99, знижки довільні):

1. `0 <= amount <= eligibleBase <= subtotal` — завжди.
2. `Σ lineAllocations === totalAmount` — розкладка нічого не губить і не вигадує.
3. Waterfall-монотонність: додавання ще однієї знижки ніколи не збільшує total.
4. Ідемпотентність: `compute(compute(cart).cart) === compute(cart)` (повторне
   обчислення тих самих правил не змінює результат).
5. Копійкова стабільність: результат у центах — завжди ціле (жодних float-хвостів).

### 5.3 Integration / supertest e2e (store-api)

**Файли:** розширити `apps/store-api/test/discount.e2e-spec.ts`; нові
`apps/store-api/test/discount-stacking.e2e-spec.ts`,
`apps/store-api/test/discount.repository.int-spec.ts` (патерн
`cart.repository.int-spec.ts` + `jest-int.json` уже існує).

| Сценарій                                                                                            | Де                                                        |
| --------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| apply → getCart показує знижку → remove → totals відкотились (`CartDiscount`)                       | discount.e2e                                              |
| Гостьове превʼю по cart-token (нове в v2.0)                                                         | discount.e2e                                              |
| Код протух **між** apply і createOrder → 400 EXPIRED, транзакція відкотилась, stock не списано      | order.e2e (розширити)                                     |
| Гонка глобального ліміту: `maxRedemptions=1`, два паралельні createOrder → рівно один 201, один 409 | discount.repository.int-spec (реальна БД, `$transaction`) |
| Personal code: два чекаути одним кодом → один успіх (`usedAt` у tx)                                 | discount-stacking.e2e                                     |
| Стек дозволений/заборонений (`combinesWith*`), waterfall-суми в `OrderDiscount`                     | discount-stacking.e2e                                     |
| first-order: друге замовлення того ж юзера → 400; після CANCELLED — дозволено                       | order.e2e                                                 |
| Auto-apply зʼявляється в getCart без коду; деактивація акції прибирає її                            | discount.e2e                                              |
| Scoped код на кошик без eligible-товарів → 400 SCOPE_NOT_MATCHED                                    | discount.e2e                                              |

⚠ Паралельні e2e-воркери ділять Redis-лічильник throttle (memory:
e2e-throttler-shared-redis) — нові спеки успадковують `setup-e2e.ts` (`REDIS_HOST=''`).

### 5.4 Playwright — клієнтський флоу

**Файл:** `e2e/discount-flow.spec.ts` (поруч з існуючими `e2e/auth-flow.spec.ts`,
`e2e/cart-flow.spec.ts`; фікстури в `e2e/fixtures/`). Запуск із явним
`DATABASE_URL` на `store_test` (memory: playwright-db-wiring).

1. Застосування коду на `/cart`: −10% видно в саммарі; перехід на чекаут —
   знижка збереглась (тепер із сервера, не з sessionStorage) — закриває борг TASK-198.
2. Невалідний/протухлий код — локалізована помилка, кошик не змінився.
3. Видалення коду — тотали повернулись.
4. Auto-apply: акційний товар у кошику → банер акції без жодного вводу.
5. Гість застосовує код → логін на чекауті → знижка пережила merge гостьового кошика.
6. Замовлення з купоном: сторінка успіху і адмінка показують code + amount.

### 5.5 Frontend unit (RTL/MSW)

**Файли:** розширити
`apps/store-client/src/features/apply-discount/ui/apply-discount.test.tsx`
(jsdom-проєкт two-project Jest-сетапу store-client); нові тести на: мапінг усіх
typed error-кодів на UA-повідомлення, стан «кілька застосованих знижок», банер
auto-apply. Логіка розкладки, якщо зʼявиться на клієнті — **не дублювати**:
джерело правди — серверні totals.

### 5.6 Гейт (додається у Verification Gate кожної фази)

```bash
npm run test -w apps/store-api            # unit + property
npm run test:e2e -w apps/store-api -- --testPathPattern "discount|order" --forceExit
npm run swagger:export -w apps/store-api && npm run generate:api
npm run test -w apps/store-client         # (пам'ятати про --runInBand-флейк повної сюїти)
npx playwright test e2e/discount-flow.spec.ts
```

---

## 6. Рекомендація

**Будувати першим — v2.0 (серверний стан знижок + чистий DiscountEngine +
per-category scope + first-order).** Причини:

1. `CartDiscount`/`OrderDiscount` — це фундамент, без якого stacking і auto-apply
   неможливі в принципі; робити його пізніше = подвійна міграція redemption-моделі.
2. Виніс чистого `DiscountEngine` дає точку опори для всієї тест-піраміди §5
   (unit-матриця + property-тести) **до** того, як зʼявиться складність стекінгу.
3. First-order і category-scope — найдешевші з найзапитуваніших маркетингових
   механік для ніші аксесуарів (акції на категорію «скло/чохли» — прямо з
   `requirements.md`), і обидві не мають зовнішніх залежностей.
4. Gift cards свідомо останні: це платіжний інструмент із власним модулем і
   ризиками у грошовому флоу — його не можна «зачепити мимохідь» у купонному релізі.

Головний ризик усього v2 — **гроші й округлення при комбінуванні**: порядок
застосування, waterfall і порядкова розкладка мають бути зафіксовані property-тестами
(§5.2) раніше за будь-який UI. Другий за вагою — гонки лімітів у паралельних
чекаутах; вони вже мітигуються транзакційним `redeem`, але кожна нова механіка
(usedAt, баланс сертифіката) повторює той самий патерн «перевір і спиши в одній tx».
