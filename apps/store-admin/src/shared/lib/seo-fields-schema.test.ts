import { z } from "zod";
import { dict } from "@/shared/config";
import { seoTextFields } from "./seo-fields-schema";

const schema = z.object(seoTextFields());

function firstMessage(input: unknown): string | undefined {
  const result = schema.safeParse(input);
  return result.success ? undefined : result.error.issues[0]?.message;
}

describe("seoTextFields (TASK-811)", () => {
  it("accepts blank and missing fields", () => {
    expect(schema.parse({})).toEqual({});
    expect(schema.parse({ metaTitle: "", metaDescription: "" })).toEqual({
      metaTitle: "",
      metaDescription: "",
    });
  });

  it("trims the text", () => {
    expect(schema.parse({ metaTitle: "  Заголовок  " }).metaTitle).toBe(
      "Заголовок",
    );
  });

  it("caps the title at 255 characters with the shared message", () => {
    expect(firstMessage({ metaTitle: "x".repeat(255) })).toBeUndefined();
    expect(firstMessage({ metaTitle: "x".repeat(256) })).toBe(
      dict.seoFields.errors.metaTitleMax,
    );
  });

  it("caps the description at 500 characters with the shared message", () => {
    expect(firstMessage({ metaDescription: "x".repeat(500) })).toBeUndefined();
    expect(firstMessage({ metaDescription: "x".repeat(501) })).toBe(
      dict.seoFields.errors.metaDescriptionMax,
    );
  });

  it("returns fresh schemas per call, so one form cannot mutate another's", () => {
    expect(seoTextFields().metaTitle).not.toBe(seoTextFields().metaTitle);
  });
});
