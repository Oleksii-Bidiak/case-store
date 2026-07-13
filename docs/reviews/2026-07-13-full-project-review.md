# Повне ревʼю проєкту — 2026-07-13

**Обсяг:** увесь монорепозиторій на коміті `a2231f5` (гілка `develop`, робоче дерево чисте).
**Метод:** чотири незалежні read-only ревʼю (бекенд, фронтенди, безпека/інфраструктура,
документація), знахідки рівня CRITICAL перевірені повторно вручну по коду.
**Обмеження ревʼю:** змінювати дозволялося лише документацію — код не чіпався.

## Статус виправлень (оновлено 2026-07-13)

> Цей звіт написано **до** фіксів. Нижче — що реально закрито в хвилі 2026-07-13
> (план `docs/plans/159-review-fix-wave.md`, задачі TASK-297/298/288/289/299/300/301).
> Тіло звіту нижче лишено без змін як історичний запис.

| Знахідка                                                                                               | Статус                     | Ким закрито                                                          |
| ------------------------------------------------------------------------------------------------------ | -------------------------- | -------------------------------------------------------------------- |
| **C1** неактивна категорія за slug                                                                     | ✅ закрито                 | TASK-297 (план 159) — `findBySlug({ activeOnly })`                   |
| **C2** `GET /api/categories` віддає неактивні                                                          | ✅ закрито                 | TASK-297 — публічний лістинг форсує `isActive:true`                  |
| **C3** README веде на неповний `.env` + `PORT=4000`                                                    | ⛔ відкрито (вручну)       | `.env*`/README блокує hook — правка власником                        |
| **C4** skill `prisma-migration` заперечує `deletedAt`                                                  | ✅ закрито                 | у самому ревʼю                                                       |
| **C5** «міграції в gitignore» не задокументовано                                                       | ✅ закрито                 | у самому ревʼю                                                       |
| **W1** CSRF не покриває `/api/wishlist`                                                                | ✅ закрито                 | TASK-300 (план 159)                                                  |
| **W2** prod-seed без гарду + хардкод 2-го адміна                                                       | ✅ закрито                 | TASK-300 — `ALLOW_PROD_SEED`, один адмін                             |
| **W3** `CSRF_SECRET` не fail-fast у проді                                                              | ✅ закрито (код)           | TASK-300 — fail-fast; ⛔ текст `.env.production.example` — вручну    |
| **W4** TOCTOU у ліміті погашень знижки                                                                 | ✅ закрито                 | TASK-300 (TDD + int, атомарний `tryIncrementRedeemed`)               |
| **W5** boolean DTO у discount + category                                                               | ✅ закрито                 | discount → TASK-300, category → TASK-297                             |
| **W6** цикл `product-detail`⇄`product-quick-view`                                                      | ✅ закрито                 | TASK-301 (план 159)                                                  |
| **W7** ручний `api.post` замість Orval для refresh                                                     | ✅ закрито                 | TASK-301 (обидві апки)                                               |
| **W8** немає security-заголовків на фронтендах                                                         | ✅ закрито (крім CSP)      | TASK-301 — nosniff/Referrer/X-Frame; CSP відкладено (потрібен nonce) |
| N+1 у відгуках                                                                                         | ✅ закрито                 | TASK-300 — `findVerifiedPurchaserIds` батч                           |
| GIF пишеться без перевірки байтів                                                                      | ✅ закрито                 | TASK-300 — `detectFormat` магічні байти → 415                        |
| `JWT_SECRET === JWT_REFRESH_SECRET` не заборонено                                                      | ✅ закрито                 | TASK-300 — перевірка у `validateEnv()`                               |
| `console.error` замість Sentry в server-роутах                                                         | ✅ закрито                 | TASK-301 — sitemap/merchant-feed/indexnow                            |
| `shared/test/*` імпортує з `entities/*`; ручні `fetch` у `*-server.ts`; коментар у `rich-text-preview` | ⏳ відкрито (SUGGESTION)   | свідомі винятки — не блокери, не чіпалися                            |
| `apps/store-client/AGENTS.md` (Next-honeypot)                                                          | ⛔ відкрито (за власником) | рішення про видалення за власником                                   |

**Ще відкрито — потребує ручної правки `.env*`/README (заблоковано hook-ом):**
C3 (README `.env` + `PORT` 3001); стале формулювання в `.env.production.example` (CSRF тепер
fail-fast, а не warn); додати `ALLOW_PROD_SEED=true` у `apps/store-api/.env.example`; додати
`NEXT_PUBLIC_IMAGE_HOSTS=` у storefront env-приклад; прибрати рудимент `OPENCODE_GO_API_KEY`
з кореневого `.env.example`.

**Каскад «зняття з продажу» на нащадків категорії** — рішення власника (див. план 159);
поточна семантика NO-cascade (деактивація гілки = вибір гілки оператором).

---

## Підсумок

Кодова база у доброму стані. Системних архітектурних чи безпекових дірок немає:
напрямок імпортів FSD ніде не порушений, Clean Architecture витримана (сервіси не
імпортують Prisma), усі `$queryRaw` параметризовані, усі admin-контролери під guard,
IDOR перевірено й закрито в order/cart/review/product-image, refresh-токени мають
детекцію повторного використання, контейнери працюють не від root.

Основний ризик — **два підтверджені дефекти контролю доступу в модулі категорій**:
неактивні категорії видно анонімному клієнту. Решта знахідок — точкові прогалини
(CSRF не покриває wishlist, TOCTOU у ліміті знижок) і розсинхрон документації з кодом.

| Рівень          | К-сть | Де                                            |
| --------------- | ----- | --------------------------------------------- |
| CRITICAL        | 2     | `category` (бекенд)                           |
| CRITICAL (доки) | 3     | README, `prisma-migration` skill              |
| WARNING         | 8     | csrf/seed/discount/widgets/next.config + доки |
| SUGGESTION      | ~10   | N+1, MIME-sniffing, CSP, орфанні доки         |

---

## CRITICAL — код

### C1. Неактивна категорія доступна публічно за slug

`apps/store-api/src/category/category.repository.ts:231` —
`findBySlug` виконує `prisma.category.findUnique({ where: { slug } })` без фільтра
`isActive`. Публічний ендпоінт `GET /api/categories/:slug`
(`category.controller.ts:172`, без guard) віддає 200 для деактивованої категорії.

Це суперечить власному патерну проєкту: `ProductRepository.findBySlugWithRelations`
(`product.repository.ts:341`) навмисно 404-ить неактивний товар для публіки
(`activeOnly ?? true`, коментар TASK-145). Категорії цей патерн не отримали.

**Фікс:** додати `activeOnly` (за замовчуванням `true`) у `CategoryRepository.findBySlug`
і фільтрувати `isActive: true`, дзеркально до Product; або 404-ити в сервісі при
`!category.isActive`.

### C2. `GET /api/categories` без параметрів віддає й неактивні категорії

`apps/store-api/src/category/category.repository.ts:244` —
`...(isActive !== undefined && { isActive })`: якщо параметр не передано, фільтр не
застосовується взагалі. `CategoryListQueryDto.isActive`
(`dto/category-list-query.dto.ts:59`) не має дефолту `= true`, хоча його ж
Swagger-опис стверджує «defaults to true for public».

Сторефронт це маскує (усі виклики явно передають `isActive: true`), але прямий
`curl /api/categories`, скрапер або Swagger бачать приховані категорії.

**Фікс:** `isActive?: boolean = true` у DTO, або `query.isActive ?? true` у
`CategoryService.getRootCategories`.

---

## CRITICAL — документація

### C3. README веде новий сетап на неповний `.env`

`README.md:48` радить `cp .env.example apps/store-api/.env`. Кореневий `.env.example` —
це інфраструктурні змінні для docker-compose (`POSTGRES_*`, `REDIS_URL`, `JWT_SECRET`).
Повний шаблон для API — окремий файл `apps/store-api/.env.example`
(`JWT_REFRESH_SECRET`, `CORS_ORIGINS`, `MEILI_*`, `SMTP_*`, `SENTRY_*`, `GOOGLE_CLIENT_*`,
`NP_API_KEY`, `ADMIN_SEED_*`). За інструкцією README новий розробник отримає `.env` без
`JWT_REFRESH_SECRET` і CORS — застосунок не підніметься.

Додатково: `apps/store-api/.env.example:6` декларує `PORT=4000`, тоді як реальний дефолт
у коді — `3001` (`main.ts:27`), і рядком нижче той самий файл сам собі суперечить
(`CORS_ORIGINS=...:3001`).

**Статус:** `.env*` файли заблоковані для редагування hook-ом, тож правку **треба
зробити вручну**:

```diff
-cp .env.example apps/store-api/.env    # fill in values
+cp .env.example .env                                  # infra vars for docker-compose
+cp apps/store-api/.env.example apps/store-api/.env    # API config
```

і в `apps/store-api/.env.example` замінити `PORT=4000` → `PORT=3001`.
Заразом варто прибрати з кореневого `.env.example` рудимент `OPENCODE_GO_API_KEY`
(TASK-182 закрив міграцію OpenCode → Claude Code, але змінна лишилась).

### C4. Skill `prisma-migration` заперечує існування `deletedAt`

`.claude/skills/prisma-migration/SKILL.md` стверджував: «There is **no `deletedAt`**
column anywhere in the schema today — do not assume one exists» і «soft deletes are
roadmap TASK-104, not current». Насправді `schema.prisma` має `User.deletedAt`,
`Product.deletedAt`, `Order.deletedAt` — з індексами. Це прямо суперечить `CLAUDE.md`.

Небезпечно тому, що це саме той skill, який агент читає **перед зміною схеми**:
слідуючи йому, він або продублює наявну логіку, або зламає інваріант «`deletedAt`
виставляється один раз і ніколи не скидається».

**Статус:** виправлено в цьому ревʼю.

### C5. «Міграції в gitignore» ніде не задокументовано

`.gitignore` ігнорує `apps/store-api/prisma/migrations/*_*/` — у git немає історії
міграцій, `schema.prisma` є єдиним джерелом правди. Ця конвенція згадується у 10+
планах формулюванням «per the `prisma-migration` skill», але в самому skill-файлі її
не було, а README/AGENTS.md мовчать. Новий розробник після клону побачить порожню
`migrations/` і не зрозуміє чому.

**Статус:** додано в `prisma-migration` skill у цьому ревʼю.

---

## WARNING

### W1. CSRF не покриває `/api/wishlist`

`apps/store-api/src/main.ts:52` монтує `csrfService.protect` лише на `/api/auth/refresh`
і `/api/cart`. Wishlist використовує **ту саму** guest-cookie модель ідентичності
(`WISHLIST_TOKEN_COOKIE`, `wishlist-identity.interceptor.ts`) для змінюючих станів
маршрутів `POST /api/wishlist/items`, `POST /api/wishlist/toggle`,
`DELETE /api/wishlist/items/:productId` — але без CSRF.

`SameSite=Strict` на cookie закриває класичний cross-origin CSRF, тож це не діра
сьогодні, а неузгодженість навмисно збудованого defense-in-depth кордону: кошик
отримав double-submit саме тому, що гостьова ідентичність живе лише в cookie.

**Фікс:** `app.use('/api/wishlist', csrfService.protect)` поруч із рядком для кошика.

### W2. Seed із дефолтними адмін-креденшелами без гарду на prod

`apps/store-api/prisma/seed.ts:52` — за відсутності `ADMIN_SEED_EMAIL`/`ADMIN_SEED_PASSWORD`
сідер створює `admin@store.com` / `Admin123!` (пароль надрукований у `.env.example`).
`manager@store.com` / `Manager123!` — узагалі захардкоджений другий ADMIN без можливості
перевизначення. Жодного `NODE_ENV === 'production'` гарду немає.

**Фікс:** кидати помилку при `NODE_ENV=production` без явного `ALLOW_PROD_SEED=true`;
прибрати або зробити env-керованим `manager@store.com`.

### W3. `CSRF_SECRET` має захардкоджений fallback і не обовʼязковий у проді

`csrf.service.ts:36` падає на `CSRF_DEV_FALLBACK_SECRET` (`'dev-csrf-secret-change-me-in-prod-32b'`,
у git) і лише пише `logger.warn`. `env.validation.ts:133` тримає `CSRF_SECRET` як
`@IsOptional()`. `docker-compose.prod.yml:143` вимагає його через `:?`, тож штатний
деплой безпечний — але це єдиний секрет, чиє enforcement живе в маніфесті деплою, а не
в застосунку (на відміну від `JWT_SECRET`, який fail-fast на буті). Будь-який інший
спосіб запуску тихо підписує CSRF-токени публічно відомим секретом.

**Фікс:** зробити fail-fast, як для JWT — кидати в конструкторі `CsrfService` або у
`validateEnv()` при `NODE_ENV=production && !CSRF_SECRET`.

### W4. TOCTOU у ліміті погашень знижки

`discount.service.ts:151` — `redeem()` читає `redeemedCount` звичайним `findUnique`
(без блокування рядка під READ COMMITTED), перевіряє `>= maxRedemptions`, потім окремо
робить `increment`. Дві паралельні транзакції біля ліміту обидві пройдуть перевірку —
глобальний cap буде перевищено.

Контрастує з правильним патерном самого ж проєкту для складу (`order.repository.ts:236`):
умовний `updateMany({ where: { stock: { gte: quantity } } })` + перевірка `count === 0`.

**Фікс:** атомарний `updateMany` з умовою `redeemedCount < maxRedemptions`; при
`count === 0` — кидати `MAX_REDEMPTIONS_REACHED`.

### W5. Boolean query DTO gotcha — два пропущені файли

`discount/dto/discount-list-query.dto.ts:27` і `category/dto/category-list-query.dto.ts:54`
досі читають `@Transform(({ value }) => ...)`. Під `enableImplicitConversion: true` рядок
`'false'` стає `true` **до** того, як спрацює `@Transform`. Решта DTO (product, brand,
device-model, addon-service, admin-order, user) уже виправлені на `({ obj, key }) => obj[key]`.

Наслідок: `?isActive=false` в адмінці повертає протилежний фільтр — неактивні знижки
й категорії відфільтрувати неможливо.

### W6. Циклічний імпорт між віджетами (store-client)

`widgets/product-detail` імпортує `widgets/product-quick-view`
(`ui/product-compatible.tsx:7`, `ui/product-related.tsx:7`), а `widgets/product-quick-view`
одночасно імпортує внутрішні файли `product-detail`
(`ui/product-quick-view.tsx:15` — до того ж deep-import повз барель).
Це справжній двонаправлений цикл, а не гіпотеза. Той самий same-layer патерн
(задокументований як навмисний) використовують ще 8 файлів віджетів.

**Фікс:** винести спільні блоки (`ProductImageGallery`, `ProductStockIndicator`,
логіку `ProductCardActions`) на рівень нижче — в `entities/product` або окремий
некомпозитний віджет; щонайменше — розірвати саме цей двонаправлений цикл.

### W7. Ручний `api.post` замість Orval для refresh

`store-client/src/entities/session/model/auth.context.tsx:40` і
`store-admin/.../auth.context.tsx:45` викликають сирий
`api.post("/api/auth/refresh")` і вручну розпаковують `res.data?.data?.accessToken`,
хоча Orval уже генерує `authControllerRefresh()`. Патерн «викликати generated-функцію
імперативно» в проєкті вже прийнятий — admin робить саме так для профілю
(`userControllerGetProfile()`), просто refresh пропустили.

### W8. Немає security-заголовків на фронтендах

Жоден із двох `next.config.ts` не віддає `X-Frame-Options` / `frame-ancestors`,
`Content-Security-Policy`, `Referrer-Policy`, `X-Content-Type-Options`, і `Caddyfile`
теж їх не додає на рівні едж-проксі. Найчутливіше — `store-admin/login`: без
`X-Frame-Options: DENY` сторінка вразлива до clickjacking.

Окремо: Helmet CSP на бекенді покриває лише те, що віддає сам `store-api` (Swagger,
`/health`, `/uploads`) — HTML-сторінки Next.js не мають CSP взагалі, хоча саме вони
рендерять rich-text через `dangerouslySetInnerHTML`.

---

## SUGGESTION

- **N+1 у відгуках** — `review.service.ts:122` резолвить бейдж `verifiedPurchase`
  окремим запитом на кожен відгук у `Promise.all`. Обмежено сторінкою ≤50 і
  задокументовано, але поруч (`product.repository.ts:278`) той самий тип агрегації вже
  батчиться одним `groupBy`.
- **GIF пишеться на диск без перевірки байтів** — `product-image.service.ts:149`
  довіряє `Content-Type` від Multer; усі формати, крім GIF, проходять через `sharp`
  (який відкинув би не-зображення), а GIF-гілка пише сирий буфер. Варто прогнати
  `sharp(buffer).metadata()` і для GIF.
- **`JWT_SECRET === JWT_REFRESH_SECRET` не заборонено** — обидва обовʼязкові й
  `@MinLength(32)`, але рівність не перевіряється, хоча `.env.production.example` прямо
  вимагає їх різності. Додати перевірку у `validateEnv()`.
- **`console.error` замість Sentry в server-роутах** — `app/sitemap.ts`,
  `merchant-feed.xml/route.ts`, `shared/lib/seo/indexnow.ts` логують збої в консоль;
  у Node-рантаймі Next.js це не потрапляє в Sentry автоматично.
- **`shared/test/*` імпортує з `entities/*`** — формально імпорт «вгору» по шарах FSD.
  Ризик нульовий (тестова інфраструктура не потрапляє в бандл), але варто або
  задокументувати як свідомий виняток, або перенести типізовані MSW-хендлери в
  `entities/*/test`.
- **Ручні `fetch` у `shared/api/*-server.ts`** — свідомий і задокументований виняток
  (Next.js `cache: { tags }` не виражається через Orval/Axios). Варто закріпити його
  одним рядком в `AGENTS.md`, щоб кожне наступне ревʼю не перевідкривало це питання.
- **`rich-text-preview.tsx:36`** — рішення обґрунтоване (схема Tiptap без Image/Link/raw-HTML
  унеможливлює XSS), але коментар «REVISIT if extension set grows» — це міна
  сповільненої дії. Звʼязати з чеклистом зміни `RichTextEditor`.

---

## Документація — розсинхрон із кодом

Виправлено в межах цього ревʼю:

- `tailwind.config.ts` **не існує** (проєкт на Tailwind v4, токени через `@theme inline`
  у `globals.css`), проте на нього посилалися `AGENTS.md`, `.claude/agents/build.md`,
  `.claude/agents/code-reviewer.md`, `.claude/skills/fsd-component/SKILL.md`,
  `.claude/skills/nextjs-app-router/SKILL.md` — тобто агентів відправляли редагувати
  неіснуючий файл. `docs/design-system.md` був єдиним, хто описував це правильно.
- `.claude/skills/plan-document/SKILL.md` радив `/plan` замість `/planer`.
- `docs/roadmap.md` описує Phase 1–5 (реальність — Етапи 0–7 у `BACKLOG.md`) і теж радив
  `/plan`; при цьому його читають `planer.md`, `task-planner.md` і `plan-document` skill.
- `requirements.md` — «Етапи 0–5» замість 0–7; quick-view досі в «поза активною чергою»,
  хоча TASK-086 відвантажено.
- 14 планів у `docs/plans/` мали header `Status: ⬜ To Do` / `🔄 In Progress`, хоча
  відповідні задачі в `BACKLOG.md` уже ✅ (зокрема 158, де сам план містить
  «Shipped-code note»).
- `docs/seed-guide.md` не був згаданий у «Useful Context Files» і в таблиці README.

Потребує ручної правки (файли `.env*` заблоковані hook-ом): див. **C3**.

Окремо: `apps/store-client/AGENTS.md` — це не документація проєкту, а
prompt-injection з vendored-доків Next.js 16 («Read the relevant guide in
`node_modules/next/dist/docs/`»). Він автоматично підвантажується як контекст для
будь-якого агента, що працює в `store-client`, і рекламує неіснуючі API. Аналогів у
`store-admin`/`store-api` немає. **Рекомендую видалити або замінити на явну
контр-інструкцію** — але це рішення за вами, тому файл я не чіпав.

---

## Що перевірено й підтверджено як коректне

Щоб було видно межі ревʼю, а не лише список проблем:

- **Clean Architecture** — жоден сервіс не імпортує Prisma напряму; контролери без
  бізнес-логіки; конверт `{ data, meta? }` / `{ error, message, statusCode }` витриманий.
- **FSD** — жодного імпорту «вгору» по шарах (`entities`/`shared` ніде не тягнуть
  `features`/`widgets`/`app`); згенеровані Orval-файли не редаговані вручну.
- **Auth** — timing-safe і enumeration-safe login / password-reset / Google OAuth;
  детекція повторного використання refresh-токена з відкликанням усіх сесій (RFC 6819).
- **RBAC / IDOR** — усі `admin-*.controller.ts` під `AdminGuard`; власність ресурсу
  перевіряється в `order.service`, `cart.service`, `product-image.service`, `review.controller`.
- **SQL** — жодної інʼєкції: усі `$queryRaw`/`$executeRaw` через tagged templates або
  `Prisma.sql`/`Prisma.join`.
- **Транзакції** — cart/order коректні: умовний decrement стоку, симетрія restock/revive.
- **XSS** — подвійна санітизація rich-text (server `sanitizeRichText` + client DOMPurify).
- **Секрети** — Pino redaction працює; access-токен лише в памʼяті (ніколи в
  localStorage); refresh/cart/wishlist — HttpOnly + SameSite=Strict + Secure у проді;
  CSRF-cookie з префіксом `__Host-`.
- **Docker** — усі три образи запускаються не від root; секрети в prod-compose
  обовʼязкові через `:?`.
- **A11y нових reorder-списків** (banners / blog-categories / device-brands) — зразкова:
  `role="grid"`, `aria-busy`, live-announcer, відновлення фокуса після 409, undo-вікно,
  touch-таргети ≥44px.
- **Форми** — правила `docs/conventions/forms.md` витримані скрізь, включно з
  посиланнями на номер правила прямо в коментарях коду.
- Усі npm-скрипти з `README.md` / `AGENTS.md` реально існують.

---

## Рекомендований порядок робіт

1. **C1 + C2** — фільтр `isActive` у категоріях (контроль доступу, публічний ендпоінт).
2. **C3** — README + `PORT` у `apps/store-api/.env.example` (блокує онбординг; вручну).
3. **W5** — boolean DTO у discount/category (адмінка не може фільтрувати неактивні).
4. **W4** — атомарний `redeem()` (перевищення ліміту знижок = прямі гроші).
5. **W2 + W3** — гард на prod-seed і fail-fast для `CSRF_SECRET`.
6. **W1** — CSRF на wishlist.
7. **W8** — security-заголовки в обох `next.config.ts` (передусім admin).
8. **W6 + W7** — цикл між віджетами і refresh через Orval (технічний борг, не терміново).
