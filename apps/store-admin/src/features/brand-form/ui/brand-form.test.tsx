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
import {
  LIBRARY_ASSET_ALT,
  MEDIA_PERMISSIONS,
  makeMediaAsset,
  pickFromLibrary,
  stubMediaLibrary,
} from "@/features/media-picker/model/media-picker.fixture";
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

describe("BrandForm — media library picker (TASK-441)", () => {
  const noop = () => {};

  it("writes the picked asset's URL into the very field the upload writes to", async () => {
    stubMediaLibrary([
      makeMediaAsset("m1", { alt: LIBRARY_ASSET_ALT, url: STORED_URL }),
    ]);
    renderWithProviders(<BrandForm onSubmit={noop} isPending={false} />, {
      auth: { permissions: MEDIA_PERMISSIONS },
    });

    await pickFromLibrary();

    // Same field, same preview, same submitted value as an upload — the picker
    // is a third way IN, not a second place the value can live.
    await waitFor(() => expect(logoField()).toHaveValue(STORED_URL));
    expect(screen.getByAltText(dict.brandForm.logoUpload.alt)).toHaveAttribute(
      "src",
      STORED_URL,
    );
  });

  it("leaves the form working unchanged for an operator with no media keys", async () => {
    const uploaded = stubUpload();
    renderWithProviders(<BrandForm onSubmit={noop} isPending={false} />);

    expect(
      screen.queryByRole("button", { name: dict.mediaPicker.trigger }),
    ).not.toBeInTheDocument();

    // The old path still works, which is the whole point of hiding rather than
    // disabling: nobody loses a feature by not being granted a new one.
    await userEvent.upload(fileInput(), pickFile());
    await waitFor(() => expect(uploaded).toEqual(["logo.png"]));
    await waitFor(() => expect(logoField()).toHaveValue(STORED_URL));
  });
});

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

    await userEvent.type(
      screen.getByRole("textbox", { name: dict.brandForm.name }),
      "Spigen",
    );
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

describe("BrandForm — canon layout (wave 198, БР5–БР9)", () => {
  const f = dict.brandForm;
  const noop = () => {};

  it("groups the fields into «Основне · Логотип · Показувати на сайті»", () => {
    renderWithProviders(<BrandForm onSubmit={noop} isPending={false} />);

    expect(
      screen.getByRole("region", { name: f.sectionMain }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: f.sectionLogo }),
    ).toBeInTheDocument();
    // A Switch, not a native checkbox.
    expect(screen.getByRole("switch", { name: f.active })).toBeChecked();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });

  it("marks the name required and shows errors under the fields with aria-invalid", async () => {
    renderWithProviders(<BrandForm onSubmit={noop} isPending={false} />);

    const name = screen.getByRole("textbox", { name: f.name });
    expect(name).toHaveAttribute("aria-required", "true");
    await userEvent.type(screen.getByLabelText(f.slug), "Apple_Inc");
    await userEvent.click(screen.getByRole("button", { name: f.submit }));

    expect(await screen.findByText(f.errorSummary(2))).toBeInTheDocument();
    expect(name).toHaveAttribute("aria-invalid", "true");
    expect(name).toHaveAccessibleDescription(f.errors.nameRequired);
    expect(screen.getByLabelText(f.slug)).toHaveAccessibleDescription(
      f.errors.slugPattern,
    );
  });

  it("puts «З медіатеки» in the upload button's row and folds the link box", async () => {
    renderWithProviders(<BrandForm onSubmit={noop} isPending={false} />, {
      auth: { permissions: MEDIA_PERMISSIONS },
    });

    const upload = screen.getByRole("button", { name: f.logoUpload.upload });
    const library = screen.getByRole("button", {
      name: dict.mediaPicker.trigger,
    });
    expect(upload.parentElement).toBe(library.parentElement);

    const fold = screen.getByRole("button", { name: f.logo });
    expect(fold).toHaveAttribute("aria-expanded", "false");
    expect(logoField()).not.toBeVisible();
    await userEvent.click(fold);
    expect(fold).toHaveAttribute("aria-expanded", "true");
    expect(logoField()).toBeVisible();
  });

  it("submits «Показувати на сайті» off when the switch is turned off", async () => {
    const onSubmit = jest.fn();
    renderWithProviders(<BrandForm onSubmit={onSubmit} isPending={false} />);

    await userEvent.type(
      screen.getByRole("textbox", { name: f.name }),
      "Mcdodo",
    );
    await userEvent.click(screen.getByRole("switch", { name: f.active }));
    await userEvent.click(screen.getByRole("button", { name: f.submit }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0]).toMatchObject({
      name: "Mcdodo",
      isActive: false,
    });
  });

  it("renders the side panel it is given", () => {
    renderWithProviders(
      <BrandForm onSubmit={noop} isPending={false} aside={<p>side panel</p>} />,
    );
    expect(screen.getByText("side panel")).toBeInTheDocument();
  });

  it("view-only: the fields as text, no save, no upload", async () => {
    renderWithProviders(
      <BrandForm
        id="b1"
        defaultValues={{ name: "Apple", slug: "apple", isActive: true }}
        onSubmit={noop}
        isPending={false}
        readOnly
      />,
    );

    expect(await screen.findByText("Apple")).toBeInTheDocument();
    expect(screen.getByText("apple")).toBeInTheDocument();
    expect(screen.getByText(dict.common.viewOnly)).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: f.submit }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: f.logoUpload.upload }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("switch", { name: f.active })).toBeDisabled();
  });
});
