import { SearchX } from "lucide-react";
import { render, screen, userEvent } from "@/shared/test/render";
import { ListingEmptyState } from "./listing-empty-state";

describe("ListingEmptyState (TASK-870)", () => {
  it("renders the line, the helper text and a primary 44px reset button", async () => {
    const user = userEvent.setup();
    const onClick = jest.fn();
    const { container } = render(
      <ListingEmptyState
        icon={SearchX}
        heading="Товари не знайдено"
        body="Спробуйте змінити параметри фільтра."
        action={{ label: "Скинути всі фільтри", onClick }}
      />,
    );

    expect(screen.getByText("Товари не знайдено")).toBeInTheDocument();
    expect(
      screen.getByText("Спробуйте змінити параметри фільтра."),
    ).toBeInTheDocument();

    const button = screen.getByRole("button", { name: "Скинути всі фільтри" });
    expect(button).toHaveAttribute("data-variant", "default");
    expect(button).toHaveClass("h-11");

    await user.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);

    // The glyph is decoration: the disc around it is hidden from AT.
    expect(container.querySelector("svg")?.closest("[aria-hidden]")).not.toBe(
      null,
    );
  });

  it("renders a link action as a primary-styled link, without a body", () => {
    render(
      <ListingEmptyState
        icon={SearchX}
        heading="Почніть пошук"
        action={{ label: "До каталогу", href: "/products" }}
      />,
    );

    const link = screen.getByRole("link", { name: "До каталогу" });
    expect(link).toHaveAttribute("href", "/products");
    expect(link).toHaveAttribute("data-variant", "default");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
