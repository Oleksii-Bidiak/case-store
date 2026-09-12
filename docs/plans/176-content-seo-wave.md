# План 176 — Контент і SEO: мета-теги по сторінках, редактор, `/info`, блог

**Статус:** ✅ код (2026-09-13) · **Задачі:** TASK-432…438 · **Гілка:**
`worktree-feature-432-content-seo` (worktree, паралельно з 174/175) · **Джерело:**
[тріаж 2026-08-27](../reviews/2026-08-27-demo-run-triage.md) §3 SF-SEO/SF-CNT/AD-CNT, §5,
§6 п.3 · **Пов'язане:** Етап 7 SEO/GEO, TASK-283 (наповнення).

> **Виконано.** Сім задач, сім комітів, чотири міграції (`add_seo_settings_site_name`,
> `add_page_kind`, `add_blog_post_listed`, `add_entity_seo_fields`). Повний прогін на кінець
> хвилі: store-api 161/2731, store-client 133/997, store-admin 120/1064, e2e 32/545,
> typecheck і lint чисті. `[🔁]` поставлено на SF-SEO-09, SF-SEO-14, SF-CNT-05, SF-CNT-26 —
> проходяться після деплою. У 433, 437, 438 чеків живого прогону немає, тож позначати там
> нічого.
>
> **Рішення власника по ходу:** TASK-433 зроблено без видимого логотипа (він у файлах, які
> переписує хвиля 174) → TASK-497 після мержу 174; TASK-437 додав `BlogPost` повний набір
> мета-полів, не лише `ogImage`/`keywords`; TASK-434 поглинув TASK-492, крім вставки
> зображень (немає ендпоінта до TASK-424) → TASK-498.
>
> **Хвости** — рядки TASK-497…515 у `BACKLOG.md`, підрозділ «Хвости хвилі 176». Найважчий —
> TASK-514 (каталог рендериться на клієнті); найдорожчий для SEO — TASK-501 (`noindexSite`
> не noindex-ить). Повторний GEO-аудит: [`docs/geo-audit-2026-09-13.md`](../geo-audit-2026-09-13.md),
> по коду, не по живому стенду.

## Навіщо

Власник запитав, чи нормально, що description і og-теги на товарі показують магазин у цілому —
не нормально: `resolveSeo` ставить глобальний дефолт **вище** за контент сторінки, а сід
заповнює саме глобальний. Плюс редактор не вміє посилань (на `/legal/offer` лежить текст
`/legal/privacy-policy`), `/info` не редагується ніде, у прев'ю SERP — `mobilestore.ua`, назва
магазину живе в кількох місцях, у блозі немає «читайте також».

## Задачі

### TASK-432 — Порядок тирів SEO і og-блоки (S)

`apps/store-client/src/shared/lib/seo/resolveSeo.ts:135-158` — для `description` (і `title`)
поміняти місцями тир 2 (SeoSettings default) і тир 3 (контент сутності): контент перемагає,
глобальний — лише коли контенту немає. Додати `openGraph` у `app/categories/[slug]/page.tsx:65`
(немає блоку), `app/page.tsx:32` (немає), `app/products/page.tsx`; `og:image` для блогу з
`coverImageUrl` (`blog/[slug]/page.tsx:22`). Merchant feed: `g:product_type` зі шляху категорії
(`buildMerchantFeedXml.ts:103`). Оновити `resolveSeo.test.ts` (порядок уже покритий — тест
перевернути свідомо). Сід: `defaultMetaDescription` лишити, але описи товарів/категорій у сіді
мають власний `metaDescription` хоча б для 10 позицій демо.

### TASK-433 — Хост у прев'ю SERP і назва магазину в одному місці (S)

- `apps/store-admin/src/shared/config/dictionary.ts:2403` `urlHost: "mobilestore.ua"` (4 споживачі:
  seo-settings-form:181, product-form:627, category-form:317, page-form:256) →
  `new URL(process.env.NEXT_PUBLIC_SITE_URL).host` з дефолтом; `dictionary.ts:1465` OG-плейсхолдер так само.
- Назва магазину: інвентаризувати `SITE_NAME` (вітрина), `SeoSettings.siteName/titleTemplate`,
  `SiteContactSettings`, тексти листів, `manifest.webmanifest`, Organization JSON-LD — одне джерело
  `SeoSettings.siteName`, решта читає його (вітрина через `fetchSeoSettings`, листи через
  сервіс). Документувати в `admin-guide.md` «де міняти назву».

### TASK-434 — Редактор: посилання, зображення, таблиці (S–M)

`rich-text-editor.tsx:146-151` — лише `StarterKit`; санітайзер уже дозволяє `a[href|target|rel]`
(http/https/mailto, примусовий `rel`), `img`, `table` (`sanitize-rich-text.ts:37-67`). Додати
`@tiptap/extension-link` (`openOnClick:false`, `protocols` як у санітайзера), кнопки «посилання /
зняти», `@tiptap/extension-image` з завантаженням через `POST /api/admin/uploads/content`
(TASK-424) або URL, `@tiptap/extension-table` базово. Вставка `http…` тексту → автолінк.
Після цього — виправити контент `/legal/offer` (TASK-283, наповнення).

### TASK-435 — `/info` як CMS; `/legal` і `/info` розділені; SEO хабів із БД (M)

Стан: `Page` без `kind` — кожна сторінка живе лише під `/legal/<slug>`; `/info` збирається з FAQ +
контактів + захардкодженого `dict.info.*` (`app/info/page.tsx`). Хаби (`/categories`, `/blog`,
`/legal`, `/contact`, `/info`, `/promo`) мають `metadata` зі словника — адмін не керує.
Зробити: `Page.kind` enum `LEGAL | INFO | HUB` (міграція, дефолт `LEGAL`); `/info/<slug>` для
`INFO`; секція «Про нас» на `/info` читає сторінку `about`; у адмінці `/pages` — вкладки за
`kind` і бейдж; `HUB`-рядки з фіксованими слагами (`categories`, `blog`, …) дають
`metaTitle/metaDescription` хабам через `generateMetadata`. Sitemap і content-map оновити.

### TASK-436 — Блог: featured видимий, «читайте також», статус «не в списках» (S–M)

- `blog-post-form.tsx:253` чекбокс «Головна стаття тижня» → `Switch` з підказкою «показується
  великим блоком угорі /blog».
- Блок «Читайте також» після статті: 3 пости тієї ж категорії за `publishedAt`, фолбек —
  останні; серверний компонент із тегом кешу `blog`.
- Замість «приховано, але доступно роботам» (клоакінг — не робимо): статус/прапорець
  `listed=false` — опубліковано, доступно за URL і в sitemap, але не в списках і не в «читайте
  також».
- Нумерована пагінація блогу — з TASK-417 (спільний компонент).

### TASK-437 — SEO «по науці»: поля, які бракує, і повторний GEO-аудит (M)

- `keywords` немає ніде (`SeoSettings` 11 полів, `Product/Category/Page` без нього). Додати як
  «теги» (внутрішнє поле для пошуку/AI-підсумків, **не** `<meta keywords>` як фактор ранжування —
  Google ігнорує з 2009; так і пояснити в підказці форми).
- `ogImage` на `Product/Category/Page/BlogPost` (сьогодні лише глобальний і перше фото товару).
- Повторити GEO-аудит скілом `geo-audit` після TASK-432 і закрити/архівувати
  `docs/geo-audit-report.md` від 2026-07-06.
- `docs/handoff-seo.md` — оновити або архівувати.

### TASK-438 — Інструкція з налаштування пошуку; синоніми з адмінки (S + M пізніше)

`docs/search-guide.md` (UA, для оператора): що в індексі (лише товари → після TASK-417 і блог),
що таке одруки (`oneTypo: 4`, `twoTypos: 8`), синоніми UA↔EN (`search-synonyms.ts`), порядок
полів = вага, коли натискати «Переіндексувати» (`/settings/search`), «чому товар не
знаходиться» — чекліст. Пізніше (окремим рядком): синоніми як таблиця в БД + екран у
`/settings/search` за зразком `SeoSettings`.

## Порядок

432 → 433 (годинні) → 434 → 435 → 436 → 437 → 438. 434 залежить від TASK-424 лише для
зображень (посилання — ні).

## Перевірка

`resolveSeo.test.ts`; curl-и з плану 179 §TASK-457 (грепи `<meta name="description">`, `og:`,
`ld+json`) на стенді. Закриваючи задачу — `[🔁]` на її чеках у `docs/qa-recheck.md` (Додаток А).
