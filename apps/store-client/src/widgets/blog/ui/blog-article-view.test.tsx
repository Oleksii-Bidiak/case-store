import { renderWithProviders, screen } from "@/shared/test/render";
import { dict } from "@/shared/config";
import { BlogArticleView } from "./blog-article-view";
import type { BlogPostView } from "../model/posts";

function makePost(overrides: Partial<BlogPostView> = {}): BlogPostView {
  return {
    slug: "iphone16-vs-15",
    categorySlug: "compare",
    categoryName: "Порівняння",
    title: "iPhone 16 проти iPhone 15",
    excerpt: "Розбір камер, продуктивності та автономності.",
    author: "Олег Пилипенко",
    date: "28 черв. 2026",
    publishedAt: "2026-06-28T09:00:00.000Z",
    read: "8 хв",
    hue: 265,
    featured: true,
    coverImageUrl: null,
    content:
      "<p>Вступ.</p><h2>Дизайн і матеріали</h2><p>Текст.</p>" +
      "<h2>Камери</h2><p>Ще текст.</p>",
    ...overrides,
  };
}

const post = makePost();
const related = [
  makePost({
    slug: "gaming-laptop-2026",
    title: "Ігрові ноутбуки 2026",
    featured: false,
    content: "",
  }),
];

describe("BlogArticleView", () => {
  it("renders the article head from the post", () => {
    renderWithProviders(<BlogArticleView post={post} related={related} />);

    expect(
      screen.getByRole("heading", { level: 1, name: post.title }),
    ).toBeInTheDocument();
    expect(screen.getByText(post.excerpt)).toBeInTheDocument();
    // Author shows in the head meta and again in the bio card.
    expect(screen.getAllByText(post.author).length).toBeGreaterThanOrEqual(2);
  });

  it("renders share controls and TOC entries derived from the body headings", () => {
    renderWithProviders(<BlogArticleView post={post} related={related} />);

    expect(
      screen.getByRole("button", { name: dict.blog.article.copyAria }),
    ).toBeInTheDocument();

    for (const label of ["Дизайн і матеріали", "Камери"]) {
      // TOC button + matching in-body section heading.
      expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
      expect(
        screen.getByRole("heading", { level: 2, name: label }),
      ).toBeInTheDocument();
    }
  });

  it("renders related posts, excluding the current article", () => {
    renderWithProviders(<BlogArticleView post={post} related={related} />);

    expect(
      screen.getByText(dict.blog.article.relatedHeading),
    ).toBeInTheDocument();
    expect(screen.getByText("Ігрові ноутбуки 2026")).toBeInTheDocument();
    // The current post is not rendered as one of its own related cards
    // (related cards render their title as an <h3>).
    expect(
      screen.queryByRole("heading", { level: 3, name: post.title }),
    ).not.toBeInTheDocument();
  });
});
