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
  status: "DRAFT",
  kind: "LEGAL",
  scheduledAt: "",
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
  status: "DRAFT",
  kind: "LEGAL",
  scheduledAt: "",
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
      status: "PUBLISHED",
    });

    expect(dto).toMatchObject({
      slug: "privacy-policy",
      excerpt: "Summary",
      metaTitle: "SEO title",
      metaDescription: "SEO description",
      sortOrder: 3,
      status: "PUBLISHED",
    });
  });

  it("sends an ISO scheduledAt for a SCHEDULED page", () => {
    const dto = pageFormValuesToCreateDto({
      ...baseValues,
      status: "SCHEDULED",
      scheduledAt: "2026-08-01T09:00",
    });

    expect(dto.status).toBe("SCHEDULED");
    expect(dto.scheduledAt).toBe(new Date("2026-08-01T09:00").toISOString());
  });

  it("omits scheduledAt when the page is not SCHEDULED", () => {
    const dto = pageFormValuesToCreateDto({
      ...baseValues,
      status: "PUBLISHED",
      scheduledAt: "2026-08-01T09:00",
    });

    expect(dto.scheduledAt).toBeUndefined();
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

  it("requires scheduledAt when status is SCHEDULED", () => {
    const result = pageSchema.safeParse({
      ...baseInput,
      status: "SCHEDULED",
      scheduledAt: "",
    });
    expect(result.success).toBe(false);
  });

  it("accepts a SCHEDULED page with a scheduledAt", () => {
    const result = pageSchema.safeParse({
      ...baseInput,
      status: "SCHEDULED",
      scheduledAt: "2026-08-01T09:00",
    });
    expect(result.success).toBe(true);
  });

  // TASK-437 — tags and the OG override.
  it("rejects more than 20 tags but counts only the PARSED ones", () => {
    expect(
      pageSchema.safeParse({
        ...baseInput,
        keywords: Array.from({ length: 21 }, (_, i) => `tag-${i}`).join(","),
      }).success,
    ).toBe(false);
    expect(
      pageSchema.safeParse({
        ...baseInput,
        keywords: "доставка,,доставка, , ДОСТАВКА",
      }).success,
    ).toBe(true);
  });

  it("rejects an ogImage that is not a URL", () => {
    const result = pageSchema.safeParse({ ...baseInput, ogImage: "og.jpg" });
    expect(result.success).toBe(false);
  });
});

describe("page mappers — tags and ogImage (TASK-437)", () => {
  it("splits the tag field and clears a blank ogImage with an explicit null", () => {
    const dto = pageFormValuesToCreateDto({
      ...baseValues,
      keywords: "доставка, нова пошта ,  Доставка",
    });
    expect(dto.keywords).toEqual(["доставка", "нова пошта"]);
    // Null, not undefined: the page form uses ONE mapper for create and update,
    // so a blank field has to be able to clear a stored value.
    expect(dto.ogImage).toBeNull();
  });

  it("passes a provided ogImage through, trimmed", () => {
    const dto = pageFormValuesToCreateDto({
      ...baseValues,
      ogImage: "  https://cdn.example.com/og/delivery.jpg  ",
    });
    expect(dto.ogImage).toBe("https://cdn.example.com/og/delivery.jpg");
  });
});
