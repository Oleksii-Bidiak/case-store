import { http, HttpResponse } from "msw";
import { QueryClient } from "@tanstack/react-query";
import {
  renderWithProviders,
  screen,
  userEvent,
  waitFor,
} from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { dict } from "@/shared/config";
import { getCategoryControllerGetAdminTreeQueryKey } from "@/entities/category";
import { CategoryStatusToggle } from "./category-status-toggle";

const ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

/** Count the deactivate calls the component actually makes. */
function stubDeactivate(calls: string[]) {
  server.use(
    http.patch("*/api/admin/categories/:id/deactivate", ({ params }) => {
      calls.push(String(params.id));
      return HttpResponse.json({ data: { id: params.id, isActive: false } });
    }),
  );
}

const confirmSpy = jest.spyOn(window, "confirm");

afterEach(() => confirmSpy.mockReset());

describe("CategoryStatusToggle — blast radius (TASK-291-I, §3.11)", () => {
  it("a node WITH descendants: CANCEL → ZERO mutation calls, focus back on the toggle", async () => {
    const calls: string[] = [];
    stubDeactivate(calls);
    confirmSpy.mockReturnValue(false);

    renderWithProviders(
      <CategoryStatusToggle
        categoryId={ID}
        isActive
        name="Alpha"
        descendantCount={3}
      />,
    );

    const button = screen.getByRole("button", {
      name: dict.statusToggle.categoryDeactivate,
    });
    await userEvent.click(button);

    expect(confirmSpy).toHaveBeenCalledWith(
      dict.categories.tree.deactivateConfirm("Alpha", 3),
    );
    expect(calls).toEqual([]);
    expect(button).toHaveFocus();
  });

  it("a node WITH descendants: ACCEPT → exactly ONE call, and the count was shown first", async () => {
    const calls: string[] = [];
    stubDeactivate(calls);
    confirmSpy.mockReturnValue(true);

    renderWithProviders(
      <CategoryStatusToggle
        categoryId={ID}
        isActive
        name="Alpha"
        descendantCount={3}
      />,
    );

    await userEvent.click(
      screen.getByRole("button", {
        name: dict.statusToggle.categoryDeactivate,
      }),
    );

    expect(confirmSpy).toHaveBeenCalledWith(
      "„Alpha“ буде приховано разом із 3 підкатегоріями",
    );
    await waitFor(() => expect(calls).toEqual([ID]));
    expect(calls).toHaveLength(1);
  });

  it("a LEAF node shows NO confirmation at all", async () => {
    const calls: string[] = [];
    stubDeactivate(calls);

    renderWithProviders(
      <CategoryStatusToggle
        categoryId={ID}
        isActive
        name="Leaf"
        descendantCount={0}
      />,
    );

    await userEvent.click(
      screen.getByRole("button", {
        name: dict.statusToggle.categoryDeactivate,
      }),
    );

    expect(confirmSpy).not.toHaveBeenCalled();
    await waitFor(() => expect(calls).toEqual([ID]));
  });

  it("invalidates the admin-tree query key on success (§3.11)", async () => {
    const calls: string[] = [];
    stubDeactivate(calls);

    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: 0 },
        mutations: { retry: false },
      },
    });
    const invalidate = jest.spyOn(queryClient, "invalidateQueries");

    renderWithProviders(
      <CategoryStatusToggle categoryId={ID} isActive name="Leaf" />,
      { queryClient },
    );

    await userEvent.click(
      screen.getByRole("button", {
        name: dict.statusToggle.categoryDeactivate,
      }),
    );

    await waitFor(() =>
      expect(invalidate).toHaveBeenCalledWith({
        queryKey: getCategoryControllerGetAdminTreeQueryKey(),
      }),
    );
  });
});
