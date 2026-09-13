import { http, HttpResponse } from "msw";
import {
  renderWithProviders,
  screen,
  userEvent,
  waitFor,
} from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { dict } from "@/shared/config";
import { EditPageView } from "./edit-page-view";

// next/navigation is unavailable under jsdom — mock the router.
jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace: jest.fn(), push: jest.fn() }),
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

const PAGE_ID = "page-uuid-1";

function makePage(
  status: "DRAFT" | "PUBLISHED" | "SCHEDULED",
  scheduledAt: string | null = null,
) {
  return {
    id: PAGE_ID,
    slug: "dostavka",
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

async function renderAndWaitForForm(page: ReturnType<typeof makePage>) {
  const putCalls = stubPage(page);
  renderWithProviders(<EditPageView pageId={PAGE_ID} />);
  await waitFor(() =>
    expect(screen.getByLabelText(dict.pageForm.slug)).toHaveValue(page.slug),
  );
  return putCalls;
}

const submit = () =>
  userEvent.click(
    screen.getByRole("button", { name: dict.common.saveChanges }),
  );

/**
 * The whole chain — widget seeding → form input → zod mapper → PUT body — must
 * speak KYIV time, because that is what the page LIST speaks (TASK-421, review
 * finding #10).
 *
 * 21:00 UTC on 1 October is 00:00 on 2 OCTOBER in Kyiv. Picked deliberately: the
 * two zones disagree about the calendar DAY here, so the old browser-zone
 * seeding is off by a day rather than by an invisible hour, and the operator who
 * re-typed what the list showed them («02.10») moved the publication a day
 * earlier without any screen saying so.
 *
 * On a Kyiv machine — this one — both implementations agree, so this test cannot
 * prove the fix on its own; the zone-independent proof lives in
 * `shared/lib/format/datetime-local.test.ts`. What this one pins is that the
 * widget and the mapper actually go THROUGH those helpers end to end, which no
 * unit test of the helpers can show.
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

describe("EditPageView — slug-rename guard (TASK-285)", () => {
  let confirmSpy: jest.SpyInstance;

  beforeEach(() => {
    confirmSpy = jest.spyOn(window, "confirm").mockReturnValue(true);
  });

  afterEach(() => {
    confirmSpy.mockRestore();
  });

  it("submits without any confirm when the slug is unchanged on a published page", async () => {
    const putCalls = await renderAndWaitForForm(makePage("PUBLISHED"));

    await submit();

    await waitFor(() => expect(putCalls).toHaveLength(1));
    expect(confirmSpy).not.toHaveBeenCalled();
  });

  it("blocks the update when the admin cancels the published-slug-change confirm", async () => {
    confirmSpy.mockReturnValue(false);
    const putCalls = await renderAndWaitForForm(makePage("PUBLISHED"));

    const slugField = screen.getByLabelText(dict.pageForm.slug);
    await userEvent.clear(slugField);
    await userEvent.type(slugField, "nova-adresa");
    await submit();

    expect(confirmSpy).toHaveBeenCalledWith(
      dict.pages.slugChangeConfirm("dostavka", "nova-adresa"),
    );
    // Cancel → the mutation never fires.
    expect(putCalls).toHaveLength(0);
  });

  it("fires the update after the admin accepts the confirm", async () => {
    const putCalls = await renderAndWaitForForm(makePage("PUBLISHED"));

    const slugField = screen.getByLabelText(dict.pageForm.slug);
    await userEvent.clear(slugField);
    await userEvent.type(slugField, "nova-adresa");
    await submit();

    await waitFor(() => expect(putCalls).toHaveLength(1));
    expect(confirmSpy).toHaveBeenCalledTimes(1);
  });

  it("never confirms a slug change on a DRAFT page", async () => {
    const putCalls = await renderAndWaitForForm(makePage("DRAFT"));

    const slugField = screen.getByLabelText(dict.pageForm.slug);
    await userEvent.clear(slugField);
    await userEvent.type(slugField, "nova-adresa");
    await submit();

    await waitFor(() => expect(putCalls).toHaveLength(1));
    expect(confirmSpy).not.toHaveBeenCalled();
  });
});
