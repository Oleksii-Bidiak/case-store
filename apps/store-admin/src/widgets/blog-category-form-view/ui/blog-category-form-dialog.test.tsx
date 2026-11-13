import { http, HttpResponse } from "msw";
import {
  renderWithProviders,
  screen,
  userEvent,
  waitFor,
  within,
} from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { dict } from "@/shared/config";
import { PERM } from "@/entities/permission";
import { BlogCategoryFormDialog } from "./blog-category-form-dialog";

const c = dict.blogCategories;
const f = dict.blogCategoryForm;

const mockReplace = jest.fn();
let mockSearchParams = new URLSearchParams("");
jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockReplace, push: jest.fn() }),
  usePathname: () => "/blog/categories",
  useSearchParams: () => mockSearchParams,
}));

const toastSuccess = jest.fn();
const toastError = jest.fn();
jest.mock("@/shared/ui/toast", () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccess(...args),
    error: (...args: unknown[]) => toastError(...args),
  },
}));

const WRITER = { permissions: [PERM.blogWrite] };
const ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const category = {
  id: ID,
  slug: "reviews",
  name: "Огляди",
  sortOrder: 0,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

beforeEach(() => {
  mockReplace.mockClear();
  toastSuccess.mockClear();
  toastError.mockClear();
  mockSearchParams = new URLSearchParams("");
});

describe("BlogCategoryFormDialog (КБ4 — the form over the list)", () => {
  it("stays closed without ?new or ?edit", () => {
    renderWithProviders(<BlogCategoryFormDialog />, { auth: WRITER });

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("?new=1 opens «Нова категорія» and creates", async () => {
    mockSearchParams = new URLSearchParams("new=1");
    const bodies: unknown[] = [];
    server.use(
      http.post("*/api/admin/blog/categories", async ({ request }) => {
        bodies.push(await request.json());
        return HttpResponse.json({ data: category }, { status: 201 });
      }),
    );
    renderWithProviders(<BlogCategoryFormDialog />, { auth: WRITER });

    const dialog = await screen.findByRole("dialog", {
      name: c.createHeading,
    });
    await userEvent.type(
      within(dialog).getByRole("textbox", { name: f.name }),
      "Огляди",
    );
    await userEvent.click(
      within(dialog).getByRole("button", { name: c.createSubmit }),
    );

    await waitFor(() => expect(bodies).toEqual([{ name: "Огляди" }]));
    await waitFor(() =>
      expect(toastSuccess).toHaveBeenCalledWith(c.toastCreated),
    );
    expect(mockReplace).toHaveBeenCalledWith("/blog/categories");
  });

  it("?edit=<id> opens «Редагувати категорію» seeded from the API and saves", async () => {
    mockSearchParams = new URLSearchParams(`edit=${ID}`);
    const bodies: unknown[] = [];
    server.use(
      http.get(`*/api/admin/blog/categories/${ID}`, () =>
        HttpResponse.json({ data: category }),
      ),
      http.put(`*/api/admin/blog/categories/${ID}`, async ({ request }) => {
        bodies.push(await request.json());
        return HttpResponse.json({ data: category });
      }),
    );
    renderWithProviders(<BlogCategoryFormDialog />, { auth: WRITER });

    const dialog = await screen.findByRole("dialog", { name: c.editHeading });
    await waitFor(() =>
      expect(within(dialog).getByLabelText(f.slug)).toHaveValue("reviews"),
    );
    await userEvent.click(
      within(dialog).getByRole("button", { name: f.submit }),
    );

    await waitFor(() =>
      expect(bodies).toEqual([{ name: "Огляди", slug: "reviews" }]),
    );
    await waitFor(() =>
      expect(toastSuccess).toHaveBeenCalledWith(c.toastUpdated),
    );
  });

  // TASK-1984 Rule 6b: a taken slug is said under the slug, not in a toast.
  it("puts BLOG_CATEGORY_SLUG_CONFLICT under the slug field", async () => {
    mockSearchParams = new URLSearchParams("new=1");
    server.use(
      http.post("*/api/admin/blog/categories", () =>
        HttpResponse.json(
          {
            statusCode: 409,
            error: "BLOG_CATEGORY_SLUG_CONFLICT",
            message: "Slug is already taken",
          },
          { status: 409 },
        ),
      ),
    );
    renderWithProviders(<BlogCategoryFormDialog />, { auth: WRITER });

    const dialog = await screen.findByRole("dialog", {
      name: c.createHeading,
    });
    await userEvent.type(
      within(dialog).getByRole("textbox", { name: f.name }),
      "Огляди",
    );
    await userEvent.click(
      within(dialog).getByRole("button", { name: c.createSubmit }),
    );

    expect(
      await within(dialog).findByText(f.errors.slugTaken),
    ).toBeInTheDocument();
    expect(within(dialog).getByLabelText(f.slug)).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(toastError).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("«Скасувати» closes it by dropping the param", async () => {
    mockSearchParams = new URLSearchParams("new=1");
    renderWithProviders(<BlogCategoryFormDialog />, { auth: WRITER });

    const dialog = await screen.findByRole("dialog");
    await userEvent.click(
      within(dialog).getByRole("button", { name: dict.common.cancel }),
    );

    expect(mockReplace).toHaveBeenCalledWith("/blog/categories");
  });

  it("does not open for a session without blog:write", () => {
    mockSearchParams = new URLSearchParams("new=1");
    renderWithProviders(<BlogCategoryFormDialog />);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
