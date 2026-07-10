import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { dict } from "@/shared/config";
import { BannerPlacementPreview } from "./banner-placement-preview";

const d = dict.bannerPreview;

describe("BannerPlacementPreview (TASK-265)", () => {
  it("renders the HERO_SLIDE variant with title, subtitle and CTA label", () => {
    render(
      <BannerPlacementPreview
        placement="HERO_SLIDE"
        title="Літній розпродаж"
        subtitle="Знижки до 40%"
        ctaLabel="До каталогу"
        ctaHref="/catalog"
      />,
    );

    const hero = screen.getByTestId("banner-preview-hero-slide");
    expect(hero).toHaveTextContent("Літній розпродаж");
    expect(hero).toHaveTextContent("Знижки до 40%");
    expect(hero).toHaveTextContent("До каталогу");
    expect(
      screen.queryByTestId("banner-preview-promo-tile"),
    ).not.toBeInTheDocument();
  });

  it("renders the PROMO_TILE variant and applies a literal accent theme", () => {
    render(
      <BannerPlacementPreview
        placement="PROMO_TILE"
        title="Trade-in"
        subtitle="Обміняй старе на нове"
        ctaLabel="Дізнатися більше"
        theme="success"
      />,
    );

    const tile = screen.getByTestId("banner-preview-promo-tile");
    expect(tile).toHaveTextContent("Trade-in");
    expect(tile).toHaveTextContent("Обміняй старе на нове");
    expect(tile).toHaveTextContent("Дізнатися більше");
    expect(tile.className).toContain("bg-success/10");
  });

  it("PROMO_TILE falls back to the primary accent for a non-accent theme", () => {
    render(
      <BannerPlacementPreview
        placement="PROMO_TILE"
        title="Розстрочка"
        theme="whatever"
      />,
    );

    expect(screen.getByTestId("banner-preview-promo-tile").className).toContain(
      "bg-primary/10",
    );
  });

  it("PROMO_BANNER renders the CTA button only when BOTH label and href are set", () => {
    const { rerender } = render(
      <BannerPlacementPreview
        placement="PROMO_BANNER"
        title="Акція тижня"
        ctaLabel="Купити"
        ctaHref="/catalog"
      />,
    );

    expect(screen.getByTestId("banner-preview-promo-banner")).toHaveTextContent(
      "Купити",
    );

    // Lone label with no href → no button, mirroring the storefront rule.
    rerender(
      <BannerPlacementPreview
        placement="PROMO_BANNER"
        title="Акція тижня"
        ctaLabel="Купити"
      />,
    );
    expect(
      screen.getByTestId("banner-preview-promo-banner"),
    ).not.toHaveTextContent("Купити");
  });

  it("ANNOUNCEMENT_BAR renders only the title (never subtitle/ctaLabel) plus the hint", () => {
    render(
      <BannerPlacementPreview
        placement="ANNOUNCEMENT_BAR"
        title="Безкоштовна доставка від 1000 грн"
        subtitle="Цей підзаголовок ігнорується"
        ctaLabel="Ця кнопка ігнорується"
        ctaHref="/delivery"
      />,
    );

    const bar = screen.getByTestId("banner-preview-announcement-bar");
    expect(bar).toHaveTextContent("Безкоштовна доставка від 1000 грн");
    expect(
      screen.queryByText("Цей підзаголовок ігнорується"),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Ця кнопка ігнорується")).not.toBeInTheDocument();
    expect(screen.getByText(d.announcementBarNote)).toBeInTheDocument();
  });

  it("renders the empty-title placeholder instead of a blank space", () => {
    render(<BannerPlacementPreview placement="HERO_SLIDE" title="" />);

    expect(screen.getByTestId("banner-preview-hero-slide")).toHaveTextContent(
      d.emptyTitle,
    );
  });

  it("viewport toggle defaults to desktop and constrains width in mobile mode", async () => {
    render(<BannerPlacementPreview placement="HERO_SLIDE" title="Слайд" />);

    const desktopButton = screen.getByRole("button", {
      name: d.viewportDesktop,
    });
    const mobileButton = screen.getByRole("button", { name: d.viewportMobile });
    const frame = screen.getByTestId("banner-preview-frame");

    expect(desktopButton).toHaveAttribute("aria-pressed", "true");
    expect(mobileButton).toHaveAttribute("aria-pressed", "false");
    expect(frame.className).not.toContain("max-w-[375px]");

    await userEvent.click(mobileButton);

    expect(mobileButton).toHaveAttribute("aria-pressed", "true");
    expect(frame.className).toContain("max-w-[375px]");
  });
});
