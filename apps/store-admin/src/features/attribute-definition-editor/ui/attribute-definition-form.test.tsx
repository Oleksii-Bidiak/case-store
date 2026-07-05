import {
  renderWithProviders,
  screen,
  userEvent,
  waitFor,
} from "@/shared/test/render";
import { dict } from "@/shared/config";
import { AttributeDefinitionForm } from "./attribute-definition-form";

const d = dict.attributeDefinitions;

describe("AttributeDefinitionForm (TASK-191)", () => {
  it("shows the options textarea only when type is SELECT", async () => {
    renderWithProviders(
      <AttributeDefinitionForm
        onSubmit={jest.fn()}
        onCancel={jest.fn()}
        isPending={false}
        submitLabel={d.submitCreate}
      />,
    );

    // TEXT is the default → no options field.
    expect(screen.queryByLabelText(d.options)).not.toBeInTheDocument();

    // Switch the type Select to "Вибір зі списку" (SELECT).
    await userEvent.click(screen.getByRole("combobox"));
    await userEvent.click(
      await screen.findByRole("option", { name: d.typeSelect }),
    );

    expect(await screen.findByLabelText(d.options)).toBeInTheDocument();
  });

  it("rejects an invalid key with an inline error and does not submit", async () => {
    const onSubmit = jest.fn();
    renderWithProviders(
      <AttributeDefinitionForm
        onSubmit={onSubmit}
        onCancel={jest.fn()}
        isPending={false}
        submitLabel={d.submitCreate}
      />,
    );

    await userEvent.type(screen.getByLabelText(d.key), "has spaces!");
    await userEvent.type(screen.getByLabelText(d.label), "Матеріал");
    await userEvent.click(screen.getByRole("button", { name: d.submitCreate }));

    expect(await screen.findByText(d.errors.keyPattern)).toBeInTheDocument();
    await waitFor(() => expect(onSubmit).not.toHaveBeenCalled());
  });

  it("submits a valid TEXT definition", async () => {
    const onSubmit = jest.fn();
    renderWithProviders(
      <AttributeDefinitionForm
        onSubmit={onSubmit}
        onCancel={jest.fn()}
        isPending={false}
        submitLabel={d.submitCreate}
      />,
    );

    await userEvent.type(screen.getByLabelText(d.key), "material");
    await userEvent.type(screen.getByLabelText(d.label), "Матеріал");
    await userEvent.click(screen.getByRole("button", { name: d.submitCreate }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0]).toMatchObject({
      key: "material",
      label: "Матеріал",
    });
  });
});
