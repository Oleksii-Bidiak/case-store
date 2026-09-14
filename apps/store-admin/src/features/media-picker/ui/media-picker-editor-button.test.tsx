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
  renderWithProviders,
  screen,
  userEvent,
  waitFor,
} from "@/shared/test/render";
import { dict } from "@/shared/config";
// The module, NOT `@/shared/ui`: the barrel wraps the editor in
// `next/dynamic({ ssr: false })`, which renders nothing under jsdom.
import { RichTextEditor } from "@/shared/ui/rich-text-editor/rich-text-editor";
import {
  MEDIA_PERMISSIONS,
  makeMediaAsset,
  stubMediaLibrary,
} from "../model/media-picker.fixture";
import { MediaPickerEditorButton } from "./media-picker-editor-button";

const t = dict.mediaPicker;

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

    await userEvent.click(
      await screen.findByRole("button", { name: t.editorInsert }),
    );
    await userEvent.click(
      await screen.findByRole("button", {
        name: t.pickCardAria("Чохол MagSafe на столі"),
      }),
    );

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
    // not losing the editor.
    expect(screen.getByLabelText("Жирний")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: t.editorInsert }),
    ).not.toBeInTheDocument();
  });
});
