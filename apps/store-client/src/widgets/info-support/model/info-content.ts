// Content for the "Інформація та підтримка" hub (/info, Info.dc.html).
//
// Every block of /info is admin-managed now. Contacts come from
// SiteContactSettings (TASK-154), FAQ from the FAQ list (TASK-187), "Про нас"
// from the `about` page of kind INFO (TASK-435), and — since TASK-560 — the
// delivery, payment and warranty cards and the «у цифрах / чому ми» part of
// "Про нас" from their own INFO pages (slugs in `shared/config/hub-pages.ts`,
// `INFO_HUB_SECTION_SLUGS`). The add-on services list is the store's real
// active add-ons with their catalog prices (TASK-561).
//
// The constants below are ONLY the outage fallback: they render when the API
// does not answer, because this page carries delivery, warranty and contact
// information and must render regardless. A page that is genuinely MISSING
// (unpublished or deleted by the owner) hides its block instead — falling back
// to these strings there would put text the owner removed back on the site.
// There is deliberately no fallback for the services list: the old one
// advertised prices nobody had entered anywhere.

export type InfoSectionKey =
  "delivery" | "warranty" | "faq" | "about" | "contacts";

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

/**
 * The "Про нас" section, loaded from the CMS (TASK-435): the `about` page of
 * kind INFO. `html` is already sanitized by the server component that reads it —
 * `InfoView` is a client component and must not pull a sanitizer into the
 * bundle. Null everywhere means "no such page / API down", and the section falls
 * back to `dict.info.aboutHeading` + `aboutIntro` (the route reports a missing
 * page to Sentry, TASK-565).
 */
export interface InfoAbout {
  heading: string;
  /** Short lede under the heading (the page's excerpt), or null. */
  intro: string | null;
  /** Sanitized page body. */
  html: string;
  /** Link to the full page at `/info/<slug>`. */
  href: string;
}

/**
 * One /info block read from its INFO page (TASK-560): the page title heads the
 * card, the excerpt is its lede, the body replaces the card grid. `html` is
 * sanitized by the server component that read it, exactly like
 * {@link InfoAbout}.
 */
export interface InfoSectionPage {
  heading: string;
  intro: string | null;
  html: string;
}

/**
 * What the route knows about one block's page:
 *   - the page itself → render it;
 *   - `"missing"`     → the API answered 404 (unpublished / deleted): hide the block;
 *   - `"unavailable"` → the API did not answer: render the static fallback below.
 */
export type InfoSectionSource = InfoSectionPage | "missing" | "unavailable";

/** An add-on service the store offers, as the /info services card lists it (TASK-561). */
export interface InfoService {
  id: string;
  name: string;
  description: string | null;
  /** Catalog price, two-decimal string ("499.00"); a product may override it. */
  price: string;
}

/** A published INFO page that /info does not inline — listed as a link (TASK-560). */
export interface InfoPageLink {
  title: string;
  href: string;
}

// TASK-311 — NO FABRICATED FACTS in this file. A claim about the company that
// the code cannot know (cities served, pickup points, service centres, years on
// the market, customer counts, ratings, a support schedule) is NOT written here
// at all — never as a plausible invention, and since TASK-873 not as a visible
// `[bracketed placeholder]` either: those reached shoppers verbatim whenever the
// API was down. The owner states such facts in the CMS pages /info reads; this
// fallback says only what holds for every deployment.

export const DELIVERY_OPTIONS: readonly InfoOptionCard[] = [
  {
    icon: "np",
    title: "Нова Пошта",
    desc: "Відділення або поштомат по всій Україні",
    price: "за тарифом НП",
  },
];

export const PAYMENT_OPTIONS: readonly InfoOptionCard[] = [
  {
    icon: "wallet",
    title: "При отриманні",
    desc: "Готівкою або карткою у відділенні Нової Пошти",
  },
  {
    icon: "card",
    title: "Картка онлайн",
    desc: "Оплата карткою на сайті під час оформлення замовлення",
  },
  {
    icon: "shield",
    title: "Безпечна оплата",
    desc: "Дані картки не зберігаються на сайті",
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
    big: "100%",
    title: "оригінальна техніка",
    desc: "Кожен пристрій перевіряємо перед відправкою",
  },
];

/**
 * «Про нас у цифрах» — empty in the fallback: every figure (years, products,
 * customers, rating) is a company fact the owner writes in the
 * `info-about-stats` page. The view renders no stat row for an empty list.
 */
export const ABOUT_STATS: readonly InfoStat[] = [];

export const ABOUT_VALUES: readonly InfoValue[] = [
  {
    title: "Тільки оригінал",
    desc: "Офіційні постачальники, жодних сірих пристроїв",
  },
  { title: "Чесні ціни", desc: "Без прихованих доплат і накруток" },
  { title: "Швидка доставка", desc: "Відправка день у день по всій Україні" },
  {
    title: "Підтримка",
    desc: "Допоможемо з вибором та після покупки",
  },
];

export const INFO_FAQS: readonly InfoFaq[] = [
  {
    q: "Скільки коштує доставка?",
    a: "Доставка Новою Поштою — за тарифами перевізника, безкоштовно при замовленні від 1 000 ₴.",
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
    q: "Які способи оплати доступні?",
    a: "Оплата при отриманні — готівкою або карткою у відділенні Нової Пошти. Оплата карткою онлайн — на сайті під час оформлення замовлення.",
  },
];
