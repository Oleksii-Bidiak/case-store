/**
 * Ukrainian UI dictionary for the admin panel (store-admin). Mirrors the
 * store-client dictionary pattern: a single typed `dict` const so every label is
 * defined in one place. Grow this per area as screens are localized.
 */
export const dict = {
  brand: "MobileStore",

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
    reviews: "Відгуки",
    messages: "Повідомлення",
    users: "Користувачі",
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
    loadError: "Не вдалося завантажити показники. Спробуйте ще раз.",
    quickActions: "Швидкі дії",
    addProduct: "Додати товар",
    viewOrders: "Переглянути замовлення",
    manageUsers: "Керувати користувачами",
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
    ordersTooltip: "Замовлення",
    date: "Дата",
    lowStock: "Низький запас",
    product: "Товар",
    variant: "Варіант",
    sku: "Артикул",
    stock: "Вільний залишок",
    soldOut: "Розпродано",
    stockHint:
      "Скільки одиниць товару можна продати прямо зараз. Це число вже враховує " +
      "товари з непідтверджених/необроблених замовлень — вони віднімаються одразу " +
      "при оформленні замовлення, а не при відправці.",
    noLowStock: "Немає товарів із низьким запасом.",
    topProducts: "Топ товари за виручкою",
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
  },

  common: {
    save: "Зберегти",
    saving: "Збереження…",
    saveChanges: "Зберегти зміни",
    cancel: "Скасувати",
    create: "Створити",
    edit: "Редагувати",
    delete: "Видалити",
    close: "Закрити",
    back: "Назад",
    loading: "Завантаження…",
    actions: "Дії",
    search: "Пошук",
    view: "Переглянути",
    previous: "Попередня",
    next: "Наступна",
    pageOf: (page: number, total: number) => `Сторінка ${page} з ${total}`,
    active: "Активний",
    inactive: "Неактивний",
    activate: "Активувати",
    deactivate: "Деактивувати",
    signOut: "Вийти",
    yes: "Так",
    no: "Ні",
    // Table column sorting (TASK-147).
    sortByAria: (col: string) => `Сортувати за: ${col}`,
    sortAsc: "за зростанням",
    sortDesc: "за спаданням",
    sortNone: "не відсортовано",

    // Shared table chrome: toolbar, refresh, row selection (TASK-353).
    // Lives in `common` because every admin table uses the same strings —
    // a per-widget copy would drift the moment one of them is reworded.
    table: {
      refresh: "Оновити",
      refreshing: "Оновлення…",
      refreshed: "Дані оновлено",
      refreshAria: "Оновити дані таблиці",
      searchPlaceholder: "Пошук…",
      selectRow: (name: string) => `Вибрати „${name}“`,
      selectAll: "Вибрати всі рядки на сторінці",
      selectedCount: (count: number) => `Вибрано: ${count}`,
      clearSelection: "Зняти вибір",
      announceSelected: (name: string, count: number) =>
        `„${name}“ вибрано. Усього вибрано: ${count}`,
      announceDeselected: (name: string, count: number) =>
        `„${name}“ знято. Усього вибрано: ${count}`,
      announceSelectedAll: (count: number) => `Вибрано рядків: ${count}`,
      announceCleared: "Вибір знято",

      // One search, one filter idiom, one page size (TASK-423). These strings
      // are the reason the shared controls can be dropped into a table without
      // it inventing its own copy — which is how the panel ended up with four
      // different search behaviours in the first place.
      searchLabel: "Пошук",
      searchHint: "Escape очищає пошук",
      clearFilterAria: (filter: string, value: string) =>
        `Прибрати фільтр «${filter}: ${value}»`,
      clearAllFilters: "Скинути фільтри",
      pageSizeLabel: "Рядків",
      // Shown instead of «нічого не знайдено» when filters (not a search term)
      // are what emptied the table: the operator needs the cause, not the fact.
      emptyFiltered: "За поточними фільтрами нічого не знайдено",
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
    searchPlaceholder: "Пошук товарів…",
    searchAria: "Пошук товарів",
    loadError: "Не вдалося завантажити товари. Спробуйте ще раз.",
    emptyMatch: (q: string) => `Немає товарів за запитом «${q}».`,
    empty: "Товарів ще немає. Створіть свій перший товар.",
    colName: "Назва",
    colCategory: "Категорія",
    colPrice: "Ціна",
    colStatus: "Статус",
    colCreated: "Створено",
    // TASK-254: composite stock column — available (free-to-sell) / reserved
    // (tied up in unshipped orders) / physical (on the shelf = available + reserved).
    // The sortable header uses the generic dict.common.sortByAria(label) helper.
    colStock: "Вільно / Резерв / Фізично",
    // TASK-408: three numbers in one column need the arithmetic spelled out, or
    // «Фізично» reads as a fourth independent figure the operator has to reconcile.
    colStockHint: "Фізично = вільно + зарезервовано під незакриті замовлення",
    // Bulk activate / deactivate over the on-screen selection (TASK-355).
    bulk: {
      activate: (count: number) => `Активувати (${count})`,
      deactivate: (count: number) => `Деактивувати (${count})`,
      selectRow: (name: string) => `Вибрати „${name}“`,
      // Blast radius spelled out: deactivating hides the products from the
      // storefront, and the count is the reason this prompt exists.
      deactivateConfirm: (count: number) =>
        `Деактивувати ${count} тов. — вони зникнуть із вітрини. Продовжити?`,
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
      moveToGroup: (count: number) => `Перемістити до групи (${count})`,
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
    },
    back: "← Назад до товарів",
    createHeading: "Створення товару",
    editHeading: "Редагування товару",
    createSubmit: "Створити товар",
    loadOneError: "Не вдалося завантажити товар. Спробуйте ще раз.",
    imagesHeading: "Зображення товару",
    // TASK-362: photo column + status/stock filters for the restock worklist.
    colPhoto: "Фото",
    noPhoto: "без фото",
    filterStatus: "Фільтр за статусом",
    filterStatusAll: "Усі статуси",
    filterStatusActive: "Лише активні",
    filterStatusHidden: "Лише приховані",
    filterStock: "Фільтр за залишком",
    filterStockAll: "Будь-який залишок",
    filterStockOut: "Немає в наявності",
    toastCreated: "Товар створено",
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
    // TASK-285: slug-rename guard on a publicly visible product.
    slugChangeConfirm: (oldSlug: string, newSlug: string) =>
      `Ви змінюєте адресу активного товару з «${oldSlug}» на «${newSlug}». ` +
      `Стара адреса перестане працювати і випаде з результатів пошуку Google — ` +
      `але ми автоматично налаштуємо переадресацію зі старої адреси на нову. Продовжити?`,
    // Staff preview of deactivated products (TASK-155)
    previewLink: "Переглянути",
    previewHeading: "Перегляд товару",
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
    filterDeletedAll: "Без видалених",
    filterDeletedOnly: "Лише видалені",
    deletedBadge: "видалено",
    deletedNotice:
      "Показано видалені товари. Вони лише для довідки: редагувати, відкрити картку " +
      "чи повернути їх із адмінки не можна — адресу й артикул уже звільнено.",

    // ── Картка товару, лише для перегляду (TASK-427) ────────────────────────
    metaTitleCard: "Картка товару — Адмін",
    cardAction: "Картка",
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
    refHint:
      "Створимо ті, яких ще немає. Характеристики додаємо як текстові — зробити " +
      "їх фільтрами можна пізніше, у налаштуваннях категорії.",

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
    checkAll: "Позначити все",
    colField: "Поле",
    colFrom: "Зараз",
    colTo: "Стане",
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
    colFile: "Файл",
    colStatus: "Статус",
    colWhen: "Коли",
    colWho: "Хто",
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
    draftBadge: "Чернетка — покупці її не бачать",
    liveBadge: "Опубліковано — товар на вітрині",
    publish: "Опублікувати",
    unpublish: "Зняти з публікації",
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
    slug: "Slug",
    slugPlaceholder: "Залиште порожнім для авто-генерації з назви",
    slugPreview: (slug: string) => `Буде згенеровано: ${slug}`,
    description: "Опис",
    descriptionPlaceholder:
      "Опишіть товар: для чого він, з чого зроблений, що в комплекті",
    price: "Ціна",
    compareAtPrice: "Стара ціна",
    sku: "Артикул",
    category: "Категорія",
    categoryPlaceholder: "Оберіть категорію",
    loading: "Завантаження…",
    stock: "Вільний залишок",
    stockHint:
      "Скільки одиниць товару можна продати прямо зараз. Це число вже враховує " +
      "товари з непідтверджених/необроблених замовлень — вони віднімаються одразу " +
      "при оформленні замовлення, а не при відправці.",
    // TASK-254: dynamic breakdown shown under the static hint in edit mode only.
    stockBreakdownHint: (physicalQty: number, reservedQty: number) =>
      `Фізично на складі: ${physicalQty} шт (з них у ${reservedQty} шт зарезервовано ` +
      `замовленнями на обробці).`,
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
    active: "Активний (показувати в магазині)",
    metaTitle: "SEO-заголовок (meta title)",
    metaTitlePlaceholder: "Залиште порожнім, щоб використати назву товару",
    metaTitleHint:
      "Заголовок сторінки товару для пошукових систем (Google) і соцмереж. Залиште порожнім — і він згенерується автоматично з назви товару.",
    metaDescription: "SEO-опис (meta description)",
    metaDescriptionPlaceholder: "Короткий опис товару для пошукових систем",
    metaDescriptionHint:
      "Короткий текст під заголовком у результатах пошуку. Залиште порожнім — і він згенерується автоматично з опису товару.",
    submit: "Зберегти товар",
    errors: {
      nameRequired: "Вкажіть назву",
      nameMax: "Назва має містити не більше 255 символів",
      slugMax: "Slug має містити не більше 255 символів",
      slugPattern: "Використовуйте малі літери, цифри та поодинокі дефіси",
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
      metaTitleMax: "SEO-заголовок має містити не більше 255 символів",
      metaDescriptionMax: "SEO-опис має містити не більше 500 символів",
    },

    // Type-to-filter pickers (TASK-423). The category, group and brand selects
    // list the whole tree / table — a hundred-plus options a drop-down can only
    // be scrolled through — so they became comboboxes.
    comboboxPlaceholder: "Почніть вводити назву…",
    comboboxEmpty: "Нічого не знайдено",
    comboboxClear: "Очистити вибір",
  },

  // --- Categories (TASK-115) --------------------------------------------------
  categories: {
    // Add-on template panel embedded in the category form (TASK-174).
    addonTemplate: {
      heading: "Додаткові послуги цієї категорії",
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
      save: "Зберегти послуги категорії",
      toastSaved: "Послуги категорії збережено",
      toastFailed: "Не вдалося зберегти послуги категорії",
    },
    metaTitle: "Категорії — Адмін",
    metaTitleNew: "Створення категорії — Адмін",
    metaTitleEdit: "Редагування категорії — Адмін",
    heading: "Категорії",
    add: "Додати категорію",
    searchPlaceholder: "Пошук категорій…",
    searchAria: "Пошук категорій",
    loadError: "Не вдалося завантажити категорії. Спробуйте ще раз.",
    emptyMatch: (q: string) => `Немає категорій за запитом «${q}».`,
    empty: "Категорій ще немає. Створіть свою першу категорію.",
    colName: "Назва",
    colSlug: "Slug",
    colParent: "Батьківська",
    colProducts: "Товари",
    // TASK-408: the column shows the SUBTREE total, because that is what the
    // storefront category page lists. The direct count is spelled out beside it —
    // without it a parent that files nothing of its own looks like a data error.
    colProductsHint:
      "Скільки товарів показує вітрина на сторінці категорії — разом з усіма підкатегоріями. " +
      "У дужках — скільки лежить безпосередньо в самій категорії.",
    productsDirect: (count: number) => `безпосередньо ${count}`,
    colSort: "Порядок",
    colStatus: "Статус",
    root: "Коренева",
    back: "← Назад до категорій",
    createHeading: "Створення категорії",
    editHeading: "Редагування категорії",
    createSubmit: "Створити категорію",
    loadOneError: "Не вдалося завантажити категорію. Спробуйте ще раз.",
    toastCreated: "Категорію створено",
    toastCreateFailed: "Не вдалося створити категорію",
    toastUpdated: "Категорію оновлено",
    toastUpdateFailed: "Не вдалося оновити категорію",
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
      activate: "Активувати",
      deactivate: "Деактивувати",
      // TASK-408: an ACTIVE category under a deactivated ancestor is invisible on
      // the storefront, but its own row says «Активна» — the status column can only
      // speak about one row. The badge says what the tree does, so nobody spends an
      // afternoon wondering why an active category has no page.
      hiddenByParent: "Прихована через батька",
      hiddenByParentHint: (name: string) =>
        `Категорія активна, але не показується на вітрині: вимкнено «${name}» вище по дереву.`,
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
        selectedCount: (count: number) => `Вибрано: ${count}`,
        activate: (count: number) => `Активувати (${count})`,
        deactivate: (count: number) => `Деактивувати (${count})`,
        clear: "Зняти вибір",
        deactivateConfirm: (count: number) =>
          `Деактивувати вибрані категорії (${count})? Кожна з них зникне з вітрини разом з усім, що під нею. Статус самих підкатегорій не зміниться.`,
        announce: {
          selected: (name: string, count: number) =>
            `Вибрано „${name}“. Усього вибрано: ${count}.`,
          deselected: (name: string, count: number) =>
            `Знято вибір із „${name}“. Усього вибрано: ${count}.`,
          cleared: "Вибір знято.",
          saving: (count: number) => `Зберігаю зміни для ${count} категорій…`,
          done: (count: number, isActive: boolean) =>
            isActive
              ? `Активовано категорій: ${count}.`
              : `Деактивовано категорій: ${count}.`,
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
    },
    // TASK-285: slug-rename guard on a publicly visible category.
    slugChangeConfirm: (oldSlug: string, newSlug: string) =>
      `Ви змінюєте адресу активної категорії з «${oldSlug}» на «${newSlug}». ` +
      `Стара адреса перестане працювати і випаде з результатів пошуку Google — ` +
      `але ми автоматично налаштуємо переадресацію зі старої адреси на нову. Продовжити?`,
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
    active: "Активна (показувати в магазині)",
    metaTitle: "SEO-заголовок (meta title)",
    metaTitlePlaceholder: "Залиште порожнім, щоб використати назву",
    metaDescription: "SEO-опис (meta description)",
    metaDescriptionPlaceholder: "Короткий опис для пошукових систем",
    submit: "Зберегти категорію",
    errors: {
      nameRequired: "Вкажіть назву",
      nameMax: "Назва має містити не більше 255 символів",
      slugMax: "Slug має містити не більше 255 символів",
      slugPattern: "Використовуйте малі літери, цифри та поодинокі дефіси",
      descriptionMax: "Опис має містити не більше 2000 символів",
      imageUrl: "Вкажіть коректний URL",
      parentInvalid: "Оберіть коректну категорію",
      metaTitleMax: "SEO-заголовок має містити не більше 255 символів",
      metaDescriptionMax: "SEO-опис має містити не більше 500 символів",
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
      hint: "JPEG, PNG, WebP або GIF — до 20 МБ; великі зменшимо самі. Або вставте посилання на зовнішнє зображення в поле нижче.",
      toastUploaded: "Зображення завантажено — не забудьте зберегти категорію",
      errorTooLarge:
        "Файл завеликий — максимум 20 МБ. Стисніть зображення і спробуйте ще раз.",
      errorUnsupportedType:
        "Непідтримуваний формат. Дозволені JPEG, PNG, WebP і GIF.",
      errorGeneric: "Не вдалося завантажити файл. Спробуйте ще раз.",
    },
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
    edit: "Редагувати",
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
    // The list also shows brands that are hidden themselves, so the operator can
    // still reach their models.
    brandsSearchPlaceholder: "Пошук за назвою бренду…",
    brandsSearchLabel: "Пошук брендів пристроїв",
    brandsEmptyMatch: (q: string) => `Немає брендів за запитом «${q}».`,
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
      slugPattern: "Використовуйте малі літери, цифри та поодинокі дефіси",
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
    errors: {
      brandRequired: "Оберіть бренд",
      nameRequired: "Вкажіть назву",
      nameMax: "Назва має містити не більше 255 символів",
      slugMax: "Slug має містити не більше 255 символів",
      slugPattern: "Використовуйте малі літери, цифри та поодинокі дефіси",
      seriesMax: "Серія має містити не більше 255 символів",
      yearInt: "Рік має бути коректним (1990–2100)",
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
    saveFirst: "Спершу збережіть товар, щоб керувати сумісністю.",
    // TASK-442 — на сторінці створення набір уже можна відмітити; він поїде на
    // сервер одразу після створення товару, окремої кнопки тут немає.
    stagedHint: "Збережеться разом із товаром.",
    toastSaved: "Сумісність оновлено",
    toastSaveFailed: "Не вдалося оновити сумісність",
    toastGroupApplied: (count: number) =>
      `Сумісність застосовано до ${count} позицій`,
    toastGroupFailed: "Не вдалося застосувати сумісність до групи",
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
    booleanYes: "Так",
    selectPlaceholder: "— не вибрано —",
    toastSaved: "Характеристики збережено",
    toastError: "Не вдалося зберегти характеристики.",
  },

  // --- Structured-spec templates (TASK-191) -----------------------------------
  attributeDefinitions: {
    heading: "Характеристики",
    description:
      "Шаблони характеристик для товарів цієї категорії. Успадковуються підкатегоріями.",
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
    filterableBadge: "Фільтр",
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
    submitCreate: "Додати",
    submitUpdate: "Зберегти",
    cancel: "Скасувати",
    createTitle: "Нова характеристика",
    editTitle: "Редагування характеристики",
    typeText: "Текст",
    typeNumber: "Число",
    typeBoolean: "Так/Ні",
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
    },
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
    statusActive: "Активний",
    statusInactive: "Неактивний",
    deactivate: "Деактивувати",
    deactivating: "Деактивація…",
    noExpiry: "—",
    unlimited: "∞",
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
    },
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
    // TASK-357: the table used to ask for `limit: 100` and show no page
    // controls — page 101 simply did not exist for the operator.
    searchPlaceholder: "Пошук за заголовком або slug…",
    searchAria: "Пошук сторінок",
    emptyMatch: (q: string) => `Немає сторінок за запитом «${q}».`,
    colTitle: "Заголовок",
    colSlug: "Slug",
    colStatus: "Статус",
    colCreated: "Створено",
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
      slugPattern: "Використовуйте малі літери, цифри та поодинокі дефіси",
      excerptMax: "Короткий опис має містити не більше 500 символів",
      metaTitleMax: "SEO заголовок має містити не більше 255 символів",
      metaDescriptionMax: "SEO опис має містити не більше 500 символів",
      sortInt: "Порядок сортування має бути невід'ємним цілим числом",
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
      slugPattern: "Використовуйте малі літери, цифри та поодинокі дефіси",
      excerptRequired: "Додайте короткий опис",
      excerptMax: "Короткий опис має містити не більше 500 символів",
      contentRequired: "Додайте текст статті",
      categoryRequired: "Оберіть категорію",
      authorRequired: "Вкажіть автора",
      authorMax: "Імʼя автора має містити не більше 120 символів",
      coverUrl: "Вкажіть коректний URL обкладинки",
      readingInt: "Час читання має бути додатним цілим числом",
      scheduledAtRequired: "Вкажіть дату публікації для запланованої статті",
      metaTitleMax: "SEO-заголовок має містити не більше 255 символів",
      metaDescriptionMax: "SEO-опис має містити не більше 500 символів",
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
      hint: "JPEG, PNG, WebP або GIF — до 20 МБ; великі зменшимо самі. Або вставте посилання на зовнішнє зображення в поле нижче.",
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
      slugPattern: "Використовуйте малі літери, цифри та поодинокі дефіси",
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
    statusLabels: {
      DRAFT: "Чернетка",
      SCHEDULED: "Заплановано",
      PUBLISHED: "Опубліковано",
    },
    // TASK-430: same as the blog list — a scheduled banner says WHEN it goes live,
    // since that date is the only thing separating it from a forgotten draft.
    statusScheduledOn: (date: string) => `Заплановано на ${date}`,
    publish: "Опублікувати",
    unpublish: "Зняти з публікації",
    deleteConfirm: (title: string) =>
      `Видалити банер «${title}»? Цю дію не можна скасувати.`,
    back: "← Назад до банерів",
    createHeading: "Створення банера",
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
  },

  bannerForm: {
    placement: "Розташування",
    placements: {
      HERO_SLIDE: "Головний слайдер",
      PROMO_TILE: "Промо-плитки",
      PROMO_BANNER: "Промо-банер",
      ANNOUNCEMENT_BAR: "Смуга оголошень",
    },
    title: "Заголовок",
    subtitle: "Підзаголовок",
    subtitlePlaceholder: "Додатковий текст (необов'язково)",
    imageUrl: "Зображення (URL)",
    imageUrlPlaceholder: "/images/banners/… або https://…",
    ctaLabel: "Текст кнопки",
    ctaHref: "Посилання кнопки",
    ctaHrefPlaceholder: "/catalog",
    theme: "Тема / акцент",
    themePlaceholder: "accent, default…",
    // TASK-295: no `sortOrder` label — the order field is gone from this form
    // (banner order lives in the sortable grid of its placement).
    status: "Статус публікації",
    statusDraft: "Чернетка",
    statusScheduled: "Заплановано",
    statusPublished: "Опубліковано",
    scheduledAt: "Публікувати з",
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
      hint: "JPEG, PNG, WebP або GIF — до 20 МБ; великі зменшимо самі. Або вставте посилання (наприклад, /images/banners/…) у поле нижче.",
      toastUploaded: "Зображення завантажено — не забудьте зберегти банер",
      errorTooLarge:
        "Файл завеликий — максимум 20 МБ. Стисніть зображення і спробуйте ще раз.",
      errorUnsupportedType:
        "Непідтримуваний формат. Дозволені JPEG, PNG, WebP і GIF.",
      errorGeneric: "Не вдалося завантажити файл. Спробуйте ще раз.",
    },
    // TASK-429: the publication WINDOW. `scheduledAt` above is its start; these
    // strings describe its end — the instant the scheduler takes the banner down
    // by itself, so a promo that must vanish on the 1st needs nobody awake at
    // midnight to remove it.
    windowLegend: "Вікно публікації",
    scheduledUntil: "Знімати з публікації",
    scheduledUntilHint:
      "Необов'язково. У вказаний час банер автоматично стане чернеткою і зникне з сайту. Порожнє поле — банер лишається, доки ви не знімете його вручну.",
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
      slugPattern:
        "Slug має бути у нижньому регістрі: лише літери, цифри та дефіси",
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
    heading: "Налаштування контактів",
    subheading: "Ці дані відображаються у футері та на сторінці контактів.",
    loadError: "Не вдалося завантажити контакти. Спробуйте ще раз.",
    toastUpdated: "Контакти оновлено",
    toastUpdateFailed: "Не вдалося оновити контакти",
  },

  siteContactForm: {
    email: "Електронна пошта підтримки",
    emailPlaceholder: "support@example.ua",
    phone: "Телефон",
    phonePlaceholder: "+380 44 000 0000",
    workingHours: "Години роботи",
    workingHoursPlaceholder: "Пн–Нд: 9:00 – 20:00",
    workingHoursClosed: "Вихідний",
    workingHoursClosedAria: (day: string) => `${day} — вихідний`,
    workingHoursOpenAria: (day: string) => `${day} — час відкриття`,
    workingHoursCloseAria: (day: string) => `${day} — час закриття`,
    workingHoursPreview: "Так це побачать відвідувачі:",
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
    submit: "Зберегти контакти",
    errors: {
      emailInvalid: "Вкажіть коректну електронну пошту",
      urlInvalid: "Вкажіть коректний URL (https://…)",
      workingHoursTimesRequired: "Вкажіть час відкриття та закриття",
      workingHoursCloseAfterOpen:
        "Час закриття має бути пізніше часу відкриття",
    },
  },

  // Search-index maintenance (TASK-377). Written for a non-technical operator:
  // the word «індекс» never appears without an explanation of what it costs them
  // when it is stale.
  searchIndex: {
    metaTitle: "Пошук — Адмін",
    heading: "Пошук по магазину",
    subheading:
      "Пошук на сайті працює через окремий швидкий покажчик товарів. Зазвичай він оновлюється сам, але інколи його треба перебудувати вручну.",
    whenHeading: "Коли це потрібно",
    whenReasons: [
      "Покупці не знаходять товар, який точно є в каталозі.",
      "Щойно завантажили каталог постачальника або великий список товарів.",
      "Магазин перенесли на інший сервер або базу відновили з резервної копії.",
    ],
    safetyNote:
      "Перебудова безпечна: поки вона триває, пошук продовжує працювати на старих даних. Для великого каталогу це може зайняти до хвилини.",
    button: "Перебудувати покажчик",
    buttonPending: "Перебудовуємо…",
    toastDone: (count: number) => `Покажчик оновлено: ${count} товарів`,
    toastFailed: "Не вдалося перебудувати покажчик. Спробуйте ще раз.",
  },

  seoSettings: {
    metaTitle: "SEO — Адмін",
    heading: "SEO-налаштування",
    subheading:
      "Глобальні параметри для пошукових систем: заголовки, описи, зображення для соцмереж і видимість сайту.",
    loadError: "Не вдалося завантажити SEO-налаштування. Спробуйте ще раз.",
    toastUpdated: "SEO-налаштування оновлено",
    toastUpdateFailed: "Не вдалося оновити SEO-налаштування",
  },

  seoSettingsForm: {
    defaultMetaTitle: "Заголовок сайту за замовчуванням",
    // Placeholders are neutral examples on purpose (TASK-433): they used to
    // spell out one particular shop's name and domain, which read like a
    // pre-filled value rather than a hint — and the shop in question was not
    // this one. Where a real value is genuinely more useful than a shape hint
    // (the OG-image path), the placeholder is a function of the storefront host
    // instead, so the parsing stays out of this constants module.
    defaultMetaTitlePlaceholder: "Ваш магазин — аксесуари для смартфонів",
    defaultMetaTitleHint:
      "Заголовок, який показується у вкладці браузера та в результатах пошуку, коли у сторінки немає власного заголовка. Залиште порожнім — і заголовок згенерується автоматично з назви сторінки.",
    defaultMetaDescription: "Опис сайту за замовчуванням",
    defaultMetaDescriptionPlaceholder:
      "Мультибрендовий магазин аксесуарів та Apple-техніки. Доставка по Україні.",
    defaultMetaDescriptionHint:
      "Короткий опис магазину (1–2 речення), який Google показує під заголовком у результатах пошуку — коли у сторінки немає власного опису.",
    titleTemplate: "Шаблон заголовка сторінки",
    titleTemplatePlaceholder: "%s | Ваш магазин",
    titleTemplateHint:
      "Шаблон заголовка сторінки. %s буде замінено на назву конкретної сторінки. Залиште порожнім — і ми додамо назву магазину після заголовка автоматично.",
    defaultOgImage: "Зображення для соцмереж (OG-картинка)",
    /** Takes the storefront host (`STOREFRONT_HOST`) so the example path sits on the store's own domain. */
    defaultOgImagePlaceholder: (host: string) => `https://${host}/og-image.jpg`,
    defaultOgImageHint:
      "Картинка для попереднього перегляду, коли посилання на магазин поширюють у соцмережах чи месенджерах (Facebook, Telegram, Viber). Вкажіть повне посилання на зображення (https://…).",
    siteVerificationGroup: "Верифікація власності сайта",
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
    noindexSite: "Приховати сайт від пошукових систем",
    noindexSiteHint:
      "Повністю приховує весь сайт від Google та інших пошукових систем. Вмикайте лише на тестовому сайті. УВАГА: якщо увімкнути на робочому магазині — сайт зникне з пошуку Google.",
    submit: "Зберегти SEO-налаштування",
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
    searchPlaceholder: "Пошук за текстом запитання…",
    searchAria: "Пошук запитань",
    emptyMatch: (q: string) => `Немає запитань за запитом «${q}».`,
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
    allStatuses: "Усі статуси",
    tabsAria: "Швидкі фільтри за статусом",
    tabNew: "Нові",
    tabProcessing: "В обробці",
    tabShipped: "Відправлені",
    tabAll: "Всі",
    loadError: "Не вдалося завантажити замовлення. Спробуйте ще раз.",
    emptyStatus: (s: string) => `Немає замовлень зі статусом «${s}».`,
    empty: "Замовлень ще немає.",
    colOrder: "Замовлення",
    colCustomer: "Клієнт",
    colStatus: "Статус",
    colPayment: "Оплата",
    colTotal: "Сума",
    colItems: "Позиції",
    colCreated: "Створено",
    // TASK-276: names the card-mode row group for screen readers.
    rowAria: (id: string) => `Замовлення ${id}`,
    back: "← Назад до замовлень",
    title: (id: string) => `Замовлення #${id}`,
    payment: (s: string) => `Оплата: ${s}`,
    timeline: (created: string, updated: string) =>
      `Створено ${created} · Оновлено ${updated}`,
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
    notes: "Примітки",
    loadOneError: "Не вдалося завантажити замовлення. Спробуйте ще раз.",
    // TASK-254: stock-hold badges on the order detail page.
    holdsStock: (n: number) => `Тримає залишок: ${n} шт`,
    restockedAt: (time: string) => `Залишок повернуто ${time}`,
    // TASK-251: order status/payment history timeline.
    timelineHeading: "Історія змін",
    timelineLoadError: "Не вдалося завантажити історію змін.",
    timelineEmpty: "Історія змін порожня.",

    // --- Free-text search (TASK-336) ------------------------------------------
    // Deliberately does NOT mention "ID": what an operator has on the phone is a
    // number the customer read off an email, or a phone number — never a UUID.
    searchPlaceholder: "Номер замовлення, пошта або телефон…",
    searchAria: "Пошук замовлень",
    emptySearch: (q: string) => `Нічого не знайдено за запитом «${q}».`,

    // --- Operator-editable fields (TASK-335 / TASK-336) -----------------------
    detailsHeading: "Дані для оператора",
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
    trackingNumberInvalid: "ТТН Нової Пошти — це рівно 14 цифр.",
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
    // An honest blank. The method, the per-attempt history and the refund button
    // need `Order.paymentMethod` on the order entity plus the admin payments
    // endpoints, and the merged backend exposes neither — so the card says it
    // cannot read them rather than implying there were no attempts.
    paymentAttemptsUnavailable:
      "Історія спроб оплати та повернення коштів стануть доступні після увімкнення онлайн-оплати.",

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
    paymentMethodOnDelivery: "Оплата при отриманні",
    paymentMethodOnline: "Картка онлайн",
    paymentMethodInstallments: "Оплата частинами",
    // No number in this label, on purpose: the threshold lives in ONE place
    // (the API's PENDING_STALE_HOURS, shared with the dashboard tile). A «понад
    // 48 год» written here would be a second copy of it, and the day it moves
    // this label is the one that lies.
    overdueChip: "Чекають занадто довго",
    overdueChipAria:
      "Показати лише замовлення, які надто довго чекають підтвердження",

    // --- CSV export (TASK-425) ------------------------------------------------
    exportCsv: "Експорт CSV",
    exportSuccess: (count: number) => `Експортовано ${count} замовл. у CSV.`,
    // Sticky (it goes through toast.error) because an incomplete file that looks
    // complete is the one failure the operator must not scroll past. The count
    // comes from the file itself and the total from the list's own meta — the
    // server's row cap is never restated here.
    exportTruncated: (exported: number, total: number) =>
      `Експортовано лише ${exported} із ${total} замовл. — файл обмежено. Звузьте фільтри (дата, статус), щоб отримати решту.`,
    exportError: "Не вдалося сформувати CSV. Спробуйте ще раз.",
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
    noComment: "—",
    approve: "Схвалити",
    // TASK-446: the button says TEXT because only the text is withdrawn. The old
    // «Відхилити» described a hard delete that took the rating out of the
    // product's average with it — an operator who still reads it that way will
    // reject a one-star review believing the score recovers, and it will not.
    reject: "Відхилити текст",
    emptyQueue: "Немає відгуків для модерації.",
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
      approve: (count: number) => `Схвалити (${count})`,
      reject: (count: number) => `Відхилити текст (${count})`,
      selectRow: (product: string, author: string) =>
        `Вибрати відгук на «${product}» від ${author}`,
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
    },

    // Free-text search (TASK-423). The queue had none at all, so triaging a
    // backlog meant paging through it, and "what did this customer write about
    // that product?" was a question this screen could not answer.
    searchPlaceholder: "Пошук за текстом, автором або товаром…",
    searchAria: "Пошук відгуків",
    emptyMatch: (q: string) => `Немає відгуків за запитом «${q}».`,

    // TASK-430: the queue showed a product NAME and nothing else, and this
    // catalogue has several positions per name (the same case in four colours), so
    // a moderator could not tell which one a complaint was about — nor look it up,
    // because the SKU is the key the catalogue is searched by.
    colSku: "Артикул",
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
    replyBadge: "Є відповідь",
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
    // `ratingVisible` folds two independent gates — a moderator's hide and an
    // unconfirmed email — and the moderation row does not say which. The badge
    // therefore reports the EFFECT, which is true either way, and never guesses
    // at the cause.
    ratingNotCounted: "Оцінка не враховується",
  },

  // --- Contact messages (TASK-177) --------------------------------------------
  messages: {
    metaTitle: "Повідомлення — Адмін",
    heading: "Вхідні повідомлення",
    filterStatusAria: "Фільтр за статусом",
    filterAll: "Усі",
    filterNew: "Нові",
    filterRead: "Прочитані",
    filterArchived: "В архіві",
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
    fieldName: "Імʼя",
    fieldPhone: "Телефон",
    fieldEmail: "Email",
    fieldTopic: "Тема",
    fieldOrderRef: "Замовлення",
    fieldMessage: "Повідомлення",
    fieldStatus: "Статус",
    fieldAdminNote: "Внутрішня примітка",
    adminNotePlaceholder: "Примітка для команди (не бачить клієнт)…",
    markRead: "Позначити прочитаним",
    markArchived: "В архів",
    markNew: "Повернути в нові",
    saveNote: "Зберегти примітку",
    receivedAt: (date: string) => `Отримано ${date}`,
    updateSuccess: "Повідомлення оновлено.",
    updateError: "Не вдалося оновити повідомлення. Спробуйте ще раз.",
    close: "Закрити",
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
      selectRow: (name: string) => `Вибрати повідомлення від ${name}`,
      announceSaving: (count: number) => `Оновлення ${count} повідомл.…`,
      announceDone: (count: number) => `Оновлено повідомлень: ${count}`,
      announceFailed: "Не вдалося виконати масову дію",
    },

    // Free-text search (TASK-423). A customer's second message lands weeks after
    // the first, and without this the only way to find what we already told them
    // was to page through the archive.
    searchPlaceholder: "Імʼя, пошта, телефон, тема або текст…",
    searchAria: "Пошук повідомлень",
    emptyMatch: (q: string) => `Немає повідомлень за запитом «${q}».`,
  },

  orderStatus: {
    noTransitions: "Немає доступних переходів",
    changeStatus: "Змінити статус…",
    updateAria: "Оновити статус замовлення",
    toastUpdated: (s: string) => `Статус замовлення змінено на ${s}`,
    toastFailed: "Не вдалося оновити статус замовлення",
    updatePaymentStatus: "Статус оплати",
    changePaymentStatus: "Змінити статус оплати…",
    paymentToastUpdated: (label: string) => `Статус оплати оновлено: ${label}`,
    paymentToastFailed: "Не вдалося оновити статус оплати",
    paymentUpdateAria: "Оновити статус оплати",

    // --- Server-driven transitions (TASK-332) ---------------------------------
    transitionsLoading: "Завантаження доступних статусів…",
    transitionsLoadError:
      "Не вдалося отримати список доступних статусів. Оновіть сторінку.",
    // The select now offers exactly what the server allows, so the picker names
    // that fact — an operator who expected "Скасовано" to be there needs to know
    // it is missing on purpose, not by accident.
    transitionsHint: "Доступні лише переходи, дозволені для поточного статусу.",

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
    },
    conflictUnknown:
      "Замовлення змінилося, і зміну не збережено. Оновіть сторінку й спробуйте ще раз.",
    reloadCta: "Оновити",
  },

  // --- Returns / RMA (TASK-340) -----------------------------------------------
  returns: {
    metaTitle: "Повернення — Адмін",
    metaTitleDetail: (id: string) => `Повернення ${id} — Адмін`,
    heading: "Повернення",
    back: "← Назад до повернень",
    title: (id: string) => `Повернення #${id}`,

    filterStatusAria: "Фільтр за статусом повернення",
    allStatuses: "Усі статуси",
    loadError: "Не вдалося завантажити повернення. Спробуйте ще раз.",
    loadOneError: "Не вдалося завантажити повернення. Спробуйте ще раз.",
    empty: "Запитів на повернення ще немає.",
    emptyStatus: (s: string) => `Немає повернень зі статусом «${s}».`,

    colReturn: "Повернення",
    colOrder: "Замовлення",
    colStatus: "Статус",
    colItems: "Позиції",
    colRequested: "Запит",
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

    reason: "Причина (від клієнта)",
    noReason: "Причину не вказано",
    operatorNotes: "Внутрішні примітки",
    operatorNotesPlaceholder: "Нотатка для команди…",
    operatorNotesHint: "Бачить лише команда. Клієнту не показується.",
    requestedAt: "Запит створено",
    resolvedAt: "Рішення прийнято",
    restockedAt: "Повернуто на склад",
    notRestocked: "На склад не повертали",
    refundedAmount: "Повернуто коштів",
    notRefunded: "Кошти не повертали",
    itemsHeading: "Позиції до повернення",
    itemProduct: "Товар",
    itemQty: "К-сть",
    itemPrice: "Ціна за од.",

    // --- Resolve action -------------------------------------------------------
    resolveHeading: "Рішення",
    resolveStatus: "Новий статус",
    resolveStatusAria: "Новий статус повернення",
    resolveStatusPlaceholder: "Оберіть статус…",
    resolveNoTransitions:
      "Це повернення завершене — змінити його статус більше не можна.",
    resolveRefundedAmount: "Сума повернення",
    resolveRefundedAmountPlaceholder: "499.00",
    // Partial refunds are normal: shipping is not always refundable and a
    // customer may be returning one line out of three.
    resolveRefundedAmountHint:
      "Скільки фактично повернули клієнту. Може бути меншим за суму позицій — доставка повертається не завжди.",
    resolveRefundedAmountInvalid:
      "Сума має бути у форматі 499 або 499.00 (до двох знаків).",
    resolveRestock: "Повернути товар у продаж",
    // `restock` is explicit rather than inferred from the status because "the
    // parcel arrived" and "the contents are sellable again" are different claims.
    resolveRestockHint:
      "Доступно лише для статусу «Товар отримано». Позначайте, коли товар справді придатний до продажу.",
    resolveRestockAlreadyDone:
      "Товар уже повернуто на склад — повторно це зробити не можна.",
    resolveSubmit: "Зберегти рішення",
    resolveSuccess: "Рішення збережено.",
    resolveFailed: "Не вдалося зберегти рішення. Спробуйте ще раз.",
    // 409 from the return state machine / the double-restock guard.
    resolveConflict:
      "Повернення вже змінилося — оновіть сторінку й прийміть рішення ще раз.",
    resolveBadRequest:
      "Повернення товару на склад доступне лише для статусу «Товар отримано».",

    // Free-text search (TASK-423). The queue had none, so an operator with the
    // customer on the phone could only page through it. The placeholder names
    // what the term is actually matched against — the return id, the order
    // number, the customer's email or phone, and the reason they wrote.
    searchPlaceholder: "Номер повернення, замовлення, пошта або телефон…",
    searchAria: "Пошук повернень",
    emptyMatch: (q: string) => `Немає повернень за запитом «${q}».`,
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

    addressHeading: "Адреса доставки",
    addressFirstName: "Імʼя",
    addressLastName: "Прізвище",
    addressPhone: "Телефон",
    addressCity: "Місто",
    addressAddress1: "Відділення / адреса",
    addressPostalCode: "Індекс",
    addressCountry: "Країна",
    addressRequired: "Обовʼязкове поле.",

    itemsHeading: "Позиції",
    itemsSearchPlaceholder: "Пошук товару за назвою…",
    itemsSearchAria: "Пошук товару для замовлення",
    itemsSearching: "Пошук…",
    itemsNoResults: "Товарів не знайдено.",
    itemsAdd: "Додати",
    itemsAddAria: (name: string) => `Додати «${name}» до замовлення`,
    itemsRemove: "Прибрати",
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
    notes: "Примітки для клієнта",
    notesPlaceholder: "Побажання клієнта…",
    internalNotes: "Внутрішні примітки",
    internalNotesPlaceholder: "Нотатка для команди…",

    submit: "Створити замовлення",
    cancel: "Скасувати",
    success: "Замовлення створено.",
    failed: "Не вдалося створити замовлення. Спробуйте ще раз.",
    // 400 from the backend covers "no customer identified", "product
    // unavailable" and "stock is short" — all things the operator can fix.
    failedBadRequest:
      "Замовлення не створено: перевірте клієнта, товари та наявність на складі.",

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
  },

  // --- Users (TASK-115) -------------------------------------------------------
  users: {
    metaTitle: "Користувачі — Адмін",
    metaTitleDetail: (id: string) => `Користувач ${id} — Адмін`,
    heading: "Користувачі",
    searchPlaceholder: "Пошук за поштою або іменем…",
    searchAria: "Пошук користувачів",
    filterRoleAria: "Фільтр за роллю",
    allRoles: "Усі ролі",
    roleCustomer: "Клієнт",
    roleAdmin: "Адміністратор",
    filterStatusAria: "Фільтр за статусом",
    allStatuses: "Усі статуси",
    loadError: "Не вдалося завантажити користувачів. Спробуйте ще раз.",
    empty: "Немає користувачів за поточними фільтрами.",
    // TASK-406: a role filter that matched nothing has an obvious next step —
    // say it, instead of reporting the filter back to the operator.
    emptyManagers: "Менеджерів ще немає — створіть службовий акаунт.",
    emptyAdmins: "Інших адміністраторів ще немає — створіть службовий акаунт.",
    colEmail: "Електронна пошта",
    colName: "Ім'я",
    colRole: "Роль",
    colStatus: "Статус",
    colJoined: "Дата реєстрації",
    back: "← Назад до користувачів",
    accountStatus: "Статус акаунта",
    accountActive: "Акаунт активний, користувач може входити.",
    accountInactive: "Акаунт деактивовано, користувач не може входити.",
    accountMetadata: "Метадані акаунта",
    fieldEmail: "Електронна пошта",
    fieldFullName: "Повне ім'я",
    fieldPhone: "Телефон",
    fieldMemberSince: "Учасник з",
    fieldUserId: "ID користувача",
    fieldCreated: "Створено",
    fieldUpdated: "Останнє оновлення",
    loadOneError: "Не вдалося завантажити користувача. Спробуйте ще раз.",
    // --- Customer card (TASK-252) ---------------------------------------------
    cardLtv: "Сума покупок (LTV)",
    cardOrderCount: "Кількість замовлень",
    cardRecentOrders: "Останні замовлення",
    cardViewAllOrders: "Переглянути всі",
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

    // --- Staff management (TASK-317 / TASK-334) -------------------------------
    roleManager: "Менеджер",
    roleUnknown: (role: string) => `Роль: ${role}`,
    createHeading: "Новий співробітник",
    create: "Створити співробітника",
    // TASK-406: on the live run the owner looked for a way to "promote" an
    // existing customer and concluded that creating a manager was impossible.
    // The heading now says outright what the button does.
    createHint:
      "«Створити співробітника» заводить НОВИЙ службовий акаунт: пошта, пароль і роль (адміністратор або менеджер). Щоб змінити роль наявного користувача, відкрийте його картку.",
    createDescription:
      "Акаунт для працівника магазину. Клієнти реєструються самі на вітрині — тут створюються лише адміністратори та менеджери.",
    createEmail: "Електронна пошта",
    createPassword: "Початковий пароль",
    createPasswordHint:
      "Мінімум 8 символів, з великою літерою, малою літерою та цифрою. Передайте його працівнику особисто — він зможе змінити пароль у своєму профілі.",
    createFirstName: "Ім'я",
    createLastName: "Прізвище",
    createRole: "Роль",
    createSubmit: "Створити",
    createToastDone: (email: string) => `Акаунт ${email} створено`,
    createToastFailed: "Не вдалося створити акаунт",
    createEmailTaken: "Такий email уже зареєстрований.",
    createEmailInvalid: "Введіть коректну електронну пошту",
    createPasswordWeak:
      "Пароль має містити щонайменше 8 символів, велику й малу літери та цифру",

    staffHeading: "Керування акаунтом",
    staffOwnerOnlyHint: "Ці дії доступні лише власнику магазину.",

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
      `Акаунт ${email} буде позначено як видалений: користувач більше не зможе увійти, але його замовлення та історія залишаться. Дію не можна скасувати з панелі.`,
    deleteConfirm: "Так, видалити акаунт",
    deleteToastDone: "Акаунт видалено",
    deleteToastFailed: "Не вдалося видалити акаунт",
    deleteSelf: "Не можна видалити власний акаунт.",

    // The API refuses to strip, deactivate or delete the last working admin —
    // surface that refusal verbatim instead of a generic failure toast.
    lastAdminRefusal:
      "Це останній адміністратор магазину — інакше увійти буде нікому. Спочатку створіть ще одного адміністратора.",

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
      "API поки не віддає стан блокування (`lockedUntil`, `failedLoginAttempts`), тож показати, чому користувач не може увійти, неможливо. Якщо працівник скаржиться на вхід — скиньте йому пароль: це знімає тимчасове блокування після невдалих спроб.",
  },

  // The `permissionsMatrix` block lived here until TASK-475. It was the copy for
  // a screen that edited ROLE permissions, and both the screen and the API behind
  // it are gone — rights belong to a person now. The new wording ships with
  // /staff (TASK-480); a stale block would only be copied by whoever writes it.

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
    colAction: "Дія",
    colEntity: "Об'єкт",
    filterActionPlaceholder: "Дія (напр. product.update)",
    filterActionAria: "Фільтр за дією",
    filterEntityAria: "Фільтр за типом об'єкта",
    filterEntityAll: "Усі об'єкти",
    systemActor: "Система",
    // The log denormalises the actor's email on purpose, so an entry stays
    // readable after the account is deleted. Show that, never a raw id.
    deletedActor: (email: string) => `${email} (акаунт видалено)`,
    noEntity: "—",
    diffToggle: "Що змінилося",
    diffFrom: "Було",
    diffTo: "Стало",
    noDiff: "Деталі змін не записані.",

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
      staff: "Персонал",
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
      clearProductDelta: "скинуто винятки для товару",
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
    filterActorAll: "Усі співробітники",
    filterActorMine: "Мої дії",
    /** An `actorId` from a pasted link that is not the viewer's own. */
    filterActorOther: (id: string) => `Співробітник ${id.slice(0, 8)}…`,
    filterRoleAria: "Фільтр за роллю",
    filterRoleAll: "Усі ролі",
  },

  // --- Own admin profile (TASK-317) -------------------------------------------
  profile: {
    metaTitle: "Мій профіль — Адмін",
    heading: "Мій профіль",
    accountSection: "Акаунт",
    fieldEmail: "Електронна пошта",
    fieldRole: "Роль",
    fieldUserId: "ID",
    permissionsSection: "Ваші права",
    permissionsOwner:
      "Ви власник магазину: усі права, включно з керуванням користувачами та журналом дій.",
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
  },

  // --- Newsletter subscribers (TASK-188) --------------------------------------
  subscribers: {
    metaTitle: "Підписники — Адмін",
    heading: "Підписники розсилки",
    searchPlaceholder: "Пошук за email…",
    searchAria: "Пошук підписників",
    filterStatusAria: "Фільтр за статусом",
    allStatuses: "Усі статуси",
    statusSubscribed: "Підписаний",
    statusUnsubscribed: "Відписаний",
    loadError: "Не вдалося завантажити підписників. Спробуйте ще раз.",
    empty: "Немає підписників за поточними фільтрами.",
    colEmail: "Email",
    colStatus: "Статус",
    colSource: "Джерело",
    colDate: "Дата підписки",
    sourceEmpty: "—",
    exportCsv: "Експорт CSV",
    exporting: "Експортуємо…",
    exportError: "Не вдалося експортувати CSV. Спробуйте ще раз.",
  },

  userBan: {
    toastDeactivated: "Користувача деактивовано.",
    toastActivated: "Користувача активовано.",
    toastFailed: "Не вдалося оновити статус користувача.",
    cannotSelf: "Неможливо деактивувати власний акаунт.",
    deactivateUserAria: "Деактивувати користувача",
    activateUserAria: "Активувати користувача",
  },

  statusToggle: {
    productDeactivate: "Деактивувати товар",
    productActivate: "Активувати товар",
    categoryDeactivate: "Деактивувати категорію",
    categoryActivate: "Активувати категорію",
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
    primary: "Головне",
    alt: "Зображення товару",
    moveLeft: "Перемістити ліворуч",
    moveRight: "Перемістити праворуч",
    setPrimary: "Зробити головним",
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
    metaTitle: "Карта контенту — Адмін",
    heading: "Карта контенту",
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
      "Назви, ціни, зображення й категорії товарів редагуються в розділах «Товари» та «Категорії» у верхньому меню.",
    groups: {
      global: "Глобально — на кожній сторінці",
      home: "Головна сторінка",
      info: "«Інформація» та картка товару",
      blog: "Блог",
      legal: "Правові та інші сторінки",
      // AD-CNT-26 (TASK-429): /promo — окрема сторінка вітрини, як і блог.
      promo: "Сторінка «Акції»",
    },
    zones: {
      announcementBar: {
        source: "Стрічка оголошень зверху",
        target: "Банери",
        appliesTo: "Кожна сторінка (шапка)",
      },
      heroSlide: {
        source: "Hero-слайдер",
        target: "Банери",
        appliesTo: "Головна",
      },
      promoTile: {
        source: "Промо-плитки",
        target: "Банери",
        appliesTo: "Головна",
      },
      promoBanner: {
        source: "Широкий промо-банер",
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
        source: "Контакти (телефон, адреса, соцмережі)",
        target: "Налаштування → Контакти",
        appliesTo: "Футер кожної сторінки та сторінка «Контакти»",
      },
      seoSettings: {
        // TASK-433 put the store name behind this same screen, and "where do I
        // change the name?" is exactly the question this map exists to answer.
        source: "Назва магазину, meta-заголовки та SEO за замовчуванням",
        target: "Налаштування → SEO",
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
    sampleNote:
      "Це приклад: так виглядатиме сторінка, у якої немає власного заголовка чи опису.",
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
    heading: "SEO-здоров'я",
    subheading:
      "Швидкий огляд стану SEO вашого магазину. Це не помилки — просто підказки, що можна покращити.",
    loadError: "Не вдалося завантажити стан SEO. Спробуйте ще раз.",
    // Auto-title rows — neutral/informational tone. `N із M`.
    autoHint: (missing: number, total: number) =>
      `${missing} із ${total} використовують автоматичний заголовок`,
    productsAutoLabel: "Товари без власного SEO-заголовка",
    categoriesAutoLabel: "Категорії без власного SEO-заголовка",
    pagesAutoLabel: "Сторінки без власного SEO-заголовка",
    // TASK-285: page content-gap rows (description missing / thin body). `N із M`.
    gapHint: (count: number, total: number) => `${count} із ${total}`,
    pagesMissingDescriptionLabel: "Сторінки без SEO-опису",
    pagesThinContentLabel: "Сторінки з неповним вмістом (< 300 символів)",
    // Defaults-filled row — soft amber nudge when empty, neutral when filled.
    defaultsFilledLabel: "SEO-налаштування за замовчуванням",
    defaultsFilledYes: "Заголовок і опис за замовчуванням заповнені.",
    defaultsFilledNo:
      "Рекомендуємо заповнити заголовок і опис сайту за замовчуванням нижче.",
    // noindex — the one genuinely urgent, RED state.
    noindexWarningTitle: "Сайт прихований від пошукових систем!",
    noindexWarningBody:
      "Зараз увесь магазин не показується в Google та інших пошукових системах. Якщо це робочий сайт — вимкніть «Приховати сайт від пошукових систем» нижче, інакше клієнти не знайдуть вас у пошуку.",
    noindexOkLabel: "Сайт видимий для пошукових систем.",
    // Outbound eyeball links to what the storefront actually serves.
    linksHeading: "Перевірити службові файли сайту",
    robotsLink: "robots.txt",
    sitemapLink: "sitemap.xml",
    llmsLink: "llms.txt",
    openLinkAria: (name: string) => `Відкрити ${name} у новій вкладці`,
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
    searchPlaceholder: "Пошук за заголовком…",
    searchAria: "Пошук каруселей",
    emptyMatch: (q: string) => `Немає каруселей за запитом «${q}».`,
    colTitle: "Заголовок",
    colSource: "Джерело",
    colPlacement: "Місце на сайті",
    colStatus: "Статус",
    placementLabels: {
      HOME_TABS: "Таб у «Популярному»",
      HOME_RAILS: "Окремий рейл",
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
    deleteConfirm: (title: string) =>
      `Видалити карусель «${title}»? Цю дію не можна скасувати.`,
    back: "← Назад до каруселей",
    createHeading: "Створення каруселі",
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
      "Порядок каруселей на головній = порядок рядків у межах кожного блоку. Перетягніть рядок за значок ліворуч або скористайтеся клавіатурою.",
  },

  // --- Recommendation carousel form (TASK-139) --------------------------------
  carouselForm: {
    title: "Заголовок",
    source: "Джерело товарів",
    sourceOptions: {
      BESTSELLING: "Хіти продажів",
      NEWEST: "Новинки",
      ON_SALE: "Акційні",
      CATEGORY: "Категорія",
      MANUAL: "Вибрані вручну",
    },
    placement: "Місце на головній сторінці",
    placementOptions: {
      HOME_TABS: "Таб у секції «Популярне»",
      HOME_RAILS: "Окремий рейл нижче",
    },
    placementHint:
      "«Таб у секції «Популярне»» — карусель стає вкладкою у блоці «Популярне» вгорі головної (клієнт перемикає таби). «Окремий рейл нижче» — карусель показується окремим рядком товарів нижче на головній. Порядок табів і рейлів задається перетягуванням рядків у списку каруселей — окремо для кожного блоку.",
    category: "Категорія",
    categoryPlaceholder: "Оберіть категорію",
    itemLimit: "Кількість товарів",
    itemLimitHint:
      "Від 1 до 24. Ігнорується для джерела «Вибрані вручну» — там показуються всі додані товари.",
    status: "Статус публікації",
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
      sortInt: "Порядок сортування має бути невід'ємним цілим числом",
      scheduledAtRequired: "Вкажіть дату публікації для запланованої каруселі",
    },
  },

  // --- MANUAL carousel item picker (TASK-139) ----------------------------------
  carouselItems: {
    heading: "Товари каруселі",
    hint: "Знайдіть товари через пошук і додайте їх до каруселі. Порядок у списку — це порядок на сайті.",
    searchPlaceholder: "Пошук товарів…",
    searchEmpty: "Нічого не знайдено",
    searchError: "Не вдалося виконати пошук. Спробуйте ще раз.",
    addLabel: "Додати",
    alreadyAdded: "Уже додано",
    removeAria: (name: string) => `Прибрати «${name}» з каруселі`,
    moveUpAria: (name: string) => `Перемістити «${name}» вгору`,
    moveDownAria: (name: string) => `Перемістити «${name}» вниз`,
    emptyHint: "Товарів ще немає. Знайдіть і додайте товари через пошук вище.",
    loadError: "Не вдалося завантажити товари каруселі. Спробуйте ще раз.",
    inactiveBadge: "Неактивний",
    toastSaved: "Список товарів збережено",
    toastSaveFailed: "Не вдалося зберегти список товарів",
    // AD-CNT-25 (TASK-429): for every source except «Вибрані вручну» this section
    // used to render NOTHING at all, so the operator concluded that reordering was
    // broken rather than inapplicable. Now it says what is actually true.
    autoHeading: "Порядок задає сайт автоматично",
    autoHint: (sourceLabel: string) =>
      `Ця карусель наповнюється автоматично — джерело «${sourceLabel}». Сайт сам обирає товари та їхню послідовність, тому вручну переставляти їх немає де.`,
    autoSwitchHint:
      "Щоб обрати товари самому й задати їхній порядок, змініть «Джерело товарів» на «Вибрані вручну» та збережіть карусель — після цього тут з'явиться список товарів.",
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
    keywordsCount: (n: number) => `Тегів: ${n}`,
    ogImage: "Картинка для соцмереж (OG)",
    ogImagePlaceholder: (host: string) => `https://${host}/og/сторінка.jpg`,
    ogImageHint:
      "Показується, коли посиланням діляться у Facebook, Telegram чи Viber. Розмір 1200×630. Якщо порожньо — береться власне зображення сторінки, потім загальна картинка з «Налаштування → SEO».",
    errors: {
      keywordsCount: (max: number) => `Не більше ${max} тегів`,
      keywordLength: (max: number) =>
        `Один тег має містити не більше ${max} символів`,
      ogImageUrl: "Вкажіть коректний URL картинки (http:// або https://)",
    },
  },
} as const;

export type AdminDictionary = typeof dict;
