import { render, screen } from "@/shared/test/render";
import userEvent from "@testing-library/user-event";
import { SortableColumnHeader } from "./sortable-column-header";

function renderHeader(
  props: Partial<React.ComponentProps<typeof SortableColumnHeader>> = {},
) {
  const onSort = jest.fn();
  render(
    <table>
      <thead>
        <tr>
          <SortableColumnHeader
            field="createdAt"
            label="Created"
            onSort={onSort}
            {...props}
          />
        </tr>
      </thead>
    </table>,
  );
  return { onSort };
}

describe("SortableColumnHeader", () => {
  it("renders the inactive state (aria-sort none) when it is not the current sort", () => {
    renderHeader();
    expect(screen.getByRole("columnheader")).toHaveAttribute(
      "aria-sort",
      "none",
    );
    expect(screen.getByRole("button", { name: /Created/ })).toBeInTheDocument();
  });

  it("renders ascending when active + asc", () => {
    renderHeader({ sortBy: "createdAt", sortOrder: "asc" });
    expect(screen.getByRole("columnheader")).toHaveAttribute(
      "aria-sort",
      "ascending",
    );
  });

  it("renders descending when active + desc", () => {
    renderHeader({ sortBy: "createdAt", sortOrder: "desc" });
    expect(screen.getByRole("columnheader")).toHaveAttribute(
      "aria-sort",
      "descending",
    );
  });

  it("calls onSort(field) on click", async () => {
    const { onSort } = renderHeader();
    await userEvent.click(screen.getByRole("button"));
    expect(onSort).toHaveBeenCalledWith("createdAt");
  });

  it("is keyboard-accessible — Enter triggers onSort", async () => {
    const { onSort } = renderHeader();
    screen.getByRole("button").focus();
    await userEvent.keyboard("{Enter}");
    expect(onSort).toHaveBeenCalledWith("createdAt");
  });
});
