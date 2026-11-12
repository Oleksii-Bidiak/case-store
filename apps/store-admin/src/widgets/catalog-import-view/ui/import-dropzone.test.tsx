import { renderWithProviders, screen, userEvent } from "@/shared/test/render";
import { dict } from "@/shared/config";
import { ImportDropzone, MAX_IMPORT_BYTES } from "./import-dropzone";

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

describe("ImportDropzone — the API's file rules, before the upload (TASK-1984)", () => {
  const xlsx = (size: number) => {
    const file = new File(["x"], "price.xlsx");
    Object.defineProperty(file, "size", { value: size });
    return file;
  };

  it("refuses a file above the API's 25 MB under the zone, without uploading", async () => {
    const onFile = jest.fn();
    renderWithProviders(<ImportDropzone onFile={onFile} isUploading={false} />);

    await userEvent.upload(
      screen.getByLabelText(d.fileInputLabel),
      xlsx(MAX_IMPORT_BYTES + 1),
    );

    expect(onFile).not.toHaveBeenCalled();
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent(d.fileTooLarge(25));
    expect(screen.getByRole("button", { name: d.pickFile })).toHaveAttribute(
      "aria-describedby",
      expect.stringContaining(alert.id),
    );
  });

  it("refuses an empty file and lets a file of exactly the limit through", async () => {
    const onFile = jest.fn();
    renderWithProviders(<ImportDropzone onFile={onFile} isUploading={false} />);
    const input = screen.getByLabelText(d.fileInputLabel);

    await userEvent.upload(input, xlsx(0));
    expect(screen.getByRole("alert")).toHaveTextContent(d.emptyFile);
    expect(onFile).not.toHaveBeenCalled();

    await userEvent.upload(input, xlsx(MAX_IMPORT_BYTES));
    expect(onFile).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
