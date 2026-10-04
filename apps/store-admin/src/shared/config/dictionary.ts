import { countLabel } from "../lib/plural";

/**
 * The three Ukrainian forms of «особа», for the one string that needs them
 * (TASK-480).
 *
 * THE FILE'S GENERAL RULE IS THE OPPOSITE — see `users.notesCharsLeft`: a
 * count-free colon form («Вибрано: 3») is grammatical for every value and costs
 * no table, and hand-rolled plural tables are what `shared/lib/format/
 * formatDate.ts` refuses to have. This is the exception, and it is a product
 * decision rather than a style one: «Повний доступ мають N осіб» is the sentence
 * plan 181 decision 5 asks for by name — the count of people with full access is
 * not capped, it is put in front of the owner in words they will read. Rendering
 * it as «мають 2 осіб» on the screen whose whole job is to be noticed is not a
 * trade worth making, and the colon form («Людей із повним доступом: 2») loses
 * the phrasing the decision was written in.
 *
 * Ukrainian rule: 1 → особа, 2–4 → особи, everything else → осіб, with 11–14
 * taking the last form despite ending in 1–4.
 */
function personForm(count: number): string {
  const abs = Math.abs(count) % 100;
  if (abs >= 11 && abs <= 14) return "осіб";
  switch (abs % 10) {
    case 1:
      return "особа";
    case 2:
    case 3:
    case 4:
      return "особи";
    default:
      return "осіб";
  }
}

/**
 * Ukrainian UI dictionary for the admin panel (store-admin). Mirrors the
 * store-client dictionary pattern: a single typed `dict` const so every label is
 * defined in one place. Grow this per area as screens are localized.
 */
export const dict = {
  brand: "CaseStore",

  app: {
    metaTitle: "Адмін-панель — Магазин мобільних аксесуарів",
    metaDescription:
      "Адмін-панель для керування товарами, замовленнями та користувачами.",
  },

  nav: {
    dashboard: "Панель",
    products: "Товари",
    productGroups: "Групи товарів",
    catalogImport: "Імпорт каталогу",
    categories: "Категорії",
    brands: "Бренди",
    addonServices: "Додаткові послуги",
    devices: "Пристрої",
    discounts: "Промокоди",
    pages: "Сторінки",
    banners: "Банери",
    blog: "Блог",
    // TASK-441 — гейтиться правом `media:read`, як і решта пунктів після
    // TASK-334/406.
    media: "Медіатека",
    orders: "Замовлення",
    // TASK-370 — екран повернень існує з TASK-340, але потрапити на нього можна
    // було лише вручну набравши /returns. Гейтиться правом `returns:read`.
    returns: "Повернення",
    reviews: "Відгуки",
    messages: "Повідомлення",
    // «Клієнти», не «Користувачі» — рішення власника 2026-09-30 (TASK-1058).
    users: "Клієнти",
    // TASK-480 — службові акаунти живуть окремо від клієнтів. Гейтиться
    // `staff:read`, правом без гранту: його тримають лише власник і заступники.
    // «Співробітники», не «Персонал» — рішення власника 2026-09-30 (TASK-1059).
    staff: "Співробітники",
    subscribers: "Підписники",
    contentMap: "Де що на сайті",
    siteContact: "Контакти",
    seoSettings: "SEO",
    searchIndex: "Пошук",
    faq: "FAQ",
    // TASK-318 — gated by `audit:read`, a key nobody can be granted (TASK-475).
    auditLog: "Журнал дій",
  },

  header: {
    title: "Панель керування",
    adminLabel: "Адміністратор",
    openMenu: "Відкрити меню",
    // Account menu (TASK-317) — the header used to be an email and a logout
    // button, with no way to reach your own profile at all.
    accountMenu: "Меню акаунта",
    profile: "Мій профіль",
    roleOwner: "Власник",
    roleManager: "Менеджер",
    // Wave 198 (TASK-1034): a deputy admin's role line in the account menu and
    // badge — they used to get no label at all.
    roleAdmin: "Адміністратор",
    // «Довідка розділу» (TASK-1034/1035) — the header button and its sheet.
    sectionHelp: "Довідка розділу",
    sectionHelpTitle: (section: string) => `Довідка · ${section}`,
    sectionHelpWhat: "Що тут робиться",
    sectionHelpRights: "Ваші права тут",
    sectionHelpAllRights: "Ви маєте всі права в цьому розділі.",
    sectionHelpNoRightNeeded: "Окремого права тут не потрібно.",
    sectionHelpCan: (rights: string) => `Ви можете ${rights}.`,
    sectionHelpCannot: (rights: string, staffSection: string) =>
      `${rights.charAt(0).toUpperCase()}${rights.slice(1)} не можете — попросіть власника додати право в розділі «${staffSection}».`,
    // TASK-1014 — /auth/me/permissions failed: an empty panel with a reason.
    permissionsErrorTitle: "Не вдалося завантажити ваші права",
    permissionsErrorBody:
      "Без них панель не знає, які розділи й кнопки вам показати, тому меню тимчасово порожнє. Ваш доступ не змінився — перевірте з'єднання й спробуйте ще раз.",
    // TASK-528 + TASK-974 — the refresh cookie is gone while you were working.
    sessionExpiredTitle: "Сесія закінчилась",
    sessionExpiredBody:
      "З міркувань безпеки ми вийшли з вашого акаунта. Увійдіть знову — після входу ви повернетесь на цю саму сторінку. Незбережені зміни в формі можуть загубитися.",
    sessionExpiredAction: "Увійти знову",
    // The «Повернення» nav counter: requests still REQUESTED. Here and not in
    // `nav`, whose values are all labels (content-map test reads them as such).
    newReturnsBadgeAria: (n: number) =>
      `${countLabel(n, ["нова заявка", "нові заявки", "нових заявок"])} на повернення`,
  },

  login: {
    metaTitle: "Вхід — Адмін-панель",
    metaDescription: "Увійдіть до адмін-панелі магазину мобільних аксесуарів.",
    heading: "Адмін-панель",
    subtitle: "Увійдіть, щоб керувати магазином",
    email: "Електронна пошта",
    password: "Пароль",
    signIn: "Увійти",
    signingIn: "Вхід…",
    emailInvalid: "Введіть коректну електронну пошту",
    passwordRequired: "Вкажіть пароль",
    errorNotAdmin: "Цей акаунт не має прав адміністратора.",
    errorInvalid: "Невірний email або пароль.",
    errorGeneric: "Щось пішло не так. Спробуйте ще раз.",
    // Wave 198 (TASK-1036 + TASK-974) — arrived from «Сесія закінчилась».
    sessionExpired:
      "Сесія закінчилась. Увійдіть знову — і ви повернетесь на сторінку, де працювали.",
  },

  // Support escape hatch on the login form (TASK-287). The API answers every
  // failed login with the same generic message — it never says "your account is
  // deactivated" — so the form always offers a way to reach a human. Shown to
  // everyone; it discloses nothing about any account.
  authSupport: {
    loginTrouble: "Проблеми зі входом?",
    contactLink: "Напишіть у підтримку",
  },

  dashboard: {
    metaTitle: "Панель — Адмін",
    heading: "Огляд",
    updatedAt: (time: string) => `Оновлено ${time}`,
    // TASK-1037: «Спробуйте ще раз» is the «Повторити» button beside it now.
    loadError: "Не вдалося завантажити показники.",
    quickActions: "Швидкі дії",
    addProduct: "Додати товар",
    viewOrders: "Переглянути замовлення",
    manageUsers: "Керувати клієнтами",
    totalRevenue: "Загальна виручка",
    revenueLifetime: "За весь час (лише оплачені замовлення)",
    revenue30: "Виручка (30 днів)",
    last30: "Останні 30 днів",
    unrealizedRevenue: "Очікувана виручка",
    unrealizedLifetime: "Замовлено, ще не оплачено",
    unrealizedRevenue30: "Очікувана (30 днів)",
    totalOrders: "Усього замовлень",
    awaitingFulfilment: (n: number) => `${n} очікують обробки`,
    totalUsers: "Усього користувачів",
    registeredCustomers: "Зареєстровані клієнти",
    revenueTrend: "Динаміка виручки",
    ordersByStatus: "Замовлення за статусом",
    revenueTooltip: "Виручка",
    date: "Дата",
    lowStock: "Низький запас",
    product: "Товар",
    stock: "Вільний залишок",
    soldOut: "Розпродано",
    stockHint:
      "Скільки одиниць товару можна продати прямо зараз. Це число вже враховує " +
      "товари з непідтверджених/необроблених замовлень — вони віднімаються одразу " +
      "при оформленні замовлення, а не при відправці.",
    noLowStock: "Немає товарів із низьким запасом.",
    topProducts: "Топ товари за виручкою",
    // TASK-684: the same list for somebody without `analytics:revenue` — the API
    // withholds the sums and ranks by units, so the heading must not say
    // «за виручкою».
    topProductsByUnits: "Топ товари за кількістю продажів",
    unitsSold: "Продано, шт.",
    rank: "#",
    noTopProducts: "Немає даних про продажі.",
    // Needs-action widget + sidebar badges (TASK-248).
    needsActionHeading: "Потребує дії",
    needsActionAllClear: "Все під контролем — нічого не очікує на дію.",
    needsActionLoadError: "Не вдалося завантажити список дій.",
    needsActionNewOrders: "Нові замовлення",
    needsActionPendingReviews: "Відгуки на модерації",
    needsActionUnpaidInTransit: "Очікують оплати",
    needsActionFailedMails: "Помилки надсилання пошти",
    // TASK-251: 5th needs-action card — orders sitting too long in PENDING.
    needsActionPendingOver48h: "Довго в очікуванні (>48 год)",
    // TASK-446: 6th card. It counts SITUATIONS to look at, not reviews — a
    // product that collected a burst of ratings in an hour, an address behind a
    // run of 1★ — so the label is «сигнали», not a number of відгуків. An
    // operator reading it as "N reviews to moderate" would go looking for N rows
    // that do not exist, and would not go looking for the burst that does.
    needsActionRatingAbuse: "Сигнали накрутки оцінок",
    // TASK-470: 7th card. Рахує ЗАМОВЛЕННЯ, а не позиції — плитка відповідає на
    // питання «скільком покупцям, можливо, треба подзвонити», а замовлення з
    // трьома зниклими позиціями — це один дзвінок. Скасовані й повернуті сюди не
    // потрапляють: їхній залишок повернувся тому, що вони закінчились.
    //
    // Це єдиний у системі сигнал, на який більше ніщо не реагує: покупцю
    // автоматично нічого не надсилається (рішення власника B-1 п.3), тож плитка
    // і є всім сповіщенням.
    needsActionUnavailableItems: "Недоступні позиції",
    // TASK-352 (рішення B-11 №3): пізня оплата вже скасованого замовлення —
    // гроші отримано, замовлення скасоване; повернути гроші чи відновити
    // замовлення вирішує оператор, автоматично не робиться нічого.
    needsActionPaidAfterCancel: "Оплачено після скасування",
    // Sidebar count-badge aria labels (mirror messages.unreadBadgeAria).
    newOrdersBadgeAria: (n: number) => `${n} нових замовлень`,
    pendingReviewsBadgeAria: (n: number) => `${n} відгуків на модерації`,
    // Dashboard metrics v2 (TASK-249) — AOV, repeat-buyer rate, tooltips.
    averageOrderValue30: "Середній чек (30 днів)",
    averageOrderValue30Sub: "Виручка ÷ кількість оплачених замовлень",
    averageOrderValue30Tooltip:
      "Скільки в середньому витрачає покупець за одне оплачене замовлення за " +
      "останні 30 днів. Допомагає зрозуміти, чи варто піднімати поріг безкоштовної доставки.",
    repeatBuyerRate: "Повторні покупці (весь час)",
    repeatBuyerRateSub: "Частка клієнтів із 2+ замовленнями",
    repeatBuyerRateTooltip:
      "Частка клієнтів, які оформили 2 і більше замовлень (скасовані не рахуються) за " +
      "весь час роботи магазину. Показує, чи повертаються покупці.",
    repeatBuyerRate90: "Повторні покупці (90 днів)",
    repeatBuyerRate90Sub: "Серед замовлень за останні 90 днів",
    repeatBuyerRate90Tooltip:
      "Те саме, але лише серед замовлень за останні 90 днів — показує свіжу динаміку " +
      "повернення покупців, а не історію за весь час.",
    unrealizedRevenueTooltip:
      "Сума активних замовлень, які покупець ще не оплатив (наприклад, накладений " +
      "платіж Нової Пошти, який ще не інкасовано).",
    unrealizedRevenue30Tooltip:
      "Те саме, але лише замовлення за останні 30 днів.",
    // TASK-251: processing-speed stat card.
    averageProcessingTime: "Середній час обробки",
    averageProcessingTimeSub: "Від оформлення до відправлення (30 днів)",
    averageProcessingTimeTooltip:
      "Скільки в середньому минає від моменту оформлення замовлення до його першої " +
      "відправки, за останні 30 днів. Показує, чи пришвидшується обробка замовлень.",
    metricInfoAria: (label: string) => `Що означає «${label}»`,
    lastOrders: "Останні замовлення",
    noLastOrders: "Замовлень ще немає.",
    // TASK-262: traffic card (links out to Umami — no numbers rendered here).
    trafficHeading: "Відвідуваність",
    trafficSubtext: "Трафік, конверсії та воронка продажів — в Umami.",
    // Decorative "→" is rendered separately in an aria-hidden span (a11y).
    trafficOpenLink: "Відкрити Umami",
    trafficNotConfigured: "Ще не підключено. Зверніться до розробника.",
    trafficOpenLinkAria: "Відкрити Umami у новій вкладці",
    // TASK-380: the card now shows real numbers when the analytics proxy is
    // configured. «Недоступно» is a deliberate third state — zeroes here would
    // read as "the shop lost all its visitors".
    trafficRange: "за 7 днів",
    trafficVisitors: "Відвідувачі",
    trafficPageviews: "Перегляди сторінок",
    trafficBounceRate: "Пішли одразу",
    trafficAvgVisit: "Середній візит",
    trafficUnavailable:
      "Дані аналітики зараз недоступні. Перевірте, чи працює Umami.",
    trafficLoading: "Завантажуємо дані…",
    trafficDeltaUp: (percent: number) => `+${percent}% до попередніх 7 днів`,
    trafficDeltaDown: (percent: number) => `${percent}% до попередніх 7 днів`,
    trafficSeconds: (seconds: number) => `${seconds} с`,
    // TASK-430: the top-products rows are links to the read-only product card.
    // A metric an owner clicks is a question about the position, not an intent to
    // edit it — the card is where the answer is.
    topProductLinkAria: (name: string) => `Відкрити картку товару «${name}»`,
    // TASK-613 (граничний випадок E-22): нова заявка на повернення сигналить
    // із головної, а не лише з розділу «Повернення».
    needsActionNewReturns: "Нові заявки на повернення",
    // TASK-613: the tile's count comes from its own request, so it can be
    // unknown while the rest of the widget is not. A «0» there would read as
    // «no new returns» — the placeholder says the number is missing instead.
    needsActionCountPending: "Кількість завантажується",
    needsActionCountFailed: "Не вдалося отримати кількість",
    // Хвиля 198 (TASK-1037, П1–П4). The «→» of the card links is drawn in an
    // aria-hidden span, so the link is read as its words only.
    lastOrdersLoadError: "Не вдалося завантажити замовлення.",
    allOrdersLink: "Усі замовлення",
    allLowStockLink: "Усі з низьким залишком",
  },

  common: {
    save: "Зберегти",
    saving: "Збереження…",
    saveChanges: "Зберегти зміни",
    cancel: "Скасувати",
    edit: "Редагувати",
    delete: "Видалити",
    close: "Закрити",
    loading: "Завантаження…",
    actions: "Дії",
    view: "Переглянути",
    previous: "Попередня",
    next: "Наступна",
    pageOf: (page: number, total: number) => `Сторінка ${page} з ${total}`,
    active: "Активний",
    inactive: "Неактивний",
    activate: "Активувати",
    deactivate: "Деактивувати",
    signOut: "Вийти",
    // Table column sorting (TASK-147).
    sortByAria: (col: string) => `Сортувати за: ${col}`,

    // Shared table chrome: toolbar, refresh, row selection (TASK-353).
    // Lives in `common` because every admin table uses the same strings —
    // a per-widget copy would drift the moment one of them is reworded.
    table: {
      refresh: "Оновити",
      refreshing: "Оновлення…",
      refreshed: "Дані оновлено",
      refreshAria: "Оновити дані таблиці",
      searchPlaceholder: "Пошук…",
      selectAll: "Вибрати всі рядки на сторінці",
      selectedCount: (count: number) => `Вибрано: ${count}`,
      clearSelection: "Зняти вибір",

      // One search, one filter idiom, one page size (TASK-423). These strings
      // are the reason the shared controls can be dropped into a table without
      // it inventing its own copy — which is how the panel ended up with four
      // different search behaviours in the first place.
      searchLabel: "Пошук",
      clearFilterAria: (filter: string, value: string) =>
        `Прибрати фільтр «${filter}: ${value}»`,
      clearAllFilters: "Скинути фільтри",
      pageSizeLabel: "Рядків",
      // Shown instead of «нічого не знайдено» when filters (not a search term)
      // are what emptied the table: the operator needs the cause, not the fact.
      emptyFiltered: "За поточними фільтрами нічого не знайдено",
    },
    // Хвиля 191: дія без права не рендериться (не сіра кнопка). Цей рядок стоїть
    // там, де без неї лишилося б порожнє місце, — щоб відсутність контролу
    // читалась як «так задумано», а не як поломка.
    viewOnly: "Ви можете переглядати, але не змінювати.",
    // TASK-812: heading of the shared AlertDialog confirm (replaces window.confirm).
    confirmTitle: "Підтвердіть дію",

    // Хвиля 198 (TASK-1043): the ONE table registry every admin list is built
    // on — shared/ui/data-registry. Screen-specific words (what is counted, the
    // search fields, the default view's name) come from each screen's block; the
    // chrome around them lives here so it cannot drift between twenty lists.
    registry: {
      quickViewsLabel: "Швидкі види",
      filters: "Фільтри",
      // Read after the visible «Фільтри» and its badge: «Фільтри, застосовано: 2».
      filtersApplied: (count: number) => `, застосовано: ${count}`,
      columns: "Колонки",
      view: (name: string) => `Вид: ${name}`,
      clearAll: "Скинути все",
      removeChipAria: (label: string) => `Прибрати фільтр «${label}»`,

      summarySort: (label: string) => `Сортування: ${label}`,
      summaryUpdated: (time: string) => `оновлено ${time}`,

      // Filter side sheet. Edits stay a draft until «Показати…» — the caller
      // supplies that label because only it knows the count.
      sheetTitle: "Фільтри",
      sheetReset: "Скинути",
      rangeFrom: "від",
      rangeTo: "до",
      rangeFromAria: (legend: string) => `${legend}: від`,
      rangeToAria: (legend: string) => `${legend}: до`,
      dateFrom: "з",
      dateTo: "до",
      newTag: "нове",

      // «Колонки»
      columnsCaption: "Колонки — перетягніть, щоб змінити порядок",
      columnLocked: (label: string) => `${label} (завжди)`,
      moveColumnAria: (label: string) =>
        `Перемістити колонку «${label}»: стрілки вгору або вниз`,
      columnMoved: (label: string, position: number, total: number) =>
        `«${label}»: позиція ${position} з ${total}`,
      density: "Щільність",
      densityComfortable: "Звичайна",
      densityCompact: "Компактна",
      resetWidths: "Скинути ширину колонок",
      resetDefaults: "Скинути до стандартних",
      // Says «у цьому браузері», not «у вашому профілі»: until the per-user
      // settings API exists (TASK-1044) the settings ARE in this browser. Flip
      // this one string when the server store lands.
      columnsFootnote:
        "Ширину змінюйте, перетягуючи межу колонки в шапці. Налаштування зберігаються в цьому браузері.",
      resizeColumnAria: (label: string) => `Ширина колонки «${label}»`,
      widthPx: (px: number) => `${px} px`,

      // «Вид»
      myViews: "Мої види",
      saveView: "Зберегти поточний вид…",
      manageViews: "Керувати видами…",
      viewsFootnote:
        "Вид — це фільтри, колонки, їхня ширина й сортування разом. Зберігається в цьому браузері.",
      saveViewTitle: "Зберегти вид",
      viewNameLabel: "Назва виду",
      viewNameRequired: "Вкажіть назву виду",
      manageViewsTitle: "Керувати видами",
      renameViewAria: (name: string) => `Назва виду «${name}»`,
      deleteViewAria: (name: string) => `Видалити вид «${name}»`,
      noSavedViews: "Збережених видів ще немає.",

      // «Експорт» — offers only the formats a screen passes in.
      exportLabel: "Експорт",
      exportWhat: "Що вивантажити",
      exportFound: (countLabel: string) => `Знайдені — ${countLabel}`,
      exportSelectedOnly: "Лише вибрані",
      exportCsv: "CSV",
      exportXlsx: "Excel (XLSX)",
      exportFootnote: "Лише видимі колонки, у тому самому порядку.",

      // Bulk bar
      bulkSelected: (countLabel: string) => `Вибрано ${countLabel}`,
      bulkExportSelected: "Експорт вибраних",
      bulkKeptHint: "Вибір зберігається, коли гортаєте сторінки",
      bulkMoreAria: "Інші дії з вибраними",

      // Table
      selectRowAria: (label: string) => `Вибрати «${label}»`,
      rowActionsAria: (label: string) => `Дії: ${label}`,
      totalsOnPage: (countLabel: string) => `Разом на сторінці: ${countLabel}`,
      noResults: (query: string) => `Нічого не знайдено за запитом «${query}».`,
      // Rows with a detail panel (wave 198, AuditLogProposal Ж2).
      expandRowAria: (label: string) => `Деталі: ${label}`,
    },
  },

  // --- Products (TASK-115) ----------------------------------------------------
  products: {
    // Per-product add-on exceptions, embedded in the product form (TASK-174).
    addonDeltas: {
      heading: "Додаткові послуги цього товару",
      hint:
        "Товар автоматично успадковує послуги своєї категорії. Тут — лише винятки саме для нього: " +
        "власна ціна, прибрана послуга або ексклюзивна послуга тільки для цього товару.",
      badgeTemplate: "з шаблону",
      badgeOverridden: "перевизначено",
      badgeExclusive: "ексклюзив",
      actionOwnPrice: "Власна ціна",
      actionRemove: "Прибрати",
      actionRevert: "Скасувати виняток",
      actionAdd: "Додати ексклюзивну",
      addPickerPlaceholder: "Оберіть послугу…",
      addPickerAria: "Оберіть послугу, ексклюзивну для цього товару",
      ownPriceLabel: (name: string) => `Власна ціна для послуги «${name}»`,
      removedHeading: "Прибрані для цього товару",
      emptyResolved:
        "Для цього товару зараз не пропонується жодної послуги. Задайте шаблон на його категорії або додайте ексклюзивну нижче.",
      loadError: "Не вдалося завантажити послуги товару. Спробуйте ще раз.",
      toastSaved: "Виняток збережено",
      toastReverted: "Виняток скасовано — товар знову успадковує категорію",
      toastFailed: "Не вдалося зберегти виняток",
      toastBadPrice: "Вкажіть коректну ціну (число, не менше 0)",
      // TASK-442 — на сторінці створення успадкування ще нема від чого рахувати
      // (шаблон застосовується до рядка, якого ще не існує), тож лишається саме
      // те, що має сенс наперед: ексклюзивні послуги цього товару.
      stagedHint:
        "Тут можна одразу підібрати послуги, ексклюзивні для цього товару — вони збережуться " +
        "разом із ним. Успадковані з категорії з'являться на сторінці редагування.",
      stagedEmpty: "Ексклюзивних послуг поки не додано.",
    },
    metaTitle: "Товари — Адмін",
    metaTitleNew: "Створення товару — Адмін",
    metaTitleEdit: "Редагування товару — Адмін",
    metaTitlePreview: "Перегляд товару — Адмін",
    heading: "Товари",
    add: "Додати товар",
    // Wave 198: names the fields the admin search really reads (TASK-406 added SKU).
    searchPlaceholder: "Назва, опис або артикул (SKU)…",
    searchAria: "Пошук товарів",
    loadError: "Не вдалося завантажити товари. Спробуйте ще раз.",
    empty: "Товарів ще немає. Створіть свій перший товар.",
    colName: "Назва",
    colCategory: "Категорія",
    colPrice: "Ціна",
    colStatus: "Статус",
    colCreated: "Створено",
    // TASK-254: composite stock column — available (free-to-sell) / reserved
    // (tied up in unshipped orders) / physical (on the shelf = available + reserved).
    // The sortable header uses the generic dict.common.sortByAria(label) helper.
    colStock: "Залишок",
    // TASK-408: three numbers in one column need the arithmetic spelled out, or
    // «Фізично» reads as a fourth independent figure the operator has to reconcile.
    colStockHint:
      "Вільно — можна продати зараз. Резерв — уже в непідтверджених і необроблених замовленнях, чекає відправки. " +
      "На складі — фізично є: вільно + резерв. Раніше колонка називалась «Вільно / Резерв / Фізично».",
    // Bulk activate / deactivate over the on-screen selection (TASK-355).
    bulk: {
      deactivate: (count: number) => `Приховати (${count})`,
      // Blast radius spelled out: deactivating hides the products from the
      // storefront, and the count is the reason this prompt exists.
      deactivateConfirm: (count: number) =>
        `Приховати ${countLabel(count, ["товар", "товари", "товарів"])}? Вони зникнуть із вітрини.`,
      announceSaving: (count: number) => `Збереження ${count} тов.…`,
      announceDone: (count: number, isActive: boolean) =>
        isActive
          ? `Активовано товарів: ${count}`
          : `Деактивовано товарів: ${count}`,
      announceFailed: "Не вдалося змінити статус товарів",

      // «Перемістити до групи» (TASK-423) — the bulk action the product list was
      // missing. A variant group only means anything once EVERY position in it
      // points at the same group, so doing it one product at a time left the
      // family half-formed in between.
      groupDialogTitle: "Перемістити до групи",
      groupDialogDescription: (count: number) =>
        `Обрані товари (${count}) буде додано до однієї групи варіантів. ` +
        `Оберіть «Без групи», щоб вивести їх із поточної.`,
      groupDialogLabel: "Група варіантів",
      groupDialogPlaceholder: "Почніть вводити назву групи…",
      groupDialogEmpty: "Групи не знайдено",
      groupNone: "Без групи",
      groupSubmit: "Перемістити",
      announceGroupSaving: (count: number) => `Переміщення ${count} тов.…`,
      announceGroupDone: (count: number) => `Переміщено товарів: ${count}`,
      announceGroupFailed: "Не вдалося перемістити товари",

      // «Задати колір» (TASK-487) — колір є найсильнішим фасетом в аксесуарах,
      // але заповнювати його по одному товару не брався ніхто: він приходить як
      // вісь варіанта, а форма товару редагує одну позицію за раз. Пишеться
      // одразу у два місця — у вісь (звідки кружечки кольорів на картці) і в
      // характеристику «Колір» (звідки фільтр у каталозі).
      colorDialogTitle: "Колір обраних товарів",
      colorDialogDescription: (count: number) =>
        `Колір буде записано для ${count} тов. — і як вісь варіанта, і як ` +
        `характеристику «Колір», за якою каталог фільтрує. Порожнє поле прибирає колір.`,
      colorDialogLabel: "Колір",
      colorDialogPlaceholder: "Напр. Чорний",
      colorDialogHint:
        "Пишіть так, як покупець побачить це на вітрині: «Чорний», «Темно-синій», «Прозорий».",
      colorClear: "Прибрати колір",
      colorSubmit: "Записати",
      colorClearConfirm: (count: number) =>
        `Прибрати колір у ${count} тов.? Вони зникнуть із фільтра за кольором.`,
      announceColorSaving: (count: number) =>
        `Запис кольору для ${count} тов.…`,
      announceColorDone: (count: number) => `Змінено колір у товарах: ${count}`,
      announceColorCleared: (count: number) =>
        `Прибрано колір у товарах: ${count}`,
      announceColorFailed: "Не вдалося змінити колір товарів",

      // «Скасувати» for the last bulk action (TASK-837, AD-PROD-33). Named like
      // the reorder undo so the two read as the same kind of control.
      undo: "Скасувати останню масову дію",
      announceUndoing: (count: number) => `Повернення ${count} тов.…`,
      announceUndone: (count: number) =>
        `Масову дію скасовано, повернуто товарів: ${count}`,
      announceUndoFailed:
        "Не вдалося скасувати масову дію повністю. Спробуйте ще раз.",
      // Said once the write lands and an undo is on offer — it names the control
      // by its label, as the reorder commit announcement does.
      announceUndoAvailable: (count: number, undoLabel: string) =>
        `Готово, змінено товарів: ${count}. Щоб повернути, як було, скористайтеся кнопкою «${undoLabel}».`,
    },
    back: "← Товари",
    createHeading: "Створення товару",
    editHeading: "Редагування товару",
    createSubmit: "Створити товар",
    loadOneError: "Не вдалося завантажити товар. Спробуйте ще раз.",
    // TASK-362: photo column + status/stock filters for the restock worklist.
    colPhoto: "Фото",
    noPhoto: "без фото",
    filterStatus: "Статус",
    filterStatusAll: "Будь-який",
    filterStatusActive: "Показується",
    filterStatusHidden: "Приховано",
    filterStock: "Залишок",
    filterStockAll: "Будь-який",
    filterStockOut: "Немає",
    // TASK-361: creation now yields a hidden draft and lands on the edit page.
    // TASK-442: фото, характеристики, сумісність і послуги тепер заповнюються
    // ще до першого збереження, тож на редагуванні лишається сама публікація.
    toastDraftCreated:
      "Чернетку створено. Перевірте готовність і опублікуйте товар.",
    toastCreateFailed: "Не вдалося створити товар",

    // ── Створення товару «усім одразу» (TASK-442) ───────────────────────────
    //
    // Фото/характеристики/сумісність/послуги живуть на `:id`-ендпоінтах, тож
    // після POST /products їх доводиться відтворювати по черзі. Ці рядки — те,
    // що операторка бачить під час цього відтворення.
    createProgress: {
      heading: "Створюємо товар…",
      product: "Товар",
      images: (done: number, total: number) => `Фото (${done} з ${total})`,
      specs: "Характеристики",
      compat: "Сумісні пристрої",
      addons: "Додаткові послуги",
      statusWaiting: "Очікує",
      statusRunning: "Зберігаємо…",
      statusDone: "Готово",
      statusFailed: "Не вдалося",
    },

    // Частковий збій не відкочує нічого: товар уже створено і він прихований —
    // це головне. Лишається сказати, що саме не приземлилось, і сказати так,
    // щоб це прочитали: алерт на сторінці редагування, а не тост, який зникне
    // раніше, ніж операторка догортає до потрібної панелі.
    createCarryover: {
      heading: "Товар створено, але не все збереглося",
      intro:
        "Товар уже в списку й лишається прихованим. Нижче — те, що не вдалося перенести: " +
        "доробіть це просто тут, решта вже на місці.",
      images: (names: string[]) => `Фото: ${names.join(", ")}`,
      specs: "Характеристики",
      compat: "Сумісні пристрої",
      addons: (names: string[]) => `Додаткові послуги: ${names.join(", ")}`,
      dismiss: "Зрозуміло",
    },
    toastUpdated: "Товар оновлено",
    toastUpdateFailed: "Не вдалося оновити товар",
    // Staff preview of deactivated products (TASK-155)
    previewLink: "Переглянути",
    previewBack: "← Назад",
    previewEditLink: "Редагувати товар",
    previewLoadError: "Не вдалося завантажити товар для перегляду.",
    previewDeactivatedBanner:
      "Цей товар деактивований і не відображається для покупців. Це службовий перегляд.",
    previewNoImages: "Зображень немає",
    previewCategory: "Категорія",
    previewStock: "Вільний залишок",
    // TASK-254: reserved / physical breakdown next to the free-to-sell залишок.
    previewReserved: "Резерв (у замовленнях)",
    previewPhysical: "Фізично на складі",
    previewSku: "Артикул",
    previewAttributes: "Атрибути",
    previewSiblings: "Інші позиції групи",
    previewNoDescription: "Опис відсутній",
    previewActive: "Активний",
    previewInactive: "Деактивований",

    // ── Видалення товару (TASK-427) ─────────────────────────────────────────
    //
    // DELETE /api/products/:id has existed since TASK-140 and had no button
    // anywhere. The copy below has one job: say what the server actually does.
    // An operator who reads «видалити» as «стерти назавжди разом із
    // замовленнями» never touches the button; one who reads it as «приховати»
    // clicks it instead of «Деактивувати» and then cannot get the товар back,
    // because the slug and артикул have already been freed for a new position.
    deleteAction: "Видалити",
    deleteHeading: "Видалити товар?",
    deleteDescription: (name: string) =>
      `Товар «${name}» зникне з вітрини й зі списку товарів.`,
    deleteKeeps:
      "Замовлення, у яких він уже є, залишаться цілими — товар зберігається в базі " +
      "саме для них, тому історія й звіти не постраждають.",
    deleteFrees:
      "Його адреса (slug) і артикул звільняться: їх зможе зайняти інший товар. " +
      "Тому це не «приховати» — повернути товар у попередньому вигляді самотужки " +
      "не вийде.",
    deleteAlternative:
      "Якщо треба лише тимчасово прибрати товар із продажу — закрийте це вікно й " +
      "скористайтеся перемикачем статусу: деактивований товар можна увімкнути будь-коли.",
    deleteConfirm: "Так, видалити",
    deleteToastDone: (name: string) => `Товар «${name}» видалено`,
    deleteToastFailed: "Не вдалося видалити товар",

    // ── Фільтр «видалені» (TASK-427) ────────────────────────────────────────
    //
    // Соft-deleted rows were unreachable from every admin read, so a delete was
    // an action with no way back to its own result. The filter shows the
    // tombstones INSTEAD of the live rows (the API has no mixed mode — the row
    // entity carries no per-product deleted marker to tell them apart).
    filterDeleted: "Видалені",
    deletedBadge: "видалено",
    deletedNotice:
      "Показано видалені товари. Вони лише для довідки: редагувати, відкрити картку " +
      "чи повернути їх із адмінки не можна — адресу й артикул уже звільнено.",

    // ── Картка товару, лише для перегляду (TASK-427) ────────────────────────
    metaTitleCard: "Картка товару — Адмін",
    cardBack: "← Назад до товарів",
    cardEditLink: "Редагувати",
    cardLoadError: "Не вдалося завантажити товар. Спробуйте ще раз.",
    cardNotFound:
      "Товар не знайдено — можливо, його видалили. Перевірте список товарів.",
    cardSectionMain: "Основне",
    cardSectionStock: "Залишки",
    cardSectionDescription: "Опис",
    cardSectionSpecs: "Характеристики",
    cardSectionImages: "Зображення",
    cardSectionAddons: "Додаткові послуги",
    cardSectionCompat: "Сумісні пристрої",
    cardSectionSeo: "SEO",
    cardSectionHistory: "Історія змін",
    cardFieldSlug: "Адреса (slug)",
    cardFieldPrice: "Ціна",
    cardFieldCompareAt: "Стара ціна",
    cardFieldGroup: "Група варіантів",
    cardFieldBrand: "Бренд",
    cardFieldPosition: "Порядок у групі",
    cardFieldCreated: "Створено",
    cardFieldUpdated: "Оновлено",
    cardFieldMetaTitle: "Meta title",
    cardFieldMetaDescription: "Meta description",
    cardEmptyValue: "—",
    cardNoSpecs: "Характеристики ще не заповнені.",
    cardNoAddons: "Для цього товару не пропонується жодної послуги.",
    cardNoCompat: "Сумісність із пристроями не вказана.",
    cardSeoFallback:
      "Порожні поля означають, що вітрина візьме назву та опис товару.",
    cardImageCount: (n: number) => `Фото: ${n}`,

    // Історія змін читається з журналу дій, а він @OwnerOnly() і НЕ є правом,
    // яке можна видати (audit.controller.ts): у ньому дії всіх працівників і
    // персональні дані покупців. Тож менеджер не бачить ані таблиці, ані
    // помилки — бачить цей рядок, який пояснює, чому її тут немає.
    historyOwnerOnly:
      "Історію змін бачать лише власник і адміністратори: журнал дій містить записи " +
      "про роботу всіх працівників і персональні дані покупців.",
    historyEmpty: "Записів про зміни цього товару ще немає.",
    historyLoadError: "Не вдалося завантажити історію змін.",
    historyColWhen: "Коли",
    historyColWho: "Хто",
    historyColWhat: "Дія",
    historyUnknownActor: "невідомо",

    // ── Реєстр товарів (хвиля 198, TASK-1048, ProductsProposal Т1–Т7) ───────
    itemForms: ["товар", "товари", "товарів"],
    summaryFound: "Знайдено",
    viewDefault: "Усі товари",
    viewAll: "Усі",
    viewActive: "Показуються",
    viewHidden: "Приховані",
    viewOut: "Немає в наявності",
    colUpdated: "Оновлено",
    statusShown: "Показується",
    statusHidden: "Приховано",
    stockFree: (count: number) => `${count} вільно`,
    stockNone: "Немає",
    stockReserved: (reserved: number) => `резерв ${reserved}`,
    stockPhysical: (physical: number) => `на складі ${physical}`,
    stockHintFree: "Вільно",
    stockHintFreeText: "— можна продати зараз.",
    stockHintReserved: "Резерв",
    stockHintReservedText:
      "— уже в непідтверджених і необроблених замовленнях, чекає відправки.",
    stockHintPhysical: "На складі",
    stockHintPhysicalText: "— фізично є: вільно + резерв.",
    stockHintRenamed: "Раніше колонка називалась «Вільно / Резерв / Фізично».",
    oldPriceAria: (price: string) => `Стара ціна ${price}`,
    sortNameAsc: "назва, А→Я",
    sortNameDesc: "назва, Я→А",
    sortPriceAsc: "ціна, дешевші спершу",
    sortPriceDesc: "ціна, дорожчі спершу",
    sortStockAsc: "залишок, менший спершу",
    sortStockDesc: "залишок, більший спершу",
    sortCreatedDesc: "створено, нові зверху",
    sortCreatedAsc: "створено, старі зверху",
    rowOpen: "Відкрити",
    rowPreview: "Огляд",
    rowDelete: "Видалити…",
    rowStatusFailed: "Не вдалося змінити статус товару",
    bulkIdleHint:
      "Виберіть рядки, щоб показати чи приховати, перенести в групу або задати колір кількох товарів",
    bulkShow: "Показувати на сайті",
    bulkHide: "Приховати",
    bulkGroup: "У групу…",
    bulkColor: "Колір…",
    toastHidden: (label: string) =>
      `Приховано ${label}. Вони зникли з вітрини.`,
    toastShown: (label: string) => `Показуються на сайті: ${label}.`,
    toastGrouped: (label: string) => `Перенесено в групу: ${label}.`,
    toastColored: (label: string) => `Змінено колір: ${label}.`,
    filterCategory: "Категорія",
    filterCategoryAny: "Будь-яка категорія",
    filterCategoryPlaceholder: "Почніть вводити категорію…",
    filterBrand: "Бренд",
    filterPrice: "Ціна, ₴",
    filterStockIn: "Є",
    filterDevice: "Сумісний пристрій",
    filterDeviceAny: "Будь-який пристрій",
    filterDevicePlaceholder: "Почніть вводити модель…",
    filterNothingFound: "Нічого не знайдено",
    filtersApply: "Показати товари",
    chipStatus: (label: string) => `Статус: ${label}`,
    chipStock: (label: string) => `Залишок: ${label}`,
    chipCategory: (label: string) => `Категорія: ${label}`,
    chipBrand: (label: string) => `Бренд: ${label}`,
    chipDevice: (label: string) => `Пристрій: ${label}`,
    chipPrice: (from: string, to: string) =>
      from && to
        ? `Ціна: ${from}–${to} ₴`
        : from
          ? `Ціна: від ${from} ₴`
          : `Ціна: до ${to} ₴`,
    totalsFree: (count: number) => `${count} вільно`,

    // ── Шапка форми товару (хвиля 198, TASK-1050, Ф1/Ф2) ────────────────────
    editMeta: (sku: string, updated: string) =>
      sku ? `SKU ${sku} · оновлено ${updated}` : `оновлено ${updated}`,
    viewOnSite: "Подивитись на сайті",
    headerMoreAria: "Інші дії з товаром",
    menuCard: "Картка товару",
    menuPreview: "Прев'ю",
  },

  // TASK-360: supplier-catalogue import.
  catalogImport: {
    heading: "Імпорт каталогу з файлу",
    intro:
      "Завантажте .xlsx від постачальника. Спершу покажемо, що саме зміниться — " +
      "і нічого не запишемо, доки ви не підтвердите.",
    pickFile: "Оберіть файл .xlsx",
    upload: "Розібрати файл",
    uploading: "Розбираємо файл…",
    uploadFailed: "Не вдалося розібрати файл",
    duplicateWarning:
      "Такий самий файл уже імпортували раніше. Якщо він не змінювався, змін не буде.",

    // Summary tiles
    tileCreate: "Створити",
    tileUpdate: "Оновити",
    tileMissing: "Приховати",
    tileUnchanged: "Без змін",
    tileErrors: "Помилок у файлі",
    tileConflicts: "Ручних правок під загрозою",

    // Reference data the import will create
    referencesHeading: "Довідники з файлу",
    refCategories: "Категорії",
    refBrands: "Бренди",
    refDeviceBrands: "Марки пристроїв",
    refDeviceModels: "Моделі пристроїв",
    refAttributes: "Характеристики",
    refGroups: "Групи варіантів",
    // TASK-727: a «Текст» characteristic cannot be a filter (TASK-488) — the old
    // hint promised it could, without saying the type has to change first.
    refHint:
      "Створимо ті, яких ще немає. Колір одразу стає фільтром; решту характеристик " +
      "додаємо з типом «Текст» — такий тип не може бути фільтром. Щоб зробити " +
      "характеристику фільтром, відкрийте " +
      "«Категорії» → категорію → «Характеристики», змініть тип на «Вибір зі списку» " +
      "(і перелічіть значення) або «Так / Ні» та увімкніть «Використовувати як фільтр каталогу».",

    // Rows
    createsHeading: (n: number) => `Нові товари (${n})`,
    createsHint:
      "Кожен створюється прихованим і з нульовим залишком — у файлі немає залишків. " +
      "Опублікуєте їх самі, коли перевірите.",
    updatesHeading: (n: number) => `Зміни в наявних товарах (${n})`,
    missingHeading: (n: number) => `Зникли з файлу (${n})`,
    missingHint:
      "Ці товари приховаємо — не видалимо. Якщо постачальник поверне їх у файл, " +
      "вони знову зʼявляться.",
    issuesHeading: (n: number) => `Рядки, які пропустимо (${n})`,
    rowNumber: (n: number) => `рядок ${n}`,
    conflictBadge: "змінено вручну",
    conflictHint:
      "Це поле хтось правив в адмінці. За замовчуванням переможе файл — зніміть " +
      "галочку, щоб зберегти вашу правку.",
    uncheckConflicts: "Зняти всі ручні правки",
    showMore: (n: number) => `Показати ще ${n}`,

    // Apply
    apply: "Застосувати",
    applying: "Записуємо…",
    applyConfirm: (n: number) =>
      `Застосувати ${n} змін? Товари створюються прихованими, тож на вітрині нічого не зміниться, ` +
      `доки ви їх не опублікуєте.`,
    cancel: "Відхилити",
    cancelConfirm: "Відхилити цей розбір? Файл доведеться завантажити заново.",
    applyFailed: "Не вдалося застосувати імпорт",
    cancelled: "Розбір відхилено",

    // Progress / result
    progress: (done: number, total: number) => `Записано ${done} з ${total}`,
    doneHeading: "Імпорт завершено",
    doneHint:
      "Нові товари лежать прихованими у списку товарів. Проставте залишки й " +
      "опублікуйте те, що готове до продажу.",
    failedHeading: "Імпорт зупинився",
    toStore: "До списку товарів",
    startOver: "Імпортувати інший файл",

    // History
    historyHeading: "Попередні імпорти",
    historyEmpty: "Імпортів ще не було.",
    status: {
      PARSED: "Очікує підтвердження",
      APPLYING: "Записується",
      APPLIED: "Застосовано",
      FAILED: "Помилка",
      CANCELLED: "Відхилено",
    } as Record<string, string>,
    loadError: "Не вдалося завантажити дані імпорту.",
  },

  // TASK-361: publication is its own action, separate from saving the fields.
  productPublish: {
    heading: "Публікація",
    draftBadge: "Приховано",
    liveBadge: "Показується",
    publish: "Показати на сайті",
    unpublish: "Приховати з сайту",
    readyHint: "Товар готовий до публікації.",
    blockersHint: "Щоб опублікувати товар, заповніть обов'язкові пункти:",
    advisoryNote:
      "Пункти без позначки «обов'язково» публікацію не блокують, але без них " +
      "картка товару виглядає порожньою для покупця.",
    requiredMark: "обов'язково",
    checks: {
      name: "Вказана назва",
      category: "Обрана категорія",
      price: "Ціна більша за 0",
      photo: "Є хоча б одне фото",
      description: "Заповнений опис",
      stock: "Залишок більший за 0",
      specs: "Заповнені характеристики",
      compat: "Вказана сумісність із пристроями",
    },
    toastPublished: "Товар опубліковано — він з'явився на вітрині",
    toastUnpublished: "Товар знято з публікації",
    toastFailed: "Не вдалося змінити статус публікації",
  },

  productForm: {
    name: "Назва",
    slug: "Адреса на сайті (slug)",
    slugPlaceholder: "Залиште порожнім для авто-генерації з назви",
    slugPreview: (slug: string) => `Буде згенеровано: ${slug}`,
    description: "Опис",
    descriptionPlaceholder:
      "Опишіть товар: для чого він, з чого зроблений, що в комплекті",
    price: "Ціна, ₴",
    compareAtPrice: "Стара ціна, ₴",
    sku: "Артикул (SKU)",
    category: "Категорія",
    categoryPlaceholder: "Оберіть категорію",
    loading: "Завантаження…",
    stock: "Вільно, шт",
    stockHint:
      "Скільки можна продати прямо зараз. Резерв — у замовленнях, що ще не відправлені: " +
      "його віднімаємо одразу при оформленні, а не при відправці.",
    // TASK-254: dynamic breakdown shown under the static hint in edit mode only.
    stockBreakdownHint: (physicalQty: number, reservedQty: number) =>
      `Резерв ${reservedQty} · на складі ${physicalQty}`,
    positionOrder: "Порядок позиції",
    group: "Група",
    groupNone: "Без групи",
    brand: "Бренд",
    brandNone: "Без бренду",
    attributes: "Атрибути",
    attributesHint:
      "Значення атрибутів позиції за назвами осей групи (напр. колір / синій).",
    attrKeyPlaceholder: "ключ (напр. color)",
    attrValuePlaceholder: "значення (напр. blue)",
    attrKeyAria: (i: number) => `Ключ атрибута ${i}`,
    attrValueAria: (i: number) => `Значення атрибута ${i}`,
    removeAttrAria: (i: number) => `Видалити атрибут ${i}`,
    addAttribute: "Додати атрибут",
    metaTitle: "SEO-заголовок (meta title)",
    metaTitlePlaceholder: "Залиште порожнім, щоб використати назву товару",
    metaTitleHint:
      "Заголовок сторінки товару для пошукових систем (Google) і соцмереж. Залиште порожнім — і він згенерується автоматично з назви товару.",
    metaDescription: "SEO-опис (meta description)",
    metaDescriptionPlaceholder: "Короткий опис товару для пошукових систем",
    metaDescriptionHint:
      "Короткий текст під заголовком у результатах пошуку. Залиште порожнім — і він згенерується автоматично з опису товару.",
    errors: {
      nameRequired: "Вкажіть назву",
      nameMax: "Назва має містити не більше 255 символів",
      slugMax: "Slug має містити не більше 255 символів",
      descriptionMax: "Опис має містити не більше 20000 символів",
      priceRequired: "Вкажіть ціну",
      priceNumber: "Ціна має бути числом",
      pricePositive: "Ціна має бути більшою за 0",
      compareNumber: "Стара ціна має бути числом",
      comparePositive: "Стара ціна має бути більшою за 0",
      skuMax: "Артикул має містити не більше 50 символів",
      stockInt: "Вільний залишок має бути цілим числом ≥ 0",
      categoryRequired: "Оберіть категорію",
      groupInvalid: "Оберіть коректну групу",
      brandInvalid: "Оберіть коректний бренд",
      positionInt: "Порядок позиції має бути цілим числом ≥ 0",
    },

    // Type-to-filter pickers (TASK-423). The category, group and brand selects
    // list the whole tree / table — a hundred-plus options a drop-down can only
    // be scrolled through — so they became comboboxes.
    comboboxPlaceholder: "Почніть вводити назву…",
    comboboxEmpty: "Нічого не знайдено",

    // ── Форма за макетом (хвиля 198, TASK-1050, ProductFormProposal Ф1–Ф5) ──
    sectionsNav: "Розділи форми товару",
    sectionMain: "Основне",
    sectionPrice: "Ціна і склад",
    sectionDescription: "Опис",
    sectionSpecs: "Характеристики",
    sectionPhotos: "Фото",
    sectionCompat: "Сумісність",
    sectionAddons: "Послуги",
    sectionSeo: "SEO і соцмережі",
    statusDirty: "є незбережені зміни",
    statusMissing: "не заповнено",
    statusDone: "заповнено",
    requiredMark: "обов'язкове поле",
    slugPrefix: "/products/",
    slugChange: "Змінити…",
    slugLockedHint:
      "Товар уже на сайті: зміна адреси зламає старі посилання, тому спершу спитаємо.",
    slugDialogTitle: "Змінити адресу товару?",
    // Not the artboard's «перестане відкриватися»: the API records a 301 from
    // the old slug (SlugRedirect, TASK-285), so old links still land here —
    // what really changes is the indexed address.
    slugDialogDescription: (oldSlug: string) =>
      `Товар уже на сайті. Адреса /products/${oldSlug} зміниться: у Google вона випаде з пошуку й проіндексується заново, а покупців зі старих посилань і закладок ми переадресуємо на нову.`,
    slugDialogLabel: "Нова адреса",
    slugDialogConfirm: "Змінити адресу",
    compareAtHint: (percent: number) =>
      `Закреслена на вітрині — знижка ${percent}%`,
    specsTemplateHint: (category: string) =>
      `Список — із шаблону категорії «${category}»`,
    seoSummaryMeta: (filled: boolean) =>
      filled
        ? "Заголовок і опис для Google заповнені"
        : "Заголовок і опис для Google — автоматично з назви й опису",
    seoSummaryOg: (set: boolean) =>
      set
        ? "картинка для соцмереж задана"
        : "картинка для соцмереж — автоматична",
    seoSummaryTags: (count: number) => `теги пошуку: ${count}`,
    saveFailed: (section: string, message: string) =>
      `Не вдалося зберегти «${section}»: ${message}`,
    savedPartly: (sections: string) =>
      `Решту вже збережено: ${sections}. Виправте розділ і натисніть «Зберегти» ще раз.`,
    saveFailedGeneric: "сервер не прийняв зміни",
  },

  // --- Categories (TASK-115) --------------------------------------------------
  categories: {
    // Add-on template panel embedded in the category form (TASK-174).
    // Wave 198 (КТ5): it is a section of the one form now — its title is
    // `categoryForm.sectionAddons`, and the form's «Зберегти» saves it.
    addonTemplate: {
      hint:
        "Позначте послуги, які пропонуватимуться для ВСІХ товарів цієї категорії та її підкатегорій. " +
        "Якщо не позначити жодної, категорія успадкує послуги найближчої батьківської категорії.",
      inheritedFrom: (name: string) =>
        `Власного набору немає — зараз успадковується з «${name}». Позначте послуги нижче, щоб задати власний (він повністю замінить успадкований).`,
      noneAnywhere:
        "Ані ця категорія, ані її батьківські не пропонують додаткових послуг.",
      clearedNote:
        "Нічого не позначено — після збереження категорія повернеться до успадкування.",
      emptyCatalog:
        "У каталозі ще немає активних послуг. Спершу створіть їх у розділі «Додаткові послуги».",
      loadError: "Не вдалося завантажити послуги. Спробуйте ще раз.",
    },
    metaTitle: "Категорії — Адмін",
    metaTitleNew: "Створення категорії — Адмін",
    metaTitleEdit: "Редагування категорії — Адмін",
    heading: "Категорії",
    add: "Додати категорію",
    searchPlaceholder: "Назва категорії…",
    searchAria: "Пошук категорій",
    loadError: "Не вдалося завантажити категорії. Спробуйте ще раз.",
    emptyMatch: (q: string) => `Немає категорій за запитом «${q}».`,
    empty: "Категорій ще немає. Створіть свою першу категорію.",
    colName: "Назва",
    colSlug: "Slug",
    colProducts: "Товарів",
    // TASK-408: the column shows the SUBTREE total, because that is what the
    // storefront category page lists. The direct count is spelled out beside it —
    // without it a parent that files nothing of its own looks like a data error.
    colProductsHint:
      "Скільки товарів показує вітрина на сторінці категорії — разом з усіма підкатегоріями. " +
      "«Прямо» — скільки лежить безпосередньо в самій категорії.",
    productsDirect: (count: number) => `прямо ${count}`,
    colStatus: "Статус",
    root: "Коренева",
    back: "← Категорії",
    createHeading: "Створення категорії",
    editHeading: "Редагування категорії",
    createSubmit: "Створити категорію",
    loadOneError: "Не вдалося завантажити категорію. Спробуйте ще раз.",
    toastCreated: "Категорію створено",
    toastCreateFailed: "Не вдалося створити категорію",
    toastUpdated: "Категорію оновлено",
    // (No `toastUpdateFailed`: since wave 198 a failed save names the section
    // it stopped at — `saveStepFailed` below.)
    // --- Category tree (TASK-291) ---------------------------------------------
    // Labels for the treegrid screen: the persistent Undo control, the per-row
    // "Дії" menu (the WCAG 2.2 SC 2.5.7 non-dragging alternative), the
    // "Перемістити до…" dialog, and the blast-radius deactivate confirmation.
    tree: {
      label: "Дерево категорій",
      expandRow: (name: string) => `Розгорнути „${name}“`,
      collapseRow: (name: string) => `Згорнути „${name}“`,
      searchLockedHint:
        "Пошук активний — переміщення вимкнено. Очистіть пошук, щоб змінювати порядок.",
      undo: "Скасувати останнє переміщення",
      actionsLabel: (name: string) => `Дії: „${name}“`,
      moveUp: "Перемістити вгору",
      moveDown: "Перемістити вниз",
      indentUnder: (name: string) => `Зробити підкатегорією „${name}“`,
      indent: "Зробити підкатегорією",
      outdent: "Підняти на рівень вище",
      moveTo: "Перемістити до…",
      edit: "Редагувати",
      // Wave 198 (TASK-1052): the tree speaks of the SITE, not of a flag —
      // the badge says «Показується / Приховано», so the actions match it.
      activate: "Показувати на сайті",
      deactivate: "Приховати",
      // TASK-408: an ACTIVE category under a deactivated ancestor is invisible on
      // the storefront, but its own row says «Активна» — the status column can only
      // speak about one row. The badge says what the tree does, so nobody spends an
      // afternoon wondering why an active category has no page.
      hiddenByParent: "через батьківську",
      hiddenByParentHint: (name: string) =>
        `Сама категорія увімкнена, але на сайті не показується: приховано «${name}» вище по дереву.`,
      // Blast radius (§3.11): stated BEFORE the mutation fires, N computed from
      // the tree already in memory.
      deactivateConfirm: (name: string, count: number) =>
        `„${name}“ буде приховано разом із ${count} підкатегоріями`,
      // Bulk activate/deactivate (TASK-293). NO CASCADE: the selected rows change
      // status, their descendants keep theirs — but a hidden parent still hides its
      // whole branch from the storefront, so the confirmation says both.
      bulk: {
        colSelect: "Вибір",
        selectRow: (name: string) => `Вибрати „${name}“`,
        selectAll: "Вибрати всі видимі категорії",
        activate: (count: number) => `Показувати на сайті (${count})`,
        deactivate: (count: number) => `Приховати (${count})`,
        deactivateConfirm: (count: number) =>
          `Приховати вибрані категорії (${count})? Кожна з них зникне з сайту разом з усім, що під нею. Статус самих підкатегорій не зміниться.`,
        announce: {
          selected: (name: string, count: number) =>
            `Вибрано „${name}“. Усього вибрано: ${count}.`,
          deselected: (name: string, count: number) =>
            `Знято вибір із „${name}“. Усього вибрано: ${count}.`,
          cleared: "Вибір знято.",
          saving: (count: number) => `Зберігаю зміни для ${count} категорій…`,
          done: (count: number, isActive: boolean) =>
            isActive
              ? `Показуються на сайті категорій: ${count}.`
              : `Приховано категорій: ${count}.`,
          failed: "Не вдалося змінити статус. Спробуйте ще раз.",
        },
      },
      moveDialog: {
        title: (name: string) => `Перемістити „${name}“`,
        description:
          "Оберіть нову батьківську категорію та позицію серед її підкатегорій.",
        parentLabel: "Батьківська категорія",
        rootOption: "Коренева (без батьківської)",
        positionLabel: "Позиція",
        positionOption: (pos: number, size: number) => `${pos} з ${size}`,
        submit: "Перемістити",
        cancel: "Скасувати",
        loading: "Завантаження…",
      },

      // TASK-423: «Підняти на рівень вище» moves ONE level, so a level-3
      // category needed two trips through the menu to reach the root — and
      // nothing on screen said that a second trip was even possible. This is the
      // whole journey in one item; it runs the same outdent step repeatedly, so
      // it lands exactly where pressing «Підняти на рівень вище» twice would.
      makeRoot: "Зробити кореневою",

      // --- Wave 198, CategoriesProposal КТ1–КТ4 (TASK-1052) ------------------
      // The status badge says what the SITE does with the row (TASK-408 «через
      // батьківську» sits beside it), not what the database flag is called.
      statusShown: "Показується",
      statusHidden: "Приховано",
      expandAll: "Розгорнути все",
      collapseAll: "Згорнути все",
      // The always-visible bulk bar teaches what ticking a row is FOR.
      bulkIdleHint:
        "Виберіть категорії, щоб показати чи приховати кілька одразу. Перетягуйте за ⠿, щоб змінити порядок або вкласти.",
      bulkItemForms: ["категорію", "категорії", "категорій"],
      // The per-row blast-radius dialog's confirm button.
      hideConfirm: "Приховати",
      // 390 px: counts and status fold into one line under the name (КТ4).
      mobileCount: (count: number) => `${count} тов.`,
      // TASK-963: the toast that follows a move, carrying «Скасувати». The
      // persistent «Скасувати останнє переміщення» control stays as well.
      movedToast: {
        nested: (name: string, parent: string) =>
          `«${name}» вкладено в «${parent}».`,
        root: (name: string) => `«${name}» тепер коренева категорія.`,
        reordered: (name: string, pos: number, size: number) =>
          `«${name}» переміщено: позиція ${pos} з ${size}.`,
      },
    },
    // TASK-285: slug-rename guard on a publicly visible category.
    slugChangeConfirm: (oldSlug: string, newSlug: string) =>
      `Ви змінюєте адресу активної категорії з «${oldSlug}» на «${newSlug}». ` +
      `Стара адреса перестане працювати і випаде з результатів пошуку Google — ` +
      `але ми автоматично налаштуємо переадресацію зі старої адреси на нову. Продовжити?`,

    // --- Wave 198, CategoriesProposal КТ5 (TASK-1052): the edit page ---------
    // The slug guard is an AlertDialog now, not `window.confirm`.
    slugChangeConfirmTitle: "Змінити адресу категорії?",
    slugChangeConfirmAction: "Змінити адресу",
    // Header line: «30 товарів у 3 підкатегоріях · /categories/cases».
    headerProducts: (products: number, subcategories: number) =>
      subcategories > 0
        ? `${countLabel(products, ["товар", "товари", "товарів"])} у ${countLabel(subcategories, ["підкатегорії", "підкатегоріях", "підкатегоріях"])}`
        : countLabel(products, ["товар", "товари", "товарів"]),
    headerMenuAria: "Дії з категорією",
    openOnSite: "Відкрити на сайті",
    // One «Зберегти» saves the sections in order and stops at the first that
    // fails — saying what DID save, so nobody re-enters it.
    saveStepFailed: (saved: string, failed: string) =>
      saved
        ? `Збережено: ${saved}. Не вдалося зберегти: ${failed} — спробуйте ще раз.`
        : `Не вдалося зберегти: ${failed} — спробуйте ще раз.`,
  },

  categoryForm: {
    name: "Назва",
    slug: "Slug",
    slugPlaceholder: "Залиште порожнім для авто-генерації з назви",
    description: "Опис",
    image: "URL зображення",
    imagePlaceholder: "https://…",
    parent: "Батьківська категорія",
    rootOption: "Коренева (без батьківської)",
    loading: "Завантаження…",
    // TASK-291-K: no `sortOrder` label — the order field is gone from this form
    // (sibling order lives in the treegrid).
    // Wave 198 (КТ5): a Switch, worded as what it does on the site.
    active: "Показувати на сайті",
    metaTitle: "SEO-заголовок (meta title)",
    metaTitlePlaceholder: "Залиште порожнім, щоб використати назву",
    metaDescription: "SEO-опис (meta description)",
    metaDescriptionPlaceholder: "Короткий опис для пошукових систем",
    submit: "Зберегти категорію",
    errors: {
      nameRequired: "Вкажіть назву",
      nameMax: "Назва має містити не більше 255 символів",
      slugMax: "Slug має містити не більше 255 символів",
      descriptionMax: "Опис має містити не більше 2000 символів",
      imageUrl: "Вкажіть коректний URL",
      parentInvalid: "Оберіть коректну категорію",
    },
    // TASK-424: the image field accepts a FILE as well as a link. «Прибрати» is
    // deliberately not «Видалити» — it clears this form's field and nothing else.
    imageUpload: {
      alt: "Зображення категорії",
      empty: "Файл ще не завантажено.",
      upload: "Завантажити файл",
      replace: "Замінити файл",
      remove: "Прибрати",
      removeTitle: "Прибрати зображення категорії?",
      removeDescription:
        "Поле очиститься, і після збереження категорія буде без зображення. Сам файл залишиться у сховищі.",
      hint: "JPEG, PNG, WebP або GIF — до 20 МБ; великі зменшимо самі. Або вставте посилання в поле нижче — зображення з іншого сайту вітрина покаже, лише якщо цей сайт додано до дозволених (посібник, розділ 13).",
      toastUploaded: "Зображення завантажено — не забудьте зберегти категорію",
      errorTooLarge:
        "Файл завеликий — максимум 20 МБ. Стисніть зображення і спробуйте ще раз.",
      errorUnsupportedType:
        "Непідтримуваний формат. Дозволені JPEG, PNG, WebP і GIF.",
      errorGeneric: "Не вдалося завантажити файл. Спробуйте ще раз.",
    },

    // --- Wave 198, CategoriesProposal КТ5 (TASK-1052, TASK-1117) ------------
    sectionsAria: "Розділи форми категорії",
    sectionMain: "Основне",
    sectionImage: "Зображення",
    sectionAttributes: "Характеристики",
    sectionAddons: "Додаткові послуги",
    sectionSeo: "SEO і соцмережі",
    // Read after a section's dot in the section index.
    sectionDirty: "є незбережені зміни",
    sectionError: "є помилка",
    // Under «Показувати на сайті»: what switching it off takes with it.
    hideConsequence: (subcategories: number, products: number) => {
      const goods = countLabel(products, ["товаром", "товарами", "товарами"]);
      if (subcategories === 0) {
        return `Вимкнення ховає з сайту категорію разом із її ${goods}.`;
      }
      if (subcategories === 1) {
        return `Вимкнення ховає й 1 підкатегорію разом із їхніми ${goods}.`;
      }
      return `Вимкнення ховає й усі ${countLabel(subcategories, ["підкатегорію", "підкатегорії", "підкатегорій"])} разом із їхніми ${goods}.`;
    },
    // No tree yet (a new category) — nothing to count.
    hideConsequenceGeneric:
      "Вимкнена категорія не показується на сайті — разом з усіма підкатегоріями та їхніми товарами.",
    // TASK-1117: `Category.keywords` has no consumer — no index, no search — so
    // the hint says so instead of promising search and AI assistants.
    keywords: "Теги категорії",
    keywordsHint:
      "Для вашого впорядкування. Пошук на сайті їх поки що не враховує — щоб товар знаходили за словом, додайте його в назву чи опис товару.",
    // The one line that stands in for the folded SEO section.
    seoSummary: (ownTitle: boolean, tags: number, ownOgImage: boolean) =>
      [
        ownTitle
          ? "Свій заголовок для Google"
          : "Заголовок для Google — з назви",
        tags > 0 ? countLabel(tags, ["тег", "теги", "тегів"]) : "без тегів",
        ownOgImage
          ? "своя картинка для соцмереж"
          : "картинка для соцмереж — автоматична",
      ].join(" · "),
  },

  // --- Devices: compatibility taxonomy (TASK-190) -----------------------------
  devices: {
    metaTitle: "Пристрої — Адмін",
    brandsHeading: "Бренди пристроїв",
    modelsHeading: "Моделі пристроїв",
    addBrand: "Додати бренд",
    addModel: "Додати модель",
    tabBrands: "Бренди",
    tabModels: "Моделі",
    brandsLoadError: "Не вдалося завантажити бренди пристроїв.",
    modelsLoadError: "Не вдалося завантажити моделі пристроїв.",
    loadOneError: "Не вдалося завантажити запис. Спробуйте ще раз.",
    brandsEmpty: "Брендів пристроїв ще немає. Створіть перший.",
    modelsEmpty: "Моделей пристроїв ще немає. Створіть першу.",
    modelsSearchPlaceholder: "Пошук за назвою моделі…",
    modelsSearchAria: "Пошук моделей пристроїв",
    modelsEmptyMatch: (q: string) => `Немає моделей за запитом «${q}».`,
    colName: "Назва",
    colSlug: "Slug",
    colBrand: "Бренд",
    colSeries: "Серія",
    colYear: "Рік",
    colModels: "Моделі",
    // TASK-295: no `colSort` — the order column is gone; order IS the row order.
    brandsGridLabel: "Бренди пристроїв — порядок",
    colStatus: "Статус",
    statusActive: "Активний",
    statusInactive: "Прихований",
    activate: "Активувати",
    deactivate: "Приховати",
    backToBrands: "← Назад до брендів",
    backToModels: "← Назад до моделей",
    createBrandHeading: "Створення бренду пристрою",
    editBrandHeading: "Редагування бренду пристрою",
    createModelHeading: "Створення моделі пристрою",
    editModelHeading: "Редагування моделі пристрою",
    toastBrandCreated: "Бренд пристрою створено",
    toastBrandCreateFailed: "Не вдалося створити бренд пристрою",
    toastBrandUpdated: "Бренд пристрою оновлено",
    toastBrandUpdateFailed: "Не вдалося оновити бренд пристрою",
    toastModelCreated: "Модель пристрою створено",
    toastModelCreateFailed: "Не вдалося створити модель пристрою",
    toastModelUpdated: "Модель пристрою оновлено",
    toastModelUpdateFailed: "Не вдалося оновити модель пристрою",
    toastStatusFailed: "Не вдалося змінити статус",

    // Model-list filters (TASK-423 / AD-DEV-04). The endpoint has accepted
    // `deviceBrandId` and `isActive` since TASK-190 — the table simply never
    // passed them, so the only way to see one brand's models was to search by a
    // name fragment and hope the brand name was part of it.
    filterBrandAria: "Фільтр за брендом",
    allBrands: "Усі бренди",
    filterStatusAria: "Фільтр за статусом",
    allStatuses: "Усі статуси",
  },

  deviceBrandForm: {
    name: "Назва бренду",
    slug: "Slug",
    slugPlaceholder: "Залиште порожнім для авто-генерації з назви",
    // TASK-295: no `sortOrder` label — the order field is gone from this form
    // (brand order lives in the sortable brands grid).
    active: "Активний (показувати в магазині)",
    submit: "Зберегти бренд",
    errors: {
      nameRequired: "Вкажіть назву",
      nameMax: "Назва має містити не більше 255 символів",
      slugMax: "Slug має містити не більше 255 символів",
    },
  },

  deviceModelForm: {
    brand: "Бренд пристрою",
    brandPlaceholder: "Оберіть бренд",
    loading: "Завантаження…",
    name: "Назва моделі",
    slug: "Slug",
    slugPlaceholder: "Залиште порожнім для авто-генерації з назви",
    series: "Серія",
    seriesPlaceholder: "Напр., iPhone 15",
    releaseYear: "Рік випуску",
    active: "Активна (показувати в магазині)",
    submit: "Зберегти модель",
    // TASK-490 — тексти сторінок сумісності «<Категорія> для <Модель>»
    // (/catalog/<категорія>/<модель>). Порожнє поле = згенерований шаблон, тож
    // підказки пояснюють саме це: писати треба лише там, де шаблон слабкий.
    seoHeading: "Тексти сторінок сумісності",
    seoHint:
      "Ці тексти показуються на сторінках «<Категорія> для <Модель>» — напр. «Чохли для iPhone 15 Pro». Порожнє поле означає автоматичний текст; один набір діє для всіх категорій цієї моделі.",
    metaTitle: "SEO-заголовок (meta title)",
    metaTitlePlaceholder: "Залиште порожнім для автоматичного заголовка",
    metaDescription: "SEO-опис (meta description)",
    metaDescriptionPlaceholder:
      "Короткий опис сторінки сумісності для пошукових систем",
    description: "Опис на сторінці",
    descriptionPlaceholder: "Абзац під заголовком сторінки сумісності",
    errors: {
      brandRequired: "Оберіть бренд",
      nameRequired: "Вкажіть назву",
      nameMax: "Назва має містити не більше 255 символів",
      slugMax: "Slug має містити не більше 255 символів",
      seriesMax: "Серія має містити не більше 255 символів",
      yearInt: "Рік має бути коректним (1990–2100)",
      descriptionMax: "Опис має містити не більше 2000 символів",
    },
  },

  // Product-form device-compatibility multiselect + bulk action (TASK-190).
  productCompat: {
    title: "Сумісні пристрої",
    hint: "Оберіть моделі пристроїв, з якими сумісний цей товар.",
    loading: "Завантаження пристроїв…",
    empty: "Спершу створіть бренди та моделі пристроїв.",
    applyToGroup: "Застосувати до всіх позицій групи",
    applyToGroupHint:
      "Скопіювати цей набір сумісності на кожну позицію тієї ж групи.",
    // TASK-442 — на сторінці створення набір уже можна відмітити; він поїде на
    // сервер одразу після створення товару, окремої кнопки тут немає.
    stagedHint: "Збережеться разом із товаром.",
    toastSaved: "Сумісність оновлено",
    toastSaveFailed: "Не вдалося оновити сумісність",
    toastGroupApplied: (count: number) =>
      `Сумісність застосовано до ${count} позицій`,
    toastGroupFailed: "Не вдалося застосувати сумісність до групи",
    // TASK-726: the save button said the block's title («Сумісні пристрої»)
    // instead of the action — mirrors productSpecs.save.
    save: "Зберегти сумісність",
    // Хвиля 198 (TASK-1050, Ф3): пошук, бренди-пігулки й «Лише вибрані».
    searchPlaceholder: "Модель: iPhone 15, Galaxy S24…",
    searchAria: "Пошук моделі пристрою",
    onlySelected: "Лише вибрані",
    selectedCount: (count: number) => `Вибрано ${count}`,
    allBrands: (count: number) => `Усі ${count}`,
    brandFilterAria: "Бренд пристрою",
    nothingFound: "Нічого не знайдено",
  },

  // --- Product structured-spec values editor (TASK-191) -----------------------
  productSpecs: {
    heading: "Характеристики",
    description:
      "Значення характеристик для цього товару. Список формується з шаблонів категорії та її батьків.",
    empty:
      "Для категорії цього товару ще не задано жодного шаблону характеристик.",
    noCategory: "Спочатку оберіть категорію товару.",
    loadError: "Не вдалося завантажити характеристики.",
    save: "Зберегти характеристики",
    saving: "Збереження…",
    // TASK-442 — те саме поле на сторінці створення: окремої кнопки немає,
    // значення поїдуть на сервер одразу після створення товару.
    stagedHint: "Збережеться разом із товаром.",
    selectPlaceholder: "— не вибрано —",
    toastSaved: "Характеристики збережено",
    toastError: "Не вдалося зберегти характеристики.",
    // Хвиля 198 (TASK-1050): так/ні — сегментами замість галочки, що писала «false».
    booleanYes: "Так",
    booleanNo: "Ні",
    booleanUnset: "Не вказано",
  },

  // --- Structured-spec templates (TASK-191) -----------------------------------
  attributeDefinitions: {
    heading: "Характеристики",
    description:
      "Шаблон характеристик для товарів цієї категорії; підкатегорії його успадковують.",
    add: "Додати характеристику",
    empty: "Ще немає характеристик для цієї категорії.",
    edit: "Редагувати",
    remove: "Видалити",
    moveUp: "Вгору",
    moveDown: "Вниз",
    saving: "Збереження…",
    loadError: "Не вдалося завантажити характеристики.",
    confirmRemove:
      "Видалити цю характеристику разом з усіма значеннями товарів?",
    filterableBadge: "у фільтрах",
    // form
    key: "Ключ (лат.)",
    keyPlaceholder: "material",
    label: "Назва",
    labelPlaceholder: "Матеріал",
    type: "Тип",
    unit: "Одиниця (необовʼязково)",
    unitPlaceholder: "Вт, мм…",
    options: "Значення (кожне з нового рядка)",
    optionsPlaceholder: "Силікон\nШкіра",
    isFilterable: "Використовувати як фільтр каталогу",
    // TASK-488 / рішення B-10: фасет — це «Так/Ні» або «Вибір зі списку».
    // Вільний текст і числа дають стільки значень фільтра, скільки товарів.
    isFilterableHint:
      "Доступно для типів «Так / Ні» та «Вибір зі списку»: у фільтрі мають бути готові значення, а не вільний текст",
    submitCreate: "Додати",
    submitUpdate: "Зберегти",
    cancel: "Скасувати",
    createTitle: "Нова характеристика",
    editTitle: "Редагування характеристики",
    typeText: "Текст",
    typeNumber: "Число",
    typeBoolean: "Так / Ні",
    typeSelect: "Вибір зі списку",
    toastCreated: "Характеристику додано",
    toastUpdated: "Характеристику оновлено",
    toastRemoved: "Характеристику видалено",
    toastReordered: "Порядок оновлено",
    toastError: "Не вдалося зберегти. Спробуйте ще раз.",
    errors: {
      keyRequired: "Вкажіть ключ",
      keyPattern: "Лише латиниця, цифри та дефіси; починайте з літери",
      keyMax: "Ключ має містити не більше 60 символів",
      labelRequired: "Вкажіть назву",
      labelMax: "Назва має містити не більше 120 символів",
      unitMax: "Одиниця має містити не більше 20 символів",
      optionsRequired:
        "Додайте хоча б одне значення для типу «Вибір зі списку»",
      filterableType:
        "Фільтром каталогу може бути лише «Так / Ні» або «Вибір зі списку»",
      // TASK-514 — «,» і «;» розділяють значення у фільтрі каталогу (?specs=).
      optionSeparator: (option: string) =>
        `«${option}»: кома й крапка з комою в значенні недопустимі — вони розділяють значення у фільтрі каталогу. Напишіть, напр., «Силікон — мʼякий» або «Силікон (мʼякий)»`,
    },
    // TASK-707 — стеля фасетів: вітрина показує не більше `limit` фільтрів на
    // категорію; зайві (за порядком у списку) не показуються, крім активного.
    facetCeilingTitle: (limit: number) =>
      `Вітрина показує не більше ${limit} фільтрів у категорії`,
    facetCeilingCategory: (name: string, count: number, hidden: string[]) =>
      `«${name}»: ${count} фільтрів — можуть не показатися: ${hidden.join(", ")}`,
    facetCeilingHint:
      "Зніміть позначку «Використовувати як фільтр» з менш важливих характеристик або підніміть важливіші вище — показуються перші за порядком.",
    facetCeilingLoadError: "Не вдалося перевірити кількість фільтрів.",

    // --- Wave 198, CategoriesProposal КТ5 (TASK-1052) ----------------------
    // The type in the operator's words, with what it means for the filters.
    typeTextLine: "Текст · не може бути фільтром",
    typeNumberLine: "Число · не може бути фільтром",
    optionForms: ["варіант", "варіанти", "варіантів"],
    // «Вітрина показує у фільтрах не більше 6 — зараз 4 з 6.» The count is the
    // category's EFFECTIVE facets (own + inherited), the same rule the
    // storefront applies.
    facetNowLead: (limit: number) =>
      `Вітрина показує у фільтрах не більше ${limit} — `,
    facetNow: (count: number, limit: number) => `зараз ${count} з ${limit}`,
    rowActionsAria: (label: string) => `Дії: «${label}»`,
    removeMenu: "Видалити…",
    removeTitle: (label: string) => `Видалити «${label}»?`,
  },

  // --- Discounts / promo codes (TASK-079) -------------------------------------
  discounts: {
    metaTitle: "Промокоди — Адмін",
    metaTitleNew: "Створення промокоду — Адмін",
    metaTitleEdit: "Редагування промокоду — Адмін",
    heading: "Промокоди",
    add: "Додати промокод",
    searchPlaceholder: "Пошук за кодом…",
    searchAria: "Пошук промокодів",
    loadError: "Не вдалося завантажити промокоди. Спробуйте ще раз.",
    loadOneError: "Не вдалося завантажити промокод. Спробуйте ще раз.",
    emptyMatch: (q: string) => `Немає промокодів за запитом «${q}».`,
    empty: "Промокодів ще немає. Створіть свій перший промокод.",
    colCode: "Код",
    colType: "Тип",
    colValue: "Значення",
    colRedeemed: "Використано",
    colExpires: "Діє до",
    colStatus: "Статус",
    typePercent: "Відсоток",
    typeFixed: "Фіксована",
    statusInactive: "Неактивний",
    deactivate: "Деактивувати",
    deactivating: "Деактивація…",
    noExpiry: "—",
    redeemedOf: (used: number, max: number | null) =>
      max === null ? `${used}` : `${used} / ${max}`,
    back: "← Назад до промокодів",
    createHeading: "Створення промокоду",
    editHeading: "Редагування промокоду",
    createSubmit: "Створити промокод",
    toastCreated: "Промокод створено",
    toastCreateFailed: "Не вдалося створити промокод",
    toastUpdated: "Промокод оновлено",
    toastUpdateFailed: "Не вдалося оновити промокод",
    toastDeactivated: "Промокод деактивовано",
    toastDeactivateFailed: "Не вдалося деактивувати промокод",
  },

  discountForm: {
    code: "Код",
    codePlaceholder: "SUMMER10",
    type: "Тип знижки",
    typePercent: "Відсоток (%)",
    typeFixed: "Фіксована сума (₴)",
    value: "Значення",
    minSpend: "Мінімальна сума замовлення",
    maxRedemptions: "Глобальний ліміт використань",
    perUserLimit: "Ліміт на користувача",
    startsAt: "Активний від",
    expiresAt: "Діє до",
    optional: "(необов'язково)",
    active: "Активний",
    // TASK-731 (рішення B-11): a new code is private until published here.
    showOnPromoPage: "Показувати на сторінці «Акції»",
    showOnPromoPageHint:
      "Без позначки код приватний: його немає на сторінці «Акції» вітрини, але він працює, якщо покупець введе його вручну.",
    submit: "Зберегти промокод",
    errors: {
      codeRequired: "Вкажіть код",
      codeMax: "Код має містити не більше 64 символів",
      valueRequired: "Вкажіть значення",
      valuePositive: "Значення має бути більшим за 0",
      percentRange: "Відсоток має бути в межах 1–100",
      minSpendInvalid: "Вкажіть невід'ємне число",
      intInvalid: "Вкажіть ціле число більше 0",
      dateOrder: "Дата початку має передувати даті завершення",
      // TASK-796: mirrors the API's `maxDecimalPlaces: 2` on money fields.
      decimalsMax: "Не більше двох знаків після коми",
    },
    // TASK-795: the window is a pair of KYIV calendar days, inclusive.
    datesHint:
      "Дні — за київським часом, включно: код діє з 00:00 першого дня до 23:59 останнього.",
  },

  // --- Static pages (TASK-153) ------------------------------------------------
  pages: {
    metaTitle: "Сторінки — Адмін",
    metaTitleNew: "Створення сторінки — Адмін",
    metaTitleEdit: "Редагування сторінки — Адмін",
    heading: "Службові сторінки",
    add: "Додати сторінку",
    loadError: "Не вдалося завантажити сторінки. Спробуйте ще раз.",
    empty: "Сторінок ще немає. Створіть свою першу сторінку.",
    colTitle: "Заголовок",
    colSlug: "Slug",
    colStatus: "Статус",
    statusPublished: "Опубліковано",
    statusDraft: "Чернетка",
    // TASK-430: this table read `isActive` — a MIRROR of `status == PUBLISHED` —
    // so a page scheduled for Friday was badged «Чернетка», indistinguishable from
    // one somebody forgot. The status is the source of truth; `isActive` still
    // drives the publish/unpublish button, which is what it is for.
    statusScheduled: "Заплановано",
    statusScheduledOn: (date: string) => `Заплановано на ${date}`,
    publish: "Опублікувати",
    unpublish: "Зняти з публікації",
    // TASK-285: the published variant reminds the admin the URL may still be
    // indexed by Google and deleting it leaves a 404 with NO redirect.
    deleteConfirm: (title: string, isPublished: boolean) =>
      `Видалити сторінку «${title}»? Цю дію не можна скасувати.` +
      (isPublished
        ? " Сторінка опублікована і може бути в пошуковому індексі Google — після видалення адреса поверне помилку 404 без переадресації."
        : ""),
    // TASK-285: slug-rename guard on a publicly visible page.
    slugChangeConfirm: (oldSlug: string, newSlug: string) =>
      `Ви змінюєте адресу опублікованої сторінки з «${oldSlug}» на «${newSlug}». ` +
      `Стара адреса перестане працювати і випаде з результатів пошуку Google — ` +
      `але ми автоматично налаштуємо переадресацію зі старої адреси на нову. Продовжити?`,
    back: "← Назад до сторінок",
    createHeading: "Створення сторінки",
    editHeading: "Редагування сторінки",
    createSubmit: "Створити сторінку",
    loadOneError: "Не вдалося завантажити сторінку. Спробуйте ще раз.",
    toastCreated: "Сторінку створено",
    toastCreateFailed: "Не вдалося створити сторінку",
    toastUpdated: "Сторінку оновлено",
    toastUpdateFailed: "Не вдалося оновити сторінку",
    toastPublished: "Сторінку опубліковано",
    toastUnpublished: "Сторінку знято з публікації",
    toastStatusFailed: "Не вдалося змінити статус сторінки",
    toastDeleted: "Сторінку видалено",
    toastDeleteFailed: "Не вдалося видалити сторінку",

    // TASK-428: the list became a drag-reorderable grid — the hand-typed «Порядок»
    // column and its form field are gone, so the grid needs its own accessible name.
    gridLabel: "Службові сторінки — порядок",
    reorderHint:
      "Порядок рядків тут = порядок сторінок у розділах «Правова інформація» і «Довідка». Перетягніть рядок за значок ліворуч або скористайтеся клавіатурою.",
    // The list is ONE order shared by every kind, so a kind tab shows a slice
    // of it — dragging inside a slice cannot describe the whole list.
    kindLockedHint:
      "Поки увімкнено фільтр за видом, порядок змінювати не можна: сторінки впорядковані одним спільним списком, а тут видно лише його частину. Оберіть «Усі».",
    // TASK-435 — one screen, three kinds of row. The tabs write `?kind=`.
    colKind: "Вид",
    kindLegal: "Юридична",
    kindInfo: "Довідкова",
    kindHub: "Хаб",
    tabsAria: "Фільтр за видом сторінки",
    tabAll: "Усі",
    tabLegal: "Юридичні",
    tabInfo: "Довідкові",
    tabHub: "Хаби",
    emptyKind: "Сторінок цього виду ще немає.",
    // TASK-566 — a slug is unique within its kind; name the tab that holds the owner.
    toastSlugTaken: (kindLabel: string) =>
      `Сторінка з такою адресою вже є серед сторінок виду «${kindLabel}». ` +
      "Змініть slug або відредагуйте наявну сторінку.",
    // TASK-565 — the storefront /info renders these rows inline by their exact
    // slug; renaming or unpublishing one changes /info.
    inlinedOnInfo: "вбудована в /info",
    inlinedOnInfoHint:
      "Текст цієї сторінки показується прямо на сторінці /info вітрини. Не змінюйте slug і не знімайте з публікації — інакше відповідний блок /info зникне або покаже запасний текст.",
    // TASK-562 — status filter (`?status=`), local like the kind tabs, so it
    // locks reordering for the same reason.
    filterStatus: "Фільтр за статусом",
    filterStatusAll: "Усі статуси",
    statusLockedHint:
      "Поки увімкнено фільтр за статусом, порядок змінювати не можна: сторінки впорядковані одним спільним списком, а тут видно лише його частину. Зніміть фільтр.",
  },

  pageForm: {
    title: "Заголовок",
    slug: "Slug",
    slugPlaceholder: "Залиште порожнім для авто-генерації із заголовка",
    slugPreview: (slug: string) => `Буде згенеровано: ${slug}`,
    content: "Вміст",
    contentPlaceholder: "Почніть писати вміст сторінки…",
    excerpt: "Короткий опис",
    excerptPlaceholder: "Короткий підсумок (необов'язково)",
    metaTitle: "SEO заголовок",
    metaDescription: "SEO опис",
    status: "Статус публікації",
    statusDraft: "Чернетка",
    statusScheduled: "Заплановано",
    statusPublished: "Опубліковано",
    scheduledAt: "Дата публікації",
    scheduledAtHint:
      "Сторінка автоматично опублікується у вказаний час (для статусу «Заплановано»).",
    submit: "Зберегти сторінку",
    errors: {
      titleRequired: "Вкажіть заголовок",
      titleMax: "Заголовок має містити не більше 255 символів",
      contentRequired: "Додайте вміст сторінки",
      slugMax: "Slug має містити не більше 255 символів",
      excerptMax: "Короткий опис має містити не більше 500 символів",
      scheduledAtRequired: "Вкажіть дату публікації для запланованої сторінки",
      // TASK-435 — a hub row whose slug names no hub renders nowhere.
      hubSlugRequired: "Оберіть розділ, для якого задаються мета-теги",
    },
    // TASK-435 — page kind: what this row is and where it will live.
    kind: "Вид сторінки",
    kindLegal: "Юридична — адреса /legal/…",
    kindInfo: "Довідкова — адреса /info/…",
    kindHub: "Хаб — мета-теги наявного розділу",
    kindHint:
      "Юридична — документ у розділі «Правова інформація». Довідкова — сторінка в розділі «Інформація та підтримка». " +
      "Хаб — не окрема сторінка, а заголовок і опис для розділу, який на сайті вже є.",
    hubSlug: "Розділ сайту",
    hubSlugPlaceholder: "Оберіть розділ…",
    hubSlugHint:
      "Для хаба адресу не вигадують: оберіть один із наявних розділів сайту. " +
      "Сторінка з іншою адресою просто ніде не показалася б.",
    hubContentHint:
      "На сайті цей текст не показується — у хаба немає власної сторінки. Опишіть тут, за що відповідає розділ, щоб наступному редактору було зрозуміло.",
  },

  // --- Blog CMS (TASK-172) ----------------------------------------------------
  blogPosts: {
    metaTitle: "Блог — Адмін",
    metaTitleNew: "Створення статті — Адмін",
    metaTitleEdit: "Редагування статті — Адмін",
    heading: "Статті блогу",
    add: "Додати статтю",
    manageCategories: "Категорії",
    loadError: "Не вдалося завантажити статті. Спробуйте ще раз.",
    empty: "Статей ще немає. Створіть свою першу статтю.",
    // TASK-357: the table used to ask for `limit: 100` and show no page
    // controls — article 101 simply did not exist for the operator.
    searchPlaceholder: "Пошук за заголовком або описом…",
    searchAria: "Пошук статей",
    emptyMatch: (q: string) => `Немає статей за запитом «${q}».`,
    colTitle: "Заголовок",
    colCategory: "Категорія",
    colStatus: "Статус",
    colFeatured: "Головна",
    featuredYes: "Так",
    // TASK-436 — порожня клітинка означає звичайну статтю; бейдж зʼявляється
    // лише коли стаття прибрана зі списків, бо саме це стан, якого не видно
    // ніде інде (статус у неї лишається «Опубліковано»).
    colListed: "У списках",
    unlistedBadge: "Не в списках",
    statusPublished: "Опубліковано",
    statusScheduled: "Заплановано",
    // TASK-430: «Заплановано» alone left the operator to open the post to find out
    // WHEN — and the date is the whole reason the row is not a draft.
    statusScheduledOn: (date: string) => `Заплановано на ${date}`,
    statusDraft: "Чернетка",
    publish: "Опублікувати",
    unpublish: "Зняти з публікації",
    // TASK-285: the published variant reminds the admin the URL may still be
    // indexed by Google and deleting it leaves a 404 with NO redirect.
    deleteConfirm: (title: string, isPublished: boolean) =>
      `Видалити статтю «${title}»? Цю дію не можна скасувати.` +
      (isPublished
        ? " Стаття опублікована і може бути в пошуковому індексі Google — після видалення адреса поверне помилку 404 без переадресації."
        : ""),
    // TASK-285: slug-rename guard on a publicly visible post.
    slugChangeConfirm: (oldSlug: string, newSlug: string) =>
      `Ви змінюєте адресу опублікованої статті з «${oldSlug}» на «${newSlug}». ` +
      `Стара адреса перестане працювати і випаде з результатів пошуку Google — ` +
      `але ми автоматично налаштуємо переадресацію зі старої адреси на нову. Продовжити?`,
    back: "← Назад до статей",
    createHeading: "Створення статті",
    editHeading: "Редагування статті",
    createSubmit: "Створити статтю",
    loadOneError: "Не вдалося завантажити статтю. Спробуйте ще раз.",
    toastCreated: "Статтю створено",
    toastCreateFailed: "Не вдалося створити статтю",
    toastUpdated: "Статтю оновлено",
    toastUpdateFailed: "Не вдалося оновити статтю",
    toastPublished: "Статтю опубліковано",
    toastUnpublished: "Статтю знято з публікації",
    toastStatusFailed: "Не вдалося змінити статус статті",
    toastDeleted: "Статтю видалено",
    toastDeleteFailed: "Не вдалося видалити статтю",
  },

  blogPostForm: {
    title: "Заголовок",
    slug: "Slug",
    slugPlaceholder: "Залиште порожнім для авто-генерації із заголовка",
    slugPreview: (slug: string) => `Буде згенеровано: ${slug}`,
    category: "Категорія",
    categoryPlaceholder: "Оберіть категорію",
    excerpt: "Короткий опис",
    excerptPlaceholder: "Короткий підсумок для карток та SEO",
    content: "Вміст",
    contentPlaceholder: "Почніть писати текст статті…",
    author: "Автор",
    coverImageUrl: "Обкладинка (URL)",
    coverImageUrlPlaceholder: "https://…",
    readingMinutes: "Час читання (хв)",
    featured: "Головна стаття тижня",
    status: "Статус публікації",
    statusDraft: "Чернетка",
    statusScheduled: "Заплановано",
    statusPublished: "Опубліковано",
    scheduledAt: "Дата публікації",
    scheduledAtHint:
      "Стаття автоматично опублікується у вказаний час (для статусу «Заплановано»).",
    submit: "Зберегти статтю",
    // TASK-436 — обидва перемикачі керують тим, ДЕ стаття зʼявляється, тож
    // підказка мусить називати наслідок, а не повторювати назву поля.
    featuredHint:
      "Стаття показується великим блоком угорі сторінки «Блог». Такою може бути лише одна — увімкнувши тут, зніміть у попередньої.",
    listed: "Показувати у списках",
    listedHint:
      "Вимкніть, щоб прибрати статтю зі списку блогу, з підказок пошуку і з блоку «Читайте також». Вона лишається опублікованою: доступна за прямим посиланням і присутня в карті сайту для пошукових систем.",
    errors: {
      titleRequired: "Вкажіть заголовок",
      titleMax: "Заголовок має містити не більше 255 символів",
      slugMax: "Slug має містити не більше 255 символів",
      excerptRequired: "Додайте короткий опис",
      excerptMax: "Короткий опис має містити не більше 500 символів",
      contentRequired: "Додайте текст статті",
      categoryRequired: "Оберіть категорію",
      authorRequired: "Вкажіть автора",
      authorMax: "Імʼя автора має містити не більше 120 символів",
      coverUrl: "Вкажіть коректний URL обкладинки",
      readingInt: "Час читання має бути додатним цілим числом",
      scheduledAtRequired: "Вкажіть дату публікації для запланованої статті",
    },
    // TASK-424: the cover accepts a FILE as well as a link.
    coverUpload: {
      alt: "Обкладинка статті",
      empty: "Файл ще не завантажено.",
      upload: "Завантажити файл",
      replace: "Замінити файл",
      remove: "Прибрати",
      removeTitle: "Прибрати обкладинку?",
      removeDescription:
        "Поле очиститься, і після збереження стаття буде без обкладинки. Сам файл залишиться у сховищі.",
      hint: "JPEG, PNG, WebP або GIF — до 20 МБ; великі зменшимо самі. Або вставте посилання в поле нижче — зображення з іншого сайту вітрина покаже, лише якщо цей сайт додано до дозволених (посібник, розділ 13).",
      toastUploaded: "Обкладинку завантажено — не забудьте зберегти статтю",
      errorTooLarge:
        "Файл завеликий — максимум 20 МБ. Стисніть зображення і спробуйте ще раз.",
      errorUnsupportedType:
        "Непідтримуваний формат. Дозволені JPEG, PNG, WebP і GIF.",
      errorGeneric: "Не вдалося завантажити файл. Спробуйте ще раз.",
    },
    // TASK-437 — у статті досі не було жодного керованого мета-тега: у видачу
    // йшли заголовок і короткий опис із картки. Підказки кажуть саме це, бо
    // інакше оператор не зрозуміє, навіщо заповнювати поле, яке «і так є».
    metaTitle: "SEO-заголовок (meta title)",
    metaTitlePlaceholder: "Залиште порожнім, щоб використати заголовок статті",
    metaTitleHint:
      "Заголовок статті у результатах пошуку. Порожнє поле — береться заголовок статті (обрізаний до ~60 символів і з назвою магазину).",
    metaDescription: "SEO-опис (meta description)",
    metaDescriptionPlaceholder: "Опис статті для результатів пошуку",
    metaDescriptionHint:
      "Текст під заголовком у Google. Порожнє поле — береться короткий опис, але він написаний для картки на сторінці блогу; окремий текст на ~155 символів зазвичай читається краще.",
  },

  // --- Rich-text "edit / preview" tab pair (page + blog forms, TASK-266) ------
  contentPreview: {
    tabEdit: "Редагування",
    tabPreview: "Перегляд",
    emptyContent: "Почніть писати, щоб побачити попередній перегляд…",
    // TASK-467 тримав тут групу `unsupported*` — банер «редактор показує не всю
    // розмітку» плюс кнопку «Все одно редагувати». TASK-547 прибрав і банер, і
    // ці рядки: схема редактора тепер збігається з серверним allow-list тег у
    // тег (зображення вміє ImageNode), тож попереджати більше нема про що.
    // Якщо колись доведеться повертати — дивись коментар над списком розширень
    // у `shared/ui/rich-text-editor/rich-text-editor.tsx`.
  },

  blogCategories: {
    metaTitle: "Категорії блогу — Адмін",
    metaTitleNew: "Створення категорії — Адмін",
    metaTitleEdit: "Редагування категорії — Адмін",
    heading: "Категорії блогу",
    add: "Додати категорію",
    backToPosts: "← Назад до статей",
    loadError: "Не вдалося завантажити категорії. Спробуйте ще раз.",
    empty: "Категорій ще немає. Створіть першу категорію.",
    colName: "Назва",
    colSlug: "Slug",
    // TASK-295: no `colSort` — the order column is gone; order IS the row order.
    gridLabel: "Категорії блогу — порядок",
    deleteConfirm: (name: string) =>
      `Видалити категорію «${name}»? Цю дію не можна скасувати.`,
    back: "← Назад до категорій",
    createHeading: "Створення категорії",
    editHeading: "Редагування категорії",
    createSubmit: "Створити категорію",
    loadOneError: "Не вдалося завантажити категорію. Спробуйте ще раз.",
    toastCreated: "Категорію створено",
    toastCreateFailed: "Не вдалося створити категорію",
    toastUpdated: "Категорію оновлено",
    toastUpdateFailed: "Не вдалося оновити категорію",
    toastDeleted: "Категорію видалено",
    toastDeleteFailed:
      "Не вдалося видалити категорію (можливо, у ній ще є статті)",
  },

  blogCategoryForm: {
    name: "Назва",
    slug: "Slug",
    slugPlaceholder: "Залиште порожнім для авто-генерації із назви",
    slugPreview: (slug: string) => `Буде згенеровано: ${slug}`,
    // TASK-295: no `sortOrder` label — the order field is gone from this form
    // (category order lives in the sortable categories grid).
    submit: "Зберегти категорію",
    errors: {
      nameRequired: "Вкажіть назву",
      nameMax: "Назва має містити не більше 120 символів",
      slugMax: "Slug має містити не більше 255 символів",
    },
  },

  // --- Homepage banners (TASK-186) --------------------------------------------
  banners: {
    metaTitle: "Банери — Адмін",
    metaTitleNew: "Створення банера — Адмін",
    metaTitleEdit: "Редагування банера — Адмін",
    heading: "Банери головної сторінки",
    add: "Додати банер",
    loadError: "Не вдалося завантажити банери. Спробуйте ще раз.",
    empty: "Банерів ще немає. Створіть свій перший банер.",
    colTitle: "Заголовок",
    colStatus: "Статус",
    // TASK-295: no `colSort` — the order column is gone; order IS the row order.
    placements: {
      HERO_SLIDE: "Головний слайдер",
      PROMO_TILE: "Промо-плитки",
      PROMO_BANNER: "Промо-банер",
      ANNOUNCEMENT_BAR: "Смуга оголошень",
    },
    /** Each placement section is its own grid — and says so. */
    gridLabel: (placement: string) => `Банери: ${placement} — порядок`,
    publish: "Опублікувати",
    unpublish: "Зняти з публікації",
    back: "← Банери",
    createHeading: "Новий банер",
    editHeading: "Редагування банера",
    createSubmit: "Створити банер",
    loadOneError: "Не вдалося завантажити банер. Спробуйте ще раз.",
    toastCreated: "Банер створено",
    toastCreateFailed: "Не вдалося створити банер",
    toastUpdated: "Банер оновлено",
    toastUpdateFailed: "Не вдалося оновити банер",
    toastPublished: "Банер опубліковано",
    toastUnpublished: "Банер знято з публікації",
    toastStatusFailed: "Не вдалося змінити статус банера",
    toastDeleted: "Банер видалено",
    toastDeleteFailed: "Не вдалося видалити банер",

    // Wave 198 (TASK-1073, BannersProposal БН1–БН4). The display state is
    // derived from `status` + the publication window, never stored:
    // «Показується» = PUBLISHED inside its window, «Завершено» = PUBLISHED past
    // its end (until the scheduler takes it down), «Заплановано» = SCHEDULED.
    quickViews: {
      all: "Усі",
      live: "Показуються",
      scheduled: "Заплановані",
      ended: "Завершені",
      draft: "Чернетки",
    },
    displayStates: {
      live: "Показується",
      scheduled: "Заплановано",
      ended: "Завершено",
      draft: "Чернетка",
    },
    searchPlaceholder: "Заголовок або текст банера…",
    viewLockedHint:
      "Поки вибрано вид, порядок змінювати не можна: частину банерів сховано. Поверніться до «Усі».",
    // Where each placement sits on the storefront — under the section heading.
    placementWhere: {
      ANNOUNCEMENT_BAR:
        "Тонка смуга над шапкою на всіх сторінках. Тільки заголовок і посилання.",
      HERO_SLIDE: "Перший екран головної, слайди по черзі у цьому порядку.",
      PROMO_TILE: "Ряд із трьох плиток під слайдером.",
      PROMO_BANNER: "Широка смуга посередині головної.",
    },
    addHere: "Додати сюди",
    addHereAria: (placement: string) => `Додати банер у «${placement}»`,
    sectionEmpty: "Тут ще немає банерів.",
    colWindow: "Вікно показу",
    thumbEmpty: "без фото",
    ctaLine: (label: string) => `Кнопка «${label}» →`,
    linkLine: "Посилання →",
    windowUntil: (date: string) => `до ${date}`,
    windowFrom: (date: string) => `з ${date}`,
    windowEndless: "без кінця",
    windowDaysLeft: (days: number) =>
      `залишилось ${countLabel(days, ["день", "дні", "днів"])}`,
    windowDaysUntil: (days: number) =>
      `через ${countLabel(days, ["день", "дні", "днів"])}`,
    duplicate: "Дублювати",
    duplicateTitle: (title: string) => `${title} (копія)`,
    toastDuplicated: "Копію збережено як чернетку — вона в кінці свого місця",
    toastDuplicateFailed: "Не вдалося продублювати банер",
    moveGroup: "Перенести в",
    moveTo: (placement: string) => `${placement} — в кінець`,
    toastMoved: (placement: string) =>
      `Банер перенесено в «${placement}» — в кінець списку`,
    toastMoveFailed: "Не вдалося перенести банер",
    deleteAction: "Видалити…",
    deleteTitle: (title: string) => `Видалити банер «${title}»?`,
    deleteDescription:
      "Цю дію не можна скасувати. Якщо банер ще знадобиться — краще «Зняти з публікації».",
    deleteConfirmLabel: "Видалити банер",
  },

  bannerForm: {
    placement: "Де показувати",
    placements: {
      HERO_SLIDE: "Головний слайдер",
      PROMO_TILE: "Промо-плитки",
      PROMO_BANNER: "Промо-банер",
      ANNOUNCEMENT_BAR: "Смуга оголошень",
    },
    title: "Заголовок",
    subtitle: "Підзаголовок",
    subtitlePlaceholder: "Додатковий текст (необов'язково)",
    imageUrl: "Або посилання на зображення",
    imageUrlPlaceholder: "https://…",
    ctaLabel: "Текст кнопки",
    ctaHref: "Куди веде кнопка",
    theme: "Оформлення",
    themePlaceholder: "accent, default…",
    // TASK-295: no `sortOrder` label — the order field is gone from this form
    // (banner order lives in the sortable grid of its placement).
    status: "Показ",
    statusDraft: "Чернетка",
    statusScheduled: "Заплановано",
    statusPublished: "Опубліковано",
    scheduledAt: "Показувати з",
    scheduledAtHint:
      "Банер автоматично опублікується у вказаний час (для статусу «Заплановано»).",
    submit: "Зберегти банер",
    errors: {
      titleRequired: "Вкажіть заголовок",
      titleMax: "Заголовок має містити не більше 255 символів",
      subtitleMax: "Підзаголовок має містити не більше 500 символів",
      imageUrlMax: "URL зображення має містити не більше 2048 символів",
      ctaLabelMax: "Текст кнопки має містити не більше 100 символів",
      ctaHrefMax: "Посилання кнопки має містити не більше 2048 символів",
      themeMax: "Тема має містити не більше 50 символів",
      scheduledAtRequired: "Вкажіть дату публікації для запланованого банера",
      // TASK-429: an end before the start is not a window.
      scheduledUntilBeforeStart:
        "Дата зняття має бути пізніше за дату публікації",
      // Wave 198 (БН8): a button with words and nowhere to go.
      ctaHrefRequired: "Є текст кнопки — оберіть, куди вона веде",
    },
    // TASK-424: the banner image accepts a FILE as well as a link.
    imageUpload: {
      alt: "Зображення банера",
      empty: "Файл ще не завантажено.",
      upload: "Завантажити файл",
      replace: "Замінити файл",
      remove: "Прибрати",
      removeTitle: "Прибрати зображення банера?",
      removeDescription:
        "Поле очиститься, і після збереження банер буде без зображення. Сам файл залишиться у сховищі.",
      hint: "JPEG, PNG, WebP або GIF — до 20 МБ; великі зменшимо самі. Або вставте посилання в поле нижче — зображення з іншого сайту вітрина покаже, лише якщо цей сайт додано до дозволених (посібник, розділ 13).",
      toastUploaded: "Зображення завантажено — не забудьте зберегти банер",
      errorTooLarge:
        "Файл завеликий — максимум 20 МБ. Стисніть зображення і спробуйте ще раз.",
      errorUnsupportedType:
        "Непідтримуваний формат. Дозволені JPEG, PNG, WebP і GIF.",
      errorGeneric: "Не вдалося завантажити файл. Спробуйте ще раз.",
    },
    // TASK-429: the END of the publication window — the instant the scheduler
    // takes the banner down by itself, so a promo that must vanish on the 1st
    // needs nobody awake at midnight to remove it.
    scheduledUntil: "Зняти після",
    scheduledUntilHint:
      "Порожнє «Зняти після» — банер лишається, доки ви не знімете його вручну.",

    // Wave 198 (TASK-1073, BannersProposal БН5–БН9).
    sectionText: "Текст",
    sectionImage: "Зображення",
    sectionButton: "Кнопка",
    ctaLabelPlaceholder: "Наприклад, «Детальніше»",
    // «28 / 60»: the length the slot shows comfortably, not the API limit
    // (255 / 500) — a longer text still saves, the counter only turns amber.
    counter: (count: number, max: number) => `${count} / ${max}`,
    counterOver: "Довше, ніж зручно вміщається на сайті",
    // The proportion hint under the picture, per placement.
    imageHints: {
      HERO_SLIDE:
        "Для слайдера — широке, ≈ 2,2:1, від 1936×880 px. JPEG, PNG, WebP або GIF — до 20 МБ.",
      PROMO_TILE:
        "Для плитки — ≈ 1/3 ширини ряду, висота за текстом; від 800×600 px. JPEG, PNG, WebP або GIF — до 20 МБ.",
      PROMO_BANNER:
        "Для промо-банера — на всю ширину, ≈ 1280 px; висота за текстом. JPEG, PNG, WebP або GIF — до 20 МБ.",
      ANNOUNCEMENT_BAR:
        "Смуга оголошень зображення не показує — поле можна лишити порожнім.",
    },
    themes: {
      auto: "Автоматично",
      primary: "Фіолетова",
      sale: "Червона «розпродаж»",
      success: "Зелена",
    },
    themeCustom: "Своє…",
    themeCustomLabel: "Свій ключ оформлення",
    themeHint: "«Автоматично» — кольори чергуються за порядком, як зараз.",
    themeTilesOnly: "Колір зараз враховують лише промо-плитки.",
    errorSummary: (fields: readonly string[]) => {
      const quoted = fields.map((field) => `«${field}»`);
      const list =
        quoted.length > 1
          ? `${quoted.slice(0, -1).join(", ")} і ${quoted[quoted.length - 1]}`
          : (quoted[0] ?? "");
      return `Перевірте ${countLabel(fields.length, ["поле", "поля", "полів"])}: ${list}. Банер не збережено.`;
    },
    barNew: "Новий банер ще не збережений",
    barErrors: (count: number) =>
      `Не збережено: ${countLabel(count, ["поле", "поля", "полів"])} з помилками`,
  },

  // --- Live banner preview in the banner form (TASK-265) ----------------------
  bannerPreview: {
    heading: "Попередній перегляд",
    tabForm: "Форма",
    tabPreview: "Прев'ю",
    viewportDesktop: "Десктоп",
    viewportMobile: "Мобільний",
    emptyTitle: "Заголовок банера…",
    announcementBarNote:
      "Для «Смуга оголошень» використовуються лише заголовок і посилання кнопки.",
    // TASK-429: the preview is a SCALE MODEL of the real slot, so it has to say
    // which shape it is modelling — and, for the two placements that genuinely
    // have no fixed proportions, admit that instead of inventing one.
    scaleNote: "Прев'ю зменшене: пропорції відповідають сайту, розмір — ні.",
    shape: {
      HERO_SLIDE:
        "Пропорції як на головній: ≈968×440 (2,2:1). На мобільному — на всю ширину, висота 420 px.",
      PROMO_TILE:
        "На сайті три плитки в рядку — кожна ≈1/3 ширини (сірі рамки поруч). Висота не фіксована: залежить від обсягу тексту.",
      PROMO_BANNER:
        "На всю ширину контенту (≈1280 px). Висота не фіксована: залежить від обсягу тексту.",
      ANNOUNCEMENT_BAR: "Смуга фіксованої висоти 40 px на всю ширину сторінки.",
    },
  },

  // --- Brands (TASK-189) ------------------------------------------------------
  brands: {
    metaTitle: "Бренди — Адмін",
    metaTitleNew: "Створення бренду — Адмін",
    metaTitleEdit: "Редагування бренду — Адмін",
    heading: "Бренди",
    add: "Додати бренд",
    searchPlaceholder: "Пошук за назвою…",
    searchAria: "Пошук брендів за назвою",
    filterStatusAria: "Фільтр за статусом",
    allStatuses: "Усі статуси",
    statusActive: "Активний",
    statusInactive: "Прихований",
    colName: "Назва",
    colSlug: "Slug",
    colStatus: "Статус",
    activate: "Активувати",
    deactivate: "Приховати",
    loadError: "Не вдалося завантажити бренди. Спробуйте ще раз.",
    empty: "Брендів ще немає. Створіть свій перший бренд.",
    back: "← Назад до брендів",
    createHeading: "Створення бренду",
    editHeading: "Редагування бренду",
    createSubmit: "Створити бренд",
    loadOneError: "Не вдалося завантажити бренд. Спробуйте ще раз.",
    toastCreated: "Бренд створено",
    toastCreateFailed: "Не вдалося створити бренд",
    toastUpdated: "Бренд оновлено",
    toastUpdateFailed: "Не вдалося оновити бренд",
    toastActivated: "Бренд активовано",
    toastDeactivated: "Бренд приховано",
    toastStatusFailed: "Не вдалося змінити статус бренду",
    // TASK-831: the brand's uuid, shown on its edit page so an old
    // `?brandId=<uuid>` link can be checked without database access.
    idLabel: "ID бренду",
    idHint:
      "Внутрішній ідентифікатор. Знадобиться, щоб перевірити старе посилання виду ?brandId=… або назвати бренд розробнику.",
    copyId: "Скопіювати ID",
    copyIdDone: "Скопійовано",
    copyIdFailed: "Не вдалося скопіювати — виділіть ID вручну",
    copyIdAria: "Скопіювати ID бренду",
    // TASK-840 (AD-CAT-12): the list showed names only — no way to tell a brand
    // in use from an empty one without opening the catalogue.
    colLogo: "Лого",
    logoAlt: (name: string) => `Логотип ${name}`,
    noLogo: "без лого",
    colProducts: "Товарів",
    colProductsHint:
      "Усі товари бренду, крім видалених, — і видимі, і приховані",
  },

  brandForm: {
    name: "Назва",
    slug: "Slug",
    slugPlaceholder: "Залиште порожнім для автогенерації",
    slugPreview: (slug: string) => `Буде згенеровано: ${slug}`,
    logo: "Логотип (URL)",
    logoPlaceholder: "https://…",
    active: "Активний (показувати у магазині)",
    submit: "Зберегти бренд",
    errors: {
      nameRequired: "Вкажіть назву бренду",
      nameMax: "Назва має містити не більше 255 символів",
      slugMax: "Slug має містити не більше 255 символів",
      logoUrl: "Вкажіть коректний URL логотипа",
    },
    // TASK-424: the brand logo accepts a FILE as well as a link.
    logoUpload: {
      alt: "Логотип бренду",
      empty: "Файл ще не завантажено.",
      upload: "Завантажити файл",
      replace: "Замінити файл",
      remove: "Прибрати",
      removeTitle: "Прибрати логотип бренду?",
      removeDescription:
        "Поле очиститься, і після збереження бренд буде без логотипа. Сам файл залишиться у сховищі.",
      hint: "JPEG, PNG, WebP або GIF — до 20 МБ; великі зменшимо самі. Найкраще виглядає логотип на прозорому фоні. Або вставте посилання в поле нижче.",
      toastUploaded: "Логотип завантажено — не забудьте зберегти бренд",
      errorTooLarge:
        "Файл завеликий — максимум 20 МБ. Стисніть зображення і спробуйте ще раз.",
      errorUnsupportedType:
        "Непідтримуваний формат. Дозволені JPEG, PNG, WebP і GIF.",
      errorGeneric: "Не вдалося завантажити файл. Спробуйте ще раз.",
    },
  },

  // --- Add-on services / protection plans (TASK-174) ---------------------------
  addonServices: {
    metaTitle: "Додаткові послуги — Адмін",
    metaTitleNew: "Створення послуги — Адмін",
    metaTitleEdit: "Редагування послуги — Адмін",
    heading: "Додаткові послуги",
    intro:
      "Гарантії, страхування, налаштування — послуги, які покупець може додати до товару в кошику. " +
      "Де саме вони пропонуються, задається шаблоном на КАТЕГОРІЇ (у формі категорії) і винятками на " +
      "ТОВАРІ (у формі товару).",
    add: "Додати послугу",
    searchPlaceholder: "Пошук за назвою…",
    searchAria: "Пошук послуг за назвою",
    filterStatusAria: "Фільтр за статусом",
    allStatuses: "Усі статуси",
    statusActive: "Активна",
    statusInactive: "Прихована",
    colName: "Назва",
    colPrice: "Ціна",
    colStatus: "Статус",
    activate: "Активувати",
    deactivate: "Приховати",
    loadError: "Не вдалося завантажити послуги. Спробуйте ще раз.",
    empty: "Послуг ще немає. Створіть першу послугу.",
    back: "← Назад до послуг",
    createHeading: "Створення послуги",
    editHeading: "Редагування послуги",
    createSubmit: "Створити послугу",
    loadOneError: "Не вдалося завантажити послугу. Спробуйте ще раз.",
    toastCreated: "Послугу створено",
    toastCreateFailed: "Не вдалося створити послугу",
    toastUpdated: "Послугу оновлено",
    toastUpdateFailed: "Не вдалося оновити послугу",
    toastActivated: "Послугу активовано",
    toastDeactivated: "Послугу приховано",
    toastStatusFailed: "Не вдалося змінити статус послуги",
  },

  addonServiceForm: {
    name: "Назва",
    description: "Опис для покупця",
    descriptionPlaceholder: "Що саме входить у послугу…",
    price: "Ціна, ₴",
    priceHint: "Може бути 0 — послуга буде безкоштовною.",
    active: "Активна (пропонувати у кошику)",
    activeHint:
      "Якщо приховати, послуга миттєво зникає з усіх категорій і товарів. " +
      "Уже оформлені замовлення не змінюються.",
    submit: "Зберегти послугу",
    errors: {
      nameRequired: "Вкажіть назву послуги",
      nameMax: "Назва має містити не більше 255 символів",
      descriptionMax: "Опис має містити не більше 2000 символів",
      priceRequired: "Вкажіть ціну",
      priceNumber: "Ціна має бути числом",
      priceNonNegative: "Ціна не може бути відʼємною",
    },
  },

  // --- Site contact settings (TASK-154) ---------------------------------------
  siteContact: {
    metaTitle: "Контакти — Адмін",
    heading: "Контакти",
    subheading:
      "Показуються у футері, на сторінці «Контакти» і в листах покупцям.",
    loadError: "Не вдалося завантажити контакти. Спробуйте ще раз.",
    toastUpdated: "Контакти оновлено",
    toastUpdateFailed: "Не вдалося оновити контакти",
  },

  siteContactForm: {
    email: "Пошта підтримки",
    emailPlaceholder: "support@example.ua",
    phone: "Телефон",
    phonePlaceholder: "+380 44 000 0000",
    workingHours: "Години роботи",
    workingHoursPlaceholder: "Пн–Нд: 9:00 – 20:00",
    workingHoursClosed: "Вихідний",
    workingHoursOpenAria: (day: string) => `${day} — час відкриття`,
    workingHoursCloseAria: (day: string) => `${day} — час закриття`,
    workingHoursPreviewInvalid:
      "виправте помилки в розкладі, щоб побачити результат",
    workingHoursAllClosedWarning:
      "Усі дні позначено як вихідні — відвідувачі побачать, що магазин не працює жодного дня.",
    workingHoursRawNotice:
      "Поточне значення збережено як довільний текст. Відредагуйте його нижче або перейдіть на структурований редактор — він замінить текст на розклад за днями.",
    workingHoursSwitchToStructured: "Перейти на структурований редактор",
    viberLink: "Viber",
    viberLinkPlaceholder: "https://viber.me/…",
    telegramLink: "Telegram",
    telegramLinkPlaceholder: "https://t.me/…",
    instagramLink: "Instagram",
    instagramLinkPlaceholder: "https://instagram.com/…",
    submit: "Зберегти",
    errors: {
      emailInvalid: "Вкажіть коректну електронну пошту",
      urlInvalid: "Вкажіть коректний URL (https://…)",
      workingHoursTimesRequired: "Вкажіть час відкриття та закриття",
      workingHoursCloseAfterOpen:
        "Час закриття має бути пізніше часу відкриття",
      // TASK-1053: the two ways a buyer reaches the shop are required (Н1 «*»).
      emailRequired: "Вкажіть пошту підтримки",
      phoneRequired: "Вкажіть телефон",
    },
    // Хвиля 198 (TASK-1053, Н1).
    sectionContact: "Як з вами зв'язатися",
    sectionMessengers: "Месенджери й соцмережі",
    phoneHint: "Формат +380 XX XXX XX XX — так він і з'явиться на сайті",
    workingHoursOpen: "Працюємо",
    // The switch is ON for a working day; its name says what ON means.
    workingHoursOpenDayAria: (day: string) => `${day} — працюємо`,
    copyMonday: "Як у понеділок — на всі будні",
    previewHeading: "Так побачать на сайті",
    previewTitle: "Контакти",
    previewEmptyMessengers: "Порожні месенджери на сайті не показуються.",
    // «Незбережені зміни: …» in the sticky bar.
    dirtyContact: "пошта й телефон",
    dirtyHours: "години роботи",
    dirtyMessengers: "месенджери",
  },

  // Search-index maintenance (TASK-377). Written for a non-technical operator:
  // the word «індекс» never appears without an explanation of what it costs them
  // when it is stale.
  searchIndex: {
    metaTitle: "Пошук — Адмін",
    heading: "Пошук на сайті",
    subheading:
      "Швидкий покажчик товарів і статей блогу. Зазвичай оновлюється сам.",
    whenHeading: "Коли це потрібно",
    whenReasons: [
      "Покупці не знаходять товар, який точно є в каталозі.",
      "Щойно завантажили каталог постачальника або великий список товарів.",
      "Магазин перенесли на інший сервер або базу відновили з резервної копії.",
      "Опублікована стаття блогу не знаходиться пошуком.",
    ],
    safetyNote:
      "Перебудова безпечна: поки вона триває, пошук продовжує працювати на старих даних. Для великого каталогу це може зайняти до хвилини.",
    button: "Перебудувати покажчик",
    buttonPending: "Перебудовуємо…",
    // TASK-525 — the rebuild covers the blog too, and says so: an empty blog
    // index must be visible here rather than hidden behind a product count.
    toastDone: (products: number, posts: number) =>
      `Покажчик оновлено: товарів — ${products}, статей — ${posts}`,
    toastFailed: "Не вдалося перебудувати покажчик. Спробуйте ще раз.",
    // TASK-1053 (Н3): the card that holds the rebuild. The mockup's counts and
    // «оновлено …» need an index-status endpoint the API does not have yet.
    indexHeading: "Покажчик",
  },

  seoSettings: {
    metaTitle: "SEO — Адмін",
    heading: "SEO",
    subheading: "Як магазин виглядає в Google, соцмережах і для AI-асистентів.",
    loadError: "Не вдалося завантажити SEO-налаштування. Спробуйте ще раз.",
    toastUpdated: "SEO-налаштування оновлено",
    toastUpdateFailed: "Не вдалося оновити SEO-налаштування",
    // Хвиля 198 (TASK-1053, Н2): the section nav and what its dots mean.
    navAria: "Розділи SEO",
    navOk: "заповнено",
    navNeedsAttention: "варто перевірити",
  },

  seoSettingsForm: {
    // Read under the section «За замовчуванням» (TASK-1053), hence the short name.
    defaultMetaTitle: "Заголовок сайту",
    // Placeholders are neutral examples on purpose (TASK-433): they used to
    // spell out one particular shop's name and domain, which read like a
    // pre-filled value rather than a hint — and the shop in question was not
    // this one. Where a real value is genuinely more useful than a shape hint
    // (the OG-image path), the placeholder is a function of the storefront host
    // instead, so the parsing stays out of this constants module.
    defaultMetaTitlePlaceholder: "Ваш магазин — аксесуари для смартфонів",
    defaultMetaTitleHint:
      "Заголовок у вкладці браузера та в результатах пошуку для сторінок, у яких немає ні власного SEO-заголовка, ні назви (наприклад, головна). Сторінка з назвою завжди бере заголовок з назви за шаблоном нижче.",
    defaultMetaDescription: "Опис сайту",
    defaultMetaDescriptionPlaceholder:
      "Мультибрендовий магазин аксесуарів та Apple-техніки. Доставка по Україні.",
    defaultMetaDescriptionHint:
      "Короткий опис магазину (1–2 речення), який Google показує під заголовком у результатах пошуку — для сторінок, у яких немає ні власного SEO-опису, ні тексту, з якого його можна взяти.",
    titleTemplate: "Шаблон заголовка сторінки",
    titleTemplatePlaceholder: "%s | Ваш магазин",
    titleTemplateHint:
      "Шаблон заголовка сторінки. %s буде замінено на назву конкретної сторінки. Залиште порожнім — і ми додамо назву магазину після заголовка автоматично.",
    defaultOgImage: "Зображення для соцмереж (OG-картинка)",
    /** Takes the storefront host (`STOREFRONT_HOST`) so the example path sits on the store's own domain. */
    defaultOgImagePlaceholder: (host: string) => `https://${host}/og-image.jpg`,
    defaultOgImageHint:
      "Картинка для попереднього перегляду, коли посилання на магазин поширюють у соцмережах чи месенджерах (Facebook, Telegram, Viber). Вкажіть повне посилання на зображення (https://…).",
    googleSiteVerification: "Код підтвердження Google Search Console",
    googleSiteVerificationPlaceholder: "AbCdEfGhIjKlMnOpQrStUvWxYz1234567890",
    googleSiteVerificationHint:
      "Вставте код підтвердження з Google Search Console — досить самого коду (значення content), але якщо вставите весь HTML-тег цілком, ми самі виріжемо з нього потрібну частину.",
    bingSiteVerification: "Код підтвердження Bing Webmaster Tools",
    bingSiteVerificationPlaceholder: "1234ABCD5678EFGH9012IJKL3456MNOP",
    bingSiteVerificationHint:
      "Необов'язково. Те саме для Bing Webmaster Tools — альтернативної до Google пошукової системи. Можна залишити порожнім.",
    llmsTxtSummary: "Опис для AI-асистентів (llms.txt)",
    llmsTxtSummaryPlaceholder:
      "Магазин аксесуарів для смартфонів та Apple-техніки в Україні…",
    llmsTxtSummaryHint:
      "Короткий опис вашого бізнесу для AI-асистентів на кшталт ChatGPT. Замінює вступний абзац у файлі /llms.txt. Залиште порожнім — використаємо стандартний опис.",
    additionalSameAsLinks: "Додаткові посилання на профілі бренду",
    additionalSameAsLinksPlaceholder:
      "https://facebook.com/ваша-сторінка\nhttps://youtube.com/@ваш-канал",
    additionalSameAsLinksHint:
      "Посилання на офіційні сторінки магазину в інших мережах (Facebook, YouTube, LinkedIn тощо) — по одному в рядку. Це показує пошуковим системам, що це офіційні профілі вашого бренду.",
    submit: "Зберегти",
    errors: {
      urlInvalid: "Вкажіть коректний URL (https://…)",
      metaTitleTooLong: "Заголовок задовгий (максимум 255 символів)",
      metaDescriptionTooLong: "Опис задовгий (максимум 500 символів)",
      titleTemplateTooLong: "Шаблон задовгий (максимум 255 символів)",
      titleTemplateNoToken:
        "Шаблон має містити рівно один символ %s (без інших знаків %)",
      llmsTxtSummaryTooLong: "Опис задовгий (максимум 2000 символів)",
      siteVerificationTooLong:
        "Код підтвердження задовгий (максимум 255 символів)",
      sameAsInvalid:
        "Кожне посилання має бути коректним URL (https://…), по одному в рядку.",
      siteNameTooLong: "Назва задовга (максимум 120 символів)",
    },
    // Store name (TASK-433) — rendered first in the form; the keys sit at the
    // end of the block only to keep concurrent waves from colliding here.
    siteName: "Назва магазину",
    /**
     * Takes the fallback brand (`dict.brand`) rather than spelling a name out:
     * that IS what the storefront shows while the field is empty, so the hint
     * stays true after a rename instead of becoming a second hardcoded name.
     */
    siteNamePlaceholder: (fallback: string) => `Наприклад: ${fallback}`,
    siteNameHint:
      "Як магазин називається для відвідувача й для Google: підставляється у заголовок вкладки браузера, у прев'ю посилання в месенджерах і соцмережах, у підпис листів і в машинну розмітку для пошукових систем. Залиште порожнім — використаємо стандартну назву.",
    // Deliberately a separate, blunt line rather than a footnote inside the
    // hint: the owner WILL change this field expecting the logo to follow.
    siteNameLogoNote:
      "Напис у самому логотипі поки змінюється в коді — якщо ви завантажили логотип-картинку, він теж лишиться без змін. Напишіть розробнику, якщо треба оновити і його.",
    // TASK-552: two SERP samples in the real tier order (own → name → default).
    // TASK-1053: they are the two positions of the preview's switch now.
    previewNamedHeading: "Сторінка з назвою",
    previewNamedNote: (name: string) =>
      `Приклад — товар «${name}» без власних SEO-полів: заголовок і опис беруться з самої сторінки, заголовок — за шаблоном. Значення за замовчуванням тут не з'являються: зміст сторінки завжди важливіший.`,
    previewUnnamedHeading: "Сторінка без змісту",
    previewUnnamedNote:
      "Приклад — сторінка без SEO-полів і без назви чи опису (наприклад, головна або загальний список). Лише тут показуються заголовок і опис за замовчуванням.",
    // Хвиля 198 (TASK-1053, Н2/Н5).
    sectionStore: "Магазин і логотип",
    sectionDefaults: "За замовчуванням",
    sectionSocial: "Соцмережі",
    sectionVerification: "Верифікація",
    sectionAi: "AI-асистенти",
    previewHeading: "Так виглядатиме в Google",
    previewSampleAria: "Приклад сторінки",
    // TASK-1175 (UI part): an empty default title is a recommendation, not a
    // validation error — saving stays allowed.
    emptyTitleWarning:
      "Заголовок сайту за замовчуванням порожній — сторінки без власного заголовка (наприклад, головна) у Google матимуть лише назву магазину.",
    emptyTitleRecommendation: "Рекомендуємо заповнити: 30–60 символів.",
    // One-line summaries of the folded sections. «задано», not «підтверджено»:
    // the panel stores the code, it cannot know whether Google accepted it.
    summaryOgSet: "OG-картинка задана",
    summaryOgUnset: "OG-картинка не задана",
    summarySameAs: (n: number) => `профілів бренду: ${n}`,
    summaryGoogleSet: "Google Search Console — код задано",
    summaryGoogleUnset: "Google Search Console не задано",
    summaryBingSet: "Bing — код задано",
    summaryBingUnset: "Bing не задано",
    summaryLlmsCustom: "опис для llms.txt — свій",
    summaryLlmsDefault: "опис для llms.txt — стандартний",
  },

  // --- Store logo upload (TASK-299) -------------------------------------------
  storeLogo: {
    heading: "Логотип магазину",
    hint: "Показується у шапці сайту та в адмін-панелі. SVG, PNG, WebP або JPG — до 1 МБ. Найкраще виглядає горизонтальний логотип на прозорому фоні.",
    alt: "Логотип магазину",
    empty: "Логотип ще не завантажено — поки що показується стандартна назва.",
    upload: "Завантажити логотип",
    replace: "Замінити логотип",
    delete: "Видалити логотип",
    deleteTitle: "Видалити логотип?",
    deleteDescription:
      "Логотип буде видалено назавжди, а сайт і адмін-панель повернуться до текстової назви магазину. Дію не можна скасувати.",
    toastUploaded: "Логотип оновлено",
    toastDeleted: "Логотип видалено",
    toastDeleteFailed: "Не вдалося видалити логотип",
    // Upload errors are mapped from the API status: 413 = too large,
    // 415 = wrong/false file type, 400 = rejected (e.g. an SVG left unsafe
    // after sanitization), anything else = generic.
    errorTooLarge: "Файл завеликий — максимум 1 МБ. Стисніть зображення.",
    errorUnsupportedType:
      "Непідтримуваний формат. Дозволені SVG, PNG, WebP і JPG.",
    errorRejected:
      "Не вдалося обробити файл. Перевірте, що це справжнє зображення, і спробуйте інший файл.",
    errorGeneric: "Не вдалося завантажити логотип. Спробуйте ще раз.",
  },

  // --- FAQ (TASK-242) ---------------------------------------------------------
  faq: {
    metaTitle: "FAQ — Адмін",
    metaTitleNew: "Нове запитання — Адмін",
    metaTitleEdit: "Редагування запитання — Адмін",
    heading: "Часті запитання (FAQ)",
    subheading:
      "Ці запитання й відповіді показуються на сторінці «Інформація та підтримка» і допомагають клієнтам (та пошуковим системам) швидко знайти відповідь.",
    add: "Додати запитання",
    colQuestion: "Запитання",
    colStatus: "Статус",
    statusActive: "Показується",
    statusInactive: "Приховано",
    activate: "Показати",
    deactivate: "Приховати",
    loadError: "Не вдалося завантажити запитання. Спробуйте ще раз.",
    loadOneError: "Не вдалося завантажити запитання. Спробуйте ще раз.",
    empty: "Запитань ще немає. Додайте перше запитання.",
    back: "← Назад до FAQ",
    createHeading: "Нове запитання",
    editHeading: "Редагування запитання",
    createSubmit: "Додати запитання",
    deleteConfirm: "Видалити це запитання? Дію не можна скасувати.",
    toastCreated: "Запитання додано",
    toastCreateFailed: "Не вдалося додати запитання",
    toastUpdated: "Запитання оновлено",
    toastUpdateFailed: "Не вдалося оновити запитання",
    toastActivated: "Запитання показується",
    toastDeactivated: "Запитання приховано",
    toastStatusFailed: "Не вдалося змінити статус запитання",
    toastDeleted: "Запитання видалено",
    toastDeleteFailed: "Не вдалося видалити запитання",

    // TASK-428: the list became a drag-reorderable grid — the hand-typed «Порядок»
    // column and its form field are gone, so the grid needs its own accessible name.
    gridLabel: "Часті запитання — порядок",
    reorderHint:
      "Порядок запитань на сайті = порядок рядків тут. Перетягніть рядок за значок ліворуч або скористайтеся клавіатурою.",
  },

  faqForm: {
    question: "Запитання",
    questionPlaceholder: "Скільки коштує доставка?",
    questionHint:
      "Коротке запитання так, як його поставив би клієнт (одне речення).",
    answer: "Відповідь",
    answerPlaceholder:
      "Доставка Новою Поштою — за тарифами перевізника, безкоштовно від 1 000 ₴…",
    answerHint:
      "Повна відповідь простою мовою. Її бачитиме клієнт, коли розгорне запитання.",
    isActive: "Показувати на сайті",
    isActiveHint:
      "Приховані запитання не показуються клієнтам, але залишаються тут для повторного увімкнення.",
    submit: "Зберегти запитання",
    errors: {
      questionRequired: "Вкажіть запитання",
      questionMax: "Запитання має містити не більше 500 символів",
      answerRequired: "Вкажіть відповідь",
      answerMax: "Відповідь має містити не більше 5000 символів",
    },
  },

  // --- Orders (TASK-115) ------------------------------------------------------
  // NB: raw status enum values (PENDING…) are intentionally left untranslated —
  // user-facing status labels are owned by TASK-129.
  orders: {
    // Marks an order placed without an account (TASK-338). Worth showing rather
    // than leaving blank: it tells the operator there is no order history behind
    // this buyer and no account to look them up by — only the contact they typed.
    guestBadge: "гість",
    metaTitle: "Замовлення — Адмін",
    metaTitleDetail: (id: string) => `Замовлення ${id} — Адмін`,
    heading: "Замовлення",
    filterStatusAria: "Фільтр за статусом",
    tabNew: "Нові",
    tabProcessing: "В обробці",
    tabShipped: "Відправлені",
    tabAll: "Усі",
    loadError: "Не вдалося завантажити замовлення. Спробуйте ще раз.",
    emptyStatus: (s: string) => `Немає замовлень зі статусом «${s}».`,
    empty: "Замовлень ще немає.",
    colOrder: "Замовлення",
    colCustomer: "Клієнт",
    colStatus: "Статус",
    colPayment: "Оплата",
    colTotal: "Сума",
    colCreated: "Створено",
    // TASK-276: names the card-mode row group for screen readers.
    rowAria: (id: string) => `Замовлення ${id}`,
    back: "← Замовлення",
    title: (id: string) => `Замовлення #${id}`,
    timeline: (created: string, updated: string) =>
      `Створено ${created} · оновлено ${updated}`,
    updateStatus: "Змінити статус",
    itemProduct: "Товар",
    itemUnitPrice: "Ціна за од.",
    itemQty: "К-сть",
    itemLineTotal: "Сума",
    viewProductAria: (name: string) => `Редагувати «${name}»`,
    customer: "Клієнт",
    summary: "Підсумок",
    subtotal: "Проміжна сума",
    discount: "Знижка",
    shipping: "Доставка",
    tax: "Податок",
    total: "Разом",
    shippingAddress: "Адреса доставки",
    billingAddress: "Платіжна адреса",
    notes: "Примітка клієнта",
    loadOneError: "Не вдалося завантажити замовлення. Спробуйте ще раз.",
    // TASK-254: stock-hold badges on the order detail page.
    holdsStock: (n: number) => `Тримає залишок: ${n} шт`,
    restockedAt: (time: string) => `Залишок повернуто ${time}`,
    // TASK-251: order status/payment history timeline.
    timelineHeading: "Історія",
    timelineLoadError: "Не вдалося завантажити історію змін.",
    timelineEmpty: "Історія змін порожня.",

    // --- Free-text search (TASK-336) ------------------------------------------
    // Deliberately does NOT mention "ID": what an operator has on the phone is a
    // number the customer read off an email, or a phone number — never a UUID.
    searchPlaceholder: "Номер, телефон або email…",
    searchAria: "Пошук замовлень",

    // --- Operator-editable fields (TASK-335 / TASK-336) -----------------------
    detailsHeading: "Доставка і дані для оператора",
    trackingNumber: "ТТН (Нова Пошта)",
    trackingNumberPlaceholder: "20450000000001",
    // Says out loud that we do NOT create the waybill: creating one needs a
    // counterparty in the client's NP account, so the number is copied in from
    // the courier's own interface.
    trackingNumberHint:
      "Введіть номер накладної з кабінету Нової Пошти — рівно 14 цифр (пробіли можна). Якщо замовлення вже «Відправлено», клієнт отримає лист із номером для відстеження.",
    // TASK-426: the rule is 14 DIGITS, not «до 64 символів» — and the operator
    // must read the real rule off the field, because saving a wrong ТТН on a
    // SHIPPED order emails the customer a tracking link that leads nowhere.
    trackingNumberInvalid: "ТТН Нової Пошти — рівно 14 цифр.",
    internalNotes: "Внутрішні примітки",
    internalNotesPlaceholder: "Нотатка для команди…",
    // The whole point of TASK-336: this field and `notes` are different things,
    // and the operator must see which one they are typing into.
    internalNotesHint: "Бачить лише команда. Клієнту не показується ніколи.",
    internalNotesInvalid: "Примітка — до 2000 символів.",
    customerNotesHint: "Це написав клієнт при оформленні.",
    detailsSave: "Зберегти",
    detailsSaved: "Дані замовлення збережено.",
    detailsFailed: "Не вдалося зберегти. Спробуйте ще раз.",

    // --- Address edit before shipment (TASK-341) ------------------------------
    addressEdit: "Змінити адресу",
    addressEditCancel: "Скасувати",
    addressSave: "Зберегти адресу",
    addressSaved: "Адресу доставки оновлено.",
    // Explains the ABSENCE of the button rather than leaving a dead control:
    // once the parcel is with the courier, the address on the waybill is the one
    // that counts and editing the order would only make the record disagree.
    addressLockedHint:
      "Адресу можна змінити лише до відправлення — замовлення вже передано перевізнику.",

    // --- Payment card (TASK-330-C, partial — see the widget's note) -----------
    paymentHeading: "Оплата",
    paymentAmountLabel: "Сума",
    // --- "Повернуто X з Y" (TASK-472) -----------------------------------------
    // Shown only while the payment status is PARTIALLY_REFUNDED: on a full refund
    // the badge already says everything, and on a PAID order there is nothing to
    // say. X is Σ Return.refundedAmount, Y is the order total — both computed at
    // read time, neither stored.
    refundedLabel: "Повернуто",
    refundedOfTotal: (refunded: string, total: string) =>
      `${refunded} з ${total}`,
    // --- Operator-created (phone) orders (TASK-341) ---------------------------
    createHeading: "Нове замовлення",
    createMetaTitle: "Нове замовлення — Адмін",
    createCta: "Створити замовлення",
    // Line editing is deliberately NOT implemented server-side: changing lines
    // means returning and re-reserving stock atomically while recomputing totals
    // against the discount and add-on invariants. Saying so beats an operator
    // hunting for a button that does not exist.
    itemsLockedHint:
      "Склад замовлення не редагується після створення. Щоб змінити позиції — скасуйте це замовлення й створіть нове.",

    // --- Returns cross-link (TASK-340) ----------------------------------------
    returnsForOrder: "Повернення",

    // --- A rejected save says WHICH field and WHICH rule (TASK-426) -----------
    // `detailsFailed` above is the honest fallback for a failure nobody can act
    // on. It is the wrong answer when the server refused one named field: the
    // operator was editing the notes, the ТТН they never touched was what the
    // API rejected, and «не вдалося зберегти» sends them looking in the wrong
    // place. The English constraint text from class-validator never reaches the
    // screen — this is our sentence for our own rule.
    detailsFailedTracking:
      "Замовлення не збережено: ТТН Нової Пошти — це рівно 14 цифр. Виправте номер або очистіть поле.",

    // --- What the order actually contains (TASK-425) --------------------------
    // The add-ons were on the wire and off the screen, which is why the summary
    // did not add up: they are inside `total` but were in none of the rows above
    // it. `lineTotal` deliberately EXCLUDES them (order-item.entity.ts), so the
    // sub-row says so rather than letting the operator add the column up wrong.
    addonsTotal: "Додаткові послуги",
    addonsHint:
      "Додаткові послуги не входять у суму позиції — вони підсумовані окремо в блоці «Підсумок».",
    // A discount an operator cannot name is one they cannot explain on the phone.
    discountWithCode: (code: string) => `Знижка (${code})`,
    // Whether there is an account behind this order. The operator's first
    // question: a guest has no order history and no login to look them up by.
    customerTypeAccount: "Акаунт",
    customerTypeGuest: "Гість",
    colCustomerType: "Тип клієнта",

    // --- Queue filters (TASK-425) ---------------------------------------------
    filterPaymentStatusAria: "Фільтр за статусом оплати",
    allPaymentStatuses: "Будь-яка оплата",
    filterPaymentMethodAria: "Фільтр за способом оплати",
    allPaymentMethods: "Будь-який спосіб оплати",
    paymentMethodOnDelivery: "Післяплата",
    paymentMethodOnline: "Картка онлайн",
    paymentMethodInstallments: "Частинами",
    // No number in this label, on purpose: the threshold lives in ONE place
    // (the API's PENDING_STALE_HOURS, shared with the dashboard tile). A «понад
    // 48 год» written here would be a second copy of it, and the day it moves
    // this label is the one that lies.
    overdueChip: "Чекають занадто довго",
    overdueChipAria:
      "Показати лише замовлення, які надто довго чекають підтвердження",

    // --- Похідні мітки (TASK-470 / 471 / 472, рішення власника B-1) -----------
    // П'ять міток, жодної нової колонки: кожна — речення про поля, які вже є.
    // Мітка, яку доводиться підтримувати окремим записом, рано чи пізно
    // розійдеться з фактом — тому всі обчислюються на читанні.
    //
    // Жодна з них нічого не блокує: це сигнал оператору, а не заборона.
    markDebt: (amount: string) => `Борг ${amount}`,
    // Хвилини, а не час: оператор питає «скільки ще чекати», а не «коли спливе».
    // Число живе рівно стільки, скільки живе відрендерений рядок.
    markAwaitingPayment: (minutes: number) => `Очікує оплати · ${minutes} хв`,
    markReservationExpired: "Резерв сплив",
    markPartiallyRefunded: (refunded: string, total: string) =>
      `Частково повернуто ${refunded} з ${total}`,
    // На РЯДКУ позиції, не на замовленні: недоступна конкретна позиція, і саме
    // про неї оператор телефонує покупцеві. Автоматичного листа немає навмисно
    // (B-1 п.3) — вибір «замінити / повернути гроші / зачекати» робить людина.
    markItemUnavailable: "Позиція недоступна",
    markItemUnavailableHint:
      // TASK-627: «втратило резерв» буває лише в режимі ORDER_RESERVATION_EXPIRY=release —
      // час на оплату сплив, товар повернуто в продаж, а замовлення лишилось відкритим.
      "Товару цієї позиції більше немає в продажу — знято з публікації, видалено, перепродано або час на оплату сплив і товар повернуто в продаж, а замовлення лишилось відкритим. Якщо покупець оплатить, система спробує зарезервувати товар знову; якщо товару вже немає — оплата зарахується, а мітка лишиться. Зв'яжіться з покупцем і запропонуйте заміну, повернення коштів або очікування постачання.",

    // Фільтри-перемикачі під ті самі мітки. Перемикачі, а не пункти списку:
    // жодна з цих умов не є значенням однієї колонки — це предикати сервера, і
    // оператор законно вмикає два одразу.
    debtChip: "Борг",
    debtChipAria:
      "Показати лише доставлені замовлення, за які не розрахувалися",
    // НЕ «Очікує оплати»: рівно так підписаний бейдж статусу оплати PENDING, а
    // він стоїть на кожному неоплаченому замовленні, включно з післяплатою.
    // Однаково названий фільтр читався б як «показати всі неоплачені» — тобто
    // як зовсім інша вибірка.
    awaitingPaymentChip: "Вікно оплати",
    awaitingPaymentChipAria:
      "Показати лише карткові замовлення, у яких ще триває час на оплату",
    reservationExpiredChip: "Резерв сплив",
    reservationExpiredChipAria:
      "Показати лише карткові замовлення, у яких час на оплату вичерпано",
    unavailableItemsChip: "Недоступні позиції",
    unavailableItemsChipAria:
      "Показати лише замовлення, у яких є позиція, якої більше немає в продажу",
    // TASK-352: ціль плитки «Оплачено після скасування» на дашборді.
    paidAfterCancelChip: "Оплачено після скасування",
    paidAfterCancelChipAria:
      "Показати лише скасовані замовлення, оплата за якими надійшла після скасування",

    // --- CSV export (TASK-425) ------------------------------------------------
    exportSuccess: (count: number) => `Експортовано ${count} замовл. у CSV.`,
    // Sticky (it goes through toast.error) because an incomplete file that looks
    // complete is the one failure the operator must not scroll past. The count
    // comes from the file itself and the total from the list's own meta — the
    // server's row cap is never restated here.
    exportTruncated: (exported: number, total: number) =>
      `Експортовано лише ${exported} із ${total} замовл. — файл обмежено. Звузьте фільтри (дата, статус), щоб отримати решту.`,
    exportError: "Не вдалося сформувати CSV. Спробуйте ще раз.",

    // --- Без права `orders:write` (TASK-715) ----------------------------------
    // Кнопок зміни немає зовсім; `/orders/new`, набраний руками, дає одну
    // відмову замість форми, що впаде 403 на «Створити».
    createForbidden: "У вас немає права створювати замовлення.",
    createForbiddenHint:
      "Попросіть власника додати право «Змінювати статуси та ТТН» у розділі «Співробітники» — на картці співробітника.",
    // ТТН і внутрішні нотатки без права редагування показуються текстом.
    detailsValueEmpty: "Не вказано",

    // --- Заявки на повернення на картці замовлення (TASK-724) -----------------
    // Заголовок секції — `returnsForOrder`; тут лише стани списку.
    returnsForOrderEmpty: "Заявок на повернення по цьому замовленню немає.",
    returnsForOrderLoadError: "Не вдалося завантажити заявки на повернення.",
    returnsForOrderRequestedAt: (date: string) => `подано ${date}`,

    // --- Спроби оплати й повернення коштів (TASK-371) -------------------------
    // Картка платежу на замовленні: кожна спроба LiqPay і кнопка повернення на
    // успішній. 202 від сервера означає лише «запит надіслано» — статус оплати
    // змінює колбек LiqPay, тому жоден бейдж після кліку не перемикається.
    paymentAttemptsHeading: "Спроби оплати",
    paymentAttemptsLoading: "Завантажуємо спроби оплати…",
    paymentAttemptsLoadError: "Не вдалося завантажити спроби оплати.",
    paymentAttemptsEmpty:
      "Спроб онлайн-оплати ще не було — покупець не відкривав сторінку LiqPay.",
    paymentAttemptsOnDelivery:
      "Оплата при отриманні: онлайн-спроб немає, гроші повертаються поза LiqPay — через заявку на повернення.",
    paymentAttemptProviderId: "Ідентифікатор LiqPay",
    paymentAttemptFailure: "Причина відмови",
    paymentAttemptSettledAt: "Завершено",
    paymentAttemptCreatedAt: "Відкрито",
    paymentAttemptStatus: {
      PENDING: "Очікує",
      SUCCEEDED: "Успішна",
      FAILED: "Відхилена",
      EXPIRED: "Прострочена",
      REFUNDED: "Повернено",
    },
    refundAction: "Повернути кошти",
    refundTitle: "Повернення коштів через LiqPay",
    refundDescription: (amount: string) =>
      `Гроші повернуться на картку покупця. Оплачено цією спробою: ${amount}.`,
    refundModeLegend: "Скільки повернути",
    refundModeFull: (amount: string) => `Усю суму — ${amount}`,
    refundModePartial: "Частину",
    refundAmountLabel: "Сума повернення, ₴",
    refundAmountHint:
      "Наприклад, 499 або 499.50 — не більше за залишок до повернення.",
    refundAmountInvalid: "Вкажіть суму числом, до двох знаків після крапки.",
    refundAmountZero: "Сума має бути більшою за нуль.",
    refundAmountTooLarge: (amount: string) =>
      `Не більше за залишок до повернення з цієї спроби: ${amount}.`,
    refundNext: "Далі",
    refundBack: "Назад",
    refundCancel: "Скасувати",
    refundConfirmTitle: "Підтвердіть повернення",
    refundConfirmText: (amount: string) =>
      `Повернути покупцеві ${amount}? Запит піде в LiqPay одразу, скасувати його звідси не можна.`,
    refundConfirm: (amount: string) => `Повернути ${amount}`,
    refundRequested:
      "Запит на повернення надіслано. Статус оплати оновиться після підтвердження LiqPay.",
    // Кнопка на спробі, по якій запит уже пішов: сервер уже зарезервував суму
    // (TASK-1302), а свіжий залишок картка покаже після оновлення списку.
    refundPending: "Запит надіслано — чекаємо підтвердження LiqPay",
    refundErrorForbidden:
      "У вас немає права повертати кошти. Попросіть власника додати право «Повертати гроші».",
    refundErrorConflict:
      "Цю спробу вже не можна повернути: її статус змінився. Список спроб оновлено.",
    refundErrorTooLarge:
      "Сума перевищує залишок, який ще можна повернути з цієї спроби.",
    refundErrorNotFound: "Спробу оплати не знайдено — оновіть сторінку.",
    refundErrorGeneric:
      "Не вдалося надіслати запит на повернення. Спробуйте ще раз.",
    // Після часткового повернення всю суму вже не повернути — лише залишок
    // (TASK-1302).
    refundModeRemainder: (amount: string) => `Увесь залишок — ${amount}`,

    // --- Список як реєстр (хвиля 198, TASK-1045, OrdersProposal П1–П8) -------
    itemForms: ["замовлення", "замовлення", "замовлень"],
    summaryFound: "Знайдено",
    viewDefault: "Усі замовлення",
    colNumber: "№",
    colItemsShort: "Поз.",
    colDelivery: "Доставка",
    colEmail: "Email",
    colCity: "Місто",
    colUpdated: "Оновлено",
    colPaymentMethod: "Спосіб оплати",
    ttnValue: (number: string) => `ТТН ${number}`,
    // Лише на підтвердженому й «в обробці»: саме тоді ТТН уже мала б бути.
    ttnMissing: "ТТН не вказано",
    deliveryPickup: "Самовивіз",
    rowOpen: "Відкрити",
    rowOpenNewTab: "Відкрити в новій вкладці",
    rowCopyNumber: "Скопіювати номер",
    rowCopyTtn: "Скопіювати ТТН",
    rowChangeStatus: "Змінити статус…",
    copiedNumber: (number: string) => `Номер ${number} скопійовано.`,
    copiedTtn: "ТТН скопійовано.",
    copyFailed:
      "Не вдалося скопіювати — браузер не дав доступу до буфера обміну.",
    sortCreatedDesc: "створено, нові зверху",
    sortCreatedAsc: "створено, старі зверху",
    sortTotalDesc: "сума, більші зверху",
    sortTotalAsc: "сума, менші зверху",
    sortStatusAsc: "статус, від нових до завершених",
    sortStatusDesc: "статус, від завершених до нових",
    // «Фільтри»
    filterPeriod: "Період (створено)",
    periodToday: "Сьогодні",
    periodYesterday: "Вчора",
    period7Days: "7 днів",
    period30Days: "30 днів",
    periodMonth: "Цей місяць",
    periodCustom: "Свій період",
    filterOrderStatus: "Статус замовлення",
    filterPayment: "Оплата",
    filterSignals: "Сигнали",
    filtersApply: "Показати замовлення",
    filtersApplyCount: (countLabel: string) => `Показати ${countLabel}`,
    chipPeriod: (range: string) => `Період: ${range}`,
    periodSince: (date: string) => `з ${date}`,
    periodUntil: (date: string) => `до ${date}`,
    chipStatus: (labels: string) => `Статус: ${labels}`,
    chipPaymentStatus: (label: string) => `Оплата: ${label}`,
    chipPaymentMethod: (label: string) => `Спосіб оплати: ${label}`,
    // Ціль плитки «Очікують оплати» на дашборді (TASK-248) — досі жила лише в
    // URL, тепер її видно чипом і можна зняти.
    unpaidInTransitChip: "Неоплачені в роботі",
    unpaidInTransitChipAria:
      "Показати лише активні замовлення, гроші за які ще не надійшли",

    // --- Картка замовлення (хвиля 198, TASK-1046, OrdersProposal К1–К4) -------
    stepsAria: "Шлях замовлення",
    itemsHeading: "Позиції",
    moreActionsAria: "Інші дії",
    accessLinkAction: "Посилання для покупця…",
    deliveryMethodLabels: {
      NOVA_POSHTA: "Нова Пошта",
      PICKUP: "Самовивіз",
      COURIER: "Кур'єр",
      OTHER: "Інша доставка",
    },
    trackOnNp: "Відстежити на сайті НП ↗",
    // Під полем ТТН, після правила: скільки цифр зараз.
    trackingNumberDigitsNow: (count: number) => `Зараз ${count}.`,
  },

  reviews: {
    metaTitle: "Відгуки — Адмін",
    heading: "Модерація відгуків",
    filterStatusAria: "Фільтр за статусом",
    filterPending: "На розгляді",
    filterApproved: "Опубліковані",
    // TASK-446: «Відхилено» is a state a row now KEEPS. Rejecting used to delete
    // the row, so there was nothing to list and no third tab to offer; now the
    // rejected text stays, the rating goes on counting, and a moderator who wants
    // to change their mind needs an address to find it at.
    filterRejected: "Відхилені",
    colProduct: "Товар",
    colAuthor: "Автор",
    colRating: "Оцінка",
    colComment: "Коментар",
    colDate: "Надіслано",
    // Wave 198 (TASK-1057): a rating left without any text says so in words —
    // a bare «—» read as a row that failed to load.
    noComment: "Лише оцінка, без тексту",
    approve: "Схвалити",
    // TASK-446: the button says TEXT because only the text is withdrawn. The old
    // «Відхилити» described a hard delete that took the rating out of the
    // product's average with it — an operator who still reads it that way will
    // reject a one-star review believing the score recovers, and it will not.
    reject: "Відхилити текст",
    loadError: "Не вдалося завантажити відгуки. Спробуйте ще раз.",
    approveSuccess: "Відгук схвалено.",
    rejectSuccess: "Текст відгуку знято з сайту. Оцінка й далі враховується.",
    actionError: "Не вдалося виконати дію. Спробуйте ще раз.",
    ratingAria: (rating: number) => `${rating} з 5 зірок`,
    // TASK-276: names the card-mode row group for screen readers.
    rowAria: (product: string, author: string) =>
      `Відгук на «${product}» від ${author}`,
    // Bulk moderation over the on-screen selection (TASK-356).
    bulk: {
      // «…» since wave 198: BOTH bulk verdicts now ask first (TASK-1057).
      approve: (count: number) => `Схвалити (${count})…`,
      reject: (count: number) => `Відхилити текст (${count})…`,
      // TASK-446: this prompt used to warn about a permanent loss. It no longer
      // happens — the row stays, the rating goes on counting, and the author can
      // rewrite the text from the storefront. The prompt still asks, because the
      // texts do leave the site and the count is worth seeing before they do; it
      // now describes what the action actually costs instead of scaring the
      // operator away from a reversible one.
      rejectConfirm: (count: number) =>
        `Зняти текст із ${count} відг.? Тексти зникнуть із сайту, оцінки й далі враховуватимуться в рейтингу, а автори зможуть переписати свій відгук.`,
      announceSaving: (count: number) => `Обробка ${count} відг.…`,
      announceApproved: (count: number) => `Схвалено відгуків: ${count}`,
      announceRejected: (count: number) => `Відхилено текстів: ${count}`,
      announceFailed: "Не вдалося виконати масову дію",
      // Wave 198 (TASK-1057, ReviewsProposal В6): approving publishes texts and
      // lets ratings into the score, so it asks too — with its own words.
      approveConfirmTitle: (countLabel: string) =>
        `Опублікувати ${countLabel}?`,
      approveConfirm:
        "Тексти з’являться на сторінках товарів, а оцінки ввійдуть у рейтинг. Скасувати можна, відхиливши текст пізніше.",
      approveConfirmLabel: (count: number) => `Опублікувати ${count}`,
      // «Відхилити текст 3 відгуків?» — the noun in the genitive.
      rejectConfirmTitle: (countLabel: string) =>
        `Відхилити текст ${countLabel}?`,
      genitiveForms: ["відгуку", "відгуків", "відгуків"],
      idleHint:
        "Виберіть відгуки, щоб схвалити чи відхилити текст кількох одразу",
    },

    // Free-text search (TASK-423). The queue had none at all, so triaging a
    // backlog meant paging through it, and "what did this customer write about
    // that product?" was a question this screen could not answer.
    searchPlaceholder: "Пошук за текстом, автором або товаром…",
    searchAria: "Пошук відгуків",

    // TASK-430: the queue showed a product NAME and nothing else, and this
    // catalogue has several positions per name (the same case in four colours), so
    // a moderator could not tell which one a complaint was about — nor look it up,
    // because the SKU is the key the catalogue is searched by.
    noSku: "без артикулу",
    productLinkAria: (product: string) => `Відкрити картку товару «${product}»`,

    // --- The shop's public reply (TASK-446, permission `reviews:write`) --------
    //
    // A separate permission from moderating, and the copy has to earn it: the
    // moderator decides what stays on the site, the person answering SPEAKS as
    // the shop under their own name to every visitor. The dialog says "публічна"
    // in as many words because nothing else on this screen is.
    replyAction: "Відповісти",
    replyEditAction: "Змінити відповідь",
    replyBadge: "Є відповідь магазину",
    replyTitle: "Відповідь магазину",
    replyDescription: (product: string) =>
      `Публічна відповідь під відгуком на «${product}». Її бачать усі відвідувачі сайту.`,
    replyReviewLabel: "Відгук покупця",
    replyLabel: "Текст відповіді",
    replyPlaceholder: "Дякуємо за відгук! …",
    replySubmit: "Опублікувати відповідь",
    // Upsert, not append: a second answer REPLACES the first. Said before the
    // operator types, not after they lose the old one.
    replyReplaceNote:
      "Магазин уже відповідав на цей відгук. Збереження замінить попередню відповідь.",
    replySuccess: "Відповідь опубліковано.",
    replyError: "Не вдалося зберегти відповідь. Спробуйте ще раз.",

    // --- Withdrawing one account's whole contribution (TASK-446) --------------
    //
    // The one action on this screen whose blast radius is not the row it sits in:
    // it takes every rating and every text that account ever left, on every
    // product. The copy has to say "ВСІ" and "на всіх товарах" out loud, because
    // the button lives in a row about one product and everything around it reads
    // as being about that one review.
    hideAuthorAction: "Приховати всі оцінки автора",
    unhideAuthorAction: "Повернути оцінки автора",
    hideAuthorTitle: "Приховати весь внесок автора?",
    hideAuthorDescription: (author: string) =>
      `Приховає ВСІ відгуки та оцінки акаунта ${author} — на всіх товарах, а не лише на цьому. Тексти зникнуть із сайту, а оцінки перестануть враховуватися в рейтингах.`,
    hideAuthorConfirm: "Приховати все",
    hideAuthorSuccess: (count: number) => `Приховано відгуків автора: ${count}`,
    hideAuthorError: "Не вдалося приховати відгуки автора. Спробуйте ще раз.",
    unhideAuthorTitle: "Повернути внесок автора?",
    // The email gate is re-asked on restore (`ReviewService.unhideAuthor`), so
    // this promise is deliberately conditional — an un-ban is not a shortcut to a
    // counting rating for an address nobody has confirmed.
    unhideAuthorDescription: (author: string) =>
      `Поверне всі відгуки акаунта ${author} на сайт. Оцінки знову враховуватимуться в рейтингах лише якщо пошту цього акаунта підтверджено.`,
    unhideAuthorConfirm: "Повернути все",
    unhideAuthorSuccess: (count: number) =>
      `Повернуто відгуків автора: ${count}`,
    unhideAuthorError: "Не вдалося повернути відгуки автора. Спробуйте ще раз.",
    // Since TASK-1004 only the unconfirmed-email gate reaches this badge: a
    // withdrawn author's row names its lever from `hiddenReason` (the keys
    // below). A row with no `hiddenReason` whose `ratingVisible` is still false
    // is held back by the email alone, and there the effect is the whole truth.
    ratingNotCounted: "Оцінка не враховується",

    // --- Why a row is withdrawn, from the server (TASK-1004, API TASK-596/599) --
    // `hiddenReason` names the lever that put the author's contribution down, so
    // the badge says WHO did it instead of inferring it from `ratingVisible` —
    // and each lever is lifted by a different hand (a moderator, an un-ban,
    // nobody), which is exactly what the operator needs to know before acting.
    hiddenByModerator: "Приховано модератором",
    hiddenByBan: "Автора заблоковано",
    hiddenByDeletion: "Акаунт видалено",
    // The review-author visibility filter (`?visibility=`, API default `visible`).
    // Without it the withdrawn rows — and so the «повернути» button — were
    // unreachable from the queue.
    filterVisibilityAria: "Фільтр за видимістю автора",
    filterVisibilityVisible: "Лише видимі",
    filterVisibilityHidden: "Приховані",
    filterVisibilityAll: "Видимі й приховані",
    // `?status=all` — every text verdict plus ratings without text (TASK-601).
    filterAll: "Усі",
    // Deep-link narrowing from the dashboard's rating-abuse card (TASK-601):
    // removable chips, since no control on this screen sets them.
    productChip: (product: string) => `Товар: ${product}`,
    ipChip: (ip: string) => `IP: ${ip}`,

    // ── Wave 198 (TASK-1057, ReviewsProposal В1–В10) ─────────────────────────
    // Quick views replace the two selects; the selects' labels live on as the
    // filter sheet's pills.
    viewAbuse: "Сигнали накрутки",
    viewHiddenAuthors: "Приховані автори",
    viewDefault: "Стандартний",
    itemForms: ["відгук", "відгуки", "відгуків"],
    summaryFound: "Знайдено",
    // The API lists newest first, always (no sort parameter yet).
    sortCreatedDesc: "надіслано, нові зверху",
    colStatus: "Статус",
    statusPending: "На розгляді",
    statusApproved: "Опубліковано",
    statusRejected: "Текст відхилено",
    statusHidden: "Приховано",
    bought: "купував",
    notBought: "не купував",
    hideAuthorMenu: "Приховати всі оцінки автора…",
    unhideAuthorMenu: "Повернути оцінки автора…",
    filtersApply: "Показати відгуки",
    filterStatusTitle: "Статус тексту",
    filterAuthorsTitle: "Автори",
    chipStatus: (label: string) => `Статус: ${label}`,
    chipAuthors: (label: string) => `Автори: ${label}`,
    // The reply dialog (В8): the 1000-character limit, counted as you type.
    replyHint: "Відповідь з'явиться під відгуком одразу після публікації.",
    replyCounter: (length: number, max: number) => `${length} / ${max}`,
    // «Сигнали накрутки» (В3, TASK-1004): the explanation card over the series
    // the dashboard links to. Counted from the rows the API returned.
    abuseTitleProduct: (count: string, span: string, product: string) =>
      `Схоже на накрутку: ${count} за ${span} на «${product}»`,
    abuseTitleIp: (count: string, span: string, ip: string) =>
      `Схоже на накрутку: ${count} за ${span} з адреси ${ip}`,
    abuseRatingForms: ["оцінка", "оцінки", "оцінок"],
    abuseLowRatingForms: ["низька оцінка", "низькі оцінки", "низьких оцінок"],
    dayForms: ["день", "дні", "днів"],
    abuseSuspects: (count: number, total: number) =>
      `${count} з ${total} — від акаунтів без покупки й без тексту.`,
    abuseAdvice:
      "Перевірте авторів і, якщо це накрутка, приховайте їхні оцінки через «⋯».",
    abuseNext: (index: number, total: number) =>
      `Наступний сигнал (${index} з ${total})`,
    // Empty texts, one per view (В9).
    emptyPendingTitle: "Усе розглянуто",
    emptyPending:
      "Нових відгуків на модерацію немає. Щойно покупець залишить відгук, він з'явиться тут, а в меню — лічильник.",
    emptyApproved: "Опублікованих відгуків ще немає.",
    emptyRejected: "Відхилених відгуків немає.",
    emptyAbuse: "За цим сигналом відгуків не знайдено.",
    emptyHiddenAuthors: "Прихованих авторів немає.",
    emptyAll: "Відгуків ще немає.",
  },

  // --- Contact messages (TASK-177) --------------------------------------------
  messages: {
    metaTitle: "Повідомлення — Адмін",
    heading: "Вхідні повідомлення",
    filterAll: "Усі",
    filterNew: "Нові",
    filterRead: "Прочитані",
    colName: "Відправник",
    colTopic: "Тема",
    colMessage: "Повідомлення",
    colStatus: "Статус",
    colDate: "Отримано",
    // TASK-276: names the card-mode row group for screen readers.
    rowAria: (name: string) => `Повідомлення від ${name}`,
    statusNew: "Нове",
    statusRead: "Прочитане",
    statusArchived: "В архіві",
    noTopic: "—",
    empty: "Немає повідомлень.",
    loadError: "Не вдалося завантажити повідомлення. Спробуйте ще раз.",
    unreadBadgeAria: (n: number) => `${n} непрочитаних повідомлень`,
    // Detail dialog
    open: "Відкрити",
    detailTitle: "Повідомлення",
    fieldEmail: "Email",
    fieldOrderRef: "Замовлення",
    fieldAdminNote: "Внутрішня примітка",
    adminNotePlaceholder: "Примітка для команди (не бачить клієнт)…",
    markRead: "Позначити прочитаним",
    markArchived: "В архів",
    markNew: "Повернути в нові",
    saveNote: "Зберегти примітку",
    updateSuccess: "Повідомлення оновлено.",
    updateError: "Не вдалося оновити повідомлення. Спробуйте ще раз.",
    // IN_PROGRESS status + inbox→profile link (TASK-256)
    filterInProgress: "В роботі",
    statusInProgress: "В роботі",
    markInProgress: "Взяти в роботу",
    viewProfile: "Профіль клієнта",

    // Bulk status change over the on-screen selection (TASK-354).
    //
    // Only three of the four statuses are offered. "Повернути в нові" is
    // per-row only: it is an undo for one mis-click, and in bulk it would push
    // conversations back into the unread badge that someone has already worked.
    bulk: {
      markInProgress: (count: number) => `В роботу (${count})`,
      markRead: (count: number) => `Прочитано (${count})`,
      markArchived: (count: number) => `В архів (${count})`,
      announceSaving: (count: number) => `Оновлення ${count} повідомл.…`,
      announceDone: (count: number) => `Оновлено повідомлень: ${count}`,
      announceFailed: "Не вдалося виконати масову дію",
    },

    // Free-text search (TASK-423). A customer's second message lands weeks after
    // the first, and without this the only way to find what we already told them
    // was to page through the archive.
    searchPlaceholder: "Імʼя, пошта, телефон, тема або текст…",
    searchAria: "Пошук повідомлень",

    // TASK-761: звернення, що спрацювали на поле-пастку для ботів. Не входять
    // у «Усі» й у лічильник непрочитаних; видно лише за цим фільтром — щоб
    // хибне спрацювання (менеджер паролів заповнив пастку) можна було помітити.
    filterSpam: "Спам",
    statusSpam: "Спам",

    // ── Wave 198 (TASK-1060, TASK-734, MessagesProposal З1–З9) ───────────────
    // The registry: views over the same `?status=`, the summary, the sort line.
    viewArchived: "Архів",
    viewDefault: "Стандартний",
    itemForms: ["повідомлення", "повідомлення", "повідомлень"],
    summaryFound: "Знайдено",
    summaryNew: "нове",
    sortCreatedDesc: "отримано, нові зверху",
    sortCreatedAsc: "отримано, старі зверху",
    sortNameAsc: "відправник, А→Я",
    sortNameDesc: "відправник, Я→А",
    sortStatusAsc: "статус, нові спершу",
    sortStatusDesc: "статус, архів спершу",
    colOrder: "Замовлення",
    orderLinkAria: (number: string) => `Знайти замовлення ${number}`,
    // Topic keys of the storefront's contact form, in words.
    topicOrder: "Замовлення",
    topicDelivery: "Доставка",
    topicWarranty: "Гарантія та сервіс",
    topicReturn: "Повернення",
    topicOther: "Інше",
    bulkIdleHint:
      "Виберіть повідомлення, щоб узяти в роботу, позначити прочитаними чи перенести в архів кілька одразу",
    // TASK-1011: without `messages:write` the inbox is read-only, and says so.
    readOnly:
      "Лише перегляд. Брати в роботу, змінювати статус і писати примітки може співробітник із правом «Опрацьовувати звернення».",
    // TASK-761: the «Спам» view explains itself (З4).
    spamTitle: "Сюди потрапляє те, що форма визнала ботом",
    spamText:
      "Спрацювало приховане поле-пастка. Інколи його заповнює менеджер паролів справжнього клієнта — прочитайте й, якщо це людина, поверніть звернення в нові.",
    // Empty texts, one per view.
    emptyNew: "Нових повідомлень немає.",
    emptyInProgress: "У роботі нічого немає.",
    emptyRead: "Прочитаних повідомлень немає.",
    emptyArchived: "В архіві порожньо.",
    emptySpam: "У спамі порожньо.",
    // The side panel (З5–З8) — what exists today: the customer's message, its
    // source, the status and the one internal note.
    statusMenu: (label: string) => `Статус: ${label}`,
    sourceForm: "форма на сайті",
    noteHidden: "клієнт не бачить",
    noteHint: "Бачить лише команда. Клієнту не надсилається.",
  },

  orderStatus: {
    noTransitions: "Немає доступних переходів",
    toastUpdated: (s: string) => `Статус замовлення змінено на ${s}`,
    toastFailed: "Не вдалося оновити статус замовлення",
    updatePaymentStatus: "Статус оплати",
    changePaymentStatus: "Змінити статус оплати…",
    paymentToastUpdated: (label: string) => `Статус оплати оновлено: ${label}`,
    paymentToastFailed: "Не вдалося оновити статус оплати",
    paymentUpdateAria: "Оновити статус оплати",

    // --- Payment status names (TASK-431) --------------------------------------
    // The single place each payment status is worded. `status-label.ts` reads
    // them; nothing spells them twice.
    paymentLabels: {
      PENDING: "Очікує оплати",
      PAID: "Оплачено",
      FAILED: "Помилка оплати",
      // "Частково" first, because that is the word that distinguishes it from
      // the full refund at a glance in a list of badges.
      PARTIALLY_REFUNDED: "Частково повернуто",
      REFUNDED: "Кошти повернено",
    },

    // --- Server-driven payment transitions (TASK-431) -------------------------
    paymentTransitionsLoading: "Завантаження доступних статусів оплати…",
    paymentTransitionsLoadError:
      "Не вдалося отримати список статусів оплати. Оновіть сторінку.",
    noPaymentTransitions: "Статус оплати змінити неможливо",
    // --- Виправлення помилкової мітки «Кошти повернено» (TASK-620, B-11 №7) ---
    // Окрема дія, а не пункт списку: REFUNDED лишається кінцевим для фактів;
    // виправити можна лише мітку, яку поставив оператор, з обов'язковою причиною.
    paymentCorrectAction: "Виправити помилкову мітку «Кошти повернено»",
    paymentCorrectTitle: "Виправити помилкову мітку «Кошти повернено»",
    paymentCorrectDescription:
      "Лише якщо мітку поставили помилково вручну. Якщо гроші повернула платіжна система, мітку виправити не можна. Причина потрапить у журнал дій.",
    paymentCorrectTargetLegend: "Яким має бути статус оплати",
    paymentCorrectReason: "Причина виправлення",
    paymentCorrectConfirm: "Виправити",
    paymentCorrectCancel: "Скасувати",
    paymentCorrectToast: "Мітку оплати виправлено",
    // Always under the picker. The "why is the full refund missing" half lives in
    // `paymentTransitionsHintFullRefund` (TASK-842) and shows only when it IS
    // missing — on a cancelled order it is in the list, and telling the operator
    // to cancel first would be advice about something already done.
    paymentTransitionsHint:
      "Доступні лише переходи, дозволені для поточного статусу оплати.",

    // --- Server-driven transitions (TASK-332) ---------------------------------
    transitionsLoading: "Завантаження доступних статусів…",
    transitionsLoadError:
      "Не вдалося отримати список доступних статусів. Оновіть сторінку.",
    // The select now offers exactly what the server allows, so the picker names
    // that fact — an operator who expected "Скасовано" to be there needs to know
    // it is missing on purpose, not by accident.
    transitionsHint: "Доступні лише переходи, дозволені для поточного статусу.",

    // --- Мʼяке попередження при відправці без оплати (TASK-468) ---------------
    // Рішення B-1: жорстко забороняємо лише фізично неможливе. Онлайн-замовлення
    // без підтвердженої оплати відправити МОЖНА — але свідомо, і з записом в
    // історії, щоб «чому ми це відправили» мало відповідь через місяць.
    unpaidShipTitle: "Оплату не підтверджено — відправляти?",
    unpaidShipDescription:
      "Замовлення оплачується онлайн, але оплата ще не підтверджена. " +
      "Ви можете відправити його — рішення буде записано в історію замовлення.",
    unpaidShipAmount: "До сплати",
    unpaidShipConfirm: "Все одно відправити",
    unpaidShipCancel: "Не відправляти",
    // Підпис примітки SHIPPED_UNPAID на рядку історії (TASK-788): сервер
    // ставить її сам, коли оператор відправляє онлайн-замовлення з оплатою
    // PENDING/FAILED; таймлайн показує цей рядок під переходом.
    unpaidShipHistoryNote:
      "Відправлено без підтвердженої онлайн-оплати — підтверджено оператором.",
    // Підпис примітки PAID_AFTER_CANCEL (TASK-619 / TASK-932): оплата прийшла,
    // коли замовлення вже скасоване; рішення за оператором.
    paidAfterCancelHistoryNote:
      "Оплата надійшла після скасування — відновіть замовлення або поверніть кошти.",

    // One string per stable 409 code from `order.errors.ts`. The client never
    // echoes a raw backend message: these codes are the contract, the wording is
    // ours (same discipline as `dict.reorderList.rejected`).
    conflict: {
      // Edge case E-11: two admins with one order open. Retrying blindly is
      // exactly what the lock exists to stop, so the remedy named is "reload".
      ORDER_STALE:
        "Хтось інший щойно змінив це замовлення, оновіть сторінку. Ваша зміна не збережена.",
      ORDER_TRANSITION_INVALID:
        "Такий перехід статусу неможливий — замовлення вже змінилося. Список статусів оновлено.",
      // TASK-431 — the two payment codes. Separate wording from the status one
      // above because the operator's next action differs: here the fix is either
      // "pick another payment status" or "cancel the order first".
      ORDER_PAYMENT_TRANSITION_INVALID:
        "Такий перехід статусу оплати неможливий — статус уже змінився. Список оновлено.",
      ORDER_REFUND_REQUIRES_CLOSED_ORDER:
        "Повне повернення коштів можливе лише для скасованого замовлення. Спочатку скасуйте замовлення — або позначте часткове повернення.",
      // Те саме правило з іншого боку (ревʼю плану 180): оживити замовлення, за
      // яким гроші вже повернуті, не можна. Формулювання називає єдину дію, що
      // працює, бо статус оплати REFUNDED не має жодного дозволеного переходу —
      // «виправте статус оплати» було б порадою в нікуди.
      ORDER_REVIVE_REFUNDED_PAYMENT:
        "Гроші за цим замовленням уже повернуті покупцеві, тож повернути його в роботу не можна. Створіть нове замовлення.",
      // TASK-620: мітку «Кошти повернено» поставила платіжна система (LiqPay
      // reversed), а не оператор — це факт про гроші, його не виправляють.
      ORDER_PAYMENT_CORRECTION_PROVIDER_REFUND:
        "Цю мітку поставила платіжна система: гроші справді повернуто покупцеві. Виправити її не можна.",
    },
    conflictUnknown:
      "Замовлення змінилося, і зміну не збережено. Оновіть сторінку й спробуйте ще раз.",
    reloadCta: "Оновити",

    // --- Чому статус оплати не змінити і що робити далі (TASK-842) ------------
    // Під `noPaymentTransitions` — причина й наступний крок, а не порожнеча.
    // Причину визначає сам статус оплати з відповіді сервера: REFUNDED не має
    // переходів узагалі, а з PARTIALLY_REFUNDED сервер прибирає «Кошти повернено»,
    // поки замовлення не скасоване й не повернене.
    noPaymentTransitionsRefunded:
      "Усі кошти вже повернено покупцеві — це кінцевий стан оплати, змінювати тут більше нічого. Що саме повернули і за яким рішенням — у заявці на повернення.",
    noPaymentTransitionsPartial:
      "Частину коштів уже позначено поверненою. «Кошти повернено» можна поставити лише скасованому замовленню або замовленню зі статусом «Повернення коштів» — спершу змініть статус замовлення вище.",
    noPaymentTransitionsPartialAmount:
      "Сума «Повернуто» рахується з рішень у заявках на повернення. Якщо там 0 грн, заявки немає або в ній ще не збережено рішення із сумою — відкрийте заявку по цьому замовленню.",
    noPaymentTransitionsOther:
      "Для поточного статусу оплати немає дозволених переходів.",
    noPaymentTransitionsReturnsLink: "Заявки на повернення цього замовлення",
    // Без `returns:read` лінк вів би на відмову — тому лише текст.
    noPaymentTransitionsReturnsNoAccess:
      "Заявки на повернення — у розділі «Повернення»; щоб їх бачити, потрібне право на перегляд повернень.",
    // Лише коли «Кошти повернено» немає в списку, а гроші надходили (TASK-842).
    paymentTransitionsHintFullRefund:
      "Повне повернення коштів можливе після скасування замовлення.",
    // TASK-622: 403 на зміні замовлення чи оплати. Раніше мапер конфліктів
    // бачив у тілі поле `error` («Forbidden») і казав «замовлення змінилося,
    // оновіть сторінку» — оператор оновлював вічно, бо перезавантаження права
    // не дає. Називаємо справжню причину і того, хто може її усунути.
    forbidden:
      "У вас немає права на цю дію — зміну не збережено. Якщо вона потрібна, попросіть власника магазину надати доступ.",
    // TASK-621: рядок історії про подію оплати, яку магазин відхилив. Раніше
    // таймлайн показував «Оплачено → Оплачено» — ніби нічого не сталося.
    // `requested` — чого просила подія; `current` — що лишилось насправді.
    paymentEventRefusedLabel: (requested: string, current: string) =>
      `Відхилено подію оплати: «${requested}» (статус оплати лишився «${current}»)`,
    // Рядки, записані до TASK-621, не зберегли, чого просила подія.
    paymentEventRefusedLegacyLabel: (current: string) =>
      `Відхилено подію оплати (статус оплати лишився «${current}»)`,
    paymentEventRefusedHistoryNote:
      "Платіжна система повідомила про зміну, яку магазин не прийняв: такий перехід статусу оплати заборонений. Гроші й статус не змінились; подробиці — в журналі сервера.",

    // --- «Змінити статус ▾» як меню (хвиля 198, TASK-1046, К2) ----------------
    // Перелік дозволених — від сервера; причина «недоступно» лише пояснює,
    // правило лишається на сервері.
    menuCurrent: (status: string) => `Зараз: ${status}`,
    menuAllowed: "Можна змінити на",
    menuUnavailable: "Недоступно зараз",
    menuAskPayment: "спитаємо про оплату",
    reasonNoWayBack: "назад не можна",
    reasonRefundAfterShipment: "лише після відправлення",
    reasonRefundedFinal: "кошти вже повернено",
    reasonReviveFirst: "спершу відновіть замовлення",
    reasonOther: "не з поточного статусу",
    // Головна кнопка — природний наступний крок.
    nextConfirm: "Підтвердити",
    nextShip: "Відправити",
    nextDeliver: "Позначити доставленим",
    // Післяплата (К1): той самий перехід оплати в «Оплачено», що й у списку.
    codTitle: (amount: string) => `Післяплата · ${amount}`,
    codHint:
      "Гроші надійдуть від Нової Пошти після того, як покупець забере посилку. Коли переказ прийде — позначте оплату.",
    codReceived: "Гроші від НП отримано",
    otherPaymentStatus: "Інший статус оплати:",
  },

  // --- Посилання для покупця (TASK-484) ---------------------------------------
  // Телефонне замовлення отримує той самий токен, що й гостьовий чекаут. Сирий
  // токен існує рівно мить створення — у базі лежить тільки SHA-256, — тому вся
  // ця гілка текстів написана навколо одного факту: показати посилання ще раз
  // неможливо, можна лише видати нове, і старе після цього перестає працювати.
  orderAccess: {
    heading: "Посилання для покупця",
    description:
      "Покупець відкриє своє замовлення за цим посиланням — без реєстрації та входу. " +
      "Надішліть його у Viber, Telegram або SMS.",
    // Написано так, щоб оператор розумів ціну кнопки ДО натискання.
    rotateHint:
      "Показати попереднє посилання неможливо: ми зберігаємо лише його відбиток. " +
      "Можна видати нове — тоді старе перестане відкривати замовлення.",
    issue: "Видати нове посилання",
    issuing: "Створюємо посилання…",
    issuedHeading: "Нове посилання створено",
    // Показуємо рівно один раз — і кажемо про це, поки воно ще на екрані.
    issuedOnceWarning:
      "Скопіюйте посилання зараз — після оновлення сторінки воно більше не відобразиться.",
    issuedAt: (date: string) => `Видано ${date}`,
    copy: "Скопіювати",
    copied: "Скопійовано",
    copyFailed: "Не вдалося скопіювати",
    copyAria: "Скопіювати посилання на замовлення",
    linkAria: "Посилання на замовлення для покупця",
    failed: "Не вдалося створити посилання. Спробуйте ще раз.",
    // 400 з ендпоінта: STORE_CLIENT_URL не налаштовано. Це дефект розгортання, а
    // не помилка оператора, тому текст каже, кого кликати.
    failedNotConfigured:
      "Адресу вітрини не налаштовано, тому посилання створити неможливо. Зверніться до розробника.",
    // TASK-623: API видає посилання лише гостьовому замовленню (userId === null).
    // Акаунтне — і гостьове, яке потім привласнив зареєстрований покупець, — 409.
    accountOrderHint:
      "Посилання видаються лише для гостьових замовлень: це замовлення належить акаунту, і покупець бачить замовлення в кабінеті.",
    // 409 після натискання: замовлення привласнили акаунту вже після того, як
    // сторінку було відкрито.
    failedAccountOrder:
      "Замовлення вже належить акаунту — посилання не видається, покупець бачить замовлення в кабінеті.",
  },

  // --- Returns / RMA (TASK-340) -----------------------------------------------
  returns: {
    metaTitle: "Повернення — Адмін",
    metaTitleDetail: (id: string) => `Повернення ${id} — Адмін`,
    heading: "Повернення",
    back: "← Повернення",
    title: (id: string) => `Повернення #${id}`,

    filterStatusAria: "Фільтр за статусом повернення",
    allStatuses: "Усі статуси",
    loadError: "Не вдалося завантажити повернення. Спробуйте ще раз.",
    loadOneError: "Не вдалося завантажити повернення. Спробуйте ще раз.",
    empty: "Запитів на повернення ще немає.",
    emptyStatus: (s: string) => `Немає повернень зі статусом «${s}».`,

    colReturn: "№",
    colOrder: "Замовлення",
    colStatus: "Статус",
    // Одиниці, а не рядки (TASK-1056): «2» — це два чохли, не дві позиції.
    colItems: "Шт.",
    colRequested: "Подано",
    colRefunded: "Повернуто",
    rowAria: (id: string) => `Повернення ${id}`,
    viewOrder: "Замовлення",

    // Ukrainian labels for ReturnStatus. RECEIVED and REFUNDED are worded so the
    // difference is unmistakable: the goods arriving and the money going out are
    // two separate events, and conflating them is how a shop refunds twice.
    statusREQUESTED: "Запит",
    statusAPPROVED: "Схвалено",
    statusREJECTED: "Відхилено",
    statusRECEIVED: "Товар отримано",
    statusREFUNDED: "Гроші повернуто",

    reason: "Причина від клієнта",
    noReason: "Причину не вказано",
    operatorNotes: "Внутрішні примітки",
    operatorNotesPlaceholder: "Нотатка для команди…",
    operatorNotesHint: "Бачить лише команда.",
    restockedAt: "Повернуто на склад",
    notRestocked: "На склад не повертали",
    refundedAmount: "Повернуто коштів",
    itemsHeading: "Що повертають",
    itemProduct: "Товар",
    itemQty: "Шт.",
    itemPrice: "Ціна",

    // --- Resolve action -------------------------------------------------------
    // Wave 198 (TASK-1056): one «Наступний крок» card with only the actions the
    // status allows, instead of a status select + one «Зберегти рішення».
    resolveHeading: "Наступний крок",
    resolveNoTransitions:
      "Це повернення завершене — змінити його статус більше не можна.",
    resolveRefundedAmount: "Сума повернення, ₴",
    resolveRefundedAmountPlaceholder: "499.00",
    // Partial refunds are normal: shipping is not always refundable and a
    // customer may be returning one line out of three.
    resolveRefundedAmountHint:
      "Скільки фактично повернули клієнту. Може бути меншим за суму позицій — доставка повертається не завжди.",
    resolveRefundedAmountInvalid:
      "Сума має бути у форматі 499 або 499.00 (до двох знаків).",
    // TASK-785 — the two ceilings the API enforces, in its order. The amount is
    // named when the form knows it; the server's own 400 carries no localized
    // number, so the same sentence is shown without one.
    resolveRefundExceedsReturnedValue: (max?: string) =>
      max
        ? `Сума більша за вартість позицій, що повертаються (${max}). Перевірте, чи не пропущено крапку.`
        : "Сума більша за вартість позицій, що повертаються. Перевірте, чи не пропущено крапку.",
    resolveRefundExceedsOrderBalance: (max?: string) =>
      max
        ? `Не більше ${max} — це все, що ще можна повернути за цим замовленням.`
        : "Сума більша за те, що ще можна повернути за цим замовленням з урахуванням знижки та інших повернень.",
    // TASK-794 — the limit is `ResolveReturnDto.operatorNotes` (@MaxLength).
    operatorNotesTooLong: "Примітка має містити не більше 2000 символів.",
    // `restock` is explicit rather than inferred from the status because "the
    // parcel arrived" and "the contents are sellable again" are different claims.
    // Ticked by default since wave 198 (Р3): most parcels come back sellable.
    resolveRestockHint:
      "Зніміть, якщо товар пошкоджений і продавати його не можна.",
    resolveRestockAlreadyDone:
      "Товар уже повернуто на склад — повторно це зробити не можна.",
    resolveSuccess: "Рішення збережено.",
    resolveFailed: "Не вдалося зберегти рішення. Спробуйте ще раз.",
    // 409 from the return state machine / the double-restock guard.
    resolveConflict:
      "Повернення вже змінилося — оновіть сторінку й прийміть рішення ще раз.",
    // TASK-956: this used to say «Повернення товару на склад доступне лише для
    // статусу…» for EVERY 400 — false for most of them. Field-specific refusals
    // now go under their field; this is what is left.
    resolveBadRequest:
      "Сервер не прийняв цей крок. Перевірте суму й примітку та спробуйте ще раз.",

    // Free-text search (TASK-423). The queue had none, so an operator with the
    // customer on the phone could only page through it. The placeholder names
    // what the term is actually matched against — the return id, the order
    // number, the customer's email or phone, and the reason they wrote. Not the
    // name: the API does not search it (TASK-1056's API tail).
    searchPlaceholder:
      "Номер повернення чи замовлення, телефон, email або причина…",
    searchAria: "Пошук повернень",

    // --- Доступ до розділу (TASK-370) -----------------------------------------
    // Сторінки прикривав лише AdminShellGuard по isStaff, тож будь-який
    // співробітник відкривав чужі повернення, набравши адресу руками.
    forbidden: "У вас немає доступу до розділу повернень.",
    forbiddenHint:
      "Попросіть власника видати вам право «Переглядати повернення» — він робить це в розділі «Співробітники» → ваша картка → вкладка «Права».",

    // --- Заявка від оператора (TASK-469) --------------------------------------
    // Гість і телефонний покупець акаунта не мають, тож покупецька форма для них
    // фізично не відкривається — заявку заводить оператор.
    createDialogTitle: "Створити заявку на повернення?",
    createDialogDescription: (id: string) =>
      `По замовленню #${id} немає жодної заявки. Створити її на все замовлення — ` +
      "чи просто змінити статус?",
    createDialogItemsHeading: "Позиції заявки",
    createDialogReason: "Причина (зі слів клієнта)",
    createDialogReasonPlaceholder: "Наприклад: не підійшов розмір",
    createDialogSubmit: "Створити заявку",
    // «Не блокує»: оператор має право відмовитись і просто поставити статус.
    createDialogSkip: "Лише змінити статус",
    createSuccess: "Заявку на повернення створено.",
    createFailed: "Не вдалося створити заявку. Спробуйте ще раз.",
    createdByOperator: "Заявку створив оператор",

    // --- Реєстр і картка (хвиля 198, TASK-1056, ReturnsProposal Р1–Р6) --------
    itemForms: ["заявка", "заявки", "заявок"],
    summaryFound: "Знайдено",
    viewDefault: "Стандартний",
    // Швидкі види за етапом — над тим самим `?status=`, тож глибокі посилання
    // працюють як раніше. Лічильників немає: API їх не віддає (хвіст TASK-1056).
    tabNew: "Нові",
    tabAwaitingGoods: "Чекаємо товар",
    tabRefundDue: "Повернути гроші",
    tabDone: "Завершені",
    tabRejected: "Відхилені",
    tabAll: "Усі",
    filterStatus: "Етап",
    filtersApply: "Показати заявки",
    colReason: "Причина",
    colAmount: "Сума",
    // «Вік» незакритої заявки — під датою подання.
    ageWaiting: (days: number) =>
      days < 1 ? "чекає менше доби" : `чекає ${days} дн`,
    ageAwaitingGoods: (days: number) =>
      days < 1 ? "чекаємо товар менше доби" : `чекаємо товар ${days} дн`,
    ageRefundDue: "повернути гроші",
    units: (count: number) => `${count} шт.`,
    sortRequestedDesc: "подано, нові зверху",
    sortRequestedAsc: "подано, старі зверху",
    sortStatusAsc: "статус, від нових до завершених",
    sortStatusDesc: "статус, від завершених до нових",
    sortRefundedDesc: "повернуто, більші зверху",
    sortRefundedAsc: "повернуто, менші зверху",
    rowOpen: "Відкрити",
    rowOpenNewTab: "Відкрити в новій вкладці",
    rowCopyNumber: "Скопіювати номер",
    rowOpenOrder: "Відкрити замовлення",
    copiedNumber: (number: string) => `Номер ${number} скопійовано.`,
    copyFailed:
      "Не вдалося скопіювати — браузер не дав доступу до буфера обміну.",
    cardActionsAria: "Дії із заявкою",
    submittedAt: (date: string) => `подано ${date}`,
    // Кроки заявки (Р3–Р5).
    stepsAria: "Етапи заявки",
    stepNow: "зараз",
    itemLineForms: ["позиція", "позиції", "позицій"],
    itemsCount: (linesLabel: string, units: number) =>
      `${linesLabel} · ${units} шт.`,
    itemSum: "Сума",
    itemsTotal: "Сума позицій",
    alreadyRefunded: "Уже повернуто за замовленням",
    maxRefund: "Можна повернути максимум",
    // «Наступний крок» — лише дії, доречні для статусу (Р3–Р5).
    nextRequested: "Перевірте причину й вирішіть, чи приймаєте повернення.",
    approve: "Схвалити заявку",
    nextApproved: "Коли посилка від клієнта прийде й ви її перевірите:",
    restockUnits: (count: number) => `Повернути товар на склад (${count} шт.)`,
    markReceived: "Товар отримано",
    reject: "Відхилити заявку…",
    rejectConfirmTitle: "Відхилити заявку?",
    rejectConfirmDescription:
      "Клієнт побачить, що в поверненні відмовлено. Змінити це рішення потім не можна — нове звернення буде новою заявкою.",
    rejectConfirm: "Відхилити",
    nextReceived: (restocked: boolean) =>
      restocked
        ? "Товар отримано й повернуто на склад. Лишилось повернути гроші клієнту."
        : "Товар отримано. Лишилось повернути гроші клієнту.",
    refundCapHint: (max: string) =>
      `Максимум ${max}. Доставку повертають не завжди.`,
    resolveRefundedAmountRequired: "Вкажіть суму, яку повернули клієнту.",
    markRefunded: "Гроші повернуто",
    saving: "Зберігаємо…",
    notesEdit: "Змінити",
    notesEditHint: "Збережеться разом із наступним кроком.",
    notesEmpty: "Приміток немає.",
  },

  // --- Operator-created (phone) orders (TASK-341) ------------------------------
  orderCreate: {
    customerHeading: "Клієнт",
    // An operator-created order either belongs to an existing account or to a
    // walk-in whose contact was taken over the phone. Making that an explicit
    // choice keeps "which of these two do I fill in" off the operator.
    modeAccount: "Існуючий акаунт",
    modeGuest: "Без акаунта (за телефоном)",
    modeAria: "Кому належить замовлення",
    // TASK-426 removed `userId` / `userIdPlaceholder` / `userIdHint` /
    // `userIdInvalid`: the field they labelled asked an operator to paste a
    // customer's UUID, and the hint told them to go to another screen and copy it.
    // The customer picker replaced it — see `customerSearch*` at the end of this
    // block. The keys are gone rather than left unused, because a dictionary that
    // still tells operators to copy an ID describes a panel that no longer exists.
    contactName: "Імʼя",
    contactEmail: "Електронна пошта",
    contactPhone: "Телефон",
    contactNameInvalid: "Вкажіть імʼя клієнта.",
    contactEmailInvalid: "Вкажіть коректну електронну пошту.",
    contactPhoneInvalid: "Вкажіть коректний номер телефону.",

    addressHeading: "Доставка",
    addressFirstName: "Імʼя",
    addressLastName: "Прізвище",
    addressPhone: "Телефон",
    addressCity: "Місто",
    addressAddress1: "Відділення / адреса",
    addressPostalCode: "Індекс",
    addressRequired: "Обовʼязкове поле.",

    itemsHeading: "Товари",
    itemsSearchPlaceholder: "Пошук товару за назвою…",
    itemsSearchAria: "Пошук товару для замовлення",
    itemsSearching: "Пошук…",
    itemsNoResults: "Товарів не знайдено.",
    itemsAdd: "Додати",
    itemsAddAria: (name: string) => `Додати «${name}» до замовлення`,
    itemsRemoveAria: (name: string) => `Прибрати «${name}» із замовлення`,
    itemsQtyAria: (name: string) => `Кількість «${name}»`,
    itemsEmpty: "Додайте хоча б один товар.",
    // No price field anywhere, on purpose: an operator-created order is still a
    // sale at the shop's price. Prices come from the live catalogue.
    itemsPriceHint:
      "Ціни беруться з каталогу на момент створення — вручну їх не змінюють.",

    paymentHeading: "Оплата й примітки",
    paymentMethod: "Спосіб оплати",
    paymentMethodAria: "Спосіб оплати замовлення",
    notes: "Примітка клієнта",
    notesPlaceholder: "Побажання клієнта…",
    internalNotes: "Внутрішні примітки",
    internalNotesPlaceholder: "Нотатка для команди…",
    // TASK-794 — the limits are `CreateManualOrderDto` (@MaxLength 500 / 2000).
    // Shown under the field: a blocked submit with no visible reason is a button
    // that silently does nothing.
    notesTooLong: "Не більше 500 символів.",
    internalNotesTooLong: "Не більше 2000 символів.",

    submit: "Створити замовлення",
    cancel: "Скасувати",
    success: "Замовлення створено.",
    failed: "Не вдалося створити замовлення. Спробуйте ще раз.",
    // 400 from the backend covers "no customer identified", "product
    // unavailable" and "stock is short" — all things the operator can fix.
    failedBadRequest:
      "Замовлення не створено: перевірте клієнта, товари та наявність на складі.",

    // --- Посилання для покупця одразу після створення (TASK-484) --------------
    // Замовлення створене, і перше, що потрібно операторові, який ще на лінії, —
    // кинути покупцеві посилання. Тому після успіху ми НЕ переходимо одразу на
    // картку: сирий токен існує лише в цій відповіді, і перехід його втратив би.
    createdHeading: "Замовлення створено",
    createdNumber: (number: string) => `Номер замовлення: #${number}`,
    createdLinkIntro:
      "Надішліть покупцеві це посилання — він побачить своє замовлення без реєстрації.",
    createdLinkOnce:
      "Посилання показується один раз. Скопіюйте його зараз — відновити цей самий лінк неможливо, лише видати нове з картки замовлення.",
    createdEmailSent:
      "Лист із цим посиланням також надіслано на вказану пошту.",
    // STORE_CLIENT_URL не налаштовано — токен видано, але URL зібрати нема з чого.
    createdLinkUnavailable:
      "Адресу вітрини не налаштовано, тому посилання не створено. Видати його можна з картки замовлення після налаштування.",
    createdOpenOrder: "Відкрити замовлення",

    // --- Customer picker (TASK-426) --------------------------------------------
    // Nobody knows a customer's UUID. The field used to ask for one outright, and
    // the hint told the operator to go to another page and copy it.
    customerSearchLabel: "Клієнт",
    customerSearchPlaceholder: "Пошук за іменем, прізвищем або поштою…",
    customerSearchAria: "Пошук клієнта для замовлення",
    customerSearchHint:
      "Знайдіть клієнта за іменем, прізвищем або електронною поштою — ID вводити не потрібно.",
    customerSearching: "Пошук…",
    customerNoResults: "Клієнтів не знайдено.",
    // A failed lookup is not an empty one: «не знайдено» blames the operator's
    // spelling for our own outage — the storefront defect of TASK-402.
    customerSearchFailed:
      "Не вдалося виконати пошук клієнтів. Спробуйте ще раз.",
    customerPick: "Вибрати",
    customerPickAria: (name: string) => `Вибрати клієнта ${name}`,
    customerChange: "Змінити клієнта",
    customerNoName: "Без імені",
    customerInactive: "Деактивовано",
    // The API refuses an order for a deactivated account (403), so say so here
    // rather than after the operator has filled in the whole form.
    customerInactiveHint:
      "Акаунт деактивовано — оформити на нього замовлення не можна.",
    customerRequired: "Виберіть клієнта зі списку.",
    customerSelectedHint:
      "Порожні поля отримувача заповнено з картки клієнта — за потреби змініть їх.",

    // --- Phone (TASK-426) ------------------------------------------------------
    // Says «будь-яка країна» out loud, because the operator's own form used to
    // refuse a +48 number the API accepts. A phone order is taken from whoever
    // is on the line — roaming and border-region numbers included (TASK-338,
    // rule restated by the owner 2026-09-10).
    phoneHint:
      "Наприклад: +380 50 123 4567. Приймаємо номер будь-якої країни — від 9 до 15 цифр.",
    // The API made email optional for an operator-created order (TASK-426) — say
    // so, or the operator invents an address to get past a required field.
    contactEmailOptional:
      "Необовʼязково: якщо пошти немає, залиште порожнім — зв'язок за телефоном.",

    // --- Nova Poshta directory (TASK-426) --------------------------------------
    cityPlaceholder: "Почніть вводити назву міста",
    citySearchAria: "Пошук міста в довіднику Нової Пошти",
    warehousePlaceholder: "Оберіть відділення або введіть адресу",
    warehouseSearchAria: "Пошук відділення в довіднику Нової Пошти",
    warehouseHint: "Спершу оберіть місто, щоб побачити відділення Нової Пошти.",
    npSearching: "Пошук…",
    npEmpty: "Нічого не знайдено.",
    // Nova Poshta refuses keyless calls in production, so this is the NORMAL state
    // of a deployment without an NP key: both fields stay free text and the order
    // still goes through. Never a blocker — an operator has a customer on the line.
    npUnavailable:
      "Довідник Нової Пошти недоступний — введіть місто та відділення вручну.",
    npPickAria: (name: string) => `Вибрати «${name}»`,
    npPicked: "Обрано з довідника Нової Пошти.",

    // --- Нове замовлення за макетом (хвиля 198, TASK-1047, Н1–Н4) ------------
    createIntro:
      "Склад не редагується після створення — перевірте позиції перед збереженням.",
    sameRecipient: "Одержувач — той самий клієнт",
    sameRecipientHint:
      "Інший одержувач? Зніміть позначку — з'являться ім'я, прізвище й телефон одержувача.",
    methodOnDelivery: "Оплата при отриманні",
    methodOnline: "Картка онлайн",
    methodInstallments: "Оплата частинами",
    // Після правила під полем приміток: скільки символів зараз.
    tooLongNow: (count: number) => `Зараз ${count}.`,
    itemSku: (sku: string) => `SKU ${sku}`,
    itemFree: (count: number) => `вільно ${count} шт`,
    itemNoStock: "Немає вільного залишку",
    itemPerUnit: (price: string) => `${price} за шт`,
    itemsQtyDecrease: (name: string) => `Менше «${name}»`,
    itemsQtyIncrease: (name: string) => `Більше «${name}»`,
    // 400 від API біля позиції (Н3).
    lineStockGone: (count: number) =>
      `Поки ви оформлювали, залишок закінчився: вільно ${count} шт. Приберіть позицію або зменште кількість.`,
    lineUnavailable: "Товар більше не продається. Приберіть позицію.",
    // Липкий «Підсумок»
    summaryHeading: "Підсумок",
    summaryPositions: "Позицій",
    summaryPositionsValue: (count: number) => `${count} шт`,
    summaryGoods: "Товари",
    summaryDelivery: "Доставка",
    summaryDeliveryValue: "за тарифом НП",
    summaryTotal: "Разом",
    summaryChecklistAria: "Що вже заповнено",
    fieldForms: ["поле", "поля", "полів"],
    errorsTitle: (countLabel: string) => `Перевірте ${countLabel}`,
    serverErrorTitle: "Замовлення не створено",
    serverErrorLine:
      "Одна позиція вже недоступна — див. «Товари». Інші дані збережено у формі.",
    serverErrorFields:
      "Сервер не прийняв позначені поля — інші дані збережено у формі.",
  },

  // --- Users (TASK-115) -------------------------------------------------------
  users: {
    metaTitle: "Клієнти — Адмін",
    metaTitleDetail: (id: string) => `Клієнт ${id} — Адмін`,
    heading: "Клієнти",
    // TASK-480. Заголовок і підпис більше не обіцяють «усіх користувачів»: із
    // TASK-476 `GET /api/users` віддає лише CUSTOMER, а службові акаунти живуть
    // у власному розділі. Підпис прямо каже, куди йти по співробітника, бо саме
    // цього не знайшов власник на прогоні 2026-08-27.
    intro:
      "Тут лише покупці. Службові акаунти — адміністратори й менеджери — живуть у розділі «Співробітники»: там же їх створюють і там же видають права.",
    // Лише те, що шукає `GET /api/users`: пошта, ім'я, прізвище. Телефон — ні
    // (хвіст API), тож плейсхолдер його не обіцяє.
    searchPlaceholder: "Ім'я, прізвище або пошта…",
    searchAria: "Пошук клієнтів",
    roleCustomer: "Клієнт",
    roleAdmin: "Адміністратор",
    filterStatusAria: "Фільтр за статусом",
    loadError: "Не вдалося завантажити клієнтів. Спробуйте ще раз.",
    // `allStatuses`, `empty`, `colEmail`, `colName` stood here until wave 198:
    // the status select became quick views + «Фільтри», the one empty sentence
    // became two (К3), and name + email share the «Клієнт» column (К1).
    colStatus: "Статус",
    colJoined: "Зареєстровано",
    back: "← Клієнти",
    accountStatus: "Доступ до акаунта",
    accountActive:
      "Акаунт активний, клієнт може входити й замовляти зі своїм кабінетом.",
    accountInactive:
      "Акаунт деактивовано: клієнт не може увійти в кабінет на сайті. Замовлення, відгуки й нотатки лишилися.",
    accountMetadata: "Метадані акаунта",
    fieldEmail: "Електронна пошта",
    // `fieldFullName` and `fieldMemberSince` («Учасник з», which repeated
    // «Створено») left with the profile grid — the header says both (К4).
    fieldPhone: "Телефон",
    fieldUserId: "ID користувача",
    fieldCreated: "Створено",
    fieldUpdated: "Останнє оновлення",
    loadOneError: "Не вдалося завантажити клієнта. Спробуйте ще раз.",
    // --- Customer card (TASK-252) ---------------------------------------------
    // «оплачені», а не «доставлені», як на артборді: `ltv` з API — сума
    // оплачених замовлень (PAID). Підпис каже те, що рахує сервер.
    cardLtv: "Сума покупок · оплачені",
    cardOrderCount: "Замовлень",
    cardRecentOrders: "Замовлення",
    cardViewAllOrders: "Усі замовлення клієнта →",
    cardNoOrders: "Замовлень ще немає.",
    cardReviews: "Відгуки",
    cardNoReviews: "Відгуків ще немає.",
    cardReviewPending: "На модерації",
    cardReviewApproved: "Опубліковано",
    // TASK-446: a third state, because the review text now survives its own
    // rejection. The old two-state badge was driven by `isActive`, which the
    // backend dropped: a rejected review simply vanished from the card, so
    // «ще не читали» and «прочитали й відхилили» looked identical — both absent.
    cardReviewRejected: "Текст відхилено",
    cardCoupons: "Використані купони",
    cardNoCoupons: "Купони ще не використовувались.",
    cardMessages: "Звернення (за email)",
    cardNoMessages: "Звернень ще немає.",
    cardMessageNoTopic: "Без теми",
    // TASK-479. Повна картка переїхала під окреме право `customers:card`, бо
    // право «Картки клієнтів» купувало одразу дві різні речі: контакти, щоб
    // передзвонити, і всю історію покупок із сумами, відгуками й текстами
    // звернень. Без нового права екран НЕ робить запит — інакше 403 перетворився
    // б на червоний банер «не вдалося завантажити», тобто «сторінка зламана»
    // замість «цього вам не видавали». Це різні проблеми з різними рішеннями.
    cardPermissionRequired:
      "Історію покупок, відгуки та звернення цього клієнта показуємо лише з правом " +
      "«Повна картка». Контакти для дзвінка — вище. За правом зверніться до власника магазину.",

    // --- Account management, shared by /users and /staff (TASK-317 / TASK-480) -
    //
    // The «Новий співробітник» copy lived here until TASK-480 and now lives in
    // `dict.staff` with the wizard that replaced the dialog. What stays is what
    // BOTH screens still use: the role vocabulary (`roleLabel`), the role-change
    // control (promoting a shopper happens on the customer card), the password
    // rule and the delete dialog.
    roleManager: "Менеджер",
    roleUnknown: (role: string) => `Роль: ${role}`,
    passwordHint:
      "Мінімум 8 символів, з великою літерою, малою літерою та цифрою. Передайте його працівнику особисто — він зможе змінити пароль у своєму профілі.",
    passwordWeak:
      "Пароль має містити щонайменше 8 символів, велику й малу літери та цифру",

    staffHeading: "Керування акаунтом",

    roleChangeLabel: "Роль співробітника",
    roleChangeAria: "Змінити роль користувача",
    roleChangeSubmit: "Змінити роль",
    roleChangeToastDone: (role: string) => `Роль змінено на «${role}»`,
    roleChangeToastFailed: "Не вдалося змінити роль",
    roleChangeSelf: "Не можна змінити власну роль.",
    roleChangeHint:
      "Після зміни ролі всі активні сесії користувача завершуються — йому доведеться увійти знову.",
    // `rolePermissionsHint` / `rolePermissionsLink` stood here until TASK-475.
    // TASK-406 added them to explain that rights were attached to the role rather
    // than the person, and to point at the screen that edited them. Neither
    // statement is true any more, and that screen no longer exists.

    passwordResetHeading: "Скинути пароль",
    passwordResetDescription:
      "Задає новий пароль для цього акаунта. Усі активні сесії буде завершено, а тимчасове блокування після невдалих спроб входу — знято.",
    passwordResetNew: "Новий пароль",
    passwordResetSubmit: "Скинути пароль",
    passwordResetToastDone: "Пароль скинуто",
    passwordResetToastFailed: "Не вдалося скинути пароль",

    deleteHeading: "Видалити акаунт",
    deleteDescription: (email: string) =>
      `Акаунт ${email} буде позначено як видалений: клієнт більше не зможе увійти, але його замовлення та історія залишаться. Дію не можна скасувати з панелі.`,
    deleteConfirm: "Так, видалити акаунт",
    deleteToastDone: "Акаунт видалено",
    deleteToastFailed: "Не вдалося видалити акаунт",
    deleteSelf: "Не можна видалити власний акаунт.",

    // --- Operator email change (TASK-396) -------------------------------------
    // The customer lost their inbox and asked for help. Owner-only. The copy has
    // to say the three things the operator would otherwise assume wrongly: the
    // new address is NOT confirmed by this, the customer is signed out
    // everywhere, and the reason is written into the journal.
    changeEmailOpen: "Змінити email для входу…",
    changeEmailHeading: "Змінити email для входу",
    changeEmailDescription: (email: string) =>
      `Зараз клієнт входить з адресою ${email}. Нова адреса стане адресою для входу одразу, але НЕ буде підтвердженою: на неї піде лист із посиланням. Усі сеанси клієнта буде завершено.`,
    changeEmailNew: "Нова адреса",
    changeEmailReason: "Причина звернення",
    changeEmailReasonHint:
      "Хто звернувся і як ви переконалися, що це власник акаунта. Запишеться в журнал дій.",
    changeEmailSubmit: "Змінити email",
    changeEmailToastDone:
      "Email змінено — на нову адресу надіслано лист для підтвердження",
    changeEmailToastFailed: "Не вдалося змінити email",
    changeEmailInvalid: "Вкажіть коректну адресу",
    changeEmailSame: "Це вже поточна адреса клієнта",
    changeEmailReasonRequired: "Опишіть причину — щонайменше 5 символів",

    // `lastAdminRefusal` stood here until TASK-480, unreferenced since TASK-476:
    // «останній адміністратор» stopped being the invariant the API defends. What
    // it defends now is stronger and differently worded — the owner exists
    // always, and the server's own refusal is surfaced verbatim.

    // --- Email confirmation (TASK-430 / AD-CRM-04) ----------------------------
    // `emailVerifiedAt` has been on the wire since TASK-342 and the panel showed
    // nothing, so «цей клієнт не отримує наших листів» was invisible to the person
    // fielding the phone call about it. A timestamp, not a boolean, because
    // "verified WHEN" is what answers the support question.
    emailVerified: "Пошта підтверджена",
    emailNotVerified: "Пошта не підтверджена",
    emailVerifiedAt: (date: string) => `Підтверджено ${date}`,
    // Honest about what null means: every account created before verification
    // existed is null too, so this is "we do not know", not "they refused".
    emailNotVerifiedHint:
      "Адреса не проходила підтвердження. Це нормально для акаунтів, створених до " +
      "запуску підтвердження пошти, — але якщо клієнт не отримує листів, перевіряйте " +
      "адресу саме тут.",

    // --- Customer notes (TASK-430) --------------------------------------------
    notesHeading: "Нотатки",
    notesIntro:
      "Службовий журнал для команди — клієнт цих записів не бачить. Нотатки лише " +
      "додаються: щоб уточнити попередню, напишіть нову.",
    notesEmpty: "Нотаток ще немає.",
    notesLoadError: "Не вдалося завантажити нотатки. Спробуйте ще раз.",
    notesAddLabel: "Нова нотатка",
    notesAddPlaceholder: "Що важливо знати про цього клієнта?",
    notesAddSubmit: "Додати нотатку",
    notesToastAdded: "Нотатку додано",
    notesToastFailed: "Не вдалося додати нотатку",
    notesAuthorUnknown: "Автор невідомий",
    // Count-free grammar on purpose. `Залишилось ${left} символів` renders
    // «Залишилось 1 символів» and «Залишилось 3 символів» — wrong for two of the
    // three Ukrainian plural classes, on a counter that appears on every long
    // note. The colon form is grammatical for every value without a
    // `Intl.PluralRules` table to maintain, and it is how the neighbouring
    // counters in this file already read («Вибрано: 3», «Активних елементів: 1»,
    // «Показано останні…»). Hand-rolled plural tables are what
    // `shared/lib/format/formatDate.ts` refuses to have; this avoids needing one.
    notesCharsLeft: (left: number) => `Залишилось символів: ${left}`,
    notesTooLong: (max: number) =>
      `Нотатка не може бути довшою за ${max} символів`,
    notesTruncated: (shown: number, total: number) =>
      `Показано останні ${shown} з ${total} нотаток.`,

    lockoutHeading: "Блокування входу",
    lockoutUnavailable:
      "Після кількох невдалих спроб входу акаунт тимчасово блокується й розблоковується сам.",

    // --- Wave 198, UsersProposal К1–К8 (TASK-1058) ----------------------------
    viewAll: "Усі",
    viewActive: "Активні",
    viewInactive: "Неактивні",
    itemForms: ["клієнт", "клієнти", "клієнтів"],
    summaryFound: "Знайдено",
    sortCreatedDesc: "зареєстровано, нові зверху",
    sortCreatedAsc: "зареєстровано, старі зверху",
    sortEmailAsc: "пошта, А→Я",
    sortEmailDesc: "пошта, Я→А",
    viewDefault: "Стандартний",
    filterStatus: "Статус",
    filtersApply: "Показати клієнтів",
    chipStatus: (label: string) => `Статус: ${label}`,
    colCustomer: "Клієнт",
    colPhone: "Телефон",
    rowOpen: "Відкрити",
    emptyAllTitle: "Клієнтів ще немає",
    emptyAllBody:
      "Вони з'являться тут після першої реєстрації на сайті. Гості, що замовляють без реєстрації, у цьому списку не показуються — їх видно в замовленнях.",
    emptyStatusTitle: (active: boolean) =>
      active ? "Немає активних клієнтів" : "Немає неактивних клієнтів",
    emptyStatusBody: (label: string) =>
      `За фільтром «Статус: ${label}» нікого не знайдено.`,
    emptyReset: "Скинути фільтри",
    customerSince: (date: string) => `клієнт з ${date}`,
    cardReviewsCount: "Відгуків",
    cardLastOrder: "Останнє замовлення",
    metaId: "ID",
    copyId: "Скопіювати",
    copyIdDone: "Скопійовано",
    copyIdFailed: "Не вдалося скопіювати — виділіть ID вручну",
    copyIdAria: "Скопіювати ID клієнта",
    deleteOpen: "Видалити акаунт…",
    // `lockedUntil` / `failedLoginAttempts` віддає API — тож панель каже, чи
    // заблоковано вхід просто зараз, а не «поки не показує», як на артборді.
    lockoutLockedUntil: (dateTime: string) =>
      `Зараз вхід заблоковано до ${dateTime}.`,
    lockoutNone: "Зараз вхід не заблоковано.",
    lockoutAttempts: (count: number) => `Невдалих спроб поспіль: ${count}`,
    // «Роль співробітника» з картки клієнта прибрано (рішення власника
    // 2026-09-30): доступ до панелі видають лише в «Співробітниках».
    staffAccessHintBefore:
      "Потрібно дати цій людині доступ до панелі? Додайте її в розділі ",
    staffAccessHintLink: "«Співробітники»",
    staffAccessHintAfter: " за цією поштою — акаунт і замовлення лишаться.",
    colOrderNumber: "№",
  },

  // The `permissionsMatrix` block lived here until TASK-475. It was the copy for
  // a screen that edited ROLE permissions, and both the screen and the API behind
  // it are gone — rights belong to a person now. The new wording ships with
  // /staff (TASK-480); a stale block would only be copied by whoever writes it.

  // --- Співробітники, до хвилі 198 «Персонал» (TASK-480, план 181, B-3 №3, №5) -
  //
  // Один екран замість трьох кроків у різних місцях. На прогоні 2026-08-27
  // власник не знайшов, як завести менеджера: акаунт створювався на `/users`,
  // права видавалися на `/settings/permissions`, і видавалися вони РОЛІ. Тут
  // найм, шаблон і галочки — один прохід, а рівень доступу підписаний словами,
  // а не виводиться з ролі читачем.
  staff: {
    metaTitle: "Співробітники — Адмін",
    metaTitleDetail: (name: string) => `${name} — Співробітники — Адмін`,
    metaTitleTemplates: "Шаблони прав — Адмін",
    heading: "Співробітники",
    intro:
      "Службові акаунти магазину. Рівень визначає, ким людина може керувати; права менеджера — рівно ті галочки, які йому поставили.",
    back: "← Співробітники",

    searchPlaceholder: "Ім'я або пошта…",
    searchAria: "Пошук співробітників",
    filterLevelAria: "Фільтр за рівнем",
    filterStatusAria: "Фільтр за статусом",

    loadError: "Не вдалося завантажити співробітників. Спробуйте ще раз.",
    loadOneError:
      "Не вдалося завантажити картку співробітника. Спробуйте ще раз.",
    empty: "Немає службових акаунтів за поточними фільтрами.",
    emptyAll: "Службових акаунтів ще немає. Додайте першого співробітника.",

    colPerson: "Співробітник",
    colLevel: "Рівень",
    colPermissions: "Права",
    colLastSeen: "Останній вхід",
    colStatus: "Статус",
    lastSeenNever: "ще не входив",

    // Рівні — слова, а не числа. Число (`level`) рахує сервер, підпис читає
    // людина; будь-яка спроба вивести рівень із ролі в браузері — це друга
    // копія правила, яка колись розійдеться з першою.
    levelOwner: "Власник",
    levelAdmin: "Адміністратор",
    levelManager: "Менеджер",
    levelCustomer: "Клієнт",
    levelUnknown: (level: number) => `Рівень ${level}`,

    // Рішення 5: верхньої межі для адмінів немає — натомість їх видно завжди.
    fullAccessHeading: (count: number) =>
      `Повний доступ ${count === 1 ? "має" : "мають"} ${count} ${personForm(count)}`,
    fullAccessNone:
      "Повного доступу не має ніхто — це помилка стану, зверніться до розробника.",
    fullAccessLoadError: "Не вдалося порахувати, хто має повний доступ.",

    // --- Майстер «Додати співробітника» ---------------------------------------
    create: "Додати співробітника",
    createHeading: "Додати співробітника",
    createDescription:
      "Доступ до панелі магазину. Клієнти реєструються самі на вітрині — тут додаються лише адміністратори й менеджери.",
    fieldEmail: "Електронна пошта",
    fieldPassword: "Початковий пароль",
    fieldFirstName: "Ім'я",
    fieldLastName: "Прізвище",
    fieldLevel: "Рівень доступу",
    levelManagerOption: "Менеджер — лише те, що йому видали",
    levelAdminOption: "Адміністратор — повний доступ до всього",
    // Заступника ADMIN не пропонуємо взагалі: `assertMayAssign` на сервері
    // строго більший, тож вибір закінчився б 403 без жодного пояснення.
    levelAdminOwnerOnly:
      "Призначати адміністраторів може лише власник магазину.",
    next: "Далі",
    prev: "Назад",
    createSubmit: "Створити співробітника",
    createToastDone: (email: string) => `Акаунт ${email} створено`,
    createToastFailed: "Не вдалося створити акаунт",
    createPermissionsFailed:
      "Акаунт створено, але права зберегти не вдалося. Відкрийте картку і поставте галочки ще раз.",
    emailTaken: "Такий email уже зареєстрований.",
    emailInvalid: "Введіть коректну електронну пошту",

    // --- Шаблони --------------------------------------------------------------
    templatesNav: "Шаблони прав",
    templatesHeading: "Шаблони прав",
    templatesIntro:
      "Готові набори прав для типових ролей: «Оператор замовлень», «Контент-менеджер». Шаблон застосовується КОПІЄЮ.",
    // Речення, яке тут головне. Модель «копія, а не лінк» ламається в голові
    // саме на правці шаблону, тому напис стоїть у діалозі редагування, а не
    // десь у довідці.
    templatesCopyRule:
      "Редагування шаблону НЕ змінює прав тих, хто вже працює: при застосуванні права копіюються людині. Щоб змінити доступ конкретній людині, відкрийте її картку.",
    templatesEmpty:
      "Шаблонів ще немає. Створіть перший — далі найм піде в один клік.",
    templatesLoadError: "Не вдалося завантажити шаблони. Спробуйте ще раз.",
    templateColName: "Назва",
    templateColPermissions: "Прав у наборі",
    templateColUpdated: "Оновлено",
    templateCreate: "Створити шаблон",
    templateCreateHeading: "Новий шаблон прав",
    templateEditHeading: "Редагування шаблону",
    templateName: "Назва",
    templateDescription: "Для чого цей шаблон",
    templateNameRequired: "Вкажіть назву шаблону",
    templateToastCreated: (name: string) => `Шаблон «${name}» створено`,
    templateToastSaved: (name: string) => `Шаблон «${name}» збережено`,
    templateToastFailed: "Не вдалося зберегти шаблон",
    templateDeleteHeading: "Видалити шаблон",
    templateDeleteDescription: (name: string) =>
      `Шаблон «${name}» буде видалено. Права людей, яким його вже застосовували, не зміняться — вони давно є копією.`,
    templateDeleteConfirm: "Так, видалити шаблон",
    templateToastDeleted: "Шаблон видалено",
    templateToastDeleteFailed: "Не вдалося видалити шаблон",
    templateNoneOption: "Без шаблону — поставлю галочки сам",
    templateApplyLabel: "Застосувати шаблон",
    templateApplyAria: "Оберіть шаблон прав",
    templateApplySubmit: "Застосувати",
    templateApplyHint:
      "Застосування ЗАМІНИТЬ поточний набір прав цієї людини копією шаблону. Після цього галочки можна доналаштувати.",
    templateApplyToastDone: (name: string) => `Застосовано шаблон «${name}»`,
    templateApplyToastFailed: "Не вдалося застосувати шаблон",
    templateMatch: (name: string) => `Набір збігається з шаблоном «${name}»`,

    // --- Картка співробітника -------------------------------------------------
    tabPermissions: "Права",
    tabAccount: "Акаунт",
    permissionsHeading: "Права цієї людини",
    permissionsIntro:
      "Права видаються людині, а не ролі. Знята галочка — це відкликання: воно діє з наступного ж запиту цієї людини.",
    permissionsLoadError: "Не вдалося завантажити права. Спробуйте ще раз.",
    // Порожня сітка в адміна не означає «нічого не може» — вона означає, що
    // рядків йому не потрібно. Без цього напису екран бреше найгіршим чином.
    holdsEverythingHeading: "Повний доступ за рівнем",
    holdsEverythingHint:
      "Ця людина проходить будь-яку перевірку прав за своїм рівнем, тому окремі галочки їй не видаються і порожній список нижче нічого не означає. Щоб обмежити доступ, знизьте рівень до менеджера.",
    permissionsCount: (count: number) => `Прав видано: ${count}`,
    permissionsFullAccess: "Повний доступ",
    zoneToggleAria: (zone: string) => `Видати всі права зони «${zone}»`,
    zoneExpandAria: (zone: string) => `Розгорнути зону «${zone}»`,
    zoneCollapseAria: (zone: string) => `Згорнути зону «${zone}»`,
    zoneAll: "усі",
    zoneNone: "немає",
    zonePartial: (granted: number, total: number) => `${granted} з ${total}`,
    // Право є в каталозі, але жоден ендпоінт його не вимагає. Галочка, яка
    // нічого не дає, гірша за відсутню: власник ставить «Повертати гроші»,
    // вважає, що повернення делеговано, і через місяці дізнається, що менеджер
    // увесь час отримував 403. Див. `permissions-without-routes.ts`.
    badgeNoRoute: "не діє",
    badgeNoRouteTitle:
      "Це право поки нічого не відкриває: у панелі немає дії, яка його вимагає. Поставити галочку можна, але доступ від цього не з'явиться.",
    permissionsSave: "Зберегти права",
    permissionsSaving: "Збереження…",
    permissionsToastSaved: "Права збережено",
    permissionsToastFailed: "Не вдалося зберегти права",
    permissionsReadOnly:
      "Змінювати права цієї людини ви не можете: керувати можна лише тими, хто нижче за вас.",

    accountHeading: "Керування акаунтом",
    accountReadOnly:
      "Цей акаунт на вашому рівні або вище, тож змінювати його ви не можете. Так само відповість і сервер.",
    accountSelf:
      "Це ваш власний акаунт. Роль, статус і видалення власного акаунта недоступні — інакше вихід із панелі був би незворотним.",

    statusHeading: "Доступ до панелі",
    statusActive: "Акаунт активний, людина може входити в панель.",
    statusInactive: "Акаунт вимкнено, вхід у панель заблоковано.",
    statusDeactivate: "Вимкнути доступ",
    statusActivate: "Увімкнути доступ",
    statusToastActivated: "Доступ увімкнено",
    statusToastDeactivated: "Доступ вимкнено",
    statusToastFailed: "Не вдалося змінити статус",

    passwordResetOpen: "Скинути пароль",

    deleteHeading: "Видалити службовий акаунт",
    deleteDescription: (email: string) =>
      `Акаунт ${email} буде позначено як видалений: людина більше не зможе увійти, а її дії в журналі залишаться. Пошту після цього можна зареєструвати заново.`,
    deleteConfirm: "Так, видалити акаунт",
    deleteToastDone: "Акаунт видалено",
    deleteToastFailed: "Не вдалося видалити акаунт",

    // --- Діалог призначення адміністратора ------------------------------------
    //
    // Сьогодні підтвердження немає взагалі: select — і людина отримала все.
    // Діалог перелічує саме те, що людина ОТРИМУЄ, і те, що зняти це може лише
    // власник, — бо після призначення адміністратора заступник уже не дістане.
    promoteHeading: "Призначити адміністратора?",
    promoteWho: (name: string) => `Ви призначаєте адміністратором: ${name}.`,
    promoteGain1:
      "отримує всі права в панелі — без жодної галочки й назавжди, поки ви їх не знімете;",
    promoteGain2: "читає журнал дій: хто, що і коли змінював у магазині;",
    promoteGain3:
      "повністю керує менеджерами — створює, вимикає, видаляє, видає й забирає права;",
    promoteGain4: "бачить персональні дані клієнтів і фінансові показники.",
    promoteUndo:
      "Зняти адміністратора може лише власник магазину. Заступники одне одного не чіпають.",
    promoteConfirm: "Так, призначити адміністратором",

    // --- Передача власності ---------------------------------------------------
    transferHeading: "Передати власність магазину",
    transferIntro:
      "Власник у магазині рівно один. Після передачі ви станете звичайним адміністратором: більше не зможете призначати адміністраторів і передавати власність.",
    transferTargetHint:
      "Передати можна лише чинному адміністратору з увімкненим доступом.",
    transferTargetLabel: "Новий власник",
    transferPasswordLabel: "Ваш поточний пароль",
    transferPasswordHint:
      "Це єдина дія, яку не можна скасувати повторним входом, тому вона перепитує пароль саме того, хто зараз за клавіатурою.",
    transferSubmit: "Передати власність",
    transferOpen: "Передати власність",
    transferToastDone: (email: string) => `Власність передано: ${email}`,
    transferToastFailed: "Не вдалося передати власність",
    transferWrongPassword: "Пароль не підійшов. Спробуйте ще раз.",
    transferSessionsHint:
      "Після передачі сесії обох акаунтів завершаться — вам доведеться увійти знову.",

    // --- Доступ до розділу (TASK-639) -----------------------------------------
    // `staff:read` не видається окремою галочкою (`grantable: false`): персонал
    // — справа власника й заступників, і текст так і каже, замість «попросіть».
    forbidden: "У вас немає доступу до розділу «Співробітники».",
    forbiddenHint:
      "Службові акаунти й права бачать лише власник магазину та його заступники (адміністратори). Окремо це право не видається.",

    // --- Хвиля 198: реєстр, картка й майстер за StaffProposal (TASK-1051, 1059)
    // Реєстр: підсумок, сортування, фільтри у шторці, бейджі за каноном.
    itemForms: ["співробітник", "співробітники", "співробітників"],
    summaryFound: "Знайдено",
    summaryActive: "активних",
    sortCreatedDesc: "додано, нові зверху",
    sortCreatedAsc: "додано, старі зверху",
    sortEmailAsc: "пошта, А→Я",
    sortEmailDesc: "пошта, Я→А",
    viewDefault: "Стандартний",
    filterLevel: "Рівень",
    filterStatus: "Статус",
    filterAll: "Усі",
    filterActive: "Активні",
    filterInactive: "Вимкнені",
    filtersApply: "Показати співробітників",
    chipLevel: (label: string) => `Рівень: ${label}`,
    chipStatus: (label: string) => `Статус: ${label}`,
    permissionsColumn: (count: number) =>
      countLabel(count, ["право", "права", "прав"]),
    statusOff: "Вимкнено",
    rowOpen: "Відкрити",
    cardLastSeen: (value: string) => `Вхід: ${value}`,
    // Смуга «Повний доступ мають 2 особи: Олександр (власник), Олена
    // (адміністратор).» — імена лишаються: питання смуги «хто», не «скільки».
    fullAccessOwner: "власник",
    fullAccessAdmin: "адміністратор",
    fullAccessOff: "вимкнено",
    // Липка панель збереження прав: «Змінено 2 права: + Бачити платежі, − …».
    permissionsChanged: (count: number, list: string) =>
      `Змінено ${countLabel(count, ["право", "права", "прав"])}: ${list}`,

    // Майстер: степер «Хто → Доступ → Вхід». Третій крок на артборді —
    // «Запрошення» листом; листів-запрошень API ще не має (TASK-1059), тож
    // крок чесно називається «Вхід» і просить початковий пароль, як і раніше.
    stepperAria: "Кроки додавання співробітника",
    stepWho: "Хто",
    stepWhoHint: "пошта та ім'я",
    stepAccess: "Доступ",
    stepAccessHint: "рівень і шаблон прав",
    stepAccessConfirm: "рівень «Адміністратор» — підтвердіть",
    stepLogin: "Вхід",
    stepLoginHint: "початковий пароль",
    fieldEmailHint: "Пошта — це логін для входу в панель.",
    fieldTemplate: "Шаблон прав",
    fieldTemplateHint:
      "Шаблон — готовий набір галочок. Нижче його можна доналаштувати, а окремі права змінити й потім, на картці співробітника.",
    adminConfirmLead: "Ви призначаєте адміністратором:",
    adminConfirmTail: "Адміністратор:",
    adminGain1: "отримує всі права в панелі — без жодної галочки;",
    adminGain2: "читає журнал дій;",
    adminGain3: "повністю керує менеджерами;",
    adminGain4: "бачить персональні дані клієнтів і фінансові показники.",
    adminUndo: "Зняти адміністратора може лише власник магазину.",
    loginHeading: "Як людина увійде вперше",
    passwordHandOver:
      "Передасте пароль особисто — людина зможе змінити його у своєму профілі.",
    accessSummary: (level: string, rights: string, template?: string) =>
      template ? `${level} · «${template}», ${rights}` : `${level} · ${rights}`,
  },

  // --- Action log (TASK-318) --------------------------------------------------
  auditLog: {
    metaTitle: "Журнал дій — Адмін",
    heading: "Журнал дій",
    intro:
      "Хто, що і коли змінив у панелі. Записи не редагуються й не видаляються.",
    loadError: "Не вдалося завантажити журнал. Спробуйте ще раз.",
    empty: "Записів ще немає.",
    emptyFiltered: "Немає записів за поточними фільтрами.",
    colWhen: "Коли",
    colWho: "Хто",
    // Wave 198 (Ж1): the column is a sentence now, not a code.
    colAction: "Що зроблено",
    colEntity: "Об'єкт",
    filterActionPlaceholder: "Дія (напр. product.update)",
    filterActionAria: "Фільтр за дією",
    filterEntityAria: "Фільтр за типом об'єкта",
    filterEntityAll: "Усі",
    systemActor: "Система",
    // The log denormalises the actor's email on purpose, so an entry stays
    // readable after the account is deleted. Show that, never a raw id.
    deletedActor: (email: string) => `${email} (акаунт видалено)`,
    noEntity: "—",
    diffCaption: "Що змінилося",
    diffFrom: "Було",
    diffTo: "Стало",

    // TASK-423 — the entity filter's options, and the panel's names for the raw
    // `entityType` values the interceptor writes (a controller's class name,
    // lowercased). The KEY is the wire value and must match the server exactly;
    // the label is what the owner reads. Ordered by the Ukrainian label so the
    // Select reads as a list rather than as an inventory of our modules.
    //
    // The filter was a free-text box until now, matched EXACTLY on the server —
    // so «Product» (as the old placeholder suggested!) matched nothing and said
    // «Немає записів», which is what an empty log says too.
    entityLabels: {
      banner: "Банери",
      blog: "Блог",
      brand: "Бренди",
      review: "Відгуки",
      productGroup: "Групи товарів",
      addonService: "Додаткові послуги",
      delivery: "Доставка",
      uploads: "Завантаження файлів",
      order: "Замовлення",
      catalogImport: "Імпорт каталогу",
      carousel: "Каруселі",
      category: "Категорії",
      siteContact: "Контакти сайту",
      user: "Користувачі",
      // TASK-441 — the media library. Deliberately its own label rather than a
      // fold into `uploads` (a file dropped straight into one content form) or
      // `productImage` (a photo bound to one product): an asset here belongs to
      // no entity and may be reused by all of them, so sharing a label would
      // make the log's entity filter answer the wrong question.
      media: "Медіатека",
      // TASK-430 — the customer-notes journal is audited like everything else
      // behind a permission, so its entries need a name here too.
      userNote: "Нотатки про клієнтів",
      payment: "Оплати",
      // TASK-476 — службові акаунти переїхали з «Користувачі» у власний розділ
      // «Персонал». Окрема мітка, а не фолд у `user`: у журналі «створено акаунт»
      // для покупця і для адміністратора — різні події, і фільтр має вміти
      // показати саме другі.
      staff: "Співробітники",
      faq: "Питання й відповіді",
      // TASK-477 — набори прав, які КОПІЮЮТЬСЯ людині при застосуванні. Окрема
      // мітка, а не фолд у `staff`: правка шаблону нікому нічого не змінює (це
      // інваріант 5), і в журналі ці два види подій мають читатися по-різному —
      // «Персонал — змінено права» стосується конкретної людини, «Шаблони прав —
      // змінено» не стосується нікого.
      permissionTemplate: "Шаблони прав",
      return: "Повернення",
      contact: "Повідомлення",
      search: "Пошуковий індекс",
      device: "Пристрої",
      discount: "Промокоди",
      page: "Сторінки",
      product: "Товари",
      productImage: "Фото товарів",
      attributeDefinition: "Характеристики",
      seoSettings: "SEO-налаштування",
      // TASK-559: PUT /admin/search/synonyms → `searchSynonyms.update`.
      searchSynonyms: "Синоніми пошуку",
    },

    // ── TASK-430: the log in Ukrainian ────────────────────────────────────────
    //
    // Until now the «Дія» column printed the raw machine key — `order.updateStatus`,
    // `seoSettings.uploadLogo` — which is the first thing an owner sees on this
    // screen and the last thing they can read.
    //
    // The label is COMPOSED from two axes rather than kept as one map of 110
    // strings, and that is the load-bearing decision here. An action is always
    // `<entityType>.<handlerName>` (AuditInterceptor builds it from the controller
    // class name and the method name), so the entity half is ALREADY named above
    // for the entity filter, and only the verb half is new. Composition means a new
    // module with familiar verbs — create / update / delete — needs exactly one new
    // entry (its entityLabels name), not one per route; a flat per-action map would
    // need six and would rot the moment somebody forgot.
    //
    // NOTHING GUARANTEES COMPLETENESS, and the UI never pretends otherwise: an
    // action whose entity or verb is missing here renders as the raw key, exactly
    // as it does today. What keeps the map from rotting is
    // `audit-action-labels.spec.ts` in store-api, which walks the real controller
    // metadata the way `permission.catalog.spec.ts` does and fails the build when an
    // audited action has no label — and when a label here matches no route any more.
    actionVerbs: {
      activate: "активовано",
      activateBrand: "активовано бренд",
      activateModel: "активовано модель",
      activateUser: "активовано акаунт",
      apply: "застосовано",
      approve: "схвалено",
      // TASK-441 — фото з медіатеки, прикріплене до галереї товару. Окреме
      // слово, а не «додано»: файл не завантажували, його взяли з медіатеки, і
      // саме це має бути видно у журналі.
      attach: "прикріплено зображення",
      cancel: "скасовано",
      // TASK-396. Власник перевів вхід клієнта на нову пошту на його прохання.
      // У «Змінах» — адреса до й після та причина звернення; нова адреса ще не
      // підтверджена, лист із підтвердженням пішов на неї.
      changeEmail: "змінено email для входу",
      clearProductDelta: "скинуто винятки для товару",
      // TASK-620: lifting an operator's mistaken «Кошти повернено».
      correctPaymentStatus: "виправлено помилкову мітку «Кошти повернено»",
      create: "створено",
      createBrand: "створено бренд",
      createCategory: "створено категорію",
      createModel: "створено модель",
      deactivate: "деактивовано",
      deactivateBrand: "деактивовано бренд",
      deactivateModel: "деактивовано модель",
      deactivateUser: "деактивовано акаунт",
      delete: "видалено",
      deleteCategory: "видалено категорію",
      deleteLogo: "видалено логотип",
      // TASK-589. The audit action set is DERIVED from the guarded mutating
      // routes, so `POST /admin/reviews/authors/:userId/hide` produces
      // `review.hideAuthor` the moment it exists — and without a verb here the
      // owner's audit log prints the raw key.
      hideAuthor: "приховано відгуки автора",
      // TASK-484. `POST /admin/orders/:orderId/access-link` derives
      // `order.issueAccessLink`. Worth its own verb rather than a generic
      // «створено»: this row is the record that somebody retired the link a
      // customer was holding, and when support asks "чому в клієнта перестало
      // відкриватись посилання", this line is the answer.
      issueAccessLink: "видано нове посилання для покупця",
      moderateMany: "промодеровано (масово)",
      publish: "опубліковано",
      refund: "повернено кошти",
      reindex: "перебудовано",
      reject: "відхилено",
      remove: "видалено",
      reorder: "змінено порядок",
      reorderBrands: "змінено порядок брендів",
      reorderCategories: "змінено порядок категорій",
      // TASK-587. The audit action set is DERIVED from the guarded mutating
      // routes, so `POST /admin/reviews/:id/reply` produces `review.reply` the
      // moment it exists — and without a verb here the owner's audit log prints
      // the raw key. One label, no UI: the reply screen itself is TASK-591.
      reply: "надано відповідь",
      resolve: "закрито",
      setCategoryTemplate: "налаштовано шаблон категорії",
      setColorMany: "задано колір (масово)",
      setGroupMany: "призначено групу (масово)",
      setItems: "змінено склад",
      setPassword: "скинуто пароль",
      setProductDelta: "задано винятки для товару",
      setStatus: "змінено статус",
      setStatusMany: "змінено статус (масово)",
      // TASK-478. Не «змінено власника» — передача власності магазину є єдиною
      // дією, яку не можна делегувати нікому, і в журналі вона має читатися саме
      // так, а не як ще одне редагування акаунта. Деталі — у полі «Зміни»:
      // isOwner from → to, обидві сторони на ім'я.
      transferOwnership: "передано власність магазину",
      unhideAuthor: "повернено відгуки автора",
      unpublish: "знято з публікації",
      update: "змінено",
      updateBrand: "змінено бренд",
      updateCategory: "змінено категорію",
      updateDetails: "змінено дані",
      updateDeviceCompat: "змінено сумісність",
      updateGroupDeviceCompat: "змінено сумісність групи",
      updateModel: "змінено модель",
      updatePaymentStatus: "змінено статус оплати",
      // TASK-477. Рядок пише не `AuditInterceptor`, а сам маршрут (див.
      // `records-own-audit.decorator.ts`) — бо цікава половина відповіді на «хто
      // тихо видав менеджеру доступ до замовлень?» це стан ДО запису, якого в
      // перехоплювача немає. Ключ дії той самий, тож мітка потрібна так само.
      updatePermissions: "змінено права",
      updateRole: "змінено роль",
      updateSettings: "змінено налаштування",
      updateSpecs: "змінено характеристики",
      updateStatus: "змінено статус",
      updateStatusMany: "змінено статус (масово)",
      upload: "завантажено файл",
      uploadBannerImage: "завантажено зображення банера",
      uploadBlogCover: "завантажено обкладинку статті",
      uploadBrandLogo: "завантажено логотип бренду",
      uploadCategoryImage: "завантажено зображення категорії",
      uploadLogo: "завантажено логотип",
    },

    /** How the two halves are joined: «Замовлення — змінено статус». */
    actionLabel: (entity: string, verb: string) => `${entity} — ${verb}`,

    // ── TASK-430: «мої дії / інші співробітники» ──────────────────────────────
    //
    // Two independent axes, one query param each, because `TableFilters` owns
    // exactly one param per control — and because they answer different questions.
    //
    // «Мої дії» writes the viewer's OWN uuid into the existing `actorId` param
    // rather than a server-resolved `actor=mine`: this screen's whole point is a
    // link you can paste to a colleague (see the AuditLogView header), and a
    // `mine` that resolves per-viewer would show the recipient their own actions.
    // The uuid is ugly in the URL and exact in meaning; exact wins here.
    //
    // The role axis is the new `actorRole` filter. For this shop «інші
    // співробітники» IS «Менеджери» — the owner is the ADMIN — and unlike a
    // negated actor filter it keeps working after a manager is dismissed, because
    // the role is denormalised onto every entry.
    filterActorAria: "Фільтр за автором дії",
    filterActorAll: "Усі",
    filterActorMine: "Мої дії",
    /** An `actorId` from a pasted link that is not the viewer's own. */
    filterActorOther: (id: string) => `Співробітник ${id.slice(0, 8)}…`,
    filterRoleAria: "Фільтр за роллю",
    filterRoleAll: "Будь-який",

    // --- Доступ до розділу (TASK-639) -----------------------------------------
    // `audit:read` не видається окремою галочкою (`grantable: false`), тож
    // «попросіть власника» було б порадою в нікуди — кажемо, хто його має.
    forbidden: "У вас немає доступу до журналу дій.",
    forbiddenHint:
      "Журнал дій бачать лише власник магазину та його заступники (адміністратори). Окремо це право не видається.",

    // --- Реєстр (хвиля 198, TASK-1068, AuditLogProposal Ж1–Ж6) ----------------
    itemForms: ["запис", "записи", "записів"],
    summaryFound: "Знайдено",
    viewDefault: "Стандартний",
    sortCreatedDesc: "коли, нові зверху",
    sortCreatedAsc: "коли, старі зверху",
    sortActorAsc: "хто, А–Я",
    sortActorDesc: "хто, Я–А",
    sortActionAsc: "що зроблено, А–Я",
    sortActionDesc: "що зроблено, Я–А",
    // Групи за днями (Ж1).
    dayToday: (date: string) => `Сьогодні, ${date}`,
    dayYesterday: (date: string) => `Вчора, ${date}`,
    // Що змінилося — під реченням і в розгорнутому записі (Ж2). «Було» відоме
    // лише там, де маршрут сам пише запис (права, власність); решта записів
    // зберігає тільки тіло запиту — людське «Було» скрізь є хвостом API.
    changeTo: (field: string, to: string) => `${field} → ${to}`,
    changeFromTo: (field: string, from: string, to: string) =>
      `${field} ${from} → ${to}`,
    moreChanges: (count: number) => `ще ${count}`,
    diffField: "Поле",
    diffEmpty: "Змінених полів запис не містить.",
    valueYes: "так",
    valueNo: "ні",
    technicalDetails: "Технічні деталі",
    copyId: "Скопіювати ID",
    copiedId: "Скопійовано",
    copyIdFailed: "Не вдалося скопіювати",
    copyIdAria: (ref: string) => `Скопіювати повний ID ${ref}`,
    // «Фільтри» (Ж3). Кілька співробітників і рівень «Власник» API не вміє —
    // хвости TASK-1068; швидких видів за областю теж немає з тієї ж причини.
    filterActor: "Співробітник",
    filterActorSearch: "Знайти співробітника…",
    filterActorSearchAria: "Пошук співробітника",
    filterActorHint:
      "У списку — усі, хто колись діяв у панелі, зокрема вимкнені.",
    filterPeriod: "Період",
    periodToday: "Сьогодні",
    period7Days: "7 днів",
    period30Days: "30 днів",
    periodCustom: "Свій",
    periodSince: (date: string) => `з ${date}`,
    periodUntil: (date: string) => `до ${date}`,
    filterLevel: "Рівень",
    filterEntity: "Що змінювали",
    filtersApply: "Показати записи",
    filtersApplyCount: (countLabel: string) => `Показати ${countLabel}`,
    chipActor: (name: string) => `Співробітник: ${name}`,
    chipLevel: (level: string) => `Рівень: ${level}`,
    chipEntity: (label: string) => `Що змінювали: ${label}`,
    chipPeriod: (range: string) => `Період: ${range}`,
    chipAction: (label: string) => `Дія: ${label}`,
    // Об'єкт запису в реченні: «Змінено статус замовлення #7C1E4B2A». Назви
    // об'єкта в записі немає (хвіст API), тож іменник + короткий номер.
    entityNouns: {
      addonService: "послуга",
      attributeDefinition: "характеристика",
      banner: "банер",
      blog: "стаття",
      brand: "бренд",
      carousel: "карусель",
      catalogImport: "імпорт каталогу",
      category: "категорія",
      contact: "повідомлення",
      delivery: "доставка",
      device: "пристрій",
      discount: "промокод",
      faq: "питання",
      media: "файл медіатеки",
      order: "замовлення",
      page: "сторінка",
      payment: "оплата замовлення",
      permissionTemplate: "шаблон прав",
      product: "товар",
      productGroup: "група товарів",
      productImage: "фото товару",
      return: "повернення",
      review: "відгук",
      search: "пошуковий індекс",
      searchSynonyms: "синоніми пошуку",
      seoSettings: "SEO-налаштування",
      siteContact: "контакти сайту",
      staff: "співробітник",
      uploads: "файл",
      user: "клієнт",
      userNote: "нотатка про клієнта",
    },
    // «Поле» людськими словами (Ж2). Ключ — поле тіла запиту; невідоме поле
    // показується як є.
    fieldLabels: {
      attributes: "Характеристики",
      brandId: "Бренд",
      categoryId: "Категорія",
      code: "Код",
      compareAtPrice: "Стара (закреслена) ціна",
      description: "Опис",
      email: "Email",
      expiresAt: "Діє до",
      firstName: "Ім'я",
      groupId: "Група",
      image: "Зображення",
      internalNotes: "Внутрішні нотатки",
      isActive: "Показується",
      isOwner: "Власник",
      keywords: "Ключові слова",
      lastName: "Прізвище",
      maxRedemptions: "Ліміт використань",
      metaDescription: "SEO-опис",
      metaTitle: "SEO-заголовок",
      minSpend: "Мінімальна сума",
      name: "Назва",
      operatorNotes: "Примітки",
      outcome: "Результат",
      parentId: "Батьківська категорія",
      paymentStatus: "Статус оплати",
      permissions: "Права",
      phone: "Телефон",
      positionOrder: "Порядок",
      price: "Ціна",
      reason: "Причина",
      refundedAmount: "Сума повернення",
      restock: "Повернути на склад",
      role: "Роль",
      shippingAddress: "Адреса доставки",
      sku: "Артикул",
      slug: "Адреса (slug)",
      startsAt: "Діє з",
      status: "Статус",
      stock: "Залишок",
      title: "Заголовок",
      trackingNumber: "ТТН",
      type: "Тип",
      value: "Значення",
    },
  },

  // --- Own admin profile (TASK-317) -------------------------------------------
  profile: {
    metaTitle: "Мій профіль — Адмін",
    heading: "Мій профіль",
    accountSection: "Акаунт",
    fieldEmail: "Електронна пошта",
    // Wave 198: the access LEVEL (owner / admin / manager), as on «Персонал».
    fieldRole: "Рівень",
    fieldUserId: "ID",
    permissionsSection: "Ваші права",
    permissionsOwner:
      "Ви власник магазину: усі права, зокрема керування персоналом і журнал дій.",
    permissionsEmpty:
      "Вам поки не видано жодного права. Зверніться до власника магазину.",
    permissionsLoading: "Завантаження прав…",
    passwordSection: "Зміна пароля",
    passwordDescription:
      "Після зміни пароля всі інші ваші сесії буде завершено.",
    currentPassword: "Поточний пароль",
    newPassword: "Новий пароль",
    confirmPassword: "Повторіть новий пароль",
    passwordSubmit: "Змінити пароль",
    passwordToastDone: "Пароль змінено",
    passwordToastFailed: "Не вдалося змінити пароль",
    passwordWrongCurrent: "Поточний пароль вказано невірно.",
    passwordMismatch: "Паролі не збігаються",
    passwordWeak:
      "Пароль має містити щонайменше 8 символів, велику й малу літери та цифру",
    passwordRequired: "Вкажіть пароль",
    // Wave 198 (TASK-1055, ProfileProposal П1–П4).
    fieldName: "Ім'я",
    // The owner's level here is the shop's owner, not «Адміністратор» (which
    // the old role line said, out of step with the header's «Власник»).
    levelOwner: "Власник магазину",
    copyId: "Скопіювати",
    copyIdDone: "Скопійовано",
    copyIdFailed: "Не вдалося скопіювати — виділіть ID вручну",
    copyIdAria: "Скопіювати ID",
    permissionsOtherZone: "Інше",
    permissionsMoreHint:
      "Потрібно більше? Попросіть власника додати право в розділі «Співробітники» — на вашій картці.",
  },

  // --- Newsletter subscribers (TASK-188) --------------------------------------
  subscribers: {
    metaTitle: "Підписники — Адмін",
    heading: "Підписники розсилки",
    // `GET /api/newsletter/admin` шукає лише за email — ім'я клієнта й
    // пристрій з артборда ПД1 є хвостом API, тож плейсхолдер їх не обіцяє.
    searchPlaceholder: "Пошук за email…",
    searchAria: "Пошук підписників",
    filterStatusAria: "Фільтр за статусом",
    statusSubscribed: "Підписаний",
    statusUnsubscribed: "Відписався",
    loadError: "Не вдалося завантажити підписників. Спробуйте ще раз.",
    colEmail: "Email",
    colStatus: "Статус",
    colSource: "Джерело",
    colDate: "Підписався",
    sourceEmpty: "—",
    exportError: "Не вдалося експортувати CSV. Спробуйте ще раз.",

    // --- Wave 198, SubscribersProposal ПД1–ПД9 (TASK-1063) --------------------
    // «…і хто чекає на товар» з артборда — лише з вкладкою «Чекають на товар»
    // (TASK-1066); до того підпис каже те, що на екрані є.
    intro: "Хто погодився отримувати листи магазину.",
    viewSubscribed: "Підписані",
    viewUnsubscribed: "Відписані",
    viewAll: "Усі",
    itemForms: ["підписник", "підписники", "підписників"],
    summaryFound: "Знайдено",
    summaryBreakdown: (subscribed: number, unsubscribed: number) =>
      `підписаних ${subscribed}, відписались ${unsubscribed}`,
    sortCreatedDesc: "підписався, нові зверху",
    sortCreatedAsc: "підписався, старі зверху",
    sortEmailAsc: "email, А→Я",
    sortEmailDesc: "email, Я→А",
    sortStatusAsc: "статус, спершу підписані",
    sortStatusDesc: "статус, спершу відписані",
    viewDefault: "Стандартний",
    filterStatus: "Статус",
    filtersApply: "Показати підписників",
    chipStatus: (label: string) => `Статус: ${label}`,
    chipSearch: (query: string) => `Пошук: «${query}»`,
    colUnsubscribed: "Відписався",
    // Ключі `source` з вітрини (`NewsletterSubscribeForm source=…`) людською
    // мовою; невідомий ключ показуємо як є, а не ховаємо.
    sourceHome: "Головна",
    sourcePromo: "Сторінка акції",
    sourceBlog: "Блог",
    sourceFooter: "Футер сайту",
    emptyAllTitle: "Підписників ще немає",
    emptyAllBody:
      "Вони з'являться, коли відвідувачі підпишуться на розсилку — на головній сторінці, на сторінці акції або в блозі.",
    emptySearchTitle: (query: string) => `Нікого за запитом «${query}»`,
    emptySearchBody: (query: string) =>
      `Немає адрес із «${query}». Перевірте написання або скиньте пошук.`,
    emptySearchReset: "Скинути пошук",
    emptyStatusTitle: (label: string) =>
      `Немає підписників зі статусом «${label}»`,
    emptyStatusBody: "Спробуйте інший вид або скиньте фільтр.",
    emptyReset: "Скинути фільтри",
    exportFootnote: "Разом із датою й джерелом згоди — на випадок перевірки.",
    rowOpen: "Картка підписника",
    cardSince: (date: string) => `з ${date}`,
    cardSection: "Підписка",
    cardUpdated: "Остання зміна",
  },

  userBan: {
    toastDeactivated: "Акаунт клієнта деактивовано.",
    toastActivated: "Акаунт клієнта активовано.",
    toastFailed: "Не вдалося оновити статус клієнта.",
    cannotSelf: "Неможливо деактивувати власний акаунт.",
    deactivateUserAria: "Деактивувати клієнта",
    activateUserAria: "Активувати клієнта",
    // Wave 198, UsersProposal К6 — деактивація лише через AlertDialog.
    deactivateOpen: "Деактивувати…",
    confirmTitle: "Деактивувати акаунт клієнта?",
    confirmDescription: (who: string) =>
      `${who} більше не зможе увійти в кабінет на сайті. Його замовлення, відгуки й нотатки лишаться. Повернути доступ можна будь-коли кнопкою «Активувати».`,
    confirmAction: "Деактивувати",
  },

  statusToggle: {
    productDeactivate: "Приховати",
    productActivate: "Показати",
    categoryDeactivate: "Приховати категорію",
    categoryActivate: "Показувати категорію на сайті",
  },

  // --- Product groups (TASK-115 / TASK-142) -----------------------------------
  productGroups: {
    metaTitle: "Групи товарів — Адмін",
    metaTitleNew: "Створення групи — Адмін",
    metaTitleEdit: "Редагування групи — Адмін",
    heading: "Групи товарів",
    add: "Додати групу",
    loadError: "Не вдалося завантажити групи товарів. Спробуйте ще раз.",
    empty: "Груп товарів ще немає. Створіть свою першу групу.",
    searchPlaceholder: "Пошук за назвою групи…",
    searchAria: "Пошук груп товарів",
    emptyMatch: (q: string) => `Немає груп за запитом «${q}».`,
    colName: "Назва",
    colAxes: "Осі",
    colPositions: "Позиції",
    colStatus: "Статус",
    back: "← Назад до груп",
    createHeading: "Створення групи",
    editHeading: "Редагування групи",
    createSubmit: "Створити групу",
    loadOneError: "Не вдалося завантажити групу. Спробуйте ще раз.",
    positionsHeading: "Позиції в цій групі",
    positionsEmpty:
      "Позицій ще не призначено. Призначте товар до цієї групи у селекторі «Група» форми товару.",
    toastCreated: "Групу створено",
    toastCreateFailed: "Не вдалося створити групу",
    toastUpdated: "Групу оновлено",
    toastUpdateFailed: "Не вдалося оновити групу",
  },

  productGroupForm: {
    name: "Назва",
    axes: "Осі атрибутів",
    axesHint:
      "Упорядковані назви осей, які вітрина відображає як селектори (напр. колір, набір). Порядок тут задає порядок відображення кожної осі.",
    axisPlaceholder: "назва осі (напр. color)",
    axisNameAria: (i: number) => `Назва осі ${i}`,
    removeAxisAria: (i: number) => `Видалити вісь ${i}`,
    addAxis: "Додати вісь",
    active: "Активна",
    submit: "Зберегти групу",
    errors: {
      nameRequired: "Вкажіть назву",
      nameMax: "Назва має містити не більше 255 символів",
    },
  },

  productImages: {
    upload: "Завантажити зображення",
    hint: "JPEG, PNG, WebP або GIF — до 20 МБ кожен; великі зменшимо самі.",
    loadError: "Не вдалося завантажити зображення. Спробуйте ще раз.",
    empty:
      "Зображень ще немає. Завантажте перше, щоб задати обкладинку товару.",
    primary: "Обкладинка",
    alt: "Зображення товару",
    moveLeft: "Перемістити ліворуч",
    moveRight: "Перемістити праворуч",
    setPrimary: "Зробити обкладинкою",
    deleteImage: "Видалити зображення",
    deleteTitle: "Видалити зображення?",
    deleteDescription:
      "Це назавжди видалить зображення з товару та сховища. Дію не можна скасувати.",
    toastUploaded: "Зображення завантажено",
    toastUploadFailed: "Помилка завантаження — перевірте тип і розмір файлу",
    toastReorderFailed: "Не вдалося змінити порядок зображень",
    toastDeleted: "Зображення видалено",
    toastDeleteFailed: "Не вдалося видалити зображення",
    // TASK-424 — drag-and-drop a batch. Each photo is its own request, so one
    // rejected file no longer takes the whole batch down with it; the queue below
    // reports each file separately and offers a retry per file.
    dropZone: "Перетягніть фото сюди",
    dropZoneOr: "або",
    dropZoneActive: "Відпустіть, щоб завантажити",
    dropZoneAria:
      "Зона для перетягування зображень товару. Або скористайтеся кнопкою «Завантажити зображення».",
    queueHeading: "Завантаження",
    queueProgress: (done: number, total: number) => `Готово ${done} з ${total}`,
    statusQueued: "У черзі",
    statusUploading: "Завантаження…",
    statusDone: "Готово",
    statusFailed: "Не вдалося",
    retry: "Повторити",
    retryAll: "Повторити невдалі",
    clearQueue: "Очистити список",
    errorTooLarge: "Файл завеликий — максимум 20 МБ.",
    errorUnsupportedType: "Не зображення або непідтримуваний формат.",
    errorGeneric: "Не вдалося завантажити. Спробуйте ще раз.",
    announceUploaded: (name: string) => `${name} — завантажено`,
    announceFailed: (name: string, reason: string) => `${name} — ${reason}`,
    announceAllDone: (done: number, failed: number) =>
      failed === 0
        ? `Завантаження завершено: ${done}`
        : `Завантаження завершено: ${done}, не вдалося ${failed}`,
    // TASK-442 — фото, підібрані ще до створення товару. Завантажити їх нікуди
    // (ендпоінт має `:id`), тож вони чекають у списку до натискання «Створити
    // товар»; перше в списку стане головним.
    stagedHint:
      "Фото завантажаться одразу після створення товару. Перше в списку стане головним.",
    stagedEmpty: "Фото ще не додано.",
    stagedCount: (count: number) => `Готово до завантаження: ${count}`,
    removeStaged: (name: string) => `Прибрати «${name}» зі списку`,
    // Хвиля 198 (TASK-1050, TASK-1104): обкладинка — це перше фото.
    coverHint: "Порядок — стрілками. Перше фото — обкладинка.",
  },

  // Media library («Медіатека», TASK-441, план 177) — окремий екран `/media`:
  // сітка всіх завантажених зображень, пачкове завантаження, пошук за описом і
  // тегом, редагування опису/тегів і видалення з перевіркою використання.
  //
  // Помилки завантаження (errorTooLarge / errorUnsupportedType / errorGeneric)
  // навмисно повторюють формулювання з `productImages`: це той самий
  // `imageUploadErrorMessage` і той самий контракт статусів API, тож одна й та
  // сама відмова не повинна звучати по-різному на двох екранах.
  mediaLibrary: {
    metaTitle: "Медіатека — Адмін",
    heading: "Медіатека",
    subheading:
      "Усі завантажені зображення в одному місці. Опис і теги допомагають знайти потрібне, а видалити можна лише те, що ніде не використовується.",
    searchPlaceholder: "Пошук за описом або тегом",
    searchAria: "Пошук у медіатеці",
    loadError: "Не вдалося завантажити медіатеку. Спробуйте ще раз.",
    empty:
      "У медіатеці ще немає зображень. Завантажте перше — і його можна буде використати будь-де.",
    readOnlyHint:
      "У вас є доступ лише до перегляду медіатеки. Щоб завантажувати або видаляти зображення, попросіть власника надати право «Завантажувати та видаляти медіа».",

    // ── Пачкове завантаження ────────────────────────────────────────────────
    upload: "Завантажити файли",
    dropZone: "Перетягніть зображення сюди",
    dropZoneOr: "або",
    dropZoneActive: "Відпустіть, щоб завантажити",
    dropZoneAria:
      "Зона для перетягування зображень. Або скористайтеся кнопкою «Завантажити файли».",
    hint: "JPEG, PNG, WebP або GIF — до 20 МБ кожен; великі зменшимо самі.",
    queueHeading: "Завантаження",
    queueProgress: (done: number, total: number) => `Готово ${done} з ${total}`,
    statusQueued: "У черзі",
    statusUploading: "Завантаження…",
    statusDone: "Готово",
    statusFailed: "Не вдалося",
    retry: "Повторити",
    retryAll: "Повторити невдалі",
    clearQueue: "Очистити список",
    errorTooLarge: "Файл завеликий — максимум 20 МБ.",
    errorUnsupportedType: "Не зображення або непідтримуваний формат.",
    errorGeneric: "Не вдалося завантажити. Спробуйте ще раз.",
    toastUploaded: "Зображення завантажено",
    toastUploadFailed: "Помилка завантаження — перевірте тип і розмір файлу",
    announceUploaded: (name: string) => `${name} — завантажено`,
    announceFailed: (name: string, reason: string) => `${name} — ${reason}`,
    announceAllDone: (done: number, failed: number) =>
      failed === 0
        ? `Завантаження завершено: ${done}`
        : `Завантаження завершено: ${done}, не вдалося ${failed}`,

    // ── Картка в сітці ──────────────────────────────────────────────────────
    openCardAria: (name: string) => `Відкрити зображення «${name}»`,
    noAlt: "Без опису",
    usedInBadge: (count: number) => `Використовується: ${count}`,
    unusedBadge: "Ніде не використовується",
    thumbAlt: "Зображення з медіатеки",

    // ── Картка деталей ──────────────────────────────────────────────────────
    detailTitle: "Зображення",
    detailLoadError: "Не вдалося завантажити дані зображення.",
    close: "Закрити",
    altLabel: "Опис (alt)",
    altPlaceholder: "Напр.: Чохол MagSafe для iPhone 16 Pro, чорний",
    altHint:
      "Що зображено. Його читають незрячі користувачі й пошукові системи. Порожнє поле означає «зображення декоративне».",
    tagsLabel: "Теги",
    tagsPlaceholder: "банер, iphone",
    tagsHint: "Через кому. До 20 тегів — за ними працює пошук.",
    tagsInvalid:
      "Забагато тегів або задовгий тег: максимум 20 тегів, кожен до 50 символів.",
    saving: "Збереження…",
    saved: "Збережено",
    saveError: "Не вдалося зберегти. Спробуйте ще раз.",
    dimensions: (width: number, height: number) => `${width} × ${height} px`,
    unknownValue: "невідомо",
    openOriginal: "Відкрити оригінал",
    uploadedAt: "Завантажено",

    // ── Використання та видалення ───────────────────────────────────────────
    usageHeading: "Де використовується",
    usageEmpty: "Ніде не використовується — можна видалити.",
    usageRow: (kind: string, label: string) => `${kind} — «${label}»`,
    delete: "Видалити",
    deleteConfirmQuestion: "Видалити це зображення назавжди?",
    deleteConfirm: "Так, видалити",
    deleteBlocked:
      "Спочатку приберіть або замініть це зображення там, де воно використовується.",
    // 409: використання зʼявилося вже після того, як ми показали картку.
    conflictHeading: "Зображення досі використовується — видалити не можна",
    conflictHint:
      "Ось де воно стоїть просто зараз. Приберіть або замініть його там, а потім поверніться сюди.",
    toastDeleted: "Зображення видалено",
    toastDeleteFailed: "Не вдалося видалити зображення",

    // Наші українські назви для `MediaUsageEntity.kind` — API навмисно не
    // віддає жодного тексту для операторки, лише назву колонки.
    usageKinds: {
      PRODUCT_IMAGE: "Фото товару",
      PRODUCT_DESCRIPTION: "Опис товару",
      PRODUCT_OG_IMAGE: "Соцкартка товару",
      CATEGORY_IMAGE: "Зображення категорії",
      CATEGORY_OG_IMAGE: "Соцкартка категорії",
      BRAND_LOGO: "Логотип бренду",
      BANNER_IMAGE: "Банер",
      BLOG_COVER_IMAGE: "Обкладинка статті",
      BLOG_OG_IMAGE: "Соцкартка статті",
      BLOG_CONTENT: "Текст статті",
      PAGE_CONTENT: "Текст сторінки",
      PAGE_OG_IMAGE: "Соцкартка сторінки",
      SEO_DEFAULT_OG_IMAGE: "Соцкартка сайту",
      SEO_STORE_LOGO: "Логотип магазину",
    },
  },

  // Пікер медіатеки (TASK-441, крок e) — одна кнопка в кожній формі, два шляхи:
  // взяти наявне зображення або завантажити нове (яке одразу стає ассетом
  // медіатеки, а не разовим файлом у полі).
  mediaPicker: {
    trigger: "З медіатеки",
    title: "Медіатека",
    description:
      "Оберіть наявне зображення або завантажте нове — воно одразу потрапить до медіатеки й буде доступне в інших формах.",
    tabBrowse: "Обрати наявне",
    tabUpload: "Завантажити нове",
    // Та сама плитка, що й на екрані «/media», але робить вона інше — і
    // доступна назва це єдине місце, де незряча операторка про це дізнається.
    pickCardAria: (name: string) => `Обрати зображення «${name}»`,
    searchLabel: "Пошук у медіатеці",
    // Пікер має власну пагінацію, а не спільну TablePagination: та пише
    // `?page=` в адресу, а діалог висить над формою, чию адресу чіпати не можна.
    prevPage: "Попередня сторінка",
    nextPage: "Наступна сторінка",
    // Фото товару — єдина точка, де обране зображення не рядок-URL, а рядок у
    // галереї, тож тут є свій запит і свої повідомлення.
    toastAttached: "Зображення додано до галереї",
    toastAttachFailed: "Не вдалося додати зображення до галереї",
    announceAttached: (name: string) => `${name} — додано до галереї`,
    // Кнопка в тулбарі редактора.
    editorInsert: "Зображення",
    // Створення товару: галерея ще не існує (немає id), тож прикріпляти нема до
    // чого. Чесніше сказати це, ніж показати кнопку, що поверне 404.
    galleryNeedsProduct:
      "Медіатека стане доступною після збереження — зараз галереї ще не існує.",
  },

  // Content map («Де що на сайті», TASK-264) — an orientation page that maps each
  // storefront region to the admin section that edits it, with a live active
  // count + shown/hidden marker. Copy is written at the category level ("N
  // active items exist here"), reusing the FAQ "Показується"/"Приховано" wording.
  contentMap: {
    // TASK-720: the heading repeats the sidebar item (nav.contentMap) — the page
    // used to be called «Карта контенту» under a menu item with another name.
    metaTitle: "Де що на сайті — Адмін",
    heading: "Де що на сайті",
    subheading:
      "Що де показується на сайті — і в якому розділі це редагувати. Оберіть блок, щоб перейти прямо до потрібного розділу.",
    loadError: "Не вдалося порахувати",
    loading: "Рахуємо…",
    statusShown: "Показується",
    statusHidden: "Приховано",
    // aria-label for the numeric active-item count sitting next to a zone.
    countAria: (count: number) => `Активних елементів: ${count}`,
    // Small caption clarifying which storefront page(s) a zone appears on.
    appliesToLabel: "Де видно:",
    // The static, non-clickable note covering catalog/PDP product content.
    catalogNote:
      "Назви, ціни, зображення й категорії товарів редагуються в розділах «Товари» та «Категорії» у меню зліва.",
    groups: {
      global: "Глобально — на кожній сторінці",
      home: "Головна сторінка",
      info: "«Інформація» та картка товару",
      blog: "Блог",
      legal: "Правові та інші сторінки",
      // AD-CNT-26 (TASK-429): /promo — окрема сторінка вітрини, як і блог.
      promo: "Сторінка «Акції»",
    },
    // TASK-720: banner zones use the placement names of the Banners screen
    // (banners.placements / bannerForm.placements) — one slot, one name.
    zones: {
      announcementBar: {
        source: "Смуга оголошень",
        target: "Банери",
        appliesTo: "Кожна сторінка (шапка)",
      },
      heroSlide: {
        source: "Головний слайдер",
        target: "Банери",
        appliesTo: "Головна",
      },
      promoTile: {
        source: "Промо-плитки",
        target: "Банери",
        appliesTo: "Головна",
      },
      promoBanner: {
        source: "Промо-банер",
        target: "Банери",
        appliesTo: "Головна",
      },
      faq: {
        source: "FAQ-блок",
        target: "FAQ",
        appliesTo: "Сторінка «Інформація» та кожна картка товару",
      },
      legalPages: {
        source: "Правові документи",
        target: "Сторінки → Юридичні",
        appliesTo: "Розділ «Правова інформація» та кожен документ",
      },
      // TASK-435 — the Pages screen now edits three different things, so the map
      // shows three entries rather than one that quietly covered all of them.
      infoPages: {
        source: "Довідкові сторінки (зокрема «Про нас»)",
        target: "Сторінки → Довідкові",
        appliesTo:
          "Розділ «Інформація та підтримка»: блок «Про нас» і кожна довідкова сторінка",
      },
      hubPages: {
        source: "Заголовок і опис розділу для Google",
        target: "Сторінки → Хаби",
        appliesTo:
          "Розділи «Категорії», «Блог», «Правова інформація», «Контакти», «Інформація», «Акції» — невидимо на сторінці (title, meta, прев'ю посилання)",
      },
      blog: {
        source: "Стрічка блогу",
        target: "Блог",
        appliesTo: "Сторінка «Блог»",
      },
      siteContact: {
        // TASK-721: lists what the Contacts form actually edits — there is no
        // address field (SiteContactSettings has none; see TASK-873).
        source:
          "Контакти (телефон, пошта, години роботи, месенджери й Instagram)",
        target: "Контакти",
        appliesTo: "Футер кожної сторінки та сторінка «Контакти»",
      },
      seoSettings: {
        // TASK-433 put the store name behind this same screen, and "where do I
        // change the name?" is exactly the question this map exists to answer.
        source: "Назва магазину, meta-заголовки та SEO за замовчуванням",
        target: "SEO",
        appliesTo:
          "Кожна сторінка: назва у вкладці браузера й у прев'ю посилань, решта — невидимо (title, meta, robots)",
      },
      // AD-CNT-26 (TASK-429): /promo існує в шапці магазину, але його не було на
      // цій карті — і з адмінки не було видно, що ним керує розділ «Промокоди».
      promoCodes: {
        source: "Промокоди тижня на сторінці «Акції»",
        target: "Промокоди",
        appliesTo: "Сторінка «Акції» (/promo), посилання в шапці",
      },
    },
  },

  // SERP-snippet preview under the meta fields (план 130, TASK-268). A live
  // Google-result mock (title / green URL / description) + char counters + a
  // "blank field = auto-generated" hint, shown under the metaTitle/
  // metaDescription fields on product/category/page forms and the /settings/seo
  // defaults form. The host of the breadcrumb line is NOT a dictionary string:
  // it comes from the environment (`STOREFRONT_HOST`, derived from
  // NEXT_PUBLIC_SITE_URL) so the preview shows the store's own domain instead
  // of an illustrative one. TASK-433 removed the former `urlHost` key — see
  // `shared/config/site.ts` for why the URL parsing lives there and not here.
  seoSnippetPreview: {
    heading: "Перегляд у результатах пошуку Google",
    emptyTitle: "(без заголовка)",
    // `{typed}/{max}` counter shown next to each field's live length.
    counter: (n: number, max: number) => `${n}/${max}`,
    titleCounterAria: (n: number, max: number) =>
      `Довжина SEO-заголовка: ${n} із рекомендованих ${max} символів`,
    descriptionCounterAria: (n: number, max: number) =>
      `Довжина SEO-опису: ${n} із рекомендованих ${max} символів`,
    // Hint line under the mock — copy chosen by which tier resolved the title.
    hintOwn: "Заголовок узято з вашого поля «SEO-заголовок» вище.",
    hintDefault:
      "Поле порожнє — показано заголовок сайту за замовчуванням (розділ «SEO»).",
    hintDerived:
      "Поле порожнє — заголовок згенеровано автоматично з назви за шаблоном сайту.",
    hintEmpty:
      "Заповніть назву або SEO-заголовок, щоб побачити, як сторінка виглядатиме в пошуку Google.",
    // Self-referential preview on /settings/seo (Design Decision 4) — a sample
    // page standing in for "a real page with no title/description of its own".
    // Its notes live in `seoSettingsForm.preview*` since TASK-552.
    samplePageName: "Чохол для iPhone 15",
    samplePageDescription:
      "Надійний силіконовий чохол для iPhone 15 із захистом кутів та підтримкою MagSafe. Доставка по Україні.",
    // Create-mode category breadcrumb placeholder (no real slug yet).
    newCategorySlug: "нова-категорія",
  },

  // «SEO-здоров'я» checklist on /settings/seo (план 131, TASK-269). An at-a-glance
  // health view: how many products/categories/pages rely on auto-generated meta
  // titles (informational, never an error), whether the site-wide defaults are
  // filled (soft amber nudge when empty), and — most importantly — a prominent
  // RED warning when the whole site is hidden from search (noindexSite).
  seoHealth: {
    heading: "Стан SEO",
    subheading:
      "Автоматичні заголовки — це не помилка: вони беруться з назви товару за шаблоном. Власні варто писати для найважливіших сторінок.",
    loadError: "Не вдалося завантажити стан SEO. Спробуйте ще раз.",
    // Auto-title rows — neutral/informational tone, counted `N із M`.
    productsAutoLabel: "Товари з автоматичним SEO-заголовком",
    categoriesAutoLabel: "Категорії з автоматичним SEO-заголовком",
    pagesAutoLabel: "Сторінки з автоматичним SEO-заголовком",
    // TASK-285: page content-gap rows (description missing / thin body). `N із M`.
    gapHint: (count: number, total: number) => `${count} із ${total}`,
    pagesMissingDescriptionLabel: "Сторінки без SEO-опису",
    pagesThinContentLabel: "Сторінки з коротким вмістом (< 300 символів)",
    // Defaults-filled row — soft amber nudge when empty, neutral when filled.
    defaultsFilledLabel: "Заголовок і опис за замовчуванням",
    defaultsFilledYes: "заповнено",
    defaultsFilledNo: "не задано",
    // noindex — the one genuinely urgent, RED state.
    noindexWarningTitle: "Сайт прихований від пошукових систем!",
    // TASK-718: the toggle this used to point at was removed (TASK-307) — the flag
    // is an emergency switch set in the database, so the advice is "call the
    // developer", not an action the operator cannot perform here.
    noindexWarningBody:
      "Зараз увесь магазин не показується в Google та інших пошукових системах. Це аварійний перемикач, який вмикають у базі даних, а не в адмінці, — тут його не зняти. Якщо це робочий магазин, негайно зверніться до розробника, інакше клієнти не знайдуть вас у пошуку.",
    noindexOkLabel: "Сайт видимий для пошукових систем",
    // Outbound eyeball links to what the storefront actually serves.
    linksHeading: "Службові файли:",
    robotsLink: "robots.txt",
    sitemapLink: "sitemap.xml",
    llmsLink: "llms.txt",
    openLinkAria: (name: string) => `Відкрити ${name} у новій вкладці`,
    // TASK-1053 (Н2): «Заповнити ↓» — down to the default title field.
    fillDefaults: "Заповнити",
  },

  // --- Recommendation carousels — list / CRUD (TASK-139) ----------------------
  carousels: {
    navLabel: "Каруселі",
    metaTitle: "Каруселі — Адмін",
    metaTitleNew: "Створення каруселі — Адмін",
    metaTitleEdit: "Редагування каруселі — Адмін",
    heading: "Каруселі рекомендацій",
    add: "Додати карусель",
    loadError: "Не вдалося завантажити каруселі. Спробуйте ще раз.",
    empty: "Каруселей ще немає. Створіть свою першу карусель.",
    colTitle: "Заголовок",
    colStatus: "Статус",
    // TASK-720: the same words as carouselForm.placementOptions and its hint — the
    // list and the form used to name one place two ways.
    placementLabels: {
      HOME_TABS: "Вкладка в блоці «Популярне»",
      HOME_RAILS: "Окремий рядок нижче",
    },
    sourceLabels: {
      BESTSELLING: "Хіти продажів",
      NEWEST: "Новинки",
      ON_SALE: "Акційні",
      CATEGORY: "Категорія",
      MANUAL: "Вибрані вручну",
    },
    statusLabels: {
      DRAFT: "Чернетка",
      SCHEDULED: "Заплановано",
      PUBLISHED: "Опубліковано",
    },
    // TASK-430: the scheduled badge carries the date, like pages/blog/banners.
    statusScheduledOn: (date: string) => `Заплановано на ${date}`,
    publish: "Опублікувати",
    unpublish: "Зняти з публікації",
    back: "← Каруселі",
    createHeading: "Нова карусель",
    editHeading: "Редагування каруселі",
    createSubmit: "Створити карусель",
    loadOneError: "Не вдалося завантажити карусель. Спробуйте ще раз.",
    toastCreated: "Карусель створено",
    toastCreateFailed: "Не вдалося створити карусель",
    toastUpdated: "Карусель оновлено",
    toastUpdateFailed: "Не вдалося оновити карусель",
    toastPublished: "Карусель опубліковано",
    toastUnpublished: "Карусель знято з публікації",
    toastStatusFailed: "Не вдалося змінити статус каруселі",
    toastDeleted: "Карусель видалено",
    toastDeleteFailed: "Не вдалося видалити карусель",

    // TASK-428: each placement is its own drag-reorderable grid — the hand-typed
    // «Порядок» column and its form field are gone.
    gridLabel: (placement: string) => `Каруселі: ${placement} — порядок`,
    reorderHint:
      "Порядок рядків у блоці = порядок на головній. Перетягніть рядок за ⠿.",

    // Wave 198 (TASK-1074, CarouselsProposal КР1–КР4).
    searchPlaceholder: "Назва каруселі…",
    // Where each placement sits on the home page — under the section heading.
    placementWhere: {
      HOME_TABS: "Вгорі головної; покупець перемикає вкладки.",
      HOME_RAILS: "Власний рядок товарів нижче на головній.",
    },
    sourceAuto: (source: string) => `${source} · автоматично`,
    sourceCategory: (name: string) => `Категорія «${name}»`,
    shows: (count: number) => `показує ${count}`,
    colShows: "Скільки показує",
    duplicate: "Дублювати",
    duplicateTitle: (title: string) => `${title} (копія)`,
    toastDuplicated: "Копію збережено як чернетку — вона в кінці свого блоку",
    toastDuplicateFailed: "Не вдалося продублювати карусель",
    deleteAction: "Видалити…",
    deleteTitle: (title: string) => `Видалити карусель «${title}»?`,
    deleteDescriptionTab: (title: string) =>
      `Цю дію не можна скасувати. Вкладка «${title}» зникне з блоку «Популярне» на головній. Якщо карусель ще знадобиться — краще «Зняти з публікації».`,
    deleteDescriptionRail: (title: string) =>
      `Цю дію не можна скасувати. Рядок «${title}» зникне з головної. Якщо карусель ще знадобиться — краще «Зняти з публікації».`,
    deleteConfirmLabel: "Видалити карусель",
    toastItemsFailed:
      "Карусель збережено, але список товарів — ні. Відкрийте її й спробуйте ще раз.",
  },

  // --- Recommendation carousel form (TASK-139) --------------------------------
  carouselForm: {
    title: "Заголовок",
    source: "Звідки товари",
    sourceOptions: {
      BESTSELLING: "Хіти продажів",
      NEWEST: "Новинки",
      ON_SALE: "Акційні",
      CATEGORY: "Категорія",
      MANUAL: "Вибрані вручну",
    },
    placement: "Місце на головній",
    placementOptions: {
      HOME_TABS: "Вкладка в блоці «Популярне»",
      HOME_RAILS: "Окремий рядок нижче",
    },
    placementHint:
      "Порядок вкладок і рядків задається перетягуванням у списку каруселей — окремо для кожного блоку.",
    category: "Категорія",
    categoryPlaceholder: "Оберіть категорію",
    itemLimit: "Скільки товарів показувати",
    itemLimitHint: "Від 1 до 24.",
    status: "Публікація",
    statusDraft: "Чернетка",
    statusScheduled: "Заплановано",
    statusPublished: "Опубліковано",
    scheduledAt: "Дата публікації",
    scheduledAtHint:
      "Карусель автоматично опублікується у вказаний час (для статусу «Заплановано»).",
    submit: "Зберегти карусель",
    errors: {
      titleRequired: "Вкажіть заголовок",
      titleMax: "Заголовок має містити не більше 255 символів",
      categoryRequired: "Оберіть категорію для джерела «Категорія»",
      itemLimitRange: "Кількість товарів має бути цілим числом від 1 до 24",
      scheduledAtRequired: "Вкажіть дату публікації для запланованої каруселі",
    },

    // Wave 198 (TASK-1074, CarouselsProposal КР5–КР8).
    sectionMain: "Основне",
    titleHint:
      "Так карусель підписана на головній: назва вкладки або заголовок рядка.",
    sourceDescriptions: {
      BESTSELLING: "Сайт сам бере найпопулярніші",
      NEWEST: "Останні додані товари",
      ON_SALE: "Товари зі знижкою",
      CATEGORY: "Товари обраної категорії",
      MANUAL: "Ви обираєте товари й порядок",
    },
    stepDown: "Менше",
    stepUp: "Більше",
    livePreview: (count: number) =>
      `Зараз на сайті — ${countLabel(count, ["товар", "товари", "товарів"])}, порядок задає сайт`,
    barNew: "Нова карусель ще не збережена",
    barErrors: (count: number) =>
      `Не збережено: ${countLabel(count, ["поле", "поля", "полів"])} з помилками`,
  },

  // --- MANUAL carousel item picker (TASK-139) ----------------------------------
  carouselItems: {
    heading: "Товари каруселі",
    hint: "Порядок у списку — порядок на сайті. Перетягніть за ⠿.",
    // Only what `GET /products/admin/list` searches: name, description, SKU.
    searchPlaceholder: "Назва або SKU…",
    searchEmpty: "Нічого не знайдено",
    searchError: "Не вдалося виконати пошук. Спробуйте ще раз.",
    addLabel: "Додати",
    alreadyAdded: "У каруселі",
    removeAria: (name: string) => `Прибрати «${name}» з каруселі`,
    emptyHint:
      "Товарів ще немає. Знайдіть і додайте їх через пошук — список можна скласти до першого збереження.",
    loadError: "Не вдалося завантажити товари каруселі. Спробуйте ще раз.",
    inactiveBadge: "Неактивний",
    // AD-CNT-25 (TASK-429): for every source except «Вибрані вручну» this section
    // used to render NOTHING at all, so the operator concluded that reordering was
    // broken rather than inapplicable. Now it says what is actually true.
    autoHeading: "Порядок задає сайт автоматично",
    autoHint: (sourceLabel: string) =>
      `Ця карусель наповнюється автоматично — джерело «${sourceLabel}». Сайт сам обирає товари та їхню послідовність, тому вручну переставляти їх немає де.`,
    autoSwitchHint:
      "Щоб самому обрати товари й задати їх порядок, виберіть «Вибрані вручну» — список з'явиться одразу, без збереження.",

    // Wave 198 (TASK-1074, CarouselsProposal КР5/КР6).
    searchHint:
      "Почніть вводити — знайдені товари з'являться тут. Уже додані позначено «У каруселі».",
    inStock: (count: number) => `в наявності ${count} шт.`,
    outOfStock: "немає в наявності",
    keyboardHint:
      "На значку ⠿ стрілки вгору й вниз змінюють місце товару, Home і End — на початок і в кінець.",
  },

  // --- Generic drag-and-drop / keyboard reorder tree (TASK-291, plan 158 §7.3–§7.4) ---
  // Entity-agnostic on purpose: the same strings serve the flat sortable lists
  // (banners / blog-categories / device-brands) once they adopt the primitive.
  reorderTree: {
    instructionsLong:
      "Це дерево категорій. Стрілки вгору й вниз — переходити між рядками, вправо — розгорнути, вліво — згорнути. Щоб перемістити категорію, натисніть Пробіл: далі стрілки вгору й вниз змінюють позицію, вліво й вправо — рівень вкладеності, Enter підтверджує, Escape скасовує. Швидкі клавіші без режиму переміщення: Alt+Shift+стрілки вгору/вниз — позиція, Alt+Shift+стрілки вліво/вправо — рівень. Ті самі дії доступні в меню «Дії» кожного рядка.",
    instructionsShort:
      "Пробіл — узяти для переміщення. Меню „Дії“ — перемістити без перетягування.",
    handleLabel: (name: string) => `Перемістити „${name}“`,

    announce: {
      grabbed: (
        name: string,
        pos: number,
        size: number,
        level: number,
        parent: string,
      ) =>
        `Взято «${name}». Позиція ${pos} з ${size}, рівень ${level}, у категорії «${parent}». Стрілки вгору й вниз — змінити позицію, вліво й вправо — змінити рівень, Enter — підтвердити, Escape — скасувати.`,
      grabbedRoot: (name: string, pos: number, size: number) =>
        `Взято «${name}». Позиція ${pos} з ${size}, кореневий рівень. Стрілки вгору й вниз — змінити позицію, вправо — зробити підкатегорією, Enter — підтвердити, Escape — скасувати.`,
      moved: (name: string, pos: number, size: number, parent: string) =>
        `„${name}“ — позиція ${pos} з ${size}, у категорії „${parent}“.`,
      movedRoot: (name: string, pos: number, size: number) =>
        `„${name}“ — позиція ${pos} з ${size}, кореневий рівень.`,
      indented: (
        name: string,
        parent: string,
        pos: number,
        size: number,
        level: number,
      ) =>
        `„${name}“ тепер підкатегорія „${parent}“. Позиція ${pos} з ${size}, рівень ${level}.`,
      outdented: (
        name: string,
        parent: string,
        pos: number,
        size: number,
        level: number,
      ) =>
        `„${name}“ піднято на рівень вище — тепер підкатегорія „${parent}“. Позиція ${pos} з ${size}, рівень ${level}.`,
      outdentedRoot: (name: string, pos: number, size: number) =>
        `„${name}“ піднято на кореневий рівень. Позиція ${pos} з ${size}.`,
      atTop: "Це вже перша позиція.",
      atBottom: "Це вже остання позиція.",
      cannotIndentNoSibling:
        "Немає категорії, у яку можна вкласти — це перша серед сусідніх.",
      cannotIndentMaxDepth:
        "Максимальна глибина — чотири рівні. Глибше вкласти не можна.",
      cannotOutdentRoot: "Це вже кореневий рівень.",
      tabBlocked:
        "Спершу завершіть переміщення: Enter — підтвердити, Escape — скасувати.",
      autoExpanded: (parent: string, count: number) =>
        `„${parent}“ розгорнуто, підкатегорій: ${count}.`,
      saving: "Зберігаю зміни…",
      busyRefused: "Зачекайте, попереднє переміщення ще зберігається.",
      committed: (
        name: string,
        newPos: number,
        newSize: number,
        newParent: string,
        oldPos: number,
        oldSize: number,
        oldParent: string,
      ) =>
        `„${name}“ переміщено. Тепер: позиція ${newPos} з ${newSize} у категорії „${newParent}“. Було: позиція ${oldPos} з ${oldSize} у категорії „${oldParent}“. Щоб повернути, скористайтеся кнопкою „Скасувати останнє переміщення“.`,
      committedNoop: (
        name: string,
        pos: number,
        size: number,
        parent: string,
      ) =>
        `„${name}“ залишено на місці: позиція ${pos} з ${size} у категорії „${parent}“.`,
      cancelled: (name: string, pos: number, size: number, parent: string) =>
        `Переміщення скасовано. „${name}“ повернуто на позицію ${pos} з ${size} у категорії „${parent}“.`,
      searchLocked: "Пошук активний. Очистіть пошук, щоб змінювати порядок.",
      undone: "Переміщення скасовано.",
      // The server tree was REPLACED while a row was held in move mode (another
      // admin's write, or this operator's own status toggle refetching). The
      // uncommitted preview was built on a tree that no longer exists, so the
      // grab is dropped rather than committed against stale sibling lists.
      treeChangedDuringMove:
        "Дерево категорій змінилося. Переміщення скасовано — почніть заново.",
      // Spoken POLITELY after the assertive CATEGORY_TREE_STALE alert (§7.3):
      // the operator's node is re-focused at its refetched location and its new
      // position is read out. Carries the level, unlike `moved`.
      positionAfterConflict: (
        name: string,
        pos: number,
        size: number,
        level: number,
        parent: string | null,
      ) =>
        parent === null
          ? `„${name}“ — позиція ${pos} з ${size}, рівень ${level}, кореневий рівень.`
          : `„${name}“ — позиція ${pos} з ${size}, рівень ${level}, у категорії „${parent}“.`,
    },

    // Assertive region (rejections only) — one string per backend error code.
    // The client NEVER announces a raw backend message and NEVER leaves the
    // region empty: an unrecognised code falls back to `rejectedUnknown`.
    rejected: {
      CATEGORY_CYCLE: (name: string, target: string) =>
        `Не можна перемістити „${name}“ всередину власної підкатегорії „${target}“. Позицію не змінено.`,
      CATEGORY_MAX_DEPTH:
        "Максимальна глибина дерева — чотири рівні. Переміщення скасовано.",
      CATEGORY_SELF_PARENT: (name: string) =>
        `Категорію „${name}“ не можна зробити батьківською для самої себе. Переміщення скасовано.`,
      CATEGORY_DUPLICATE_ID: (name: string) =>
        `Помилка запиту: категорія „${name}“ вказана двічі. Переміщення скасовано.`,
      CATEGORY_NOT_FOUND: (name: string) =>
        `Категорію „${name}“ або її нову батьківську категорію не знайдено — можливо, її щойно видалив інший адміністратор. Список оновлено.`,
      CATEGORY_TREE_STALE:
        "Дерево категорій змінив інший адміністратор. Список оновлено — повторіть переміщення.",
    },
    rejectedUnknown: (name: string) =>
      `Не вдалося перемістити „${name}“. Дерево оновлено.`,
    saveFailed: (name: string) =>
      `Не вдалося зберегти переміщення „${name}“. Попередній порядок відновлено. Спробуйте ще раз.`,
  },

  // --- Generic drag-and-drop / keyboard reorder for FLAT lists (TASK-295) ------
  // Banners, blog categories and device brands share these strings verbatim.
  //
  // NOUN-FREE ON PURPOSE. Ukrainian declines nouns by case, so a string cannot
  // take the resource noun as a parameter and still be grammatical in every slot
  // («Взято банер» / «позиція банера» / «у банері»). The strings therefore speak
  // about the ROW, never about the thing in it — exactly as `reorderTree` avoids
  // saying "category" outside its own, category-only sentences. The row's own
  // name is quoted, and a quoted proper name does not decline.
  reorderList: {
    instructionsLong:
      "Це список із упорядкуванням. Стрілки вгору й вниз — переходити між рядками. Щоб перемістити рядок, натисніть Пробіл: далі стрілки вгору й вниз змінюють позицію, Home і End — на початок і в кінець, Enter підтверджує, Escape скасовує. Рядки також можна перетягувати мишею за значок ліворуч.",
    instructionsShort: "Пробіл — узяти рядок для переміщення.",
    handleLabel: (name: string) => `Перемістити „${name}“`,
    undo: "Скасувати останнє переміщення",
    searchLabel: "Пошук у списку",
    searchPlaceholder: "Пошук…",
    searchLockedHint:
      "Поки активний пошук, порядок змінювати не можна: видимий порядок не збігається зі справжнім. Очистіть пошук.",
    emptyMatch: (query: string) => `Нічого не знайдено за запитом «${query}».`,

    announce: {
      grabbed: (name: string, pos: number, size: number) =>
        `Рядок „${name}“ узято. Позиція ${pos} з ${size}. Стрілки вгору й вниз — змінити позицію, Enter — підтвердити, Escape — скасувати.`,
      moved: (name: string, pos: number, size: number) =>
        `„${name}“ — позиція ${pos} з ${size}.`,
      atTop: "Це вже перша позиція.",
      atBottom: "Це вже остання позиція.",
      // Unreachable in a flat list (there is no depth to refuse), but the region
      // must never go silent on a refusal.
      cannotMove: "Перемістити сюди не можна.",
      tabBlocked:
        "Спершу завершіть переміщення: Enter — підтвердити, Escape — скасувати.",
      saving: "Зберігаю зміни…",
      busyRefused: "Зачекайте, попереднє переміщення ще зберігається.",
      committed: (
        name: string,
        newPos: number,
        newSize: number,
        oldPos: number,
        oldSize: number,
      ) =>
        `„${name}“ переміщено. Тепер: позиція ${newPos} з ${newSize}. Було: позиція ${oldPos} з ${oldSize}. Щоб повернути, скористайтеся кнопкою „Скасувати останнє переміщення“.`,
      committedNoop: (name: string, pos: number, size: number) =>
        `„${name}“ залишено на місці: позиція ${pos} з ${size}.`,
      cancelled: (name: string, pos: number, size: number) =>
        `Переміщення скасовано. „${name}“ повернуто на позицію ${pos} з ${size}.`,
      searchLocked: "Пошук активний. Очистіть пошук, щоб змінювати порядок.",
      undone: "Переміщення скасовано.",
      listChangedDuringMove:
        "Список змінився. Переміщення скасовано — почніть заново.",
      positionAfterConflict: (name: string, pos: number, size: number) =>
        `„${name}“ — позиція ${pos} з ${size}.`,
    },

    // Assertive region (rejections only) — one string per backend error code
    // (`REORDER_*`, shared by all three flat endpoints). The client NEVER
    // announces a raw backend message and NEVER leaves the region empty.
    rejected: {
      REORDER_DUPLICATE_ID: (name: string) =>
        `Помилка запиту: рядок „${name}“ вказано двічі. Переміщення скасовано.`,
      REORDER_NOT_FOUND: (name: string) =>
        `Рядка „${name}“ більше немає у списку — можливо, його щойно видалив інший адміністратор. Список оновлено.`,
      REORDER_STALE:
        "Список змінив інший адміністратор. Список оновлено — повторіть переміщення.",
    },
    rejectedUnknown: (name: string) =>
      `Не вдалося перемістити „${name}“. Список оновлено.`,
    saveFailed: (name: string) =>
      `Не вдалося зберегти переміщення „${name}“. Попередній порядок відновлено. Спробуйте ще раз.`,

    // Wave 198 (TASK-963): the toast that follows a move, carrying «Скасувати»
    // (BlogCategoriesProposal КБ2: «…переміщено на друге місце»). Still
    // noun-free: the ordinal agrees with «місце», never with the row's noun.
    // The persistent «Скасувати останнє переміщення» control stays as well.
    movedToast: {
      neutral: "Порядок змінено.",
      moved: (name: string, pos: number, size: number) => {
        const ordinals = [
          "перше",
          "друге",
          "третє",
          "четверте",
          "п’яте",
          "шосте",
          "сьоме",
          "восьме",
          "дев’яте",
          "десяте",
        ];
        return pos >= 1 && pos <= ordinals.length
          ? `«${name}» переміщено на ${ordinals[pos - 1]} місце.`
          : `«${name}» переміщено: позиція ${pos} з ${size}.`;
      },
    },
  },

  // --- Спільні SEO-поля сутностей: теги + OG-картинка (TASK-437) ---------------
  // Один блок на чотири форми (товар, категорія, сторінка, стаття): формулювання
  // про «це не meta keywords» мусить бути однаковим скрізь — інакше в одній формі
  // воно з часом перетвориться на обіцянку ранжування, якої поле не дає.
  seoFields: {
    keywords: "Теги (для пошуку всередині магазину)",
    keywordsPlaceholder: "чохол, magsafe, ударостійкий",
    keywordsHint:
      "Через кому. Це НЕ мета-тег keywords для Google — його пошукові системи ігнорують ще з 2009 року, і ми його не виводимо. Це внутрішні теги: слова, якими товар шукають у магазині та за якими його впізнають AI-асистенти, якщо їх немає в назві й описі.",
    ogImage: "Картинка для соцмереж (OG)",
    ogImagePlaceholder: (host: string) => `https://${host}/og/сторінка.jpg`,
    ogImageHint:
      "Показується, коли посиланням діляться у Facebook, Telegram чи Viber. Розмір 1200×630. Якщо порожньо — береться власне зображення сторінки, потім загальна картинка з розділу «SEO».",
    errors: {
      keywordsCount: (max: number) => `Не більше ${max} тегів`,
      keywordLength: (max: number) =>
        `Один тег має містити не більше ${max} символів`,
      ogImageUrl: "Вкажіть коректний URL картинки (http:// або https://)",
      // TASK-811: one copy for all eight entity forms (was eight/five copies,
      // one of which had already drifted to a different wording).
      slugPattern: "Використовуйте малі літери, цифри та поодинокі дефіси",
      metaTitleMax: "SEO-заголовок має містити не більше 255 символів",
      metaDescriptionMax: "SEO-опис має містити не більше 500 символів",
    },
    // TASK-728: the OG field takes a FILE and a media-library pick as well as a
    // link — the same three paths the neighbouring image fields offer.
    ogImageUpload: {
      alt: "Картинка для соцмереж",
      empty: "Картинку ще не задано — соцмережі візьмуть автоматичну.",
      upload: "Завантажити файл",
      replace: "Замінити файл",
      remove: "Прибрати",
      removeTitle: "Прибрати картинку для соцмереж?",
      removeDescription:
        "Поле очиститься, і після збереження соцмережі покажуть автоматичну картинку. Сам файл залишиться у сховищі.",
      hint: "JPEG, PNG, WebP або GIF — до 20 МБ, найкраще 1200×630. Або виберіть із медіатеки чи вставте посилання в поле нижче.",
      toastUploaded: "Картинку завантажено — не забудьте зберегти зміни",
      errorTooLarge:
        "Файл завеликий — максимум 20 МБ. Стисніть зображення і спробуйте ще раз.",
      errorUnsupportedType:
        "Непідтримуваний формат. Дозволені JPEG, PNG, WebP і GIF.",
      errorGeneric: "Не вдалося завантажити файл. Спробуйте ще раз.",
    },
    // Starts with the visible «З медіатеки» (WCAG 2.5.3 label in name); tells
    // it apart from the other picker in the same form.
    ogImagePickerAria: "З медіатеки — картинка для соцмереж",
  },

  // --- Синоніми пошуку (TASK-559) ----------------------------------------------
  // Секція на /settings/search. Пишемо для оператора без технічного бекграунду:
  // «синонім» пояснено прикладом, а обмеження рушія (одне слово, без дефісів)
  // сказано до того, як форма його відхилить.
  searchSynonyms: {
    heading: "Синоніми",
    defaultNote:
      "Зараз діє стандартний список магазину. Змініть його й збережіть — і пошук працюватиме за вашим.",
    termsLabel: (n: number) => `Група ${n}`,
    termsPlaceholder: "чохол, чохли, case, cases",
    termsHint:
      "Через кому. Кожне слово — одне слово без пробілів, дефісів і апострофів; великі літери не мають значення.",
    addGroup: "Додати групу",
    empty:
      "Жодної групи. Порожній список не зберігається: «Зберегти» поверне стандартний список магазину. Додайте групу, щоб пошук працював за вашим.",
    submit: "Зберегти",
    saving: "Збереження…",
    restoreDefaults: "Повернути стандартний список",
    restoreTitle: "Повернути стандартний список?",
    restoreDescription:
      "Ваші групи буде видалено, і пошук знову працюватиме за вбудованим словником магазину.",
    restoreConfirm: "Повернути",
    reindexNote:
      "Нові синоніми діють одразу для правильно написаних слів. Щоб їх знаходило і з помилками («чохл»), після збереження натисніть «Перебудувати покажчик» вище.",
    loading: "Завантажуємо синоніми…",
    loadError: "Не вдалося завантажити синоніми. Спробуйте оновити сторінку.",
    toastSaved: "Синоніми збережено",
    notApplied:
      "Синоніми збережено, але пошуковий сервіс зараз недоступний — вони запрацюють після його перезапуску або перебудови покажчика.",
    toastRestored: "Повернуто стандартний список",
    toastFailed: "Не вдалося зберегти синоніми",
    errors: {
      tooFew: "У групі мають бути щонайменше два різні слова",
      tooMany: (max: number) => `Не більше ${max} слів в одній групі`,
      notOneWord: (term: string) =>
        `«${term}» — не одне слово: приберіть пробіли, дефіси й апострофи`,
      tooLong: (max: number) => `Одне слово — не довше ${max} символів`,
      tooManyGroups: (max: number) => `Не більше ${max} груп`,
    },
    // Saving a list with no groups left is the server's «restore the defaults»,
    // so it goes through the same confirmation with its own explanation.
    emptySaveDescription:
      "У списку не лишилося жодної групи. Порожній список магазин не зберігає — пошук знову працюватиме за вбудованим словником, і його групи з'являться тут.",
    // Хвиля 198 (TASK-1053, Н3): groups as a chip grid.
    countHint: (n: number) =>
      `${countLabel(n, ["група", "групи", "груп"])} · слова в одній групі пошук вважає однаковими`,
    groupActionsAria: (n: number) => `Дії з групою ${n}`,
    editGroup: "Змінити",
    removeGroup: "Видалити",
    doneEditing: "Готово",
    searchPlaceholder: "Знайти слово серед синонімів…",
    searchAria: "Знайти слово серед синонімів",
    noMatches: (query: string) => `Немає груп зі словом «${query}».`,
    shownOf: (shown: number, total: number) => `Показано ${shown} з ${total}`,
    showAll: "показати всі",
    restoreHint:
      "Стандартний список магазину можна повернути в меню «⋯» розділу.",
    sectionMenuAria: "Інші дії з синонімами",
    // «Незбережені зміни: синоніми (2 групи)».
    dirtyLabel: (changed: number) =>
      changed > 0
        ? `синоніми (${countLabel(changed, ["група", "групи", "груп"])})`
        : "синоніми",
  },

  // --- Канон примітивів (хвиля 198) -------------------------------------------
  // Strings owned by the shared/ui primitives themselves — not by any screen.
  canon: {
    // toast.undo — the action on a «done, can be undone» toast.
    undo: "Скасувати",
    // ErrorState
    retry: "Повторити",
    errorTitle: "Не вдалося завантажити дані",
    // PasswordInput
    showPassword: "Показати пароль",
    hidePassword: "Сховати пароль",
    // PasswordRequirements — mirrors shared/lib/password-policy (STAFF rule).
    passwordRequirementsLabel: "Вимоги до пароля",
    passwordMinLength: (min: number) =>
      `Щонайменше ${countLabel(min, ["символ", "символи", "символів"])}`,
    passwordUppercase: "Велика літера",
    passwordLowercase: "Мала літера",
    passwordDigit: "Цифра",
    requirementMet: "виконано",
    requirementUnmet: "ще ні",
    // Stepper — read after the step title.
    stepDone: "виконано",
    stepSkipped: "пропущено",
    // FormActionsBar (sticky variant)
    unsavedChanges: (sections: string) => `Незбережені зміни: ${sections}`,
    discardChanges: "Скасувати зміни",
    // CollapsibleSection
    expand: "Розгорнути",
    collapse: "Згорнути",
    // SortableTree drop hints: the pill on a «nest» target, and what a screen
    // reader hears while the pointer decides between nesting and placing.
    treeNestInto: (name: string) => `Вкласти в «${name}»`,
    treePlaceBefore: (name: string) => `Поставити перед «${name}»`,
    treePlaceAfter: (name: string) => `Поставити після «${name}»`,
  },

  // Wave 198 (TASK-1073, BannersProposal БН6): «Куди веде кнопка» chosen from
  // the site's own sections, categories and products instead of a typed URL.
  // It stores the SAME address string the field always held.
  linkPicker: {
    placeholder: "Оберіть сторінку, категорію чи товар…",
    tabSection: "Розділ",
    tabCategory: "Категорія",
    tabProduct: "Товар",
    tabCustom: "Своє",
    sectionCatalog: "Каталог",
    sectionPromo: "Акції",
    sectionCategories: "Усі категорії",
    sectionBlog: "Блог",
    sectionInfo: "Довідка",
    sectionContact: "Контакти",
    noteCatalog: "весь каталог",
    notePromo: "товари зі знижкою",
    noteCategories: "список категорій",
    noteBlog: "статті блогу",
    noteInfo: "довідкові сторінки",
    noteContact: "форма зв'язку",
    leadsTo: "Веде на",
    categorySearch: "Назва категорії…",
    productSearch: "Назва товару…",
    productSearchHint: "Почніть вводити назву товару.",
    customLabel: "Своя адреса",
    customPlaceholder: "/products або https://…",
    customApply: "Застосувати",
    clear: "Прибрати посилання",
    empty: "Нічого не знайдено.",
    loading: "Завантаження…",
    loadError: "Не вдалося завантажити список. Спробуйте ще раз.",
    footerHint:
      "«Розділ» — Каталог, Акції, Блог…; «Своє» — будь-яка адреса, заходить у поле, як зараз.",
  },
} as const;

export type AdminDictionary = typeof dict;
