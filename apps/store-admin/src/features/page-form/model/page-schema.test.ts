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
      status: "PUBLISHED",
    });
  });

  // TASK-428: the absence of the key IS the contract. On create the server appends the
  // page to the END of the list; on update it leaves the position the operator dragged
  // the row to untouched. Sending `0` — which the old form did for every new page — put
  // them all in slot 0 and left the /legal order to the database.
  it("does NOT send sortOrder, even when the inert input value is set", () => {
    const dto = pageFormValuesToCreateDto({ ...baseValues, sortOrder: 3 });
    expect(dto).not.toHaveProperty("sortOrder");
  });

  it("sends an ISO scheduledAt for a SCHEDULED page", () => {
    const dto = pageFormValuesToCreateDto({
      ...baseValues,
      status: "SCHEDULED",
      scheduledAt: "2026-08-01T09:00",
    });

    expect(dto.status).toBe("SCHEDULED");
    // 09:00 Kyiv on 1 August is 06:00 UTC (EEST, UTC+3). Hard-coded on purpose:
    // the expectation this replaced was `new Date("2026-08-01T09:00")
    // .toISOString()` — the mapper's own expression, so it agreed with any
    // implementation, including the browser-zone one that was wrong everywhere
    // outside Kyiv (TASK-421 finding #10).
    expect(dto.scheduledAt).toBe("2026-08-01T06:00:00.000Z");
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
});
