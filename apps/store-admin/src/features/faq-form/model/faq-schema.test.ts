import {
  faqSchema,
  faqFormValuesToDto,
  mapFaqToFormValues,
  type FaqFormInput,
} from "./faq-schema";
import type { FaqItemEntity } from "@/entities/faq";

const baseInput: FaqFormInput = {
  question: "Скільки коштує доставка?",
  answer: "Безкоштовно від 1 000 ₴.",
  sortOrder: "0",
  isActive: true,
};

describe("faqSchema", () => {
  it("accepts a valid question/answer", () => {
    const result = faqSchema.safeParse(baseInput);
    expect(result.success).toBe(true);
  });

  it("rejects a blank question", () => {
    const result = faqSchema.safeParse({ ...baseInput, question: "  " });
    expect(result.success).toBe(false);
  });

  it("rejects a blank answer", () => {
    const result = faqSchema.safeParse({ ...baseInput, answer: "" });
    expect(result.success).toBe(false);
  });

  it("rejects a non-numeric sortOrder", () => {
    const result = faqSchema.safeParse({ ...baseInput, sortOrder: "abc" });
    expect(result.success).toBe(false);
  });

  it("parses a blank sortOrder to 0", () => {
    const result = faqSchema.safeParse({ ...baseInput, sortOrder: "" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.sortOrder).toBe(0);
    }
  });

  it("coerces a numeric string sortOrder to a number", () => {
    const result = faqSchema.safeParse({ ...baseInput, sortOrder: "3" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.sortOrder).toBe(3);
    }
  });
});

describe("faqFormValuesToDto", () => {
  it("maps parsed values into the create/update payload", () => {
    const parsed = faqSchema.parse({ ...baseInput, sortOrder: "2" });
    const dto = faqFormValuesToDto(parsed);
    expect(dto).toEqual({
      question: "Скільки коштує доставка?",
      answer: "Безкоштовно від 1 000 ₴.",
      sortOrder: 2,
      isActive: true,
    });
  });
});

describe("mapFaqToFormValues", () => {
  it("stringifies sortOrder for the number input", () => {
    const entity = {
      id: "faq-1",
      question: "Q",
      answer: "A",
      sortOrder: 5,
      isActive: false,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    } as FaqItemEntity;

    expect(mapFaqToFormValues(entity)).toEqual({
      question: "Q",
      answer: "A",
      sortOrder: "5",
      isActive: false,
    });
  });
});
