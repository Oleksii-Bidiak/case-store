import { STORE_NAME } from '../../lib/store';

export const categoriesData = [
  { slug: 'reviews', name: 'Огляди', sortOrder: 1 },
  { slug: 'guides', name: 'Гайди', sortOrder: 2 },
  { slug: 'news', name: 'Новини', sortOrder: 3 },
  { slug: 'tips', name: 'Поради', sortOrder: 4 },
  { slug: 'compare', name: 'Порівняння', sortOrder: 5 },
];

/** One body per post, keyed by slug (TASK-554) — see the file for the rules. */
export { postBodiesHtml, readingMinutesFor } from './blog-bodies.data';

/**
 * Demo authors behind the bylines below (TASK-554). The role and bio used to be
 * ONE placeholder in the storefront dictionary, printed under every name. They
 * are demo personas: the bios describe what each one writes about on this blog
 * and claim no credentials, employers or years of experience.
 */
export const authorsData: { name: string; role: string; bio: string }[] = [
  {
    name: 'Олег Пилипенко',
    role: 'Оглядач смартфонів і ноутбуків',
    bio: 'Пише порівняння й огляди флагманів. Намагається відповісти на одне питання: чи потрібен апгрейд саме вам, а не всім.',
  },
  {
    name: 'Ірина Ткач',
    role: 'Авторка гайдів з аудіо та зарядки',
    bio: 'Розбирається в навушниках, павербанках і всьому, що заряджає. Складає чек-листи, з якими зручно обирати без консультанта.',
  },
  {
    name: 'Марія Литвин',
    role: 'Авторка про ноутбуки, ТВ і розумний дім',
    bio: 'Пише про техніку для дому й навчання: як підібрати ноутбук, телевізор чи перші пристрої розумного дому під свої задачі.',
  },
  {
    name: 'Андрій Мороз',
    role: 'Автор практичних порад',
    bio: 'Пише короткі інструкції на кожен день: як наклеїти захисне скло, підготувати телефон до обміну чи зберегти батарею.',
  },
  {
    name: `Редакція ${STORE_NAME}`,
    role: 'Команда магазину',
    bio: 'Новини асортименту, надходження й анонси від команди магазину.',
  },
];

export const postsData: {
  slug: string;
  cat: string;
  title: string;
  excerpt: string;
  author: string;
  publishedAt: string;
  featured?: boolean;
  /** TASK-436 — omitted means listed (the column default). */
  listed?: boolean;
  /**
   * TASK-437 — SEO overrides. Seeded on a few posts only, and deliberately
   * DIFFERENT from the excerpt: the excerpt is the card copy on /blog, the meta
   * description is the sentence a search result shows. Omitted, the storefront
   * derives both from title/excerpt as before.
   */
  metaTitle?: string;
  metaDescription?: string;
  /** Internal content tags — never rendered as a meta keywords tag. */
  keywords?: string[];
}[] = [
  {
    slug: 'iphone16-vs-15',
    cat: 'compare',
    title: 'iPhone 16 проти iPhone 15: чи варто оновлюватись',
    excerpt:
      'Розібрали камери, продуктивність A18 та автономність — кому справді потрібен апгрейд, а кому вистачить попередньої моделі.',
    metaTitle: `iPhone 16 чи iPhone 15: що брати у 2026 році | ${STORE_NAME}`,
    metaDescription:
      'Порівняння iPhone 16 та iPhone 15: камери, чип A18, автономність і ціна. Кому апгрейд вартий грошей, а кому ні.',
    keywords: ['iphone 16', 'iphone 15', 'порівняння', 'апгрейд'],
    author: 'Олег Пилипенко',
    publishedAt: '2026-06-28',
    featured: true,
  },
  {
    slug: 'choose-headphones',
    cat: 'guides',
    title: 'Як обрати бездротові навушники у 2026 році',
    excerpt:
      'ANC, кодеки, час роботи й затримка звуку — простий чек-лист, за яким ви не помилитесь із вибором.',
    metaTitle: `Як обрати бездротові навушники: чек-лист 2026 | ${STORE_NAME}`,
    metaDescription:
      'ANC, кодеки, час роботи та затримка звуку — на що дивитись, обираючи TWS-навушники, і які характеристики можна ігнорувати.',
    keywords: ['навушники', 'tws', 'anc', 'кодеки'],
    author: 'Ірина Ткач',
    publishedAt: '2026-06-25',
  },
  {
    slug: 'powerbank-guide',
    cat: 'guides',
    title: 'Скільки mAh потрібно саме вам: гайд по павербанках',
    excerpt:
      'Рахуємо реальну ємність, розбираємось із швидкою зарядкою та GaN — і не переплачуємо за зайві грами.',
    metaTitle: `Скільки mAh потрібно павербанку: як порахувати | ${STORE_NAME}`,
    metaDescription:
      'Як порахувати реальну ємність павербанка під свій телефон, що дає GaN і швидка зарядка — і за що не варто переплачувати.',
    keywords: ['павербанк', 'powerbank', 'mah', 'gan'],
    author: 'Ірина Ткач',
    publishedAt: '2026-06-22',
  },
  {
    slug: 'galaxy-s26-review',
    cat: 'reviews',
    title: 'Огляд Samsung Galaxy S26 Ultra: два тижні з флагманом',
    excerpt: 'Екран, камери на 200 Мп, S Pen і батарея — що вражає, а до чого доведеться звикати.',
    author: 'Олег Пилипенко',
    publishedAt: '2026-06-20',
    featured: true,
  },
  {
    slug: 'macbook-air-m3',
    cat: 'reviews',
    title: 'MacBook Air M3 для роботи й навчання: чесний досвід',
    excerpt:
      'Чи вистачить 8 ГБ памʼяті, як щодо нагріву без кулера та скільки живе батарея в реальних задачах.',
    author: 'Марія Литвин',
    publishedAt: '2026-06-17',
  },
  {
    slug: 'trade-in-how',
    cat: 'tips',
    title: 'Trade-in: як вигідно обміняти старий смартфон',
    excerpt:
      'Готуємо пристрій до оцінки, дивимось, що впливає на ціну, і не втрачаємо на дрібницях.',
    author: 'Андрій Мороз',
    publishedAt: '2026-06-14',
    // TASK-436 — the one seeded post that demonstrates `listed = false`: it is
    // published and opens at /blog/trade-in-how, but stays out of the blog grid,
    // the header search suggestions and "Читайте також". Without an example in
    // the seed the state is invisible on the demo stand and check SF-CNT-05 has
    // nothing to look at.
    listed: false,
  },
  {
    slug: 'smart-home-start',
    cat: 'guides',
    title: 'Розумний дім з нуля: з чого почати без зайвих витрат',
    excerpt: 'Лампи, розетки, датчики та хаб — базовий набір, який реально економить час і гроші.',
    author: 'Марія Литвин',
    publishedAt: '2026-06-11',
  },
  {
    slug: 'new-arrivals-june',
    cat: 'news',
    title: `Новинки червня: що завезли до ${STORE_NAME} цього місяця`,
    excerpt: 'Свіжі флагмани, аудіо та аксесуари — коротко про найцікавіші релізи та ціни.',
    author: `Редакція ${STORE_NAME}`,
    publishedAt: '2026-06-08',
  },
  {
    slug: 'protect-screen',
    cat: 'tips',
    title: 'Захисне скло чи плівка: що краще для вашого екрана',
    excerpt:
      'Порівнюємо типи захисту, розвіюємо міфи про олеофобне покриття та вчимось клеїти без пузирів.',
    author: 'Андрій Мороз',
    publishedAt: '2026-06-05',
  },
  {
    slug: 'gaming-laptop-2026',
    cat: 'compare',
    title: 'Ігрові ноутбуки 2026: як не переплатити за зайве',
    excerpt:
      'RTX проти інтегрованої графіки, частота екрана й охолодження — на що дивитись перед покупкою.',
    author: 'Олег Пилипенко',
    publishedAt: '2026-06-02',
  },
  {
    slug: 'battery-health',
    cat: 'tips',
    title: '5 звичок, що збережуть батарею смартфона надовго',
    excerpt:
      'Прості правила зарядки й налаштувань, які реально сповільнюють деградацію акумулятора.',
    author: 'Ірина Ткач',
    publishedAt: '2026-05-30',
  },
  {
    slug: 'tv-buying-guide',
    cat: 'guides',
    title: 'OLED, QLED чи Mini-LED: обираємо телевізор під кімнату',
    excerpt:
      'Розбираємось у типах матриць, яскравості та частоті — і підбираємо діагональ під відстань перегляду.',
    author: 'Марія Литвин',
    publishedAt: '2026-05-27',
  },
];
