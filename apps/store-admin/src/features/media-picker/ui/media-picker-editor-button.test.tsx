/**
 * The sixth connection point: the rich-text editor (TASK-547).
 *
 * It gets its own test file because it is the only one the three editor-using
 * FORM tests cannot cover — all of them stub Tiptap out (it touches the DOM on
 * init, and the barrel renders `null` under jsdom). So this renders the REAL
 * editor with the REAL picker in its slot and follows one picture all the way
 * from the library into the HTML the form would save.
 *
 * `rich-text-editor.test.tsx` proves the schema keeps `src` and `alt`; this
 * proves the library is what fills them.
 */

import * as React from "react";
import {
  fireEvent,
  renderWithProviders,
  screen,
  userEvent,
  waitFor,
  within,
} from "@/shared/test/render";
import { PERM } from "@/entities/permission";
import { dict } from "@/shared/config";
// The module, NOT `@/shared/ui`: the barrel wraps the editor in
// `next/dynamic({ ssr: false })`, which renders nothing under jsdom.
import { RichTextEditor } from "@/shared/ui/rich-text-editor/rich-text-editor";
import {
  MEDIA_PERMISSIONS,
  chooseInOpenPicker,
  makeMediaAsset,
  stubMediaLibrary,
} from "../model/media-picker.fixture";
import { MediaPickerEditorButton } from "./media-picker-editor-button";

const t = dict.mediaPicker;
const rte = dict.richTextEditor;

/** Open the editor's «Зображення ▾» menu (РЕ1). */
async function openImageMenu() {
  await userEvent.click(
    await screen.findByRole("button", { name: t.editorInsert }),
  );
  return screen.findByRole("menu");
}

jest.mock("sonner", () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}));

function EditorUnderTest({ onChange }: { onChange: (html: string) => void }) {
  const [value, setValue] = React.useState("<p>Текст</p>");
  return (
    <RichTextEditor
      value={value}
      onChange={(html) => {
        setValue(html);
        onChange(html);
      }}
      imagePicker={(insert) => <MediaPickerEditorButton insert={insert} />}
    />
  );
}

describe("MediaPickerEditorButton", () => {
  it("inserts the picked picture into the document, alt text and all", async () => {
    const asset = makeMediaAsset("m3", {
      alt: "Чохол MagSafe на столі",
      url: "http://localhost:3001/uploads/media/m3.webp",
    });
    stubMediaLibrary([asset]);
    const onChange = jest.fn();

    renderWithProviders(<EditorUnderTest onChange={onChange} />, {
      auth: { permissions: MEDIA_PERMISSIONS },
    });

    const menu = await openImageMenu();
    await userEvent.click(
      within(menu).getByRole("menuitem", { name: rte.imageFromLibrary }),
    );
    await chooseInOpenPicker("Чохол MagSafe на столі");

    await waitFor(() => expect(onChange).toHaveBeenCalled());
    const html = onChange.mock.calls.at(-1)?.[0] as string;
    expect(html).toContain(`src="${asset.url}"`);
    // The alt travels WITH the picture. Curating it once in the library is the
    // reason the library stores one at all; retyping it per article is how a
    // body full of undescribed images happens.
    expect(html).toContain('alt="Чохол MagSafe на столі"');
    // And the text that was already in the document is still there.
    expect(html).toContain("Текст");
  });

  it("renders no control at all without the media keys", async () => {
    stubMediaLibrary();
    renderWithProviders(<EditorUnderTest onChange={jest.fn()} />);

    await screen.findByLabelText("Текстовий редактор");
    // The editor keeps every other toolbar action — losing the image button is
    // not losing the editor; the operator has exactly the toolbar they had.
    expect(screen.getByLabelText("Жирний")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: t.editorInsert }),
    ).not.toBeInTheDocument();
  });

  it("offers the library but no upload with media:read alone", async () => {
    stubMediaLibrary();
    renderWithProviders(<EditorUnderTest onChange={jest.fn()} />, {
      auth: { permissions: [PERM.mediaRead] },
    });

    const menu = await openImageMenu();
    expect(
      within(menu).getByRole("menuitem", { name: rte.imageFromLibrary }),
    ).toBeInTheDocument();
    expect(
      within(menu).queryByRole("menuitem", { name: rte.imageUpload }),
    ).not.toBeInTheDocument();
  });

  it("uploads a file dropped into the text into the LIBRARY, then inserts it (РЕ5, РЕ6)", async () => {
    const { uploadedNames } = stubMediaLibrary([]);
    const onChange = jest.fn();

    renderWithProviders(<EditorUnderTest onChange={onChange} />, {
      auth: { permissions: MEDIA_PERMISSIONS },
    });

    const editable = await screen.findByLabelText("Текстовий редактор");
    await waitFor(() => expect(editable).toHaveTextContent("Текст"));
    // The menu says upload is available once the slot has registered.
    const menu = await openImageMenu();
    expect(
      within(menu).getByRole("menuitem", { name: rte.imageUpload }),
    ).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");

    fireEvent.drop(editable, {
      dataTransfer: {
        files: [new File(["png-bytes"], "camera.png", { type: "image/png" })],
        items: [],
        types: ["Files"],
      },
    });

    // `POST /api/admin/media` — the picture becomes a library asset.
    await waitFor(() => expect(uploadedNames).toEqual(["camera.png"]));
    await waitFor(() =>
      expect(onChange.mock.calls.at(-1)?.[0]).toContain(
        'src="http://localhost:3001/uploads/media/up-1.webp"',
      ),
    );
  });
});
