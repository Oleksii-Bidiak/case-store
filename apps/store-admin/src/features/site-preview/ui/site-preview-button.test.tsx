import { http, HttpResponse } from "msw";
import {
  renderWithProviders,
  screen,
  userEvent,
  waitFor,
} from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { dict, STOREFRONT_URL } from "@/shared/config";
import { formatDateTime } from "@/shared/lib";
import { SitePreviewButton } from "./site-preview-button";

/**
 * «Подивитись на сайті» (TASK-670). The owner's rule: what the storefront shows
 * opens there as a plain link; what it does not gets a signed 24-hour link in a
 * popover — and a preview shows only what is SAVED, so unsaved edits are asked
 * about first.
 */

const t = dict.sitePreview;
const EXPIRES_AT = "2026-10-06T12:42:00.000Z";
const LINK = `${STOREFRONT_URL}/preview?token=tok-1`;

function issueReturns(): unknown[] {
  const bodies: unknown[] = [];
  server.use(
    http.post("*/api/admin/preview-tokens", async ({ request }) => {
      bodies.push(await request.json());
      return HttpResponse.json(
        { data: { token: "tok-1", path: "/", expiresAt: EXPIRES_AT } },
        { status: 201 },
      );
    }),
  );
  return bodies;
}

function issueFails(): void {
  server.use(
    http.post("*/api/admin/preview-tokens", () =>
      HttpResponse.json({ message: "nope" }, { status: 500 }),
    ),
  );
}

function withClipboard(writeText: jest.Mock): void {
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText },
    configurable: true,
  });
}

afterEach(() => {
  Reflect.deleteProperty(navigator, "clipboard");
});

describe("SitePreviewButton — visible vs not visible", () => {
  it("is a plain «Відкрити на сайті» link when the thing is live", () => {
    renderWithProviders(
      <SitePreviewButton
        target={{ type: "page", id: "p1" }}
        liveHref="https://shop.example/info/garantiya"
        description={t.whatPage}
      />,
    );

    const link = screen.getByRole("link", { name: t.openOnSite });
    expect(link).toHaveAttribute("href", "https://shop.example/info/garantiya");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(screen.queryByRole("button", { name: t.viewOnSite })).toBeNull();
  });

  it("is «Подивитись на сайті» when it is not live, and issues nothing until pressed", () => {
    const bodies = issueReturns();
    renderWithProviders(
      <SitePreviewButton
        target={{ type: "post", id: "b1" }}
        description={t.whatPost}
      />,
    );

    expect(
      screen.getByRole("button", { name: t.viewOnSite }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: t.openOnSite })).toBeNull();
    expect(bodies).toHaveLength(0);
  });
});

describe("SitePreviewButton — the link popover", () => {
  it("issues a token for the target and shows the link, its expiry and the warning", async () => {
    const user = userEvent.setup();
    const bodies = issueReturns();
    renderWithProviders(
      <SitePreviewButton target={{ type: "home" }} description={t.whatHome} />,
    );

    await user.click(screen.getByRole("button", { name: t.viewOnSite }));

    const dialog = await screen.findByRole("dialog", { name: t.readyTitle });
    expect(dialog).toBeInTheDocument();
    expect(screen.getByLabelText(t.linkLabel)).toHaveValue(LINK);
    expect(screen.getByText(t.whatHome)).toBeInTheDocument();
    expect(
      screen.getByText(t.validUntil(formatDateTime(EXPIRES_AT))),
    ).toBeInTheDocument();
    expect(screen.getByText(t.warning)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: t.openPreview })).toHaveAttribute(
      "href",
      LINK,
    );
    expect(bodies).toEqual([{ type: "home" }]);
  });

  it("copies the link to the clipboard", async () => {
    const user = userEvent.setup();
    const writeText = jest.fn().mockResolvedValue(undefined);
    issueReturns();
    renderWithProviders(
      <SitePreviewButton target={{ type: "home" }} description={t.whatHome} />,
    );
    await user.click(screen.getByRole("button", { name: t.viewOnSite }));
    await screen.findByLabelText(t.linkLabel);
    withClipboard(writeText);

    await user.click(screen.getByRole("button", { name: t.copyAria }));

    expect(writeText).toHaveBeenCalledWith(LINK);
    expect(await screen.findByRole("status")).toHaveTextContent(t.copied);
  });

  it("closes on Escape and issues a fresh link on every open — never a remembered one", async () => {
    // «Відкликати всі прев'ю» may have run in another tab in between.
    const user = userEvent.setup();
    const bodies = issueReturns();
    renderWithProviders(
      <SitePreviewButton target={{ type: "home" }} description={t.whatHome} />,
    );
    const trigger = screen.getByRole("button", { name: t.viewOnSite });

    await user.click(trigger);
    await screen.findByLabelText(t.linkLabel);
    await user.keyboard("{Escape}");
    await waitFor(() =>
      expect(screen.queryByLabelText(t.linkLabel)).toBeNull(),
    );
    await user.click(trigger);

    await waitFor(() => expect(bodies).toHaveLength(2));
  });

  it("says so and offers a retry when the link cannot be issued", async () => {
    const user = userEvent.setup();
    issueFails();
    renderWithProviders(
      <SitePreviewButton
        target={{ type: "product", id: "x" }}
        description={t.whatProduct}
      />,
    );

    await user.click(screen.getByRole("button", { name: t.viewOnSite }));

    expect(await screen.findByRole("alert")).toHaveTextContent(t.issueFailed);
    issueReturns();
    await user.click(screen.getByRole("button", { name: t.retry }));
    expect(await screen.findByLabelText(t.linkLabel)).toHaveValue(LINK);
  });
});

describe("SitePreviewButton — unsaved changes", () => {
  it("asks first, and «Подивитись збережене» issues without saving", async () => {
    const user = userEvent.setup();
    const bodies = issueReturns();
    const onSave = jest.fn().mockResolvedValue(true);
    renderWithProviders(
      <SitePreviewButton
        target={{ type: "page", id: "p1" }}
        description={t.whatPage}
        hasUnsavedChanges={() => true}
        onSave={onSave}
      />,
    );

    await user.click(screen.getByRole("button", { name: t.viewOnSite }));

    expect(
      await screen.findByRole("dialog", { name: t.dirtyTitle }),
    ).toBeInTheDocument();
    expect(bodies).toHaveLength(0);

    await user.click(screen.getByRole("button", { name: t.viewSaved }));

    expect(await screen.findByLabelText(t.linkLabel)).toHaveValue(LINK);
    expect(onSave).not.toHaveBeenCalled();
    expect(bodies).toEqual([{ type: "page", id: "p1" }]);
  });

  it("«Зберегти й подивитись» saves, then issues", async () => {
    const user = userEvent.setup();
    const bodies = issueReturns();
    const order: string[] = [];
    const onSave = jest.fn(async () => {
      order.push(`save:${bodies.length}`);
      return true;
    });
    renderWithProviders(
      <SitePreviewButton
        target={{ type: "post", id: "b1" }}
        description={t.whatPost}
        hasUnsavedChanges={() => true}
        onSave={onSave}
      />,
    );

    await user.click(screen.getByRole("button", { name: t.viewOnSite }));
    await user.click(
      await screen.findByRole("button", { name: t.saveAndView }),
    );

    expect(await screen.findByLabelText(t.linkLabel)).toHaveValue(LINK);
    // The save ran before anything was issued.
    expect(order).toEqual(["save:0"]);
    expect(bodies).toHaveLength(1);
  });

  it("issues nothing when the save does not land", async () => {
    const user = userEvent.setup();
    const bodies = issueReturns();
    renderWithProviders(
      <SitePreviewButton
        target={{ type: "post", id: "b1" }}
        description={t.whatPost}
        hasUnsavedChanges={() => true}
        onSave={() => Promise.resolve(false)}
      />,
    );

    await user.click(screen.getByRole("button", { name: t.viewOnSite }));
    await user.click(
      await screen.findByRole("button", { name: t.saveAndView }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(t.saveFailed);
    expect(screen.queryByLabelText(t.linkLabel)).toBeNull();
    expect(bodies).toHaveLength(0);
  });

  it("offers only the saved state when the viewer cannot save", async () => {
    const user = userEvent.setup();
    issueReturns();
    renderWithProviders(
      <SitePreviewButton
        target={{ type: "page", id: "p1" }}
        description={t.whatPage}
        hasUnsavedChanges={() => true}
      />,
    );

    await user.click(screen.getByRole("button", { name: t.viewOnSite }));

    expect(
      await screen.findByRole("button", { name: t.viewSaved }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: t.saveAndView })).toBeNull();
  });
});
