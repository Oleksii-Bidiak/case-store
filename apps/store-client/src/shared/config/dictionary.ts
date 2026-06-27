// Ukrainian string dictionary for the storefront.
//
// Single-locale (uk) store — every user-facing string lives here so copy stays
// consistent and is translated in one place. Components import `dict` and read
// the relevant slice. Interpolated strings are exposed as small functions.
//
// If multi-locale is ever required, this object's shape already matches a
// next-intl message catalog, so migration is mechanical.

// Ukrainian labels for the order/payment status enums (TASK-129). Keyed by the
// raw API enum string with a `?? status` fallback at call sites. `PENDING` and
// `REFUNDED` exist in both enums but carry different customer-facing meanings,
// so the two maps are deliberately kept separate — never merge them.
const ORDER_STATUS_LABELS: Record<string, string> = {
  PENDING: "Очікує підтвердження",
  CONFIRMED: "Підтверджено",
  PROCESSING: "В обробці",
  SHIPPED: "Відправлено",
  DELIVERED: "Доставлено",
  CANCELLED: "Скасовано",
  REFUNDED: "Повернення коштів",
};

const PAYMENT_STATUS_LABELS: Record<string, string> = {
  PENDING: "Очікує оплати",
  PAID: "Оплачено",
  FAILED: "Помилка оплати",
  REFUNDED: "Кошти повернено",
};

export const dict = {
  common: {
    retry: "Спробувати ще раз",
    tryAgain: "Спробувати ще раз",
    goHome: "На головну",
    continueShopping: "Продовжити покупки",
    optional: "(необов'язково)",
    genericError: "Щось пішло не так. Спробуйте ще раз.",
  },

  nav: {
    primaryAria: "Головне меню",
    accountAria: "Акаунт",
    products: "Товари",
    cart: "Кошик",
    skipToContent: "Перейти до вмісту",
  },

  header: {
    signIn: "Увійти",
    register: "Реєстрація",
    myAccount: "Мій акаунт",
    cartAria: "Кошик",
    openMenu: "Відкрити меню",
    menuTitle: "Меню",
    searchPlaceholder: "Пошук товарів…",
    searchSubmit: "Шукати",
  },

  footer: {
    rights: (year: number) => `© ${year} MobileStore. Усі права захищено.`,
    tagline: "Преміальні аксесуари для ваших пристроїв.",
    shopTitle: "Магазин",
    shopAll: "Усі товари",
    shopCart: "Кошик",
    supportTitle: "Підтримка",
    supportFaq: "Часті запитання",
    supportReturns: "Повернення та обмін",
    supportContact: "Контакти",
    companyTitle: "Компанія",
    companyAbout: "Про нас",
    companyPrivacy: "Політика конфіденційності",
    companyTerms: "Умови використання",
    contactTitle: "Зв'язок",
    contactEmail: "support@mobilestore.ua",
    contactPhone: "+380 44 000 0000",
    contactHours: "Пн–Нд: 9:00 – 20:00",
    paymentsAria: "Способи оплати",
  },

  trust: {
    shipping: "Безкоштовна доставка від 1 000 ₴",
    returns: "Повернення протягом 30 днів",
    secure: "Безпечна оплата",
    support: "Підтримка 24/7",
  },

  hero: {
    heading: "Преміальні аксесуари для телефонів зі швидкою доставкою",
    subtitle:
      "Чохли, зарядні пристрої, захисні скельця та більше — усе необхідне для вашого телефону в одному місці.",
    cta: "Перейти до каталогу",
    ctaSecondary: "Переглянути новинки",
    badge: "Новинки сезону",
    highlights: {
      cases: "Чохли та захист",
      charging: "Швидка зарядка",
      audio: "Аудіо та гаджети",
    },
    ratingBadge: "4.8 середній рейтинг",
  },

  catalog: {
    categories: "Категорії товарів",
    latestProducts: "Рекомендовані товари",
    allProducts: "Всі товари",
    allProductsSubtitle:
      "Аксесуари для смартфонів на будь-який бюджет — від базових до преміум.",
    categoriesError: "Не вдалося завантажити категорії. Спробуйте пізніше.",
    noCategories: "Категорій поки немає.",
    categoriesAria: "Категорії товарів",
    productsError: "Не вдалося завантажити товари. Спробуйте пізніше.",
    emptyHeading: "Товари не знайдено. Спробуйте змінити фільтри.",
    clearFilters: "Скинути фільтри",
    countFound: (n: number) => `Знайдено товарів: ${n}`,
  },

  filters: {
    legend: "Фільтри",
    category: "Категорія",
    allCategories: "Всі категорії",
    priceRange: "Ціновий діапазон",
    minPrice: "Мінімальна ціна",
    maxPrice: "Максимальна ціна",
    minPlaceholder: "Від",
    maxPlaceholder: "До",
    sortBy: "Сортування",
    sort: {
      newest: "Спочатку нові",
      priceAsc: "Ціна: від низької до високої",
      priceDesc: "Ціна: від високої до низької",
      nameAsc: "Назва: А–Я",
    },
    clear: "Скинути фільтри",
    removeFilter: "Прибрати фільтр",
    filtersButton: "Фільтри",
    searchLabel: "Пошук",
    searchPlaceholder: "Пошук товарів…",
    searchAria: "Пошук товарів",
  },

  product: {
    saleBadge: "Розпродаж",
    newBadge: "Новинка",
    ratingAria: (average: number, count: number) =>
      `Рейтинг ${average.toFixed(1)} з 5 на основі ${count} відгуків`,
    chooseVariant: "Оберіть варіант",
    outOfStock: "Немає в наявності",
    inStock: (n: number) => `В наявності (${n})`,
    sku: "Артикул:",
    description: "Опис",
    breadcrumbAria: "Навігаційний ланцюжок",
    breadcrumbHome: "Головна",
    breadcrumbProducts: "Товари",
    loadError:
      "На жаль, не вдалося завантажити цей товар. Можливо, він більше недоступний.",
    backToProducts: "Повернутися до каталогу",
    inStockLabel: "В наявності",
    lowStock: (n: number) => `Залишилось мало: ${n} шт.`,
    tabDescription: "Опис",
    tabSpecs: "Характеристики",
    tabReviews: "Відгуки",
    reviewsSoon: "Відгуки незабаром.",
    specsEmpty: "Характеристики ще не додані.",
    relatedTitle: "Схожі товари",
    trustSecure: "Безпечне оформлення",
    trustReturns: "Легке повернення",
    trustDelivery: "Швидка доставка",
  },

  addToCart: {
    idle: "Додати до кошика",
    adding: "Додаємо…",
    added: "Додано ✓",
    error: "Не вдалося додати товар. Спробуйте ще раз.",
    // Mirrors dict.product.outOfStock; kept in the feature's own slice so the
    // compact card button can surface the state via its label.
    outOfStock: "Немає в наявності",
  },

  cart: {
    title: "Кошик",
    itemTypes: (n: number) => `Позицій: ${n}`,
    updatedAria: (count: number, subtotal: string) =>
      `Кошик оновлено: товарів ${count}, сума ${subtotal}.`,
    loadError: "Не вдалося завантажити кошик. Спробуйте ще раз.",
    emptyHeading: "Ваш кошик порожній",
    emptySubtitle: "Схоже, ви ще нічого не додали.",
    shopNow: "Перейти до каталогу",
    summaryTitle: "Підсумок замовлення",
    subtotal: "Сума",
    total: "Разом",
    itemsCount: (n: number) => `Товарів: ${n}`,
    checkout: "Оформити замовлення",
    checkoutAria: "Оформити замовлення",
    clear: "Очистити кошик",
    clearing: "Очищення…",
    clearConfirm: "Видалити всі товари з кошика?",
    clearTitle: "Очистити кошик?",
    clearDescription:
      "Усі товари будуть видалені з вашого кошика. Цю дію не можна скасувати.",
    clearCancel: "Скасувати",
    clearConfirmAction: "Так, очистити",
    clearError: "Не вдалося очистити кошик. Спробуйте ще раз.",
    secureCheckout: "Безпечне оформлення",
    shippingNotice: "Безкоштовна доставка від 1 000 ₴",
    continueShopping: "Продовжити покупки",
    // line item
    remove: "Видалити",
    removeItemAria: "Видалити товар",
    removeNamedAria: (name: string) => `Видалити «${name}» з кошика`,
    decreaseAria: "Зменшити кількість",
    increaseAria: "Збільшити кількість",
    quantityAria: "Кількість",
    updateError: "Не вдалося оновити товар. Спробуйте ще раз.",
  },

  checkout: {
    title: "Оформлення замовлення",
    shippingAddress: "Адреса доставки",
    billingAddress: "Адреса оплати",
    billingSame: "Адреса оплати збігається з адресою доставки",
    orderNotes: "Примітки до замовлення",
    placeOrder: "Підтвердити замовлення",
    placingOrder: "Оформлюємо замовлення…",
    error400: "Деякі товари можуть бути недоступні. Перегляньте ваш кошик.",
    summaryTitle: "Підсумок замовлення",
    subtotal: "Сума",
    summaryError: "Не вдалося завантажити підсумок кошика.",
    pricesDisclaimer: "Ціни відображають поточний стан вашого кошика.",
    stepShipping: "Доставка",
    stepReview: "Перевірка",
    stepConfirm: "Підтвердження",
    deliveryEstimateLabel: "Орієнтовна доставка",
    deliveryEstimateValue: "3–5 робочих днів",
    // Nova Poshta shipping estimate in the order summary (TASK-080).
    shippingCostLabel: "Доставка",
    shippingCalculating: "Розраховуємо…",
    shippingSelectCity: "Оберіть місто для розрахунку",
    etaValue: (days: number) => `Орієнтовно ${days}–${days + 1} роб. дн.`,
    fields: {
      firstName: "Ім'я",
      lastName: "Прізвище",
      company: "Компанія",
      address1: "Адреса (рядок 1)",
      address2: "Адреса (рядок 2)",
      city: "Місто",
      state: "Область / регіон",
      postalCode: "Поштовий індекс",
      country: "Країна",
      phone: "Телефон",
      deliveryAddress: "Адреса доставки / №відділення",
    },
    countryPlaceholder: "напр. UA",
    phonePlaceholder: "напр. +380 50 123 4567",
    deliveryPlaceholder: "напр. Нова Пошта, відділення №12",
    deliveryHint:
      "Вкажіть місто та відділення Нової Пошти або адресу для кур'єра. Доставку оформлюємо вручну.",
    // Nova Poshta autocomplete (TASK-080).
    cityPlaceholder: "Почніть вводити назву міста",
    warehousePlaceholder: "Оберіть відділення або введіть адресу",
    warehouseHint: "Спершу оберіть місто, щоб побачити відділення Нової Пошти",
    searchLoading: "Пошук…",
    searchEmpty: "Нічого не знайдено",
    validation: {
      firstName: "Ім'я є обов'язковим",
      lastName: "Прізвище є обов'язковим",
      address1: "Адреса (рядок 1) є обов'язковою",
      city: "Місто є обов'язковим",
      postalCode: "Поштовий індекс є обов'язковим",
      country: "Введіть 2-літерний код країни (напр. UA)",
      phone: "Вкажіть коректний номер телефону",
      deliveryAddress: "Адреса доставки є обов'язковою",
      notesMax: "Примітки не можуть перевищувати 500 символів",
      billingRequired:
        "Адреса оплати є обов'язковою, якщо вона відрізняється від адреси доставки.",
    },
  },

  order: {
    thankYou: "Дякуємо за ваше замовлення!",
    orderNumber: "Номер замовлення:",
    placedOn: "Дата замовлення:",
    orderStatusSr: "Статус замовлення",
    paymentStatusSr: "Статус оплати",
    // Direct-access label maps for components that render badge text (TASK-129).
    orderStatusLabels: ORDER_STATUS_LABELS,
    paymentStatusLabels: PAYMENT_STATUS_LABELS,
    orderStatusAria: (status: string) =>
      `Статус замовлення: ${ORDER_STATUS_LABELS[status] ?? status}`,
    paymentStatusAria: (status: string) =>
      `Статус оплати: ${PAYMENT_STATUS_LABELS[status] ?? status}`,
    paymentLabel: (status: string) =>
      `Оплата: ${PAYMENT_STATUS_LABELS[status] ?? status}`,
    itemsOrdered: "Замовлені товари",
    shippingAddress: "Адреса доставки",
    billingAddress: "Адреса оплати",
    /** Localize a 2-letter country code for display; falls back to the raw code. */
    countryLabel: (code: string) => (code === "UA" ? "Україна" : code),
    totalsTitle: "Підсумок замовлення",
    subtotal: "Сума",
    discount: "Знижка",
    shipping: "Доставка",
    tax: "Податок",
    total: "Разом",
    notesTitle: "Примітки",
    somethingWrong: "Щось пішло не так",
    loadErrorBody: "Не вдалося завантажити ваше замовлення. Спробуйте ще раз.",
    notFoundHeading: "Не вдалося знайти це замовлення",
    notFoundBody: "Замовлення не існує або належить іншому акаунту.",
  },

  account: {
    title: "Мій акаунт",
    profileHeading: "Профіль",
    email: "Електронна пошта",
    firstName: "Ім'я",
    lastName: "Прізвище",
    phone: "Телефон",
    save: "Зберегти зміни",
    saving: "Збереження…",
    saved: "Профіль оновлено",
    updateError: "Не вдалося оновити профіль. Спробуйте ще раз.",
    ordersLink: "Мої замовлення",
    ordersLinkDesc: "Переглянути історію замовлень",
    signOut: "Вийти",
    loadError: "Не вдалося завантажити профіль.",
    phoneInvalid: "Вкажіть коректний номер телефону",
  },

  orderHistory: {
    title: "Мої замовлення",
    empty: "У вас ще немає замовлень.",
    emptyCta: "Перейти до товарів",
    orderNumber: "Замовлення",
    placedOn: "Дата",
    total: "Разом",
    statusSr: "Статус замовлення",
    view: "Деталі",
    loadError: "Не вдалося завантажити замовлення. Спробуйте ще раз.",
    backToAccount: "До акаунту",
  },

  auth: {
    login: {
      heading: "Увійти",
      email: "Email",
      password: "Пароль",
      submit: "Увійти",
      submitting: "Входимо…",
      noAccount: "Немає акаунту?",
      registerLink: "Реєстрація",
      errorInvalid: "Невірний email або пароль.",
      validationEmail: "Введіть дійсну email-адресу",
      validationPassword: "Пароль є обов'язковим",
    },
    register: {
      heading: "Створити акаунт",
      email: "Email",
      firstName: "Ім'я",
      lastName: "Прізвище",
      password: "Пароль",
      confirmPassword: "Підтвердіть пароль",
      submit: "Створити акаунт",
      submitting: "Створюємо…",
      haveAccount: "Вже є акаунт?",
      signInLink: "Увійти",
      errorConflict: "Цей email вже зареєстровано.",
      validationEmail: "Введіть дійсну email-адресу",
      validationFirstName: "Ім'я є обов'язковим",
      validationLastName: "Прізвище є обов'язковим",
      validationPassword: "Пароль має містити щонайменше 8 символів",
      validationPasswordMatch: "Паролі не збігаються",
    },
    logout: {
      signOut: "Вийти",
      signingOut: "Виходимо…",
    },
  },

  meta: {
    rootTitle: "Магазин аксесуарів для телефонів",
    rootDescription:
      "Ваш магазин аксесуарів для мобільних телефонів — чохли, зарядні пристрої, захисні скельця та інше.",
    homeTitle: "Головна",
    homeDescription:
      "Відкрийте для себе преміальні аксесуари для телефонів — чохли, зарядні пристрої, захисні скельця та інше.",
    productsTitle: "Товари",
    productsDescription:
      "Перегляньте всі аксесуари для телефонів — фільтруйте за категорією, ціною та ключовим словом і сортуйте, щоб знайти саме те, що потрібно.",
    productFallbackTitle: "Товар",
    productFallbackDescription: "Переглянути деталі товару.",
    cartTitle: "Кошик | MobileStore",
    cartDescription: "Перегляньте та змініть товари у вашому кошику.",
    checkoutTitle: "Оформлення замовлення | MobileStore",
    checkoutDescription: "Завершіть оформлення покупки.",
    orderTitle: (ref: string) => `Замовлення ${ref} підтверджено | MobileStore`,
    loginTitle: "Вхід | MobileStore",
    loginDescription: "Увійдіть до свого акаунту.",
    registerTitle: "Реєстрація | MobileStore",
    registerDescription: "Створіть новий акаунт.",
    accountTitle: "Мій акаунт | MobileStore",
    accountDescription: "Керуйте профілем та переглядайте свої замовлення.",
    ordersTitle: "Мої замовлення | MobileStore",
    ordersDescription: "Історія ваших замовлень.",
  },
} as const;

export type Dictionary = typeof dict;
