import { renderWithProviders, screen, userEvent } from "@/shared/test/render";
import { dict } from "@/shared/config";
import { ImportDropzone } from "./import-dropzone";

const d = dict.catalogImport;

describe("ImportDropzone — keyboard and screen readers", () => {
  it("keeps «Обрати файл» focused and inert while the file uploads", async () => {
    const onFile = jest.fn();
    const { rerender } = renderWithProviders(
      <ImportDropzone onFile={onFile} isUploading={false} />,
    );
    const button = screen.getByRole("button", { name: d.pickFile });
    button.focus();

    rerender(<ImportDropzone onFile={onFile} isUploading />);

    const busy = screen.getByRole("button", { name: d.pickFile });
    expect(busy).toBe(button);
    expect(busy).toHaveFocus();
    expect(busy).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("status")).toHaveTextContent(d.uploading);
  });

  it("names the hidden file input apart from the button", () => {
    renderWithProviders(
      <ImportDropzone onFile={jest.fn()} isUploading={false} />,
    );

    expect(screen.queryAllByLabelText(d.pickFile)).toHaveLength(0);
    expect(screen.getByLabelText(d.fileInputLabel)).toHaveAttribute(
      "type",
      "file",
    );
  });

  it("does not open the picker mid-upload", async () => {
    const click = jest.spyOn(HTMLInputElement.prototype, "click");
    renderWithProviders(<ImportDropzone onFile={jest.fn()} isUploading />);

    await userEvent.click(screen.getByRole("button", { name: d.pickFile }));

    expect(click).not.toHaveBeenCalled();
    click.mockRestore();
  });
});
