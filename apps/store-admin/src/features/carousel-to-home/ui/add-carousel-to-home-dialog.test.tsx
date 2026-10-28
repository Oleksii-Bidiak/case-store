/**
 * «Додати на головну» (TASK-664, ДН-4.12): a new CAROUSEL block at a chosen place,
 * or the carousel appended as the last tab of a TABS block.
 */

import { http, HttpResponse } from "msw";
import {
  renderWithProviders,
  screen,
  userEvent,
  waitFor,
} from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { dict } from "@/shared/config";
import { toast } from "@/shared/ui/toast";
import { AddCarouselToHomeDialog } from "./add-carousel-to-home-dialog";

jest.mock("@/shared/ui/toast", () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}));

const t = dict.carouselToHome;
const h = dict.homeBlocks;

const summary = (id: string, title: string) => ({
  id,
  title,
  source: "NEWEST",
  status: "PUBLISHED",
});

function block(id: string, sortOrder: number, extra: object = {}) {
  return {
    id,
    type: "HERO",
    title: null,
    sortOrder,
    status: "PUBLISHED",
    carousel: null,
    tabs: [],
    isSystem: true,
    isOrphaned: false,
    isEmpty: false,
    createdAt: "",
    updatedAt: "",
    ...extra,
  };
}

const WITH_TABS = [
  block("hero", 0),
  block("popular", 1, {
    type: "TABS",
    title: "Популярне",
    isSystem: false,
    tabs: [
      { sortOrder: 0, carousel: summary("hits", "Хіти") },
      { sortOrder: 1, carousel: summary("new", "Новинки") },
    ],
  }),
  block("rail", 2, {
    type: "CAROUSEL",
    isSystem: false,
    carousel: summary("picks", "Редакція обирає"),
  }),
  block("news", 3, { type: "NEWSLETTER" }),
];

const SALE = {
  id: "sale",
  title: "Знижки до −40%",
  status: "PUBLISHED" as const,
};

let posted: unknown[] = [];
let put: { id: string; body: unknown }[] = [];

function stub(blocks: unknown[] = WITH_TABS) {
  server.use(
    http.get("*/api/admin/home-blocks", () =>
      HttpResponse.json({ data: blocks }),
    ),
    http.post("*/api/admin/home-blocks", async ({ request }) => {
      posted.push(await request.json());
      return HttpResponse.json({ data: block("created", 3) }, { status: 201 });
    }),
    http.put("*/api/admin/home-blocks/:id", async ({ params, request }) => {
      put.push({ id: String(params.id), body: await request.json() });
      return HttpResponse.json({ data: WITH_TABS[1] });
    }),
  );
}

beforeEach(() => {
  posted = [];
  put = [];
  jest.clearAllMocks();
});

function renderDialog(
  carousel: Parameters<typeof AddCarouselToHomeDialog>[0]["carousel"] = SALE,
) {
  const onOpenChange = jest.fn();
  renderWithProviders(
    <AddCarouselToHomeDialog carousel={carousel} onOpenChange={onOpenChange} />,
    { auth: { permissions: ["home:write"] } },
  );
  return { onOpenChange };
}

describe("AddCarouselToHomeDialog", () => {
  it("creates a live CAROUSEL block right after the last carousel block by default", async () => {
    stub();
    const { onOpenChange } = renderDialog();

    expect(
      screen.getByRole("dialog", { name: t.title(SALE.title) }),
    ).toBeInTheDocument();
    const select = await screen.findByLabelText(t.positionLabel);
    expect(select).toHaveDisplayValue(t.positionAfter("Редакція обирає"));

    await userEvent.click(screen.getByRole("button", { name: t.submit }));

    await waitFor(() => expect(posted).toHaveLength(1));
    expect(posted[0]).toEqual({
      type: "CAROUSEL",
      carouselId: "sale",
      status: "PUBLISHED",
      position: 3,
    });
    expect(toast.success).toHaveBeenCalledWith(t.toastAdded(SALE.title));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("puts the block where the operator says", async () => {
    stub();
    renderDialog();

    await userEvent.selectOptions(
      await screen.findByLabelText(t.positionLabel),
      t.positionAfter(h.hero),
    );
    await userEvent.click(screen.getByRole("button", { name: t.submit }));

    await waitFor(() => expect(posted).toHaveLength(1));
    expect(posted[0]).toMatchObject({ position: 1 });
  });

  it("appends the carousel as the LAST tab, sending the complete tab list", async () => {
    stub();
    renderDialog();

    await userEvent.click(await screen.findByRole("radio", { name: t.asTab }));
    expect(screen.getByLabelText(t.tabBlockLabel)).toHaveDisplayValue(
      "Популярне",
    );
    await userEvent.click(screen.getByRole("button", { name: t.submit }));

    await waitFor(() => expect(put).toHaveLength(1));
    expect(put[0]).toEqual({
      id: "popular",
      body: { tabs: ["hits", "new", "sale"] },
    });
    expect(posted).toEqual([]);
  });

  it("disables «Вкладкою в блоці» when the page has no TABS block", async () => {
    stub([block("hero", 0)]);
    renderDialog();

    const tab = await screen.findByRole("radio", { name: t.asTab });
    expect(tab).toBeDisabled();
    expect(screen.getByText(t.asTabNone)).toBeInTheDocument();
  });

  it("warns that a draft carousel will not be seen until it is published", async () => {
    stub();
    renderDialog({ ...SALE, status: "DRAFT" });

    expect(await screen.findByText(t.notPublished)).toBeInTheDocument();
  });

  it("says so when the write fails, and stays open", async () => {
    stub();
    server.use(
      http.post(
        "*/api/admin/home-blocks",
        () => new HttpResponse(null, { status: 500 }),
      ),
    );
    const { onOpenChange } = renderDialog();

    await screen.findByLabelText(t.positionLabel);
    await userEvent.click(screen.getByRole("button", { name: t.submit }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(t.toastFailed),
    );
    expect(onOpenChange).not.toHaveBeenCalled();
  });
});
