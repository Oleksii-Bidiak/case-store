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
    // Accessible name for overlay close buttons (Dialog / Sheet) — TASK-259-F.
    close: "Закрити",
  },

  nav: {
    primaryAria: "Головне меню",
    accountAria: "Акаунт",
    products: "Товари",
    blog: "Блог",
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
    accountTriggerAria: "Відкрити меню акаунту",
    accountMenuAria: "Меню акаунту",
    searchPlaceholder: "Пошук товарів…",
    searchSubmit: "Шукати",
    // Top announcement bar (static — message + phone; TASK-167-A).
    announcement: "Безкоштовна доставка від 1 000 ₴ · Відправка день у день",
    phone: "0 800 00 00 00",
    phoneHref: "tel:0800000000",
    phoneAria: "Зателефонувати в підтримку",
    // Catalog mega-menu trigger + labelled action cluster.
    catalogButton: "Каталог",
    catalogAria: "Каталог категорій",
    catalogAll: "Усі категорії",
    promoLabel: "Акції",
    wishlistLabel: "Обране",
    cartLabel: "Кошик",
    accountLabel: "Кабінет",
    accountOpenAria: "Відкрити особистий кабінет",
    cartTotalAria: "Сума кошика",
  },

  // TASK-075 — full-text search (header autocomplete + /search results page).
  search: {
    /** Autocomplete input placeholder + accessible names. */
    placeholder: "Пошук товарів…",
    inputAria: "Пошук товарів",
    submitAria: "Виконати пошук",
    /** Autocomplete dropdown states. */
    loading: "Пошук…",
    empty: "Нічого не знайдено",
    /** Results page heading (with / without a query). */
    resultsTitle: (q: string) => `Результати пошуку: «${q}»`,
    resultsTitleEmpty: "Пошук товарів",
    countFound: (n: number) => `Знайдено товарів: ${n}`,
    /** Empty-results state for a non-blank query. */
    emptyHeading: (q: string) => `За запитом «${q}» нічого не знайдено`,
    emptyBody: "Спробуйте інший запит або перегляньте всі товари.",
    /** Prompt shown when the results page is opened without a query. */
    promptHeading: "Почніть пошук",
    promptBody: "Введіть назву товару у рядок пошуку вгорі сторінки.",
    /** Error + browse-all fallback. */
    error: "Не вдалося виконати пошук. Спробуйте пізніше.",
    browseAll: "Переглянути всі товари",
    /** Results pagination. */
    paginationAria: "Навігація сторінками",
    prevPage: "‹ Попередня",
    nextPage: "Наступна ›",
    pageOf: (page: number, total: number) => `${page} / ${total}`,
    /**
     * Blog-article section in the header-search dropdown (TASK-218) — doubles
     * as the visible section heading and the second listbox's aria-label.
     */
    blogSectionLabel: "Статті блогу",
  },

  footer: {
    rights: (year: number) => `© ${year} MobileStore. Усі права захищено.`,
    tagline:
      "Інтернет-магазин аксесуарів та ґаджетів. Оригінальна продукція з офіційною гарантією та доставкою по Україні.",
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
    contactTitle: "Контакти",
    contactEmail: "support@mobilestore.ua",
    contactPhone: "+380 44 000 0000",
    contactHours: "Пн–Нд: 9:00 – 20:00",
    paymentsAria: "Способи оплати",
    // Redesigned footer (TASK-167-B).
    catalogTitle: "Каталог",
    catalogAll: "Усі товари",
    catalogNew: "Новинки",
    catalogWishlist: "Обране",
    infoTitle: "Інформація",
    infoAbout: "Про нас",
    infoFaq: "Часті питання",
    infoBlog: "Блог",
    freeCallout: "Безкоштовно по Україні",
    socialsAria: "Ми в соцмережах",
    payments: ["Visa", "Mastercard", "Apple Pay", "Google Pay", "Privat24"],
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

  // TASK-162 — homepage redesign. All storefront homepage copy lives here.
  // Slider slides, promo tiles, trust items and social links are static
  // marketing content (no backend); category/product sections read real data.
  home: {
    hero: {
      // Left category rail (reuses real category data; these are labels only).
      allCategories: "Усі категорії",
      sidebarAria: "Категорії товарів",
      // Three promotional slides. `href` targets real routes so CTAs work.
      slides: [
        {
          eyebrow: "Новинки сезону",
          title: "Аксесуари, що тримають темп твого дня",
          subtitle:
            "Чохли, зарядки, аудіо та захист від офіційних брендів. Гарантія та швидка доставка по всій Україні.",
          cta: "Перейти до каталогу",
          href: "/products",
        },
        {
          eyebrow: "Тиждень знижок",
          title: "Знижки до −50% на топові аксесуари",
          subtitle:
            "Лише до неділі — встигни оновити комплект для свого смартфона за найкращою ціною.",
          cta: "Переглянути товари",
          href: "/products",
        },
        {
          eyebrow: "Доставка",
          title: "Безкоштовна доставка від 1 000 ₴",
          subtitle:
            "Нова Пошта по всій Україні · відправка день у день · оплата під час отримання.",
          cta: "Переглянути новинки",
          href: "/products?sortBy=createdAt&sortOrder=desc",
        },
      ],
      prevSlide: "Попередній слайд",
      nextSlide: "Наступний слайд",
      goToSlide: (n: number) => `Перейти до слайда ${n}`,
      pauseAutoplay: "Призупинити автоперегортання слайдів",
      resumeAutoplay: "Відновити автоперегортання слайдів",
    },

    // Device model picker — UI-only stub (API has no model→accessory filter).
    modelPicker: {
      title: "Підібрати аксесуари",
      subtitle: "за моделлю вашого пристрою",
      brandPlaceholder: "Бренд",
      brandAria: "Бренд пристрою",
      modelPlaceholder: "Модель",
      modelAria: "Модель пристрою",
      submit: "Підібрати",
      // Empty-state helpers for the cascade (TASK-190): the model select is
      // disabled until a brand is chosen; brands/models come from the API now.
      modelPlaceholderEmpty: "Спершу оберіть бренд",
      loading: "Завантаження…",
    },

    // Three static promo tiles under the hero.
    promoTiles: [
      {
        badge: "−30%",
        title: "Розпродаж аксесуарів",
        text: "Чохли, зарядки та захисне скло за зниженою ціною.",
        cta: "Дивитись акцію",
        href: "/products",
        accent: "sale" as const,
      },
      {
        badge: "КРЕДИТ 0%",
        title: "Покупка частинами",
        text: "До 24 платежів без переплат на замовлення.",
        cta: "Дізнатись більше",
        href: "#",
        accent: "primary" as const,
      },
      {
        badge: "TRADE-IN",
        title: "Обміняй старий ґаджет",
        text: "Знижка на нові аксесуари за твій старий пристрій.",
        cta: "Оцінити",
        href: "#",
        accent: "success" as const,
      },
    ],

    // Trust bar — four reassurance items (icon + title + subtitle).
    trust: [
      {
        title: "Доставка день у день",
        subtitle: "Нова Пошта по всій Україні",
      },
      {
        title: "Офіційна гарантія",
        subtitle: "Лише оригінальні аксесуари",
      },
      {
        title: "Повернення 30 днів",
        subtitle: "Легкий обмін і повернення",
      },
      {
        title: "Кредит 0%",
        subtitle: "Оплата частинами до 24 міс.",
      },
    ],

    categories: {
      heading: "Категорії",
      viewAll: "Усі розділи",
    },

    // Tabbed product rail. All three tabs are backed by real filters: "Хіти"
    // by the bestselling sort (units sold across PAID orders, TASK-164),
    // "Новинки" by newest-first, "Акційні" by a client-side on-sale filter.
    popular: {
      heading: "Популярне",
      tabs: {
        hits: "Хіти продажів",
        new: "Новинки",
        sale: "Акційні",
      },
      tabsAria: "Категорії добірки",
      prev: "Прокрутити назад",
      next: "Прокрутити вперед",
      viewAll: "Дивитись усі",
      error: "Не вдалося завантажити товари. Спробуйте пізніше.",
      empty: "Товарів поки немає.",
    },

    widePromo: {
      eyebrow: "Тиждень Apple",
      title: "Аксесуари для iPhone з вигодою до 30%",
      subtitle:
        "Оригінальні чохли, зарядки та захист + подарунок до кожного замовлення.",
      cta: "Дивитись пропозицію",
      href: "/products",
    },

    recentlyViewed: {
      heading: "Ви переглядали",
      clear: "Очистити історію",
      prev: "Прокрутити назад",
      next: "Прокрутити вперед",
      error: "Не вдалося завантажити переглянуті товари. Спробуйте пізніше.",
    },

    newsletter: {
      heading: "−10% на перше замовлення",
      subtitle:
        "Підпишись на розсилку та отримуй добірки новинок і персональні промокоди.",
      // External social links — no real URLs yet (href "#"). The widget renders a
      // "coming soon" toast for any placeholder href and a real <a> once set.
      socials: [
        { label: "Telegram", href: "#" },
        { label: "Instagram", href: "#" },
        { label: "YouTube", href: "#" },
        { label: "Viber", href: "#" },
      ],
      socialSoon: "Наші канали скоро запрацюють.",
    },
  },

  // Storefront /blog listing (Claude Design "Blog" import). Post content lives
  // in widgets/blog/model/posts.ts (static seed until the Blog backend — TASK-170).
  blog: {
    breadcrumbHome: "Головна",
    breadcrumb: "Блог",
    badge: "ЖУРНАЛ MOBILESTORE",
    heading: "Блог про техніку та ґаджети",
    subtitle:
      "Огляди, гайди й поради від команди MobileStore — щоб обрати саме те, що потрібно, і вичавити з ґаджета максимум.",
    searchPlaceholder: "Пошук у блозі…",
    searchAria: "Пошук у блозі",
    categoryFilterAria: "Категорії блогу",
    categories: {
      all: "Усі статті",
      reviews: "Огляди",
      guides: "Гайди",
      news: "Новини",
      tips: "Поради",
      compare: "Порівняння",
    },
    featuredBadge: "Головна тема тижня",
    loadMore: "Показати більше статей",
    emptyHeading: "Нічого не знайдено",
    emptyBody: "Спробуйте іншу категорію або уточніть запит.",
    newsletter: {
      heading: "Не пропускай нові статті",
      subtitle:
        "Підписуйся на канали MobileStore — огляди, гайди та знижки першими.",
      // External social links — no real URLs yet (href "#"). The widget renders a
      // "coming soon" toast for any placeholder href and a real <a> once set.
      socials: [
        { label: "Telegram", href: "#" },
        { label: "Instagram", href: "#" },
        { label: "YouTube", href: "#" },
      ],
      socialSoon: "Наші канали скоро запрацюють.",
    },
    // Article detail page (/blog/[slug], Article.dc.html import). The body is
    // shared demo content until the Blog backend (TASK-170) supplies real posts.
    article: {
      shareLabel: "Поділитись:",
      copyAria: "Скопіювати посилання",
      copied: "Посилання скопійовано",
      telegramAria: "Поділитись у Telegram",
      facebookAria: "Поділитись у Facebook",
      coverCaption: "[ обкладинка статті ]",
      tocHeading: "Зміст",
      relatedHeading: "Читайте також",
      // "{read} читання" — e.g. "8 хв читання".
      readSuffix: "читання",
      authorRolePlaceholder: "Оглядач мобільної техніки",
      authorBioPlaceholder:
        "Тестує смартфони й ноутбуки для MobileStore понад 5 років. Любить довгі порівняння та чесні висновки без маркетингу.",
    },
  },

  // Admin-authored static/legal pages (/legal + /legal/[slug], Legal.dc.html
  // template). Content comes from the Page backend (TASK-153); chrome copy only.
  legal: {
    breadcrumbHome: "Головна",
    breadcrumbHub: "Правова інформація",
    badge: "ПРАВОВИЙ ДОКУМЕНТ",
    // "{updatedPrefix} {date}" → "Чинна редакція від 12 червня 2026".
    updatedPrefix: "Чинна редакція від",
    print: "Завантажити PDF",
    tocHeading: "Зміст документа",
    tocAria: "Зміст документа",
    contactHeading: "Залишились питання?",
    contactSubtitle: "Напишіть нам — відповімо протягом робочого дня",
    contactCta: "Звʼязатися",
    // Contacts destination — the "Інформація та підтримка" page's Contacts tab.
    contactHref: "/info#contacts",
    otherHeading: "Інші правові документи",
    // Legal hub index (/info, LegalHub.dc.html import).
    hub: {
      badge: "ДОКУМЕНТИ",
      heading: "Правова інформація",
      subtitle:
        "Усі офіційні документи MobileStore в одному місці — політики, умови та гарантії. Оберіть потрібний документ, щоб прочитати повну редакцію.",
      // "{updatedPrefix} {date}" → "Оновлено 12 черв. 2026".
      updatedPrefix: "Оновлено",
      empty: "Документів поки немає.",
      supportHeading: "Не знайшли потрібне?",
      supportSubtitle:
        "Наша підтримка допоможе розібратись із будь-яким документом",
      supportCta: "Звʼязатися з нами",
    },
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
    emptyHeading: "Товари не знайдено",
    emptyBody:
      "Спробуйте змінити параметри фільтра або скиньте їх, щоб побачити більше товарів.",
    clearFilters: "Скинути фільтри",
    countFound: (n: number) => `Знайдено товарів: ${n}`,
    // TASK-216 — «Показати ще» load-more append between the grid and pagination.
    // Ukrainian pluralization: 1 товар, 2–4 товари, 5+ товарів.
    loadMore: (n: number) => {
      const mod10 = n % 10;
      const mod100 = n % 100;
      let word = "товарів";
      if (mod10 === 1 && mod100 !== 11) word = "товар";
      else if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20))
        word = "товари";
      return `Показати ще ${n} ${word}`;
    },
    loadMoreLoading: "Завантаження…",
    loadMoreError: "Не вдалося завантажити більше товарів. Спробуйте ще раз.",
    shownOfTotal: (shown: number, total: number) =>
      `Показано ${shown} з ${total}`,
    // Breadcrumb trail shown above the catalog title.
    breadcrumbHome: "Головна",
    breadcrumbProducts: "Товари",
    // Category-scoped catalog (`/products?categoryId=…`): the mid crumb links to
    // the categories hub, the last crumb is the selected category name.
    breadcrumbCategories: "Категорії",
    categoryFallback: "Категорія",
    categorySubtitle: (name: string) =>
      `Товари з категорії «${name}» — фільтруйте за ціною та сортуйте зручним способом.`,
    // In-catalog keyword search (`/products?search=…`, distinct from /search).
    searchTitle: (q: string) => `Пошук: «${q}»`,
    searchSubtitle: (q: string) => `Результати каталогу за запитом «${q}».`,
    // Catalog pagination a11y labels (TASK-259-F).
    paginationAria: "Навігація сторінками",
    paginationPreviousAria: "Попередня сторінка",
    paginationNextAria: "Наступна сторінка",
  },

  // Info & support hub (/info, Info.dc.html import). Content is static (stub)
  // except Contacts, which uses SiteContactSettings (TASK-154).
  info: {
    breadcrumbHome: "Головна",
    heading: "Інформація та підтримка",
    navAria: "Розділи інформації",
    nav: {
      delivery: "Доставка й оплата",
      warranty: "Гарантія та сервіс",
      faq: "Часті питання",
      about: "Про нас",
      contacts: "Контакти",
    },
    deliveryHeading: "Доставка",
    deliveryIntro:
      "Відправляємо замовлення день у день при оформленні до 18:00. Безкоштовно від 1 000 ₴.",
    paymentHeading: "Оплата",
    paymentIntro: "Обирайте зручний спосіб — онлайн або при отриманні.",
    warrantyHeading: "Гарантія та сервіс",
    warrantyIntro:
      "Уся техніка — офіційна, з гарантією виробника. Власний сервісний центр у Києві.",
    servicesHeading: "Додаткові сервіси захисту",
    aboutHeading: "Ми — MobileStore",
    aboutIntro:
      "Інтернет-магазин електроніки, який з 2018 року допомагає українцям обирати техніку без зайвого клопоту. Тільки оригінальні пристрої, офіційна гарантія та чесні ціни.",
    valuesHeading: "Чому обирають нас",
    contactsHeading: "Звʼяжіться з нами",
    contactPhoneLabel: "Телефон",
    contactEmailLabel: "Пошта",
    contactHoursLabel: "Графік",
    messengersLabel: "Ми у месенджерах",
    formHeading: "Напишіть нам",
    formIntro: "Відповідаємо протягом 1 робочого дня.",
    formName: "Ваше імʼя",
    formPhone: "Телефон",
    formEmail: "Email",
    formMessage: "Повідомлення",
    formSubmit: "Надіслати повідомлення",
    formSubmitting: "Надсилаємо…",
    formSent: "Дякуємо! Ми звʼяжемося з вами найближчим часом.",
    formError:
      "Не вдалося надіслати повідомлення. Спробуйте ще раз за хвилину.",
  },

  // TASK-167-Q — dedicated contact page (/contact, Contact.dc.html). Contact
  // channels/hours/messengers use the real SiteContactSettings (TASK-154);
  // the message form is a stub (no contact-message backend — TASK-177).
  contact: {
    breadcrumbHome: "Головна",
    breadcrumb: "Звʼязатися з нами",
    heading: "Звʼязатися з нами",
    intro:
      "Маєте питання про замовлення, доставку чи товар? Оберіть зручний спосіб — і ми відповімо якнайшвидше. Середній час відповіді — до 15 хвилин у робочі години.",
    stats: [
      { value: "15 хв", label: "середня відповідь" },
      { value: "9–21", label: "щодня без вихідних" },
    ],
    channels: {
      phoneLabel: "Гаряча лінія",
      phoneNote: "Безкоштовно по Україні",
      emailLabel: "Пошта",
      emailNote: "Відповідь до 1 дня",
      chatLabel: "Онлайн-чат",
      chatValue: "Написати зараз",
      chatNote: "Швидка відповідь у месенджерах",
      hoursLabel: "Графік роботи",
      hoursNote: "Без вихідних",
    },
    formHeading: "Напишіть нам",
    formIntro:
      "Заповніть форму — і менеджер звʼяжеться з вами протягом 1 робочого дня.",
    topicLabel: "Тема звернення",
    topics: [
      { key: "order", label: "Замовлення" },
      { key: "delivery", label: "Доставка" },
      { key: "warranty", label: "Гарантія та сервіс" },
      { key: "return", label: "Повернення" },
      { key: "other", label: "Інше" },
    ],
    fieldName: "Ваше імʼя",
    fieldNamePlaceholder: "Олександр",
    fieldPhone: "Телефон",
    fieldPhonePlaceholder: "+380 __ ___ __ __",
    fieldEmail: "Email",
    fieldEmailPlaceholder: "you@example.com",
    fieldOrder: "Номер замовлення",
    fieldOrderOptional: "(необовʼязково)",
    fieldOrderPlaceholder: "#000000",
    fieldMessage: "Повідомлення",
    fieldMessagePlaceholder: "Опишіть ваше питання…",
    consentBefore: "Я погоджуюсь на обробку персональних даних відповідно до ",
    consentLink: "Політики конфіденційності",
    submit: "Надіслати повідомлення",
    submitting: "Надсилаємо…",
    errors: {
      nameRequired: "Вкажіть ваше імʼя (щонайменше 2 символи).",
      phoneRequired: "Вкажіть коректний номер телефону.",
      emailInvalid: "Вкажіть коректну електронну пошту.",
      messageRequired: "Опишіть ваше питання (щонайменше 10 символів).",
      consentRequired: "Потрібна згода на обробку персональних даних.",
      submitFailed:
        "Не вдалося надіслати повідомлення. Перевірте зʼєднання та спробуйте ще раз.",
      rateLimited:
        "Забагато спроб. Зачекайте хвилину й спробуйте надіслати знову.",
    },
    sentHeading: "Дякуємо! Повідомлення надіслано",
    sentBody:
      "Ми вже отримали ваш запит і відповімо на вказану пошту найближчим часом.",
    sentAgain: "Надіслати ще одне",
    departmentsHeading: "Відділи",
    departments: [
      {
        key: "sales",
        title: "Відділ продажів",
        desc: "Допомога з вибором і замовленням",
        email: "sales@mobilestore.ua",
      },
      {
        key: "service",
        title: "Сервіс і гарантія",
        desc: "Ремонт, обмін, повернення",
        email: "service@mobilestore.ua",
      },
      {
        key: "b2b",
        title: "Співпраця",
        desc: "Опт, партнерство, реклама",
        email: "b2b@mobilestore.ua",
      },
    ],
    messengersHeading: "Ми у месенджерах",
    messengersIntro: "Швидка відповідь у зручному для вас чаті.",
    messengersEmpty: "Зателефонуйте нам — ми на звʼязку щодня.",
    officeHeading: "Головний офіс і шоурум",
    officeAddress: "м. Київ, вул. Хрещатик, 22",
    officeAddressNote: "2 поверх, ТЦ «Central»",
    officeHours: "Пн–Нд · 10:00–20:00",
    officeRoute: "Прокласти маршрут",
    officeMapAria: "Розташування офісу",
    faqHeading: "Можливо, відповідь уже є",
    faqBody: "Перегляньте часті питання про доставку, оплату та гарантію",
    faqCta: "До поширених питань",
  },

  notFound: {
    /** Big gradient error code + headline. */
    code: "404",
    heading: "Сторінку не знайдено",
    body: "Можливо, її переміщено або видалено. Перевірте адресу або поверніться на головну — там точно є що обрати.",
    /** Inline search box (native GET → /search). */
    searchPlaceholder: "Що шукаєте?",
    searchSubmitAria: "Знайти",
    /** Primary / secondary calls to action. */
    home: "На головну",
    catalog: "До каталогу",
    /** Popular-section quick links. */
    popularHeading: "Популярні розділи",
    popular: {
      smartphones: "Смартфони",
      laptops: "Ноутбуки",
      audio: "Аудіо",
      promo: "Акції",
    },
  },

  // TASK-167-N — Акції (promo) page. Hero copy + countdown are static marketing
  // content; coupons are static curated codes (no public discount-list API —
  // TASK-179); deals read real on-sale products; the subscribe form is a stub.
  promo: {
    breadcrumbHome: "Головна",
    breadcrumb: "Акції",
    hero: {
      badge: "Гарячий тиждень",
      heading: "Знижки до −40% на техніку",
      subtitle:
        "Найкращі ціни сезону на смартфони, ноутбуки та аудіо. Встигніть — пропозиція діє обмежений час.",
      cta: "До знижок",
    },
    countdown: {
      aria: "До кінця акції залишилось",
      days: "днів",
      hours: "год",
      minutes: "хв",
      seconds: "сек",
    },
    couponsHeading: "Промокоди тижня",
    couponCopyAria: (code: string) => `Скопіювати промокод ${code}`,
    couponCopied: (code: string) => `Промокод ${code} скопійовано`,
    couponsError: "Не вдалося завантажити промокоди. Спробуйте пізніше.",
    // Live active-discounts feed → ticket-card view model (TASK-179).
    couponUnitPercent: "на все",
    couponUnitFixed: "гривень",
    couponTitle: "Знижка за промокодом",
    couponMinSpend: (sum: string) => `Мінімальна сума ${sum} ₴`,
    couponExpires: (date: string) => `Діє до ${date}`,
    couponGeneric: "Діє обмежений час",
    dealsHeading: "Товари зі знижкою",
    dealsAll: "Усі",
    dealsEmpty: "Наразі немає товарів зі знижкою в цьому розділі.",
    dealsError: "Не вдалося завантажити товари. Спробуйте пізніше.",
    dealsFilterAria: "Фільтр за категорією",
    // «Показати ще» load-more for the on-sale grid (TASK-179). Ukrainian
    // pluralization: 1 товар, 2–4 товари, 5+ товарів.
    dealsLoadMore: (n: number) => {
      const mod10 = n % 10;
      const mod100 = n % 100;
      let word = "товарів";
      if (mod10 === 1 && mod100 !== 11) word = "товар";
      else if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20))
        word = "товари";
      return `Показати ще ${n} ${word}`;
    },
    dealsLoadMoreLoading: "Завантаження…",
    dealsLoadMoreError:
      "Не вдалося завантажити більше товарів. Спробуйте ще раз.",
    dealsShownOfTotal: (shown: number, total: number) =>
      `Показано ${shown} з ${total}`,
    newsletter: {
      heading: "Першими дізнавайтесь про знижки",
      subtitle:
        "Підпишіться — і ми надішлемо промокод −5% на перше замовлення та анонси розпродажів.",
      placeholder: "Ваш email",
      emailAria: "Email для підписки",
      submit: "Підписатися",
      submitted: "Готово ✓",
      success: "Дякуємо за підписку!",
      stubNote:
        "Форма демонстраційна — підписка поки не надсилається на сервер.",
    },
  },

  // Categories hub page (/categories, Categories.dc.html import).
  categories: {
    breadcrumbHome: "Головна",
    navAria: "Розділи категорій",
    descFallback: "Оберіть підкатегорію, щоб переглянути товари цього розділу.",
    emptyHeading: "Категорій поки немає",
    loadError: "Не вдалося завантажити категорії. Спробуйте пізніше.",
    viewAllInCategory: "Переглянути всі товари",
    // Popular brands strip — wired to the real Brand model (TASK-189).
    brandsHeading: "Популярні бренди",
  },

  filters: {
    legend: "Фільтри",
    category: "Категорія",
    allCategories: "Всі категорії",
    // TASK-216 — horizontal category chips row above the catalog grid.
    categoryChipsAria: "Фільтр за категорією",
    // TASK-236 — secondary row of subcategory chips under the active root.
    subcategoryChipsAria: "Фільтр за підкатегорією",
    priceRange: "Ціновий діапазон",
    minPrice: "Мінімальна ціна",
    maxPrice: "Максимальна ціна",
    minPlaceholder: "Від",
    maxPlaceholder: "До",
    sortBy: "Сортування",
    sortPrefix: "Спочатку:",
    sort: {
      newest: "Спочатку нові",
      priceAsc: "Ціна: від низької до високої",
      priceDesc: "Ціна: від високої до низької",
      nameAsc: "Назва: А–Я",
    },
    clear: "Скинути фільтри",
    clearAll: "Очистити все",
    removeFilter: "Прибрати фільтр",
    filtersButton: "Фільтри",
    // Grid / list results view toggle (catalog toolbar).
    viewGrid: "Плитка",
    viewList: "Список",
    viewToggleAria: "Перемкнути вигляд",
    // Manufacturer (brand) filter card — TASK-189.
    brandTitle: "Виробник",
    allBrands: "Всі виробники",
    // Price filter card + mobile drawer.
    priceTitle: "Ціна, ₴",
    priceSliderAria: "Діапазон цін",
    // TASK-084 — mobile drawer polish: live result count on the sticky "Apply"
    // footer. Ukrainian pluralization mirrors dict.catalog.loadMore's
    // mod10/mod100 rule; n === 0 gets an explicit empty-state label instead.
    mobileApply: (n: number) => {
      if (n === 0) return "Немає товарів за цими фільтрами";
      const mod10 = n % 10;
      const mod100 = n % 100;
      let word = "товарів";
      if (mod10 === 1 && mod100 !== 11) word = "товар";
      else if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20))
        word = "товари";
      return `Показати ${n} ${word}`;
    },
    // Shown on the mobile "Apply" button while the very first count is still in
    // flight (a warm grid cache normally resolves it before the drawer opens).
    mobileApplyPending: "Рахуємо…",
    searchLabel: "Пошук",
    searchPlaceholder: "Пошук товарів…",
    searchAria: "Пошук товарів",
    // Device-compatibility filter (TASK-190) — brand→model cascade.
    deviceTitle: "Сумісний пристрій",
    deviceBrandPlaceholder: "Бренд",
    deviceModelPlaceholder: "Модель",
    deviceBrandAria: "Бренд пристрою",
    deviceModelAria: "Модель пристрою",
    deviceLabel: "Пристрій",
    // Structured-spec facets (TASK-191) — shown only when a category is active.
    specsTitle: "Характеристики",
    specAnyOption: "Будь-яка",
    // TASK-084 — per-section collapse inside the mobile drawer (native <details>).
    sectionToggleAria: (section: string) => `Розгорнути/згорнути «${section}»`,
  },

  product: {
    saleBadge: "Розпродаж",
    newBadge: "Новинка",
    ratingAria: (average: number, count: number) =>
      `Рейтинг ${average.toFixed(1)} з 5 на основі ${count} відгуків`,
    chooseVariant: "Оберіть варіант",
    outOfStock: "Немає в наявності",
    sku: "Артикул:",
    description: "Опис",
    breadcrumbAria: "Навігаційний ланцюжок",
    breadcrumbHome: "Головна",
    breadcrumbProducts: "Товари",
    loadError:
      "На жаль, не вдалося завантажити цей товар. Можливо, він більше недоступний.",
    backToProducts: "Повернутися до каталогу",
    inStockLabel: "В наявності",
    lowStock: "Закінчується",
    tabDescription: "Опис",
    tabSpecs: "Характеристики",
    tabReviews: "Відгуки",
    tabDelivery: "Доставка й оплата",
    reviewsSoon: "Відгуки незабаром.",
    specsEmpty: "Характеристики ще не додані.",
    // Structured specs (TASK-191): PDP "Характеристики" table + highlights strip.
    highlightsTitle: "Коротко про товар",
    specBooleanYes: "Так",
    specBooleanNo: "Ні",
    relatedTitle: "Схожі товари",
    relatedPrev: "Попередні товари",
    relatedNext: "Наступні товари",
    // PDP device-compatibility cross-sell rail (TASK-190).
    compatibleTitle: "Сумісні аксесуари",
    codeLabel: "Код:",
    // Gallery image-switch loading overlay (TASK-214).
    imageLoading: "Завантаження зображення…",
    // Gallery thumbnail a11y (TASK-259-F).
    showImageAria: (n: number) => `Показати зображення ${n}`,
    imageThumbnailAlt: (n: number) => `Мініатюра зображення ${n}`,
    // Buy-box secondary actions — no backend yet (express order TASK-178,
    // product compare TASK-085), so both only surface a toast.
    buyOneClick: "Купити в 1 клік",
    oneClickStub: "Оформлення в 1 клік зʼявиться незабаром.",
    compareAria: "Додати до порівняння",
    compareStub: "Порівняння товарів зʼявиться незабаром.",
    // Static reassurance rows inside the buy box.
    buyBoxInfo: {
      delivery: {
        title: "Доставка Новою Поштою",
        text: "Безкоштовно від 1 000 ₴ · 1–2 дні",
      },
      warranty: {
        title: "Офіційна гарантія 12 міс.",
        text: "Сервісне обслуговування MobileStore",
      },
      returns: { title: "Повернення 14 днів", text: "Без пояснення причин" },
    },
    // "Доставка й оплата" tab — static delivery methods (curated copy).
    deliveryOptions: [
      {
        title: "Нова Пошта — відділення / поштомат",
        text: "1–2 робочі дні по Україні",
        price: "від 70 ₴",
        free: false,
      },
      {
        title: "Курʼєр додому",
        text: "Доставка день у день по місту",
        price: "90 ₴",
        free: false,
      },
      {
        title: "Самовивіз із магазину",
        text: "Готово до видачі за 1 годину",
        price: "Безкоштовно",
        free: true,
      },
    ],
  },

  reviews: {
    title: "Відгуки",
    outOf: "/ 5",
    // Ukrainian pluralization: 1 відгук, 2–4 відгуки, 5+ відгуків.
    ratingCount: (n: number) => {
      const mod10 = n % 10;
      const mod100 = n % 100;
      let word = "відгуків";
      if (mod10 === 1 && mod100 !== 11) word = "відгук";
      else if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20))
        word = "відгуки";
      return `${n} ${word}`;
    },
    empty: "Ще немає відгуків. Будьте першим, хто залишить відгук!",
    loading: "Завантаження відгуків…",
    loadError: "Не вдалося завантажити відгуки.",
    noComment: "Без коментаря",
    verifiedPurchase: "Підтверджена покупка",
    anonymous: "Покупець",
    // Submit form
    leaveReview: "Залишити відгук",
    loginToReview: "Увійдіть, щоб залишити відгук",
    loginLink: "Увійти",
    ratingLabel: "Ваша оцінка",
    ratingRequired: "Будь ласка, оберіть оцінку",
    starAria: (n: number) => `${n} з 5 зірок`,
    commentLabel: "Коментар (необов'язково)",
    commentPlaceholder: "Поділіться враженнями про товар…",
    submitReview: "Надіслати відгук",
    submitting: "Надсилаємо…",
    submitSuccess: "Дякуємо! Ваш відгук надіслано на модерацію.",
    submitError: "Не вдалося надіслати відгук. Спробуйте ще раз.",
    alreadyReviewed: "Ви вже залишили відгук на цей товар.",
  },

  addToCart: {
    idle: "Додати до кошика",
    buy: "Купити",
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
    // Mini-cart slide-out (TASK-167-A).
    openAria: "Відкрити кошик",
    viewCartFull: "Перейти в кошик",
    sheetShipping: "Безкоштовна доставка Новою Поштою",
    // line item
    remove: "Видалити",
    removeItemAria: "Видалити товар",
    removeNamedAria: (name: string) => `Видалити «${name}» з кошика`,
    viewProductAria: (name: string) => `Переглянути «${name}»`,
    decreaseAria: "Зменшити кількість",
    increaseAria: "Збільшити кількість",
    quantityAria: "Кількість",
    updateError: "Не вдалося оновити товар. Спробуйте ще раз.",
    // Cart page redesign (Cart.dc.html).
    breadcrumbHome: "Головна",
    breadcrumb: "Кошик",
    countShort: (n: number) => `${n} тов.`,
    inStock: "В наявності",
    outOfStock: "Немає в наявності",
    addExtra: "Додати ще товари",
    summaryHeading: "Разом",
    itemsLine: "Товари",
    deliveryLine: "Доставка",
    shippingFree: "Безкоштовно",
    addonServicesLine: "Додаткові послуги",
    payable: "До сплати",
    termsNote: "Натискаючи, ви погоджуєтесь з умовами магазину",
    // Per-item add-on offers — real, server-resolved (TASK-174).
    offersHeading: "Додаткові пропозиції для цього товару",
    // Add-on services (TASK-174) — own namespace so the module's copy stays
    // together as it grows.
    addons: {
      toggleError: "Не вдалося змінити послугу. Спробуйте ще раз.",
      selectedAria: (name: string) => `Послугу «${name}» додано`,
      deselectedAria: (name: string) => `Послугу «${name}» прибрано`,
    },
    // Delivery + payment blocks — stubs; the real selection lives in checkout.
    deliveryTitle: "Доставка",
    deliveryCityLabel: "Місто",
    deliveryCities: ["Київ", "Львів", "Одеса", "Харків", "Дніпро"],
    deliveryMethods: [
      "Нова Пошта — відділення",
      "Нова Пошта — поштомат",
      "Кур'єр додому",
      "Самовивіз із магазину",
    ],
    deliveryMethodAria: "Спосіб доставки",
    paymentTitle: "Оплата",
    paymentAria: "Спосіб оплати",
    payOnline: "Картка онлайн",
    payOnDelivery: "Оплата при отриманні",
  },

  // Promo code / discount (TASK-079)
  discounts: {
    title: "Промокод",
    placeholder: "Введіть промокод",
    inputAria: "Промокод",
    apply: "Застосувати",
    applying: "Застосування…",
    remove: "Прибрати",
    appliedLabel: (code: string) => `Промокод «${code}» застосовано`,
    discountLine: "Знижка",
    required: "Введіть промокод",
    tooLong: "Промокод занадто довгий",
    // Typed error codes from the API map to friendly messages.
    errors: {
      DISCOUNT_NOT_FOUND: "Такого промокоду не існує.",
      DISCOUNT_INACTIVE: "Цей промокод більше не діє.",
      DISCOUNT_NOT_STARTED: "Цей промокод ще не активний.",
      DISCOUNT_EXPIRED: "Термін дії промокоду закінчився.",
      DISCOUNT_MIN_SPEND_NOT_MET:
        "Сума замовлення не досягає мінімуму для цього промокоду.",
      DISCOUNT_MAX_REDEMPTIONS_REACHED:
        "Ліміт використань цього промокоду вичерпано.",
      DISCOUNT_USER_LIMIT_REACHED: "Ви вже використали цей промокод.",
      generic: "Не вдалося застосувати промокод. Спробуйте ще раз.",
    } as Record<string, string>,
  },

  checkout: {
    title: "Оформлення замовлення",
    shippingAddress: "Адреса доставки",
    billingAddress: "Адреса оплати",
    billingSame: "Адреса оплати збігається з адресою доставки",
    orderNotes: "Примітки до замовлення",
    placeOrder: "Підтвердити замовлення",
    placingOrder: "Оформлюємо замовлення…",
    // Multi-step flow navigation (TASK-146).
    nextStep: "Далі",
    prevStep: "Назад",
    reviewHeading: "Перевірте деталі замовлення",
    error400: "Деякі товари можуть бути недоступні. Перегляньте ваш кошик.",
    summaryTitle: "Підсумок замовлення",
    subtotal: "Сума",
    summaryError: "Не вдалося завантажити підсумок кошика.",
    pricesDisclaimer: "Ціни відображають поточний стан вашого кошика.",
    stepShipping: "Доставка",
    stepReview: "Перевірка",
    stepConfirm: "Підтвердження",
    // Progress stepper landmark label (TASK-259-F).
    progressAria: "Прогрес оформлення замовлення",
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
    // Checkout redesign (Checkout.dc.html).
    summaryHeading: "Ваше замовлення",
    itemsLine: "Товари",
    countShort: (n: number) => `${n} тов.`,
    discountLine: "Знижка",
    totalLine: "До сплати",
    secureNote: "Безпечна оплата · Дані захищені",
    // Payment method — a stub (no online-payment backend yet; the order is
    // created and settled per the admin flow — TASK-034).
    paymentHeading: "Оплата",
    paymentMethodAria: "Спосіб оплати",
    paymentStubNote:
      "Онлайн-оплату буде підключено — спосіб оплати узгоджуємо при підтвердженні замовлення.",
    paymentMethods: [
      {
        key: "card",
        title: "Картка онлайн",
        note: "Visa / Mastercard · Apple Pay, Google Pay",
      },
      {
        key: "cod",
        title: "Оплата при отриманні",
        note: "Готівкою або карткою у відділенні",
      },
      {
        key: "invoice",
        title: "Безготівковий рахунок",
        note: "Для юридичних осіб, з ПДВ",
      },
    ],
    // Loyalty bonuses — stub (no loyalty backend — TASK-175).
    bonusesStub: "Списати бонуси (програма лояльності — незабаром)",
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
    viewProductAria: (name: string) => `Переглянути «${name}»`,
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
    // Account dashboard redesign (Account.dc.html).
    dashboard: {
      backHome: "Повернутись на головну",
      greeting: (name: string) => `Привіт, ${name}`,
      logout: "Вихід",
      nav: {
        profile: "Особисті дані",
        orders: "Історія замовлень",
        favorites: "Обране",
        purchases: "Покупки",
        history: "Історія перегляду",
        bonuses: "Бонуси",
        compare: "Порівняння",
        settings: "Налаштування",
      },
      navAria: "Розділи кабінету",
      // Profile section
      profileHeading: "Особисті дані",
      contactHeading: "Контактна інформація",
      securityHeading: "Безпека",
      securityNote: "Змінюйте пароль регулярно, щоб захистити свій акаунт.",
      changePassword: "Змінити пароль",
      changePasswordStub: "Зміна пароля буде доступна незабаром",
      // Bonuses section (stub — no loyalty backend yet)
      bonusesHeading: "Бонуси",
      bonusesAvailable: "Доступно бонусів",
      bonusesHint: "знижки на наступні покупки",
      bonusesStub:
        "Програма лояльності готується — тут з’являться ваші бали та історія нарахувань.",
      // Settings section (stub)
      settingsHeading: "Налаштування",
      appearanceHeading: "Оформлення",
      appearanceNote:
        "Тема інтерфейсу автоматично підлаштовується під налаштування вашої системи.",
      themeDark: "Темна",
      themeLight: "Світла",
      themeSystem: "Системна",
      notificationsHeading: "Сповіщення",
      notifs: [
        {
          key: "promo",
          label: "Акції та знижки",
          desc: "Email про розпродажі й персональні пропозиції",
        },
        {
          key: "orders",
          label: "Статус замовлень",
          desc: "Сповіщення про зміну статусу та доставку",
        },
        {
          key: "price",
          label: "Зниження ціни",
          desc: "Коли товар з обраного дешевшає",
        },
      ],
      notifStub: "Налаштування сповіщень зберігаються лише в цьому браузері.",
      // Generic placeholder sections (no backend yet)
      comingSoonTitle: "Розділ у розробці",
      purchasesBody:
        "Куплені товари з’являться тут. Поки що перегляньте свої замовлення.",
      purchasesCta: "До замовлень",
      historyBody:
        "Історія переглядів показується на головній сторінці в блоці «Ви переглядали».",
      historyCta: "На головну",
      compareBody:
        "Порівняння товарів готується. Слідкуйте за оновленнями магазину.",
      compareCta: "До каталогу",
    },
  },

  cancelOrder: {
    trigger: "Скасувати замовлення",
    dialogTitle: "Скасувати замовлення?",
    dialogDescription:
      "Це дію неможливо скасувати. Замовлення буде закрито, а резервування товарів — знято.",
    confirm: "Так, скасувати",
    confirming: "Скасовуємо…",
    cancel: "Ні, залишити",
    success: "Замовлення скасовано",
    error: "Не вдалося скасувати замовлення. Спробуйте ще раз.",
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
    // Support escape hatch on the login form (TASK-287). The API answers every
    // failed login with the same generic message — it never says "your account is
    // deactivated" — so the form always offers a way to reach a human. Shown to
    // everyone; it discloses nothing about any account.
    support: {
      loginTrouble: "Проблеми зі входом?",
      contactLink: "Напишіть у підтримку",
    },
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
      // Slide-out extras (login "as in the mockup"). Social sign-in has no
      // backend yet — stubbed with a toast (TASK-168). Password reset is live
      // (TASK-169): `forgot` links to the reset flow.
      forgot: "Забули пароль?",
      orDivider: "або",
      google: "Google",
      apple: "Apple",
      socialSoon: "Соціальний вхід буде доступний згодом.",
    },
    forgotPassword: {
      heading: "Відновлення пароля",
      description:
        "Введіть email вашого акаунту — ми надішлемо посилання для скидання пароля.",
      email: "Email",
      submit: "Надіслати посилання",
      submitting: "Надсилаємо…",
      success:
        "Якщо такий email зареєстровано, ми надіслали посилання для скидання пароля. Перевірте вашу пошту.",
      backToLogin: "Повернутися до входу",
      validationEmail: "Введіть дійсну email-адресу",
    },
    resetPassword: {
      heading: "Новий пароль",
      description: "Придумайте новий пароль для вашого акаунту.",
      newPassword: "Новий пароль",
      confirmPassword: "Підтвердіть пароль",
      submit: "Зберегти пароль",
      submitting: "Зберігаємо…",
      success: "Пароль оновлено. Тепер увійдіть з новим паролем.",
      errorInvalidToken: "Посилання недійсне або застаріло. Спробуйте ще раз.",
      errorMissingToken:
        "Посилання неповне або пошкоджене. Скористайтеся посиланням з листа ще раз.",
      backToLogin: "Повернутися до входу",
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
      validationPasswordPolicy:
        "Пароль має містити велику та малу літери й цифру",
      validationPasswordMatch: "Паролі не збігаються",
      terms: "Погоджуюсь з умовами використання та політикою конфіденційності",
      validationTerms: "Потрібно прийняти умови використання",
    },
    logout: {
      signOut: "Вийти",
      signingOut: "Виходимо…",
    },
    // Header account slide-out (TASK-167-A).
    sheet: {
      title: "Особистий кабінет",
      tabLogin: "Вхід",
      tabRegister: "Реєстрація",
    },
  },

  meta: {
    rootTitle: "MobileStore — магазин аксесуарів для телефонів",
    rootDescription:
      "Ваш магазин аксесуарів для мобільних телефонів — чохли, зарядні пристрої, захисні скельця та інше.",
    homeTitle: "Головна",
    homeDescription:
      "Відкрийте для себе преміальні аксесуари для телефонів — чохли, зарядні пристрої, захисні скельця та інше.",
    productsTitle: "Товари",
    productsDescription:
      "Перегляньте всі аксесуари для телефонів — фільтруйте за категорією, ціною та ключовим словом і сортуйте, щоб знайти саме те, що потрібно.",
    categoriesTitle: "Категорії",
    categoriesDescription:
      "Усі категорії товарів магазину — оберіть розділ і перейдіть до потрібних товарів.",
    productFallbackTitle: "Товар",
    productFallbackDescription: "Переглянути деталі товару.",
    pageFallbackTitle: "Сторінка",
    cartTitle: "Кошик | MobileStore",
    cartDescription: "Перегляньте та змініть товари у вашому кошику.",
    checkoutTitle: "Оформлення замовлення | MobileStore",
    checkoutDescription: "Завершіть оформлення покупки.",
    orderTitle: (ref: string) => `Замовлення ${ref} підтверджено | MobileStore`,
    loginTitle: "Вхід | MobileStore",
    loginDescription: "Увійдіть до свого акаунту.",
    registerTitle: "Реєстрація | MobileStore",
    registerDescription: "Створіть новий акаунт.",
    forgotPasswordTitle: "Відновлення пароля | MobileStore",
    forgotPasswordDescription: "Отримайте посилання для скидання пароля.",
    resetPasswordTitle: "Новий пароль | MobileStore",
    resetPasswordDescription: "Установіть новий пароль для вашого акаунту.",
    accountTitle: "Мій акаунт | MobileStore",
    accountDescription: "Керуйте профілем та переглядайте свої замовлення.",
    ordersTitle: "Мої замовлення | MobileStore",
    ordersDescription: "Історія ваших замовлень.",
    blogTitle: "Блог",
    blogDescription:
      "Огляди, гайди та поради про смартфони, аксесуари й техніку — від команди MobileStore.",
    notFoundTitle: "Сторінку не знайдено",
    notFoundDescription:
      "Схоже, такої сторінки не існує. Скористайтеся пошуком або поверніться на головну.",
    promoTitle: "Акції та знижки",
    promoDescription:
      "Найкращі ціни сезону — промокоди тижня та товари зі знижкою на смартфони, ноутбуки та аудіо.",
    contactTitle: "Звʼязатися з нами",
    contactDescription:
      "Гаряча лінія, пошта, месенджери та адреса шоуруму — оберіть зручний спосіб звʼязку з MobileStore.",
  },

  // TASK-077 — variant dots + quick-add overlay on the product card.
  productCard: {
    /** Accessible label for the swatch row, listing the available colours. */
    colorsAvailable: (names: string[]) =>
      `Доступні кольори: ${names.join(", ")}`,
    /** Overflow indicator when more colours exist than dots shown. */
    moreColors: (n: number) => `+${n}`,
    /** Aria label for the hover/focus quick-add button. */
    quickAddAria: (name: string) => `Швидко додати «${name}» до кошика`,
    /** Compact label shown inside the quick-add overlay button. */
    quickAdd: "Швидке додавання",
    /** Aria label for the card "Купити" button. */
    buyAria: (name: string) => `Купити «${name}»`,
    /** Label for the card action once the product is already in the cart (TASK-213). */
    inCart: "В кошику",
    /** Aria label for the in-cart card action — clicking opens the mini-cart. */
    inCartAria: (name: string) => `«${name}» вже в кошику — відкрити кошик`,
    /** Availability line above the card action row. */
    inStockLine: "В наявності · доставка 1–2 дні",
    outOfStockLine: "Немає в наявності",
    /** Advertised "from {price}" prefix when a group has cheaper variants. */
    priceFrom: "від",
    /** Aria label for the wishlist heart when the product is NOT saved. */
    wishlistAddAria: (name: string) => `Додати «${name}» до списку бажань`,
    /** Aria label for the wishlist heart when the product IS saved. */
    wishlistRemoveAria: (name: string) => `Прибрати «${name}» зі списку бажань`,
  },

  // TASK-076 — wishlist / favorites (guest via cookie, merges on login).
  wishlist: {
    /** Header icon accessible label. */
    headerAria: "Список бажань",
    /** Mobile-menu link + nav label. */
    navLabel: "Список бажань",
    /** Page heading. */
    heading: "Список бажань",
    /** Count line under the heading. */
    count: (n: number) => `${n} ${n === 1 ? "товар" : "товарів"} збережено`,
    /** Empty-state heading + body + CTA. */
    emptyHeading: "Ваш список бажань порожній",
    emptyBody:
      "Збережіть товари, натиснувши на сердечко, щоб знайти їх пізніше.",
    emptyCta: "Перейти до товарів",
    /** Remove-from-list control on a saved card. */
    removeAria: (name: string) => `Прибрати «${name}» зі списку бажань`,
    remove: "Прибрати",
    /** Error toast when a toggle/remove mutation fails. */
    error: "Не вдалося оновити список бажань. Спробуйте ще раз.",
    /** Metadata for the /wishlist route. */
    metaTitle: "Список бажань | MobileStore",
    metaDescription: "Збережені товари у вашому списку бажань.",
    // TASK-167-P — wishlist redesign (Wishlist.dc.html): a client-side toolbar
    // (view / sort / add-all) + sidebar filters over the fetched saved items.
    breadcrumbHome: "Головна",
    countInList: (n: number) =>
      `${n} ${n === 1 ? "товар" : "товарів"} у списку`,
    sortAria: "Сортувати обране",
    sort: {
      recent: "Нещодавно додані",
      priceAsc: "Найдешевші",
      priceDesc: "Найдорожчі",
      sale: "Акційні",
    },
    quickTitle: "Обирай швидко",
    quickSale: "Зі знижкою",
    quickInStock: "В наявності",
    addAll: "Додати все в кошик",
    addAllDone: "Товари з обраного додано в кошик",
    addAllNone: "Немає доступних товарів для додавання",
    noMatchHeading: "Немає товарів за фільтрами",
    noMatchBody: "Спробуйте змінити параметри або скинути фільтри.",
    priceChip: (min: string, max: string) => `${min || "0"} – ${max || "∞"} ₴`,
  },

  // TASK-188 — reusable newsletter subscribe form (features/newsletter-subscribe).
  // Shared across the homepage newsletter block and the promo newsletter block.
  newsletterForm: {
    emailLabel: "Email для підписки",
    placeholder: "Ваш email",
    submit: "Підписатися",
    pending: "Підписуємо…",
    /** Success message — reinforces the −10% first-order incentive. */
    success:
      "Дякуємо за підписку! Промокод −10% на перше замовлення вже у вас.",
    /** Inline validation message for an empty/invalid email (mirrors zod). */
    invalidEmail: "Введіть коректний email",
    /** Generic failure. */
    error: "Не вдалося підписатися. Спробуйте ще раз.",
    /** 429 — too many attempts. */
    rateLimited: "Забагато спроб. Зачекайте хвилину та спробуйте знову.",
  },

  // TASK-086 — product quick-view modal (widgets/product-quick-view).
  quickView: {
    trigger: (name: string) => `Швидкий перегляд «${name}»`,
    title: "Швидкий перегляд",
    dialogDescription: (name: string) =>
      `Швидкий перегляд товару «${name}»: ціна, наявність і швидке додавання в кошик.`,
    loadError: "Не вдалося завантажити товар. Спробуйте ще раз.",
    retry: "Спробувати ще раз",
    viewFullDetails: "Переглянути повну сторінку товару",
    variantsNote: "Кольори та інші варіанти доступні на сторінці товару.",
  },
} as const;

export type Dictionary = typeof dict;
