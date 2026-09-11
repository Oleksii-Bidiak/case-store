# План 175 — Адмінка як CRM: таблиці, картки, замовлення, дати, тости, завантаження

**Статус:** ⬜ · **Задачі:** TASK-421…431 · **Гілка:** `feature/421-admin-crm` (worktree,
паралельно з 174/176) · **Джерело:** [тріаж 2026-08-27](../reviews/2026-08-27-demo-run-triage.md)
§3 (адмінка), §4, §5 «Адмінка» · **Продовжує:** епік TASK-292 / [план 168](168-admin-table-usability.md).

## Навіщо

Власник дивився на адмінку як на CRM і побачив, що вона нею ще не є: таблиці шукають по-різному
(6 на ввід, 9 по Enter, 3 локально, 3 без пошуку), фільтрів мало, дати англійські, тости не
закрити, картинки лише посиланням, замовлення без подробиць, порядок сортування «0» усюди.
Рішення власника: усе це — до запуску, бо це і є демо адмінки замовнику.

## Інвентар (з дослідження 2026-09-10)

**Пошук у таблицях.** On-type (300 мс): users, orders, brands, addon-services, subscribers,
audit-log. On-Enter: products, blog, pages, discounts, carousels, devices/models, product-groups,
categories, faq. Локально: banners (`?placement`), devices/brands, blog/categories. Без пошуку:
reviews, returns, messages. Усі URL-синхронні через `shared/lib/use-url-params.ts`; сортування
єдине (`use-table-sort.ts`); розмір сторінки різний (20 / 50).

**Дати.** `en-US`: AdminUserTable:45, UserDetailView:39, admin-order-table:82,
order-detail-view:50,56, order-timeline:17, admin-return-table:49, return-detail-view:30,
DashboardLastOrdersTable:27. `uk-UA`: dashboard-view, AuditLogView, admin-review-table,
message-inbox(+dialog), AdminSubscriberTable, admin-discount-table. Без локалі:
admin-product-table:378, catalog-import-view:317.

**Зображення лише URL.** category-form:200-210, brand-form:110-119, banner-form:175-186,
blog-post-form:222-232. Завантаження є у двох місцях: `single-image-upload.tsx` (лого) і
`product-image-manager`. `STORAGE_SUBDIRS = ['products','branding','imports']` — закритий список.

## Задачі

### TASK-421 — Дати у форматі України (S)

`shared/lib/format.ts`: `formatDate`, `formatDateTime`, `formatRelative` на `uk-UA`, 24-годинний
формат, `Europe/Kyiv` явно (сервер у UTC). Замінити 16 місць вище. Юніт на формат
«09.09.2026, 18:40». Заборонити `toLocaleString()` без локалі ESLint-правилом
(`no-restricted-syntax`) у store-admin.

### TASK-422 — Тости: кнопка закриття, тривалість (S)

`app/providers.tsx:25` → `<Toaster richColors closeButton position="top-right"
toastOptions={{ duration: 6000, error: { duration: Infinity } }}/>`. Зараз дефолт sonner **4000 мс**,
кнопки немає — записати власнику. Помилки не зникають самі; успіхи — 6 с; свайп лишається.

### TASK-423 — Єдиний пошук і фільтри таблиць; селекти з пошуком (M–L)

1. Спільний `TableSearch` (on-type 300 мс, URL-синхрон, `Escape` очищає) і `TableFilters`
   (набір селектів/дат із чипами активних фільтрів) у `shared/ui/data-table/`; перевести всі
   таблиці з інвентаря; єдиний розмір сторінки 20 з перемикачем 20/50/100.
2. `useUrlParams` варіант Б (локальний стан + `history.replaceState`) — після TASK-405 варіант А.
3. Селекти з пошуком: `Combobox` (Radix Popover + cmdk) для полів із >10 опцій (категорія,
   бренд, група, модель пристрою, клієнт у замовленні). Перевірити 💡 «селекти ростуть при
   скролі» — Radix `Select` з `position="popper"` і `max-h` на `Content`.
4. Фільтр у `/devices/models` (AD-DEV-04); масовий вибір товарів (AD-PROD-33) — лише
   активувати/деактивувати/у групу, за зразком TASK-293 для категорій.
5. DnD категорій (💡): індикатор «вкласти / переставити» (лінія vs рамка) і меню «⋯» з
   явними діями «вгору/вниз/зробити кореневою».
6. «Розумний» пошук: у списках, де є Meili (товари), шукати через нього (з TASK-417 `sku`).

### TASK-424 — Завантаження зображень для категорій, брендів, банерів, блогу; drag&drop пачкою (M)

- API: `content` у `STORAGE_SUBDIRS`; `POST /api/admin/uploads/:subdir` (multer memory, той самий
  `ImageProcessorService`: WebP + LQIP, sniff байтів), `@RequirePermission` за сутністю; відповідь
  `{ url, blurDataUrl }`. Не дублювати `product-image.controller` — винести спільний
  `UploadPipeline`.
- Адмінка: замінити 4 `Input` на `SingleImageUpload` (лишити поле URL як «або вставте
  посилання» для зовнішніх CDN — `NEXT_PUBLIC_IMAGE_HOSTS` лишається).
- `product-image-manager`: зона drag&drop, кілька файлів, прогрес, повторна спроба на 413.
- Вітрина: перевірити `remotePatterns` на `/uploads/content/**`.

### TASK-425 — Замовлення: деталі, фільтри, ознака гостя (M)

**Деталі `/orders/[id]`** (`order-detail-view.tsx`): API віддає `item.addons[]`
(`order-item.entity.ts:21,102-105`), `addonsTotal`, `discountCode`, `guest` (`order.entity.ts:66-83,
132, 142-145`) — рендериться жодне. Додати: підрядок послуг під позицією, рядок «Послуги» в
підсумку (інакше арифметика не сходиться), код промокоду біля «Знижка», бейдж «Гість» /
«Акаунт» + контактний блок гостя, блок адреси підняти вище (AD-ORD-29 не знайшли).
**Список `/orders`:** фільтр за статусом оплати, за методом оплати, чип «давно в очікуванні»
(той самий поріг, що на дашборді), колонка «Клієнт: акаунт/гість», експорт CSV поточної вибірки.

### TASK-426 — Створення замовлення оператором: пошук клієнта, маска телефону, місто (M)

Розширює TASK-341. `order-create-form.tsx:143-149` — сирий `userId`. Пікер клієнта за зразком
`order-line-picker.tsx:29-39` над `useUserControllerFindAll` (після TASK-406 пошук по повному
імені/телефону/email); маска `+380` + `@IsUaPhone` (TASK-407); місто/відділення через публічні
`/delivery/cities|warehouses` з тим самим станом «довідник недоступний»; для гостя — email
необов'язковий, телефон обов'язковий. Валідатор формату ТТН (AD-ORD-18) — 14 цифр НП.

### TASK-427 — Товари: кнопка видалення, лишатись на сторінці, картка перегляду (S–M)

- `DELETE /products/:id` (soft, `products:delete`) існує (`product.controller.ts:607-619`) — кнопка
  в рядку і на сторінці редагування з підтвердженням; у списку — фільтр «видалені» (tombstone
  `deletedAt`, конвенція `prisma-migration`).
- Після «Зберегти зміни» лишатись на `/products/[id]/edit` з тостом (зараз редірект у список).
- Read-only картка товару (`/products/[id]`): усе, що є в редагуванні, без форм + історія змін з
  аудит-логу. Прев'ю як PDP — брейншторм TASK-451.

### TASK-428 — Порядок сортування: з 1, унікальний, стрілки (M)

`faq-form.tsx:29,107-116`, `page-form.tsx:52,262-270`, `carousel-form.tsx:208,229` — поле з
дефолтом `0`. Перевести FAQ, сторінки, каруселі на `useSortableListGrid` (є в banners,
blog-categories, device-brands); API — `PATCH …/reorder` тієї ж форми; дефолт нового рядка
`max+1` (як `createCategory`); поле в формі сховати. Міграція даних: перенумерувати наявні `0` за
`createdAt`.

### TASK-429 — Банери й каруселі: вікно публікації, прев'ю, підказки, карта контенту (M)

- `Banner.scheduledUntil` (міграція) + форма `banner-form.tsx:227-253` (від–до), воркер
  публікації знімає після; нативний `datetime-local` з нормальним `type`.
- `banner-placement-preview.tsx:109` — реальні пропорції за плейсментом (hero 21:9 / mobile 4:5 …
  взяти з вітрини), не лише `max-w-[375px]`.
- Карусель `source ≠ MANUAL`: показувати пікер disabled з поясненням «щоб переставляти вручну,
  перемкніть на ручний список» (`carousel-form.tsx:58-86`).
- `content-map-zones.ts:149-169` — маршрут `/promo` → `/discounts` (перемикач публічності коду
  живе на `/discounts/[id]/edit`, AD-MKT-08).

### TASK-430 — CRM-дрібниці, які видно на демо (S кожна, одна задача)

| Що                                                      | Де                                                                                                                    |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `favicon.ico` 404 (AD-DASH-01)                          | `app/` адмінки — додати іконку                                                                                        |
| Топ-товари без посилань (AD-DASH-09)                    | віджет дашборду → `/products/[id]/edit`                                                                               |
| Аудит-лог для власника                                  | `AuditLogView`: мапа `AUDIT_ACTION_LABELS` UA у `dictionary.ts`, `label ?? rawKey`; фільтр «мої дії / дії менеджерів» |
| Відкладена публікація в таблицях                        | окремий бейдж «Заплановано на дд.мм» замість «Чернетка» (pages, blog, banners, products)                              |
| Бейдж підтвердження email на картці клієнта (AD-CRM-04) | `UserDetailView` — `emailVerifiedAt`                                                                                  |
| Артикул у таблиці відгуків                              | `admin-review-table` — колонка SKU + лінк на товар                                                                    |
| Нотатки на користувача                                  | модель `UserNote` (як нотатки замовлення), `@RequirePermission('customers:write')`, вкладка на `/users/[id]`          |

### TASK-431 — Узгодженість статусів оплати і замовлення (M; матриця затверджена 2026-09-11)

`payment-status-select.tsx:55-57` пропонує будь-який з трьох інших статусів; сервер
`adminUpdatePaymentStatus` (`order.service.ts:1023-1042`) перевіряє лише «замовлення існує» й
пише що завгодно. Є одна стейт-машина — для `OrderStatus` (`order-state-machine.ts:55-94`).

Матрицю визначив брейншторм B-1 —
[рішення 2026-09-11](178-brainstorms.md#рішення-2026-09-11-b-1); тут лише реалізація. Обсяг:

```
PAYMENT_TRANSITIONS
  PENDING            → PAID, FAILED
  FAILED             → PENDING, PAID
  PAID               → PARTIALLY_REFUNDED, REFUNDED
  PARTIALLY_REFUNDED → REFUNDED
  REFUNDED           → (нічого)
```

- міграція `PaymentStatus` +1 значення `PARTIALLY_REFUNDED`, **без бекфілу**;
- одне жорстке крос-правило (409): **повний** `REFUNDED` дозволений, лише коли замовлення
  ∈ {CANCELLED, REFUNDED}. `PARTIALLY_REFUNDED` при `DELIVERED` — легальний;
- `GET …/allowed-payment-transitions` за зразком `allowed-transitions`, селект пропонує лише
  легальні;
- **чого тут навмисно немає:** «`DELIVERED` при `ON_DELIVERY` вимагає підтвердження оплати» —
  ця гіпотеза першої редакції плану **відхилена**. Доставлене й неоплачене лишається
  дозволеним і стає видимим чіпом «Борг N ₴» (TASK-468), бо жорсткий блок тут лише змусив би
  оператора поставити `PAID` неправдиво. Відображення `PARTIALLY_REFUNDED` в UI і в звітах —
  TASK-472.

## Порядок

421, 422 (годину кожна) → 423 (велика, тягне 405-Б) → 424 → 425 → 426 → 427 → 428 → 429 → 430;
431 чекає рішення. 424 — передумова плану 177.

## Перевірка

`npm run test -w apps/store-admin --runInBand`; `npm run test:e2e -w apps/store-api --runInBand`
для нових ендпоінтів. Закриваючи задачу — `[🔁]` на її чеках у `docs/qa-recheck.md` (Додаток А).
