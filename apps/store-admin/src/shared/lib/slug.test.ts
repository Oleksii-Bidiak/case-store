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
});
