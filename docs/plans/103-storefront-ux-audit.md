# 103 — Аудит UI/UX стору (TASK-225, статичний код-аудит)

> Статичний аудит `apps/store-client` без запущеного стенда. Живі перевірки, які
> неможливо підтвердити з коду, позначені «🔎 live» і зведені в розділ 5.
> Живить TASK-193 (етап полірування).

---

## 1. Методика і охоплення

**Що переглянуто (код, не рантайм):**

- Токени й стратегія тем: `apps/store-client/src/app/globals.css`,
  `docs/design-system.md`, `src/shared/config/theme.ts`, `src/app/layout.tsx`.
  Окремого `tailwind.config.ts` немає — Tailwind v4, вся конфігурація в CSS
  (`@theme inline` у `globals.css`).
- Примітиви `shared/ui`: button, input, textarea, select, tabs, sheet, dialog,
  combobox, badge, skeleton, rating-stars, color-dots, product-card,
  account-dropdown (частково), pagination-суміжні.
- Віджети: header (+search, +badges, announcement-bar), footer, hero-banner
  (slider), product-grid (PopularRail), recently-viewed, product-list
  (+pagination, +list-item, +view), product-detail (view, gallery,
  sibling-navigator, mobile-atc-bar), cart (sheet, item-row, summary),
  checkout (step-indicator, payment-stub, address-form), categories, promo
  (view, countdown, coupons), newsletter, order-history, wishlist (filters),
  account (settings), частково blog/contact/info.
- Фічі: add-to-cart, toggle-wishlist, apply-discount, product-filters
  (filters, view-toggle, sort-select), search (autocomplete), submit-review.
- Наскрізні greps: сирі кольори (`bg-white|text-gray-*|hex`), `cursor-pointer`,
  `aria-label`/`sr-only`, `aria-live`, `dark:`, `motion-reduce`, `href="#"`,
  `sr-only`-чекбокси, arbitrary-значення `text-[Npx]`.

**Факти про стратегію темної теми (для контексту всього розділу 3/4):**

- Дарк-тема реалізована **тільки через `@media (prefers-color-scheme: dark)`**
  (`globals.css:78`) — токени перевизначаються медіа-запитом. Класової стратегії
  (`.dark`) і **перемикача теми немає** (підтверджено стабом
  `account-settings-section.tsx:7-10` — «appearance follows the OS»).
- Утиліти `dark:` зустрічаються лише в 5 shadcn-примітивах (button, badge,
  input, select, textarea); у Tailwind v4 дефолтний `dark:`-варіант теж
  media-based, тож вони працюють узгоджено з токенами. Конфлікту стратегій немає.

---

## 2. Зведена таблиця знахідок

Осі: hover | a11y | adaptive | dark | misc. Severity: H / M / L.

| #    | Файл:рядок                                                                                                                                                                                     | Вісь     | Проблема                                                                                                                                                                                                                                                                                                                                                                              | Sev | Пропонований фікс                                                                                                                                                                                                   |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F-01 | `checkout-payment-stub.tsx:47,84`; `cart-item-row.tsx:333`; `account-settings-section.tsx:61`; `wishlist-filters.tsx:118`                                                                      | a11y     | Кастомні чекбокси/радіо/тумблер: `<input className="sr-only">` + візуальний `<span aria-hidden>`, у кодовій базі **жодного** `peer-focus-visible`/`has-[:focus-visible]` → фокус з клавіатури повністю невидимий на всіх цих контролах                                                                                                                                                | H   | Додати `peer` на input і `peer-focus-visible:ring-2 peer-focus-visible:ring-ring` на візуальний span (одна утиліта, 5 місць)                                                                                        |
| F-02 | `hero-slider.tsx:75-79`                                                                                                                                                                        | a11y     | Автоплей каруселі (7 с) без кнопки паузи і без зупинки на hover/focus; `motion-reduce`/`prefers-reduced-motion` — **0 збігів по всьому src** (порушує WCAG 2.2.2 і design-system §7)                                                                                                                                                                                                  | H   | Пауза на hover/focus-within + `useReducedMotion`-гейт автоплею; глобально — `motion-reduce:` на анімаціях                                                                                                           |
| F-03 | `shared/ui/button.tsx:8` (+31 файл із ручним `cursor-pointer`)                                                                                                                                 | hover    | Tailwind v4 preflight дає кнопкам `cursor: default`; базовий `Button` НЕ додає `cursor-pointer`, а 31 файл додає його вручну → частина інтерактиву зі стрілкою (Button/CTA, `product-sibling-navigator.tsx:121`, `view-toggle.tsx:20`, чекбокси категорій `product-filters.tsx:158`, степер `cart-item-row.tsx:277,298`, мініатюри `product-image-gallery.tsx:80`), частина — з рукою | H   | Одне рішення: або `cursor-pointer` у base `buttonVariants` + глобальне правило `button:not(:disabled){cursor:pointer}` у `globals.css`, або прибрати точкові `cursor-pointer` (консистентність важливіша за напрям) |
| F-04 | `globals.css` (весь файл)                                                                                                                                                                      | dark     | Не задано `color-scheme: light dark` → у дарк-темі нативні елементи (скролбари поза кастомним стилем, `<select>`-попапи, autofill, date/number-спінери) лишаються світлими                                                                                                                                                                                                            | M   | У `:root` додати `color-scheme: light;` і в dark-медіа `color-scheme: dark;`                                                                                                                                        |
| F-05 | `shared/config/theme.ts:10` + `app/layout.tsx:42`                                                                                                                                              | dark     | `PRIMARY_COLOR = "#2563eb"` для `<meta name="theme-color">` — це НЕ брендовий токен (`#4f46e5`), і він статичний (не реагує на тему)                                                                                                                                                                                                                                                  | M   | Виправити на `#4f46e5` і віддати масив `themeColor: [{media:'(prefers-color-scheme: dark)',...}]`                                                                                                                   |
| F-06 | `footer.tsx:70`; `announcement-bar.tsx:12`                                                                                                                                                     | dark     | `bg-foreground text-background` — у дарк-темі футер і верхня стрічка **інвертуються у світлі панелі** на темному сайті (деталі в розділі 3)                                                                                                                                                                                                                                           | M   | Рішення власника: або лишити інверсію свідомо, або ввести токени `--color-footer`/`-foreground`, стабільно темні в обох темах                                                                                       |
| F-07 | `footer.tsx:79`                                                                                                                                                                                | dark     | Трастові іконки `text-primary` на `bg-foreground`: у світлій темі #4f46e5 на #0f172a ≈ **2.8:1** (< 3:1 для UI-графіки)                                                                                                                                                                                                                                                               | M   | 🔎 live; підняти до `text-primary`-світлішого відтінку на цьому фоні (напр. `#818cf8`) або `text-background`                                                                                                        |
| F-08 | `product-grid.tsx:76-98`                                                                                                                                                                       | a11y     | `role="tablist"`/`role="tab"` + `aria-selected` без `aria-controls`, без `role="tabpanel"` і без стрілочної навігації (roving tabindex) — заявлений патерн Tabs не виконано                                                                                                                                                                                                           | M   | Або зняти ролі (лишити `aria-pressed`-кнопки), або довести до WAI-ARIA Tabs (панель + стрілки)                                                                                                                      |
| F-09 | `hero-slider.tsx:150-164`                                                                                                                                                                      | adaptive | Точки-індикатори каруселі: `h-1.5` (6 px), ширина 6–24 px — тач-таргет у ~7 разів менший за 44 px                                                                                                                                                                                                                                                                                     | M   | Збільшити hit-area: `p-2` навколо візуальної точки або `min-h-11 min-w-11` невидимий бокс                                                                                                                           |
| F-10 | `hero-slider.tsx:86,92`                                                                                                                                                                        | adaptive | Фіксована висота `h-[420px]` + контент із `px-16` (64 px з боків) уже на мобільному; на 320–375 px лишається ~190 px під заголовок `text-3xl` — ризик кліпання довгих UA-заголовків                                                                                                                                                                                                   | M   | 🔎 live 320/375 px; `px-6 sm:px-16` + `min-h` замість жорсткої `h`                                                                                                                                                  |
| F-11 | `pagination.tsx:47,56,61,102,106`                                                                                                                                                              | a11y     | Хардкод англійських a11y-рядків: `aria-label="Pagination"`, `"Previous"`, `"Next"`, sr-only `Previous/Next` — озвучиться англійською на укр. сторінці (порушення правила «no hardcoded English»)                                                                                                                                                                                      | M   | Винести в `dict.pagination.*`                                                                                                                                                                                       |
| F-12 | `product-image-gallery.tsx:78,96-97`                                                                                                                                                           | a11y     | Хардкод: `aria-label={"Show image N"}` і alt `"...thumbnail N"` англійською                                                                                                                                                                                                                                                                                                           | M   | `dict.product.showImageAria(n)` тощо                                                                                                                                                                                |
| F-13 | `sheet.tsx:91`; `dialog.tsx:87`                                                                                                                                                                | a11y     | `<span className="sr-only">Close</span>` англійською в обох overlay-примітивах (усі шіти/діалоги стору)                                                                                                                                                                                                                                                                               | M   | Прокинути label з `dict.common.close`                                                                                                                                                                               |
| F-14 | `checkout-step-indicator.tsx:19`                                                                                                                                                               | a11y     | `aria-label="Checkout progress"` англійською                                                                                                                                                                                                                                                                                                                                          | M   | `dict.checkout.progressAria`                                                                                                                                                                                        |
| F-15 | `checkout-address-form.tsx:78-83` (патерн у всіх формах: apply-discount, submit-review, profile)                                                                                               | a11y     | Помилки полів — `<p role="alert">` без `aria-describedby` на інпуті; чекліст design-system §8 явно вимагає зв'язку                                                                                                                                                                                                                                                                    | M   | `id={id + "-error"}` + `aria-describedby` на `Input`                                                                                                                                                                |
| F-16 | `header.tsx:227-233`                                                                                                                                                                           | adaptive | Лінк «Акції» — `hidden ... sm:flex`, а в мобільному Sheet-меню (рядки 103-202) пункту «Акції» немає; футер теж не веде на /promo → на < 640 px сторінка акцій **недосяжна з навігації**                                                                                                                                                                                               | M   | Додати «Акції» в мобільний Sheet (і/або футер)                                                                                                                                                                      |
| F-17 | `footer.tsx:145-154`                                                                                                                                                                           | misc     | Колонка «Інформація»: усі 4 лінки (Доставка/Гарантія/Про нас/FAQ) ведуть на `/products` як плейсхолдер — оманлива навігація в проді                                                                                                                                                                                                                                                   | M   | Повести на реальні `/legal/*`, `/info`, `/contact` (TASK-153/166 вже дали сторінки) або прибрати до готовності                                                                                                      |
| F-18 | `dictionary.ts:314-319,352-356` (рендер: `newsletter.tsx:31-37`, blog-newsletter)                                                                                                              | misc     | Соцлінки `href="#"` — «живі» на вигляд кнопки скролять сторінку вгору; немає `target/rel`                                                                                                                                                                                                                                                                                             | M   | Ховати елементи без URL (як робить `footer.tsx:109-111`) до появи реальних каналів                                                                                                                                  |
| F-19 | `product-list.tsx:106`                                                                                                                                                                         | adaptive | Каталог: `repeat(auto-fill,minmax(232px,1fr))` → на 320-375 px рівно **1 колонка**, а design-system §4 фіксує «2-up on mobile» як еталон ніші                                                                                                                                                                                                                                         | M   | `grid-cols-2 gap-3 sm:[grid-template-columns:...]` або зменшити minmax до ~150 px на mobile                                                                                                                         |
| F-20 | `cart-item-row.tsx:264` (size-8=32px); `wishlist-toggle-button.tsx:118` (size-9=36px, overlay); `header.tsx:76-82` + `view-toggle.tsx:20` (size-9); `submit-review-form.tsx:122` (зірки ~28px) | adaptive | Систематично малі тач-таргети 28–36 px на частих діях (видалити з кошика, серце, зірки рейтингу)                                                                                                                                                                                                                                                                                      | M   | Мінімум 44 px hit-area на touch: `size-11` або невидимий padding                                                                                                                                                    |
| F-21 | 61 файл, 242 входження `text-[N px]` (+ `p-[22px]`, `rounded-[18px]`, `w-[342px]`…)                                                                                                            | misc     | Масове порушення design-system §4/§10 «no arbitrary values»: імпортовані з мокапів довільні px-значення замість шкали токенів                                                                                                                                                                                                                                                         | M   | Систем. фікс на етапі TASK-193: звести до шкали (text-sm/[15px]→text-sm тощо); заборонити правилом ESLint/tailwind plugin                                                                                           |
| F-22 | `product-detail-view.tsx:172`                                                                                                                                                                  | misc     | Sticky buy-box: `lg:top-20` (80 px) хардкодом замість `STICKY_ASIDE_TOP` (`lg:top-24`, 96 px) — пряме порушення design-system §4 «Never hardcode the offset»                                                                                                                                                                                                                          | L   | Імпортувати `STICKY_ASIDE_TOP` з `shared/config/layout`                                                                                                                                                             |
| F-23 | `rating-stars.tsx:46`; `submit-review-form.tsx:127`; `product-reviews-widget.tsx:30`                                                                                                           | dark     | `text-amber-400` — сира палітра замість токена; у дарк-темі відтінок не керується темою (візуально прийнятно, але поза токен-системою)                                                                                                                                                                                                                                                | L   | Ввести токен `--color-rating` або вживати `warning`                                                                                                                                                                 |
| F-24 | `account-settings-section.tsx:70`                                                                                                                                                              | dark     | Повзунок тумблера `bg-white` — сирий колір (на `bg-muted`-треку в дарк-темі працює, але це виняток із правила токенів); сам тумблер без `role="switch"`                                                                                                                                                                                                                               | L   | `bg-card` / `bg-background` + `role="switch"` на input                                                                                                                                                              |
| F-25 | `header-search.tsx:143-145,187-190`                                                                                                                                                            | a11y     | `aria-haspopup="menu"` + `role="menu"/"menuitem"` на панелі каталогу без стрілочної навігації, обов'язкової для ролі menu (Tab працює, але роль обіцяє інше)                                                                                                                                                                                                                          | L   | Зняти ролі (звичайний список лінків) або додати keydown-обробку                                                                                                                                                     |
| F-26 | `categories-view.tsx:78`                                                                                                                                                                       | a11y     | Кнопки-перемикачі груп мають `aria-current="true"` — семантика «поточна сторінка» на кнопці стану; доречніше `aria-pressed`                                                                                                                                                                                                                                                           | L   | Замінити на `aria-pressed={active}`                                                                                                                                                                                 |
| F-27 | `hero-slider.tsx:84-129`                                                                                                                                                                       | a11y     | Зміна слайда не озвучується: немає `aria-roledescription="carousel"`, `aria-live` на контейнері слайдів                                                                                                                                                                                                                                                                               | L   | `section aria-roledescription` + `aria-live="polite"` (off під час автоплею)                                                                                                                                        |
| F-28 | `header-cart-badge.tsx:44-47,55`                                                                                                                                                               | a11y     | Лічильник кошика/суми не в live-region (`aria-label` на `<span>` без ролі ігнорується SR); зміна кількості після «додати в кошик» не озвучується                                                                                                                                                                                                                                      | L   | `aria-live="polite"` sr-only рядок із підсумком (як у `cart-view.tsx:153`)                                                                                                                                          |
| F-29 | `product-list-view.tsx:94`                                                                                                                                                                     | misc     | `router.replace` при зміні фільтра без `{scroll:false}` — App Router скролить до верху при кожному кліку по чекбоксу категорії в сайдбарі                                                                                                                                                                                                                                             | L   | 🔎 live; додати `{ scroll: false }`                                                                                                                                                                                 |
| F-30 | `product-list-view.tsx:153-157`                                                                                                                                                                | adaptive | `ViewToggle` прихований на мобільному (`hidden lg:flex`) — list-view недоступний на touch; якщо це свідомо, ок                                                                                                                                                                                                                                                                        | L   | Підтвердити рішення або показати toggle від `sm`                                                                                                                                                                    |
| F-31 | `product-detail-view.tsx:93,99,106`                                                                                                                                                            | hover    | Лінки хлібних крихт мають `hover:text-primary`, але без `focus-visible:`-стилів дизайн-системи (лишається браузерний outline — працює, але випадає з єдиного стилю рінгів)                                                                                                                                                                                                            | L   | Додати стандартний `focus-visible:ring-2 focus-visible:ring-ring rounded-sm`                                                                                                                                        |
| F-32 | `pagination.tsx:31-34`                                                                                                                                                                         | hover    | `arrowBase`/`numberBase` без `focus-visible`-рінга (єдина навігація без нього) і без `transition`-узгодження з рештою                                                                                                                                                                                                                                                                 | L   | Додати стандартний ринг + `cursor` за F-03                                                                                                                                                                          |

**Разом: 32 знахідки — H: 3, M: 18, L: 11.**

---

## 3. Футер і темна тема (вердикт власнику)

**Факт: у `footer.tsx` хардкодних світлих класів немає.** Жодного `bg-white`,
`text-gray-*` чи сирого hex — усі кольори семантичні: контейнер
`bg-foreground text-background` (`footer.tsx:70`), другорядний текст
`text-background/70` (:101,:169,:174), розділювачі `border-background/10`
(:72,:183), платіжні пілюлі `border-background/20 text-background/80` (:195),
фокус-рінги `focus-visible:ring-background` (:119,:164,:174,:217). Іконки-соцмережі
мають `aria-label` (:118), лінки — hover+focus-стани. З точки зору токенів футер
чистий.

**Але:** патерн «інверсії» (`bg-foreground` = темний фон у світлій темі) у
дарк-темі перевертається: `--color-foreground` стає `#ededed`, `--color-background`
— `#0a0a0a` (`globals.css:81-82`), тобто **у темній темі футер і announcement-bar
(`announcement-bar.tsx:12`) стають світло-сірими панелями на темному сайті**.
Контраст тексту при цьому зберігається (нічого не «ламається» по WCAG), але
задум «dark, multi-column footer» (комент у `footer.tsx:53`) інвертується у
свою протилежність. Це дизайн-рішення, яке треба або підтвердити свідомо, або
закрити окремими токенами `--color-footer`/`--color-footer-foreground`,
однаково темними в обох темах (F-06).

Супутні пункти по футеру: контраст трастових іконок `text-primary` на темному
фоні ≈ 2.8:1 у світлій темі (F-07, 🔎 live), плейсхолдерні лінки «Інформація» →
`/products` (F-17).

**Стан дарк-теми загалом:** вона «напів-підключена» — токени повністю визначені
для обох тем через `prefers-color-scheme`, перемикача немає (стаб у
налаштуваннях акаунта каже «слідуємо ОС» — це чесно задокументовано в UI),
`dark:`-варіанти в примітивах сумісні зі стратегією. Реальні дірки: відсутній
`color-scheme` (F-04), статичний і небрендовий `theme-color` (F-05), інверсія
футера/стрічки (F-06). Градієнтні хіро (promo `promo-view.tsx:34-39`, hero-slider,
contact/info) свідомо тема-незалежні (`text-white` на фіксованому градієнті) —
це коректно і в дарк-темі не ламається.

---

## 4. Системні патерни (один фікс — багато місць)

1. **`sr-only`-інпут без видимого фокуса** (F-01) — 5 місць:
   `checkout-payment-stub.tsx:47` (радіо оплати), `:84` (чекбокс бонусів),
   `cart-item-row.tsx:333` (чекбокси доп. послуг),
   `account-settings-section.tsx:61` (тумблери сповіщень),
   `wishlist-filters.tsx:118` (чекбокси фільтрів). Рецепт один: `peer` +
   `peer-focus-visible:ring-2 peer-focus-visible:ring-ring` на візуальному боксі.
2. **Хардкод англійських a11y-рядків** (F-11…F-14) — 5+ місць: pagination (5
   рядків), image-gallery (2), sheet/dialog «Close» (2), checkout-stepper (1).
   В UI їх не видно, тому вони пережили попередні рев'ю; скрінрідер озвучить
   англійською. Один прохід: винести в `dict`.
3. **Непослідовний курсор на кнопках** (F-03) — Tailwind v4 дає `cursor: default`;
   31 файл латає це точково, базовий `Button` і ще ~13 файлів з `<button>` — ні.
   Вирішити один раз глобально в `globals.css`/`buttonVariants`.
4. **Тач-таргети 28–36 px** (F-20) — систематично: іконкові кнопки `size-8`/`size-9`
   (кошик-смітник, серця, view-toggle, header-іконки), зірки відгуку, точки
   каруселі (F-09). Одна ревізія розмірів + невидимі hit-area.
5. **Arbitrary px-значення з мокапів** (F-21) — 242 входження `text-[Npx]` у 61
   файлі плюс `p-[22px]`, `rounded-[18px]`, `rounded-[13px]`, `w-[342px]`…
   Найгустіше: cart-, checkout-, promo-, categories-, account-віджети (імпорти
   `*.dc.html`). Це прямий борг перед design-system §4/§10.
6. **`role=alert` без `aria-describedby`** (F-15) — усі RHF-форми (checkout,
   review, discount, profile, contact): повідомлення показуються і озвучуються
   при появі, але не прив'язані до полів.
7. **Позитивний патерн (для балансу):** `aria-label` на іконкових кнопках —
   практично тотальний (132 входження в 69 файлах), skip-link є
   (`layout.tsx:72-77`), skeleton'и відповідають фінальним макетам, empty-стани
   з CTA (каталог, кошик, замовлення), `aria-live` на лічильниках результатів
   (`product-list.tsx:85`, `search-results-view.tsx:97`, `cart-view.tsx:153`).
   Радикальних порушень (клік-діви без ролей, картинки без alt) не знайдено.

---

## 5. Що потребує живої перевірки (manual QA на стенді)

1. **Дарк-тема візуально** (OS-перемикання): інвертований футер/стрічка (F-06),
   нативні контроли без `color-scheme` (F-04) — number-інпут степера кошика,
   селект сортування, autofill у формах.
2. **Контраст**: трастові іконки футера (F-07); `text-primary` на
   `bg-primary/10-30` бейджах статусів замовлення в дарк-темі
   (`order-history-view.tsx:15-23`).
3. **320–375 px**: хіро-слайдер (кліпання заголовків, F-10); довгі UA-назви
   товарів у `cart-item-row` і хлібних крихтах PDP (`truncate(name, 30)`);
   чи не перекриває `MobileAtcBar` контент на PDP при відкритій клавіатурі
   (падінг `pb-24` є — перевірити з тостами Sonner знизу).
4. **Скрол**: стрибок до верху при зміні фільтра в сайдбарі каталогу (F-29);
   збереження позиції при «назад» з PDP у каталог (App Router має відновлювати —
   підтвердити при `router.replace`-фільтрах).
5. **Клавіатура наскрізно**: повний цикл checkout тільки з клавіатури
   (фокус-пастки Radix Sheet/Dialog мають працювати з коробки — підтвердити
   порядок фокуса в мобільному меню і міні-кошику після видалення останнього
   товару).
6. **Скрінрідер (NVDA, укр.)**: озвучення англійських рядків з F-11…F-14 до/після
   фікса; оголошення додавання в кошик (F-28).

---

## 6. Пріоритезація — топ-10 для TASK-193

1. **F-01** — видимий фокус на кастомних чекбоксах/радіо/тумблерах (H, 5 місць,
   один рецепт; блокер доступності checkout).
2. **F-02** — пауза/reduced-motion для hero-каруселі (H, WCAG 2.2.2 на головній).
3. **F-03** — єдина політика курсора кнопок (H-систем., одна глобальна зміна).
4. **F-06 + F-04 + F-05** — пакет «дарк-тема»: рішення по інверсії футера,
   `color-scheme`, коректний `theme-color` (це і є відповідь на запит власника).
5. **F-16** — «Акції» в мобільній навігації (втрачений трафік на промо).
6. **F-17 + F-18** — прибрати оманливі плейсхолдер-лінки (футер «Інформація»,
   соцмережі `#`).
7. **F-11…F-14** — локалізація a11y-рядків одним прохідом (4 файли).
8. **F-19** — 2 колонки каталогу на мобільному (еталон ніші з design-system §9).
9. **F-20 + F-09** — ревізія тач-таргетів до 44 px.
10. **F-15** — `aria-describedby` для помилок форм (checkout першим).

Решта (F-21 arbitrary-значення, F-22…F-32) — фонові чистки під час планових
дотиків до відповідних файлів; F-21 вартий окремого лінт-правила, щоб борг не ріс.
