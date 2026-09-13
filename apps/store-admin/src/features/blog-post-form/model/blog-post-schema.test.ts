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
  listed: true,
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
  listed: true,
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

  // TASK-437 — the article's first SEO fields. Blank means CLEAR here, not
  // "omit": one mapper serves create and update, and an omitted field on update
  // would leave a wrong meta title on a live article forever.
  it("sends null for blank SEO overrides and an empty tag list", () => {
    const dto = blogPostFormValuesToCreateDto(baseValues);
    expect(dto.metaTitle).toBeNull();
    expect(dto.metaDescription).toBeNull();
    expect(dto.ogImage).toBeNull();
    expect(dto.keywords).toEqual([]);
  });

  it("splits the comma-separated tag field into the array the API takes", () => {
    const dto = blogPostFormValuesToCreateDto({
      ...baseValues,
      metaTitle: "iPhone 16 чи 15 у 2026",
      metaDescription: "Опис для видачі",
      keywords: "iphone 16, порівняння ,  iPhone 16",
      ogImage: "https://cdn.example.com/og/iphone16.jpg",
    });
    expect(dto.metaTitle).toBe("iPhone 16 чи 15 у 2026");
    expect(dto.metaDescription).toBe("Опис для видачі");
    expect(dto.keywords).toEqual(["iphone 16", "порівняння"]);
    expect(dto.ogImage).toBe("https://cdn.example.com/og/iphone16.jpg");
  });

  it("only sends scheduledAt (as ISO) for a SCHEDULED post", () => {
    const draft = blogPostFormValuesToCreateDto({
      ...baseValues,
      status: "SCHEDULED",
      scheduledAt: "2026-08-01T09:00",
    });
    expect(draft.status).toBe("SCHEDULED");
    expect(draft.scheduledAt).toBe(new Date("2026-08-01T09:00").toISOString());

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

  // TASK-437 — the tag limits mirror the API's, so the form refuses what the
  // backend would refuse instead of surfacing a bare 400.
  it("rejects more than 20 tags", () => {
    const result = blogPostSchema.safeParse({
      ...baseInput,
      keywords: Array.from({ length: 21 }, (_, i) => `tag-${i}`).join(", "),
    });
    expect(result.success).toBe(false);
  });

  it("counts the PARSED tags, so blanks and duplicates do not trip the limit", () => {
    const result = blogPostSchema.safeParse({
      ...baseInput,
      keywords: "iphone,,iphone, , IPHONE",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an ogImage that is not a URL", () => {
    const result = blogPostSchema.safeParse({
      ...baseInput,
      ogImage: "og-image.jpg",
    });
    expect(result.success).toBe(false);
  });
});
