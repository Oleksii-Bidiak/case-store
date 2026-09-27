import { fireEvent, render } from "@testing-library/react";
import { BannerBackdrop } from "./banner-backdrop";

/** A media-library upload: the store-api uploads origin (NEXT_PUBLIC_API_URL default). */
const UPLOADED = "http://localhost:3001/uploads/banners/hero-1.webp";

function renderBackdrop(src: string | null | undefined) {
  return render(
    <div className="relative isolate">
      <BannerBackdrop src={src} sizes="100vw" scrimClassName="bg-black/45" />
    </div>,
  );
}

describe("BannerBackdrop (TASK-740)", () => {
  it("renders an uploaded banner picture through next/image, decorative", () => {
    const { container } = renderBackdrop(UPLOADED);

    const img = container.querySelector("img");
    expect(img).not.toBeNull();
    // Decorative: the banner's own title and CTA carry the meaning.
    expect(img).toHaveAttribute("alt", "");
    expect(img?.getAttribute("src")).toContain(encodeURIComponent(UPLOADED));
    expect(img).toHaveClass("object-cover");
    // Behind the copy, with the contrast scrim over it.
    const layer = img?.parentElement;
    expect(layer).toHaveClass("-z-10");
    expect(layer).toHaveAttribute("aria-hidden", "true");
    expect(layer?.querySelector(".bg-black\\/45")).not.toBeNull();
  });

  it.each([
    ["absent", undefined],
    ["null", null],
    [
      "a storefront-relative path the storefront does not serve",
      "/images/banners/hero.jpg",
    ],
    ["a host that is not an allowed image origin", "https://example.com/a.jpg"],
  ])("renders nothing for %s, so the gradient shows", (_label, src) => {
    const { container } = renderBackdrop(src);

    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector(".-z-10")).toBeNull();
  });

  it("removes itself when the picture fails to load", () => {
    const { container } = renderBackdrop(UPLOADED);

    fireEvent.error(container.querySelector("img")!);

    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector(".-z-10")).toBeNull();
  });
});
