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
    categories: "Категорії",
    brands: "Бренди",
    addonServices: "Додаткові послуги",
    devices: "Пристрої",
    discounts: "Промокоди",
    pages: "Сторінки",
    banners: "Банери",
    blog: "Блог",
    orders: "Замовлення",
    reviews: "Відгуки",
    messages: "Повідомлення",
    users: "Користувачі",
    subscribers: "Підписники",
    contentMap: "Де що на сайті",
    siteContact: "Контакти",
    seoSettings: "SEO",
    faq: "FAQ",
  },

  header: {
    title: "Панель керування",
    adminLabel: "Адміністратор",
    openMenu: "Відкрити меню",
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
    back: "← Назад до товарів",
    createHeading: "Створення товару",
    editHeading: "Редагування товару",
    createSubmit: "Створити товар",
    loadOneError: "Не вдалося завантажити товар. Спробуйте ще раз.",
    imagesHeading: "Зображення товару",
    toastCreated: "Товар створено",
    toastCreateFailed: "Не вдалося створити товар",
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
  },

  productForm: {
    name: "Назва",
    slug: "Slug",
    slugPlaceholder: "Залиште порожнім для авто-генерації з назви",
    slugPreview: (slug: string) => `Буде згенеровано: ${slug}`,
    description: "Опис",
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
      descriptionMax: "Опис має містити не більше 5000 символів",
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
      // Blast radius (§3.11): stated BEFORE the mutation fires, N computed from
      // the tree already in memory.
      deactivateConfirm: (name: string, count: number) =>
        `„${name}“ буде приховано разом із ${count} підкатегоріями`,
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
    colName: "Назва",
    colSlug: "Slug",
    colBrand: "Бренд",
    colSeries: "Серія",
    colYear: "Рік",
    colModels: "Моделі",
    colSort: "Порядок",
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
  },

  deviceBrandForm: {
    name: "Назва бренду",
    slug: "Slug",
    slugPlaceholder: "Залиште порожнім для авто-генерації з назви",
    sortOrder: "Порядок сортування",
    active: "Активний (показувати в магазині)",
    submit: "Зберегти бренд",
    errors: {
      nameRequired: "Вкажіть назву",
      nameMax: "Назва має містити не більше 255 символів",
      slugMax: "Slug має містити не більше 255 символів",
      slugPattern: "Використовуйте малі літери, цифри та поодинокі дефіси",
      sortInt: "Порядок сортування має бути невід'ємним цілим числом",
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
    colTitle: "Заголовок",
    colSlug: "Slug",
    colStatus: "Статус",
    colSort: "Порядок",
    colCreated: "Створено",
    statusPublished: "Опубліковано",
    statusDraft: "Чернетка",
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
    sortOrder: "Порядок сортування",
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
    },
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
    colTitle: "Заголовок",
    colCategory: "Категорія",
    colStatus: "Статус",
    colFeatured: "Головна",
    featuredYes: "Так",
    statusPublished: "Опубліковано",
    statusScheduled: "Заплановано",
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
    },
  },

  // --- Rich-text "edit / preview" tab pair (page + blog forms, TASK-266) ------
  contentPreview: {
    tabEdit: "Редагування",
    tabPreview: "Перегляд",
    emptyContent: "Почніть писати, щоб побачити попередній перегляд…",
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
    colSort: "Порядок",
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
    sortOrder: "Порядок сортування",
    submit: "Зберегти категорію",
    errors: {
      nameRequired: "Вкажіть назву",
      nameMax: "Назва має містити не більше 120 символів",
      slugMax: "Slug має містити не більше 255 символів",
      slugPattern: "Використовуйте малі літери, цифри та поодинокі дефіси",
      sortInt: "Порядок сортування має бути невід'ємним цілим числом",
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
    colSort: "Порядок",
    placements: {
      HERO_SLIDE: "Головний слайдер",
      PROMO_TILE: "Промо-плитки",
      PROMO_BANNER: "Промо-банер",
      ANNOUNCEMENT_BAR: "Смуга оголошень",
    },
    statusLabels: {
      DRAFT: "Чернетка",
      SCHEDULED: "Заплановано",
      PUBLISHED: "Опубліковано",
    },
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
    sortOrder: "Порядок сортування",
    status: "Статус публікації",
    statusDraft: "Чернетка",
    statusScheduled: "Заплановано",
    statusPublished: "Опубліковано",
    scheduledAt: "Дата публікації",
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
      sortInt: "Порядок сортування має бути невід'ємним цілим числом",
      scheduledAtRequired: "Вкажіть дату публікації для запланованого банера",
    },
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
    defaultMetaTitlePlaceholder: "MobileStore — аксесуари для смартфонів",
    defaultMetaTitleHint:
      "Заголовок, який показується у вкладці браузера та в результатах пошуку, коли у сторінки немає власного заголовка. Залиште порожнім — і заголовок згенерується автоматично з назви сторінки.",
    defaultMetaDescription: "Опис сайту за замовчуванням",
    defaultMetaDescriptionPlaceholder:
      "Мультибрендовий магазин аксесуарів та Apple-техніки. Доставка по Україні.",
    defaultMetaDescriptionHint:
      "Короткий опис магазину (1–2 речення), який Google показує під заголовком у результатах пошуку — коли у сторінки немає власного опису.",
    titleTemplate: "Шаблон заголовка сторінки",
    titleTemplatePlaceholder: "%s | MobileStore",
    titleTemplateHint:
      "Шаблон заголовка сторінки. %s буде замінено на назву конкретної сторінки. Залиште порожнім — і ми додамо назву магазину після заголовка автоматично.",
    defaultOgImage: "Зображення для соцмереж (OG-картинка)",
    defaultOgImagePlaceholder: "https://mobilestore.ua/og-image.jpg",
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
      "https://facebook.com/mobilestore\nhttps://youtube.com/@mobilestore",
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
    },
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
    colOrder: "Порядок",
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
    sortOrder: "Порядок сортування",
    sortOrderHint:
      "Число, що визначає порядок показу: менші числа — вище у списку. Залиште 0, якщо порядок не важливий.",
    isActive: "Показувати на сайті",
    isActiveHint:
      "Приховані запитання не показуються клієнтам, але залишаються тут для повторного увімкнення.",
    submit: "Зберегти запитання",
    errors: {
      questionRequired: "Вкажіть запитання",
      questionMax: "Запитання має містити не більше 500 символів",
      answerRequired: "Вкажіть відповідь",
      answerMax: "Відповідь має містити не більше 5000 символів",
      sortOrderInt: "Порядок має бути цілим числом (0 або більше)",
    },
  },

  // --- Orders (TASK-115) ------------------------------------------------------
  // NB: raw status enum values (PENDING…) are intentionally left untranslated —
  // user-facing status labels are owned by TASK-129.
  orders: {
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
  },

  reviews: {
    metaTitle: "Відгуки — Адмін",
    heading: "Модерація відгуків",
    filterStatusAria: "Фільтр за статусом",
    filterPending: "На розгляді",
    filterApproved: "Опубліковані",
    colProduct: "Товар",
    colAuthor: "Автор",
    colRating: "Оцінка",
    colComment: "Коментар",
    colDate: "Надіслано",
    noComment: "—",
    approve: "Схвалити",
    reject: "Відхилити",
    emptyQueue: "Немає відгуків для модерації.",
    loadError: "Не вдалося завантажити відгуки. Спробуйте ще раз.",
    approveSuccess: "Відгук схвалено.",
    rejectSuccess: "Відгук відхилено.",
    actionError: "Не вдалося виконати дію. Спробуйте ще раз.",
    ratingAria: (rating: number) => `${rating} з 5 зірок`,
    // TASK-276: names the card-mode row group for screen readers.
    rowAria: (product: string, author: string) =>
      `Відгук на «${product}» від ${author}`,
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
    cardCoupons: "Використані купони",
    cardNoCoupons: "Купони ще не використовувались.",
    cardMessages: "Звернення (за email)",
    cardNoMessages: "Звернень ще немає.",
    cardMessageNoTopic: "Без теми",
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
    hint: "JPEG, PNG, WebP або GIF — до 5 МБ кожен.",
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
        source: "Правові та інші статичні сторінки",
        target: "Сторінки",
        appliesTo: "Розділ «Правова інформація» та кожен документ",
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
        source: "Meta-заголовки та SEO за замовчуванням",
        target: "Налаштування → SEO",
        appliesTo: "Кожна сторінка (невидимо: title, meta, robots)",
      },
    },
  },

  // SERP-snippet preview under the meta fields (план 130, TASK-268). A live
  // Google-result mock (title / green URL / description) + char counters + a
  // "blank field = auto-generated" hint, shown under the metaTitle/
  // metaDescription fields on product/category/page forms and the /settings/seo
  // defaults form. `urlHost` is an illustrative storefront host for the
  // breadcrumb line only — advisory UX, not the real canonical origin.
  seoSnippetPreview: {
    heading: "Перегляд у результатах пошуку Google",
    urlHost: "mobilestore.ua",
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
    colTitle: "Заголовок",
    colSource: "Джерело",
    colStatus: "Статус",
    colSort: "Порядок",
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
    category: "Категорія",
    categoryPlaceholder: "Оберіть категорію",
    itemLimit: "Кількість товарів",
    itemLimitHint:
      "Від 1 до 24. Ігнорується для джерела «Вибрані вручну» — там показуються всі додані товари.",
    sortOrder: "Порядок сортування",
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
} as const;

export type AdminDictionary = typeof dict;
