import { cn } from "./utils";

describe("cn", () => {
  it("lets a role radius replace a default one", () => {
    expect(cn("rounded-xl", "rounded-card")).toBe("rounded-card");
  });

  // TASK-217: tailwind-merge read the `border-chip` width utility as a border
  // colour and dropped it beside `border-border`, so chips lost their outline.
  it("keeps the border-chip width next to a border colour", () => {
    expect(cn("border-chip", "border-border")).toBe(
      "border-chip border-border",
    );
    expect(cn("border-chip border-border", "border-primary")).toBe(
      "border-chip border-primary",
    );
  });

  it("treats border-chip as a width that replaces another width", () => {
    expect(cn("border", "border-chip")).toBe("border-chip");
  });
});
