// Static content for the "Інформація та підтримка" hub (/info, Info.dc.html).
// This is curated marketing/support copy with no backend — a stub, mirroring the
// mockup 1:1 (brand "volta" localized to MobileStore). Only the Contacts section
// pulls real data (SiteContactSettings, TASK-154). When an admin-managed
// info/CMS surface exists this content moves there (see BACKLOG).

export type InfoSectionKey =
  | "delivery"
  | "warranty"
  | "faq"
  | "about"
  | "contacts";

export const INFO_SECTIONS: readonly InfoSectionKey[] = [
  "delivery",
  "warranty",
  "faq",
  "about",
  "contacts",
] as const;

export type InfoIconKey =
  | "np"
  | "courier"
  | "pickup"
  | "card"
  | "wallet"
  | "gift"
  | "shield"
  | "screen"
  | "warranty";

export interface InfoOptionCard {
  icon: InfoIconKey;
  title: string;
  desc: string;
  price?: string;
}
export interface InfoServiceRow {
  icon: InfoIconKey;
  title: string;
  desc: string;
  price: string;
}
export interface InfoWarrantyCard {
  big: string;
  title: string;
  desc: string;
}
export interface InfoStat {
  num: string;
  label: string;
}
export interface InfoValue {
  title: string;
  desc: string;
}
export interface InfoFaq {
  q: string;
  a: string;
}

export const DELIVERY_OPTIONS: readonly InfoOptionCard[] = [
  {
    icon: "np",
    title: "Нова Пошта",
    desc: "Відділення або поштомат по всій Україні",
    price: "за тарифом НП",
  },
  {
    icon: "courier",
    title: "Курʼєр по місту",
    desc: "Київ, Львів, Одеса — доставка в день замовлення",
    price: "90 ₴",
  },
  {
    icon: "pickup",
    title: "Самовивіз",
    desc: "Із магазину MobileStore — готове за 1 годину",
    price: "безкоштовно",
  },
];

export const PAYMENT_OPTIONS: readonly InfoOptionCard[] = [
  {
    icon: "card",
    title: "Картка онлайн",
    desc: "Visa / Mastercard, Apple Pay, Google Pay",
  },
  {
    icon: "wallet",
    title: "При отриманні",
    desc: "Готівкою або карткою курʼєру / у відділенні",
  },
  {
    icon: "gift",
    title: "Оплата бонусами",
    desc: "До 30% суми замовлення накопиченими бонусами",
  },
  {
    icon: "shield",
    title: "Безпечна оплата",
    desc: "Захищені платежі, дані карти не зберігаються",
  },
];

export const WARRANTY_CARDS: readonly InfoWarrantyCard[] = [
  {
    big: "12–24",
    title: "місяці гарантії",
    desc: "Офіційна гарантія виробника на всю техніку",
  },
  {
    big: "14",
    title: "днів на повернення",
    desc: "Повернення товару належної якості без пояснень",
  },
  {
    big: "1",
    title: "сервісний центр",
    desc: "Власний сервіс у Києві + мережа партнерів",
  },
];

export const PROTECTION_SERVICES: readonly InfoServiceRow[] = [
  {
    icon: "screen",
    title: "Screen Repair",
    desc: "Ремонт екрана без черг — 12 або 24 місяці",
    price: "від 990 ₴",
  },
  {
    icon: "shield",
    title: "Save Plus",
    desc: "Захист від механічних пошкоджень і залиття",
    price: "від 1 290 ₴",
  },
  {
    icon: "warranty",
    title: "+1 / +2 роки гарантії",
    desc: "Продовження офіційної гарантії виробника",
    price: "від 750 ₴",
  },
];

export const ABOUT_STATS: readonly InfoStat[] = [
  { num: "8", label: "років на ринку" },
  { num: "50K+", label: "товарів" },
  { num: "320K", label: "клієнтів" },
  { num: "4.9", label: "рейтинг" },
];

export const ABOUT_VALUES: readonly InfoValue[] = [
  {
    title: "Тільки оригінал",
    desc: "Офіційні постачальники, жодних сірих пристроїв",
  },
  { title: "Чесні ціни", desc: "Без прихованих доплат і накруток" },
  { title: "Швидка доставка", desc: "Відправка день у день по всій Україні" },
  { title: "Підтримка 7 днів", desc: "Допоможемо з вибором та після покупки" },
];

export const INFO_FAQS: readonly InfoFaq[] = [
  {
    q: "Скільки коштує доставка?",
    a: "Доставка Новою Поштою — за тарифами перевізника, безкоштовно при замовленні від 1 000 ₴. Курʼєр по місту — 90 ₴, самовивіз із магазину — безкоштовно.",
  },
  {
    q: "Як швидко відправляєте замовлення?",
    a: "Товари в наявності відправляємо день у день, якщо замовлення оформлене до 18:00. В інших випадках — наступного робочого дня.",
  },
  {
    q: "Чи можна повернути товар?",
    a: "Так, протягом 14 днів ви можете повернути товар належної якості в повній комплектації. Гроші повертаємо протягом 3–7 банківських днів.",
  },
  {
    q: "Яка гарантія на техніку?",
    a: "Уся техніка має офіційну гарантію виробника від 12 до 24 місяців. Гарантійний талон додається до замовлення.",
  },
  {
    q: "Чи перевіряєте товар перед відправкою?",
    a: "Так, кожен пристрій проходить передпродажну перевірку комплектації та зовнішнього стану.",
  },
  {
    q: "Як скористатися бонусами?",
    a: "Бонуси нараховуються за кожну покупку та зберігаються в кабінеті. Ними можна оплатити до 30% суми наступного замовлення.",
  },
];
