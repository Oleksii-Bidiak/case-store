# HANDOFF-SEO — класичне SEO + GEO follow-up (стан develop @ 847a1fb, 2026-07-07)

> **Для кого:** Claude Code у локальному репозиторії `store-ai`.
> **Джерела:** `docs/geo-audit-report.md` (GEO-аудит 2026-07-06) + незалежний класичний
> SEO-аудит коду поверх нього. **Виконується ПІСЛЯ конвертації основного handoff-а**
> (Етап 6) — це окремий етап/під-хвиля.
> **Нумерація:** ID тут — плейсхолдери `SEO-1…SEO-9`. При конвертації в BACKLOG видати
> реальні TASK-NNN з єдиного лічильника (наступний вільний після Етапу 6 — звірити з
> BACKLOG.md). Плейсхолдери в тексті замінити.

## Верифікація репорту (виконана, у код не переносити)

Пункти репорту, що ВЖЕ в develop: `app/llms.txt/route.ts`; `AggregateRating` у
`buildProductSchema.ts` (від ratingAverage/ratingCount); `sameAs` (SiteContact + SeoSettings
brand-профілі); **FAQPage-схема вже підключена на PDP і /info** (у репорті — «planned»,
факт — done); Product JSON-LD: availability/itemCondition/priceCurrency; canonical на
PDP/blog/legal; `defaultOgImage`/`titleTemplate`/`noindexSite` у SeoSettings і resolveSeo.
НЕ дублювати ці роботи.

---

## Блок I — Класичне SEO-ядро (код)

### SEO-1 — Посадкові сторінки категорій `/categories/[slug]` — **H (найбільша прогалина)**

Зараз: sitemap має лише хаб `/categories`, категорії ведуть у `/products?category=…` —
жодної індексованої категорійної сторінки, тоді як для e-commerce це головні органічні
входи. Бекенд ГОТОВИЙ: TASK-247 вже виніс SEO-мету категорій у публічний tree-read.

- SSR-роут `app/categories/[slug]/page.tsx`: H1 = назва категорії, опис (якщо є),
  сітка товарів категорії (перевикористати каталожні widgets), підкатегорії-чіпи;
- `generateMetadata` через `resolveSeo` (meta вже в API після 247), canonical на себе;
- JSON-LD: `BreadcrumbList` (Головна → [батько →] категорія) + `ItemList` товарів;
- sitemap: додати всі активні категорії (lastModified з updatedAt);
- внутрішня перелінковка: навігація/каталог/PDP-хлібні крихти ведуть на нові URL
  (стара форма `/products?category=` лишається робочою — canonical з неї на нову);
- Acceptance: категорійна сторінка рендериться SSR, є в sitemap, canonical коректний,
  фільтри в межах категорії працюють як query поверх неї.

### SEO-2 — Canonical-політика лістингів + noindex службових сторінок — **H**

`/products` зараз БЕЗ canonical/alternates → фільтри/сортування/пагінація плодять
дублікати. Ввести єдину політику (описати в коментарі-конвенції):

- `/products` і `/categories/[slug]`: self-canonical **без** filter/sort-параметрів;
  `?page=N` — canonical на себе з page (сторінки пагінації індексовані), контент
  комбінацій фільтрів — `noindex, follow` через robots-мету при наявності filter-параметрів;
- `/search` (роут існує!) — `noindex, follow` + додати `/search` у disallow robots.ts;
- перевірити `/orders/[id]`-lookup і `/checkout/confirmation` — мають бути noindex;
- unit-тести на metadata-хелпер (з фільтром → noindex; чиста сторінка → canonical).

### SEO-3 — Бренд у домашньому title + брендовий og:image + favicon-пакет — **M**

- `dict.meta.rootTitle` («Магазин аксесуарів для телефонів») → «MobileStore — магазин
  аксесуарів для телефонів» (код-fallback; адмінський defaultMetaTitle і так має пріоритет);
- створити брендовий OG-образ 1200×630 (простий: логотип + слоган на брендовому фоні,
  статичний файл `app/opengraph-image.png` або public/) і зашити як code-fallback,
  коли `SeoSettings.defaultOgImage` порожній; PDP і далі використовує фото товару;
- перевірити favicon/`icon`/`apple-icon` (у `app/` їх не видно) — додати повний пакет
  з манІфестом; `theme-color` — узгодити з F-04/05 з TASK-259 (не дублювати).

### SEO-4 — Верифікація пошукових консолей — **M, легкий**

У SeoSettings немає поля верифікації, у layout — жодного `verification`. Додати
`googleSiteVerification` (+ опційно `bingSiteVerification`) у SeoSettings (schema →
admin-форма `/settings/seo` з plain-UA підказкою «код з Google Search Console») →
`metadata.verification` у root layout. Розділ у admin-guide: як підтвердити сайт і
надіслати sitemap у Search Console (перший крок власника після запуску).

---

## Блок II — E-commerce видимість

### SEO-5 — Фід Google Merchant Center — **M**

Роут `app/merchant-feed.xml/route.ts` (або /api): RSS 2.0 + g:-namespace по активних
товарах: id, title, description, link, image_link, price (UAH), availability
(in_stock/out_of_stock зі stock), condition=new, brand, identifier_exists=false якщо
немає GTIN. Кеш/ISR ~1 год. Це безкоштовні товарні лістинги Google — найшвидший
трафік-канал для нового магазину. Runbook-крок у admin-guide (реєстрація в Merchant
Center, подача фіду).

### SEO-6 — robots: явна AI-crawler секція + IndexNow — **L**

Low-пункт репорту: явні stanza для GPTBot/Google-Extended/PerplexityBot/ClaudeBot
(allow — політика «AI-friendly», узгоджена з наявністю llms.txt). Опційно: IndexNow-пінг
з on-demand revalidate хука (миттєва індексація Bing/Seznam; Google ігнорує — не шкодить).

---

## Блок III — Контент і власник (код не потрібен / мінімальний)

### SEO-7 — Наповнення, що розблоковує вже готовий код — **H, власник + допомога Claude**

- FAQ-записи «доставка / гарантія / оплата / сумісність» (FAQPage-схема вже рендериться —
  порожня без контенту): Claude Code може згенерувати чернетки відповідей на базі
  наявних legal/info-текстів, власник вичитує і публікує через адмінку;
- заповнити SeoSettings: defaultMetaTitle/Description, titleTemplate `%s | MobileStore`,
  завантажити og-image (після SEO-3 з'явиться і code-fallback);
- alt-тексти банерів (поле в схемі є) — пройтись по активних банерах.

### SEO-8 — Post-launch чек-лист Brand Authority — **дока, не код**

Розділ у admin-guide (це «N/A-половина» GEO-скору, яка підніме ~58→вище після запуску):
Google Business Profile, підтвердити sameAs-профілі, 3–5 якісних зовнішніх згадок
(каталоги, огляди), повторний прогін `/geo audit <public-url>` через 4–6 тижнів
після запуску, моніторинг Search Console (покриття, позиції).

### SEO-9 — Гігієна доставки листів і редиректів — **вливається в Блок H основного handoff-а**

НЕ окрема задача — доповнення до TASK-270/272 (переконатися, що план їх включає):

- Caddy: 301 www→apex, http→https, без trailing-slash дублів;
- runbook DNS для власника: SPF/DKIM/DMARC записи для SMTP-домену — без них
  транзакційні листи (замовлення, password reset з TASK-169) летять у спам;
- uptime-моніторинг (безкоштовний UptimeRobot/Hetzner) — пункт runbook.

### SEO-10 — Захист URL адмінно-керованих сторінок — **M** _(рішення власника 2026-07-07)_

Сторінки/блог формуються з адмінки — архітектурно це SEO-safe (SSR, власні meta-поля,
publish-lifecycle, динамічний sitemap). Закрити людський фактор:

- **Slug-guard:** при зміні slug ОПУБЛІКОВАНОЇ сторінки (Page/BlogPost, за наявності —
  Product/Category) — попередження в формі («стара адреса перестане працювати і випаде
  з Google») + автоматичний запис у нову таблицю `SlugRedirect (entity, oldSlug, newSlug)`;
  фронт: 301 зі старого slug на новий (permanentRedirect у dynamic route перед 404);
  видалення опублікованої сторінки — попередження «сторінка в індексі N днів»;
- **Живі посилання замість жорстких:** футер-лінки на legal/info тягнути зі списку
  опублікованих Pages (sortOrder у моделі вже є) — узгодити з TASK-184 в одному плані,
  щоб не зробити двічі; `llms.txt` — секцію сторінок генерувати з того ж списку
  (route вже динамічний, перевірити, що slug'и не захардкоджені);
- **SEO-здоров'я (TASK-269) доповнити:** лічильник опублікованих сторінок без
  metaDescription і з контентом < ~300 символів («тонкі сторінки»);
- TDD на redirect-ланцюг: old→new→(перейменували ще раз)→newest — без циклів,
  ланцюжок схлопується до одного 301.

---

## Перетини з основним handoff-ом (Етап 6) — НЕ дублювати

- TASK-268 (SERP-прев'ю) і TASK-269 (SEO-здоров'я) лишаються в Етапі 6; SEO-4 додає
  в /settings/seo лише поле верифікації — узгодити в одному плані, якщо збіжаться в часі;
- theme-color/дарк-тема — TASK-259 (F-04/05), SEO-3 лише посилається;
- Umami-воронка (TASK-261) незалежна; після SEO-1 додати категорійні перегляди
  в події не треба — page-view покриває.

## Рекомендований порядок

SEO-1 → SEO-2 (одна доріжка — обидві правлять metadata лістингів) ∥ SEO-3 → SEO-4;
далі SEO-10 (в одному плані з TASK-184, якщо той ще не виконаний), SEO-5, SEO-6;
SEO-7/8 — паралельно силами власника; SEO-9 — злити в плани 270/272 до їх виконання.
