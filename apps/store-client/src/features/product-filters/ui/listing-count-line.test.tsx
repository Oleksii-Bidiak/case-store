import { render, screen } from "@testing-library/react";
import { ListingCountLine, listingCountText } from "./listing-count-line";

describe("listingCountText (Д3-2 Catalog §3)", () => {
  it("reads «{N товарів}» when nothing narrows the category", () => {
    expect(listingCountText({ shown: 214, total: 214 })).toBe("214 товарів");
    expect(listingCountText({ shown: 1, total: 1 })).toBe("1 товар");
    expect(listingCountText({ shown: 3, total: 3 })).toBe("3 товари");
  });

  it("reads «{shown} з {N товарів}» with filters, grouping thousands", () => {
    expect(listingCountText({ shown: 18, total: 214 })).toBe(
      "18 з 214 товарів",
    );
    expect(listingCountText({ shown: 5, total: 21 })).toBe("5 з 21 товару");
    expect(
      listingCountText({ shown: 18, total: 1234 }).replace(/\s/g, " "),
    ).toBe("18 з 1 234 товарів");
  });

  it("names the device the filter is on for", () => {
    expect(
      listingCountText({
        shown: 12,
        total: 56,
        device: { name: "iPhone 15 Pro", family: "iphone" },
      }),
    ).toBe("12 з 56 товарів підходять до iPhone 15 Pro");
    expect(
      listingCountText({
        shown: 1,
        total: 56,
        device: { name: "iPhone 13", family: "iphone" },
      }),
    ).toBe("1 з 56 товарів підходить до iPhone 13");
  });

  it("says «для ваших k пристроїв» for the all-devices scope", () => {
    expect(listingCountText({ shown: 15, total: 56, allDevicesCount: 3 })).toBe(
      "15 з 56 товарів — для ваших 3 пристроїв",
    );
  });
});

describe("ListingCountLine", () => {
  it("is a live region that holds its height until the numbers land", () => {
    const { container } = render(
      <ListingCountLine shown={undefined} total={undefined} />,
    );
    const line = container.querySelector("p")!;
    expect(line).toHaveAttribute("aria-live", "polite");
    expect(line).toHaveClass("min-h-5");
    expect(line).toBeEmptyDOMElement();
  });

  it("leads with the active device's family dot", () => {
    render(
      <ListingCountLine
        shown={12}
        total={56}
        device={{ name: "iPhone 15 Pro", family: "iphone" }}
      />,
    );
    expect(screen.getByTestId("count-line-family-dot")).toHaveClass(
      "bg-family-iphone-strong",
    );
    expect(
      screen.getByText("12 з 56 товарів підходять до iPhone 15 Pro"),
    ).toBeInTheDocument();
  });
});
