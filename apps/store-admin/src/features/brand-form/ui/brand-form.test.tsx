import { http, HttpResponse } from "msw";
import {
  renderWithProviders,
  screen,
  userEvent,
  waitFor,
  within,
} from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { dict } from "@/shared/config";
import { BrandForm } from "./brand-form";

jest.mock("sonner", () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}));

const STORED_URL = "http://localhost:3001/uploads/content/abc.webp";

const pickFile = () =>
  new File(["png-bytes"], "logo.png", { type: "image/png" });

const fileInput = () => screen.getByTestId("single-image-upload-input");

/** Stub `POST /api/admin/uploads/brands`; collects the uploaded filenames. */
function stubUpload(status = 201) {
  const uploaded: string[] = [];
  server.use(
    http.post("*/api/admin/uploads/brands", async ({ request }) => {
      if (status !== 201) {
        return new HttpResponse(null, { status });
      }
      const form = await request.formData();
      const file = form.get("file");
      uploaded.push(file instanceof File ? file.name : String(file));
      return HttpResponse.json({
        data: { url: STORED_URL, blurDataUrl: "data:image/webp;base64,BLUR" },
      });
    }),
  );
  return uploaded;
}

const logoField = () =>
  screen.getByLabelText(dict.brandForm.logo) as HTMLInputElement;

describe("BrandForm — logo upload (TASK-424)", () => {
  const noop = () => {};

  it("keeps the URL field reachable by its label and offers a file picker", () => {
    renderWithProviders(
      <BrandForm onSubmit={noop} isPending={false} />, //
    );

    // The label still names the text input — an operator (and every existing
    // test) must still be able to paste an external CDN link.
    expect(logoField()).toHaveValue("");
    expect(
      screen.getByRole("button", { name: dict.brandForm.logoUpload.upload }),
    ).toBeInTheDocument();
  });

  it("uploads the picked file and writes the stored URL into the form field", async () => {
    const uploaded = stubUpload();
    renderWithProviders(<BrandForm onSubmit={noop} isPending={false} />);

    await userEvent.upload(fileInput(), pickFile());

    await waitFor(() => expect(uploaded).toEqual(["logo.png"]));
    // The URL the API stored is what the form will submit — not a local blob.
    await waitFor(() => expect(logoField()).toHaveValue(STORED_URL));
    expect(screen.getByAltText(dict.brandForm.logoUpload.alt)).toHaveAttribute(
      "src",
      STORED_URL,
    );
  });

  it("submits the uploaded URL as the logo", async () => {
    stubUpload();
    const onSubmit = jest.fn();
    renderWithProviders(<BrandForm onSubmit={onSubmit} isPending={false} />);

    await userEvent.type(screen.getByLabelText(dict.brandForm.name), "Spigen");
    await userEvent.upload(fileInput(), pickFile());
    await waitFor(() => expect(logoField()).toHaveValue(STORED_URL));

    await userEvent.click(
      screen.getByRole("button", { name: dict.brandForm.submit }),
    );

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ logo: STORED_URL });
  });

  it("keeps a 413 on screen and leaves the field untouched", async () => {
    stubUpload(413);
    renderWithProviders(<BrandForm onSubmit={noop} isPending={false} />);

    await userEvent.upload(fileInput(), pickFile());

    // Inline, not only a toast: the reason has to survive on screen while the
    // operator picks a smaller file.
    expect(
      await screen.findByText(dict.brandForm.logoUpload.errorTooLarge),
    ).toBeInTheDocument();
    expect(logoField()).toHaveValue("");
  });

  it("maps a 415 onto the unsupported-format message", async () => {
    stubUpload(415);
    renderWithProviders(<BrandForm onSubmit={noop} isPending={false} />);

    await userEvent.upload(fileInput(), pickFile());

    expect(
      await screen.findByText(dict.brandForm.logoUpload.errorUnsupportedType),
    ).toBeInTheDocument();
  });

  it("clears the field when the operator removes the image", async () => {
    stubUpload();
    renderWithProviders(<BrandForm onSubmit={noop} isPending={false} />);

    await userEvent.upload(fileInput(), pickFile());
    await waitFor(() => expect(logoField()).toHaveValue(STORED_URL));

    await userEvent.click(
      screen.getByRole("button", { name: dict.brandForm.logoUpload.remove }),
    );
    // Confirm dialog — clearing the field is still a change worth confirming,
    // and the dialog is where the copy explains the stored file is NOT deleted.
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent(
      dict.brandForm.logoUpload.removeDescription,
    );
    await userEvent.click(
      within(dialog).getByRole("button", {
        name: dict.brandForm.logoUpload.remove,
      }),
    );

    await waitFor(() => expect(logoField()).toHaveValue(""));
  });
});
