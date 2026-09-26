import type { BlogPostEntity } from "@/shared/api";
import { toBlogPostView } from "./posts";

function makeEntity(overrides: Partial<BlogPostEntity> = {}): BlogPostEntity {
  return {
    id: "post-1",
    slug: "powerbank-guide",
    title: "Гайд по павербанках",
    excerpt: "Коротко.",
    content: "<p>Текст</p>",
    coverImageUrl: null,
    coverBlurDataUrl: null,
    authorName: "Ірина Ткач",
    author: {
      id: "author-1",
      name: "Ірина Ткач",
      role: "Авторка гайдів з аудіо та зарядки",
      bio: "Складає чек-листи.",
    },
    readingMinutes: 2,
    featured: false,
    listed: true,
    category: { id: "cat-1", slug: "guides", name: "Гайди" },
    status: "PUBLISHED",
    publishedAt: "2026-06-22T09:00:00.000Z",
    scheduledAt: null,
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-22T09:00:00.000Z",
    ...overrides,
  } as BlogPostEntity;
}

describe("toBlogPostView — author (TASK-554)", () => {
  it("carries the author's role and bio from the API", () => {
    const view = toBlogPostView(makeEntity());

    expect(view.author).toBe("Ірина Ткач");
    expect(view.authorRole).toBe("Авторка гайдів з аудіо та зарядки");
    expect(view.authorBio).toBe("Складає чек-листи.");
  });

  it("maps a post without a linked author to no role and no bio", () => {
    const view = toBlogPostView(makeEntity({ author: null }));

    expect(view.author).toBe("Ірина Ткач");
    expect(view.authorRole).toBeNull();
    expect(view.authorBio).toBeNull();
  });

  it("treats a blank role or bio as absent", () => {
    const view = toBlogPostView(
      makeEntity({
        author: { id: "author-1", name: "Ірина Ткач", role: "  ", bio: "" },
      }),
    );

    expect(view.authorRole).toBeNull();
    expect(view.authorBio).toBeNull();
  });
});
