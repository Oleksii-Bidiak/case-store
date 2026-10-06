import { render, screen } from "@/shared/test/render";
import { MobilePayBar } from "./mobile-pay-bar";

describe("MobilePayBar (TASK-864)", () => {
  it("pins the label, the amount and the action to the bottom edge below md", () => {
    render(
      <MobilePayBar label="До сплати" amount="1 199 ₴">
        <button type="button">Оформити</button>
      </MobilePayBar>,
    );

    const bar = screen.getByTestId("mobile-pay-bar");
    expect(bar).toHaveClass("fixed", "inset-x-0", "bottom-0", "md:contents");
    // The marker globals.css keys the <body> bottom reserve on — without it the
    // bar covers the footer's last row at the end of the scroll.
    expect(bar).toHaveAttribute("data-mobile-bar");
    expect(bar).toHaveTextContent("До сплати");
    expect(bar).toHaveTextContent("1 199 ₴");
    expect(bar).toContainElement(
      screen.getByRole("button", { name: "Оформити" }),
    );
    // From md up the amount hides — the summary card prints it already.
    expect(screen.getByText("1 199 ₴").parentElement).toHaveClass("md:hidden");
  });

  it("publishes its height for the toaster while mounted (TASK-1771)", () => {
    // jsdom has no layout: give every element a bar-like height, so the value
    // published is the bar's own measurement, not a constant.
    const rect = jest
      .spyOn(HTMLElement.prototype, "getBoundingClientRect")
      .mockReturnValue({ height: 69 } as DOMRect);
    const root = document.documentElement;
    try {
      const { unmount } = render(
        <MobilePayBar label="До сплати" amount="1 199 ₴">
          <button type="button">Оформити</button>
        </MobilePayBar>,
      );
      // globals.css lifts the app toaster by this below md — so a toast after
      // «Прибрати N недоступних» no longer covers the focused bar CTA.
      expect(root.style.getPropertyValue("--mobile-bar-inset")).toBe("69px");

      unmount();
      expect(root.style.getPropertyValue("--mobile-bar-inset")).toBe("");
    } finally {
      rect.mockRestore();
    }
  });

  it("shows only the action while the amount is not known", () => {
    render(
      <MobilePayBar label="До сплати">
        <button type="button">Далі</button>
      </MobilePayBar>,
    );

    expect(screen.queryByText("До сплати")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Далі" })).toBeInTheDocument();
  });
});
