import {
  renderWithProviders,
  screen,
  userEvent,
  waitFor,
} from "@/shared/test/render";
import { dict } from "@/shared/config";
import { BlogCategoryForm } from "./blog-category-form";

const f = dict.blogCategoryForm;

describe("BlogCategoryForm (BlogCategoriesProposal КБ4)", () => {
  it("names the slug for what it is — the filter address on the site", () => {
    renderWithProviders(
      <BlogCategoryForm onSubmit={jest.fn()} isPending={false} />,
    );

    expect(screen.getByLabelText(f.slug)).toBeInTheDocument();
    expect(screen.getByText(f.slugPrefix)).toBeInTheDocument();
    expect(screen.getByText(f.slugHint)).toBeInTheDocument();
    expect(screen.getByText(f.chipHint)).toBeInTheDocument();
  });

  it("previews the generated address from the name", async () => {
    renderWithProviders(
      <BlogCategoryForm onSubmit={jest.fn()} isPending={false} />,
    );

    await userEvent.type(
      screen.getByRole("textbox", { name: f.name }),
      "Огляди",
    );

    expect(screen.getByTestId("slug-preview")).toBeInTheDocument();
  });

  it("refuses an empty name under the field, and does not submit", async () => {
    const onSubmit = jest.fn();
    renderWithProviders(
      <BlogCategoryForm onSubmit={onSubmit} isPending={false} />,
    );

    await userEvent.click(screen.getByRole("button", { name: f.submit }));

    expect(await screen.findByText(f.errors.nameRequired)).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: f.name })).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("submits the values and offers «Скасувати» when the host closes it", async () => {
    const onSubmit = jest.fn();
    const onCancel = jest.fn();
    renderWithProviders(
      <BlogCategoryForm
        onSubmit={onSubmit}
        onCancel={onCancel}
        isPending={false}
      />,
    );

    await userEvent.type(
      screen.getByRole("textbox", { name: f.name }),
      "Огляди",
    );
    await userEvent.click(screen.getByRole("button", { name: f.submit }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ name: "Огляди" });

    await userEvent.click(
      screen.getByRole("button", { name: dict.common.cancel }),
    );
    expect(onCancel).toHaveBeenCalled();
  });
});
