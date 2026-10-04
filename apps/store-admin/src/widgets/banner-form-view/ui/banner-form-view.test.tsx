/**
 * The banner create / edit pages (BannersProposal БН5, БН8; wave 198,
 * TASK-1073): «Додати сюди» lands in its placement; the edit page names the
 * banner, its display state and window, and keeps «Дублювати» / «Видалити…» in
 * its «⋯».
 */
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
import { CreateBannerView } from "./create-banner-view";
import { EditBannerView } from "./edit-banner-view";

const push = jest.fn();
const replace = jest.fn();
let mockSearchParams = new URLSearchParams("");
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace }),
  useSearchParams: () => mockSearchParams,
}));

beforeEach(() => {
  push.mockReset();
  replace.mockReset();
  mockSearchParams = new URLSearchParams("");
});

const d = dict.banners;
const ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const banner = {
  id: ID,
  placement: "HERO_SLIDE",
  title: "Аксесуари для вашого iPhone",
  subtitle: null,
  imageUrl: null,
  imageBlurDataUrl: null,
  ctaLabel: "До каталогу",
  ctaHref: "/products",
  theme: null,
  sortOrder: 0,
  status: "PUBLISHED",
  publishedAt: "2026-08-09T00:00:00.000Z",
  scheduledAt: null,
  scheduledUntil: null,
  createdAt: "2026-08-09T00:00:00.000Z",
  updatedAt: "2026-08-09T00:00:00.000Z",
};

describe("CreateBannerView", () => {
  it("preselects the placement «Додати сюди» asked for", () => {
    mockSearchParams = new URLSearchParams("placement=PROMO_BANNER");
    renderWithProviders(<CreateBannerView />);

    expect(
      screen.getByRole("heading", { name: d.createHeading }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("radio", {
        name: dict.bannerForm.placements.PROMO_BANNER,
      }),
    ).toBeChecked();
    expect(
      screen.getByRole("button", { name: d.createSubmit }),
    ).toBeInTheDocument();
  });

  it("ignores an unknown ?placement=", () => {
    mockSearchParams = new URLSearchParams("placement=NOPE");
    renderWithProviders(<CreateBannerView />);

    expect(
      screen.getByRole("radio", {
        name: dict.bannerForm.placements.HERO_SLIDE,
      }),
    ).toBeChecked();
  });
});

describe("EditBannerView", () => {
  beforeEach(() => {
    server.use(
      http.get("*/api/admin/banners/:id", () =>
        HttpResponse.json({ data: banner }),
      ),
    );
  });

  it("names the banner, its display state and where it shows", async () => {
    renderWithProviders(<EditBannerView bannerId={ID} />);

    expect(
      await screen.findByRole("heading", { name: banner.title }),
    ).toBeInTheDocument();
    expect(screen.getByText(d.displayStates.live)).toBeInTheDocument();
    expect(
      screen.getByText(`${d.placements.HERO_SLIDE} · ${d.windowEndless}`),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: dict.common.save }),
    ).toBeInTheDocument();
  });

  it("«Дублювати» creates a draft copy and opens it", async () => {
    const bodies: unknown[] = [];
    server.use(
      http.post("*/api/admin/banners", async ({ request }) => {
        bodies.push(await request.json());
        return HttpResponse.json({ data: { ...banner, id: "copy-1" } });
      }),
    );
    renderWithProviders(<EditBannerView bannerId={ID} />);

    await userEvent.click(
      await screen.findByRole("button", {
        name: dict.common.registry.rowActionsAria(banner.title),
      }),
    );
    await userEvent.click(
      await screen.findByRole("menuitem", { name: d.duplicate }),
    );

    await waitFor(() =>
      expect(push).toHaveBeenCalledWith("/banners/copy-1/edit"),
    );
    expect(bodies[0]).toMatchObject({
      title: d.duplicateTitle(banner.title),
      status: "DRAFT",
      placement: "HERO_SLIDE",
    });
  });

  it("«Видалити…» confirms in an AlertDialog, then returns to the list", async () => {
    const deleted: string[] = [];
    server.use(
      http.delete("*/api/admin/banners/:id", ({ params }) => {
        deleted.push(String(params.id));
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderWithProviders(<EditBannerView bannerId={ID} />);

    await userEvent.click(
      await screen.findByRole("button", {
        name: dict.common.registry.rowActionsAria(banner.title),
      }),
    );
    await userEvent.click(
      await screen.findByRole("menuitem", { name: d.deleteAction }),
    );
    const dialog = await screen.findByRole("alertdialog");
    expect(
      within(dialog).getByText(d.deleteTitle(banner.title)),
    ).toBeInTheDocument();
    await userEvent.click(
      within(dialog).getByRole("button", { name: d.deleteConfirmLabel }),
    );

    await waitFor(() => expect(deleted).toEqual([ID]));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/banners"));
  });
});
