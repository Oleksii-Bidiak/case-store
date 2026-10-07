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
  categoryId: "",
  itemLimit: "12",
  status: "DRAFT",
  scheduledAt: "",
};

// Output-shaped values (post-parse) — used by the DTO mappers.
const baseValues: CarouselFormValues = {
  title: "Хіти продажів",
  source: "BESTSELLING",
  categoryId: "",
  itemLimit: 12,
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
    const result = carouselSchema.safeParse({ ...baseInput, itemLimit: "8" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.itemLimit).toBe(8);
    }
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
    // 09:00 Kyiv on 1 August is 06:00 UTC (EEST, UTC+3). Hard-coded on purpose:
    // the expectation this replaced was `new Date("2026-08-01T09:00")
    // .toISOString()` — the mapper's own expression, so it agreed with any
    // implementation, including the browser-zone one that was wrong everywhere
    // outside Kyiv (TASK-421 finding #10).
    expect(scheduled.scheduledAt).toBe("2026-08-01T06:00:00.000Z");
  });

  it("passes a numeric itemLimit through", () => {
    const dto = carouselFormValuesToCreateDto({ ...baseValues, itemLimit: 6 });
    expect(dto.itemLimit).toBe(6);
  });

  // TASK-428: the absence of the key IS the contract. On create the server appends the
  // carousel to the END of the list; on update it leaves the position the
  // operator dragged the row to untouched. Sending `0` — which the old form did for every
  // new carousel — put them all in slot 0 and left the homepage order to the database.
  it("does NOT send sortOrder", () => {
    const dto = carouselFormValuesToCreateDto(baseValues);
    expect(dto).not.toHaveProperty("sortOrder");
  });

  // TASK-660: the carousel has no placement — the homepage blocks decide.
  it("sends no placement", () => {
    expect(carouselFormValuesToCreateDto(baseValues)).not.toHaveProperty(
      "placement",
    );
  });
});
