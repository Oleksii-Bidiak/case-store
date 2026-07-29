import { slugify } from "./slug";

describe("slugify", () => {
  it("converts a simple name to a slug", () => {
    expect(slugify("Hello World")).toBe("hello-world");
  });

  it("strips special characters", () => {
    expect(slugify("iPhone 15 Pro Max!")).toBe("iphone-15-pro-max");
  });

  it("replaces underscores with hyphens", () => {
    expect(slugify("my_category_name")).toBe("my-category-name");
  });

  it("handles an empty string", () => {
    expect(slugify("")).toBe("");
  });

  it("trims leading and trailing hyphens", () => {
    expect(slugify("--hello world--")).toBe("hello-world");
  });

  it("collapses runs of whitespace into a single hyphen", () => {
    expect(slugify("hello   world")).toBe("hello-world");
  });

  it("handles mixed case", () => {
    expect(slugify("Samsung Galaxy S24 Ultra")).toBe(
      "samsung-galaxy-s24-ultra",
    );
  });

  // Parity with the backend's `generateSlug` (TASK-360). These expectations are
  // copied verbatim from `transliterate.util.spec.ts` — if the two ever disagree
  // the admin's live slug preview is lying about what the server will store.
  describe("Ukrainian names", () => {
    it.each([
      ["Чохли", "chokhly"],
      ["Захисне скло", "zakhysne-sklo"],
      ["Кабелі / перехідники", "kabeli-perekhidnyky"],
      ["Зарядні пристрої", "zariadni-prystroi"],
      ["Аксесуари для автомобіля", "aksesuary-dlia-avtomobilia"],
      ["Плотери та плівки", "plotery-ta-plivky"],
      ["Для дому та офісу", "dlia-domu-ta-ofisu"],
      ["Геймінг", "heiminh"],
      ["Освітлення", "osvitlennia"],
      ["Дитячі товари", "dytiachi-tovary"],
    ])("slugifies %p to %p", (input, expected) => {
      expect(slugify(input)).toBe(expected);
    });

    it("handles a mixed Latin/Cyrillic product name", () => {
      expect(slugify("Чохол Armor Magnetic Samsung Galaxy A35")).toBe(
        "chokhol-armor-magnetic-samsung-galaxy-a35",
      );
    });
  });
});
