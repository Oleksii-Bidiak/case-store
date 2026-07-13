# Plan 145 — Brand Title, OG-Image Fallback & Favicon Package

> **Status:** ✅ Done (TASK-279 shipped)
> **Phase:** Roadmap Етап 7 — SEO/GEO (`docs/handoff-seo.md`) — доріжка B, task 1 of 3
> (SEO-3 → SEO-4/TASK-280 → SEO-10/TASK-285)
> **Created:** 2026-07-11
> **Last Updated:** 2026-07-11
> **BACKLOG task:** TASK-279
> **Source:** `docs/handoff-seo.md` §SEO-3 (Блок I — Класичне SEO-ядро)

## Overview

Три пов'язані, але незалежні прогалини бренд-присутності storefront'у, знайдені класичним
SEO-аудитом поверх GEO-звіту:

1. `dict.meta.rootTitle` («Магазин аксесуарів для телефонів») не містить назви бренду —
   код-fallback title, який рендериться щоразу, коли `SeoSettings.defaultMetaTitle` порожній
   (типова ситуація на dev/staging і навіть у перші дні прод-запуску до заповнення адмінки).
2. Якщо `SeoSettings.defaultOgImage` не заповнено, `openGraph.images` у кореневому layout
   лишається порожнім масивом/undefined — картки посилань у месенджерах/соцмережах для
   будь-якої сторінки без власного зображення (головна, каталог, кошик, checkout, категорії,
   акції…) рендеряться взагалі без прев'ю-картинки.
3. У `apps/store-client/src/app/` немає жодного `icon`/`apple-icon`/manifest файлу за
   file-based metadata конвенцією Next.js App Router — є лише дефолтний `favicon.ico`
   (Next-заглушка, не брендований). Вкладки браузера, iOS «Додати на головний екран» і
   заголовок PWA-маніфесту показують дженерик-іконку замість бренду.

Це перша з трьох задач доріжки B Етапу 7 (SEO-3 → SEO-4 → SEO-10, всі позначені `∥ 277/278` —
паралельно з категорійними сторінками/canonical-політикою доріжки A). Обсяг — суто client-side
code-fallback: усе, що вже налаштовано власником через `/settings/seo` (TASK-239/268/269),
й надалі має пріоритет через існуючий `resolveSeo()` (tier 1/2). Ця задача лише покращує
tier-3 «нульова конфігурація» — дефолт, який бачить власник/крауler до першого заповнення
адмінки, і який лишається чесним fallback'ом навіть якщо поле колись знову спорожніють.

## Scope

### In Scope

- Брендування `dict.meta.rootTitle` (єдина рядкова правка в `dictionary.ts`, tier-3 fallback,
  не чіпає `SeoSettings.defaultMetaTitle`, який і так вигравав/вигравятиме через `resolveSeo`).
- Один статичний брендований OG-fallback PNG 1200×630, підключений **явним кодом** у
  `app/layout.tsx generateMetadata()` — рендериться лише коли `resolved.ogImage`
  (=`SeoSettings.defaultOgImage`) порожній; коли він заповнений — використовується
  адмінське значення без змін, як і сьогодні.
- Повний favicon-пакет за file-based metadata конвенцією Next App Router: `app/icon.svg`
  (векторний, hand-authored, він же джерело для решти растрових розмірів),
  `app/icon.png` (512×512), `app/apple-icon.png` (180×180, непрозорий фон),
  `app/favicon.ico` (замінює Next-заглушку, multi-size 16/32/48), `app/manifest.ts`
  (Web App Manifest, іконки 192/512 у `public/icons/`).
- Один Node-скрипт (`scripts/generate-brand-assets.mjs`), яким ці растрові файли були
  згенеровані — комітиться разом з вихідними файлами, щоб власник/дизайнер міг
  перегенерувати пакет пізніше з оновленими SVG-джерелами без участі розробника.
- Юніт-тест на нову fallback-логіку `generateMetadata()` кореневого layout (OG-fallback і
  брендований title), за зразком `app/legal/[slug]/page.test.ts`.

### Out of Scope

- Будь-які зміни в `shared/lib/seo/resolveSeo.ts` — паралельна доріжка A активно читає цей
  файл (canonical-політика, TASK-278); чіпати його заборонено умовою задачі. Уся
  fallback-логіка живе лише в `app/layout.tsx`.
- `theme-color` — вже є в `viewport.themeColor` (light/dark, `PRIMARY_COLOR`/`PRIMARY_COLOR_DARK`
  з TASK-259 F-04/05, ✅). Ця задача лише звіряє, що він не дублюється — код не змінюється.
- PDP (`products/[slug]/page.tsx`), `legal/[slug]/page.tsx`, `blog/[slug]/page.tsx` — вони
  вже самі задають власний `openGraph.images` (товар-фото / `resolved.ogImage`); ця задача їх
  не чіпає (PDP і надалі показує фото товару). Відомий побічний нюанс — де саме
  root-fallback реально «дотягується» — задокументовано нижче в Design Decision 1 та Risks.
- Верифікація пошукових консолей (`googleSiteVerification`) — TASK-280 (SEO-4), наступна
  задача цієї доріжки, окремий план.
- Slug-guard / `SlugRedirect` — TASK-285 (SEO-10), третя задача доріжки, зі спільною
  міграцією; не входить у цей план.
- Реальний брендовий дизайн (логотип від дизайнера) — генеруються прості типографічні
  плейсхолдери (бренд-колір + назва); власник зможе замінити файли пізніше без зміни коду
  (заміна тих самих шляхів файлів достатня).
- Будь-яка зміна Dockerfile — `apps/store-client/Dockerfile` вже копіює `public/` у
  standalone-образ (рядки 118–122, TASK-270) і має захисний `mkdir -p public` для
  порожнього каталогу (рядок 68–70, актуальний коментар «ships no static public assets
  today»). Після цього плану каталог більше не порожній — коментар варто оновити, але це
  не блокує задачу (окрема правка коментаря включена як дрібний пункт у TASK-279-A, не
  окрема задача).

## User Stories

1. Як власник магазину, я хочу, щоб назва бренду завжди була видна в заголовку вкладки й у
   пошуковій видачі — навіть якщо я ще не встиг заповнити SEO-налаштування в адмінці.
2. Як власник магазину, я хочу, щоб посилання на мій сайт у Telegram/Viber/Facebook завжди
   показували привабливу картинку-прев'ю з назвою бренду, а не порожній сірий блок, поки я
   не завантажив власне OG-зображення в адмінку.
3. Як власник магазину, я хочу, щоб вкладка браузера й іконка «Додати на головний екран»
   на iPhone показували логотип мого магазину, а не дефолтну іконку Next.js.

## Technical Design

### Data Model

Без змін до Prisma-схеми. `SeoSettings.defaultOgImage`/`defaultMetaTitle` вже існують
(TASK-239) і залишаються tier-1/2 пріоритетом через `resolveSeo()`, який ця задача не чіпає.

### Design Decision 1 — fallback явно в `app/layout.tsx generateMetadata()`, НЕ файлова конвенція `opengraph-image.png`

Next.js має вбудовану file-based конвенцію (`app/opengraph-image.png`), яка автоматично
підмішується в metadata будь-якого сегмента, що сам не задає `openGraph.images`. Свідомо
**не** використовуємо її з двох причин:

1. Умова задачі прямо вимагає тримати fallback-логіку в кореневому `generateMetadata()`,
   не чіпаючи `resolveSeo.ts` — файлова конвенція була б «магією» поза кодом, яку важче
   узгодити з трирівневим tier-пріоритетом, який і так обчислюється в layout.tsx.
2. Резервування імені `opengraph-image.png` для файлової конвенції небезпечне з
   неочевидним ефектом успадкування: сторінки, які взагалі не задають `openGraph`
   (головна, `/products`, `/search`, `/cart`, `/checkout`, `/categories`, `/promo`,
   `/account`, `/wishlist` — перевірено, жодна з них сьогодні не визначає власний
   `openGraph`), успадкували б файл автоматично; але сторінки, які **самі** визначають
   `openGraph` без `images` (PDP без фото товару, `legal/[slug]`/`blog/[slug]` коли
   `resolved.ogImage` порожній — усі сьогодні пишуть `images: cond ? [...] : undefined`),
   **не** отримали б fallback, бо власний `openGraph`-об'єкт сегмента повністю заміщає
   успадкований, а не зливається по масиву `images`. Явний код у layout.tsx робить цю межу
   видимою й задокументованою, а не прихованою побічним ефектом файлової конвенції.

Реалізація — існуючий умовний блок у `generateMetadata()` кореневого layout:

```ts
// apps/store-client/src/app/layout.tsx
openGraph: {
  type: "website",
  siteName: SITE_NAME,
  url: SITE_URL,
  locale: "uk_UA",
  images: resolved.ogImage
    ? [{ url: resolved.ogImage }]
    : [
        {
          url: BRAND_OG_IMAGE_PATH, // "/brand/og-fallback.png"
          width: BRAND_OG_IMAGE_WIDTH, // 1200
          height: BRAND_OG_IMAGE_HEIGHT, // 630
          alt: dict.meta.rootTitle,
        },
      ],
},
```

`metadataBase` вже виставлений (`new URL(SITE_URL)`), тож відносний шлях `/brand/…png`
резолвиться в абсолютний URL автоматично (Next-конвенція для `images.url`) — окремого
env/константи для абсолютного URL не потрібно.

**Відомий, свідомо незакритий нюанс** (задокументований, не виправляється цим планом):
сторінки, які самі задають `openGraph` з умовним `images: cond ? [...] : undefined`
(PDP без фото товару, `legal/[slug]` й `blog/[slug]` коли `resolved.ogImage` порожній) —
**не** успадковують цей root-fallback, бо їхній власний `openGraph`-об'єкт заміщає
батьківський цілком. Це вже наявна поведінка (сьогодні вони так само не мають картинки в
цих випадках); ця задача не погіршує й не виправляє її — виправлення (привести їх до того ж
fallback-патерну) є природним подальшим кроком, але не входить у SEO-3 (див. Notes).

### Design Decision 2 — джерело растрів: один hand-authored SVG як master для favicon-пакета, окремий SVG для OG-банера

- `app/icon.svg` — сам є service-файлом (Next віддає його напряму як `<link rel="icon"
type="image/svg+xml">`) **і** master-джерелом для растрових похідних (`icon.png`,
  `apple-icon.png`, `favicon.ico`) — один файл, без дублікату-копії, щоб уникнути розбіжності
  «оновили одне, забули інше». Проста квадратна композиція: заокруглений квадрат
  `--color-primary` (`#4f46e5`), білий жирний символ «M» (`font-weight:800`, системний
  sans-serif — Sora не вбудовується у SVG-фавікон заради розміру файлу; це прийнятний
  спрощений плейсхолдер, легко замінний пізніше).
- `scripts/brand-assets/og-banner.svg` — окреме hand-authored джерело 1200×630 лише для
  OG-картинки (не файл-конвенція, тому поза `app/`): суцільний фон `--color-primary`,
  зліва/по центру текст «MobileStore» (великий, жирний) + один рядок теглайну
  («Аксесуари та техніка Apple» або близький до `dict.meta.rootDescription` варіант,
  скорочений під ширину банера). Текст вписаний у SVG статично під час генерації — картинка
  **не** підтягує `dict.ts` динамічно (растрове зображення не може); якщо бренд-копірайтинг
  зміниться, файл треба перегенерувати вручну (див. Risks).

### Design Decision 3 — генератор-скрипт: `sharp` (вже в монорепо через store-api) + `png-to-ico`, комітяться результати, не CI

`apps/store-api` вже має `sharp` як залежність (image-pipeline, TASK-091/048) — цей план додає
`sharp` і легкий чисто-JS `png-to-ico` (без нативних біндингів) як **devDependencies саме
`store-client`** (аналогічно тому, як `playwright` вже є devDependency `store-client` для
`scripts/screenshots.mjs`, хоч і використовується лише вручну). Скрипт:

1. Рендерить `app/icon.svg` → `app/icon.png` (512×512), `app/apple-icon.png` (180×180,
   `flatten` на непрозорий брендовий фон — Apple ігнорує прозорість і заливає чорним, тож
   апаратно недопустимо лишати альфа-канал), `public/icons/icon-192.png`,
   `public/icons/icon-512.png`.
2. Рендерить проміжні PNG 16/32/48 з того ж SVG → `png-to-ico` → `app/favicon.ico`
   (замінює наявну Next-заглушку).
3. Рендерить `scripts/brand-assets/og-banner.svg` → `public/brand/og-fallback.png`
   (1200×630).

На відміну від `scripts/screenshots.mjs` (вихід у `.screenshots/`, gitignored, чисто
dev-tooling), вихідні файли цього скрипта — **реальні відвантажувані статичні активи**,
комітяться як звичайний код/асет, аналогічно вручну намальованому лого. Скрипт — не частина
`npm run build`/CI; agent, що виконує задачу, запускає його один раз локально й комітить
результат (`npm run generate:brand-assets -w apps/store-client`), так само як власник/дизайнер
зможе перегенерувати пакет пізніше після заміни вихідних SVG.

### Frontend (Next.js — FSD, `apps/store-client`)

#### shared/config

- `shared/config/site.ts` — **append**: `BRAND_OG_IMAGE_PATH = "/brand/og-fallback.png"`,
  `BRAND_OG_IMAGE_WIDTH = 1200`, `BRAND_OG_IMAGE_HEIGHT = 630`. Той самий файл, де вже живуть
  `SITE_URL`/`SITE_NAME`/`CURRENCY` — природне місце для ще однієї «сирої» SEO-константи.
- `shared/config/dictionary.ts` — **одна рядкова правка** (не структурна): значення
  `meta.rootTitle` → `"MobileStore — магазин аксесуарів для телефонів"`. Жодних нових ключів
  не додається (alt-текст OG-картинки перевикористовує той самий `dict.meta.rootTitle`) —
  мінімальний diff для мінімізації конфлікту з доріжкою A, яка паралельно редагує цей файл.

#### app (Next.js file-based metadata conventions)

- `app/icon.svg` — новий, master SVG (Design Decision 2).
- `app/icon.png` — новий, згенерований (512×512).
- `app/apple-icon.png` — новий, згенерований (180×180, непрозорий).
- `app/favicon.ico` — замінений, згенерований (16/32/48 multi-size).
- `app/manifest.ts` — новий, Web App Manifest file-convention:

  ```ts
  import type { MetadataRoute } from "next";
  import { SITE_NAME, dict } from "@/shared/config";

  export default function manifest(): MetadataRoute.Manifest {
    return {
      name: SITE_NAME,
      short_name: SITE_NAME,
      description: dict.meta.rootTitle,
      start_url: "/",
      display: "standalone",
      background_color: "#ffffff",
      theme_color: PRIMARY_COLOR, // з shared/config/theme.ts, той самий токен, що й viewport
      icons: [
        { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
        { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      ],
    };
  }
  ```

- `app/layout.tsx` — **модифікація**: `openGraph.images` fallback (Design Decision 1);
  жодних інших змін (viewport.themeColor лишається як є).
- `app/layout.test.ts` — новий, за зразком `app/legal/[slug]/page.test.ts` (мокає
  `@/widgets/header`, `@/widgets` (Footer), `./providers`, `@/shared/api/banners-server`,
  `@/shared/api/seo-settings-server`, щоб ізолювати саме `generateMetadata` від React-дерева).

#### public/ (новий каталог — сьогодні відсутній у store-client)

- `public/brand/og-fallback.png` — новий, згенерований (1200×630).
- `public/icons/icon-192.png`, `public/icons/icon-512.png` — нові, згенеровані.

#### scripts

- `scripts/brand-assets/og-banner.svg` — новий, hand-authored master.
- `scripts/generate-brand-assets.mjs` — новий, генератор (Design Decision 3).
- `package.json` (store-client) — `devDependencies`: `+sharp`, `+png-to-ico`; `scripts`:
  `"generate:brand-assets": "node scripts/generate-brand-assets.mjs"`.

### API Contract

Без змін. `SeoSettings.defaultOgImage`/`defaultMetaTitle` вже існують і документовані
(TASK-239); ця задача не додає й не змінює жодного ендпоінта.

## Tasks

### TASK-279-A: Favicon package + OG-fallback asset generation

**Type:** feat
**Scope:** store-client
**Complexity:** M (2-4h)
**TDD Required:** No — статичні активи й генератор-скрипт, не бізнес-логіка.
**Depends on:** —

**Acceptance Criteria:**

- [ ] `app/icon.svg` — валідний SVG, заокруглений квадрат `--color-primary` (`#4f46e5`) фон,
      білий символ/монограма по центру; рендериться коректно як favicon у Chrome/Firefox
      (перевірено вручну через `npm run dev`).
- [ ] `scripts/brand-assets/og-banner.svg` — валідний SVG 1200×630, брендовий фон + текст
      «MobileStore» + короткий теглайн.
- [ ] `scripts/generate-brand-assets.mjs` рендерить із цих двох SVG усі похідні растри
      (`app/icon.png` 512×512, `app/apple-icon.png` 180×180 непрозорий,
      `app/favicon.ico` multi-size 16/32/48, `public/icons/icon-192.png`,
      `public/icons/icon-512.png`, `public/brand/og-fallback.png` 1200×630) без ручного
      редагування растрів після генерації.
- [ ] `package.json` (store-client): `sharp` і `png-to-ico` у `devDependencies`;
      `"generate:brand-assets"` скрипт у `scripts`.
- [ ] `app/manifest.ts` — валідний Next `MetadataRoute.Manifest`, `icons` вказує на
      `/icons/icon-192.png` і `/icons/icon-512.png`, `theme_color` = `PRIMARY_COLOR` з
      `shared/config/theme.ts` (той самий токен, що вже використовує `viewport.themeColor` —
      не новий/розбіжний колір).
- [ ] Усі згенеровані файли (`app/icon.png`, `app/apple-icon.png`, `app/favicon.ico`,
      `public/icons/*.png`, `public/brand/og-fallback.png`) закомічені як звичайні бінарні
      активи (НЕ gitignored — на відміну від `.screenshots/`).
- [ ] Ручна перевірка (dev-server): вкладка браузера показує нову іконку; `/manifest.webmanifest`
      (або `/manifest.json` — залежно від фактичного шляху, який згенерує Next з `manifest.ts`)
      віддає коректний JSON; `curl -I http://localhost:3000/brand/og-fallback.png` і
      `/icon.png`/`/apple-icon.png`/`/favicon.ico` повертають `200` з правильним `Content-Type`.
- [ ] Коментар у `apps/store-client/Dockerfile` (рядок ~68–70, «this app ships no static
      public assets today») оновлено — тепер `public/` більше не порожній; сам `mkdir -p`
      fallback і `COPY … public` (рядки 118–122) лишаються без змін (вже коректні).
- [ ] `npm run lint -w apps/store-client` / `npm run typecheck -w apps/store-client` /
      `npm run build -w apps/store-client` — чисті.

**Files to create/modify:**

- `apps/store-client/src/app/icon.svg` — новий
- `apps/store-client/src/app/icon.png` — новий (згенерований)
- `apps/store-client/src/app/apple-icon.png` — новий (згенерований)
- `apps/store-client/src/app/favicon.ico` — замінений (згенерований)
- `apps/store-client/src/app/manifest.ts` — новий
- `apps/store-client/public/brand/og-fallback.png` — новий (згенерований)
- `apps/store-client/public/icons/icon-192.png` — новий (згенерований)
- `apps/store-client/public/icons/icon-512.png` — новий (згенерований)
- `apps/store-client/scripts/brand-assets/og-banner.svg` — новий
- `apps/store-client/scripts/generate-brand-assets.mjs` — новий
- `apps/store-client/package.json` — devDependencies + скрипт
- `apps/store-client/Dockerfile` — коментар (рядки ~68–70)

---

### TASK-279-B: Brand title fallback + root OG-image fallback wiring

**Type:** feat
**Scope:** store-client
**Complexity:** S (1-2h)
**TDD Required:** No — читання/умовна композиція вже наявного `resolveSeo()`-результату, не
критичний модуль (cart/discount/inventory/auth); покривається юніт-тестом нижче.
**Depends on:** TASK-279-A (посилається на `/brand/og-fallback.png`, який мусить існувати —
build/dev-сервер не впаде без файлу, але сторінка без картинки суперечила б меті задачі).

**Acceptance Criteria:**

- [ ] `shared/config/site.ts` експортує `BRAND_OG_IMAGE_PATH`/`BRAND_OG_IMAGE_WIDTH`/
      `BRAND_OG_IMAGE_HEIGHT` (Design Decision 1 значення).
- [ ] `dictionary.ts`: `meta.rootTitle` = `"MobileStore — магазин аксесуарів для телефонів"`
      (лише значення рядка змінено, жодних нових/переставлених ключів у `meta`-блоці).
- [ ] `app/layout.tsx generateMetadata()`: `openGraph.images` — коли `resolved.ogImage`
      (`SeoSettings.defaultOgImage`) заповнений, поведінка НЕ змінюється (той самий масив
      `[{ url: resolved.ogImage }]`, як сьогодні); коли він порожній — рендериться
      `[{ url: BRAND_OG_IMAGE_PATH, width: 1200, height: 630, alt: dict.meta.rootTitle }]`
      (ніколи не порожній масив/undefined).
- [ ] `app/layout.test.ts` (новий, node/`*.test.ts` проєкт, мокає widgets/providers/server
      fetchers за зразком `legal/[slug]/page.test.ts`):
  - [ ] коли `fetchSeoSettings()` повертає `null` або `defaultOgImage: null` —
        `meta.openGraph.images` дорівнює брендованому fallback-масиву з правильними
        `url`/`width`/`height`/`alt`;
  - [ ] коли `fetchSeoSettings()` повертає `defaultOgImage: "https://cdn.example/x.png"` —
        `meta.openGraph.images` дорівнює `[{ url: "https://cdn.example/x.png" }]` (адмінське
        значення використане вербатим, fallback не підмішується);
  - [ ] коли `fetchSeoSettings()` повертає `null` (SeoSettings недоступний) — `title.default`
        (або результат, еквівалентний `resolved.title || dict.meta.rootTitle`) містить
        `"MobileStore —"` на початку.
- [ ] Ручна перевірка: подільник посилання (напр. вставити URL локального dev-сервера в
      Telegram/будь-який OG-debugger) показує брендовану картинку, коли `SeoSettings` порожній.
- [ ] `npm run lint -w apps/store-client` / `npm run typecheck -w apps/store-client` — чисті.
- [ ] Tests pass: `npm run test -w apps/store-client` (новий `layout.test.ts` зелений,
      увесь інший unit/component набір без регресій).

**Files to create/modify:**

- `apps/store-client/src/shared/config/site.ts` — append constants
- `apps/store-client/src/shared/config/dictionary.ts` — `meta.rootTitle` value
- `apps/store-client/src/app/layout.tsx` — `openGraph.images` fallback
- `apps/store-client/src/app/layout.test.ts` — новий

---

## Dependencies & Sequencing

- **Internal:** TASK-279-A → TASK-279-B (B посилається на файли, які A генерує; без
  functional-залежності в коді — B компілюється навіть без файлів на диску, оскільки шлях
  просто рядок, але задача логічно неповна без реального файлу за цим шляхом).
- **External / доріжка B Етапу 7:** Ця задача (SEO-3) — перша з трьох послідовних задач
  доріжки B (`SEO-3 → SEO-4 → SEO-10`, паралельно доріжці A `277/278`). Наступна —
  **TASK-280** (SEO-4, верифікація пошукових консолей: `googleSiteVerification`) — не входить
  у цей план, окремий `/planer` запуск. Третя — **TASK-285** (SEO-10, slug-guard +
  `SlugRedirect`) зі спільною міграцією з іншою частиною Етапу 7 — так само окремий план.
  Жодна з двох не потребує коду з цього плану; послідовність — лише організаційна (той самий
  worktree/доріжка), не залежність компіляції.
- **Файловий перетин з доріжкою A:** `dictionary.ts` — правка одним рядком у `meta.rootTitle`
  (жодних нових/переставлених ключів), мінімізує ризик конфлікту зі змінами доріжки A
  (TASK-277/278 імовірно правлять інші секції того ж файлу). `resolveSeo.ts` — навмисно НЕ
  чіпається (Design Decision 1), тож немає перетину з TASK-278 (canonical-політика), яка може
  розширювати цей файл.
- Не залежить від TASK-269 (SEO-здоров'я) чи TASK-268 (SERP-прев'ю) — обидва вже ✅, різні
  файли (admin-панель, не storefront).

## Risks & Mitigations

| Risk                                                                                                                                                                                                                           | Mitigation                                                                                                                                                                                                                                                  |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PDP/`legal`/`blog` сторінки з умовним `openGraph.images: cond ? [...] : undefined` не успадковують root-fallback (Design Decision 1) — картки посилань на товар без фото чи на порожню `legal`-сторінку лишаються без картинки | Задокументовано явно як відомий, свідомо незакритий нюанс (не регресія — та сама поведінка була й до цього плану); природний наступний крок — привести ці три файли до того ж fallback-патерну, окремою невеликою задачею, не входить у SEO-3               |
| `scripts/brand-assets/og-banner.svg` — текст «зашитий» статично в SVG, не читає `dictionary.ts`                                                                                                                                | Задокументовано в Design Decision 2; якщо бренд-копірайтинг (назва/теглайн) зміниться, потрібно вручну відредагувати SVG і перезапустити `npm run generate:brand-assets` — не автоматично                                                                   |
| `sharp`/`png-to-ico` — нові devDependencies збільшують `node_modules`, потенційний install-час у CI                                                                                                                            | `sharp` вже встановлюється в монорепо через `store-api` (той самий native-біндинг кешується npm); `png-to-ico` — чистий JS без нативних залежностей, мінімальний. Обидва лише в `store-client devDependencies`, не в рантайм-залежностях жодного контейнера |
| Заміна `favicon.ico`/`icon.svg` може не інвалідувати кеш браузера одразу (фавікони особливо агресивно кешуються)                                                                                                               | Відоме обмеження браузерів, не код-баг; можна зазначити власнику в майбутньому admin-guide runbook, не блокує acceptance цього плану                                                                                                                        |
| Плейсхолдер-дизайн (типографічний «M»/«MobileStore» на суцільному кольорі) виглядає непрофесійно порівняно з реальним лого                                                                                                     | Явно узгоджено умовою задачі — «власник зможе замінити файл пізніше»; шляхи файлів фіксовані й стабільні, заміна не потребує зміни коду                                                                                                                     |

## Notes

- **Sequencing нотатка (для оркестратора):** це перша з трьох задач доріжки B Етапу 7. Друга —
  TASK-280 (SEO-4, верифікація пошукових консолей, `/settings/seo`) — окремий `/planer`.
  Третя — TASK-285 (SEO-10, slug-guard/`SlugRedirect`, спільна міграція) — так само окремий
  план. Жодна з них не описана в цьому плані навмисно (за умовою задачі).
- Скрипт-генератор — dev-tooling за зразком `scripts/screenshots.mjs`, але на відміну від
  нього результат **комітиться** (реальні відвантажувані активи, не тимчасовий вивід);
  скрипт не входить у `npm run build`/CI pipeline.
- Якщо майбутня задача принесе справжній логотип від дизайнера, заміна відбувається лише
  файлами за тими самими шляхами (`app/icon.svg`, `scripts/brand-assets/og-banner.svg` →
  перегенерувати похідні) — код (`layout.tsx`, `manifest.ts`, `site.ts`) лишається незмінним.
- `docs/design-system.md` наразі не має розділу «Brand assets» — свідомо не додається цим
  планом (мінімізація обсягу M-задачі); варто розглянути окремим дрібним чорновим пунктом,
  коли власник затвердить фінальний логотип.
