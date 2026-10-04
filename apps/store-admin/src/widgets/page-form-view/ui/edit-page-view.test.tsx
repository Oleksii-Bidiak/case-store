import { http, HttpResponse } from "msw";
import {
  renderWithProviders,
  screen,
  userEvent,
  waitFor,
  within,
} from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { WithAuth } from "@/entities/session/model/auth-context.fixture";
import { PERM } from "@/entities/permission";
import { dict, STOREFRONT_URL } from "@/shared/config";
import { EditPageView } from "./edit-page-view";

// next/navigation is unavailable under jsdom — mock the router.
const mockPush = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace: jest.fn(), push: mockPush }),
}));

// The rich-text body editor (Tiptap) touches the DOM on init; stub it with a
// controlled <textarea> proxy (same idiom as page-form.test.tsx).
jest.mock("@/shared/ui/rich-text-editor", () => ({
  __esModule: true,
  RichTextEditor: ({
    value,
    onChange,
  }: {
    value: string;
    onChange: (html: string) => void;
  }) => (
    <textarea
      data-testid="rte-stub"
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  ),
}));

const toastError = jest.fn();
jest.mock("@/shared/ui/toast", () => ({
  toast: {
    success: jest.fn(),
    error: (...args: unknown[]) => toastError(...args),
  },
}));

const d = dict.pages;
const PAGE_ID = "page-uuid-1";

function makePage(
  status: "DRAFT" | "PUBLISHED" | "SCHEDULED",
  scheduledAt: string | null = null,
) {
  return {
    id: PAGE_ID,
    slug: "dostavka",
    kind: "LEGAL",
    title: "Доставка",
    content: "<p>Body</p>",
    excerpt: null,
    metaTitle: null,
    metaDescription: null,
    status,
    publishedAt: status === "PUBLISHED" ? "2026-06-01T09:00:00.000Z" : null,
    scheduledAt,
    isActive: status === "PUBLISHED",
    sortOrder: 0,
    createdAt: "2026-06-01T09:00:00.000Z",
    updatedAt: "2026-06-01T09:00:00.000Z",
  };
}

function stubPage(page: ReturnType<typeof makePage>) {
  const putCalls: unknown[] = [];
  server.use(
    http.get(`*/api/admin/pages/${PAGE_ID}`, () =>
      HttpResponse.json({ data: page }),
    ),
    http.put(`*/api/admin/pages/${PAGE_ID}`, async ({ request }) => {
      putCalls.push(await request.json());
      return HttpResponse.json({ data: page });
    }),
  );
  return putCalls;
}

const slugField = () => screen.getByLabelText(dict.pageForm.address);

async function renderAndWaitForForm(
  page: ReturnType<typeof makePage>,
  permissions?: string[],
) {
  const putCalls = stubPage(page);
  renderWithProviders(
    permissions ? (
      <WithAuth permissions={permissions}>
        <EditPageView pageId={PAGE_ID} />
      </WithAuth>
    ) : (
      <WithAuth isOwner>
        <EditPageView pageId={PAGE_ID} />
      </WithAuth>
    ),
  );
  await waitFor(() => expect(slugField()).toHaveValue(page.slug));
  return putCalls;
}

const submit = () =>
  userEvent.click(screen.getByRole("button", { name: dict.common.save }));

async function renameSlug(next: string) {
  await userEvent.clear(slugField());
  await userEvent.type(slugField(), next);
}

beforeEach(() => {
  mockPush.mockClear();
  toastError.mockClear();
});

/** PagesProposal СР8 — the header says what the page is and where it lives. */
describe("EditPageView — header", () => {
  it("names the page, its status and kind, and links a live page to the site", async () => {
    await renderAndWaitForForm(makePage("PUBLISHED"));

    expect(
      screen.getByRole("heading", { level: 2, name: "Доставка" }),
    ).toBeInTheDocument();
    const open = screen.getByRole("link", { name: d.openOnSite });
    expect(open).toHaveAttribute("href", `${STOREFRONT_URL}/legal/dostavka`);
    expect(open).toHaveAttribute("target", "_blank");
    expect(screen.getAllByText(d.statusPublished).length).toBeGreaterThan(0);
  });

  it("offers no site link for a draft", async () => {
    await renderAndWaitForForm(makePage("DRAFT"));

    expect(
      screen.queryByRole("link", { name: d.openOnSite }),
    ).not.toBeInTheDocument();
  });

  it("deletes from «⋯» after an AlertDialog and returns to the list", async () => {
    let deleted = false;
    server.use(
      http.delete(`*/api/admin/pages/${PAGE_ID}`, () => {
        deleted = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    await renderAndWaitForForm(makePage("PUBLISHED"));

    await userEvent.click(
      screen.getByRole("button", { name: d.headerMenuAria }),
    );
    await userEvent.click(
      await screen.findByRole("menuitem", { name: d.deleteItem }),
    );
    const dialog = await screen.findByRole("alertdialog");
    await userEvent.click(
      within(dialog).getByRole("button", { name: d.deleteAction }),
    );

    await waitFor(() => expect(deleted).toBe(true));
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/pages"));
  });

  it("is view-only without pages:write — no save, no «⋯»", async () => {
    await renderAndWaitForForm(makePage("PUBLISHED"), [PERM.blogWrite]);

    expect(
      screen.queryByRole("button", { name: dict.common.save }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: d.headerMenuAria }),
    ).not.toBeInTheDocument();
    expect(screen.getByText(dict.common.viewOnly)).toBeInTheDocument();
  });
});

/**
 * The whole chain — widget seeding → form input → zod mapper → PUT body — must
 * speak KYIV time, because that is what the page LIST speaks (TASK-421).
 *
 * 21:00 UTC on 1 October is 00:00 on 2 OCTOBER in Kyiv: the two zones disagree
 * about the calendar DAY here.
 */
describe("EditPageView — the schedule is Kyiv time, not the browser's", () => {
  const SCHEDULED_UTC = "2026-10-01T21:00:00.000Z";
  const SCHEDULED_KYIV_INPUT = "2026-10-02T00:00";

  it("seeds the input with the Kyiv wall clock the list shows", async () => {
    await renderAndWaitForForm(makePage("SCHEDULED", SCHEDULED_UTC));

    expect(screen.getByLabelText(dict.pageForm.scheduledAt)).toHaveValue(
      SCHEDULED_KYIV_INPUT,
    );
  });

  it("sends back the same instant when the operator changes nothing", async () => {
    const putCalls = await renderAndWaitForForm(
      makePage("SCHEDULED", SCHEDULED_UTC),
    );

    await submit();

    await waitFor(() => expect(putCalls).toHaveLength(1));
    expect((putCalls[0] as { scheduledAt?: string }).scheduledAt).toBe(
      SCHEDULED_UTC,
    );
  });
});

/** TASK-285 + TASK-812 — the rename guard is an AlertDialog (СР12). */
describe("EditPageView — slug-rename guard (TASK-285)", () => {
  it("submits without any dialog when the slug is unchanged on a published page", async () => {
    const putCalls = await renderAndWaitForForm(makePage("PUBLISHED"));

    await submit();

    await waitFor(() => expect(putCalls).toHaveLength(1));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("blocks the update when the admin cancels the published-slug-change dialog", async () => {
    const putCalls = await renderAndWaitForForm(makePage("PUBLISHED"));

    await renameSlug("nova-adresa");
    await submit();

    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText(d.slugChangeTitle)).toBeInTheDocument();
    expect(
      within(dialog).getByText(
        d.slugChangeBody("/legal/dostavka", "/legal/nova-adresa"),
      ),
    ).toBeInTheDocument();
    expect(within(dialog).getByText(d.slugChangeRedirect)).toBeInTheDocument();

    await userEvent.click(
      within(dialog).getByRole("button", { name: dict.common.cancel }),
    );
    await waitFor(() =>
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument(),
    );
    expect(putCalls).toHaveLength(0);
  });

  it("fires the update after the admin accepts the dialog", async () => {
    const putCalls = await renderAndWaitForForm(makePage("PUBLISHED"));

    await renameSlug("nova-adresa");
    await submit();

    const dialog = await screen.findByRole("alertdialog");
    await userEvent.click(
      within(dialog).getByRole("button", { name: d.slugChangeAction }),
    );

    await waitFor(() => expect(putCalls).toHaveLength(1));
  });

  // TASK-566 — a slug is unique per kind; the refusal names the kind holding it.
  it("names the kind in the toast when the address is already taken", async () => {
    const page = { ...makePage("DRAFT"), kind: "INFO" };
    server.use(
      http.get(`*/api/admin/pages/${PAGE_ID}`, () =>
        HttpResponse.json({ data: page }),
      ),
      http.put(`*/api/admin/pages/${PAGE_ID}`, () =>
        HttpResponse.json(
          {
            error: "PAGE_SLUG_TAKEN",
            message: 'Slug "oplata" is already taken by an INFO page',
          },
          { status: 409 },
        ),
      ),
    );
    renderWithProviders(
      <WithAuth isOwner>
        <EditPageView pageId={PAGE_ID} />
      </WithAuth>,
    );
    await waitFor(() => expect(slugField()).toHaveValue(page.slug));

    await renameSlug("oplata");
    await submit();

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(d.toastSlugTaken(d.kindInfo)),
    );
  });

  it("never asks about a slug change on a DRAFT page", async () => {
    const putCalls = await renderAndWaitForForm(makePage("DRAFT"));

    await renameSlug("nova-adresa");
    await submit();

    await waitFor(() => expect(putCalls).toHaveLength(1));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });
});
