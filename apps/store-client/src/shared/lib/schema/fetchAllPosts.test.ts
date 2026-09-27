jest.mock("@/shared/api/generated/blog/blog", () => ({
  blogControllerFindAll: jest.fn(),
}));

import { blogControllerFindAll } from "@/shared/api/generated/blog/blog";
import { fetchAllPublishedPosts } from "./fetchAllPosts";

const findAll = blogControllerFindAll as jest.Mock;

function page(slugs: string[], pageNo: number, totalPages: number) {
  return {
    data: slugs.map((slug) => ({ slug })),
    meta: { total: 0, page: pageNo, limit: 100, totalPages },
  };
}

afterEach(() => jest.clearAllMocks());

describe("fetchAllPublishedPosts (TASK-551)", () => {
  it("walks every page instead of stopping at the first hundred", async () => {
    findAll
      .mockResolvedValueOnce(page(["a", "b"], 1, 3))
      .mockResolvedValueOnce(page(["c"], 2, 3))
      .mockResolvedValueOnce(page(["d"], 3, 3));

    const posts = await fetchAllPublishedPosts();

    expect(posts.map((post) => post.slug)).toEqual(["a", "b", "c", "d"]);
    expect(findAll).toHaveBeenCalledTimes(3);
    expect(findAll).toHaveBeenLastCalledWith({
      page: 3,
      limit: 100,
      includeUnlisted: true,
    });
  });

  it("asks for unlisted posts too — they are public documents", async () => {
    findAll.mockResolvedValueOnce(page([], 1, 0));

    await fetchAllPublishedPosts();

    expect(findAll).toHaveBeenCalledWith(
      expect.objectContaining({ includeUnlisted: true }),
    );
  });

  it("throws on an API failure rather than returning an empty blog", async () => {
    findAll.mockRejectedValueOnce(new Error("502"));

    await expect(fetchAllPublishedPosts()).rejects.toThrow("502");
  });
});
