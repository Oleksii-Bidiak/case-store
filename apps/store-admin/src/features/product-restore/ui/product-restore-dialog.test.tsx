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
import { toast } from "@/shared/ui/toast";
import { WithAuth } from "@/entities/session/model/auth-context.fixture";
import { ProductRestoreDialog } from "./product-restore-dialog";

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

const d = dict.products;

const ID = "44444444-4444-4444-8444-444444444444";
const NAME = "Чохол Spigen Ultra Hybrid для iPhone 14 — Прозорий";
const PRODUCT = {
  id: ID,
  name: NAME,
  slug: `deleted:${ID}:spigen-ultra-hybrid-iphone-14-clear`,
  // A native артикул with a colon of its own survives the prefix strip.
  sku: `deleted:${ID}:CASE:SPG-UH-IP14`,
};

beforeEach(() => {
  mockPush.mockClear();
  successToast.mockClear();
});

/** Answers the restore POSTs in order; the last answer repeats. */
function stubRestore(answers: Array<{ status: number; error?: string }>) {
  const bodies: unknown[] = [];
  server.use(
    http.post(`*/api/products/${ID}/restore`, async ({ request }) => {
      bodies.push(await request.json());
      const answer = answers[Math.min(bodies.length, answers.length) - 1];
      if (answer.status >= 400) {
        return HttpResponse.json(
          { error: answer.error ?? "Error", message: "refused" },
          { status: answer.status },
        );
      }
      return HttpResponse.json(
        {
          data: {
            id: ID,
            name: NAME,
            slug: "spigen-ultra-hybrid-iphone-14-clear",
            isActive: false,
          },
        },
        { status: 201 },
      );
    }),
  );
  return bodies;
}

function renderDialog(
  options: { permissions?: string[]; onOpenChange?: jest.Mock } = {},
) {
  const onOpenChange = options.onOpenChange ?? jest.fn();
  renderWithProviders(
    <WithAuth
      isOwner={options.permissions === undefined}
      permissions={options.permissions ?? []}
    >
      <ProductRestoreDialog product={PRODUCT} onOpenChange={onOpenChange} />
    </WithAuth>,
  );
  return { onOpenChange };
}

const confirm = async () => {
  const dialog = await screen.findByRole("alertdialog");
  await userEvent.click(
    within(dialog).getByRole("button", { name: d.restoreConfirm }),
  );
};

describe("ProductRestoreDialog (TASK-656)", () => {
  it("renders nothing without products:delete", () => {
    renderDialog({ permissions: ["products:read", "products:write"] });
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("strips only the exact `deleted:<id>:` prefix — a colon in the артикул survives", async () => {
    renderDialog();
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText("CASE:SPG-UH-IP14")).toBeInTheDocument();
    expect(
      within(dialog).getByText("/products/spigen-ultra-hybrid-iphone-14-clear"),
    ).toBeInTheDocument();
    // An alertdialog puts the first focus on the safe choice.
    expect(
      within(dialog).getByRole("button", { name: dict.common.cancel }),
    ).toHaveFocus();
  });

  it("closes on Escape", async () => {
    const { onOpenChange } = renderDialog();
    await screen.findByRole("alertdialog");
    await userEvent.keyboard("{Escape}");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  // Т9: one bordered row per value, label and value side by side — never one
  // box whose long address drops under its label.
  it("lays the address and артикул out as two bordered label/value rows (Т9)", async () => {
    renderDialog();
    const dialog = await screen.findByRole("alertdialog");
    const address = within(dialog).getByText(
      "/products/spigen-ultra-hybrid-iphone-14-clear",
    );
    const sku = within(dialog).getByText("CASE:SPG-UH-IP14");
    for (const [value, label] of [
      [address, d.restoreAddress],
      [sku, d.restoreSku],
    ] as const) {
      const row = value.parentElement!;
      expect(row).toHaveClass("border", "flex");
      expect(row).not.toHaveClass("flex-wrap");
      expect(row.querySelector("dt")).toHaveTextContent(label);
      expect(value).toHaveClass("flex-1", "font-mono");
    }
    expect(address.parentElement).not.toBe(sku.parentElement);
  });

  it("moves focus into the new-address field when the conflict opens", async () => {
    stubRestore([{ status: 409, error: "PRODUCT_SLUG_CONFLICT" }]);
    renderDialog();
    await confirm();
    const dialog = await screen.findByRole("dialog", {
      name: d.conflictTitleSlug,
    });
    await waitFor(() =>
      expect(
        within(dialog).getByRole("textbox", { name: d.conflictNewSlug }),
      ).toHaveFocus(),
    );
    // Т10: the taken address is set in mono inside the lead, and the free
    // артикул joins the address hint after « · », lowercase.
    expect(
      within(dialog).getByText("/products/spigen-ultra-hybrid-iphone-14-clear"),
    ).toHaveClass("font-mono");
    expect(
      within(dialog).getByText(`· ${d.conflictSkuKept("CASE:SPG-UH-IP14")}`, {
        exact: false,
      }),
    ).toHaveTextContent(/ · артикул CASE:SPG-UH-IP14 вільний/);
    // Т10 has no «×» — the ways out are «Скасувати» and Esc.
    expect(
      within(dialog).queryByRole("button", { name: dict.common.close }),
    ).toBeNull();
    expect(
      within(dialog).getByRole("button", { name: dict.common.cancel }),
    ).toBeInTheDocument();
  });

  it("closes on «Скасувати» without a request", async () => {
    const bodies = stubRestore([{ status: 201 }]);
    const { onOpenChange } = renderDialog();
    const dialog = await screen.findByRole("alertdialog");
    await userEvent.click(
      within(dialog).getByRole("button", { name: dict.common.cancel }),
    );
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(bodies).toHaveLength(0);
  });

  it("asks only for a new артикул on PRODUCT_SKU_CONFLICT and sends only it", async () => {
    const bodies = stubRestore([
      { status: 409, error: "PRODUCT_SKU_CONFLICT" },
      { status: 201 },
    ]);
    renderDialog();
    await confirm();

    const dialog = await screen.findByRole("dialog", {
      name: d.conflictTitleSku,
    });
    expect(
      within(dialog).queryByRole("textbox", { name: d.conflictNewSlug }),
    ).toBeNull();
    const sku = within(dialog).getByRole("textbox", {
      name: d.conflictNewSku,
    });
    expect(sku).toHaveValue("CASE:SPG-UH-IP14-2");
    expect(
      within(dialog).getByText(
        d.conflictSlugKept("spigen-ultra-hybrid-iphone-14-clear"),
      ),
    ).toBeInTheDocument();

    await userEvent.click(
      within(dialog).getByRole("button", { name: d.conflictConfirmSku }),
    );
    await waitFor(() =>
      expect(bodies).toEqual([{}, { sku: "CASE:SPG-UH-IP14-2" }]),
    );
  });

  it("asks for both on PRODUCT_SLUG_SKU_CONFLICT and sends both", async () => {
    const bodies = stubRestore([
      { status: 409, error: "PRODUCT_SLUG_SKU_CONFLICT" },
      { status: 201 },
    ]);
    renderDialog();
    await confirm();

    const dialog = await screen.findByRole("dialog", {
      name: d.conflictTitleBoth,
    });
    await userEvent.click(
      within(dialog).getByRole("button", { name: d.conflictConfirmBoth }),
    );
    await waitFor(() =>
      expect(bodies).toEqual([
        {},
        {
          slug: "spigen-ultra-hybrid-iphone-14-clear-2",
          sku: "CASE:SPG-UH-IP14-2",
        },
      ]),
    );
    await waitFor(() =>
      expect(successToast).toHaveBeenCalledWith(
        d.restoreToastDone(NAME),
        expect.objectContaining({
          action: expect.objectContaining({ label: d.restoreToastOpen }),
        }),
      ),
    );
  });

  it("validates the new address before sending and focuses it (forms.md 4a)", async () => {
    const bodies = stubRestore([
      { status: 409, error: "PRODUCT_SLUG_CONFLICT" },
    ]);
    renderDialog();
    await confirm();

    const dialog = await screen.findByRole("dialog", {
      name: d.conflictTitleSlug,
    });
    const slug = within(dialog).getByRole("textbox", {
      name: d.conflictNewSlug,
    });
    await userEvent.clear(slug);
    await userEvent.type(slug, "Новий Slug");
    await userEvent.click(
      within(dialog).getByRole("button", { name: d.conflictConfirmSlug }),
    );

    expect(
      await within(dialog).findByText(d.conflictSlugPattern),
    ).toBeInTheDocument();
    expect(slug).toHaveFocus();
    expect(slug).toHaveAttribute("aria-invalid", "true");

    // The native address itself is the one that is taken.
    await userEvent.clear(slug);
    await userEvent.type(slug, "spigen-ultra-hybrid-iphone-14-clear");
    await userEvent.click(
      within(dialog).getByRole("button", { name: d.conflictConfirmSlug }),
    );
    expect(
      await within(dialog).findByText(d.conflictSlugSame),
    ).toBeInTheDocument();
    expect(bodies).toEqual([{}]);
  });

  it("says so under the field when the new address is taken too, and keeps the dialog", async () => {
    const bodies = stubRestore([
      { status: 409, error: "PRODUCT_SLUG_CONFLICT" },
    ]);
    renderDialog();
    await confirm();

    const dialog = await screen.findByRole("dialog", {
      name: d.conflictTitleSlug,
    });
    await userEvent.click(
      within(dialog).getByRole("button", { name: d.conflictConfirmSlug }),
    );

    expect(
      await within(dialog).findByText(d.conflictSlugSame),
    ).toBeInTheDocument();
    const slug = within(dialog).getByRole("textbox", {
      name: d.conflictNewSlug,
    });
    await waitFor(() => expect(slug).toHaveFocus());
    expect(bodies).toEqual([
      {},
      { slug: "spigen-ultra-hybrid-iphone-14-clear-2" },
    ]);

    // The refused value is not sent a second time.
    await userEvent.click(
      within(dialog).getByRole("button", { name: d.conflictConfirmSlug }),
    );
    expect(bodies).toHaveLength(2);
    expect(successToast).not.toHaveBeenCalled();
  });

  it.each([
    [404, d.restoreErrorGone],
    [400, d.restoreErrorCategory],
    [403, d.restoreErrorForbidden],
    [500, d.restoreErrorGeneric],
  ])("explains a %i in the dialog, without restoring", async (status, text) => {
    stubRestore([{ status }]);
    renderDialog();
    await confirm();

    const dialog = await screen.findByRole("alertdialog");
    expect(await within(dialog).findByText(text)).toBeInTheDocument();
    expect(successToast).not.toHaveBeenCalled();
  });

  it("opens the read-only card from the toast for a session without products:write", async () => {
    stubRestore([{ status: 201 }]);
    renderDialog({ permissions: ["products:read", "products:delete"] });
    await confirm();

    await waitFor(() => expect(successToast).toHaveBeenCalledTimes(1));
    const [, options] = successToast.mock.calls[0] as [
      string,
      { action: { onClick: () => void } },
    ];
    options.action.onClick();
    expect(mockPush).toHaveBeenCalledWith(`/products/${ID}`);
  });
});
