import { SITE_URL, SITE_NAME } from "@/shared/config";
import { fetchSeoSettings } from "@/shared/api/seo-settings-server";

/**
 * llms.txt (https://llmstxt.org/) — a curated, LLM-friendly map of the store so
 * AI assistants (ChatGPT, Claude, Perplexity, Gemini, Google AI Overviews) can
 * understand what the site is and cite the right sections. Served as plain
 * markdown at `/llms.txt`, mirroring the top-level routes; the exhaustive
 * per-product / per-article URL list lives in `sitemap.xml`.
 *
 * The intro blockquote is admin-editable via `SeoSettings.llmsTxtSummary`
 * (TASK-239, plan 116 Decision 5): only that one paragraph is overridable — the
 * curated link map below stays code-owned so a typo can't break real routes. The
 * SeoSettings fetch is tagged (`seo-settings`) and returns null on any error, so
 * the curated default paragraph is used whenever the API is unreachable or the
 * field is blank.
 */
const DEFAULT_INTRO =
  "Мультибрендовий інтернет-магазин аксесуарів для смартфонів та Apple-техніки в Україні: чохли, захисні скельця, зарядні пристрої, кабелі, навушники, тримачі та інше. Ціни у гривні (₴), доставка Новою Поштою.";

export async function GET(): Promise<Response> {
  const seo = await fetchSeoSettings();
  const intro = seo?.llmsTxtSummary?.trim() || DEFAULT_INTRO;

  const body = `# ${SITE_NAME}

> ${intro}

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
