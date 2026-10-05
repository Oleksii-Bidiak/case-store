/**
 * `AddonServiceTable` — the add-on services registry (TASK-174; toolbar in
 * TASK-357; the DataRegistry, views, «⋯», per-row pending and the form dialog
 * of wave 198 — AddonServicesProposal ДП1–ДП10, TASK-1083).
 *
 * Most cases assert on the REQUEST rather than on the rendered response,
 * because every bug this table can have (a wrong page size, a dropped filter, a
 * search that never leaves the browser) shows up there first. The quick-view
 * counters are one-row requests (`limit=1`), so the list request is picked out
 * of the recorded ones by its page size.
 */

import { http, HttpResponse, delay } from "msw";
import {
  renderWithProviders,
  screen,
  userEvent,
  waitFor,
  within,
} from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { dict } from "@/shared/config";
import { AddonServiceTable } from "./addon-service-table";

const d = dict.addonServices;
const f = dict.addonServiceForm;

const mockReplace = jest.fn();
let mockSearchParams = new URLSearchParams("");
jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockReplace, push: jest.fn() }),
  usePathname: () => "/addon-services",
  useSearchParams: () => mockSearchParams,
}));

beforeEach(() => {
  mockReplace.mockClear();
  mockSearchParams = new URLSearchParams("");
});

const OWNER = { auth: { isOwner: true } };

function makeServiceRow(
  id: string,
  name: string,
  isActive = true,
  extra: { price?: string; description?: string | null } = {},
) {
  return {
    id,
    name,
    description: extra.description ?? null,
    price: extra.price ?? "199.00",
    isActive,
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
  };
}

type Row = ReturnType<typeof makeServiceRow>;

/**
 * Stub the list and hand back the recorded request URLs. A `limit=1` request
 * is a quick-view counter: it answers with `meta.total` for its status.
 */
function stubServices(
  rows: Row[],
  meta?: { total: number; page: number; limit: number; totalPages: number },
) {
  const requests: URL[] = [];
  server.use(
    http.get("*/api/addon-services/admin/list", ({ request }) => {
      const url = new URL(request.url);
      requests.push(url);
      if (url.searchParams.get("limit") === "1") {
        const isActive = url.searchParams.get("isActive");
        const total =
          isActive === null
            ? rows.length
            : rows.filter((row) => String(row.isActive) === isActive).length;
        return HttpResponse.json({
          data: rows.slice(0, 1),
          meta: { total, page: 1, limit: 1, totalPages: total },
        });
      }
      return HttpResponse.json({
        data: rows,
        meta: meta ?? { total: rows.length, page: 1, limit: 20, totalPages: 1 },
      });
    }),
  );
  return requests;
}

/** The list request(s) — everything but the `limit=1` counters. */
const listRequests = (requests: URL[]) =>
  requests.filter((url) => url.searchParams.get("limit") !== "1");

const actionsOf = (name: string) =>
  screen.getByRole("button", {
    name: dict.common.registry.rowActionsAria(name),
  });

describe("AddonServiceTable", () => {
  it("renders the name over the first description line, the price in hryvnia and the canon status", async () => {
    stubServices([
      makeServiceRow("s1", "Гарантія 2 роки", true, {
        price: "499.00",
        description: "Продовжена гарантія.\nДругий рядок не показуємо.",
      }),
      makeServiceRow("s2", "Trade-in оцінка", false, { price: "0.00" }),
    ]);

    renderWithProviders(<AddonServiceTable />, OWNER);

    expect(await screen.findByText("Гарантія 2 роки")).toBeInTheDocument();
    expect(screen.getByText("Продовжена гарантія.")).toBeInTheDocument();
    expect(
      screen.queryByText(/Другий рядок не показуємо/),
    ).not.toBeInTheDocument();
    // «499 ₴», not the API's raw «499.00»; 0 reads «Безкоштовно».
    expect(screen.getByText("499 ₴")).toBeInTheDocument();
    expect(screen.queryByText("499.00")).not.toBeInTheDocument();
    expect(screen.getByText(d.free)).toBeInTheDocument();
    expect(screen.getByText(d.statusActive)).toBeInTheDocument();
    expect(screen.getByText(d.statusInactive)).toBeInTheDocument();
    expect(d.statusActive).toBe("Показується");
    expect(d.statusInactive).toBe("Приховано");
  });

  it("shows the empty state when there are no services", async () => {
    stubServices([]);

    renderWithProviders(<AddonServiceTable />, OWNER);

    expect(await screen.findByText(d.empty)).toBeInTheDocument();
  });

  it("shows an error message when the request fails", async () => {
    server.use(
      http.get("*/api/addon-services/admin/list", () =>
        HttpResponse.json({ message: "boom" }, { status: 500 }),
      ),
    );

    renderWithProviders(<AddonServiceTable />, OWNER);

    expect(await screen.findByText(d.loadError)).toBeInTheDocument();
  });

  describe("header, views and toolbar", () => {
    it("states what a service is and keeps «Додати послугу» for addons:write", async () => {
      stubServices([makeServiceRow("s1", "Гарантія 2 роки")]);

      renderWithProviders(<AddonServiceTable />, OWNER);
      await screen.findByText("Гарантія 2 роки");

      expect(
        screen.getByRole("heading", { name: d.heading }),
      ).toBeInTheDocument();
      expect(screen.getByText(d.intro)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: d.add })).toBeInTheDocument();
    });

    it("replaces the status select with «Усі · Показуються · Приховані» carrying the API's counts", async () => {
      stubServices([
        makeServiceRow("s1", "Гарантія 2 роки"),
        makeServiceRow("s2", "Наклеювання плівки"),
        makeServiceRow("s3", "Trade-in", false),
      ]);

      renderWithProviders(<AddonServiceTable />, OWNER);
      await screen.findByText("Гарантія 2 роки");

      const views = screen.getByRole("tablist");
      await waitFor(() =>
        expect(
          within(views).getByRole("tab", { name: new RegExp(d.viewAll) }),
        ).toHaveTextContent("3"),
      );
      expect(
        within(views).getByRole("tab", { name: new RegExp(d.viewShown) }),
      ).toHaveTextContent("2");
      expect(
        within(views).getByRole("tab", { name: new RegExp(d.viewHidden) }),
      ).toHaveTextContent("1");

      await userEvent.click(
        within(views).getByRole("tab", { name: new RegExp(d.viewHidden) }),
      );
      // The same `?status=` param the old select wrote.
      expect(mockReplace).toHaveBeenCalledWith(
        "/addon-services?status=inactive",
      );
    });

    it("refetches on demand — the point of the refresh control", async () => {
      const requests = stubServices([makeServiceRow("s1", "Гарантія 2 роки")]);

      renderWithProviders(<AddonServiceTable />, OWNER);
      await screen.findByText("Гарантія 2 роки");
      await waitFor(() => expect(listRequests(requests)).toHaveLength(1));

      await userEvent.click(
        screen.getByRole("button", { name: dict.common.table.refreshAria }),
      );

      await waitFor(() => expect(listRequests(requests)).toHaveLength(2));
    });

    it("keeps the search box reachable", async () => {
      stubServices([makeServiceRow("s1", "Гарантія 2 роки")]);

      renderWithProviders(<AddonServiceTable />, OWNER);
      await screen.findByText("Гарантія 2 роки");

      expect(screen.getByLabelText(d.searchAria)).toBeInTheDocument();
    });
  });

  describe("what the table asks the server for", () => {
    it("requests a real page size rather than an unbounded slab", async () => {
      const requests = stubServices([makeServiceRow("s1", "Гарантія 2 роки")]);

      renderWithProviders(<AddonServiceTable />, OWNER);
      await screen.findByText("Гарантія 2 роки");

      const [list] = listRequests(requests);
      expect(list.searchParams.get("page")).toBe("1");
      expect(list.searchParams.get("limit")).toBe("20");
    });

    it("forwards the URL search and the status view to the server", async () => {
      mockSearchParams = new URLSearchParams("search=гарант&status=inactive");
      const requests = stubServices([
        makeServiceRow("s1", "Гарантія 2 роки", false),
      ]);

      renderWithProviders(<AddonServiceTable />, OWNER);
      await screen.findByText("Гарантія 2 роки");

      const [list] = listRequests(requests);
      expect(list.searchParams.get("search")).toBe("гарант");
      expect(list.searchParams.get("isActive")).toBe("false");
      expect(
        screen.getByRole("tab", { name: new RegExp(d.viewHidden) }),
      ).toHaveAttribute("aria-selected", "true");
    });

    it("omits isActive entirely on «Усі»", async () => {
      const requests = stubServices([makeServiceRow("s1", "Гарантія 2 роки")]);

      renderWithProviders(<AddonServiceTable />, OWNER);
      await screen.findByText("Гарантія 2 роки");

      expect(listRequests(requests)[0].searchParams.has("isActive")).toBe(
        false,
      );
    });

    it("shows a reachable control past the page boundary and pages forward", async () => {
      stubServices([makeServiceRow("s1", "Гарантія 2 роки")], {
        total: 140,
        page: 1,
        limit: 20,
        totalPages: 7,
      });

      renderWithProviders(<AddonServiceTable />, OWNER);
      await screen.findByText("Гарантія 2 роки");

      expect(screen.getByText(dict.common.pageOf(1, 7))).toBeInTheDocument();
      const next = screen.getByRole("button", { name: dict.common.next });
      expect(next).toBeEnabled();

      await userEvent.click(next);

      expect(mockReplace).toHaveBeenCalledWith("/addon-services?page=2");
    });

    it("reads the current page from the URL", async () => {
      mockSearchParams = new URLSearchParams("page=3");
      const requests = stubServices([makeServiceRow("s1", "Гарантія 2 роки")], {
        total: 140,
        page: 3,
        limit: 20,
        totalPages: 7,
      });

      renderWithProviders(<AddonServiceTable />, OWNER);
      await screen.findByText("Гарантія 2 роки");

      expect(listRequests(requests)[0].searchParams.get("page")).toBe("3");
    });
  });

  describe("«⋯» and hiding (ДП1, ДП2, ДП8)", () => {
    it("offers «Редагувати» and «Приховати з кошика…» on a shown service, «Показати в кошику» on a hidden one", async () => {
      stubServices([
        makeServiceRow("s1", "Гарантія 2 роки"),
        makeServiceRow("s2", "Trade-in", false),
      ]);

      renderWithProviders(<AddonServiceTable />, OWNER);
      await screen.findByText("Гарантія 2 роки");

      await userEvent.click(actionsOf("Гарантія 2 роки"));
      expect(
        screen.getByRole("menuitem", { name: dict.common.edit }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("menuitem", { name: d.hideFromCart }),
      ).toBeInTheDocument();
      await userEvent.keyboard("{Escape}");

      await userEvent.click(actionsOf("Trade-in"));
      expect(
        screen.getByRole("menuitem", { name: d.activate }),
      ).toBeInTheDocument();
    });

    it("asks before hiding, then hides THAT service — and only its row waits", async () => {
      stubServices([
        makeServiceRow("s1", "Гарантія 2 роки"),
        makeServiceRow("s2", "Наклеювання плівки"),
      ]);
      const bodies: Array<{ id: string; body: unknown }> = [];
      server.use(
        http.patch(
          "*/api/addon-services/:id/status",
          async ({ request, params }) => {
            bodies.push({ id: String(params.id), body: await request.json() });
            await delay("infinite");
            return HttpResponse.json({});
          },
        ),
      );

      renderWithProviders(<AddonServiceTable />, OWNER);
      await screen.findByText("Гарантія 2 роки");

      await userEvent.click(actionsOf("Гарантія 2 роки"));
      await userEvent.click(
        screen.getByRole("menuitem", { name: d.hideFromCart }),
      );

      const dialog = await screen.findByRole("alertdialog");
      expect(
        within(dialog).getByText(d.hideTitle("Гарантія 2 роки")),
      ).toBeInTheDocument();
      expect(within(dialog).getByText(d.hideBody)).toBeInTheDocument();
      await userEvent.click(
        within(dialog).getByRole("button", { name: d.deactivate }),
      );

      await waitFor(() =>
        expect(bodies).toEqual([{ id: "s1", body: { isActive: false } }]),
      );
      expect(await screen.findByText(d.statusHiding)).toBeInTheDocument();

      // The OTHER row stays usable while the first one is in flight.
      await userEvent.click(actionsOf("Наклеювання плівки"));
      expect(
        screen.getByRole("menuitem", { name: d.hideFromCart }),
      ).not.toHaveAttribute("aria-disabled", "true");
    });

    it("a cancelled confirmation sends nothing", async () => {
      stubServices([makeServiceRow("s1", "Гарантія 2 роки")]);
      const patch = jest.fn();
      server.use(
        http.patch("*/api/addon-services/:id/status", () => {
          patch();
          return HttpResponse.json({});
        }),
      );

      renderWithProviders(<AddonServiceTable />, OWNER);
      await screen.findByText("Гарантія 2 роки");

      await userEvent.click(actionsOf("Гарантія 2 роки"));
      await userEvent.click(
        screen.getByRole("menuitem", { name: d.hideFromCart }),
      );
      const dialog = await screen.findByRole("alertdialog");
      await userEvent.click(
        within(dialog).getByRole("button", { name: dict.common.cancel }),
      );

      expect(patch).not.toHaveBeenCalled();
    });

    it("shows a hidden service again without a confirmation", async () => {
      stubServices([makeServiceRow("s2", "Trade-in", false)]);
      const bodies: unknown[] = [];
      server.use(
        http.patch("*/api/addon-services/:id/status", async ({ request }) => {
          bodies.push(await request.json());
          return HttpResponse.json({ data: makeServiceRow("s2", "Trade-in") });
        }),
      );

      renderWithProviders(<AddonServiceTable />, OWNER);
      await screen.findByText("Trade-in");

      await userEvent.click(actionsOf("Trade-in"));
      await userEvent.click(screen.getByRole("menuitem", { name: d.activate }));

      await waitFor(() => expect(bodies).toEqual([{ isActive: true }]));
    });
  });

  describe("the form dialog (ДП4–ДП7)", () => {
    it("«Додати послугу» opens «Нова послуга» over the list and creates", async () => {
      stubServices([makeServiceRow("s1", "Гарантія 2 роки")]);
      const bodies: unknown[] = [];
      server.use(
        http.post("*/api/addon-services", async ({ request }) => {
          bodies.push(await request.json());
          return HttpResponse.json(
            { data: makeServiceRow("s9", "Наклеювання скла") },
            { status: 201 },
          );
        }),
      );

      renderWithProviders(<AddonServiceTable />, OWNER);
      await screen.findByText("Гарантія 2 роки");

      await userEvent.click(screen.getByRole("button", { name: d.add }));
      const dialog = await screen.findByRole("dialog");
      expect(
        within(dialog).getByRole("heading", { name: d.createHeading }),
      ).toBeInTheDocument();

      await userEvent.type(
        within(dialog).getByRole("textbox", { name: f.name }),
        "Наклеювання скла",
      );
      await userEvent.type(
        within(dialog).getByRole("textbox", { name: f.price }),
        "199",
      );
      await userEvent.click(
        within(dialog).getByRole("button", { name: d.createSubmit }),
      );

      await waitFor(() =>
        expect(bodies).toEqual([
          expect.objectContaining({
            name: "Наклеювання скла",
            price: 199,
            isActive: true,
          }),
        ]),
      );
      await waitFor(() =>
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
      );
    });

    it("«⋯ → Редагувати» opens the service's dialog, titled by its name, and saves", async () => {
      stubServices([
        makeServiceRow("s1", "Гарантія 2 роки", true, { price: "499.00" }),
      ]);
      const bodies: Array<{ id: string; body: unknown }> = [];
      server.use(
        http.patch("*/api/addon-services/:id", async ({ request, params }) => {
          bodies.push({ id: String(params.id), body: await request.json() });
          return HttpResponse.json({
            data: makeServiceRow("s1", "Гарантія 3 роки"),
          });
        }),
      );

      renderWithProviders(<AddonServiceTable />, OWNER);
      await screen.findByText("Гарантія 2 роки");

      await userEvent.click(actionsOf("Гарантія 2 роки"));
      await userEvent.click(
        screen.getByRole("menuitem", { name: dict.common.edit }),
      );

      const dialog = await screen.findByRole("dialog");
      expect(
        within(dialog).getByRole("heading", { name: "Гарантія 2 роки" }),
      ).toBeInTheDocument();
      expect(
        within(dialog).getByRole("textbox", { name: f.price }),
      ).toHaveValue("499");

      const name = within(dialog).getByRole("textbox", { name: f.name });
      await userEvent.clear(name);
      await userEvent.type(name, "Гарантія 3 роки");
      await userEvent.click(
        within(dialog).getByRole("button", { name: f.submit }),
      );

      await waitFor(() =>
        expect(bodies).toEqual([
          {
            id: "s1",
            body: expect.objectContaining({
              name: "Гарантія 3 роки",
              price: 499,
            }),
          },
        ]),
      );
    });

    it("the `/addon-services/new` deep link opens the create dialog; closing it returns to the list", async () => {
      stubServices([makeServiceRow("s1", "Гарантія 2 роки")]);

      renderWithProviders(
        <AddonServiceTable dialog={{ mode: "create" }} />,
        OWNER,
      );

      const dialog = await screen.findByRole("dialog");
      expect(
        within(dialog).getByRole("heading", { name: d.createHeading }),
      ).toBeInTheDocument();

      await userEvent.click(
        within(dialog).getByRole("button", { name: dict.common.cancel }),
      );
      expect(mockReplace).toHaveBeenCalledWith("/addon-services");
    });

    it("the `/[id]/edit` deep link loads a service that is not on this page", async () => {
      // `admin/:id` would also match `admin/list`; the list stub goes on LAST
      // so it is consulted first.
      server.use(
        http.get("*/api/addon-services/admin/:id", ({ params }) =>
          params.id === "s7"
            ? HttpResponse.json({
                data: makeServiceRow("s7", "Страхування", true, {
                  price: "899.00",
                }),
              })
            : HttpResponse.json({ message: "nope" }, { status: 404 }),
        ),
      );
      stubServices([makeServiceRow("s1", "Гарантія 2 роки")]);

      renderWithProviders(
        <AddonServiceTable dialog={{ mode: "edit", id: "s7" }} />,
        OWNER,
      );

      const dialog = await screen.findByRole("dialog");
      expect(
        await within(dialog).findByRole("heading", { name: "Страхування" }),
      ).toBeInTheDocument();
      expect(
        within(dialog).getByRole("textbox", { name: f.price }),
      ).toHaveValue("899");
    });

    it("an unknown id says so and returns to the list", async () => {
      server.use(
        http.get("*/api/addon-services/admin/:id", () =>
          HttpResponse.json({ message: "nope" }, { status: 404 }),
        ),
      );
      stubServices([makeServiceRow("s1", "Гарантія 2 роки")]);

      renderWithProviders(
        <AddonServiceTable dialog={{ mode: "edit", id: "gone" }} />,
        OWNER,
      );

      await waitFor(() =>
        expect(mockReplace).toHaveBeenCalledWith("/addon-services"),
      );
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });

  describe("view only (ДП9)", () => {
    it("without addons:write: no «Додати послугу», a view-only strip, «⋯ → Переглянути» only", async () => {
      stubServices([makeServiceRow("s1", "Гарантія 2 роки")]);

      renderWithProviders(<AddonServiceTable />);
      await screen.findByText("Гарантія 2 роки");

      expect(
        screen.queryByRole("button", { name: d.add }),
      ).not.toBeInTheDocument();
      expect(screen.getByText(d.viewOnly)).toBeInTheDocument();

      await userEvent.click(actionsOf("Гарантія 2 роки"));
      expect(
        screen.getByRole("menuitem", { name: dict.common.view }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("menuitem", { name: d.hideFromCart }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("menuitem", { name: dict.common.edit }),
      ).not.toBeInTheDocument();
    });
  });
});
