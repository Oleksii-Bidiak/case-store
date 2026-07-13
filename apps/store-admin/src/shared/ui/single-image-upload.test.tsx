import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  SingleImageUpload,
  type SingleImageUploadLabels,
} from "./single-image-upload";

const labels: SingleImageUploadLabels = {
  alt: "Логотип",
  empty: "Ще не завантажено",
  upload: "Завантажити",
  replace: "Замінити",
  delete: "Видалити логотип",
  deleteTitle: "Видалити логотип?",
  deleteDescription: "Це назавжди.",
  cancel: "Скасувати",
  confirmDelete: "Видалити",
};

function setup(
  props: Partial<React.ComponentProps<typeof SingleImageUpload>> = {},
) {
  const onSelectFile = jest.fn();
  const onDelete = jest.fn();
  render(
    <SingleImageUpload
      imageUrl={null}
      accept=".png"
      labels={labels}
      onSelectFile={onSelectFile}
      onDelete={onDelete}
      {...props}
    />,
  );
  return { onSelectFile, onDelete };
}

const fileInput = () =>
  screen.getByTestId("single-image-upload-input") as HTMLInputElement;

const makeFile = (name = "logo.png") =>
  new File(["x"], name, { type: "image/png" });

describe("SingleImageUpload", () => {
  it("hands the picked file to the caller", async () => {
    const { onSelectFile } = setup();

    await userEvent.upload(fileInput(), makeFile());

    expect(onSelectFile).toHaveBeenCalledTimes(1);
    expect(onSelectFile.mock.calls[0][0]).toBeInstanceOf(File);
    expect(onSelectFile.mock.calls[0][0].name).toBe("logo.png");
  });

  // Re-picking the SAME file after a failed upload must still fire `change`,
  // which only happens if the input's value was cleared after the first pick.
  it("clears the input so the same file can be re-picked", async () => {
    const { onSelectFile } = setup();

    await userEvent.upload(fileInput(), makeFile());
    expect(fileInput().value).toBe("");

    await userEvent.upload(fileInput(), makeFile());
    expect(onSelectFile).toHaveBeenCalledTimes(2);
  });

  it("swaps the picker label and reveals delete once an image exists", () => {
    setup({ imageUrl: "https://cdn.test/logo.png" });

    expect(
      screen.getByRole("button", { name: labels.replace }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: labels.upload }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(labels.empty)).not.toBeInTheDocument();
    expect(screen.getByAltText(labels.alt)).toBeInTheDocument();
  });

  it("disables the controls while a mutation is in flight", () => {
    setup({ imageUrl: "https://cdn.test/logo.png", isUploading: true });

    expect(screen.getByRole("button", { name: labels.replace })).toBeDisabled();
    expect(screen.getByRole("button", { name: labels.delete })).toBeDisabled();
  });

  it("renders the hint and the error alert", () => {
    setup({ hint: "PNG до 1 МБ", error: "Файл завеликий" });

    expect(screen.getByText("PNG до 1 МБ")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Файл завеликий");
  });

  it("calls onDelete only after the confirm dialog is accepted", async () => {
    const { onDelete } = setup({ imageUrl: "https://cdn.test/logo.png" });

    await userEvent.click(screen.getByRole("button", { name: labels.delete }));
    expect(await screen.findByText(labels.deleteTitle)).toBeInTheDocument();
    expect(onDelete).not.toHaveBeenCalled();

    await userEvent.click(
      screen.getByRole("button", { name: labels.confirmDelete }),
    );

    await waitFor(() => expect(onDelete).toHaveBeenCalledTimes(1));
  });

  it("does not call onDelete when the dialog is cancelled", async () => {
    const { onDelete } = setup({ imageUrl: "https://cdn.test/logo.png" });

    await userEvent.click(screen.getByRole("button", { name: labels.delete }));
    await userEvent.click(
      await screen.findByRole("button", { name: labels.cancel }),
    );

    await waitFor(() =>
      expect(screen.queryByText(labels.deleteTitle)).not.toBeInTheDocument(),
    );
    expect(onDelete).not.toHaveBeenCalled();
  });
});
