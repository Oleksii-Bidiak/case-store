import { useState } from "react";
import { http, HttpResponse, delay } from "msw";
import {
  renderWithProviders,
  screen,
  userEvent,
  waitFor,
  within,
  type RenderWithProvidersOptions,
} from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { dict } from "@/shared/config";
import { toast } from "@/shared/ui/toast";
import {
  getAdminCategoryControllerFindAllWithProductCountQueryKey,
  getAdminCategoryControllerFindByIdQueryKey,
  getCategoryControllerGetAdminTreeQueryKey,
} from "@/entities/category";
import { getProductControllerAdminFindAllQueryKey } from "@/entities/product";
import { WithAuth } from "@/entities/session/model/auth-context.fixture";
import { CategoryDeleteDialog } from "./category-delete-dialog";

const mockPush = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn() }),
}));

jest.mock("@/shared/ui/toast", () => ({
  UNDO_TOAST_DURATION_MS: 10_000,
  toast: {
    success: jest.fn(),
    error: jest.fn(),
    undo: jest.fn(),
    dismiss: jest.fn(),
  },
}));
const successToast = toast.success as jest.Mock;

const d = dict.categories.delete;

/* ─────────────────────────────── fixtures ──────────────────────────────── */

const HEAD = "11111111-1111-4111-8111-111111111111"; // Навушники (deleted)
const TWS = "12121212-1212-4121-8121-121212121212"; //   TWS
const WIRED = "13131313-1313-4131-8131-131313131313"; //   Дротові
const ACC = "21212121-2121-4212-8212-212121212121"; // Аксесуари
const AUDIO = "22222222-2222-4222-8222-222222222222"; //   Аудіоаксесуари
const PIXEL = "33333333-3333-4333-8333-333333333333"; // Чохли для Pixel (empty)

function node(
  id: string,
  name: string,
  slug: string,
  parentId: string | null,
  depth: number,
  children: unknown[] = [],
) {
  return {
    id,
    name,
    slug,
    description: null,
    image: null,
    isActive: true,
    sortOrder: 0,
    metaTitle: null,
    metaDescription: null,
    updatedAt: "2026-10-01T00:00:00.000Z",
    parentId,
    productCount: 0,
    subtreeProductCount: 0,
    depth,
    children,
  };
}

const TREE = [
  node(HEAD, "Навушники", "headphones", null, 1, [
    node(TWS, "Бездротові вкладиші (TWS)", "tws", HEAD, 2),
    node(WIRED, "Дротові", "wired", HEAD, 2),
  ]),
  node(ACC, "Аксесуари", "accessories", null, 1, [
    node(AUDIO, "Аудіоаксесуари", "audio-accessories", ACC, 2),
  ]),
  node(PIXEL, "Чохли для Pixel", "pixel-cases", null, 1),
];

interface Impact {
  subcategoryCount: number;
  productCount: number;
  carouselCount: number;
  carousels: { id: string; name: string }[];
  deletedProductCount: number;
}

const HEAD_IMPACT: Impact = {
  subcategoryCount: 2,
  productCount: 15,
  carouselCount: 1,
  carousels: [{ id: "c-1", name: "Навушники тижня" }],
  deletedProductCount: 0,
};
const EMPTY_IMPACT: Impact = {
  subcategoryCount: 0,
  productCount: 0,
  carouselCount: 0,
  carousels: [],
  deletedProductCount: 0,
};

const NAMES: Record<string, [string, string]> = {
  [HEAD]: ["Навушники", "headphones"],
  [PIXEL]: ["Чохли для Pixel", "pixel-cases"],
  [AUDIO]: ["Аудіоаксесуари", "audio-accessories"],
};

function detail(id: string, impact: Impact) {
  const [name, slug] = NAMES[id];
  return {
    data: {
      id,
      name,
      slug,
      description: null,
      image: null,
      parentId: null,
      isActive: true,
      sortOrder: 0,
      metaTitle: null,
      metaDescription: null,
      keywords: [],
      ogImage: null,
      createdAt: "2026-10-01T00:00:00.000Z",
      updatedAt: "2026-10-01T00:00:00.000Z",
      deletionImpact: impact,
    },
  };
}

/** The id the server gives a category created by `moveToNew`. */
const CREATED = "44444444-4444-4444-8444-444444444444";

interface DeleteResult {
  targetId: string | null;
  movedProducts: number;
  switchedCarousels: number;
}

/** The 200 answer of a delete (TASK-1775): what the server DID. */
function deleted(result: Partial<DeleteResult> = {}) {
  return HttpResponse.json({
    data: {
      targetId: null,
      movedProducts: 0,
      switchedCarousels: 0,
      ...result,
    },
  });
}

interface DeleteBody {
  moveToId?: string;
  moveToNew?: { name: string; parentId?: string };
}

/** Every DELETE body the dialog sent, in order. */
let bodies: unknown[] = [];
/** How many times the tree and the preview were read. */
let treeGets = 0;
let detailGets = 0;

function stub({
  impacts = { [HEAD]: HEAD_IMPACT, [PIXEL]: EMPTY_IMPACT },
  respond,
}: {
  impacts?: Record<string, Impact>;
  respond?: (body: DeleteBody) => Response | Promise<Response>;
} = {}) {
  server.use(
    http.get("*/api/categories/admin/tree", () => {
      treeGets += 1;
      return HttpResponse.json({ data: TREE });
    }),
    http.get("*/api/admin/categories/:id", ({ params }) => {
      detailGets += 1;
      return HttpResponse.json(
        detail(params.id as string, impacts[params.id as string]),
      );
    }),
    http.delete("*/api/admin/categories/:id", async ({ request, params }) => {
      const body = (await request.json()) as DeleteBody;
      bodies.push(body);
      if (respond) return respond(body);
      // By default the server moves exactly what its preview counted.
      const impact = impacts[params.id as string];
      const targetId = body.moveToId ?? (body.moveToNew ? CREATED : null);
      return deleted({
        targetId,
        movedProducts: targetId
          ? impact.productCount + impact.deletedProductCount
          : 0,
        switchedCarousels: targetId ? impact.carouselCount : 0,
      });
    }),
  );
}

const ADMIN = { isOwner: true } as const;
const DELETE_ONLY = { permissions: ["categories:delete"] };

function renderDialog(
  categoryId: string | null = HEAD,
  auth: RenderWithProvidersOptions["auth"] = ADMIN,
) {
  const onOpenChange = jest.fn();
  const onDeleted = jest.fn();
  const result = renderWithProviders(
    <CategoryDeleteDialog
      categoryId={categoryId}
      onOpenChange={onOpenChange}
      onDeleted={onDeleted}
    />,
    { auth },
  );
  return { ...result, onOpenChange, onDeleted };
}

const dialog = () => screen.getByRole("alertdialog");
const targetBox = () => screen.getByRole("combobox", { name: d.targetLabel });

/** Wait until the server's numbers are in and the form is on screen. */
async function ready() {
  await screen.findByRole("button", { name: /^Видалити/ });
}

async function pickTarget(
  user: ReturnType<typeof userEvent.setup>,
  name: string,
) {
  await user.click(targetBox());
  await user.click(
    await screen.findByRole("option", { name: optionName(name) }),
  );
}

/** A target option is named by its label, then its «N тов.» figure. */
function optionName(name: string) {
  return new RegExp(`^${name}\\s*\\d+ тов\\.$`);
}

/** The picked target as the field shows it — the whole path (ДН-2.4). */
const AUDIO_PATH = "Аксесуари › Аудіоаксесуари";

beforeEach(() => {
  bodies = [];
  treeGets = 0;
  detailGets = 0;
  mockPush.mockClear();
  successToast.mockClear();
});

/* ──────────────────────────────── the suite ────────────────────────────── */

describe("CategoryDeleteDialog — gate (TASK-655)", () => {
  it("renders nothing without categories:delete", () => {
    stub();
    renderDialog(HEAD, { permissions: ["categories:write"] });
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("renders nothing while the permissions are still loading, then appears", async () => {
    stub();
    const { rerender } = renderDialog(HEAD, {
      arePermissionsLoading: true,
      permissions: [],
    });
    // `can()` answers false until the answer arrives — no flash of a dialog
    // that a 403 would then take away.
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(bodies).toEqual([]);

    rerender(
      <WithAuth permissions={["categories:delete"]}>
        <CategoryDeleteDialog
          categoryId={HEAD}
          onOpenChange={jest.fn()}
          onDeleted={jest.fn()}
        />
      </WithAuth>,
    );
    await ready();
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
  });

  it("is an alertdialog asking about the category by name", async () => {
    stub();
    renderDialog(HEAD, DELETE_ONLY);
    await ready();
    expect(
      within(dialog()).getByRole("heading", { name: d.title("Навушники") }),
    ).toBeInTheDocument();
    expect(within(dialog()).getByText(d.lead)).toBeInTheDocument();
  });

  it("keeps the first focus on «Скасувати» while the numbers arrive", async () => {
    stub();
    renderDialog();
    const cancel = await screen.findByRole("button", {
      name: dict.common.cancel,
    });
    await waitFor(() => expect(cancel).toHaveFocus());
    await ready();
    // The same node — not unmounted from under the focus by the form.
    expect(screen.getByRole("button", { name: dict.common.cancel })).toBe(
      cancel,
    );
    expect(cancel).toHaveFocus();
  });
});

describe("CategoryDeleteDialog — the server's numbers, never guessed", () => {
  it("shows a loading state — no counts, no confirm — until deletionImpact arrives", async () => {
    server.use(
      http.get("*/api/categories/admin/tree", () =>
        HttpResponse.json({ data: TREE }),
      ),
      http.get("*/api/admin/categories/:id", async () => {
        await delay("infinite");
        return HttpResponse.json({});
      }),
    );
    renderDialog();

    expect(await screen.findByText(d.loading)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /^Видалити/ }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/0 товарів/)).not.toBeInTheDocument();
    expect(within(dialog()).getByText(d.leadUnknown)).toBeInTheDocument();
  });

  it("shows an error with a retry — and still no counts — when the preview fails", async () => {
    server.use(
      http.get("*/api/categories/admin/tree", () =>
        HttpResponse.json({ data: TREE }),
      ),
      http.get("*/api/admin/categories/:id", () =>
        HttpResponse.json({ message: "boom" }, { status: 500 }),
      ),
    );
    renderDialog();

    expect(await screen.findByText(d.loadError)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: d.retry })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /^Видалити/ }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(d.consequences)).not.toBeInTheDocument();
  });

  it("before a target is picked, states only the loss (ДН-2.2)", async () => {
    stub();
    renderDialog();
    await ready();

    expect(screen.getByText(d.goneCount(3))).toBeInTheDocument(); // «3 категорії»
    expect(
      screen.getByText(d.goneText(3, "Навушники", 2), { exact: false }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Бездротові вкладиші \(TWS\) · Дротові\./),
    ).toBeInTheDocument();
    // Where things go is not a fact yet.
    expect(screen.queryByText(d.productsCount(15))).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Видалити й перенести 15 товарів" }),
    ).toBeInTheDocument();
  });

  it("once the target is picked, says what moves where (ДН-2.4)", async () => {
    const user = userEvent.setup();
    stub();
    renderDialog();
    await ready();
    await pickTarget(user, "Аудіоаксесуари");

    expect(screen.getByText("15 товарів")).toBeInTheDocument();
    expect(
      screen.getByText("переїдуть у «Аудіоаксесуари»", { exact: false }),
    ).toBeInTheDocument();
    // TASK-1776: the carousel is named, as ДН-2.4 draws it.
    expect(screen.getByText("1 карусель головної")).toBeInTheDocument();
    expect(
      screen.getByText("«Навушники тижня» перемкнеться на «Аудіоаксесуари»", {
        exact: false,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Інакше вона лишилася б без товарів."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("/categories/headphones звільниться", { exact: false }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(d.templatesWarning("«Аудіоаксесуари»")),
    ).toBeInTheDocument();
  });

  it("agrees the Ukrainian plurals with the numbers", async () => {
    const user = userEvent.setup();
    stub({
      impacts: {
        [HEAD]: {
          subcategoryCount: 2,
          productCount: 1,
          carouselCount: 3,
          carousels: [
            { id: "c-1", name: "Навушники тижня" },
            { id: "c-2", name: "Хіти" },
            { id: "c-3", name: "Новинки" },
          ],
          deletedProductCount: 2,
        },
      },
    });
    renderDialog();
    await ready();
    await pickTarget(user, "Аудіоаксесуари");

    expect(screen.getByText("1 товар")).toBeInTheDocument();
    expect(
      screen.getByText("переїде у «Аудіоаксесуари»", { exact: false }),
    ).toBeInTheDocument();
    expect(screen.getByText("3 каруселі головної")).toBeInTheDocument();
    expect(
      screen.getByText(
        "«Навушники тижня», «Хіти» і «Новинки» перемкнуться на «Аудіоаксесуари»",
        { exact: false },
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Інакше вони лишилися б без товарів."),
    ).toBeInTheDocument();
    expect(
      screen.getByText(d.productsDeletedToo(2), { exact: false }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Видалити й перенести 1 товар" }),
    ).toBeInTheDocument();
  });
});

describe("CategoryDeleteDialog — the carousels by name (TASK-1776)", () => {
  const carousels = (names: string[]) =>
    names.map((name, i) => ({ id: `c-${i}`, name }));

  async function renderWithCarousels(names: string[]) {
    const user = userEvent.setup();
    stub({
      impacts: {
        [HEAD]: {
          ...HEAD_IMPACT,
          carouselCount: names.length,
          carousels: carousels(names),
        },
      },
    });
    renderDialog();
    await ready();
    await pickTarget(user, "Аудіоаксесуари");
  }

  it("names two with «і»", async () => {
    await renderWithCarousels(["Навушники тижня", "Хіти"]);
    expect(screen.getByText("2 каруселі головної")).toBeInTheDocument();
    expect(
      screen.getByText(
        "«Навушники тижня» і «Хіти» перемкнуться на «Аудіоаксесуари»",
        { exact: false },
      ),
    ).toBeInTheDocument();
  });

  it("names the first three and counts the rest", async () => {
    await renderWithCarousels(["А", "Б", "В", "Г", "Ґ"]);
    expect(screen.getByText("5 каруселей головної")).toBeInTheDocument();
    expect(
      screen.getByText(
        "«А», «Б», «В» і ще 2 перемкнуться на «Аудіоаксесуари»",
        {
          exact: false,
        },
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/«Г»/)).not.toBeInTheDocument();
  });
});

describe("CategoryDeleteDialog — the target picker", () => {
  it("does not offer the branch being deleted", async () => {
    const user = userEvent.setup();
    stub();
    renderDialog();
    await ready();
    await user.click(targetBox());

    const listbox = await screen.findByRole("listbox");
    const options = within(listbox)
      .getAllByRole("option")
      .map((o) => o.firstElementChild?.textContent);
    expect(options).toEqual(["Аксесуари", "Аудіоаксесуари", "Чохли для Pixel"]);
  });

  it("says how many products each target holds, and checks the picked one (ДН-2.3)", async () => {
    const user = userEvent.setup();
    const counted = TREE.map((root) =>
      root.id === ACC
        ? {
            ...root,
            subtreeProductCount: 22,
            children: root.children.map((child) => ({
              ...(child as ReturnType<typeof node>),
              subtreeProductCount: 7,
            })),
          }
        : root,
    );
    stub();
    // The handler added last answers first.
    server.use(
      http.get("*/api/categories/admin/tree", () =>
        HttpResponse.json({ data: counted }),
      ),
    );
    renderDialog();
    await ready();
    await pickTarget(user, "Аудіоаксесуари");

    // The field names the target by its whole path.
    expect(targetBox()).toHaveValue(AUDIO_PATH);

    // Still focused after the pick — ArrowDown reopens the list.
    await user.keyboard("{ArrowDown}");
    const listbox = await screen.findByRole("listbox");
    const acc = within(listbox).getByRole("option", {
      name: optionName("Аксесуари"),
    });
    const audio = within(listbox).getByRole("option", {
      name: optionName("Аудіоаксесуари"),
    });
    expect(acc).toHaveTextContent(d.targetOptionCount(22));
    expect(audio).toHaveTextContent(d.targetOptionCount(7));
    expect(audio).toHaveAttribute("aria-checked", "true");
    expect(acc).not.toHaveAttribute("aria-checked");
  });

  it("says the tree did not load — and offers a retry — instead of an empty picker", async () => {
    const user = userEvent.setup();
    let fail = true;
    stub();
    server.use(
      http.get("*/api/categories/admin/tree", () =>
        fail
          ? HttpResponse.json({ message: "boom" }, { status: 500 })
          : HttpResponse.json({ data: TREE }),
      ),
    );
    renderDialog();
    await ready();

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(d.treeLoadError);
    expect(targetBox()).toBeDisabled();
    expect(screen.queryByText(d.targetEmpty)).not.toBeInTheDocument();

    fail = false;
    await user.click(within(alert).getByRole("button"));
    await waitFor(() =>
      expect(screen.queryByText(d.treeLoadError)).not.toBeInTheDocument(),
    );
    expect(targetBox()).toBeEnabled();
    await pickTarget(user, "Аудіоаксесуари");
    expect(targetBox()).toHaveValue(AUDIO_PATH);
  });

  it("refuses to submit without a target — says why under the field and focuses it", async () => {
    const user = userEvent.setup();
    stub();
    renderDialog();
    await ready();

    await user.click(
      screen.getByRole("button", { name: "Видалити й перенести 15 товарів" }),
    );

    expect(await screen.findByText(d.targetRequired)).toBeInTheDocument();
    expect(targetBox()).toHaveFocus();
    expect(targetBox()).toHaveAttribute("aria-invalid", "true");
    expect(bodies).toEqual([]);
  });

  it("sends { moveToId } and confirms with a toast that shows the products (ДН-2.11)", async () => {
    const user = userEvent.setup();
    stub();
    const { onDeleted, onOpenChange, queryClient } = renderDialog();
    const invalidate = jest.spyOn(queryClient, "invalidateQueries");
    await ready();
    await pickTarget(user, "Аудіоаксесуари");
    await user.click(
      screen.getByRole("button", { name: "Видалити й перенести 15 товарів" }),
    );

    await waitFor(() => expect(onDeleted).toHaveBeenCalledTimes(1));
    expect(bodies).toEqual([{ moveToId: AUDIO }]);
    expect(onOpenChange).toHaveBeenCalledWith(false);

    const keys = invalidate.mock.calls.map(([filters]) =>
      JSON.stringify(filters?.queryKey),
    );
    for (const key of [
      getCategoryControllerGetAdminTreeQueryKey(),
      getAdminCategoryControllerFindAllWithProductCountQueryKey(),
      getAdminCategoryControllerFindByIdQueryKey(AUDIO),
      getProductControllerAdminFindAllQueryKey(),
    ]) {
      expect(keys).toContain(JSON.stringify(key));
    }

    expect(successToast).toHaveBeenCalledTimes(1);
    const [message, options] = successToast.mock.calls[0];
    expect(message).toBe(d.toastMoved("Навушники", 15, "Аудіоаксесуари"));
    expect(options.action.label).toBe(d.toastShowProducts);
    options.action.onClick();
    await waitFor(() =>
      expect(mockPush).toHaveBeenCalledWith(`/products?categoryId=${AUDIO}`),
    );
  });

  it("the toast states what the server moved, not the preview's number (TASK-1775)", async () => {
    const user = userEvent.setup();
    // Two products were filed in the branch after the dialog loaded.
    stub({
      respond: () =>
        deleted({ targetId: AUDIO, movedProducts: 17, switchedCarousels: 1 }),
    });
    const { onDeleted } = renderDialog();
    await ready();
    await pickTarget(user, "Аудіоаксесуари");
    await user.click(
      screen.getByRole("button", { name: "Видалити й перенести 15 товарів" }),
    );

    await waitFor(() => expect(onDeleted).toHaveBeenCalledTimes(1));
    const [message] = successToast.mock.calls[0];
    expect(message).toBe(d.toastMoved("Навушники", 17, "Аудіоаксесуари"));
    expect(message).toBe(
      "Категорію «Навушники» видалено. 17 товарів тепер у «Аудіоаксесуари».",
    );
  });

  it("«Показати товари» opens the category created here by the id in the answer — no tree re-read (TASK-1775)", async () => {
    const user = userEvent.setup();
    stub();
    const { onDeleted, queryClient } = renderDialog();
    const invalidate = jest.spyOn(queryClient, "invalidateQueries");
    await ready();
    await user.click(screen.getByRole("radio", { name: d.modeNew }));
    await user.type(
      screen.getByRole("textbox", { name: /Назва нової/ }),
      "Аудіо",
    );
    await user.click(
      screen.getByRole("button", { name: "Видалити й перенести 15 товарів" }),
    );

    await waitFor(() => expect(onDeleted).toHaveBeenCalledTimes(1));
    // The created target's card is refreshed too — it is known by id now.
    expect(
      invalidate.mock.calls.map(([filters]) =>
        JSON.stringify(filters?.queryKey),
      ),
    ).toContain(
      JSON.stringify(getAdminCategoryControllerFindByIdQueryKey(CREATED)),
    );
    const [message, options] = successToast.mock.calls[0];
    expect(message).toBe(d.toastMoved("Навушники", 15, "Аудіо"));
    const treeReadsBefore = treeGets;
    options.action.onClick();
    expect(mockPush).toHaveBeenCalledWith(`/products?categoryId=${CREATED}`);
    // Nothing is looked up by a guessed slug any more.
    expect(treeGets).toBe(treeReadsBefore);
  });

  it("names the deleted products that moved, without «Показати товари» (TASK-1836)", async () => {
    const user = userEvent.setup();
    stub({
      impacts: {
        [HEAD]: {
          subcategoryCount: 0,
          productCount: 0,
          carouselCount: 0,
          carousels: [],
          deletedProductCount: 2,
        },
      },
    });
    const { onDeleted } = renderDialog();
    await ready();
    await pickTarget(user, "Аудіоаксесуари");
    await user.click(screen.getByRole("button", { name: d.confirm }));

    await waitFor(() => expect(onDeleted).toHaveBeenCalledTimes(1));
    expect(bodies).toEqual([{ moveToId: AUDIO }]);
    expect(successToast).toHaveBeenCalledTimes(1);
    const [message, options] = successToast.mock.calls[0];
    expect(message).toBe(d.toastMovedDeleted("Навушники", 2, "Аудіоаксесуари"));
    expect(options?.action).toBeUndefined();
  });
});

describe("CategoryDeleteDialog — in flight and after (ДН-2.7 / ДН-2.11)", () => {
  it("while deleting: «Видаляємо…», still destructive, and Escape waits", async () => {
    const user = userEvent.setup();
    stub({
      respond: async () => {
        await delay("infinite");
        return deleted({ targetId: AUDIO, movedProducts: 15 });
      },
    });
    const { onOpenChange } = renderDialog();
    await ready();
    await pickTarget(user, "Аудіоаксесуари");
    await user.click(
      screen.getByRole("button", { name: "Видалити й перенести 15 товарів" }),
    );

    const busy = await screen.findByRole("button", { name: d.busy });
    expect(busy).toBeDisabled();
    // ДН-2.7: red with a white spinner, not the grey «not allowed» look.
    expect(busy).toHaveAttribute("data-variant", "destructive");
    expect(busy).toHaveClass("disabled:bg-destructive", "disabled:text-white");
    await user.keyboard("{Escape}");
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it("forgets the deleted branch's cached details — but only once nothing watches them", async () => {
    const user = userEvent.setup();
    stub();
    const onDeleted = jest.fn();
    // A real owner of the open state: closing really unmounts the content.
    function Harness() {
      const [id, setId] = useState<string | null>(HEAD);
      return (
        <CategoryDeleteDialog
          categoryId={id}
          onOpenChange={(open) => {
            if (!open) setId(null);
          }}
          onDeleted={onDeleted}
        />
      );
    }
    const { queryClient } = renderWithProviders(<Harness />, { auth: ADMIN });
    // An unwatched card of a deleted subcategory, cached from an earlier visit.
    queryClient.setQueryData(getAdminCategoryControllerFindByIdQueryKey(TWS), {
      data: { id: TWS },
    });
    await ready();
    await pickTarget(user, "Аудіоаксесуари");
    const remove = jest.spyOn(queryClient, "removeQueries");
    await user.click(
      screen.getByRole("button", { name: "Видалити й перенести 15 товарів" }),
    );
    await waitFor(() => expect(onDeleted).toHaveBeenCalled());

    // Dropped quietly, never through a refetch of a live observer.
    expect(remove).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(
        queryClient.getQueryData(
          getAdminCategoryControllerFindByIdQueryKey(TWS),
        ),
      ).toBeUndefined();
      // The dialog's own preview was watched; it goes once the dialog closes.
      expect(
        queryClient.getQueryData(
          getAdminCategoryControllerFindByIdQueryKey(HEAD),
        ),
      ).toBeUndefined();
    });
    // …and was not read again on its way out.
    expect(detailGets).toBe(1);
  });
});

describe("CategoryDeleteDialog — «Створити нову» (ДН-2.5 / ДН-2.6)", () => {
  it("sends { moveToNew } with the typed name; the root parent is omitted", async () => {
    const user = userEvent.setup();
    stub();
    const { onDeleted } = renderDialog();
    await ready();

    await user.click(screen.getByRole("radio", { name: d.modeNew }));
    const nameInput = screen.getByRole("textbox", { name: /Назва нової/ });
    await user.type(nameInput, "Аудіо");
    expect(screen.getByText(d.newNameHint("audio"))).toBeInTheDocument();
    expect(
      screen.getByText("переїдуть у «Аудіо» (нова, у корені каталогу)", {
        exact: false,
      }),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Видалити й перенести 15 товарів" }),
    );
    await waitFor(() => expect(onDeleted).toHaveBeenCalled());
    expect(bodies).toEqual([{ moveToNew: { name: "Аудіо" } }]);
  });

  it("sends the parent picked outside the branch", async () => {
    const user = userEvent.setup();
    stub();
    const { onDeleted } = renderDialog();
    await ready();

    await user.click(screen.getByRole("radio", { name: d.modeNew }));
    await user.type(
      screen.getByRole("textbox", { name: /Назва нової/ }),
      "Аудіо",
    );
    await user.click(screen.getByRole("combobox", { name: d.newParent }));
    const listbox = await screen.findByRole("listbox");
    // The branch being deleted cannot be the parent either.
    expect(
      within(listbox).queryByRole("option", { name: "Навушники" }),
    ).not.toBeInTheDocument();
    await user.click(
      within(listbox).getByRole("option", { name: "Аксесуари" }),
    );
    await user.click(
      screen.getByRole("button", { name: "Видалити й перенести 15 товарів" }),
    );

    await waitFor(() => expect(onDeleted).toHaveBeenCalled());
    expect(bodies).toEqual([{ moveToNew: { name: "Аудіо", parentId: ACC } }]);
  });

  it("refuses an empty name and focuses the field", async () => {
    const user = userEvent.setup();
    stub();
    renderDialog();
    await ready();

    await user.click(screen.getByRole("radio", { name: d.modeNew }));
    await user.click(
      screen.getByRole("button", { name: "Видалити й перенести 15 товарів" }),
    );

    expect(await screen.findByText(d.newNameRequired)).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: /Назва нової/ })).toHaveFocus();
    expect(bodies).toEqual([]);
  });

  it("is locked, with the reason, without categories:write", async () => {
    stub();
    renderDialog(HEAD, DELETE_ONLY);
    await ready();

    const locked = screen.getByRole("radio", { name: d.modeNew });
    expect(locked).toBeDisabled();
    expect(locked).toHaveAccessibleDescription(d.modeNewLocked);
    expect(screen.getByRole("radio", { name: d.modeExisting })).toBeChecked();
  });
});

describe("CategoryDeleteDialog — an empty category (ДН-2.9)", () => {
  it("asks no target and sends an empty body", async () => {
    const user = userEvent.setup();
    stub();
    const { onDeleted } = renderDialog(PIXEL);
    await ready();

    expect(screen.getByText(d.leadEmpty)).toBeInTheDocument();
    expect(screen.queryByRole("radiogroup")).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.getByText("1 категорія")).toBeInTheDocument();
    expect(screen.getByText(d.goneSubEmpty)).toBeInTheDocument();
    expect(
      screen.getByText("/categories/pixel-cases звільниться", {
        exact: false,
      }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: d.confirm }));
    await waitFor(() => expect(onDeleted).toHaveBeenCalled());
    expect(bodies).toEqual([{}]);
    expect(successToast).toHaveBeenCalledWith(d.toastDone("Чохли для Pixel"));
  });

  it("is NOT empty while soft-deleted products are filed in it", async () => {
    stub({
      impacts: { [PIXEL]: { ...EMPTY_IMPACT, deletedProductCount: 1 } },
    });
    renderDialog(PIXEL);
    await ready();

    expect(screen.getByRole("radiogroup")).toBeInTheDocument();
    expect(targetBox()).toBeInTheDocument();
  });
});

/* ─────────────────────── a hidden target (TASK-1837) ───────────────────── */

type TreeNode = ReturnType<typeof node>;

/** TREE with these categories hidden (their own `isActive = false`). */
function treeHiding(hidden: string[], nodes: unknown[] = TREE): TreeNode[] {
  return (nodes as TreeNode[]).map((n) => ({
    ...n,
    isActive: !hidden.includes(n.id),
    children: treeHiding(hidden, n.children),
  }));
}

/** A hidden target's option: its label, «прихована», then its figure. */
function hiddenOptionName(name: string) {
  return new RegExp(`^${name}\\s*прихована · \\d+ тов\\.$`);
}

describe("CategoryDeleteDialog — a hidden target (TASK-1837)", () => {
  /** Serve this tree to every read from now on. */
  const serveTree = (tree: () => unknown) =>
    server.use(
      http.get("*/api/categories/admin/tree", () => {
        treeGets += 1;
        return HttpResponse.json({ data: tree() });
      }),
    );

  const confirm = () =>
    screen.getByRole("button", { name: "Видалити й перенести 15 товарів" });

  it("marks a hidden target, warns with the count, and sends the consent", async () => {
    const user = userEvent.setup();
    stub();
    serveTree(() => treeHiding([AUDIO]));
    const { onDeleted } = renderDialog();
    await ready();

    await user.click(targetBox());
    const listbox = await screen.findByRole("listbox");
    // Still selectable — only marked.
    expect(
      within(listbox).getByRole("option", { name: optionName("Аксесуари") }),
    ).toBeInTheDocument();
    await user.click(
      within(listbox).getByRole("option", {
        name: hiddenOptionName("Аудіоаксесуари"),
      }),
    );

    expect(
      screen.getByText(d.hiddenTargetWarning("Аудіоаксесуари", 15, 1)),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        // TASK-1841: the switched carousel is named in the warning too.
        "«Аудіоаксесуари» прихована: після переїзду 15 товарів зникнуть із сайту, а 1 карусель головної нічого не показуватиме, доки ви не покажете «Аудіоаксесуари».",
      ),
    ).toBeInTheDocument();
    // The «не ховається» promise is gone; the products row says what is true.
    expect(screen.queryByText(d.productsSub)).not.toBeInTheDocument();
    const row = screen.getByText(d.productsSubHidden).closest("li");
    expect(row).toHaveAttribute("data-tone", "warning");
    // …and so does the carousels row (TASK-1841).
    expect(screen.queryByText(d.carouselsSub(1))).not.toBeInTheDocument();
    const carouselRow = screen.getByText(d.carouselsSubHidden(1)).closest("li");
    expect(carouselRow).toHaveAttribute("data-tone", "warning");

    await user.click(confirm());
    await waitFor(() => expect(onDeleted).toHaveBeenCalled());
    expect(bodies).toEqual([{ moveToId: AUDIO, allowHiddenTarget: true }]);
    // The toast repeats that the products are off the site (TASK-1841).
    const [message, options] = successToast.mock.calls[0];
    expect(message).toBe(
      "Категорію «Навушники» видалено. 15 товарів тепер у «Аудіоаксесуари». На сайті їх не видно, а 1 карусель головної порожня, доки ви не покажете «Аудіоаксесуари».",
    );
    expect(options.action.label).toBe(d.toastShowProducts);
  });

  it("without carousels the warning and the toast speak of the products only (TASK-1841)", async () => {
    const user = userEvent.setup();
    stub({
      impacts: {
        [HEAD]: { ...HEAD_IMPACT, carouselCount: 0, carousels: [] },
      },
    });
    serveTree(() => treeHiding([AUDIO]));
    const { onDeleted } = renderDialog();
    await ready();
    await user.click(targetBox());
    await user.click(
      await screen.findByRole("option", {
        name: hiddenOptionName("Аудіоаксесуари"),
      }),
    );

    expect(
      screen.getByText(
        "«Аудіоаксесуари» прихована: після переїзду 15 товарів зникнуть із сайту, доки ви не покажете «Аудіоаксесуари».",
      ),
    ).toBeInTheDocument();
    await user.click(confirm());
    await waitFor(() => expect(onDeleted).toHaveBeenCalled());
    expect(successToast.mock.calls[0][0]).toBe(
      "Категорію «Навушники» видалено. 15 товарів тепер у «Аудіоаксесуари». На сайті їх не видно, доки ви не покажете «Аудіоаксесуари».",
    );
  });

  it("a move into a visible target keeps the plain toast", async () => {
    const user = userEvent.setup();
    stub();
    const { onDeleted } = renderDialog();
    await ready();
    await pickTarget(user, "Аудіоаксесуари");
    expect(screen.getByText(d.carouselsSub(1))).toBeInTheDocument();
    await user.click(confirm());
    await waitFor(() => expect(onDeleted).toHaveBeenCalled());
    expect(successToast.mock.calls[0][0]).toBe(
      d.toastMoved("Навушники", 15, "Аудіоаксесуари"),
    );
  });

  it("a visible target gets no warning and no consent — also after a hidden one was picked first", async () => {
    const user = userEvent.setup();
    stub();
    serveTree(() => treeHiding([AUDIO]));
    const { onDeleted } = renderDialog();
    await ready();

    await user.click(targetBox());
    await user.click(
      await screen.findByRole("option", {
        name: hiddenOptionName("Аудіоаксесуари"),
      }),
    );
    expect(
      screen.getByText(d.hiddenTargetWarning("Аудіоаксесуари", 15, 1)),
    ).toBeInTheDocument();

    // Still focused after the pick — ArrowDown reopens the list.
    await user.keyboard("{ArrowDown}");
    await user.click(
      await screen.findByRole("option", {
        name: optionName("Чохли для Pixel"),
      }),
    );
    expect(
      screen.queryByText(/прихована: після переїзду/),
    ).not.toBeInTheDocument();
    expect(screen.getByText(d.productsSub)).toBeInTheDocument();

    await user.click(confirm());
    await waitFor(() => expect(onDeleted).toHaveBeenCalled());
    expect(bodies).toEqual([{ moveToId: PIXEL }]);
  });

  it("409 CATEGORY_MOVE_TARGET_HIDDEN: says so, keeps the choice, and the second confirm consents", async () => {
    const user = userEvent.setup();
    let hidden = false;
    let refusals = 0;
    stub({
      respond: () => {
        if (refusals > 0)
          return deleted({ targetId: AUDIO, movedProducts: 15 });
        refusals += 1;
        // Someone hid the target while the dialog was open.
        hidden = true;
        return HttpResponse.json(
          {
            statusCode: 409,
            error: "CATEGORY_MOVE_TARGET_HIDDEN",
            message: "hidden",
          },
          { status: 409 },
        );
      },
    });
    serveTree(() => (hidden ? treeHiding([AUDIO]) : TREE));
    const { onDeleted } = renderDialog();
    await ready();
    await pickTarget(user, "Аудіоаксесуари");
    expect(
      screen.queryByText(/прихована: після переїзду/),
    ).not.toBeInTheDocument();
    const before = treeGets;

    await user.click(confirm());

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(d.errorTitle);
    expect(alert).toHaveTextContent(d.errorTargetHidden("Аудіоаксесуари"));
    expect(onDeleted).not.toHaveBeenCalled();
    await waitFor(() => expect(treeGets).toBeGreaterThan(before));
    // The choice is kept, and now the warning is there.
    expect(targetBox()).toHaveValue(AUDIO_PATH);
    expect(
      await screen.findByText(d.hiddenTargetWarning("Аудіоаксесуари", 15, 1)),
    ).toBeInTheDocument();

    await user.click(confirm());
    await waitFor(() => expect(onDeleted).toHaveBeenCalled());
    expect(bodies).toEqual([
      { moveToId: AUDIO },
      { moveToId: AUDIO, allowHiddenTarget: true },
    ]);
  });

  it("trusts the 409 until the re-read tree says otherwise — the warning shows at once", async () => {
    const user = userEvent.setup();
    let refusals = 0;
    stub({
      respond: () => {
        if (refusals > 0)
          return deleted({ targetId: AUDIO, movedProducts: 15 });
        refusals += 1;
        return HttpResponse.json(
          {
            statusCode: 409,
            error: "CATEGORY_MOVE_TARGET_HIDDEN",
            message: "hidden",
          },
          { status: 409 },
        );
      },
    });
    // The tree keeps answering «shown» (the re-read raced the hide).
    const { onDeleted } = renderDialog();
    await ready();
    await pickTarget(user, "Аудіоаксесуари");

    await user.click(confirm());
    expect(await screen.findByRole("alert")).toHaveTextContent(
      d.errorTargetHidden("Аудіоаксесуари"),
    );
    expect(
      await screen.findByText(d.hiddenTargetWarning("Аудіоаксесуари", 15, 1)),
    ).toBeInTheDocument();

    await user.click(confirm());
    await waitFor(() => expect(onDeleted).toHaveBeenCalled());
    expect(bodies).toEqual([
      { moveToId: AUDIO },
      { moveToId: AUDIO, allowHiddenTarget: true },
    ]);
  });

  it("«Створити нову» under a hidden parent: a light note, products stay, no consent", async () => {
    const user = userEvent.setup();
    stub();
    serveTree(() => treeHiding([ACC]));
    const { onDeleted } = renderDialog();
    await ready();

    await user.click(screen.getByRole("radio", { name: d.modeNew }));
    await user.type(
      screen.getByRole("textbox", { name: /Назва нової/ }),
      "Аудіо",
    );
    await user.click(screen.getByRole("combobox", { name: d.newParent }));
    const listbox = await screen.findByRole("listbox");
    // The hidden parent is offered, and marked; the visible child is not.
    expect(
      within(listbox).getByRole("option", { name: "Аудіоаксесуари" }),
    ).toBeInTheDocument();
    await user.click(
      within(listbox).getByRole("option", { name: /^Аксесуари\s*прихована$/ }),
    );

    expect(
      screen.getByText(d.newParentHiddenNote("Аксесуари")),
    ).toBeInTheDocument();
    // Its products stay on the site: no hidden-target warning, the usual promise.
    expect(
      screen.queryByText(/прихована: після переїзду/),
    ).not.toBeInTheDocument();
    expect(screen.getByText(d.productsSub)).toBeInTheDocument();

    await user.click(confirm());
    await waitFor(() => expect(onDeleted).toHaveBeenCalled());
    expect(bodies).toEqual([{ moveToNew: { name: "Аудіо", parentId: ACC } }]);
  });

  it("names the hidden ANCESTOR when the parent itself is shown", async () => {
    const user = userEvent.setup();
    stub();
    serveTree(() => treeHiding([ACC]));
    renderDialog();
    await ready();

    await user.click(screen.getByRole("radio", { name: d.modeNew }));
    await user.click(screen.getByRole("combobox", { name: d.newParent }));
    await user.click(
      within(await screen.findByRole("listbox")).getByRole("option", {
        name: "Аудіоаксесуари",
      }),
    );

    expect(
      screen.getByText(d.newParentHiddenNote("Аксесуари")),
    ).toBeInTheDocument();
  });
});

describe("CategoryDeleteDialog — refusals keep the choice (ДН-2.8)", () => {
  const cases: [string, number, string, string][] = [
    [
      "target in subtree",
      400,
      "CATEGORY_MOVE_TARGET_IN_SUBTREE",
      d.errorInSubtree,
    ],
    ["target gone", 404, "CATEGORY_MOVE_TARGET_NOT_FOUND", d.errorTargetGone],
    ["tree stale", 409, "CATEGORY_TREE_STALE", d.errorTreeStale],
    ["forbidden", 403, "Forbidden", d.errorForbidden],
    [
      "target required",
      400,
      "CATEGORY_MOVE_TARGET_REQUIRED",
      d.errorTargetRequired,
    ],
    // An uncoded 404 is the category itself: someone deleted it first.
    ["category itself gone", 404, "Not Found", d.goneError],
    ["anything else", 500, "Internal Server Error", d.errorGeneric],
  ];

  /** Answer every DELETE with this refusal. */
  const refuse = (status: number, code: string) => () =>
    HttpResponse.json(
      { statusCode: status, error: code, message: "refused" },
      { status },
    );

  it.each([
    ["409 tree stale", 409, "CATEGORY_TREE_STALE", d.errorTreeStale],
    [
      "400 target required",
      400,
      "CATEGORY_MOVE_TARGET_REQUIRED",
      d.errorTargetRequired,
    ],
  ] as const)(
    "%s re-reads the tree and the numbers, keeping the operator's choice",
    async (_label, status, code, text) => {
      const user = userEvent.setup();
      stub({ respond: refuse(status, code) });
      renderDialog();
      await ready();
      await pickTarget(user, "Аудіоаксесуари");
      const before = { tree: treeGets, detail: detailGets };

      await user.click(
        screen.getByRole("button", { name: "Видалити й перенести 15 товарів" }),
      );

      expect(await screen.findByRole("alert")).toHaveTextContent(text);
      await waitFor(() => {
        expect(treeGets).toBeGreaterThan(before.tree);
        expect(detailGets).toBeGreaterThan(before.detail);
      });
      // The refetch landed and nothing was reset under the operator.
      expect(targetBox()).toHaveValue(AUDIO_PATH);
      expect(screen.getByRole("alert")).toHaveTextContent(text);
      expect(screen.getByRole("radio", { name: d.modeExisting })).toBeChecked();
    },
  );

  it("a refusal that cannot be stale does not re-read anything", async () => {
    const user = userEvent.setup();
    stub({ respond: refuse(403, "Forbidden") });
    renderDialog();
    await ready();
    await pickTarget(user, "Аудіоаксесуари");
    const before = { tree: treeGets, detail: detailGets };

    await user.click(
      screen.getByRole("button", { name: "Видалити й перенести 15 товарів" }),
    );
    await screen.findByRole("alert");
    expect({ tree: treeGets, detail: detailGets }).toEqual(before);
  });

  it("404 in «Створити нову» says the chosen PARENT is gone, keeping the name", async () => {
    const user = userEvent.setup();
    stub({ respond: refuse(404, "CATEGORY_MOVE_TARGET_NOT_FOUND") });
    renderDialog();
    await ready();
    await user.click(screen.getByRole("radio", { name: d.modeNew }));
    await user.type(
      screen.getByRole("textbox", { name: /Назва нової/ }),
      "Аудіо",
    );
    await user.click(screen.getByRole("combobox", { name: d.newParent }));
    await user.click(
      within(await screen.findByRole("listbox")).getByRole("option", {
        name: "Аксесуари",
      }),
    );
    await user.click(
      screen.getByRole("button", { name: "Видалити й перенести 15 товарів" }),
    );

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(d.errorTitle);
    expect(alert).toHaveTextContent(d.errorParentGone);
    expect(alert).not.toHaveTextContent(d.errorTargetGone);
    expect(screen.getByRole("textbox", { name: /Назва нової/ })).toHaveValue(
      "Аудіо",
    );
    expect(screen.getByRole("radio", { name: d.modeNew })).toBeChecked();
  });

  it.each(cases)("%s → its own text", async (_label, status, code, text) => {
    const user = userEvent.setup();
    stub({
      respond: () =>
        HttpResponse.json(
          { statusCode: status, error: code, message: "refused" },
          { status },
        ),
    });
    const { onDeleted } = renderDialog();
    await ready();
    await pickTarget(user, "Аудіоаксесуари");
    await user.click(
      screen.getByRole("button", { name: "Видалити й перенести 15 товарів" }),
    );

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(d.errorTitle);
    expect(alert).toHaveTextContent(text);
    expect(onDeleted).not.toHaveBeenCalled();
    expect(successToast).not.toHaveBeenCalled();
    // Still open, the choice untouched.
    expect(dialog()).toBeInTheDocument();
    await waitFor(() => expect(targetBox()).toHaveValue(AUDIO_PATH));
  });

  it("409 slug conflict names the address and keeps the typed name", async () => {
    const user = userEvent.setup();
    stub({
      respond: () =>
        HttpResponse.json(
          {
            statusCode: 409,
            error: "CATEGORY_SLUG_CONFLICT",
            message: "taken",
          },
          { status: 409 },
        ),
    });
    renderDialog();
    await ready();
    await user.click(screen.getByRole("radio", { name: d.modeNew }));
    await user.type(
      screen.getByRole("textbox", { name: /Назва нової/ }),
      "Аудіо",
    );
    await user.click(
      screen.getByRole("button", { name: "Видалити й перенести 15 товарів" }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      d.errorSlugConflict("audio"),
    );
    expect(screen.getByRole("textbox", { name: /Назва нової/ })).toHaveValue(
      "Аудіо",
    );
  });

  it("403 in «Створити нову» says the write permission is missing", async () => {
    const user = userEvent.setup();
    stub({
      respond: () =>
        HttpResponse.json(
          { statusCode: 403, error: "Forbidden", message: "no" },
          { status: 403 },
        ),
    });
    renderDialog();
    await ready();
    await user.click(screen.getByRole("radio", { name: d.modeNew }));
    await user.type(
      screen.getByRole("textbox", { name: /Назва нової/ }),
      "Аудіо",
    );
    await user.click(
      screen.getByRole("button", { name: "Видалити й перенести 15 товарів" }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      d.errorForbiddenNew,
    );
  });
});
