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

  /**
   * The facet type rule (TASK-488 / owner decision B-10): a catalogue filter is
   * «Так/Ні» or «Вибір зі списку». The API returns a 400 for anything else; the
   * form stops the operator before they get there and says why.
   */
  describe("the «використовувати як фільтр» checkbox", () => {
    async function chooseType(name: string) {
      await userEvent.click(screen.getByRole("combobox"));
      await userEvent.click(await screen.findByRole("option", { name }));
    }

    it("is unavailable for a TEXT definition, with the rule spelled out", () => {
      renderWithProviders(
        <AttributeDefinitionForm
          onSubmit={jest.fn()}
          onCancel={jest.fn()}
          isPending={false}
          submitLabel={d.submitCreate}
        />,
      );

      // TEXT is the default type.
      expect(screen.getByLabelText(d.isFilterable)).toBeDisabled();
      expect(screen.getByText(d.isFilterableHint)).toBeInTheDocument();
    });

    it("is available for BOOLEAN and for SELECT", async () => {
      renderWithProviders(
        <AttributeDefinitionForm
          onSubmit={jest.fn()}
          onCancel={jest.fn()}
          isPending={false}
          submitLabel={d.submitCreate}
        />,
      );

      await chooseType(d.typeBoolean);
      await waitFor(() =>
        expect(screen.getByLabelText(d.isFilterable)).toBeEnabled(),
      );

      await chooseType(d.typeSelect);
      await waitFor(() =>
        expect(screen.getByLabelText(d.isFilterable)).toBeEnabled(),
      );
    });

    it("unticks itself when the type changes to one that cannot be a facet", async () => {
      const onSubmit = jest.fn();
      renderWithProviders(
        <AttributeDefinitionForm
          defaultValues={{
            key: "magsafe",
            label: "MagSafe",
            type: "BOOLEAN",
            isFilterable: true,
          }}
          onSubmit={onSubmit}
          onCancel={jest.fn()}
          isPending={false}
          submitLabel={d.submitCreate}
        />,
      );

      expect(screen.getByLabelText(d.isFilterable)).toBeChecked();

      await chooseType(d.typeNumber);

      // Not left as a hidden `true` for the submit to fail on: the form clears
      // it, so «зберегти» succeeds and the definition simply stops being a facet.
      await waitFor(() =>
        expect(screen.getByLabelText(d.isFilterable)).not.toBeChecked(),
      );
      await userEvent.click(
        screen.getByRole("button", { name: d.submitCreate }),
      );
      await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
      expect(onSubmit.mock.calls[0][0]).toMatchObject({ isFilterable: false });
    });
  });
});
