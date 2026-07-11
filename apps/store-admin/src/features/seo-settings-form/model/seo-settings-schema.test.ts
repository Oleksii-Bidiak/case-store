import {
  parseSameAsLinks,
  seoSettingsSchema,
  seoSettingsFormValuesToDto,
  mapSettingsToFormValues,
  normalizeSiteVerificationValue,
} from "./seo-settings-schema";
import type { SeoSettingsEntity } from "@/entities/seo-settings";

describe("normalizeSiteVerificationValue (TASK-280)", () => {
  it("passes a bare token through unchanged", () => {
    expect(normalizeSiteVerificationValue("AbCdEfGh1234567890")).toBe(
      "AbCdEfGh1234567890",
    );
  });

  it("extracts the token from a full Google meta tag", () => {
    expect(
      normalizeSiteVerificationValue(
        '<meta name="google-site-verification" content="XYZ" />',
      ),
    ).toBe("XYZ");
  });

  it("extracts the token from a full Bing meta tag (name-agnostic)", () => {
    expect(
      normalizeSiteVerificationValue(
        '<meta name="msvalidate.01" content="ABC">',
      ),
    ).toBe("ABC");
  });

  it("handles a single-quoted content attribute", () => {
    expect(
      normalizeSiteVerificationValue(
        "<meta name='google-site-verification' content='QRS' />",
      ),
    ).toBe("QRS");
  });

  it("normalizes whitespace-only input to an empty string", () => {
    expect(normalizeSiteVerificationValue("   ")).toBe("");
  });
});

describe("parseSameAsLinks", () => {
  it("splits on newlines, trims, and drops blank lines", () => {
    const raw = "  https://a.com \n\n https://b.com \n   \n";
    expect(parseSameAsLinks(raw)).toEqual(["https://a.com", "https://b.com"]);
  });

  it("returns an empty array for an empty string", () => {
    expect(parseSameAsLinks("")).toEqual([]);
  });
});

describe("seoSettingsSchema", () => {
  const base = {
    defaultMetaTitle: "",
    defaultMetaDescription: "",
    titleTemplate: "",
    defaultOgImage: "",
    noindexSite: false,
    llmsTxtSummary: "",
    additionalSameAsLinks: "",
  };

  it("accepts a titleTemplate containing exactly one %s token", () => {
    const result = seoSettingsSchema.safeParse({
      ...base,
      titleTemplate: "%s | MobileStore",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a titleTemplate without a %s token", () => {
    const result = seoSettingsSchema.safeParse({
      ...base,
      titleTemplate: "MobileStore",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a sameAs textarea with an invalid URL line", () => {
    const result = seoSettingsSchema.safeParse({
      ...base,
      additionalSameAsLinks: "https://ok.com\nnot-a-url",
    });
    expect(result.success).toBe(false);
  });

  it("accepts a sameAs textarea where every line is a valid URL", () => {
    const result = seoSettingsSchema.safeParse({
      ...base,
      additionalSameAsLinks: "https://ok.com\nhttps://two.com",
    });
    expect(result.success).toBe(true);
  });
});

describe("seoSettingsFormValuesToDto", () => {
  it("drops blank text fields and splits sameAs links into an array", () => {
    const dto = seoSettingsFormValuesToDto({
      defaultMetaTitle: "  ",
      defaultMetaDescription: "Опис",
      titleTemplate: "",
      defaultOgImage: "https://cdn.ua/og.jpg",
      noindexSite: true,
      llmsTxtSummary: "",
      additionalSameAsLinks: "https://a.com\n\nhttps://b.com",
    });

    expect(dto.defaultMetaTitle).toBeUndefined();
    expect(dto.defaultMetaDescription).toBe("Опис");
    expect(dto.titleTemplate).toBeUndefined();
    expect(dto.defaultOgImage).toBe("https://cdn.ua/og.jpg");
    expect(dto.noindexSite).toBe(true);
    expect(dto.additionalSameAsLinks).toEqual([
      "https://a.com",
      "https://b.com",
    ]);
  });

  it("omits blank verification fields and normalizes a pasted meta tag on submit (TASK-280)", () => {
    const dto = seoSettingsFormValuesToDto({
      defaultMetaTitle: "",
      defaultMetaDescription: "",
      titleTemplate: "",
      defaultOgImage: "",
      googleSiteVerification:
        '<meta name="google-site-verification" content="G-TOKEN" />',
      bingSiteVerification: "",
      noindexSite: false,
      llmsTxtSummary: "",
      additionalSameAsLinks: "",
    });

    // Defense-in-depth: the pasted tag is normalized even without a blur event.
    expect(dto.googleSiteVerification).toBe("G-TOKEN");
    expect(dto.bingSiteVerification).toBeUndefined();
  });
});

describe("mapSettingsToFormValues", () => {
  it("converts nulls to empty strings and joins sameAs links with newlines", () => {
    const entity: SeoSettingsEntity = {
      id: "00000000-0000-0000-0000-000000000002",
      defaultMetaTitle: null,
      defaultMetaDescription: "Опис",
      titleTemplate: null,
      defaultOgImage: null,
      googleSiteVerification: "G-TOKEN",
      bingSiteVerification: null,
      noindexSite: true,
      llmsTxtSummary: null,
      additionalSameAsLinks: ["https://a.com", "https://b.com"],
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };

    const values = mapSettingsToFormValues(entity);

    expect(values.defaultMetaTitle).toBe("");
    expect(values.defaultMetaDescription).toBe("Опис");
    expect(values.googleSiteVerification).toBe("G-TOKEN");
    expect(values.bingSiteVerification).toBe("");
    expect(values.noindexSite).toBe(true);
    expect(values.additionalSameAsLinks).toBe("https://a.com\nhttps://b.com");
  });
});
