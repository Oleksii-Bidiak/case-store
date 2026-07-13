import {
  carouselSchema,
  carouselFormValuesToCreateDto,
  type CarouselFormInput,
  type CarouselFormValues,
} from "./carousel-schema";

const UUID = "550e8400-e29b-41d4-a716-446655440000";

// Input-shaped values (pre-parse) — numerics still strings (text inputs).
const baseInput: CarouselFormInput = {
  title: "Хіти продажів",
  source: "BESTSELLING",
  placement: "HOME_RAILS",
  categoryId: "",
  itemLimit: "12",
  sortOrder: "0",
  status: "DRAFT",
  scheduledAt: "",
};

// Output-shaped values (post-parse) — used by the DTO mappers.
const baseValues: CarouselFormValues = {
  title: "Хіти продажів",
  source: "BESTSELLING",
  placement: "HOME_RAILS",
  categoryId: "",
  itemLimit: 12,
  sortOrder: 0,
  status: "DRAFT",
  scheduledAt: "",
};

describe("carouselSchema", () => {
  it("accepts a rule-based source without a category", () => {
    expect(carouselSchema.safeParse(baseInput).success).toBe(true);
  });

  it("requires a title", () => {
    const result = carouselSchema.safeParse({ ...baseInput, title: "  " });
    expect(result.success).toBe(false);
  });

  it("rejects CATEGORY without a categoryId (mirrors the backend @ValidateIf)", () => {
    const result = carouselSchema.safeParse({
      ...baseInput,
      source: "CATEGORY",
      categoryId: "",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some((i) => i.path.join(".") === "categoryId"),
      ).toBe(true);
    }
  });

  it("accepts CATEGORY with a selected categoryId", () => {
    const result = carouselSchema.safeParse({
      ...baseInput,
      source: "CATEGORY",
      categoryId: UUID,
    });
    expect(result.success).toBe(true);
  });

  it("does not require a categoryId for MANUAL", () => {
    const result = carouselSchema.safeParse({
      ...baseInput,
      source: "MANUAL",
      categoryId: "",
    });
    expect(result.success).toBe(true);
  });

  it.each([
    ["0", false],
    ["1", true],
    ["24", true],
    ["25", false],
    ["abc", false],
    ["", true],
  ])("itemLimit %s → valid: %s", (itemLimit, valid) => {
    const result = carouselSchema.safeParse({ ...baseInput, itemLimit });
    expect(result.success).toBe(valid);
  });

  it("transforms numeric strings to numbers on output", () => {
    const result = carouselSchema.safeParse({
      ...baseInput,
      itemLimit: "8",
      sortOrder: "3",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.itemLimit).toBe(8);
      expect(result.data.sortOrder).toBe(3);
    }
  });

  // TASK-288 — placement decides whether the carousel becomes a tab in the home
  // "Популярне" section or its own rail below.
  it.each([
    ["HOME_TABS", true],
    ["HOME_RAILS", true],
    ["HOME_HERO", false],
    ["", false],
  ])("placement %s → valid: %s", (placement, valid) => {
    const result = carouselSchema.safeParse({ ...baseInput, placement });
    expect(result.success).toBe(valid);
  });

  it("requires scheduledAt when status is SCHEDULED", () => {
    const result = carouselSchema.safeParse({
      ...baseInput,
      status: "SCHEDULED",
      scheduledAt: "",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some((i) => i.path.join(".") === "scheduledAt"),
      ).toBe(true);
    }
  });
});

describe("carouselFormValuesToCreateDto", () => {
  it("omits categoryId for a non-CATEGORY source even when one is set", () => {
    const dto = carouselFormValuesToCreateDto({
      ...baseValues,
      source: "BESTSELLING",
      categoryId: UUID,
    });
    expect(dto.categoryId).toBeUndefined();
  });

  it("sends categoryId for a CATEGORY source", () => {
    const dto = carouselFormValuesToCreateDto({
      ...baseValues,
      source: "CATEGORY",
      categoryId: UUID,
    });
    expect(dto.categoryId).toBe(UUID);
  });

  it("only sends scheduledAt (as ISO) for a SCHEDULED carousel", () => {
    const draft = carouselFormValuesToCreateDto(baseValues);
    expect(draft.scheduledAt).toBeUndefined();

    const scheduled = carouselFormValuesToCreateDto({
      ...baseValues,
      status: "SCHEDULED",
      scheduledAt: "2026-08-01T09:00",
    });
    expect(scheduled.scheduledAt).toBe(
      new Date("2026-08-01T09:00").toISOString(),
    );
  });

  it("passes numeric itemLimit / sortOrder through", () => {
    const dto = carouselFormValuesToCreateDto({
      ...baseValues,
      itemLimit: 6,
      sortOrder: 2,
    });
    expect(dto.itemLimit).toBe(6);
    expect(dto.sortOrder).toBe(2);
  });

  it("always sends the selected placement (TASK-288)", () => {
    expect(
      carouselFormValuesToCreateDto({ ...baseValues, placement: "HOME_TABS" })
        .placement,
    ).toBe("HOME_TABS");
    expect(
      carouselFormValuesToCreateDto({ ...baseValues, placement: "HOME_RAILS" })
        .placement,
    ).toBe("HOME_RAILS");
  });
});
