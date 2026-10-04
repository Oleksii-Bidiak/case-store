/**
 * Pictures inside the text (wave 198, RichTextEditorProposal РЕ1–РЕ7,
 * TASK-1071 — the admin half).
 *
 * The editor lives in `shared` and cannot know about the media library, so the
 * library and the uploader arrive through `useRichTextImageSources`, called by
 * whatever sits in the `imagePicker` slot. These tests play that slot with
 * fakes; `features/media-picker` tests the real one.
 *
 * What is NOT here, on purpose: size, alignment and captions. The API's
 * sanitizer keeps `img[src, alt]` and nothing else, so markup for them would be
 * stripped on the next save — the editor must not offer what the server throws
 * away (see `image-node.ts`).
 */

import * as React from "react";
import {
  act,
  fireEvent,
  render,
  screen,
  userEvent,
  waitFor,
  within,
} from "@/shared/test/render";
import type { Editor } from "@tiptap/react";
import { toast } from "sonner";
import { dict } from "@/shared/config";
// The module, NOT `./index`: the barrel renders `null` under jsdom.
import { RichTextEditor } from "./rich-text-editor";
import {
  useRichTextImageSources,
  type RichTextImageSources,
} from "./image-sources";
import type { RichTextImage } from "./rich-text-editor";
import { RichTextImageMenu } from "./image-actions";

jest.mock("sonner", () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}));

const t = dict.richTextEditor;
const EDITOR_LABEL = "Текстовий редактор";

function editorOf(editable: HTMLElement): Editor {
  return (editable as HTMLElement & { editor: Editor }).editor;
}

/** What the media-picker feature does in the slot, with fakes. */
function FakeSources(props: RichTextImageSources) {
  useRichTextImageSources(props);
  return <RichTextImageMenu />;
}

interface Deferred {
  promise: Promise<RichTextImage>;
  resolve: (image: RichTextImage) => void;
  reject: (error: Error) => void;
}

function deferred(): Deferred {
  let resolve!: (image: RichTextImage) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<RichTextImage>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function Harness({
  initial = "<p>Текст</p>",
  onChange = () => {},
  sources,
}: {
  initial?: string;
  onChange?: (html: string) => void;
  sources?: RichTextImageSources;
}) {
  const [value, setValue] = React.useState(initial);
  return (
    <RichTextEditor
      value={value}
      onChange={(html) => {
        setValue(html);
        onChange(html);
      }}
      imagePicker={() =>
        sources ? <FakeSources {...sources} /> : <RichTextImageMenu />
      }
    />
  );
}

async function openImageMenu() {
  await userEvent.click(
    await screen.findByRole("button", { name: t.imageMenu }),
  );
  return screen.findByRole("menu");
}

const pngFile = (name = "camera.png") =>
  new File(["png-bytes"], name, { type: "image/png" });

beforeEach(() => {
  jest.mocked(toast.success).mockClear();
  jest.mocked(toast.error).mockClear();
});

describe("RichTextEditor — «Зображення ▾» (РЕ1)", () => {
  it("offers the library, an upload and a link, with the drop hint", async () => {
    render(<Harness sources={{ openLibrary: jest.fn(), upload: jest.fn() }} />);

    const menu = await openImageMenu();
    expect(
      within(menu).getByRole("menuitem", { name: t.imageFromLibrary }),
    ).toBeInTheDocument();
    expect(
      within(menu).getByRole("menuitem", { name: t.imageUpload }),
    ).toBeInTheDocument();
    expect(
      within(menu).getByRole("menuitem", { name: t.imageByUrl }),
    ).toBeInTheDocument();
    expect(within(menu).getByText(t.imageMenuHint)).toBeInTheDocument();
  });

  it("offers only what the slot can supply — a link always", async () => {
    render(<Harness sources={{}} />);

    const menu = await openImageMenu();
    expect(
      within(menu).queryByRole("menuitem", { name: t.imageFromLibrary }),
    ).not.toBeInTheDocument();
    expect(
      within(menu).queryByRole("menuitem", { name: t.imageUpload }),
    ).not.toBeInTheDocument();
    expect(
      within(menu).getByRole("menuitem", { name: t.imageByUrl }),
    ).toBeInTheDocument();
  });

  it("inserts what the library hands back, alt text and all", async () => {
    const onChange = jest.fn();
    const openLibrary = jest.fn();
    render(<Harness onChange={onChange} sources={{ openLibrary }} />);

    const menu = await openImageMenu();
    await userEvent.click(
      within(menu).getByRole("menuitem", { name: t.imageFromLibrary }),
    );

    expect(openLibrary).toHaveBeenCalledTimes(1);
    const pick = openLibrary.mock.calls[0][0] as (image: RichTextImage) => void;
    act(() => pick({ src: "/uploads/media/a.webp", alt: "Камери" }));

    await waitFor(() => expect(onChange).toHaveBeenCalled());
    const html = onChange.mock.calls.at(-1)?.[0] as string;
    expect(html).toContain('src="/uploads/media/a.webp"');
    expect(html).toContain('alt="Камери"');
    expect(html).toContain("Текст");
  });

  it("inserts an image by address, without inventing an alt", async () => {
    const onChange = jest.fn();
    render(<Harness onChange={onChange} sources={{}} />);

    const menu = await openImageMenu();
    await userEvent.click(
      within(menu).getByRole("menuitem", { name: t.imageByUrl }),
    );
    const field = await screen.findByRole("textbox", {
      name: t.imageUrlLabel,
    });
    // The honest limit of this path: other hosts vanish on save.
    expect(screen.getByText(t.imageUrlHint)).toBeInTheDocument();

    await userEvent.type(field, "https://cdn.example.com/a.jpg{Enter}");

    await waitFor(() => expect(onChange).toHaveBeenCalled());
    const html = onChange.mock.calls.at(-1)?.[0] as string;
    expect(html).toContain('src="https://cdn.example.com/a.jpg"');
    expect(html).not.toContain("alt=");
  });

  it("refuses an address the server would never keep", async () => {
    const onChange = jest.fn();
    render(<Harness onChange={onChange} sources={{}} />);

    const menu = await openImageMenu();
    await userEvent.click(
      within(menu).getByRole("menuitem", { name: t.imageByUrl }),
    );
    const field = await screen.findByRole("textbox", {
      name: t.imageUrlLabel,
    });
    await userEvent.type(field, "javascript:alert(1){Enter}");

    expect(await screen.findByText(t.imageUrlInvalid)).toBeInTheDocument();
    expect(field).toHaveAttribute("aria-invalid", "true");
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe("RichTextEditor — upload by drop and paste (РЕ5, РЕ6)", () => {
  it("shows the upload in place while it runs, then puts the picture there", async () => {
    const onChange = jest.fn();
    const pending = deferred();
    const upload = jest.fn(
      (_file: File, onProgress: (percent: number) => void) => {
        onProgress(64);
        return pending.promise;
      },
    );
    render(<Harness onChange={onChange} sources={{ upload }} />);

    const editable = await screen.findByLabelText(EDITOR_LABEL);
    await waitFor(() => expect(editable).toHaveTextContent("Текст"));

    fireEvent.drop(editable, {
      dataTransfer: { files: [pngFile()], items: [], types: ["Files"] },
    });

    expect(upload).toHaveBeenCalledTimes(1);
    expect(
      await screen.findByText(
        t.uploadingPlaceholder("camera.png", "9 байт", 64),
      ),
    ).toBeInTheDocument();
    // Nothing was written into the document for a picture not yet stored.
    expect(onChange).not.toHaveBeenCalled();

    await act(async () => {
      pending.resolve({ src: "/uploads/media/camera.webp", alt: null });
    });

    await waitFor(() => expect(onChange).toHaveBeenCalled());
    const html = onChange.mock.calls.at(-1)?.[0] as string;
    expect(html).toContain('src="/uploads/media/camera.webp"');
    expect(html).toContain("Текст");
    expect(
      screen.queryByText(/Завантажуємо camera\.png/),
    ).not.toBeInTheDocument();
    expect(jest.mocked(toast.success).mock.calls[0]?.[0]).toBe(t.uploaded);
  });

  it("uploads a file chosen through «Завантажити з комп’ютера…»", async () => {
    const onChange = jest.fn();
    const upload = jest.fn().mockResolvedValue({
      src: "/uploads/media/chosen.webp",
      alt: "Обране",
    });
    const { container } = render(
      <Harness onChange={onChange} sources={{ upload }} />,
    );

    const menu = await openImageMenu();
    await userEvent.click(
      within(menu).getByRole("menuitem", { name: t.imageUpload }),
    );
    const input =
      container.querySelector<HTMLInputElement>("input[type='file']");
    expect(input).not.toBeNull();
    fireEvent.change(input as HTMLInputElement, {
      target: { files: [pngFile("chosen.png")] },
    });

    await waitFor(() =>
      expect(onChange.mock.calls.at(-1)?.[0]).toContain(
        'src="/uploads/media/chosen.webp"',
      ),
    );
    expect(onChange.mock.calls.at(-1)?.[0]).toContain('alt="Обране"');
  });

  it("uploads an image pasted from the clipboard", async () => {
    const onChange = jest.fn();
    const upload = jest.fn().mockResolvedValue({
      src: "/uploads/media/pasted.webp",
      alt: null,
    });
    render(<Harness onChange={onChange} sources={{ upload }} />);

    const editable = await screen.findByLabelText(EDITOR_LABEL);
    await waitFor(() => expect(editable).toHaveTextContent("Текст"));

    fireEvent.paste(editable, {
      clipboardData: {
        files: [pngFile("screenshot.png")],
        items: [],
        types: ["Files"],
        getData: () => "",
      },
    });

    await waitFor(() => expect(onChange).toHaveBeenCalled());
    expect(upload.mock.calls[0][0]).toHaveProperty("name", "screenshot.png");
    expect(onChange.mock.calls.at(-1)?.[0]).toContain(
      'src="/uploads/media/pasted.webp"',
    );
  });

  it("leaves an ordinary text paste to the editor", async () => {
    const upload = jest.fn();
    render(<Harness sources={{ upload }} />);

    const editable = await screen.findByLabelText(EDITOR_LABEL);
    fireEvent.paste(editable, {
      clipboardData: {
        files: [pngFile("word-render.png")],
        items: [],
        types: ["text/plain", "Files"],
        getData: (type: string) => (type === "text/plain" ? "Абзац" : ""),
      },
    });

    // Word puts a picture of the selection next to the text; that is not an
    // image the operator meant to upload.
    expect(upload).not.toHaveBeenCalled();
  });

  it("removes the placeholder and says why when the upload is refused", async () => {
    const onChange = jest.fn();
    const upload = jest
      .fn()
      .mockRejectedValue(new Error("Файл завеликий — максимум 20 МБ."));
    render(<Harness onChange={onChange} sources={{ upload }} />);

    const editable = await screen.findByLabelText(EDITOR_LABEL);
    await waitFor(() => expect(editable).toHaveTextContent("Текст"));

    fireEvent.drop(editable, {
      dataTransfer: {
        files: [pngFile("huge.png")],
        items: [],
        types: ["Files"],
      },
    });

    await waitFor(() =>
      expect(jest.mocked(toast.error).mock.calls[0]?.[0]).toBe(
        t.uploadFailed("huge.png", "Файл завеликий — максимум 20 МБ."),
      ),
    );
    expect(
      screen.queryByText(/Завантажуємо huge\.png/),
    ).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("does not intercept drops when nothing can upload", async () => {
    render(<Harness sources={{}} />);

    const editable = await screen.findByLabelText(EDITOR_LABEL);
    fireEvent.dragEnter(editable, {
      dataTransfer: { files: [], items: [{}], types: ["Files"] },
    });

    expect(screen.queryByText(t.dropActive)).not.toBeInTheDocument();
  });

  it("says where a dragged file will land", async () => {
    render(<Harness sources={{ upload: jest.fn() }} />);

    const editable = await screen.findByLabelText(EDITOR_LABEL);
    fireEvent.dragEnter(editable, {
      dataTransfer: { files: [], items: [{}], types: ["Files"] },
    });

    expect(await screen.findByText(t.dropActive)).toBeInTheDocument();
    expect(screen.getByText(t.dropHint)).toBeInTheDocument();
  });
});

describe("RichTextEditor — a picture in the text (РЕ2, РЕ3)", () => {
  const TWO_IMAGES =
    '<p>Огляд</p><img src="/uploads/media/a.webp"><img src="/uploads/media/b.webp" alt="">';

  it("marks an image with no description at all, but not a decorative one", async () => {
    render(<Harness initial={TWO_IMAGES} sources={{}} />);

    const editable = await screen.findByLabelText(EDITOR_LABEL);
    await waitFor(() =>
      expect(editable.querySelectorAll("img")).toHaveLength(2),
    );

    // `alt` absent → «Без опису»; `alt=""` → decorative, said on purpose.
    expect(within(editable).getAllByText(t.noAlt)).toHaveLength(1);
  });

  it("counts the pictures under the text", async () => {
    render(<Harness initial={TWO_IMAGES} sources={{}} />);

    expect(await screen.findByText(t.imageCount(2))).toBeInTheDocument();
  });

  it("edits the description of a selected picture, and marks it decorative", async () => {
    const onChange = jest.fn();
    render(
      <Harness
        initial='<p>Огляд</p><img src="/uploads/media/a.webp">'
        onChange={onChange}
        sources={{}}
      />,
    );

    const editable = await screen.findByLabelText(EDITOR_LABEL);
    await waitFor(() => expect(editable.querySelector("img")).not.toBeNull());
    selectFirstImage(editable);

    const panel = await screen.findByRole("toolbar", {
      name: t.imagePanelAria,
    });
    await userEvent.click(
      within(panel).getByRole("button", { name: t.altEdit }),
    );
    const field = await screen.findByRole("textbox", { name: t.altLabel });
    await userEvent.type(field, "Камери iPhone 16 і 15");
    await userEvent.click(screen.getByRole("button", { name: t.apply }));

    await waitFor(() =>
      expect(onChange.mock.calls.at(-1)?.[0]).toContain(
        'alt="Камери iPhone 16 і 15"',
      ),
    );

    // Now decorative: an EMPTY alt, which the server keeps.
    selectFirstImage(editable);
    await userEvent.click(
      within(
        await screen.findByRole("toolbar", { name: t.imagePanelAria }),
      ).getByRole("button", { name: t.altEdit }),
    );
    await userEvent.click(
      await screen.findByRole("checkbox", { name: t.altDecorative }),
    );
    expect(screen.getByRole("textbox", { name: t.altLabel })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: t.apply }));

    await waitFor(() =>
      expect(onChange.mock.calls.at(-1)?.[0]).toContain('alt=""'),
    );
  });

  it("removes a selected picture and keeps the text", async () => {
    const onChange = jest.fn();
    render(
      <Harness
        initial='<p>Огляд</p><img src="/uploads/media/a.webp" alt="A">'
        onChange={onChange}
        sources={{}}
      />,
    );

    const editable = await screen.findByLabelText(EDITOR_LABEL);
    await waitFor(() => expect(editable.querySelector("img")).not.toBeNull());
    selectFirstImage(editable);

    await userEvent.click(
      within(
        await screen.findByRole("toolbar", { name: t.imagePanelAria }),
      ).getByRole("button", { name: t.remove }),
    );

    await waitFor(() => expect(onChange).toHaveBeenCalled());
    const html = onChange.mock.calls.at(-1)?.[0] as string;
    expect(html).not.toContain("<img");
    expect(html).toContain("Огляд");
  });

  it("replaces a selected picture from the library, in place", async () => {
    const onChange = jest.fn();
    const openLibrary = jest.fn();
    render(
      <Harness
        initial='<p>Огляд</p><img src="/uploads/media/old.webp" alt="Старе">'
        onChange={onChange}
        sources={{ openLibrary }}
      />,
    );

    const editable = await screen.findByLabelText(EDITOR_LABEL);
    await waitFor(() => expect(editable.querySelector("img")).not.toBeNull());
    selectFirstImage(editable);

    await userEvent.click(
      within(
        await screen.findByRole("toolbar", { name: t.imagePanelAria }),
      ).getByRole("button", { name: t.replace }),
    );
    await userEvent.click(
      await screen.findByRole("menuitem", { name: t.imageFromLibrary }),
    );
    const pick = openLibrary.mock.calls[0][0] as (image: RichTextImage) => void;
    act(() => pick({ src: "/uploads/media/new.webp", alt: "Нове" }));

    await waitFor(() =>
      expect(onChange.mock.calls.at(-1)?.[0]).toContain(
        'src="/uploads/media/new.webp"',
      ),
    );
    const html = onChange.mock.calls.at(-1)?.[0] as string;
    expect(html).not.toContain("old.webp");
    expect(html.match(/<img/g)).toHaveLength(1);
  });

  it("shows no image panel in a disabled editor", async () => {
    render(
      <RichTextEditor
        value='<img src="/uploads/media/a.webp">'
        onChange={jest.fn()}
        disabled
        imagePicker={() => null}
      />,
    );

    const editable = await screen.findByLabelText(EDITOR_LABEL);
    await waitFor(() => expect(editable.querySelector("img")).not.toBeNull());
    selectFirstImage(editable);

    expect(
      screen.queryByRole("toolbar", { name: t.imagePanelAria }),
    ).not.toBeInTheDocument();
    expect(within(editable).queryByText(t.noAlt)).not.toBeInTheDocument();
  });
});

/** Put a NodeSelection on the first image — jsdom cannot click one into it. */
function selectFirstImage(editable: HTMLElement) {
  const editor = editorOf(editable);
  let imagePos = -1;
  editor.state.doc.descendants((node, pos) => {
    if (imagePos === -1 && node.type.name === "image") imagePos = pos;
  });
  act(() => {
    editor.commands.setNodeSelection(imagePos);
  });
}
