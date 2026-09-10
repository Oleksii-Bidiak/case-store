# План 174 — Вітрина: адаптив, тема, фільтри, PDP, пошук

**Статус:** ⬜ · **Задачі:** TASK-410…420, 459, 217 · **Гілка:** `feature/410-storefront-ux` (worktree,
паралельно з 175/176) · **Джерело:** [тріаж 2026-08-27](../reviews/2026-08-27-demo-run-triage.md)
§3 (вітрина), §4, §5 · **Виконавець:** `designer` для 410/412/415/416, `build` для решти ·
**Дизайн-токени:** `docs/design-system.md`, `apps/store-client/src/app/globals.css`.

## Навіщо

Власник пройшов вітрину як покупець і зафіксував: на вузьких екранах ламається хедер і форма
розсилки; тему не перемкнути; фільтри не скидаються і не комбінуються; PDP рано розвалюється
на колонки; пошук по Enter відкриває не те; підказки «сіпаються». Жоден пункт не блокує
покупку, але разом вони — перше враження замовника на демо. Рішення власника: до запуску.

## Рішення, закладені в план (див. тріаж §9)

- Мобільна сітка: 1 картка нижче 390px, далі 2, від `lg` — 4 (скасовує F-19 із TASK-259; тест
  `product-list.test.tsx:219-230` оновити, не видалити). Обґрунтування власника: 3 картки на
  великому екрані займають забагато місця.
- Зображення карток: фото товару в боксі фіксованих пропорцій з `object-contain` на `bg-muted`
  (сучасний еквівалент хаку `-ibg` + `padding-bottom`: `aspect-square` + `object-*`, без
  абсолютного позиціонування); `object-cover` лишається для банерів і плиток категорій.
- Заглушки «порівняння»/«1 клік»: ховаємо прапорцем `NEXT_PUBLIC_FEATURE_STUBS` (скасовує
  «лишити видимими» з TASK-267); код не видаляємо.
- Блог у пошуку: індексуємо в Meili (варіант а).

## Задачі

### TASK-410 — Адаптив до 320px без горизонтального скролу

**Корінь (4 дефекти):**

- `features/newsletter-subscribe/ui/newsletter-subscribe-form.tsx:86` — ряд без `flex-wrap`,
  input `flex-1` без `min-w-0` (intrinsic ~180px), кнопка `whitespace-nowrap`.
- `widgets/header/ui/header.tsx:78-80`, `shared/ui/logo.tsx:71,85` — жоден flex-елемент лівого
  кластера не має `min-w-0`, wordmark не `truncate`.
- Контейнер «звужується» під оверлеєм: `react-remove-scroll` компенсує ширину кастомного
  скролбару (`globals.css:8-10, 231-253`) паддінгом `body`; без `scrollbar-gutter: stable`.
- Останній пункт меню під URL-баром: `header.tsx:94-98` Sheet `h-full` (layout viewport), без
  `overscroll-contain` (у фільтрів `product-list-view.tsx:268` є).

**Зробити.** `flex-wrap` + `min-w-0` (або `flex-col sm:flex-row`) у формі; `min-w-0 truncate` на
логотипі, `gap-2` до `sm`; `html { scrollbar-gutter: stable }`; Sheet `max-h-dvh overscroll-contain`;
на `<390px` ховати іконки «Обране» і «Кабінет» у хедері (лишаються в меню) — за журналом.
Playwright-скріншоти 320/360/390 для `/`, `/products`, `/products/[slug]`, `/cart`, `/checkout`
без `document.documentElement.scrollWidth > clientWidth`.

### TASK-411 — Пошук у хедері: іконка на вузьких, стабільні підказки, Enter

- **Брейкпоінт.** `header-search.tsx:194` `hidden md:block`; нижче `md` пошук лише в Sheet. Зробити
  `lg:block` для пілюлі, а `<lg` — кнопка-лупа, що відкриває поповер із `SearchAutocomplete`.
- **«Сіпання».** `header-search.tsx:63-75` — `useSearchSuggest`/`useBlogControllerFindAll` без
  `placeholderData: keepPreviousData` → список порожніє на кожен ключ. Додати (як у
  `product-list-view.tsx:112`), `min-h` панелі.
- **Enter відкриває перший товар.** `:175-183` Enter бере `combined[activeIndex]`, а `:408/:452`
  `onMouseEnter` ставить `activeIndex` — курсор над попапом «обирає» рядок. Розділити hover
  (CSS `:hover`) і клавіатурний індекс; те саме в `shared/ui/combobox.tsx:108-112,184`.
- **Порожній попап.** `:393-400` — рядок «Нічого не знайдено» зробити посиланням «Показати
  всі результати для “q”» → `/search?q=`.

### TASK-412 — Ручний перемикач теми (світла / темна / системна) для всіх

**Стан.** `next-themes` у deps, але єдиний споживач — `sonner.tsx:10` без провайдера. Темна тема
лише через `@media (prefers-color-scheme: dark)` у `globals.css:88-149`; нуль `.dark`/`data-theme`.
Рядки словника вже є: `themeDark/themeLight/themeSystem` (~`dictionary.ts:1288`).

**Зробити.** `globals.css`: перевести темні токени на `:root[data-theme="dark"]` +
`@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) {…} }` (порядок за
правилом «явний вибір перемагає в обидва боки»); `<ThemeProvider attribute="data-theme" enableSystem>`
у `providers.tsx`; `suppressHydrationWarning` на `<html>`; трьохстанова кнопка в хедері (десктоп) і
пункт у мобільному Sheet; в акаунті замінити текст `appearanceNote` на той самий контрол.
Зберігати в `localStorage` (next-themes робить). Перевірити `themeColor` у `layout.tsx:58-60`.
Playwright: перемикання без миготіння при перезавантаженні.

### TASK-413 — Мега-меню: стрілки, блокування скролу, «Усі товари»

`header-search.tsx:263-374` — лише `ArrowRight/Left`; панель — простий `div`, не Radix, без
scroll-lock. Додати `ArrowUp/Down/Home/End` (roving tabindex по `rootLinkRefs/childLinkRefs`),
блокувати `body` скрол поки `catalogOpen` (або перевести на Radix `Popover`). Десктопний ряд
`NAV_LINKS` (`header.tsx:31-34`, зараз лише в Sheet) як `hidden md:flex`; у панелі каталогу поруч
з «Усі категорії» — «Усі товари» → `/products`.

### TASK-414 — Фільтри каталогу: скидання, «В наявності», кілька характеристик, бренди за категорією, скрол

Пункти 1–2 і 5 — дефекти, робити одразу. Пункти 3–4 (які саме фасети і в якому вигляді)
залежать від аналізу **TASK-458 (B-10)** у плані 178: власник побачив у каталозі замало
фільтрів порівняно з ринком і не знає, чи це дані сіду (мало атрибутів на товарах), чи модель.

1. `device-model-filter.tsx:69-103` — пункт «Будь-який» в обох селектах; `product-filters.tsx:135-140`
   `hasActiveFilters` + `:342-349` clear — додати `deviceModelId` і `specs`.
2. `lg` сайдбар `product-list-view.tsx:242-244` — `lg:max-h-[calc(100dvh-7rem)] lg:overflow-y-auto lg:overscroll-contain`.
3. **`inStock`** — новий boolean у `product-list-query.dto.ts` з `@Transform(({obj,key}) => obj[key]…)`
   (пастка `enableImplicitConversion`, як `:88/:108/:130`), `where.stock = { gt: 0 }`, **обов'язково в
   `buildProductListKey`** (інакше отруєння кешу — саме тому `outOfStock` примусово `undefined`,
   `product.service.ts:172-176`). Чекбокс у `ProductFilters`.
4. **Кілька значень характеристик** — `?specs=k:v,k2:v2` на обох боках: `parseSpecFilter`
   (`product-list-query.dto.ts:179-191, 231-239`) → масив, `repository.ts:549-555` → `AND` із
   `specValues.some`; `spec-facets.tsx:44-92` — мультивибір, зняти `MAX_FACETS = 2` або підняти.
5. **Бренди за категорією** — `GET /brands?categoryId=` (distinct `brandId` по піддереву, кеш
   Redis за ключем категорії); `brand-filter.tsx:43` передає `currentParams.categoryId`.

Тести: DTO (transform boolean), repository int-тест на `inStock` і multi-spec, RTL на скидання.

### TASK-415 — Сітка та картки

- `product-list.tsx:182` і `product-list-skeleton.tsx:28`: `grid-cols-1 min-[390px]:grid-cols-2 … lg:grid-cols-4`
  замість auto-fill; той самий клас на `/search` (`search-results-view.tsx:121`). Оновити тест.
- `product-card-image.tsx:85` `object-cover` → `object-contain` усередині наявного `aspect-square`
  (фон уже є, `product-card.tsx:89`); PDP-галерея так само; банери/плитки категорій — `cover`.
- Однакова висота: у сітках карток `items-stretch` явно, `product-card.tsx:87` `h-full`; попросити
  у власника адресу, де висоти різні (з коду не відтворюється).
- **Чорний оверлей при alt+tab** — діагностика: на одній картці `placeholder="empty"`; якщо зникає —
  не використовувати спільний `BLUR_PLACEHOLDER` для зображень із власним `blurDataUrl`; прибрати
  дубль `transition-transform` (`product-card-image.tsx:85` і `product-card.tsx:89`).

### TASK-416 — PDP: брейкпоінт, лайтбокс, таби в URL, скелетони

- `product-detail-view.tsx:128` — `md:grid-cols-[1fr_360px] lg:grid-cols-[1fr_1fr_360px]` (768 → 2
  колонки); узгодити з `sizes` галереї (`product-image-gallery.tsx:99` вже припускає 768).
  Оновити `product-detail-skeleton.tsx`.
- Лайтбокс: `Dialog` із повнорозмірним `<Image>`, стрілки/свайп (`shared/ui/dialog.tsx` є).
- Таби `product-specs-tabs.tsx:37` → controlled: `?tab=specs|reviews|delivery`, перший без параметра,
  `router.replace(..., { scroll:false })`.
- Скелетони: `ProductListSkeleton` варіант `withSidebar` (`grid-cols-[268px_1fr]` + чипи) для
  `app/products/loading.tsx` і `Suspense`; `hero-category-sidebar.tsx:38-46` `h-full` + `flex-1`.

### TASK-417 — Пошук: фільтри, SKU, блог у Meili, єдина пагінація

- DTO пошуку: `categoryId`, `brandId`, `sort` → Meili `filter`/`sort` (фасети вже
  `search.service.ts:31-41`); UI — сайдбар `ProductFilters` на `/search`.
- `sku` у `searchableAttributes` (SF-SRCH-09) + у `searchTerms`.
- Індекс `blog_posts` з тими ж `typoTolerance`/`synonyms` і `searchTerms`, індексація з мутацій
  `BlogService` за зразком `product-indexer.ts`; `useBlogControllerFindAll` у підказках → пошук
  через Meili (з фолбеком на Prisma як у товарів).
- Пагінація: винести `widgets/product-list/ui/pagination.tsx` у `shared/ui/pagination`, використати
  на `/search` (`search-results-view.tsx:134-169`) і в `/blog` (`blog-view.tsx:181-183`, лишити
  «Показати більше» як доповнення); `/promo` (`deals-pagination.ts`) — той самий компонент.

### TASK-418 — Кошик: перерахунок під час вводу, відкат видалення

`cart-item-row.tsx:295-298` `onChange` лише `setQty`; `:187-196` commit на blur; степер робить
optimistic одразу. На `onChange` — `resolveQuantityCommit` → `applyOptimisticQuantity`, запис
лишається на `debouncedUpdate` 300 мс. Видалення `:271` → toast з дією «Повернути» (re-POST
рядка з тими самими add-on'ами), 8 с; зразок — 30-с undo у дереві категорій (TASK-291).

### TASK-419 — Повернення після входу; заглушки за прапорцем; тихий 401 refresh

- `submit-review-form.tsx:61` `href="/login"` → `/login?redirect=<pathname>`; `login-form.tsx:293`
  і дзеркало в `register-form` — пробросити `redirect` між входом і реєстрацією. Оновити тест
  `submit-review-form.test.tsx:28`.
- `NEXT_PUBLIC_FEATURE_STUBS=false` → не рендерити 4 місця: `product-detail-view.tsx:226-244`,
  `dictionary.ts:1250/1302` (нав і секція «Порівняння» в акаунті). Записати в BACKLOG, що
  TASK-085/178 при розпаркуванні вмикають прапорець.
- `/auth/refresh` 401 для гостя (SF-UX-13): не логувати як помилку в консоль (interceptor
  ковтає очікуваний 401 при відсутності маркера сесії).

### TASK-459 — Аудит shadcn-примітивів (вітрина + адмінка)

Власник: «селекти спочатку розкриваються добре, але при скролі збільшуються у висоту і не
зменшуються; мають поводитись як нативні». Пройти всі обгортки в `shared/ui` обох застосунків:
`Select` (`position="popper"`, `max-h-[--radix-select-content-available-height]`,
`collisionPadding`), `Combobox`, `Sheet`/`Dialog` (scroll-lock, `dvh`), `DropdownMenu`,
`Tabs` (значення `""`), `Tooltip`. Порівняти з актуальними шаблонами shadcn/ui (`context7`),
оновити лише розбіжності. RTL-тести на відкриття/скрол селекта з 30 опціями.

### TASK-217 — `/orders` у кабінет (розпарковано 2026-09-10)

Макет робимо тут же: скіл `design` створює канвас Claude Design із цієї сесії Claude Code
(артборди «кабінет: замовлення», «деталі замовлення» на десктоп/мобільний), власник править
візуально, далі реалізація за макетом у `widgets/account`. Історія замовлень і деталі
стають секціями `/account/orders`, `/account/orders/[id]`; старі `/orders*` → 308.

### TASK-420 — Слаги замість id у параметрах каталогу (L, останньою)

`?categoryId/brandId/deviceModelId=<uuid>` (`product-list-view.tsx:81-99`,
`product-detail-view.tsx:155`) → `?brand=apple&device=iphone-15`. Торкається DTO, репозиторію,
ключів кешу, canonical (`listing-metadata.ts:84`), редиректів зі старих URL (308).
`/orders/[id]` лишається UUID свідомо (приватна сторінка, `noindex`). Робити після 414 і 417,
щоб не переписувати двічі.

## Порядок

410 → 411 → 413 (хедер, один файл-кластер) · 412 окремо (CSS-рефактор) · 459 перед 414 (селекти
фільтрів) · 414 → 417 → 420 (фільтри → пошук → слаги) · 415, 416, 418, 419, 217 незалежні.

## Перевірка

`npm run test -w apps/store-client --runInBand` (паралельний прогін флейкає — пам'ять проєкту);
Playwright-скріншоти адаптиву. Закриваючи задачу — `[🔁]` на її чеках у `docs/qa-recheck.md`
(Додаток А); тестер проходить лише їх.
