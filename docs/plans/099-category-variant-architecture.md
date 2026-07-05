# Plan 099 — Discovery: архітектура категорій і варіантів (TASK-222)

> **Тип:** discovery-документ (без змін коду). Живить Етап 3 — TASK-189 (бренди),
> TASK-190 (сумісність із пристроями), TASK-191 (структуровані характеристики).
> **Створено:** 2026-07-05. Аудиторія — власник продукту; ідентифікатори коду — англійською.

---

## 1. Поточний стан

### 1.1. Категорії — ієрархія в схемі Є, але майже не використовується

`Category` уже має self-relation `parentId` → дерево довільної глибини
(`apps/store-api/prisma/schema.prisma:84-103`): `name`, глобально-унікальний `slug`,
`description`, `image`, `isActive`, `sortOrder`. Матеріалізованого шляху / closure-таблиці немає.

Публічне API (`apps/store-api/src/category/category.controller.ts`):

- `GET /categories` — **лише кореневі** (`parentId = null`), пагіновано;
- `GET /categories/tree` — повне дерево активних категорій;
- `GET /categories/:slug` — категорія + `productCount`.

Фактичне споживання на сторфронті: майже всюди **тільки кореневі** категорії —
`category-nav`, `header`, `header-search`, `hero-category-sidebar`, фільтр каталогу
(`product-list-view.tsx:127`), `promo-deals`. Дерево тягне лише сторінка
`/categories` (`widgets/categories/ui/categories-view.tsx`).

**Ключовий розрив — фільтр без rollup нащадків.** `ProductRepository.findAll` фільтрує
строго `where.categoryId = categoryId` (`product.repository.ts:338-339`), а сід кладе
товари в **підкатегорії** (`iphone-cases`, `wall-chargers`, …). Тобто клік по кореневій
плитці «Cases» (`/products?categoryId=<root>`) не показує товари з «iPhone Cases».
Meilisearch так само: `filterableAttributes: ['isActive', 'categoryId']` — точний збіг,
без піддерева (`search.service.ts:30`).

**Розрив в адмінці.** Селект категорії у формі товару бере лише кореневі
(`product-form.tsx:96` → `useCategoryControllerGetRootCategories`) — прив'язати позицію
до підкатегорії через форму неможливо, хоча форма категорії (`category-form.tsx`)
батька обирати вміє (плоский список, без відображення рівнів/відступів).

### 1.2. Варіанти — модель «позиція-як-товар» (працює, зафіксована)

З TASK-142 (`docs/plans/060-variant-as-product-position.md`) кожна купована одиниця —
окремий рядок `Product` зі своїм slug/SKU/ціною/`stock`. Сусідні позиції звʼязує
`ProductGroup` (+ впорядковані осі `ProductGroupAxis`, напр. `["color","pack"]`);
позиція несе `attributes Json` (`{"color":"blue","pack":"single"}`). PDP рендерить
селектор на кожну вісь і **навігує на slug сусідньої позиції** (як ktc.ua). Кошик /
замовлення адресують лише `productId`.

Картки списку отримують `variantSummary` (`public-product.entity.ts`,
`product-variant-summary.entity.ts`): `variantCount`, `priceFrom`, кольорові свотчі;
тріо `default*` — **deprecated** (TASK-235), тримається лише заради стабільності контракту.

### 1.3. Що адмін сьогодні може / не може

Може: CRUD категорій (з батьком), CRUD груп (назва + осі), CRUD позицій (ціна, stock,
атрибути key-value, група, порядок), картинки per-position.

Не може: обрати підкатегорію для товару (п. 1.1); задати бренд (поля немає); вказати
сумісність із моделлю пристрою (осі немає); задати структуровані характеристики за
шаблоном категорії (attributes — вільні key-value, без типів/довідників); створити
SEO-landing типу «Чохли для iPhone 15 Pro» інакше, ніж завівши **окрему категорію**
(що є антипатерном — див. §5).

---

## 2. Цільова архітектура ієрархії

### 2.1. Що показали референси

- **ktc.ua** — дерево **пласке** (breadcrumb «Головна → Чохли для телефонів»); вся
  «глибина» — це **фасети** з власними URL-сегментами: `/mobile_cases/brand-apple/`,
  `/mobile_cases/type-nakladka/`, і головне — фільтр «модель телефону» на 80+ пристроїв
  (Apple iPhone 17 Pro Max — 201 товар тощо). «Чохли для iPhone 15 Pro» — це категорія
  - фільтр моделі, а не вузол дерева. Джерела: [ktc.ua/mobile_cases](https://ktc.ua/mobile_cases/),
    [brand-фасет](https://ktc.ua/mobile_cases/brand-proove/), [type-фасет](https://ktc.ua/mobile_cases/type-nakladka/).
- **Rozetka** — глибше дерево (розділ → «Аксесуари для телефонів» → «Чохли»), але
  модельні сторінки — теж фасетні лендінги поверх категорії, не гілки дерева
  ([rozetka.com.ua/all-categories-goods](https://rozetka.com.ua/ua/all-categories-goods/)).
- **Shopify** — розділяє **taxonomy category** (класифікація, атрибути per-category, живить
  фільтри) і **collection** (навігаційна/маркетингова сторінка, зокрема automated collections
  за правилами) — [shopify.com/blog/shopify-taxonomy](https://www.shopify.com/blog/shopify-taxonomy),
  [help: Search & Discovery filters](https://help.shopify.com/en/manual/online-store/storefront-search/search-and-discovery-filters).

Висновок: сучасний патерн — **неглибоке дерево типів товару + окремі осі-фасети**
(бренд, модель пристрою, характеристики) + **віртуальні лендінги** з комбінацій.

### 2.2. Рекомендоване дерево (глибина ≤ 3)

Категорія відповідає лише на «**що це за тип товару**». Бренд, сумісна модель, колір —
НЕ категорії, а осі фільтрів. Приклад для нашої ніші (requirements.md: аксесуари всіх
брендів + техніка Apple, generic-архітектура):

```
Аксесуари (1)
├─ Чохли (2)
│  ├─ Чохли для смартфонів (3)      ← «для iPhone 15 Pro» = фільтр DeviceModel, не рівень 4
│  └─ Чохли для планшетів (3)
├─ Захисне скло (2)
├─ Зарядки та кабелі (2)
│  ├─ Мережеві зарядки (3) · Бездротові (3) · Кабелі (3) · Павербанки (3)
├─ Аудіо (2) — Навушники (3), Колонки (3)
└─ Смарт-годинники та ремінці (2)
Техніка Apple (1)
├─ iPhone (2) · iPad (2) · Mac (2) · Watch (2) · AirPods (2)
```

Правила: **max 3 рівні** (UI, breadcrumb і SEO не потребують більше; ktc.ua живе на 1);
товари прив'язуються до **листових** вузлів; лістинг будь-якого вузла показує товари
всього піддерева (rollup — див. §4.1). «Ланцюжок» ktc-стилю
«чохли для iPhone 15 Pro» = `category=чохли-для-смартфонів` + `deviceModel=iphone-15-pro`.

### 2.3. Таксономія пристроїв — окрема вісь, не категорія

Сумісність «аксесуар ↔ пристрій» — **ортогональна** до дерева (один чохол-позиція сумісний
з 15 Pro; павербанк — з усім; ремінець — з Watch 42/44/45мм). Ескіз (деталі в §4.2):

```
DeviceBrand (Apple, Samsung, Xiaomi, Google, …)
  └─ DeviceModel (iPhone 15 Pro, Galaxy S24, Redmi Note 13, …)
Product ↔ DeviceModel  (M2M: ProductDeviceCompat)
```

Це generic для multi-brand: додавання Samsung — це рядки в довідниках, не перебудова дерева.
`DeviceModel` також живить homepage ModelPicker і PDP-crossell (TASK-190).

### 2.4. Віртуальні / landing-категорії та SEO-слаги

- **Landing** = збережена комбінація фільтрів зі своїм slug, H1, SEO-текстом:
  `chohly-dlia-iphone-15-pro` → `{categoryId: чохли-для-смартфонів, deviceModelId: iphone-15-pro}`.
  Аналог Shopify automated collection. Це НЕ рядок `Category` — товари не «переносяться»,
  лендінг лише рендерить відфільтрований лістинг (пропозиція моделі `CatalogLanding` — §4.4).
- **SEO-слаги:** лишаємо глобально-унікальні пласкі slug (уже так). Замість
  `/products?categoryId=<uuid>` завести crawlable маршрути `/c/[slug]` (категорія) і
  `/l/[slug]` (лендінг) — канонічні, з breadcrumb JSON-LD по ланцюжку батьків. Query-параметри
  фільтрів на них не канонікалізуються (rel=canonical на чистий slug).

---

## 3. Звʼязка з варіантами

Позиційна модель **композиційна** до ієрархії і не змінюється:

- **Категорія** каже, ДЕ позиція лежить у каталозі. Усі позиції однієї групи зазвичай в
  одній листовій категорії (варто validation-warning в адмінці, не жорсткий constraint).
- **Group + осі** кажуть, ЧИМ позиції однієї моделі товару відрізняються **між собою**
  (color / pack / storage / model-fit). Це navigation-осі PDP.
- **Сумісність (DeviceModel)** каже, до якого пристрою позиція пасує. Може збігатися з
  віссю групи (чохол: вісь `model` = 15 Pro / 15 Pro Max — і кожна позиція має СВІЙ
  compat-запис), а може ні (кабель: осі `color`+`length`, compat — десятки моделей у всіх
  позицій однаково). Тому compat вішаємо на `Product` (позицію), а в адмінці даємо
  «застосувати до всіх позицій групи» як bulk-дію.
- **Характеристики (TASK-191)** — довідкові факти для порівняння/фасетів (матеріал,
  потужність, довжина). Вісь групи = «обери варіант», характеристика = «дізнайся факт».
  Одне й те саме значення може бути і там, і там (колір), і це нормально: `attributes`
  Json лишається джерелом для sibling-навігації, `ProductAttributeValue` — для фільтрів.

**Коли група+позиції, а коли окремі товари:** одна група — якщо це «той самий товар» з
іншим значенням осі (колір/комплектація/розмір/під іншу модель) і спільною карткою-описом.
Окремі товари (і, можливо, різні категорії) — якщо різна суть/покоління/лінійка
(Spigen Ultra Hybrid vs Spigen Tough Armor — дві групи; iPhone 15 і iPhone 16 як техніка —
окремі групи по поколіннях зі storage/color осями).

---

## 4. Дельта схеми (Prisma-ескіз)

### 4.1. Ієрархія: adjacency list достатньо, rollup — обовʼязково

`parentId` **уже існує**; міграція структури не потрібна. Materialized path / closure
table — **не рекомендовано зараз** (YAGNI): категорій десятки, глибина ≤3, дерево вже
вантажиться цілком у `/categories/tree`. Дельта — сервісна:

- `CategoryRepository.findSubtreeIds(categoryId)` (рекурсивний CTE або обхід кешованого
  дерева) → `ProductRepository.findAll`: `where.categoryId = { in: subtreeIds }`;
- Meilisearch: індексувати `categoryIds: string[]` (self + предки) замість скалярного
  `categoryId`, фільтр `categoryIds = X`;
- ревізит, якщо категорій стане 1000+ (тоді — `path` колонка з backfill-скриптом).

Додати до `Category` SEO-поля: `metaTitle String?`, `metaDescription String?`
(admin-editable, за зразком `Page`).

### 4.2. Пристрої та сумісність (TASK-190)

```prisma
model DeviceBrand {
  id        String  @id @default(uuid())
  name      String                       // "Apple", "Samsung"
  slug      String  @unique
  isActive  Boolean @default(true) @map("is_active")
  sortOrder Int     @default(0)  @map("sort_order")
  models    DeviceModel[]
  @@map("device_brands")
}

model DeviceModel {
  id            String      @id @default(uuid())
  deviceBrandId String      @map("device_brand_id")
  brand         DeviceBrand @relation(fields: [deviceBrandId], references: [id])
  name          String                    // "iPhone 15 Pro"
  slug          String      @unique       // "iphone-15-pro"
  series        String?                   // "iPhone 15" — групування в пікері
  releaseYear   Int?        @map("release_year")
  isActive      Boolean     @default(true) @map("is_active")
  compat        ProductDeviceCompat[]
  @@index([deviceBrandId])
  @@map("device_models")
}

model ProductDeviceCompat {
  productId     String      @map("product_id")
  product       Product     @relation(fields: [productId], references: [id], onDelete: Cascade)
  deviceModelId String      @map("device_model_id")
  deviceModel   DeviceModel @relation(fields: [deviceModelId], references: [id], onDelete: Cascade)
  @@id([productId, deviceModelId])
  @@index([deviceModelId])
  @@map("product_device_compat")
}
```

### 4.3. Бренд товару (TASK-189) і шаблони характеристик (TASK-191)

```prisma
model Brand {           // виробник ТОВАРУ (Spigen) ≠ DeviceBrand (Apple); таблиці окремі
  id String @id @default(uuid())
  name String; slug String @unique; logo String?
  isActive Boolean @default(true) @map("is_active")
  products Product[]
  @@map("brands")
}
// Product: + brandId String? @map("brand_id") (nullable — backfill не блокує)

enum AttributeType { TEXT NUMBER BOOLEAN SELECT }

model AttributeDefinition {          // шаблон per-category, успадковується піддеревом
  id         String        @id @default(uuid())
  categoryId String        @map("category_id")
  category   Category      @relation(fields: [categoryId], references: [id], onDelete: Cascade)
  key        String                        // "material" — стабільний англ. ключ
  label      String                        // "Матеріал" — UA-підпис
  type       AttributeType @default(TEXT)
  unit       String?                       // "Вт", "см"
  options    Json?                         // для SELECT: ["Силікон","Шкіра",…]
  isFilterable Boolean     @default(false) @map("is_filterable")
  sortOrder  Int           @default(0)     @map("sort_order")
  @@unique([categoryId, key])
  @@map("attribute_definitions")
}

model ProductAttributeValue {
  id           String  @id @default(uuid())
  productId    String  @map("product_id")
  product      Product @relation(fields: [productId], references: [id], onDelete: Cascade)
  definitionId String  @map("definition_id")
  definition   AttributeDefinition @relation(fields: [definitionId], references: [id], onDelete: Cascade)
  value        String                                  // канонічний рядок
  valueNumber  Decimal? @map("value_number") @db.Decimal(12, 3) // для range-фільтрів
  @@unique([productId, definitionId])
  @@index([definitionId, value])
  @@map("product_attribute_values")
}
```

`Product.attributes Json` (осі групи) **не чіпаємо** — інша роль (§3).

### 4.4. Лендінги (опційно, окремим таском)

```prisma
model CatalogLanding {
  id String @id @default(uuid())
  slug String @unique; title String            // H1: "Чохли для iPhone 15 Pro"
  categoryId String? ; deviceModelId String? ; brandId String?
  filters Json? ; seoText String? @db.Text
  metaTitle String?; metaDescription String?
  isActive Boolean @default(false)
  @@map("catalog_landings")
}
```

### 4.5. Міграція / backfill

Усе адитивне, без breaking-змін: (1) нові таблиці + nullable `Product.brandId`;
(2) сід довідників DeviceBrand/DeviceModel (Apple-лінійка + топ Samsung/Xiaomi) і Brand;
(3) backfill compat/brand — ручний через адмінку або скрипт по ключових словах назв
(«iPhone 15 Pro» у name → compat), із ручною перевіркою; (4) rollup (§4.1) — чиста зміна
запиту + реіндекс Meilisearch; migration SQL git-ignored — джерело правди `schema.prisma`
(конвенція репо).

---

## 5. Гайд для власника: як створювати і підвʼязувати категорії / групи / варіанти

### Сьогодні (поточна адмінка)

1. **Категорія:** Адмінка → Категорії → «Створити». Назва UA, slug латиницею
   (`zahysne-sklo`), батько з селекту (або «Коренева»), `sortOrder`, «Активна».
   ⚠️ Поки що: товари шукаються лише по точній категорії (без піддерева), а форма товару
   пропонує лише кореневі — тому фактично працюйте з кореневими категоріями до фази 0 (§6).
2. **Група (якщо товар має варіанти):** Групи товарів → «Створити». Назва = абстрактний
   товар без варіанта («Чохол Spigen Ultra Hybrid iPhone 15 Pro»). Осі — англ. ключі в
   потрібному порядку: `color`, `pack`, `storage`, `model`.
3. **Позиції:** Товари → «Створити» на КОЖЕН варіант. Своя назва («… — Синій»), свій slug,
   ціна, SKU, stock, свої фото; категорія; група з кроку 2; `attributes` — по одному рядку
   на вісь групи: ключ `color`, значення `Синій`. Значення однієї осі пишіть однаково в
   усіх позиціях (`Синій`, не `синій`/`blue` впереміш) — інакше селектор на PDP не звʼяже сусідів.
4. **Товар без варіантів:** одна позиція, група «Без групи», attributes порожні.

### Після впровадження пропозиції (додасться)

Вибір **листової** підкатегорії у формі товару; поле **Бренд** (довідник); мультиселект
**«Сумісні пристрої»** (+ кнопка «застосувати до всіх позицій групи»); вкладка
**«Характеристики»** — форма за шаблоном категорії (не вільні key-value); розділ
**«Лендінги»** для сторінок типу «Чохли для iPhone 15 Pro».

### DO / DON'T

| ✅ DO                                               | ❌ DON'T                                                                  |
| --------------------------------------------------- | ------------------------------------------------------------------------- |
| Категорія = тип товару («Чохли для смартфонів»)     | Категорія під модель пристрою («Чохли iPhone 15 Pro») — це фільтр/лендінг |
| Варіант = нова **позиція** в існуючій групі         | Дубль товару без групи — PDP не звʼяже їх селектором                      |
| Однакові значення осі в усіх позиціях групи         | `Синій` / `синій` / `Blue` впереміш                                       |
| Осі — лише те, що покупець ОБИРАЄ (колір, комплект) | Вісь «матеріал», якщо він один — це характеристика                        |
| Товар у найглибшій (листовій) категорії             | Товар одночасно «і в батьківській, і в дочірній» (rollup зробить це сам)  |
| Бренд/сумісність — в окремих полях (після фаз A/B)  | Бренд як категорія («Товари Spigen» — це фільтр або лендінг)              |
| Вимкнути позицію → `isActive = off`                 | Видаляти позицію, що вже продавалась                                      |

---

## 6. Фазування (Етап 3)

| Фаза                                                                                                                                                                                             | Обсяг                                                                                               | Розмір        | Куди                                        |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- | ------------- | ------------------------------------------- |
| **0. Rollup піддерева + підкатегорії в UI** — `findSubtreeIds`, `categoryId IN (subtree)`, `categoryIds[]` у Meilisearch, листові категорії у формі товару (адмінка) і дерево у фільтрі каталогу | передумова всього Етапу 3; виправляє наявний баг «коренева категорія не бачить товари підкатегорій» | **M**         | **нова задача** (пропонується TASK-236)     |
| **A. Бренди** — `Brand`, `Product.brandId`, фільтр `GET /products`, Meilisearch, admin CRUD, фільтр «Виробник» + стрічка брендів                                                                 | схема §4.3                                                                                          | **M**         | TASK-189 (як заплановано)                   |
| **B. Сумісність** — `DeviceBrand`/`DeviceModel`/`ProductDeviceCompat`, фільтр каталогу, bulk-«на всю групу» в адмінці, ModelPicker + PDP cross-sell                                              | схема §4.2                                                                                          | **L**         | TASK-190 (як заплановано)                   |
| **C. Характеристики** — `AttributeDefinition` + `ProductAttributeValue`, редактор шаблонів у формі категорії, вкладка «Характеристики» PDP, базові фасети                                        | схема §4.3; осі груп (Json) не чіпає                                                                | **L**         | TASK-191 (як заплановано)                   |
| **D. SEO-маршрути й лендінги** — `/c/[slug]`, breadcrumb JSON-LD, `Category.meta*`; `CatalogLanding` + `/l/[slug]` + admin CRUD                                                                  | §2.4, §4.4; залежить від 0+B                                                                        | **M** + **M** | **нові задачі** (пропонуються TASK-237/238) |

Порядок: **0 → A → B → C → D** (A і B можливі паралельно після 0; C незалежна від B, але
фасети UI зручніше зводити після B). Довідково: видалення `variantSummary.default*` уже
трекається окремо (TASK-235) і цим документом не змінюється.

---

### Джерела

- ktc.ua: [/mobile_cases/](https://ktc.ua/mobile_cases/), [/mobile_cases/brand-proove/](https://ktc.ua/mobile_cases/brand-proove/), [/mobile_cases/type-nakladka/](https://ktc.ua/mobile_cases/type-nakladka/), картка товару [/goods/…ultra_hybrid…](https://ktc.ua/goods/choxol_spigen_for_apple_iphone_15_pro_max___ultra_hybrid_crystal_clear__acs06565.html)
- Rozetka: [всі категорії](https://rozetka.com.ua/ua/all-categories-goods/), [розділ електроніки](https://rozetka.com.ua/ua/telefony-tv-i-ehlektronika/c4627949/)
- Shopify: [Standard Product Taxonomy](https://www.shopify.com/blog/shopify-taxonomy), [Search & Discovery filters](https://help.shopify.com/en/manual/online-store/storefront-search/search-and-discovery-filters)
