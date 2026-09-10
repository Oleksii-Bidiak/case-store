# План 173 — Хвиля A після живого прогону: розблокувати повторний прогін

**Статус:** ⬜ до виконання · **Задачі:** TASK-397…409 · **Гілка:** `fix/397-demo-run-wave-a`
(одна гілка, комміт на задачу; або worktree на задачу за
[`docs/plans/167-stage8-wave-orchestration.md`](167-stage8-wave-orchestration.md)) ·
**Джерело:** [`docs/reviews/2026-08-27-demo-run-triage.md`](../reviews/2026-08-27-demo-run-triage.md)

## Навіщо

Живий прогін 2026-08-27 зупинився не тому, що знахідок забагато, а тому, що кілька дефектів
робили половину чекліста непрохідною: збереження товару падає завжди, зображення в адмінці не
видно ніде, редактор відкривається порожнім, менеджера «неможливо створити», а помилки
вітрини ховають причину за «Спробуйте ще раз». Ця хвиля прибирає саме стіни. Усе інше — у
планах 174–179.

Правило хвилі: **не** розширювати задачі побажаннями. Якщо під час фіксу видно сусідній
дефект — рядок у BACKLOG, не правка.

## Що виявилось (корінь кожної стіни, з `file:line`)

Усі посилання перевірені 2026-09-10 на `develop` (`00843b9`).

## Задачі

### TASK-397 🔴 — Збереження товару в адмінці падає з 400 на кожному згрупованому товарі

**Симптом (SF-PDP-14/15/29, SF-CHK-21, 🐞 «опис»):** тост «Не вдалося оновити товар» при будь-якому
«Зберегти зміни».

**Корінь.** `apps/store-api/prisma/seed/lib/ids.ts:8-11` — `deterministicUuid()` ріже sha1 у форму
UUID без версійного (13-й hex) і варіантного (17-й) ніблів. `products.seeder.ts:55` дає такий
`groupId` кожному багатоваріантному товару. Форма адмінки читає його
(`edit-product-view.tsx:230`), клієнтська схема пропускає (`product-schema.ts:20-21` —
версійно-агностичний патерн) і шле назад (`:202`). `update-product.dto.ts:127` вимагає
`@IsUUID(4)` → 400 під `whitelist + forbidNonWhitelisted` (`main.ts:78-86`). Те саме для
`categoryId` (`:117`) і `brandId` (`:137`). У `apps/store-api/src` **20** декораторів `@IsUUID(4`.
Тост ховає причину: `edit-product-view.tsx:83-85` викидає відповідь сервера.

**Зробити.**

1. `deterministicUuid`: примусово `h[12]='4'`, `h[16]∈{8,9,a,b}`. Тест: результат проходить
   `validator.isUUID(v, 4)`. Пересів `store_dev`.
2. Аудит усіх 20 `@IsUUID(4` → `@IsUUID()` (будь-яка версія) там, де значення приходить із
   БД назад (id сутностей); лишити `4` лише там, де id генерує клієнт. Причина: у БД уже
   лежать не-v4 id, і будь-який seeded id, що повертається через DTO, — та сама міна.
3. `edit-product-view.tsx:83-85` → `toast.error(apiErrorMessage(error) ?? dict.products.toastUpdateFailed)`
   за зразком `CreateUserDialog.tsx:110-116`.

**Приймання.** Зберегти сідовий товар з групи (напр. чохол iPhone) — 200, тост успіху.
Зменшити кількість і зберегти — 200. Юніт: `deterministicUuid('x')` валідний v4.
e2e product: PUT з non-v4 `groupId`, що існує в БД, → 200.

### TASK-398 🔴 — Зображення в адмінці не вантажаться ніде

**Симптом (AD-PROD-02, AD-CAT-12, 🐞):** лише alt.

**Корінь.** Helmet 8 за замовчуванням ставить `Cross-Origin-Resource-Policy: same-origin`;
`security.config.ts:27-54` (`buildHelmetOptions`) її не перевизначає, `app.module.ts:101-120`
(`/uploads` `setHeaders`) також. Адмінка рендерить звичайний `<img>` із хоста API
(`admin-product-table.tsx:316-322`, `product-image-manager.tsx:183`, `single-image-upload.tsx:97`,
`carousel-item-picker.tsx:247`) і **без** `images` у `next.config.ts`. Вітрину рятує `next/image`
через оптимізатор із власного origin.

**Зробити.** У `setHeaders` для `/uploads` додати
`res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin')` (вузько, лише статика).
Не чіпати глобальний Helmet.

**Приймання.** e2e: `GET /uploads/<будь-що>` має заголовок `cross-origin`; `GET /api/health` —
досі `same-origin`. Вручну: мініатюри в `/products`, лого в `/brands`.

**Примітка.** TASK-365 стверджував, що «працює і в простому `<img>` адмінки» — не було
перевірено в браузері. Записати в план урок: заголовок можна перевірити e2e, і тест додається.

### TASK-399 🔴 — Редактор Tiptap: порожній при клієнтській навігації (втрата даних) + форматування не видно

**Симптом (🐞 двічі, AD-CNT-10):** опис/сторінка порожні до перезавантаження; збереження в
такому стані затирає текст; жирний/заголовки видно лише в «Перегляд».

**Корінь.**

- `apps/store-admin/src/shared/ui/rich-text-editor/rich-text-editor.tsx:152` — `content: value`
  захоплюється один раз при `useEditor`; компонент вантажиться через `dynamic({ ssr:false })`
  (`index.ts:15-21`), і при клієнтській навігації чанк уже в кеші, тож редактор ініціалізується з
  `""` **до** сіду форми. Єдина корекція — ефект `:176-182`, який не спрацьовує (short-circuit на
  `isFocused` / порівняння). Спільний фактор для трьох форм: `page-form.tsx:183-192`,
  `blog-post-form.tsx:188`, `product-form.tsx:270-279`.
- `rich-text-editor.tsx:158` використовує `prose prose-sm`, але `apps/store-admin/src/app/globals.css`
  не підключає `@plugin '@tailwindcss/typography'` (у вітрині підключено).

**Зробити.**

1. Синхронізація: після появи `editor` і першого ненульового `value` — безумовний
   `editor.commands.setContent(value, { emitUpdate:false })`, якщо `editor.getHTML()` не збігається
   і редактор не має незбережених правок (`editor.isFocused === false` і немає локальних змін).
   Простіше: тримати `lastSeededRef` за `docs/conventions/forms.md` (Rule 2 `lastPushedRef`).
2. `@plugin '@tailwindcss/typography';` у `globals.css` адмінки (перевірити, що пакет у deps).
3. Регресійний тест RTL: рендер редактора з `value=""`, потім `rerender` з `value="<p>x</p>"` →
   `getHTML()` містить `x`; після ручного вводу зовнішня зміна не затирає (Rule 2b).

**Приймання.** Відкрити `/pages` → клік «Редагувати» (без F5) → текст є; H2/bold видно в
редакторі; збереження без правок не змінює `content`.

### TASK-400 🔴 — «Хтось інший щойно змінив це замовлення» в одній вкладці

**Корінь.** `order-status-select.tsx:57` бере `expectedUpdatedAt` лише з
`useAdminOrderControllerGetAllowedTransitions`. `payment-status-select.tsx:58-72` після успіху
інвалідує список, деталі й дашборд, але **не** ключ переходів (на відміну від
`order-status-select.tsx:84-88`). Сервер (`order.repository.ts:712-737, 781-790`) порівнює
`updatedAt` і кидає `staleOrderError()`.

**Зробити.** Додати `getAdminOrderControllerGetAllowedTransitionsQueryKey(orderId)` (і ключ
історії) в `onSuccess` `payment-status-select.tsx`. Пройти інші мутації замовлення
(`order-address-edit`, нотатки, ТТН) на той самий пропуск. Тест RTL: після мутації оплати
`invalidateQueries` викликано з ключем переходів.

### TASK-401 🔴 — Rate-limit мовчки вимикається, коли Redis недоступний

**Симптом (SF-CNT-19):** 7 повідомлень поспіль при ліміті 5/хв.

**Корінь.** `redis-throttler-storage.ts:27-30` — fail-OPEN за задумом; клієнт
`throttler.config.ts:29-38` (`lazyConnect`, `maxRetriesPerRequest:1`), лише warning у лог
(`:40-42`). Неправильний `REDIS_PASSWORD`/`REDIS_HOST` на стенді = **вимкнений** увесь захист,
включно з `/auth/login` (5/хв) і `/auth/forgot-password`.

**Зробити.**

1. Спершу діагностика на стенді: `$COMPOSE logs store-api | grep -i throttler` за час прогону.
   Записати результат у задачу.
2. Fail-CLOSED для публічних write-маршрутів: якщо `REDIS_HOST` заданий, а сховище недоступне —
   `429`/`503` для `POST /contact`, `/auth/login`, `/auth/register`, `/auth/forgot-password`,
   `/reviews`, `/orders` (перелік через окремий декоратор або через `ThrottlerGuard`-опцію
   `failClosed`), для GET лишити fail-open.
3. На старті: якщо `REDIS_HOST` заданий і `ping` не вдався — лог рівня `error`
   `throttler.redis.unreachable` (як `revalidate.notify.disabled` у TASK-383), у проді — падіння
   на boot (за зразком обов'язкових env).
4. `/health` повідомляє стан Redis (не ламаючи 200 для healthcheck: окреме поле `degraded`).

**Приймання.** e2e з підміненим сховищем, що кидає: `POST /contact` → 503 із кодом
`RATE_LIMIT_STORAGE_UNAVAILABLE`; `GET /products` → 200. Юніт на класифікацію маршрутів.

### TASK-402 🟡 — Мапери помилок вітрини викидають відповідь сервера (5 місць)

Один клас дефекту, одна задача. API віддає стабільні коди й повідомлення; клієнт зводить усе
до константи.

| Місце                                                 | Що зробити                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `features/apply-discount/ui/apply-discount.tsx:88-93` | **Підтверджено власником: він був гостем.** Гілки: 401 → «Щоб скористатись промокодом, увійдіть в акаунт» + лінк `/login?redirect=/cart`; 403 (CSRF) і 429 → окремі тексти; інакше `message` → generic. Логувати `statusCode` у Sentry breadcrumb. `onChange` поля → `preview.reset()` якщо `isError` (🐞 «новий код не скидає помилку»). Не показувати блок промокоду гостю на чекауті **або** показувати з підказкою про вхід (`checkout-order-summary.tsx`) |
| `features/checkout/model/use-checkout.ts:144-146`     | 400 → показати `message` з API (там назва недоступного товару, `order.service.ts:194-195`), не `error400`                                                                                                                                                                                                                                                                                                                                                      |
| `features/auth/ui/login-form.tsx:122-133`             | 429 → «Забагато спроб. Спробуйте за хвилину» (IP-throttle = 60 с, `auth.controller.ts:118`). **Не** розкривати 15-хв акаунтне блокування (анти-енумерація, `auth.service.ts:183-191`) без рішення власника (§9 тріажу)                                                                                                                                                                                                                                         |
| `features/checkout/ui/np-city-field.tsx:45-70`        | `isError`/503 → окремий стан «Довідник Нової Пошти тимчасово недоступний — введіть місто вручну» замість «не знайдено»; `checkout-order-summary.tsx:26-31` — рядок «вартість уточнить оператор», а не тиша                                                                                                                                                                                                                                                     |
| Google-кнопка `login-form.tsx:246-258`                | Ховати за `NEXT_PUBLIC_GOOGLE_AUTH_ENABLED` або обробляти 503 редіректом `/login?oauthError=1` (маршрут уже є)                                                                                                                                                                                                                                                                                                                                                 |

**Приймання.** RTL-тести на кожну гілку; повторити SF-CART-08…13 і SF-CHK-04…06 на стенді
після деплою — **саме вони дадуть справжню причину WELCOME10**.

### TASK-403 🟡 — Кошик не позначає недоступний товар (E-14, SF-CART-18)

**Корінь.** API віддає `CartItem.isActive` (`cart-item.entity.ts:82-87, 169`, коментар «вітрина
**мусить** позначити»); `widgets/cart/ui/cart-item-row.tsx:106-107` рахує лише `outOfStock`,
`isActive` не читає ніде в `cart/`/`checkout/`.

**Зробити.** Бейдж «Недоступно» + disabled степер + CTA «Прибрати» при `!item.isActive`;
`cart-summary.tsx` блокує кнопку чекауту, поки є неактивний рядок, з поясненням; той самий
рендер у `cart-sheet`. Тест RTL на рядок з `isActive=false`.

### TASK-404 🟡 — «Власна ціна» на додатковій послузі видаляє послугу (AD-PROD-25)

**Корінь.** `product-addon-delta-panel.tsx:134-141` завжди шле `OVERRIDE`; унікальність
`(product, addonService)` у `addon-service.repository.ts:233` робить `ADD/REMOVE/OVERRIDE`
взаємовиключними → `ADD` замінюється на `OVERRIDE`; резолвер `addon-applicability.resolver.ts:168-178`
вважає `OVERRIDE` без бази інертним і викидає.

**Зробити.** `submitPrice`: `ADD` з ціною, якщо `addon.source === 'add'`; `OVERRIDE` лише для
`template`. У резолвері базовий `OVERRIDE` без бази трактувати як `ADD` (захист від старих
рядків). Юніт на резолвер + RTL на панель.

### TASK-405 🟡 — `/orders?status=` у новій вкладці: фільтри перестають працювати

**Корінь.** `shared/lib/use-url-params.ts:42-56` пише `router.replace(pathname + "?" + qs)`;
`app/(dashboard)/orders/page.tsx` без `dynamic`, тож маршрут статично пререндерений, і при
hard-load із query наступний `replace` зі зміною лише query не ре-рендерить споживача
`useSearchParams()`. Додатково: таб «Всі» має `value: ""` (`admin-order-table.tsx:71`) — не
валідне значення Radix.

**Зробити.** Варіант А (простіший, локальний): `export const dynamic = "force-dynamic"` на
list-маршрутах адмінки (усі під auth, статика не потрібна). Варіант Б (правильніший): у
`useUrlParams` тримати стан локально + `window.history.replaceState`. Обрати А зараз, Б —
у TASK-423. Таб «Всі» → `"__all__"`. Перевірити всі ~17 таблиць, що використовують хук.
Playwright: відкрити `/orders?status=PROCESSING` напряму → клік по іншому табу змінює список.

### TASK-406 🟡 — Менеджера «неможливо створити»; пошук користувачів/товарів; бейдж деактивації

Розблоковує AD-DASH-13, AD-RET-11, AD-MKT-12, AD-CRM-10/20, AD-DEV-10 і всю зону AD-RBAC.

1. **Видимість.** `AdminUserTable.tsx:201-207` — кнопка «Створити» лише `isOwner`, у слоті
   тулбара. Діалог створює **новий службовий акаунт** (email, пароль, роль ADMIN/MANAGER), не
   підвищує клієнта — власник цього не побачив. Винести в заголовок сторінки `/users` як primary
   action **і** додати той самий CTA на `/settings/permissions` («Права доступу»): власник
   очікує там і видати акаунт, і одразу налаштувати роль; порожній стан списку
   менеджерів («Менеджерів ще немає — створіть») з тим самим CTA; у `/users/[id]` під роллю —
   лінк «Права ролі → /settings/permissions» і пояснення «права видаються ролі, не людині».
2. **Пошук користувачів** `user.repository.ts:126-131` — розбити на токени по пробілу, `AND`
   токенів, кожен `OR` по email/firstName/lastName. Тест на «John Doe», «doe john», «john@».
3. **Пошук товарів за артикулом** (AD-PROD-08) — додати `sku` в `OR` адмінського пошуку
   (`product.repository` admin findAll).
4. **Бейдж деактивації** (SF-AUTH-14) — `UserBanToggle.tsx:43-55` інвалідує не той ключ; додати
   `getGetUserAdminCardQueryKey(userId)`; перевірити `DeleteUserDialog`, `UserPasswordResetDialog`.

**Приймання.** Власник бачить CTA без пошуку; створює менеджера; входить ним; RBAC-чеки
проходяться. Пер-користувацькі оверайди й «акаунти для продавців» — **не** тут (TASK-445,
який починається з аналізу поточної моделі доступів).

### TASK-407 🟡 — Чекаут: валідація, степер, навігація, сторінка підтвердження

1. **Телефон.** `checkout-schema.ts:21` рахує символи маски. Спільне правило UA-номера: нормалізувати
   до цифр, вимагати 12 (`380` + 9). Клієнт — `shared/lib/phone.ts` (використати в чекауті й
   `widgets/contact/model/contact-schema.ts:17-21`); API — `@IsUaPhone()` у
   `common/validators/` поруч з `IsStrongAppPassword`, застосувати в `create-contact-message.dto.ts:27-32`,
   `create-order.dto`, `create-manual-order.dto`. `phone` у `CHECKOUT_DEFAULT_VALUES` = `""`
   (`checkout-schema.ts:94-97`), щоб не було англійського «Required».
2. **Помилки не зникають при вводі.** `checkout-view.tsx:94-99` без `mode`; крок 1 йде через
   `trigger()` (`use-checkout-steps.ts:60`), що не вмикає `reValidateMode`. Зробити крок 1 справжнім
   `handleSubmit(goToReview)` на `type="submit"` — помилки з'являються лише після «Далі» і
   зникають при вводі. Дописати Rule 4 у `docs/conventions/forms.md` (таймінг валідації;
   «валідуй нормалізоване значення, не маску») — сам текст правила в TASK-453, тут посилання.
3. **Степер.** `checkout-step-indicator.tsx:4-8` три кроки, `use-checkout-steps.ts` два. Рендерити
   `<CheckoutStepIndicator current={3}/>` на `/orders/[id]/confirmation` і в `CheckoutGuestSuccess`.
4. **Хлібні крихти** `Головна / Кошик / Оформлення` над `<h1>` (`checkout-view.tsx:181`).
5. **Контейнер сторінки підтвердження.** `orders/[id]/confirmation/page.tsx:28-32` і
   `orders/guest/[token]/page.tsx:33-37` без `mx-auto max-w-… px-4` — додати за зразком `orders/page.tsx:13`.
6. **«Спробувати ще раз» на скасованому.** `order-payment-panel.tsx:121-143` знає лише
   `paymentStatus`; передати `orderStatus` з `order-confirmation-view.tsx:180-186` і ховати обидві
   гілки retry для `CANCELLED/REFUNDED/DELIVERED`, показуючи «Замовлення скасовано».
7. **Політика пароля покупця (рішення власника 2026-09-10).** Для реєстрації/скидання/зміни
   пароля покупця: ≥8 символів, хоча б одна мала літера і цифра — без вимоги великої. Адмінка
   (`POST /users`, зміна пароля службових акаунтів) лишає строгу політику. Розділити
   `IsStrongAppPassword` на `IsCustomerPassword` + `IsStaffPassword` (API) і два дзеркала в
   `password-policy.ts` (клієнт); текст підказки в словнику.

### TASK-408 🟡 — Складські числа й дерево категорій: семантика, яку видно неправильно

1. **«Фізично» на echo-відповідях.** `product.entity.ts:260-261` — `reservedQty ?? 0` для
   create/update/activate/deactivate → `physicalQty === stock`. Або дораховувати `reservedQty` в
   цих відповідях, або не повертати похідні поля з мутацій (і UI не рендерить `undefined`).
   Підказка в заголовку колонки: «Фізично = вільно + зарезервовано під незакриті замовлення».
   Обов'язково: повторити SF-ACC-15 із записом трьох чисел до/після/після скасування.
2. **Лічильник категорій** `category.repository.ts:428, 757-761, 781` — прямий підрахунок; вітрина
   рахує піддерево (TASK-236). Дорахувати піддерево в `assembleAdminTree` (читання вже пласке)
   і показувати «19 (безпосередньо 0)».
3. **Бейдж «прихована через батька»** у дереві: обхід предків клієнтом (`parentId` є).
4. **Цикл у дереві (AD-CAT-08).** TASK-238 виправив SQL-перевірку; перевірити, що DnD/форма
   не дає обрати нащадка батьком, і додати int-тест на `PATCH reorder` з циклом → 400.

### TASK-409 🟡 — Дрібні дефекти вітрини з чекліста (по одному рядку кожен)

| Що                                                        | Де / як                                                                                                                                                                                                                                                                  |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Скелетон каталогу перед PDP (SF-PDP-03/05)                | Створити `app/products/[slug]/loading.tsx` → `<ProductDetailSkeleton/>`                                                                                                                                                                                                  |
| Кнопка PDP «Додано ✓» назавжди (💡)                       | `add-to-cart-button.tsx:73-79` — прибрати гілку `isSuccess`; `product-detail-view.tsx:220-223` читає `useGetCart()` і рендерить «В кошику» (success) / «Товар закінчився» (destructive, коли в кошику й `!inStock`) / idle — за зразком `product-card-actions.tsx:44-84` |
| Варіанти вантажаться заново (❓1)                         | `product-sibling-navigator.tsx:120-172` — `<Link>` замість `<button>`, `prefetchQuery(getProductControllerFindBySlugQueryOptions)` на hover/focus; `providers.tsx` `gcTime: 30 хв`                                                                                       |
| Послуги в модалці кошика (💡)                             | `cart-sheet.tsx:115` — додати `showAddons`                                                                                                                                                                                                                               |
| Прихований товар видно після «назад» (AD-PROD-16)         | `router.refresh()` на `popstate` для `/products/*` або `experimental.staleTimes.dynamic=0`; коментар у `revalidate-targets.ts`                                                                                                                                           |
| Бейдж «Підтверджена покупка» не видно на демо (SF-PDP-20) | Підпис «Покупець» **лишаємо** (рішення власника); у сіді зв'язати частину відгуків із замовленнями, щоб бейдж був видимий. Показ лише відгуків із текстом — TASK-446                                                                                                     |

## Порядок і перевірка

1. TASK-397 → 398 → 399 (три стіни адмінки), потім 400, 401.
2. 402 → 403 → 407 (вітрина), 404, 405, 406, 408, 409 — незалежні, можна паралельно.
3. Після кожної: `npm run test -w <workspace>` відповідного пакета; перед мержем —
   `npm run typecheck && npm run lint && npm run test` + `npm run test:e2e -w apps/store-api --runInBand`
   (серійно, див. пам'ять про e2e).
4. Деплой на демо-стенд → повторити чеки з §8 тріажу, група «після фіксів 173».
5. **Перепровірка.** Закриваючи задачу, знайди її рядок у Додатку А `docs/qa-recheck.md` і
   постав `[🔁]` на кожному її чеку. Тестер проходить лише `[🔁]`.

## Ризики

- TASK-401 змінює поведінку під збоєм Redis з «усе працює» на «публічні записи 503». Це
  правильний напрям (без цього не працює анти-перебір), але треба переконатись, що healthcheck
  Redis у compose не дає флапів; підняти `maxRetriesPerRequest` до 2.
- TASK-405 варіант А робить list-маршрути динамічними — це адмінка під auth, вплив на
  продуктивність нульовий.
