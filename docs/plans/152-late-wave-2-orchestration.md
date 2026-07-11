# План 152 — Оркестрація «Пізньої хвилі 2» (TASK-168/082/083/084/086/139 + discovery 140)

> **Виконавець:** оркестратор-сесія (Opus) у корені репо `D:\projects\store-ai`, гілка `develop`.
> Схвалено власником 2026-07-11. Скоуп: TASK-168 (лише Google), 082, 083, 084, 086, 139 —
> імплементація; TASK-140 — **discovery-only** (мемо без коду). Рішення власника нижче вважати
> ухваленими — НЕ перепитувати.
>
> **Правила оркестратора:** `BACKLOG.md` редагує ТІЛЬКИ оркестратор (агенти — ніколи). Кожну
> фазу завершувати комітом на `develop`. Якщо planner (Фаза 1) знаходить блокер, що суперечить
> уже ухваленим рішенням — зупинитись і спитати власника ПЕРЕД імплементацією. Наступний
> вільний план — **153** (152 = цей файл); наступний вільний Task ID — **TASK-288** (нові ID
> не очікуються).

## Рішення власника (2026-07-11)

- **TASK-168:** лише Google OAuth. Apple — поза скоупом; кнопку-стаб Apple з toast
  `dict.auth.login.socialSoon` лишити як є (чесний стаб, уже проходив ревʼю).
- **TASK-140:** discovery-only — re-scope-мемо без імплементації; рішення власника після хвилі.
- **TASK-139:** модель «правила + ручний вибір» — карусель має
  `source: BESTSELLING | NEWEST | ON_SALE | CATEGORY | MANUAL` (+ таблиця `CarouselItem` для
  MANUAL, + categoryId для CATEGORY); дзеркалить Banner-патерн (publish lifecycle, sortOrder).
- **TASK-083:** upload-ендпоінт НЕ робимо — admin-форма лишається з URL-input
  (якщо planner аргументовано вважає інакше — питання до власника, не самодіяльність).

## Факти розвідки (2026-07-11, develop @ d05ef2e) — НЕ передосліджувати

- **TASK-082 — суто фронтенд.** `GET /categories/tree` вже віддає 3 рівні активних дітей
  (`apps/store-api/src/category/category.repository.ts` → `findCategoryTree()` L236–270);
  Orval-хук `useCategoryControllerGetCategoryTree` вже споживається у
  `apps/store-client/src/widgets/product-list/ui/product-list-view.tsx` (L165) і
  `widgets/category-detail/ui/subcategory-chips.tsx`. Мега-меню
  (`widgets/header/ui/header-search.tsx` L242–293 — панель «Каталог»; мобільний Sheet у
  `widgets/header/ui/header.tsx` L152–170) сидить на плоскому `getRootCategories` —
  переключити на tree-хук і відрендерити другий рівень (flyout на десктопі /
  accordion у Sheet). API-робота не потрібна.
- **TASK-083 — `Category.image` вже існує** (schema.prisma L122, `String?`), пропущений
  end-to-end (repo inputs, tree entity, admin-форма `category-form.tsx` L183–195 як
  URL-input). Лишилось відрендерити image у плитках сторфронту з фолбеком на наявні
  іконки/градієнти: `widgets/category-nav/ui/category-nav.tsx` (головна) і
  `widgets/categories/model/category-visuals.ts` (сторінка `/categories`).
- **TASK-084 — deferred-пункти ніде не перелічені**; scope визначає planner з поточного стану
  дровера: `product-list-view.tsx` L246–274 (`<Sheet side="left">`, футер-кнопка
  `dict.filters.mobileApply` — зараз просто закриває) + `features/product-filters/ui/product-filters.tsx`
  (рендериться двічі — `idPrefix`). Кандидати: sticky «Показати N товарів» з живим
  result-count, per-section collapse, скрол-поведінка/scroll-lock.
- **TASK-086 — quick-view з нуля** (стаба немає — stub-аудит, план 129 row 7). Seam готовий:
  `shared/ui/product-card.tsx` має overlay-пропси (`quickAdd`, `action`, `wishlist`) +
  stretched-link патерн (overlay-кнопки клікабельні незалежно); overlay інжектить
  `widgets/product-card-actions/ui/product-card-actions.tsx`. Модал — `Dialog` із shared/ui
  (приклад використання: product-image-manager в адмінці); дані — детальний фетч продукту
  (list-ентіті може бракувати полів).
- **TASK-168 — OAuth-інфраструктури нуль.** У `apps/store-api/src/auth/`: `passwordHash`
  NOT NULL, жодних provider-полів/моделей; пакетів `passport-google-oauth20`/`openid-client`
  немає (є `@nestjs/passport`, `passport-jwt`). Треба: модель `OAuthAccount`
  (append у КІНЕЦЬ schema.prisma; provider+providerId unique, userId FK), варіант створення
  юзера без пароля (`auth.repository.ts` `createUser` вимагає passwordHash), routes
  `GET /api/auth/google` + callback, account linking по verified email
  (+ рішення planner-а: що робити при конфлікті з деактивованим/tombstoned юзером — узгодити
  з політикою TASK-274/287: generic-відмова, без оракулів), reuse `generateTokenPair`
  (auth.service.ts L282) + існуючий `setRefreshCookie`-флоу; merge guest cart/wishlist як у
  login. Кнопки застабані у `apps/store-client/src/features/auth/ui/login-form.tsx` L214+.
- **TASK-139 — шаблон для копіювання: Banner.** Модель (schema.prisma L766–793, publish
  lifecycle `status/publishedAt/scheduledAt` + sortOrder) + модуль `apps/store-api/src/banners/`
  (public `banners.controller.ts` + `admin-banners.controller.ts` під AdminGuard) +
  адмінка `features/banner-form/` + `widgets/banner-list/` + ISR-фетч
  `apps/store-client/src/shared/api/banners-server.ts` (tag-based revalidate). Точка вставки
  на головній: `apps/store-client/src/app/page.tsx` (нині хардкод `PopularRail` =
  `widgets/product-grid/ui/product-grid.tsx`, 3 таби Хіти/Новинки/Акційні через
  `useProductControllerFindAll`). Planner вирішує: нові каруселі співіснують з PopularRail
  чи замінюють його (за замовчуванням — співіснують нижче, заміна = питання власнику).
- **TASK-140 — залишок після 147 (сортування) / 192 (редизайн) / 258 (мобільний card-mode) /
  276 (a11y):** TanStack DataTable-рерайт ~16 рукописних таблиць + rethink
  керування/візуалізації категорій. Стан примітива: `apps/store-admin/src/shared/ui/table.tsx`
  (layout scroll|card, rowLabel, hideOnMobile). Тільки мемо, без коду.
- **Словники:** обидва фронтенди мають ЄДИНИЙ файл `src/shared/config/dictionary.ts` —
  головна конфліктна точка між гілками; протокол у чек-листі нижче.

## Фаза 0 — Pre-flight (main tree)

- `git status` чистий; за наявності remote — `git pull origin develop`.
- Позначити 168/082/083/084/086/139 → 🔄 у BACKLOG (Plan-колонка: 153/155/155/156/156/154);
  у рядку 140 дописати «discovery in progress (plan 157)». Коміт `docs(backlog): start late wave 2`.

## Фаза 1 — Планування (main tree, БЕЗ worktrees; агенти паралельно)

Запустити паралельно 4 `task-planner` + 1 `architect`; кожен пише ТІЛЬКИ свій файл (не BACKLOG).
У промпт кожному вкласти відповідний блок «Факти розвідки» + «Рішення власника» з цього файлу.

| Агент                 | Задача                                                                                              | Файл                                         |
| --------------------- | --------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| task-planner          | TASK-168 Google OAuth: backend модуль + account linking + client wiring                             | `docs/plans/153-google-oauth.md`             |
| task-planner          | TASK-139 каруселі: source-enum + CarouselItem, дзеркало Banner, admin CRUD, home-віджет             | `docs/plans/154-recommendation-carousels.md` |
| task-planner          | Група C: TASK-082 (мега-меню дерево) + TASK-083 (плитки з image)                                    | `docs/plans/155-category-nav-group.md`       |
| task-planner          | Група D: TASK-084 (filter drawer polish) + TASK-086 (quick-view)                                    | `docs/plans/156-catalog-ux-group.md`         |
| architect (read-only) | TASK-140 re-scope мемо: що реально лишилось, оцінка вартості, рекомендація (робити/розбити/закрити) | `docs/plans/157-admin-datatable-rescope.md`  |

Прочитати всі 5 файлів; блокери/суперечності з ухваленими рішеннями → до власника.
Закомітити плани + BACKLOG на `develop` ДО створення worktrees (гілки успадкують плани).

## Фаза 2 — Імплементація (4 паралельні worktrees)

| WT  | Задачі       | Гілка                                  | Агент                                   | Область                                                                                                                  |
| --- | ------------ | -------------------------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| A   | TASK-168     | `feature/168-google-oauth`             | **tdd-agent** (auth = критичний модуль) | store-api auth + schema append (`OAuthAccount`) + store-client `login-form.tsx` + `dict.auth`                            |
| B   | TASK-139     | `feature/139-recommendation-carousels` | build                                   | schema append (Carousel/CarouselItem/enum) + новий api-модуль (дзеркало banners) + admin CRUD + home-віджет у `page.tsx` |
| C   | TASK-082+083 | `feature/082-category-nav`             | build                                   | лише store-client: header mega-menu → tree hook; category-nav/categories плитки з `image`                                |
| D   | TASK-084+086 | `feature/084-catalog-ux`               | designer                                | лише store-client: filter drawer polish; quick-view Dialog через overlay-seam ProductCard                                |

Worktrees створювати **вручну, поза деревом репо** (НЕ `isolation:"worktree"` — worktree
провізиниться на stray-базі «first commit» без `apps/`; НЕ всередині репо — відкритий VS Code
локає node_modules у вкладених worktrees):

```bash
git worktree add D:/projects/.wt-store-ai/wt-168 -b feature/168-google-oauth develop
git worktree add D:/projects/.wt-store-ai/wt-139 -b feature/139-recommendation-carousels develop
git worktree add D:/projects/.wt-store-ai/wt-082 -b feature/082-category-nav develop
git worktree add D:/projects/.wt-store-ai/wt-084 -b feature/084-catalog-ux develop
```

### Обовʼязковий чек-лист у промпті КОЖНОГО агента (перевірений планом 149)

1. `npm install` (не `npm ci` — lockfile-стан у worktree непридатний) у корені worktree,
   потім `npx prisma generate` з inline dummy `DATABASE_URL`.
2. Скопіювати Orval-дерева з main tree — ВЕСЬ `shared/api/generated/**` gitignored, без нього
   фронтенд-typecheck червоний:
   `cp -rf D:/projects/store-ai/apps/store-client/src/shared/api/generated/. <wt>/apps/store-client/src/shared/api/generated/`
   (те саме для `store-admin`).
3. `.env*` gitignored → відсутні у worktree: `prisma generate` і `swagger:export` потребують
   inline dummy-env (`DATABASE_URL`, `NODE_ENV`, `JWT_SECRET`/`JWT_REFRESH_SECRET`;
   секрети ≥32 символи — мінімум env-валідації).
4. **НЕ запускати e2e / int / Playwright у worktree** — лише unit + lint + typecheck + build
   свого workspace. Повні гейти йдуть на develop після merge (Фаза 3).
5. **Гейти запускати СИНХРОННО:** один Bash-виклик (timeout до 600000), розпарсити результат у
   звіт. НІКОЛИ не `run_in_background` — фоновий прогін помирає разом з агентом, звіт
   лишається порожнім (сталося 3× у Wave 5).
6. Jest флейкає під паралельними воркерами на цій машині (таймаути 30–80s): червоний повний
   прогін підтверджувати `--runInBand` перед тим, як вважати його реальним.
7. Коміти конвенційні `type(scope): ...`. **BACKLOG.md не чіпати.** Append-only протокол:
   `docs/manual-qa-pending.md` — блок `### TASK-NNN` в кінці файлу; `dictionary.ts` — нові
   ключі в КІНЕЦЬ власного namespace-блоку (A: `auth`; B: власні нові namespaces в обох
   апках; C: `header` / `home.categories` / `categories`; D: `filters` + новий `quickView`);
   `widgets/index.ts` — append. Нічого не переписувати поза своєю задачею.
8. Prisma-схему міняють лише A і B: нові моделі — append В КІНЕЦЬ `schema.prisma` (конфлікт
   між гілками стає тривіальним keep-both). Міграційні SQL gitignored — джерело правди
   `schema.prisma` (`db push`, не `migrate dev`).
9. Розподіл hotspot-файлів: тільки B торкається `app/page.tsx`; D — єдиний, хто редагує
   `shared/ui/product-card.tsx` (B споживає ProductCard read-only).
10. WT-A: реальних Google-креденшелів немає — стратегію тестувати юніт/e2e з мокнутим
    профілем; env-ключі задокументувати в `.env.example`; живий OAuth-флоу → manual-qa-блок.

Якщо агента зрізав session-limit — продовжити через `SendMessage` на його agentId, спершу
попросивши `git log/status`, щоб не переробляв уже закомічене.

## Фаза 3 — Інтеграція (оркестратор, main tree, `develop`)

Merge-порядок від дрібних до великих; останній великий = designated adapter:

1. `git merge --no-ff feature/082-category-nav` → `git merge --no-ff feature/084-catalog-ux`
   (обидві client-only; можливий тривіальний конфлікт `dictionary.ts` — keep-both за namespace).
2. `git merge --no-ff feature/168-google-oauth`.
3. **TASK-139 = adapter:** перед фінальним merge — `git merge develop` УСЕРЕДИНІ wt-139
   (через SendMessage агенту або оркестратор напряму), розвʼязати конфлікти
   schema.prisma/dictionary/page.tsx ТАМ, повторно прогнати юніт-гейти worktree; лише потім
   `git merge --no-ff feature/139-recommendation-carousels` у main tree.
4. **Один пост-merge regen на develop** (main tree має справжній `.env`, dummy-env не потрібні):
   `npm run swagger:export -w apps/store-api` → `npm run generate:api`. Згенероване gitignored —
   `git status` лишиться чистим; файли просто мають існувати на диску.
   `npx prisma db push` на dev-БД **і** на `store_test` (Playwright ходить у store_test —
   без явного `DATABASE_URL` сід і API дивляться в різні БД).
5. Повні гейти на develop:
   - `npm run typecheck`, `npm run lint`, `npm run build` (всі workspaces);
   - store-api: unit; e2e `--runInBand` (паралельні supertest-воркери масово флейкають);
     `test:int` серійно (int реально ходить у store_test);
   - store-client: тести `--runInBand` (важкі MSW-сюїти таймаутяться паралельно);
     store-admin: тести;
   - Playwright з явним `DATABASE_URL` на store_test.
6. BACKLOG: ✅ по 168/082/083/084/086/139 одним комітом `docs(backlog): ...`; manual-only
   перевірки → append-блоки `### TASK-NNN` у `docs/manual-qa-pending.md`.
7. Cleanup: `git worktree remove <dir>` (може лишити каталог — нормально) + `git worktree prune`;
   фізичні каталоги видалити пізніше, коли Windows відпустить локи.

## Фаза 4 — Верифікація («успішно виконано» =)

- Усі гейти п.5 Фази 3 зелені на `develop`.
- Живий смоук на запущеному стеку: карусель створюється в адмінці і зʼявляється на головній
  (перевірити MANUAL і хоча б один rule-source); мега-меню показує другий рівень категорій;
  плитка категорії з установленим `image` рендерить зображення (і фолбек без нього);
  quick-view відкривається з картки товару і не ламає stretched-link/квік-адд;
  drawer-polish на мобільному вʼюпорті. Google OAuth без креденшелів — мокнуті тести зелені,
  живий флоу в manual-qa.
- TASK-140: прочитати `docs/plans/157-admin-datatable-rescope.md`, стисло переказати власнику
  рекомендацію; статус у BACKLOG лишити ⬜ (або 🅿️, якщо мемо рекомендує парк) —
  **не імплементувати**.
- Фінальний звіт власнику: що злито (гілки/коміти), результати гейтів, manual-qa список,
  відкриті питання.

## Довідка

- Повʼязані плани: 149 (шаблон оркестрації попередньої хвилі), 129 (stub-аудит: рядки
  quick-view і social sign-in), 136 (TASK-273/274 — политика generic-відмов у auth),
  140 (контекст admin mobile tables), 070 (сортування таблиць).
- Готові плани цієї хвилі: 153 (168), 154 (139), 155 (082+083), 156 (084+086), 157 (140-мемо).
