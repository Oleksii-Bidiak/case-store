// Static blog content for the storefront /blog page.
//
// There is no Blog backend module yet (tracked in BACKLOG — TASK-170): posts,
// categories, search and pagination are all resolved client-side from this seed
// array, which mirrors the Claude Design "Blog" mockup 1:1. When the backend
// Blog module ships, this file is replaced by Orval-generated hooks — the UI in
// `widgets/blog/ui` stays as-is. The mockup's placeholder brand ("volta") is
// localized to the storefront brand (MobileStore), consistent with prior imports.

/** Real post categories (the synthetic "all" bucket is not a post category). */
export type BlogCategoryKey =
  | "reviews"
  | "guides"
  | "news"
  | "tips"
  | "compare";

/** Category filter keys used by the chip row — "all" first. */
export type BlogFilterKey = "all" | BlogCategoryKey;

export interface BlogPost {
  slug: string;
  cat: BlogCategoryKey;
  title: string;
  excerpt: string;
  author: string;
  date: string;
  read: string;
  /** OKLCH hue driving the card's token-derived placeholder gradient. */
  hue: number;
  /** Marks the "хіт тижня" hero card (shown only in the unfiltered view). */
  featured?: boolean;
}

/** Ordered filter keys — drives the chip row. */
export const BLOG_FILTER_KEYS: readonly BlogFilterKey[] = [
  "all",
  "reviews",
  "guides",
  "news",
  "tips",
  "compare",
] as const;

export const BLOG_POSTS: readonly BlogPost[] = [
  {
    slug: "iphone16-vs-15",
    cat: "compare",
    title: "iPhone 16 проти iPhone 15: чи варто оновлюватись",
    excerpt:
      "Розібрали камери, продуктивність A18 та автономність — кому справді потрібен апгрейд, а кому вистачить попередньої моделі.",
    author: "Олег Пилипенко",
    date: "28 черв. 2026",
    read: "8 хв",
    hue: 265,
    featured: true,
  },
  {
    slug: "choose-headphones",
    cat: "guides",
    title: "Як обрати бездротові навушники у 2026 році",
    excerpt:
      "ANC, кодеки, час роботи й затримка звуку — простий чек-лист, за яким ви не помилитесь із вибором.",
    author: "Ірина Ткач",
    date: "25 черв. 2026",
    read: "6 хв",
    hue: 200,
  },
  {
    slug: "powerbank-guide",
    cat: "guides",
    title: "Скільки mAh потрібно саме вам: гайд по павербанках",
    excerpt:
      "Рахуємо реальну ємність, розбираємось із швидкою зарядкою та GaN — і не переплачуємо за зайві грами.",
    author: "Ірина Ткач",
    date: "22 черв. 2026",
    read: "5 хв",
    hue: 150,
  },
  {
    slug: "galaxy-s26-review",
    cat: "reviews",
    title: "Огляд Samsung Galaxy S26 Ultra: два тижні з флагманом",
    excerpt:
      "Екран, камери на 200 Мп, S Pen і батарея — що вражає, а до чого доведеться звикати.",
    author: "Олег Пилипенко",
    date: "20 черв. 2026",
    read: "11 хв",
    hue: 285,
  },
  {
    slug: "macbook-air-m3",
    cat: "reviews",
    title: "MacBook Air M3 для роботи й навчання: чесний досвід",
    excerpt:
      "Чи вистачить 8 ГБ памʼяті, як щодо нагріву без кулера та скільки живе батарея в реальних задачах.",
    author: "Марія Литвин",
    date: "17 черв. 2026",
    read: "9 хв",
    hue: 235,
  },
  {
    slug: "trade-in-how",
    cat: "tips",
    title: "Trade-in: як вигідно обміняти старий смартфон",
    excerpt:
      "Готуємо пристрій до оцінки, дивимось, що впливає на ціну, і не втрачаємо на дрібницях.",
    author: "Андрій Мороз",
    date: "14 черв. 2026",
    read: "4 хв",
    hue: 155,
  },
  {
    slug: "smart-home-start",
    cat: "guides",
    title: "Розумний дім з нуля: з чого почати без зайвих витрат",
    excerpt:
      "Лампи, розетки, датчики та хаб — базовий набір, який реально економить час і гроші.",
    author: "Марія Литвин",
    date: "11 черв. 2026",
    read: "7 хв",
    hue: 320,
  },
  {
    slug: "new-arrivals-june",
    cat: "news",
    title: "Новинки червня: що завезли до MobileStore цього місяця",
    excerpt:
      "Свіжі флагмани, аудіо та аксесуари — коротко про найцікавіші релізи та ціни.",
    author: "Редакція MobileStore",
    date: "8 черв. 2026",
    read: "3 хв",
    hue: 25,
  },
  {
    slug: "protect-screen",
    cat: "tips",
    title: "Захисне скло чи плівка: що краще для вашого екрана",
    excerpt:
      "Порівнюємо типи захисту, розвіюємо міфи про олеофобне покриття та вчимось клеїти без пузирів.",
    author: "Андрій Мороз",
    date: "5 черв. 2026",
    read: "5 хв",
    hue: 120,
  },
  {
    slug: "gaming-laptop-2026",
    cat: "compare",
    title: "Ігрові ноутбуки 2026: як не переплатити за зайве",
    excerpt:
      "RTX проти інтегрованої графіки, частота екрана й охолодження — на що дивитись перед покупкою.",
    author: "Олег Пилипенко",
    date: "2 черв. 2026",
    read: "10 хв",
    hue: 300,
  },
  {
    slug: "battery-health",
    cat: "tips",
    title: "5 звичок, що збережуть батарею смартфона надовго",
    excerpt:
      "Прості правила зарядки й налаштувань, які реально сповільнюють деградацію акумулятора.",
    author: "Ірина Ткач",
    date: "30 трав. 2026",
    read: "4 хв",
    hue: 175,
  },
  {
    slug: "tv-buying-guide",
    cat: "guides",
    title: "OLED, QLED чи Mini-LED: обираємо телевізор під кімнату",
    excerpt:
      "Розбираємось у типах матриць, яскравості та частоті — і підбираємо діагональ під відстань перегляду.",
    author: "Марія Литвин",
    date: "27 трав. 2026",
    read: "8 хв",
    hue: 210,
  },
] as const;

/** Token-driven placeholder cover gradient for a post (mirrors the mockup). */
export function blogGradient(hue: number): string {
  return `linear-gradient(135deg, oklch(0.74 0.12 ${hue}), oklch(0.5 0.17 ${hue}))`;
}

/** First letter of the author name, uppercased, for the avatar chip. */
export function authorInitial(author: string): string {
  return (author.trim()[0] || "?").toUpperCase();
}

/** Post count per filter key (all + each category), computed once. */
export function blogCategoryCounts(): Record<BlogFilterKey, number> {
  const counts: Record<BlogFilterKey, number> = {
    all: BLOG_POSTS.length,
    reviews: 0,
    guides: 0,
    news: 0,
    tips: 0,
    compare: 0,
  };
  for (const post of BLOG_POSTS) counts[post.cat] += 1;
  return counts;
}
