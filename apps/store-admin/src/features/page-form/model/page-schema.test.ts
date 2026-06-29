import {
  pageSchema,
  pageFormValuesToCreateDto,
  pageFormValuesToUpdateDto,
  type PageFormInput,
  type PageFormValues,
} from "./page-schema";

// Output-shaped values (post-parse) — used by the DTO mappers, which consume
// `PageFormValues` (sortOrder already a number).
const baseValues: PageFormValues = {
  title: "Privacy Policy",
  slug: "",
  content: "<p>Body</p>",
  excerpt: "",
  metaTitle: "",
  metaDescription: "",
  sortOrder: 0,
  isActive: false,
};

// Input-shaped values (pre-parse) — used with `pageSchema.safeParse`, where
// sortOrder is still bound to a text input (string).
const baseInput: PageFormInput = {
  title: "Privacy Policy",
  slug: "",
  content: "<p>Body</p>",
  excerpt: "",
  metaTitle: "",
  metaDescription: "",
  sortOrder: "0",
  isActive: false,
};

describe("pageFormValuesToCreateDto", () => {
  it("drops blank optional strings so the backend treats them as omitted", () => {
    const dto = pageFormValuesToCreateDto(baseValues);

    expect(dto.title).toBe("Privacy Policy");
    expect(dto.content).toBe("<p>Body</p>");
    expect(dto.slug).toBeUndefined();
    expect(dto.excerpt).toBeUndefined();
    expect(dto.metaTitle).toBeUndefined();
    expect(dto.metaDescription).toBeUndefined();
  });

  it("passes provided optional fields through", () => {
    const dto = pageFormValuesToCreateDto({
      ...baseValues,
      slug: "privacy-policy",
      excerpt: "Summary",
      metaTitle: "SEO title",
      metaDescription: "SEO description",
      sortOrder: 3,
      isActive: true,
    });

    expect(dto).toMatchObject({
      slug: "privacy-policy",
      excerpt: "Summary",
      metaTitle: "SEO title",
      metaDescription: "SEO description",
      sortOrder: 3,
      isActive: true,
    });
  });

  it("update mapper mirrors the create mapper", () => {
    expect(pageFormValuesToUpdateDto(baseValues)).toEqual(
      pageFormValuesToCreateDto(baseValues),
    );
  });
});

describe("pageSchema content validation", () => {
  it("rejects an empty Tiptap document", () => {
    const result = pageSchema.safeParse({ ...baseInput, content: "<p></p>" });
    expect(result.success).toBe(false);
  });

  it("accepts a document with real text", () => {
    const result = pageSchema.safeParse({
      ...baseInput,
      content: "<p>Real content</p>",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an invalid slug", () => {
    const result = pageSchema.safeParse({ ...baseInput, slug: "Not A Slug" });
    expect(result.success).toBe(false);
  });
});
