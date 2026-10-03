import { fireEvent, renderWithProviders, screen } from "@/shared/test/render";
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
    authorRole: "Оглядач смартфонів і ноутбуків",
    authorBio: "Пише порівняння й огляди флагманів.",
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

  it("renders the author's own role and bio from the API (TASK-554)", () => {
    renderWithProviders(<BlogArticleView post={post} related={related} />);

    expect(
      screen.getByText("Оглядач смартфонів і ноутбуків"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Пише порівняння й огляди флагманів."),
    ).toBeInTheDocument();
  });

  it("shows only the name when the author has no role or bio — no invented placeholder", () => {
    const bare = makePost({ authorRole: null, authorBio: null });
    const { container } = renderWithProviders(
      <BlogArticleView post={bare} related={related} />,
    );

    expect(screen.getAllByText(bare.author).length).toBeGreaterThanOrEqual(2);
    expect(container.textContent).not.toContain("Оглядач мобільної техніки");
    expect(container.textContent).not.toContain("Оглядач смартфонів");
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

  it("sizes the cover by aspect ratio, not a fixed 380px (TASK-878)", () => {
    const { container } = renderWithProviders(
      <BlogArticleView
        post={makePost({ coverImageUrl: "https://example.com/cover.jpg" })}
        related={[]}
      />,
    );

    const frame = container.querySelector(
      'img[src="https://example.com/cover.jpg"]',
    )?.parentElement as HTMLElement;
    expect(frame).toHaveClass("aspect-4/3", "sm:aspect-video", "lg:aspect-5/2");
    expect(frame.className).not.toMatch(/\bh-\[/);
  });

  it("drops a cover that fails to load, leaving the gradient (TASK-759)", () => {
    const { container } = renderWithProviders(
      <BlogArticleView
        post={makePost({
          coverImageUrl: "https://blocked.example.com/cover.jpg",
        })}
        related={[]}
      />,
    );

    const cover = container.querySelector(
      'img[src="https://blocked.example.com/cover.jpg"]',
    );
    expect(cover).not.toBeNull();

    fireEvent.error(cover!);

    expect(
      container.querySelector(
        'img[src="https://blocked.example.com/cover.jpg"]',
      ),
    ).toBeNull();
    // TASK-873 — no «[ обкладинка статті ]» caption, with or without a photo.
    expect(container.textContent).not.toContain("обкладинка статті");
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
