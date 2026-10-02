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
    expect(bar).toHaveTextContent("До сплати");
    expect(bar).toHaveTextContent("1 199 ₴");
    expect(bar).toContainElement(
      screen.getByRole("button", { name: "Оформити" }),
    );
    // From md up the amount hides — the summary card prints it already.
    expect(screen.getByText("1 199 ₴").parentElement).toHaveClass("md:hidden");
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
