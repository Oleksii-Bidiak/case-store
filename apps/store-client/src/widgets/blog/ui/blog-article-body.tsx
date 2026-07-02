import Link from "next/link";
import { dict } from "@/shared/config";
import {
  authorInitial,
  blogGradient,
  BLOG_ARTICLE_SECTIONS,
  BLOG_ARTICLE_TAGS,
  type BlogPost,
} from "../model/posts";
import { BlogCheckIcon } from "./blog-icons";

// Shared demo article body mirroring the Claude Design "Article.dc.html" mockup.
// Static placeholder content shown for every post until the Blog backend
// (TASK-170) supplies real per-post bodies; only the author name in the bio is
// driven by the seed post. Section `<h2 id>`s come from BLOG_ARTICLE_SECTIONS
// so the TOC stays in sync.
const H2 =
  "mt-[38px] mb-3.5 scroll-mt-[90px] font-display text-2xl font-bold tracking-[-0.01em] text-foreground";
const P = "mb-[18px] text-[17px] leading-[1.75] text-foreground";

export function BlogArticleBody({ post }: { post: BlogPost }) {
  const [design, camera, performance, verdict] = BLOG_ARTICLE_SECTIONS;

  return (
    <article className="mx-auto min-w-0 max-w-[760px]">
      <p className="mb-[22px] text-[17px] leading-[1.75] text-foreground">
        Кожної осені Apple ставить власників попередньої моделі перед тим самим
        питанням: оновлюватись чи ні. Цього року різниця між <b>iPhone 16</b> та{" "}
        <b>iPhone 15</b> не така очевидна, як здається з презентації. Розкладемо
        все по поличках.
      </p>

      <h2 id={design.id} className={H2}>
        {design.label}
      </h2>
      <p className={P}>
        Зовні моделі майже близнюки: та сама алюмінієва рамка, ті самі габарити.
        Головна зовнішня новинка iPhone 16 — окрема кнопка керування камерою
        збоку. Дрібниця, але для тих, хто багато знімає, вона економить секунди.
      </p>
      <ul className="mb-[22px] list-disc pl-[22px] text-[17px] leading-[1.7] text-foreground">
        <li className="mb-2">
          Нова тактильна кнопка камери з підтримкою свайпів
        </li>
        <li className="mb-2">
          Оновлена система охолодження — менше тротлінгу в іграх
        </li>
        <li className="mb-2">
          Ті самі кольори корпусу, але з матовішим склом ззаду
        </li>
      </ul>

      <h2 id={camera.id} className={H2}>
        {camera.label}
      </h2>
      <p className={P}>
        Основний сенсор підріс, але найбільша різниця — в обробці. Нічний режим
        на iPhone 16 витягує більше деталей у тінях, а портрети тепер можна
        перефокусовувати вже після зйомки.
      </p>
      <blockquote
        className="mb-[22px] rounded-r-xl border-l-4 border-primary py-4 pr-[22px] pl-[22px] text-[17px] leading-[1.65] text-foreground italic"
        style={{
          background:
            "color-mix(in oklab, var(--color-primary) 6%, var(--color-card))",
        }}
      >
        «Якщо камера — головна причина покупки, апгрейд відчутний. У решті
        сценаріїв різниця косметична.»
      </blockquote>

      <div
        className="relative mb-3 h-[280px] overflow-hidden rounded-2xl"
        style={{ background: blogGradient(200) }}
      >
        <span className="absolute right-4 bottom-3.5 font-mono text-xs text-white/70">
          [ приклад фото з камери ]
        </span>
      </div>
      <p className="mb-[26px] text-center text-[13px] text-muted-foreground">
        Порівняння нічної зйомки: iPhone 15 (ліворуч) та iPhone 16 (праворуч)
      </p>

      <h2 id={performance.id} className={H2}>
        {performance.label}
      </h2>
      <p className={P}>
        Чип A18 швидший, але в щоденних задачах — стрічки, месенджери, відео —
        ви цього не помітите. Різниця розкривається в іграх та важкому монтажі.
        Автономність підросла приблизно на годину активного екрана.
      </p>

      <div
        className="mb-[26px] flex items-start gap-3.5 rounded-2xl border p-5"
        style={{
          background:
            "color-mix(in oklab, var(--color-success) 8%, var(--color-card))",
          borderColor:
            "color-mix(in oklab, var(--color-success) 22%, var(--color-border))",
        }}
      >
        <span className="inline-flex size-[34px] shrink-0 items-center justify-center rounded-[10px] bg-success text-success-foreground">
          <BlogCheckIcon width={19} height={19} />
        </span>
        <div>
          <b className="mb-1.5 block font-display text-[15px] text-foreground">
            Коротко: кому варто оновлюватись
          </b>
          <span className="text-[14.5px] leading-[1.6] text-muted-foreground">
            Власникам iPhone 13 і старіших — так, стрибок відчутний. З iPhone 15
            — лише якщо важлива камера чи ігри. Решті раціональніше зачекати.
          </span>
        </div>
      </div>

      <h2 id={verdict.id} className={H2}>
        {verdict.label}
      </h2>
      <p className="mb-6 text-[17px] leading-[1.75] text-foreground">
        iPhone 16 — впевнене, але еволюційне оновлення. Якщо ваш iPhone 15
        працює добре, поспішати нема куди. Якщо ж ви на старшій моделі або
        багато фотографуєте — новинка того варта.
      </p>

      {/* Tags */}
      <div className="flex flex-wrap gap-[9px] border-t border-border pt-[22px]">
        {BLOG_ARTICLE_TAGS.map((tag) => (
          <Link
            key={tag}
            href="/blog"
            className="inline-flex h-[34px] items-center rounded-full bg-muted px-3.5 text-[13px] font-semibold text-foreground no-underline transition-colors hover:bg-[color-mix(in_oklab,var(--color-primary)_14%,var(--color-muted))]"
          >
            #{tag}
          </Link>
        ))}
      </div>

      {/* Author bio */}
      <div className="mt-7 flex items-start gap-4 rounded-2xl border border-border bg-card p-[22px] shadow-[var(--shadow-card)]">
        <span className="inline-flex size-14 shrink-0 items-center justify-center rounded-full bg-primary font-display text-xl font-bold text-primary-foreground">
          {authorInitial(post.author)}
        </span>
        <div>
          <b className="block font-display text-base text-foreground">
            {post.author}
          </b>
          <span className="my-0.5 mb-2 block text-[13px] font-semibold text-primary">
            {dict.blog.article.authorRolePlaceholder}
          </span>
          <p className="text-sm leading-[1.6] text-muted-foreground">
            {dict.blog.article.authorBioPlaceholder}
          </p>
        </div>
      </div>
    </article>
  );
}
