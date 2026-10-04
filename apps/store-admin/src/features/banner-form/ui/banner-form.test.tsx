import {
  renderWithProviders,
  screen,
  userEvent,
  waitFor,
  within,
} from "@/shared/test/render";
import { dict } from "@/shared/config";
import {
  MEDIA_PERMISSIONS,
  makeMediaAsset,
  pickFromLibrary,
  stubMediaLibrary,
} from "@/features/media-picker/model/media-picker.fixture";
import { BannerForm } from "./banner-form";

const f = dict.bannerForm;
const noop = () => {};

const previewPanel = () => screen.getByTestId("banner-form-preview-panel");
const fieldsPanel = () => screen.getByTestId("banner-form-fields");
const submitButton = (label: string = f.submit) =>
  screen.getByRole("button", { name: label });
// The required star is aria-hidden, so the field is found by its NAME.
const titleInput = () => screen.getByRole("textbox", { name: f.title });
const statusGroup = () => screen.getByRole("radiogroup", { name: f.status });
const chooseStatus = (label: string) =>
  userEvent.click(within(statusGroup()).getByRole("radio", { name: label }));

describe("BannerForm — media library picker (TASK-441)", () => {
  const ART_URL = "http://localhost:3001/uploads/media/hero.webp";

  it("writes the picked asset's URL into the artwork field", async () => {
    stubMediaLibrary([
      makeMediaAsset("m1", { alt: "Осіння банерна зйомка", url: ART_URL }),
    ]);
    renderWithProviders(<BannerForm onSubmit={noop} isPending={false} />, {
      auth: { permissions: MEDIA_PERMISSIONS },
    });

    await pickFromLibrary("Осіння банерна зйомка");

    await waitFor(() =>
      expect(within(fieldsPanel()).getByLabelText(f.imageUrl)).toHaveValue(
        ART_URL,
      ),
    );
  });

  it("offers no picker to an operator with no media keys", () => {
    renderWithProviders(<BannerForm onSubmit={noop} isPending={false} />);

    expect(
      screen.queryByRole("button", { name: dict.mediaPicker.trigger }),
    ).not.toBeInTheDocument();
  });
});

describe("BannerForm — live placement preview (TASK-265)", () => {
  it("live-updates the preview while typing in the title field", async () => {
    renderWithProviders(<BannerForm onSubmit={noop} isPending={false} />);

    // Default placement is HERO_SLIDE with the empty-title placeholder.
    expect(
      within(previewPanel()).getByTestId("banner-preview-hero-slide"),
    ).toHaveTextContent(dict.bannerPreview.emptyTitle);

    await userEvent.type(titleInput(), "Новинки Apple");

    expect(
      within(previewPanel()).getByTestId("banner-preview-hero-slide"),
    ).toHaveTextContent("Новинки Apple");
  });

  it("chooses the placement from cards and switches the preview with it", async () => {
    renderWithProviders(<BannerForm onSubmit={noop} isPending={false} />);

    const placements = screen.getByRole("radiogroup", { name: f.placement });
    expect(
      within(placements).getByRole("radio", {
        name: f.placements.HERO_SLIDE,
      }),
    ).toBeChecked();
    // Each card says where the slot is on the site.
    expect(
      within(placements).getByText(dict.banners.placementWhere.PROMO_TILE),
    ).toBeInTheDocument();

    await userEvent.click(
      within(placements).getByRole("radio", {
        name: f.placements.ANNOUNCEMENT_BAR,
      }),
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

  it("starts a NEW banner in the placement it was asked for («Додати сюди»)", () => {
    renderWithProviders(
      <BannerForm
        onSubmit={noop}
        isPending={false}
        defaultValues={{ placement: "PROMO_TILE" }}
      />,
    );

    expect(
      screen.getByRole("radio", { name: f.placements.PROMO_TILE }),
    ).toBeChecked();
  });

  it("shows the proportion hint of the chosen placement under the picture", async () => {
    renderWithProviders(<BannerForm onSubmit={noop} isPending={false} />);

    expect(screen.getByText(f.imageHints.HERO_SLIDE)).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("radio", { name: f.placements.PROMO_TILE }),
    );
    expect(screen.getByText(f.imageHints.PROMO_TILE)).toBeInTheDocument();
    expect(screen.queryByText(f.imageHints.HERO_SLIDE)).not.toBeInTheDocument();
  });

  it("shows the picture in the preview", async () => {
    renderWithProviders(<BannerForm onSubmit={noop} isPending={false} />);

    await userEvent.type(
      screen.getByLabelText(f.imageUrl),
      "/uploads/banners/hero.webp",
    );

    const img = within(previewPanel()).getByTestId("banner-preview-image");
    expect(img).toHaveAttribute("src", "/uploads/banners/hero.webp");
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
    expect(titleInput()).toBeInTheDocument();
    // Submit sits in the sticky bar, outside both panels, so it stays
    // reachable from the preview tab on <md.
    expect(fieldsPanel()).not.toContainElement(submitButton());
    expect(previewPanel()).not.toContainElement(submitButton());

    await userEvent.click(
      screen.getByRole("tab", { name: dict.bannerPreview.tabForm }),
    );

    expect(fieldsPanel().className).not.toContain("hidden");
    expect(previewPanel().className).toContain("hidden");
  });
});

describe("BannerForm — text counters (БН5)", () => {
  it("counts the title and subtitle against what the slot holds — without blocking", async () => {
    const onSubmit = jest.fn();
    renderWithProviders(<BannerForm onSubmit={onSubmit} isPending={false} />);

    expect(screen.getByText(f.counter(0, 60))).toBeInTheDocument();
    expect(screen.getByText(f.counter(0, 120))).toBeInTheDocument();

    await userEvent.type(titleInput(), "Аксесуари");
    expect(screen.getByText(f.counter(9, 60))).toBeInTheDocument();

    const long =
      "Дуже довгий заголовок банера, що не вміщається у слайд як слід";
    await userEvent.clear(titleInput());
    await userEvent.click(titleInput());
    await userEvent.paste(long);
    expect(screen.getByText(f.counter(long.length, 60))).toBeInTheDocument();

    await userEvent.click(submitButton());
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
  });
});

describe("BannerForm — «Куди веде кнопка» (БН6/БН8)", () => {
  it("stores the address the LinkPicker produces", async () => {
    const onSubmit = jest.fn();
    renderWithProviders(<BannerForm onSubmit={onSubmit} isPending={false} />);

    await userEvent.type(titleInput(), "Акція");
    await userEvent.click(screen.getByRole("combobox", { name: f.ctaHref }));
    await userEvent.click(
      await screen.findByRole("button", {
        name: new RegExp(dict.linkPicker.sectionPromo),
      }),
    );
    await userEvent.click(submitButton());

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ ctaHref: "/promo" });
  });

  it("a button label with nowhere to go: the error under the picker and the summary on top", async () => {
    const onSubmit = jest.fn();
    renderWithProviders(<BannerForm onSubmit={onSubmit} isPending={false} />);

    await userEvent.type(screen.getByLabelText(f.ctaLabel), "Купити");
    await userEvent.click(submitButton());

    expect(
      await screen.findByText(f.errors.ctaHrefRequired),
    ).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: f.ctaHref })).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(
      screen.getByText(f.errorSummary([f.title, f.ctaHref])),
    ).toBeInTheDocument();
    expect(screen.getByText(f.barErrors(2))).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

describe("BannerForm — «Оформлення» swatches (БН5)", () => {
  it("picks a colour from the palette the storefront knows", async () => {
    const onSubmit = jest.fn();
    renderWithProviders(<BannerForm onSubmit={onSubmit} isPending={false} />);

    const themes = screen.getByRole("radiogroup", { name: f.theme });
    expect(
      within(themes).getByRole("radio", { name: f.themes.auto }),
    ).toBeChecked();

    await userEvent.type(titleInput(), "Скло");
    await userEvent.click(
      within(themes).getByRole("radio", { name: f.themes.sale }),
    );
    await userEvent.click(submitButton());

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ theme: "sale" });
  });

  it("keeps a value outside the palette as «Своє…», editable as before", async () => {
    const onSubmit = jest.fn();
    renderWithProviders(
      <BannerForm
        id="b1"
        defaultValues={{ title: "Старий", theme: "accent" }}
        onSubmit={onSubmit}
        isPending={false}
      />,
    );

    expect(
      await screen.findByRole("radio", { name: f.themeCustom }),
    ).toBeChecked();
    expect(screen.getByLabelText(f.themeCustomLabel)).toHaveValue("accent");

    await userEvent.click(screen.getByRole("radio", { name: f.themes.auto }));
    expect(screen.queryByLabelText(f.themeCustomLabel)).not.toBeInTheDocument();
    await userEvent.click(submitButton());

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ theme: "" });
  });
});

describe("BannerForm — «Показ» (TASK-429, БН5)", () => {
  it("shows no window fields for a DRAFT — nothing is up, so nothing comes down", () => {
    renderWithProviders(<BannerForm onSubmit={noop} isPending={false} />);

    // Default status is DRAFT.
    expect(
      within(statusGroup()).getByRole("radio", { name: f.statusDraft }),
    ).toBeChecked();
    expect(screen.queryByLabelText(f.scheduledUntil)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(f.scheduledAt)).not.toBeInTheDocument();
  });

  it("offers the take-down date for a PUBLISHED banner, with no start date", async () => {
    renderWithProviders(<BannerForm onSubmit={noop} isPending={false} />);

    await chooseStatus(f.statusPublished);

    // "Live now, down on the 1st" — the case that has no start instant at all.
    expect(screen.getByLabelText(f.scheduledUntil)).toHaveAttribute(
      "type",
      "datetime-local",
    );
    expect(screen.queryByLabelText(f.scheduledAt)).not.toBeInTheDocument();
  });

  it("offers BOTH ends of the window for a SCHEDULED banner", async () => {
    renderWithProviders(<BannerForm onSubmit={noop} isPending={false} />);

    await chooseStatus(f.statusScheduled);

    expect(screen.getByLabelText(f.scheduledAt)).toBeInTheDocument();
    expect(screen.getByLabelText(f.scheduledUntil)).toBeInTheDocument();
  });

  it("refuses to submit a window whose end precedes its start", async () => {
    const onSubmit = jest.fn();
    renderWithProviders(<BannerForm onSubmit={onSubmit} isPending={false} />);

    await userEvent.type(titleInput(), "Акція");
    await chooseStatus(f.statusScheduled);
    await userEvent.type(
      screen.getByLabelText(f.scheduledAt),
      "2026-09-01T09:00",
    );
    await userEvent.type(
      screen.getByLabelText(f.scheduledUntil),
      "2026-08-01T09:00",
    );
    await userEvent.click(submitButton());

    expect(
      await screen.findByText(f.errors.scheduledUntilBeforeStart),
    ).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("submits a valid from-to window", async () => {
    const onSubmit = jest.fn();
    renderWithProviders(<BannerForm onSubmit={onSubmit} isPending={false} />);

    await userEvent.type(titleInput(), "Акція");
    await chooseStatus(f.statusScheduled);
    await userEvent.type(
      screen.getByLabelText(f.scheduledAt),
      "2026-08-01T09:00",
    );
    await userEvent.type(
      screen.getByLabelText(f.scheduledUntil),
      "2026-09-01T09:00",
    );
    await userEvent.click(submitButton());

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0]).toMatchObject({
      status: "SCHEDULED",
      scheduledAt: "2026-08-01T09:00",
      scheduledUntil: "2026-09-01T09:00",
    });
  });

  it("keeps validation working: submitting an empty form shows the title error", async () => {
    const onSubmit = jest.fn();
    renderWithProviders(<BannerForm onSubmit={onSubmit} isPending={false} />);

    await userEvent.click(submitButton());

    expect(await screen.findByText(f.errors.titleRequired)).toBeInTheDocument();
    expect(titleInput()).toHaveAttribute("aria-invalid", "true");
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

describe("BannerForm — one sticky «Зберегти» (БН5)", () => {
  it("names the section with unsaved changes, and discards them", async () => {
    renderWithProviders(
      <BannerForm
        id="b1"
        defaultValues={{ title: "Аксесуари", theme: "" }}
        onSubmit={noop}
        isPending={false}
        submitLabel={dict.common.save}
      />,
    );

    await userEvent.click(
      await screen.findByRole("radio", { name: f.themes.success }),
    );
    expect(
      screen.getByText(dict.canon.unsavedChanges(f.theme)),
    ).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: dict.canon.discardChanges }),
    );
    expect(screen.getByRole("radio", { name: f.themes.auto })).toBeChecked();
  });

  it("says a new banner is not saved yet", () => {
    renderWithProviders(
      <BannerForm
        onSubmit={noop}
        isPending={false}
        submitLabel={dict.banners.createSubmit}
      />,
    );

    expect(screen.getByText(f.barNew)).toBeInTheDocument();
    expect(submitButton(dict.banners.createSubmit)).toHaveAttribute(
      "type",
      "submit",
    );
  });
});
