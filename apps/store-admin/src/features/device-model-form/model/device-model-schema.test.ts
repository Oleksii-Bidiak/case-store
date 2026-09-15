import {
  deviceModelSchema,
  deviceModelValuesToDto,
  type DeviceModelFormValues,
} from "./device-model-schema";

/**
 * The compat-landing copy an admin types on a device model (TASK-490).
 *
 * The rule worth pinning is the asymmetry between the two verbs: a blank field
 * must become an explicit `null` on UPDATE and be OMITTED on CREATE. Get it
 * wrong in the obvious way — send `undefined` on update — and everything still
 * compiles, the form still saves, and an override becomes impossible to remove:
 * Prisma reads `undefined` as "no change", so the admin who once typed a title
 * for «Чохли для iPhone 15 Pro» can never get the generated one back.
 */
function parse(overrides: Partial<Record<string, unknown>> = {}) {
  return deviceModelSchema.parse({
    deviceBrandId: "550e8400-e29b-41d4-a716-446655440000",
    name: "iPhone 15 Pro",
    ...overrides,
  }) as DeviceModelFormValues;
}

describe("device-model form — compatibility landing copy (TASK-490)", () => {
  it("sends the trimmed values when the admin wrote them", () => {
    const dto = deviceModelValuesToDto(
      parse({
        metaTitle: "  Чохли для iPhone 15 Pro  ",
        metaDescription: "  Понад 40 моделей.  ",
        description: "  Усі чохли, що точно сідають.  ",
      }),
    );

    expect(dto.metaTitle).toBe("Чохли для iPhone 15 Pro");
    expect(dto.metaDescription).toBe("Понад 40 моделей.");
    expect(dto.description).toBe("Усі чохли, що точно сідають.");
  });

  it("omits blank fields on CREATE", () => {
    const dto = deviceModelValuesToDto(
      parse({ metaTitle: "", metaDescription: "", description: "" }),
    );

    expect(dto.metaTitle).toBeUndefined();
    expect(dto.metaDescription).toBeUndefined();
    expect(dto.description).toBeUndefined();
  });

  it("clears them with an explicit null on UPDATE", () => {
    const dto = deviceModelValuesToDto(
      parse({ metaTitle: "", metaDescription: "", description: "" }),
      { isUpdate: true },
    );

    expect(dto.metaTitle).toBeNull();
    expect(dto.metaDescription).toBeNull();
    expect(dto.description).toBeNull();
  });

  it("rejects values past the API's own caps", () => {
    // 255 / 500 / 2000 — the same limits the DTO enforces server-side, so the
    // admin sees the error in the field rather than as a 400 on save.
    expect(() => parse({ metaTitle: "x".repeat(256) })).toThrow();
    expect(() => parse({ metaDescription: "x".repeat(501) })).toThrow();
    expect(() => parse({ description: "x".repeat(2001) })).toThrow();
    expect(() => parse({ metaTitle: "x".repeat(255) })).not.toThrow();
  });
});
