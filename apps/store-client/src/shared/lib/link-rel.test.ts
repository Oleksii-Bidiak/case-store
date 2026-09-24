import { withOpenerSafeRel } from "./link-rel";

describe("withOpenerSafeRel (TASK-575)", () => {
  it("keeps the API's nofollow on an external link", () => {
    expect(withOpenerSafeRel("noopener noreferrer nofollow")).toBe(
      "noopener noreferrer nofollow",
    );
  });

  it("does not invent nofollow for an internal link", () => {
    expect(withOpenerSafeRel("noopener noreferrer")).toBe(
      "noopener noreferrer",
    );
  });

  it("adds noopener noreferrer when rel is missing", () => {
    expect(withOpenerSafeRel(null)).toBe("noopener noreferrer");
    expect(withOpenerSafeRel("")).toBe("noopener noreferrer");
  });

  it("adds the missing half and keeps other tokens", () => {
    expect(withOpenerSafeRel("nofollow noopener")).toBe(
      "nofollow noopener noreferrer",
    );
  });

  it("normalises case and duplicates", () => {
    expect(withOpenerSafeRel("NoFollow  nofollow")).toBe(
      "nofollow noopener noreferrer",
    );
  });
});
