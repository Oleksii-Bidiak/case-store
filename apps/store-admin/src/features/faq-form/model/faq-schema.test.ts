import {
  faqSchema,
  faqFormValuesToDto,
  mapFaqToFormValues,
  type FaqFormInput,
} from "./faq-schema";
import type { FaqItemEntity } from "@/entities/faq";

/**
 * TASK-428 removed the `sortOrder` field from this form: it defaulted to 0, so every
 * question an operator created landed in the same slot. The order is now set by dragging
 * rows in the FAQ list, and a new item is appended by the server — which only works
 * because the payload built here NO LONGER CARRIES `sortOrder` at all. The last two cases
 * are what hold that.
 */

const baseInput: FaqFormInput = {
  question: "Скільки коштує доставка?",
  answer: "Безкоштовно від 1 000 ₴.",
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
});

describe("faqFormValuesToDto", () => {
  it("maps parsed values into the create/update payload", () => {
    const parsed = faqSchema.parse(baseInput);
    const dto = faqFormValuesToDto(parsed);
    expect(dto).toEqual({
      question: "Скільки коштує доставка?",
      answer: "Безкоштовно від 1 000 ₴.",
      isActive: true,
    });
  });

  // The absence of the key IS the contract: on create the server appends the item to the
  // end of the list, on update it leaves the dragged position alone. Sending `0` here —
  // which the old form did for every new question — would put them all in slot 0 again.
  it("does NOT send sortOrder", () => {
    const dto = faqFormValuesToDto(faqSchema.parse(baseInput));
    expect(dto).not.toHaveProperty("sortOrder");
  });
});

describe("mapFaqToFormValues", () => {
  it("maps the entity onto the form's fields, without sortOrder", () => {
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
      isActive: false,
    });
  });
});
