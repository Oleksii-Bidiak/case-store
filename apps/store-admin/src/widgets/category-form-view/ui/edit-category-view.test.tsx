import { http, HttpResponse } from "msw";
import {
  renderWithProviders,
  screen,
  userEvent,
  waitFor,
} from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { dict } from "@/shared/config";
import { getCategoryControllerGetAdminTreeQueryKey } from "@/entities/category";
import { EditCategoryView } from "./edit-category-view";

// next/navigation is unavailable under jsdom — mock the router.
jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace: jest.fn(), push: jest.fn() }),
}));

const CATEGORY_ID = "cat-uuid-1";

function makeCategory(isActive: boolean) {
  return {
    id: CATEGORY_ID,
    name: "Чохли",
    slug: "chohly",
    description: null,
    image: null,
    parentId: null,
    isActive,
    sortOrder: 0,
    metaTitle: null,
    metaDescription: null,
    createdAt: "2026-06-01T09:00:00.000Z",
    updatedAt: "2026-06-01T09:00:00.000Z",
  };
}

function stubCategory(category: ReturnType<typeof makeCategory>) {
  const putCalls: unknown[] = [];
  server.use(
    // Parent-category options for the form's select — TASK-291 feeds it from the
    // COMPLETE admin tree, not the capped flat admin list.
    http.get("*/api/categories/admin/tree", () =>
      HttpResponse.json({ data: [] }),
    ),
    // Structured-spec template editor mounted below the form (TASK-191).
    http.get(`*/api/categories/${CATEGORY_ID}/attribute-definitions`, () =>
      HttpResponse.json({ data: [] }),
    ),
    http.get(`*/api/admin/categories/${CATEGORY_ID}`, () =>
      HttpResponse.json({ data: category }),
    ),
    http.put(`*/api/admin/categories/${CATEGORY_ID}`, async ({ request }) => {
      putCalls.push(await request.json());
      return HttpResponse.json({ data: category });
    }),
  );
  return putCalls;
}

async function renderAndWaitForForm(category: ReturnType<typeof makeCategory>) {
  const putCalls = stubCategory(category);
  const { queryClient } = renderWithProviders(
    <EditCategoryView categoryId={CATEGORY_ID} />,
  );
  await waitFor(() =>
    expect(screen.getByLabelText(dict.categoryForm.slug)).toHaveValue(
      category.slug,
    ),
  );
  return { putCalls, queryClient };
}

const submit = () =>
  userEvent.click(
    screen.getByRole("button", { name: dict.common.saveChanges }),
  );

describe("EditCategoryView — slug-rename guard (TASK-285)", () => {
  let confirmSpy: jest.SpyInstance;

  beforeEach(() => {
    confirmSpy = jest.spyOn(window, "confirm").mockReturnValue(true);
  });

  afterEach(() => {
    confirmSpy.mockRestore();
  });

  it("submits without any confirm when the slug is unchanged on an active category", async () => {
    const { putCalls } = await renderAndWaitForForm(makeCategory(true));

    await submit();

    await waitFor(() => expect(putCalls).toHaveLength(1));
    expect(confirmSpy).not.toHaveBeenCalled();
  });

  it("blocks the update when the admin cancels the active-slug-change confirm", async () => {
    confirmSpy.mockReturnValue(false);
    const { putCalls } = await renderAndWaitForForm(makeCategory(true));

    const slugField = screen.getByLabelText(dict.categoryForm.slug);
    await userEvent.clear(slugField);
    await userEvent.type(slugField, "nova-adresa");
    await submit();

    expect(confirmSpy).toHaveBeenCalledWith(
      dict.categories.slugChangeConfirm("chohly", "nova-adresa"),
    );
    expect(putCalls).toHaveLength(0);
  });

  it("fires the update after the admin accepts the confirm", async () => {
    const { putCalls } = await renderAndWaitForForm(makeCategory(true));

    const slugField = screen.getByLabelText(dict.categoryForm.slug);
    await userEvent.clear(slugField);
    await userEvent.type(slugField, "nova-adresa");
    await submit();

    await waitFor(() => expect(putCalls).toHaveLength(1));
    expect(confirmSpy).toHaveBeenCalledTimes(1);
  });

  it("never confirms a slug change on an INACTIVE category", async () => {
    const { putCalls } = await renderAndWaitForForm(makeCategory(false));

    const slugField = screen.getByLabelText(dict.categoryForm.slug);
    await userEvent.clear(slugField);
    await userEvent.type(slugField, "nova-adresa");
    await submit();

    await waitFor(() => expect(putCalls).toHaveLength(1));
    expect(confirmSpy).not.toHaveBeenCalled();
  });
});

describe("EditCategoryView — cache invalidation (TASK-291-K)", () => {
  it("invalidates the admin-tree query after a successful save", async () => {
    const confirmSpy = jest.spyOn(window, "confirm").mockReturnValue(true);
    const { putCalls, queryClient } = await renderAndWaitForForm(
      makeCategory(true),
    );
    const invalidate = jest.spyOn(queryClient, "invalidateQueries");

    await submit();

    await waitFor(() => expect(putCalls).toHaveLength(1));
    // The treegrid reads the admin-tree query; a rename or a parent change made
    // through the form's kept <Select> must not leave it stale (§3.11).
    await waitFor(() =>
      expect(invalidate).toHaveBeenCalledWith({
        queryKey: getCategoryControllerGetAdminTreeQueryKey(),
      }),
    );
    confirmSpy.mockRestore();
  });
});
