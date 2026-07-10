import {
  renderWithProviders,
  screen,
  userEvent,
  within,
} from "@/shared/test/render";
import { dict } from "@/shared/config";
import { BannerForm } from "./banner-form";

const noop = () => {};

const previewPanel = () => screen.getByTestId("banner-form-preview-panel");
const fieldsPanel = () => screen.getByTestId("banner-form-fields");

describe("BannerForm — live placement preview (TASK-265)", () => {
  it("live-updates the preview while typing in the title field", async () => {
    renderWithProviders(<BannerForm onSubmit={noop} isPending={false} />);

    // Default placement is HERO_SLIDE with the empty-title placeholder.
    expect(
      within(previewPanel()).getByTestId("banner-preview-hero-slide"),
    ).toHaveTextContent(dict.bannerPreview.emptyTitle);

    await userEvent.type(
      screen.getByLabelText(dict.bannerForm.title),
      "Новинки Apple",
    );

    expect(
      within(previewPanel()).getByTestId("banner-preview-hero-slide"),
    ).toHaveTextContent("Новинки Apple");
  });

  it("switches the preview variant when the placement select changes", async () => {
    renderWithProviders(<BannerForm onSubmit={noop} isPending={false} />);

    expect(screen.getByTestId("banner-preview-hero-slide")).toBeInTheDocument();

    await userEvent.selectOptions(
      screen.getByLabelText(dict.bannerForm.placement),
      "ANNOUNCEMENT_BAR",
    );

    expect(
      screen.getByTestId("banner-preview-announcement-bar"),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("banner-preview-hero-slide"),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(dict.bannerPreview.announcementBarNote),
    ).toBeInTheDocument();
  });

  it("toggles panel visibility via the <md tabs while keeping both panels mounted", async () => {
    renderWithProviders(<BannerForm onSubmit={noop} isPending={false} />);

    // Default: fields shown, preview hidden below md (still in the DOM —
    // jsdom has no viewport, so we assert the class-driven switch itself).
    expect(fieldsPanel().className).not.toContain("hidden");
    expect(previewPanel().className).toContain("hidden");

    await userEvent.click(
      screen.getByRole("tab", { name: dict.bannerPreview.tabPreview }),
    );

    expect(previewPanel().className).not.toContain("hidden");
    expect(fieldsPanel().className).toContain("hidden");
    // Both panels stay mounted — the form fields are never unmounted.
    expect(screen.getByLabelText(dict.bannerForm.title)).toBeInTheDocument();
    // Submit sits outside both panels, so it stays reachable from the
    // preview tab on <md (never inside the hidden fields panel).
    const submitButton = screen.getByRole("button", {
      name: dict.bannerForm.submit,
    });
    expect(fieldsPanel()).not.toContainElement(submitButton);
    expect(previewPanel()).not.toContainElement(submitButton);

    await userEvent.click(
      screen.getByRole("tab", { name: dict.bannerPreview.tabForm }),
    );

    expect(fieldsPanel().className).not.toContain("hidden");
    expect(previewPanel().className).toContain("hidden");
  });

  it("keeps validation working: submitting an empty form shows the title error", async () => {
    const onSubmit = jest.fn();
    renderWithProviders(<BannerForm onSubmit={onSubmit} isPending={false} />);

    await userEvent.click(
      screen.getByRole("button", { name: dict.bannerForm.submit }),
    );

    expect(
      await screen.findByText(dict.bannerForm.errors.titleRequired),
    ).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
