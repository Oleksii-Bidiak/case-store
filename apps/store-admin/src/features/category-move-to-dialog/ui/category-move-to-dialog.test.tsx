import { http, HttpResponse } from "msw";
import {
  renderWithProviders,
  screen,
  userEvent,
  waitFor,
} from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { dict } from "@/shared/config";
import { CategoryMoveToDialog } from "./category-move-to-dialog";

const ROOT_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CHILD_A1 = "a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1";
const GRAND_A11 = "a2a2a2a2-a2a2-4a2a-8a2a-a2a2a2a2a2a2";
const ROOT_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

interface TreeNode {
  id: string;
  name: string;
  slug: string;
  description: null;
  image: null;
  isActive: boolean;
  sortOrder: number;
  metaTitle: null;
  metaDescription: null;
  updatedAt: string;
  children: TreeNode[];
  parentId: string | null;
  productCount: number;
  depth: number;
}

function node(
  id: string,
  name: string,
  parentId: string | null,
  depth: number,
  children: TreeNode[] = [],
): TreeNode {
  return {
    id,
    name,
    slug: name.toLowerCase(),
    description: null,
    image: null,
    isActive: true,
    sortOrder: 0,
    metaTitle: null,
    metaDescription: null,
    updatedAt: "2026-07-01T00:00:00.000Z",
    children,
    parentId,
    productCount: 0,
    depth,
  };
}

/**  Alpha ▸ Alpha-Child ▸ Alpha-Grandchild ;  Beta  */
const TREE = [
  node(ROOT_A, "Alpha", null, 1, [
    node(CHILD_A1, "AlphaChild", ROOT_A, 2, [
      node(GRAND_A11, "AlphaGrandchild", CHILD_A1, 3),
    ]),
  ]),
  node(ROOT_B, "Beta", null, 1),
];

function stubTree() {
  server.use(
    http.get("*/api/categories/admin/tree", () =>
      HttpResponse.json({ data: TREE }),
    ),
  );
}

const d = dict.categories.tree.moveDialog;

describe("CategoryMoveToDialog (TASK-291-I)", () => {
  it("excludes SELF and ALL DESCENDANTS from the parent options", async () => {
    stubTree();
    renderWithProviders(
      <CategoryMoveToDialog
        categoryId={ROOT_A}
        onOpenChange={jest.fn()}
        onMove={jest.fn()}
      />,
    );

    await userEvent.click(
      await screen.findByRole("combobox", { name: d.parentLabel }),
    );

    // Root is always offered; Beta is a legal destination.
    expect(
      await screen.findByRole("option", { name: d.rootOption }),
    ).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Beta" })).toBeInTheDocument();

    // SELF and both DESCENDANTS are absent — this is the exclusion the
    // 100-row-capped flat list used to under-compute (§3.11).
    expect(screen.queryByRole("option", { name: "Alpha" })).toBeNull();
    expect(screen.queryByRole("option", { name: "AlphaChild" })).toBeNull();
    expect(
      screen.queryByRole("option", { name: "AlphaGrandchild" }),
    ).toBeNull();
  });

  it("submits through the shared reducer: the moved node lands in the chosen bucket at the chosen slot", async () => {
    stubTree();
    const onMove = jest.fn();
    const onOpenChange = jest.fn();

    renderWithProviders(
      <CategoryMoveToDialog
        categoryId={GRAND_A11}
        onOpenChange={onOpenChange}
        onMove={onMove}
      />,
    );

    await userEvent.click(
      await screen.findByRole("combobox", { name: d.parentLabel }),
    );
    await userEvent.click(await screen.findByRole("option", { name: "Beta" }));

    await userEvent.click(screen.getByRole("button", { name: d.submit }));

    await waitFor(() => expect(onMove).toHaveBeenCalledTimes(1));
    const [next, movingId, options] = onMove.mock.calls[0];
    expect(movingId).toBe(GRAND_A11);
    // §7.5 — focus lands on the MOVED ROW, not the trigger.
    expect(options).toEqual({ focusOnSuccess: true });
    expect(next.find((i: { id: string }) => i.id === GRAND_A11).parentId).toBe(
      ROOT_B,
    );
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
