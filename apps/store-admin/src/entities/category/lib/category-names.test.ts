import { categoryNamesById } from "./category-names";

describe("categoryNamesById (TASK-717)", () => {
  it("maps every node at every depth, not just the roots", () => {
    const names = categoryNamesById([
      {
        id: "root",
        name: "Аксесуари",
        children: [
          {
            id: "mid",
            name: "Чохли",
            children: [{ id: "leaf", name: "Чохли для iPhone", children: [] }],
          },
        ],
      },
      { id: "other", name: "Техніка", children: [] },
    ]);

    expect(names.get("leaf")).toBe("Чохли для iPhone");
    expect(names.get("mid")).toBe("Чохли");
    expect(names.get("root")).toBe("Аксесуари");
    expect(names.get("other")).toBe("Техніка");
    expect(names.size).toBe(4);
  });

  it("returns an empty map while the tree has not loaded", () => {
    expect(categoryNamesById(undefined).size).toBe(0);
    expect(categoryNamesById(null).size).toBe(0);
  });
});
