import { render, screen } from "@testing-library/react";
import { dict } from "@/shared/config";
import type { BannerEntity } from "@/shared/api/generated/models";
import { AnnouncementBar } from "./announcement-bar";

/**
 * AnnouncementBar — the support phone (TASK-873).
 *
 * The strip used to print a dictionary number («0 800 00 00 00») that rang
 * nobody and disagreed with the footer. It now shows the shop's
 * SiteContactSettings.phone and renders no link at all when that is unset.
 */
describe("AnnouncementBar — support phone (TASK-873)", () => {
  it("renders the shop's contact phone as a tel: link with the number in its name", () => {
    render(<AnnouncementBar phone="+380 44 123-45-67" />);

    const link = screen.getByRole("link", {
      name: `${dict.header.phoneAria}: +380 44 123-45-67`,
    });
    expect(link).toHaveAttribute("href", "tel:+380441234567");
    expect(link).toHaveTextContent("+380 44 123-45-67");
  });

  it.each([
    ["absent", undefined],
    ["null (fetch failed)", null],
    ["blank", "   "],
    ["undialable", "—"],
  ])("hides the phone when it is %s", (_label, phone) => {
    const { container } = render(<AnnouncementBar phone={phone} />);

    expect(container.querySelector('a[href^="tel:"]')).toBeNull();
    // The message still renders on its own.
    expect(screen.getByText(dict.header.announcement)).toBeInTheDocument();
  });

  it("keeps the banner's CTA link alongside the phone", () => {
    render(
      <AnnouncementBar
        phone="0 800 30 30 30"
        banner={{ title: "Знижки тижня", ctaHref: "/promo" } as BannerEntity}
      />,
    );

    expect(screen.getByRole("link", { name: "Знижки тижня" })).toHaveAttribute(
      "href",
      "/promo",
    );
    expect(
      screen.getByRole("link", {
        name: `${dict.header.phoneAria}: 0 800 30 30 30`,
      }),
    ).toHaveAttribute("href", "tel:0800303030");
  });
});
