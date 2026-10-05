import { PERM } from "@/entities/permission";
import { dict } from "@/shared/config";

/**
 * «Довідка розділу» content (TASK-1035) — one entry per nav section.
 *
 * SOURCE: `docs/admin-guide.md` (the «Що це» part of each chapter), condensed to
 * two or three lines a person can read without leaving the screen. Where the
 * guide has no chapter for a section the text is a short, honest description of
 * what the screen does today — nothing here promises a control the panel does
 * not have. When a chapter of the guide changes, change its entry here.
 *
 * `rights` names the keys that decide what a person may do ON THIS SCREEN, each
 * with the verb phrase the sheet builds its «Ви можете …» / «… не можете»
 * sentences from. The keys are the backend catalogue's
 * (`permission.catalog.ts`); `PERM` is used wherever it names one, and the few
 * the UI never references elsewhere are spelled out (see {@link RAW}).
 *
 * Kept OUT of `dictionary.ts` on purpose: it is per-route content, not chrome,
 * and it is read by computed key (the current pathname), which the dictionary
 * usage guard cannot see through.
 */
export interface HelpRight {
  /** Permission key from the backend catalogue. */
  permission: string;
  /** Lower-case verb phrase: «переглядати замовлення». */
  phrase: string;
}

export interface HelpSection {
  /**
   * Route prefix this entry covers: the exact path for `/`, the path and every
   * sub-route for the rest (`/devices` covers `/devices/brands` and
   * `/devices/models/…`).
   */
  prefix: string;
  /** Section name in the sheet title — the nav label where there is one. */
  title: string;
  /** «Що тут робиться». */
  what: readonly string[];
  /** «Ваші права тут». Empty → the section needs no right of its own. */
  rights: readonly HelpRight[];
}

/**
 * Catalogue keys that exist on the API but that no other admin screen names, so
 * `PERM` (deliberately a list of what the UI references, not a copy of the
 * catalogue) does not carry them.
 */
const RAW = {
  categoriesDelete: "categories:delete",
  attributesWrite: "attributes:write",
  analyticsRevenue: "analytics:revenue",
} as const;

const staff = dict.nav.staff;

export const HELP_SECTIONS: readonly HelpSection[] = [
  {
    prefix: "/",
    title: dict.nav.dashboard,
    what: [
      "«Потребує дії» — нові замовлення, заявки на повернення, відгуки й звернення, що чекають на вас.",
      "Показники продажу, залишки, що закінчуються, останні замовлення й відвідуваність.",
      "Що саме видно, залежить від ваших прав: недоступні блоки просто не показуються.",
    ],
    rights: [
      {
        permission: PERM.analyticsRead,
        phrase: "бачити показники й «Потребує дії»",
      },
      {
        permission: RAW.analyticsRevenue,
        phrase: "бачити виторг і фінансові показники",
      },
      { permission: PERM.ordersRead, phrase: "бачити останні замовлення" },
    ],
  },
  {
    prefix: "/products",
    title: dict.nav.products,
    what: [
      "Картки товарів: ціни, залишки, фото, характеристики й сумісність із пристроями.",
      "Публікація товару на вітрині й перемикач видимості.",
      "Дії над кількома товарами одразу — у рядку над таблицею.",
    ],
    rights: [
      { permission: PERM.productsRead, phrase: "переглядати товари" },
      { permission: PERM.productsWrite, phrase: "редагувати товари й ціни" },
      { permission: PERM.productsDelete, phrase: "видаляти товари" },
    ],
  },
  {
    prefix: "/catalog-import",
    title: dict.nav.catalogImport,
    what: [
      "Завантаження прайсу постачальника у форматі .xlsx замість заведення товарів руками.",
      "Перед записом видно, що саме зміниться, — нічого не записується без вашого підтвердження.",
    ],
    rights: [
      { permission: PERM.catalogImport, phrase: "імпортувати каталог з файлу" },
    ],
  },
  {
    prefix: "/product-groups",
    title: dict.nav.productGroups,
    what: [
      "Група об'єднує варіанти одного товару (напр. кольори) в одну картку на вітрині.",
      "Кожен варіант — окрема позиція зі своєю ціною, артикулом і залишком.",
    ],
    rights: [
      { permission: PERM.productsRead, phrase: "переглядати групи товарів" },
      {
        permission: PERM.productsWrite,
        phrase: "створювати й змінювати групи",
      },
    ],
  },
  {
    prefix: "/categories",
    title: dict.nav.categories,
    what: [
      "Дерево розділів каталогу — до чотирьох рівнів; покупці орієнтуються по ньому в меню й фільтрах.",
      "Порядок і вкладеність змінюються перетягуванням.",
      "На категорії задаються шаблони характеристик і додаткові послуги для всіх її товарів.",
    ],
    rights: [
      {
        permission: PERM.categoriesWrite,
        phrase: "створювати й змінювати категорії",
      },
      { permission: RAW.categoriesDelete, phrase: "видаляти категорії" },
      {
        permission: RAW.attributesWrite,
        phrase: "змінювати шаблони характеристик",
      },
    ],
  },
  {
    prefix: "/brands",
    title: dict.nav.brands,
    what: [
      "Виробники аксесуарів (Baseus, Anker, Spigen…).",
      "Покупці фільтрують каталог за брендом і бачать блок «Популярні бренди».",
    ],
    rights: [
      {
        permission: PERM.brandsWrite,
        phrase: "створювати й змінювати бренди",
      },
    ],
  },
  {
    prefix: "/addon-services",
    title: dict.nav.addonServices,
    what: [
      "Послуги, які покупець додає до товару в кошику: розширена гарантія, наклеювання скла тощо.",
      "Де пропонувати послугу, задається на категорії, а винятки — на товарі.",
    ],
    rights: [
      {
        permission: PERM.addonsWrite,
        phrase: "керувати додатковими послугами",
      },
    ],
  },
  {
    prefix: "/devices",
    title: dict.nav.devices,
    what: [
      "Бренди пристроїв (Apple, Samsung, Xiaomi…) і їхні моделі.",
      "Дають покупцям фільтр «аксесуари для мого пристрою» й окремі сторінки сумісності.",
      "Сумісність товару з моделями задається в картці товару.",
    ],
    rights: [
      {
        permission: PERM.devicesWrite,
        phrase: "керувати пристроями та сумісністю",
      },
    ],
  },
  {
    prefix: "/discounts",
    title: dict.nav.discounts,
    what: [
      "Промокоди на знижку, які покупець вводить у кошику.",
      "Видно, скільки разів код використано і до якої дати він діє.",
      "Код можна деактивувати, не видаляючи.",
    ],
    rights: [
      {
        permission: PERM.discountsWrite,
        phrase: "керувати промокодами та знижками",
      },
    ],
  },
  {
    prefix: "/pages",
    title: dict.nav.pages,
    what: [
      "Текстові сторінки сайту: оферта, політика конфіденційності, доставка, «Про нас».",
      "Три види: юридична, довідкова й хаб — заголовок і опис для Google розділу, який на сайті вже є.",
      "Публікація одразу або за розкладом.",
    ],
    rights: [
      {
        permission: PERM.pagesWrite,
        phrase: "створювати й змінювати сторінки",
      },
    ],
  },
  {
    prefix: "/blog",
    title: dict.nav.blog,
    what: [
      "Статті для контент-маркетингу: новини, гайди, огляди.",
      "Категорії блогу — кнопка «Категорії» вгорі списку.",
      "Публікація й зняття з публікації прямо в рядку статті.",
    ],
    rights: [
      { permission: PERM.blogWrite, phrase: "писати й публікувати статті" },
    ],
  },
  {
    prefix: "/banners",
    title: dict.nav.banners,
    what: [
      "Рекламні блоки на головній: слайдер, промо-плитки, широкий банер і смуга оголошень.",
      "Кожен банер прив'язаний до конкретного розташування (слоту).",
      "Прев'ю показує, як банер виглядатиме на сайті.",
    ],
    rights: [{ permission: PERM.bannersWrite, phrase: "керувати банерами" }],
  },
  {
    prefix: "/carousels",
    title: dict.carousels.navLabel,
    what: [
      "Стрічки товарів на головній: «Хіти продажів», «Новинки», «Акційні», категорія або власний добір.",
      "Карусель — вкладка в секції «Популярне» або окремий рядок товарів нижче.",
    ],
    rights: [
      { permission: PERM.carouselsWrite, phrase: "керувати каруселями" },
    ],
  },
  {
    prefix: "/media",
    title: dict.nav.media,
    what: [
      "Усі зображення магазину в одному місці: фото товарів, логотипи, банери, обкладинки.",
      "Видно, де саме використовується кожне зображення, — тому нічого не зникне з живої сторінки.",
    ],
    rights: [
      { permission: PERM.mediaRead, phrase: "переглядати медіатеку" },
      {
        permission: PERM.mediaWrite,
        phrase: "завантажувати, описувати й видаляти зображення",
      },
    ],
  },
  {
    prefix: "/orders",
    title: dict.nav.orders,
    what: [
      "Нові замовлення — вкладка «Нові», лічильник у меню показує, скільки їх чекає.",
      "Картка замовлення: статус, оплата, ТТН, адреса і внутрішні примітки.",
      "Повернення грошей — у картці «Платіж» або через заявку на повернення.",
    ],
    rights: [
      { permission: PERM.ordersRead, phrase: "переглядати замовлення" },
      { permission: PERM.ordersWrite, phrase: "змінювати статуси та ТТН" },
      { permission: PERM.paymentsRead, phrase: "бачити платежі" },
      { permission: PERM.paymentsRefund, phrase: "повертати гроші" },
      {
        permission: PERM.paymentsCorrect,
        phrase: "виправляти помилкову мітку «Кошти повернено»",
      },
    ],
  },
  {
    prefix: "/returns",
    title: dict.nav.returns,
    what: [
      "Заявки покупців на повернення товару й грошей — головний запис про повернення.",
      "Заявку подає покупець з кабінету на сайті або оператор із картки замовлення.",
      "Прийнята посилка повертає товар на склад; лічильник у меню показує нові заявки.",
    ],
    rights: [
      { permission: PERM.returnsRead, phrase: "переглядати повернення" },
      { permission: PERM.returnsWrite, phrase: "опрацьовувати повернення" },
    ],
  },
  {
    prefix: "/reviews",
    title: dict.nav.reviews,
    what: [
      "Оцінки й тексти відгуків про товари; текст з'являється на сайті лише після схвалення.",
      "Оцінка й текст живуть окремо: можна зняти текст, а оцінку лишити в рейтингу.",
      "Сигнали накрутки допомагають помітити підозрілі відгуки.",
    ],
    rights: [
      { permission: PERM.reviewsModerate, phrase: "модерувати відгуки" },
      {
        permission: PERM.reviewsWrite,
        phrase: "відповідати на відгуки від імені магазину",
      },
    ],
  },
  {
    prefix: "/messages",
    title: dict.nav.messages,
    what: [
      "Звернення з форми контактів на сайті: питання, скарги, запити щодо замовлень.",
      "Лічильник у меню показує нові (непрочитані) звернення.",
    ],
    rights: [
      { permission: PERM.messagesRead, phrase: "читати звернення" },
      {
        permission: PERM.messagesWrite,
        phrase: "змінювати статуси й писати примітки",
      },
    ],
  },
  {
    prefix: "/users",
    title: dict.nav.users,
    what: [
      "Покупці з акаунтом на сайті: пошук, контакти, історія покупок.",
      "Службова нотатка й блокування акаунта.",
      `Ваших працівників тут немає — вони в розділі «${staff}».`,
    ],
    rights: [
      {
        permission: PERM.customersRead,
        phrase: "переглядати список клієнтів і контакти",
      },
      {
        permission: PERM.customersCard,
        phrase: "бачити повну картку клієнта",
      },
      {
        permission: PERM.customersWrite,
        phrase: "блокувати клієнтів і писати нотатки",
      },
    ],
  },
  {
    prefix: "/staff",
    title: staff,
    what: [
      "Службові акаунти: створення, рівні доступу й права кожної людини.",
      "Шаблон прав копіюється на людину — далі її права змінюються окремо.",
      "Керувати можна лише тими, хто нижче за вас рівнем.",
    ],
    rights: [
      {
        permission: PERM.staffRead,
        phrase: "переглядати службові акаунти",
      },
      {
        permission: PERM.staffWrite,
        phrase: "створювати службові акаунти та видавати права",
      },
    ],
  },
  {
    prefix: "/subscribers",
    title: dict.nav.subscribers,
    what: [
      "Email-адреси, які відвідувачі залишили для розсилки (напр. у футері сайту).",
      "Базу можна вивантажити у CSV.",
    ],
    rights: [
      {
        permission: PERM.newsletterRead,
        phrase: "переглядати й вивантажувати підписників",
      },
    ],
  },
  {
    prefix: "/content-map",
    title: dict.nav.contentMap,
    what: [
      "Схема: яка зона сайту редагується в якому розділі панелі.",
      "Тут нічого не редагується — лише переходи до розділів.",
    ],
    rights: [
      { permission: PERM.pagesWrite, phrase: "редагувати сторінки" },
      { permission: PERM.bannersWrite, phrase: "редагувати банери" },
      { permission: PERM.faqWrite, phrase: "редагувати FAQ" },
      { permission: PERM.blogWrite, phrase: "редагувати блог" },
    ],
  },
  {
    prefix: "/settings/contact",
    title: dict.nav.siteContact,
    what: [
      "Телефон, пошта, графік роботи й месенджери магазину.",
      "Показуються у футері сайту та на сторінці контактів; порожня мережа на сайті не з'являється.",
    ],
    rights: [
      {
        permission: PERM.settingsContacts,
        phrase: "змінювати контакти магазину",
      },
    ],
  },
  {
    prefix: "/settings/seo",
    title: dict.nav.seoSettings,
    what: [
      "Назва магазину, логотип і вигляд магазину в Google та соцмережах.",
      "SEO працює автоматично — ці поля лише необов'язкові уточнення.",
      "Блок «SEO-здоров'я» підказує, що варто доповнити.",
    ],
    rights: [
      { permission: PERM.settingsSeo, phrase: "змінювати SEO-налаштування" },
    ],
  },
  {
    prefix: "/settings/search",
    title: dict.nav.searchIndex,
    what: [
      "Перебудова покажчика, через який працює пошук на сайті.",
      "Натискайте, коли покупці не знаходять товар, який точно є, або після великого імпорту.",
      "Це безпечно будь-коли: поки триває перебудова, пошук працює на старих даних.",
    ],
    rights: [
      {
        permission: PERM.settingsSearch,
        phrase: "перебудовувати пошуковий покажчик",
      },
    ],
  },
  {
    prefix: "/faq",
    title: dict.nav.faq,
    what: [
      "Часті запитання й відповіді для покупців і пошукових систем.",
      "Порядок, приховування й видалення запитань.",
    ],
    rights: [{ permission: PERM.faqWrite, phrase: "керувати FAQ" }],
  },
  {
    prefix: "/audit-log",
    title: dict.nav.auditLog,
    what: [
      "Хто, що і коли змінив у панелі — і що було до й після зміни.",
      "Записи не редагуються й не видаляються.",
    ],
    rights: [{ permission: PERM.auditRead, phrase: "читати журнал дій" }],
  },
  {
    prefix: "/profile",
    title: dict.header.profile,
    what: [
      "Ваш акаунт: пошта, рівень і ID.",
      "Права, які вам видано, — тими самими назвами, що й галочки в картці працівника.",
      "Зміна власного пароля.",
    ],
    rights: [],
  },
];

function matches(pathname: string, prefix: string): boolean {
  if (prefix === "/") return pathname === "/";
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

/**
 * The help entry for `pathname`: the longest matching prefix, so
 * `/settings/seo` never resolves to a shorter neighbour. A route with no entry
 * of its own falls back to the dashboard's, which describes the panel as a whole.
 */
export function resolveHelpSection(pathname: string): HelpSection {
  let best: HelpSection | undefined;
  for (const section of HELP_SECTIONS) {
    if (
      matches(pathname, section.prefix) &&
      (!best || section.prefix.length > best.prefix.length)
    ) {
      best = section;
    }
  }
  return best ?? HELP_SECTIONS[0];
}

/** «a», «a й b», «a, b й c». */
export function joinPhrases(phrases: readonly string[]): string {
  if (phrases.length <= 1) return phrases[0] ?? "";
  return `${phrases.slice(0, -1).join(", ")} й ${phrases.at(-1)}`;
}
