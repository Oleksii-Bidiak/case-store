import { SITE_URL, SITE_NAME } from "@/shared/config";

/**
 * llms.txt (https://llmstxt.org/) — a curated, LLM-friendly map of the store so
 * AI assistants (ChatGPT, Claude, Perplexity, Gemini, Google AI Overviews) can
 * understand what the site is and cite the right sections. Served as plain
 * markdown at `/llms.txt`, mirroring the top-level routes; the exhaustive
 * per-product / per-article URL list lives in `sitemap.xml`.
 *
 * Static (no API calls) so it builds without a running backend, matching the
 * `robots.ts` convention. Added under the TASK-194 pre-deploy GEO/SEO pass.
 */
export const dynamic = "force-static";

export function GET(): Response {
  const body = `# ${SITE_NAME}

> Мультибрендовий інтернет-магазин аксесуарів для смартфонів та Apple-техніки в Україні: чохли, захисні скельця, зарядні пристрої, кабелі, навушники, тримачі та інше. Ціни у гривні (₴), доставка Новою Поштою.

## Основні розділи
- [Каталог товарів](${SITE_URL}/products): усі аксесуари з фільтрами за категорією, брендом, сумісністю з пристроєм та характеристиками
- [Категорії](${SITE_URL}/categories): дерево категорій магазину та популярні бренди
- [Блог](${SITE_URL}/blog): гайди, огляди й новини про аксесуари
- [Акції](${SITE_URL}/promo): актуальні знижки та промокоди

## Інформація та підтримка
- [Інформація та підтримка](${SITE_URL}/info): доставка, оплата, гарантія, повернення
- [Правова інформація](${SITE_URL}/legal): публічна оферта та політика конфіденційності
- [Контакти](${SITE_URL}/contact): звʼязок зі службою підтримки

## Карта сайту
- [sitemap.xml](${SITE_URL}/sitemap.xml): повний перелік товарів, статей і сторінок
`;

  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=86400",
    },
  });
}
