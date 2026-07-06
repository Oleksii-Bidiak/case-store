import {
  parseSameAsLinks,
  seoSettingsSchema,
  seoSettingsFormValuesToDto,
  mapSettingsToFormValues,
} from "./seo-settings-schema";
import type { SeoSettingsEntity } from "@/entities/seo-settings";

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
});

describe("mapSettingsToFormValues", () => {
  it("converts nulls to empty strings and joins sameAs links with newlines", () => {
    const entity: SeoSettingsEntity = {
      id: "00000000-0000-0000-0000-000000000002",
      defaultMetaTitle: null,
      defaultMetaDescription: "Опис",
      titleTemplate: null,
      defaultOgImage: null,
      noindexSite: true,
      llmsTxtSummary: null,
      additionalSameAsLinks: ["https://a.com", "https://b.com"],
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };

    const values = mapSettingsToFormValues(entity);

    expect(values.defaultMetaTitle).toBe("");
    expect(values.defaultMetaDescription).toBe("Опис");
    expect(values.noindexSite).toBe(true);
    expect(values.additionalSameAsLinks).toBe("https://a.com\nhttps://b.com");
  });
});
