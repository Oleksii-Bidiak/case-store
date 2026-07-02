import { renderWithProviders, screen } from "@/shared/test/render";
import { dict } from "@/shared/config";
import { BLOG_ARTICLE_SECTIONS, getBlogPost } from "../model/posts";
import { BlogArticleView } from "./blog-article-view";

const post = getBlogPost("iphone16-vs-15")!;

describe("BlogArticleView", () => {
  it("renders the article head from the post", () => {
    renderWithProviders(<BlogArticleView post={post} />);

    expect(
      screen.getByRole("heading", { level: 1, name: post.title }),
    ).toBeInTheDocument();
    expect(screen.getByText(post.excerpt)).toBeInTheDocument();
    // Author shows in the head meta and again in the bio card.
    expect(screen.getAllByText(post.author).length).toBeGreaterThanOrEqual(2);
  });

  it("renders share controls and TOC entries matching the body headings", () => {
    renderWithProviders(<BlogArticleView post={post} />);

    expect(
      screen.getByRole("button", { name: dict.blog.article.copyAria }),
    ).toBeInTheDocument();

    for (const section of BLOG_ARTICLE_SECTIONS) {
      // TOC button + matching in-body section heading.
      expect(
        screen.getByRole("button", { name: section.label }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("heading", { level: 2, name: section.label }),
      ).toBeInTheDocument();
    }
  });

  it("renders related posts, excluding the current article", () => {
    renderWithProviders(<BlogArticleView post={post} />);

    expect(
      screen.getByText(dict.blog.article.relatedHeading),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Ігрові ноутбуки 2026: як не переплатити за зайве"),
    ).toBeInTheDocument();
    // The current post is not linked as one of its own related cards
    // (related cards render their title as an <h3>).
    expect(
      screen.queryByRole("heading", { level: 3, name: post.title }),
    ).not.toBeInTheDocument();
  });
});
