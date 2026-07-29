import { STORE_NAME } from '../../lib/store';

export const categoriesData = [
  { slug: 'reviews', name: 'Огляди', sortOrder: 1 },
  { slug: 'guides', name: 'Гайди', sortOrder: 2 },
  { slug: 'news', name: 'Новини', sortOrder: 3 },
  { slug: 'tips', name: 'Поради', sortOrder: 4 },
  { slug: 'compare', name: 'Порівняння', sortOrder: 5 },
];

// Shared demo article body — moved server-side from the storefront mockup.
// Only allow-listed tags (sanitized below). h2 headings drive the storefront
// table of contents (ids are derived client-side from the heading text).
export const demoBodyHtml = `
    <p>Кожної осені виробники ставлять власників попередньої моделі перед тим
    самим питанням: оновлюватись чи ні. Розкладемо все по поличках — без
    маркетингу й зайвого шуму.</p>
    <h2>Дизайн і матеріали</h2>
    <p>Зовні пристрій майже не змінився: та сама рамка, ті самі габарити.
    Головна зовнішня новинка — оновлене керування та матовіше скло ззаду.</p>
    <ul>
      <li>Нова тактильна кнопка з підтримкою жестів</li>
      <li>Оновлена система охолодження — менше тротлінгу в іграх</li>
      <li>Ті самі кольори корпусу, але приємніший на дотик матеріал</li>
    </ul>
    <h2>Камери</h2>
    <p>Основний сенсор підріс, але найбільша різниця — в обробці. Нічний режим
    витягує більше деталей у тінях, а портрети тепер можна перефокусовувати вже
    після зйомки.</p>
    <blockquote>«Якщо камера — головна причина покупки, апгрейд відчутний.
    У решті сценаріїв різниця косметична.»</blockquote>
    <h2>Продуктивність і батарея</h2>
    <p>Чип швидший, але в щоденних задачах ви цього не помітите. Різниця
    розкривається в іграх та важкому монтажі. Автономність підросла приблизно на
    годину активного екрана.</p>
    <h2>Підсумок</h2>
    <p>Це впевнене, але еволюційне оновлення. Якщо ваш поточний пристрій працює
    добре, поспішати нема куди. Якщо ж ви на старшій моделі або багато
    фотографуєте — новинка того варта.</p>
  `;

export const postsData: {
  slug: string;
  cat: string;
  title: string;
  excerpt: string;
  author: string;
  readingMinutes: number;
  publishedAt: string;
  featured?: boolean;
}[] = [
  {
    slug: 'iphone16-vs-15',
    cat: 'compare',
    title: 'iPhone 16 проти iPhone 15: чи варто оновлюватись',
    excerpt:
      'Розібрали камери, продуктивність A18 та автономність — кому справді потрібен апгрейд, а кому вистачить попередньої моделі.',
    author: 'Олег Пилипенко',
    readingMinutes: 8,
    publishedAt: '2026-06-28',
    featured: true,
  },
  {
    slug: 'choose-headphones',
    cat: 'guides',
    title: 'Як обрати бездротові навушники у 2026 році',
    excerpt:
      'ANC, кодеки, час роботи й затримка звуку — простий чек-лист, за яким ви не помилитесь із вибором.',
    author: 'Ірина Ткач',
    readingMinutes: 6,
    publishedAt: '2026-06-25',
  },
  {
    slug: 'powerbank-guide',
    cat: 'guides',
    title: 'Скільки mAh потрібно саме вам: гайд по павербанках',
    excerpt:
      'Рахуємо реальну ємність, розбираємось із швидкою зарядкою та GaN — і не переплачуємо за зайві грами.',
    author: 'Ірина Ткач',
    readingMinutes: 5,
    publishedAt: '2026-06-22',
  },
  {
    slug: 'galaxy-s26-review',
    cat: 'reviews',
    title: 'Огляд Samsung Galaxy S26 Ultra: два тижні з флагманом',
    excerpt: 'Екран, камери на 200 Мп, S Pen і батарея — що вражає, а до чого доведеться звикати.',
    author: 'Олег Пилипенко',
    readingMinutes: 11,
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
    readingMinutes: 9,
    publishedAt: '2026-06-17',
  },
  {
    slug: 'trade-in-how',
    cat: 'tips',
    title: 'Trade-in: як вигідно обміняти старий смартфон',
    excerpt:
      'Готуємо пристрій до оцінки, дивимось, що впливає на ціну, і не втрачаємо на дрібницях.',
    author: 'Андрій Мороз',
    readingMinutes: 4,
    publishedAt: '2026-06-14',
  },
  {
    slug: 'smart-home-start',
    cat: 'guides',
    title: 'Розумний дім з нуля: з чого почати без зайвих витрат',
    excerpt: 'Лампи, розетки, датчики та хаб — базовий набір, який реально економить час і гроші.',
    author: 'Марія Литвин',
    readingMinutes: 7,
    publishedAt: '2026-06-11',
  },
  {
    slug: 'new-arrivals-june',
    cat: 'news',
    title: `Новинки червня: що завезли до ${STORE_NAME} цього місяця`,
    excerpt: 'Свіжі флагмани, аудіо та аксесуари — коротко про найцікавіші релізи та ціни.',
    author: `Редакція ${STORE_NAME}`,
    readingMinutes: 3,
    publishedAt: '2026-06-08',
  },
  {
    slug: 'protect-screen',
    cat: 'tips',
    title: 'Захисне скло чи плівка: що краще для вашого екрана',
    excerpt:
      'Порівнюємо типи захисту, розвіюємо міфи про олеофобне покриття та вчимось клеїти без пузирів.',
    author: 'Андрій Мороз',
    readingMinutes: 5,
    publishedAt: '2026-06-05',
  },
  {
    slug: 'gaming-laptop-2026',
    cat: 'compare',
    title: 'Ігрові ноутбуки 2026: як не переплатити за зайве',
    excerpt:
      'RTX проти інтегрованої графіки, частота екрана й охолодження — на що дивитись перед покупкою.',
    author: 'Олег Пилипенко',
    readingMinutes: 10,
    publishedAt: '2026-06-02',
  },
  {
    slug: 'battery-health',
    cat: 'tips',
    title: '5 звичок, що збережуть батарею смартфона надовго',
    excerpt:
      'Прості правила зарядки й налаштувань, які реально сповільнюють деградацію акумулятора.',
    author: 'Ірина Ткач',
    readingMinutes: 4,
    publishedAt: '2026-05-30',
  },
  {
    slug: 'tv-buying-guide',
    cat: 'guides',
    title: 'OLED, QLED чи Mini-LED: обираємо телевізор під кімнату',
    excerpt:
      'Розбираємось у типах матриць, яскравості та частоті — і підбираємо діагональ під відстань перегляду.',
    author: 'Марія Литвин',
    readingMinutes: 8,
    publishedAt: '2026-05-27',
  },
];
