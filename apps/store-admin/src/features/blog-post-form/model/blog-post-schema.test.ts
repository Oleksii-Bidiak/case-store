import {
  blogPostSchema,
  blogPostFormValuesToCreateDto,
  type BlogPostFormInput,
  type BlogPostFormValues,
} from "./blog-post-schema";

// Output-shaped values (post-parse) — consumed by the DTO mappers.
const baseValues: BlogPostFormValues = {
  title: "iPhone 16 vs 15",
  slug: "",
  excerpt: "Розбір камер",
  content: "<p>Body</p>",
  categoryId: "cat-1",
  authorName: "Олег",
  coverImageUrl: "",
  readingMinutes: 8,
  featured: false,
  status: "DRAFT",
  scheduledAt: "",
};

// Input-shaped values (pre-parse) — used with `safeParse`.
const baseInput: BlogPostFormInput = {
  title: "iPhone 16 vs 15",
  slug: "",
  excerpt: "Розбір камер",
  content: "<p>Body</p>",
  categoryId: "cat-1",
  authorName: "Олег",
  coverImageUrl: "",
  readingMinutes: "8",
  featured: false,
  status: "DRAFT",
  scheduledAt: "",
};

describe("blogPostFormValuesToCreateDto", () => {
  it("drops blank optional strings so the backend treats them as omitted", () => {
    const dto = blogPostFormValuesToCreateDto(baseValues);
    expect(dto.slug).toBeUndefined();
    expect(dto.coverImageUrl).toBeUndefined();
    expect(dto.title).toBe("iPhone 16 vs 15");
    expect(dto.categoryId).toBe("cat-1");
    expect(dto.readingMinutes).toBe(8);
    expect(dto.featured).toBe(false);
  });

  it("only sends scheduledAt (as ISO) for a SCHEDULED post", () => {
    const draft = blogPostFormValuesToCreateDto({
      ...baseValues,
      status: "SCHEDULED",
      scheduledAt: "2026-08-01T09:00",
    });
    expect(draft.status).toBe("SCHEDULED");
    // 09:00 Kyiv on 1 August is 06:00 UTC (EEST, UTC+3). Hard-coded on purpose:
    // the expectation this replaced was `new Date("2026-08-01T09:00")
    // .toISOString()` — the mapper's own expression, so it agreed with any
    // implementation, including the browser-zone one that was wrong everywhere
    // outside Kyiv (TASK-421 finding #10).
    expect(draft.scheduledAt).toBe("2026-08-01T06:00:00.000Z");

    const published = blogPostFormValuesToCreateDto({
      ...baseValues,
      status: "PUBLISHED",
      scheduledAt: "2026-08-01T09:00",
    });
    expect(published.scheduledAt).toBeUndefined();
  });
});

describe("blogPostSchema", () => {
  it("accepts a valid draft", () => {
    expect(blogPostSchema.safeParse(baseInput).success).toBe(true);
  });

  it("requires a category", () => {
    const result = blogPostSchema.safeParse({ ...baseInput, categoryId: "" });
    expect(result.success).toBe(false);
  });

  it("requires an excerpt", () => {
    const result = blogPostSchema.safeParse({ ...baseInput, excerpt: "" });
    expect(result.success).toBe(false);
  });

  it("rejects an empty Tiptap document", () => {
    const result = blogPostSchema.safeParse({
      ...baseInput,
      content: "<p></p>",
    });
    expect(result.success).toBe(false);
  });

  it("requires scheduledAt when status is SCHEDULED", () => {
    const result = blogPostSchema.safeParse({
      ...baseInput,
      status: "SCHEDULED",
      scheduledAt: "",
    });
    expect(result.success).toBe(false);
  });

  it("parses readingMinutes from string to number", () => {
    const result = blogPostSchema.safeParse({
      ...baseInput,
      readingMinutes: "6",
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.readingMinutes).toBe(6);
  });

  it("rejects a non-numeric readingMinutes", () => {
    const result = blogPostSchema.safeParse({
      ...baseInput,
      readingMinutes: "abc",
    });
    expect(result.success).toBe(false);
  });
});
