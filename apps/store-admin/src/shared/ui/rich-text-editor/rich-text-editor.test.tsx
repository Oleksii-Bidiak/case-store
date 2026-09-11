import * as React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

import { dict } from "@/shared/config";

// Import the module, NOT `./index`: the barrel wraps this component in
// `next/dynamic({ ssr: false, loading: () => null })`, which renders nothing at
// all under jsdom.
import { RichTextEditor } from "./rich-text-editor";

const EDITOR_LABEL = "Текстовий редактор";
const EDIT_ANYWAY = dict.contentPreview.unsupportedEditAnyway;

/** The TASK-467 banner, or `null` when the editor is showing the full document. */
function truncationBanner() {
  return screen.queryByText(dict.contentPreview.unsupportedTitle);
}

/**
 * The shape of the three admin content forms: the editor mounts with an empty
 * value and the parent seeds the server content one effect later — `reset()`
 * for pages/blog posts, RHF's `values` prop for products. This is the exact
 * TASK-399 client-navigation case: the `ssr:false` chunk is already cached, so
 * Tiptap is built with `content: ""` before the seed lands.
 */
function SeededForm({ serverContent }: { serverContent: string }) {
  const [value, setValue] = React.useState("");
  React.useEffect(() => {
    // Deliberate setState-in-effect: it reproduces how the real forms seed the
    // editor (RHF `reset()` from a `useEffect`). That timing IS the subject of
    // the test — the editor is created in its own effect during the same
    // commit, moments before this seed lands.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setValue(serverContent);
  }, [serverContent]);
  return <RichTextEditor value={value} onChange={setValue} />;
}

describe("RichTextEditor", () => {
  it("shows content seeded by the parent form after the editor was created", async () => {
    render(<SeededForm serverContent="<p>Текст зі сервера</p>" />);

    const editable = await screen.findByLabelText(EDITOR_LABEL);
    await waitFor(() => expect(editable).toHaveTextContent("Текст зі сервера"));
  });

  it("seeds a value that arrives on a later render", async () => {
    const onChange = jest.fn();
    const { rerender } = render(
      <RichTextEditor value="" onChange={onChange} />,
    );
    const editable = await screen.findByLabelText(EDITOR_LABEL);

    rerender(<RichTextEditor value="<p>x</p>" onChange={onChange} />);

    await waitFor(() => expect(editable).toHaveTextContent("x"));
  });

  it("seeds even when the admin has already clicked into the editor", async () => {
    const onChange = jest.fn();
    const { rerender } = render(
      <RichTextEditor value="" onChange={onChange} />,
    );
    const editable = await screen.findByLabelText(EDITOR_LABEL);

    // Focus alone must not veto the seed — the old `!editor.isFocused` guard
    // dropped it for good, because nothing re-triggers the sync afterwards.
    fireEvent.focus(editable);
    rerender(
      <RichTextEditor value="<p>Пізній текст</p>" onChange={onChange} />,
    );

    await waitFor(() => expect(editable).toHaveTextContent("Пізній текст"));
  });

  it("keeps following later external changes while untouched", async () => {
    const onChange = jest.fn();
    const { rerender } = render(
      <RichTextEditor value="" onChange={onChange} />,
    );
    const editable = await screen.findByLabelText(EDITOR_LABEL);

    rerender(<RichTextEditor value="<p>Перший</p>" onChange={onChange} />);
    await waitFor(() => expect(editable).toHaveTextContent("Перший"));

    rerender(<RichTextEditor value="<p>Другий</p>" onChange={onChange} />);
    await waitFor(() => expect(editable).toHaveTextContent("Другий"));
  });

  it("never overwrites edits already made in the editor (forms.md Rule 2)", async () => {
    const onChange = jest.fn();
    const { rerender } = render(
      <RichTextEditor value="<p>Старий текст</p>" onChange={onChange} />,
    );
    const editable = await screen.findByLabelText(EDITOR_LABEL);
    await waitFor(() => expect(editable).toHaveTextContent("Старий текст"));

    // A real edit made through the editor's own UI.
    fireEvent.click(screen.getByLabelText("Горизонтальна лінія"));
    await waitFor(() => expect(onChange).toHaveBeenCalled());
    const edited = onChange.mock.calls.at(-1)?.[0] as string;
    expect(edited).toContain("<hr>");

    // A background refetch pushing different server text must not win.
    rerender(
      <RichTextEditor value="<p>Новий з сервера</p>" onChange={onChange} />,
    );

    expect(editable).toHaveTextContent("Старий текст");
    expect(editable).not.toHaveTextContent("Новий з сервера");
  });

  it("loads the next entity's content even after an edit (forms.md Rule 2b)", async () => {
    const onChange = jest.fn();
    const { rerender } = render(
      <RichTextEditor
        value="<p>Сторінка А</p>"
        onChange={onChange}
        resetKey="a"
      />,
    );
    const editable = await screen.findByLabelText(EDITOR_LABEL);
    await waitFor(() => expect(editable).toHaveTextContent("Сторінка А"));

    // The admin edits A, which latches "there is unsaved work here".
    fireEvent.click(screen.getByLabelText("Горизонтальна лінія"));
    await waitFor(() => expect(onChange).toHaveBeenCalled());

    // Now a DIFFERENT entity is opened without this instance unmounting. The
    // latch belongs to A, not to the component: without `resetKey` clearing it,
    // B's content is refused for good and the admin's next keystroke saves A's
    // document under B.
    rerender(
      <RichTextEditor
        value="<p>Сторінка Б</p>"
        onChange={onChange}
        resetKey="b"
      />,
    );

    await waitFor(() => expect(editable).toHaveTextContent("Сторінка Б"));
    expect(editable).not.toHaveTextContent("Сторінка А");
  });

  it("still refuses an external value when the entity has not changed", async () => {
    const onChange = jest.fn();
    const { rerender } = render(
      <RichTextEditor
        value="<p>Старий текст</p>"
        onChange={onChange}
        resetKey="a"
      />,
    );
    const editable = await screen.findByLabelText(EDITOR_LABEL);
    await waitFor(() => expect(editable).toHaveTextContent("Старий текст"));

    fireEvent.click(screen.getByLabelText("Горизонтальна лінія"));
    await waitFor(() => expect(onChange).toHaveBeenCalled());

    // Same `resetKey` — this is a background refetch of the SAME entity, so
    // Rule 2 still wins over Rule 2b.
    rerender(
      <RichTextEditor
        value="<p>Новий з сервера</p>"
        onChange={onChange}
        resetKey="a"
      />,
    );

    expect(editable).toHaveTextContent("Старий текст");
    expect(editable).not.toHaveTextContent("Новий з сервера");
  });

  it("does not report a change while it is only being seeded", async () => {
    const onChange = jest.fn();
    const { rerender } = render(
      <RichTextEditor value="" onChange={onChange} />,
    );
    const editable = await screen.findByLabelText(EDITOR_LABEL);

    rerender(
      <RichTextEditor value="<p>Тіло сторінки</p>" onChange={onChange} />,
    );
    await waitFor(() => expect(editable).toHaveTextContent("Тіло сторінки"));

    // `setEditable()` used to emit an `update` on mount, which pushed the
    // editor's empty HTML back into the form and wiped the seeded content.
    expect(onChange).not.toHaveBeenCalled();
  });

  /**
   * TASK-467 — the server's allow-list (`sanitize-rich-text.ts`) keeps tables,
   * images and H1/H4; this editor's Tiptap schema cannot represent any of them
   * and drops them on seed. `getHTML()` is then already the truncated document,
   * so the first keystroke would save the loss. The editor must say so and
   * refuse to be typed into until the operator accepts that cost.
   */
  describe("markup the editor cannot render (TASK-467)", () => {
    const TABLE_HTML =
      "<p>Характеристики</p><table><tbody><tr><th>Вага</th><td>120 г</td></tr></tbody></table>";
    const IMAGE_HTML =
      '<p>Огляд</p><img src="https://example.com/case.jpg" alt="Чохол">';
    // Everything here round-trips through the schema unchanged in substance —
    // Tiptap still reformats it (attribute order, self-closing tags), which is
    // exactly why detection is by tag presence and not by document equality.
    const ORDINARY_HTML = [
      "<h2>Заголовок</h2>",
      "<h3>Підзаголовок</h3>",
      "<p>Текст із <strong>жирним</strong> та ",
      '<a href="https://example.com">посиланням</a>.</p>',
      "<ul><li>Пункт один</li><li>Пункт два</li></ul>",
    ].join("");

    it("warns and locks the editor when the value contains a table", async () => {
      const onChange = jest.fn();
      render(<RichTextEditor value={TABLE_HTML} onChange={onChange} />);

      const editable = await screen.findByLabelText(EDITOR_LABEL);
      await waitFor(() => expect(truncationBanner()).toBeInTheDocument());

      expect(
        screen.getByText(
          new RegExp(dict.contentPreview.unsupportedTables, "i"),
        ),
      ).toBeInTheDocument();
      expect(editable).toHaveAttribute("contenteditable", "false");
      expect(screen.getByLabelText("Жирний")).toBeDisabled();
      // Seeding alone must never report a change — the truncated HTML must not
      // reach the form unless the operator chooses it.
      expect(onChange).not.toHaveBeenCalled();
    });

    it("warns and locks the editor when the value contains an image", async () => {
      const onChange = jest.fn();
      render(<RichTextEditor value={IMAGE_HTML} onChange={onChange} />);

      const editable = await screen.findByLabelText(EDITOR_LABEL);
      await waitFor(() => expect(truncationBanner()).toBeInTheDocument());

      expect(
        screen.getByText(
          new RegExp(dict.contentPreview.unsupportedImages, "i"),
        ),
      ).toBeInTheDocument();
      expect(editable).toHaveAttribute("contenteditable", "false");
    });

    it("stays silent and editable for ordinary rich content", async () => {
      const onChange = jest.fn();
      render(<RichTextEditor value={ORDINARY_HTML} onChange={onChange} />);

      const editable = await screen.findByLabelText(EDITOR_LABEL);
      await waitFor(() => expect(editable).toHaveTextContent("Заголовок"));

      expect(truncationBanner()).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: EDIT_ANYWAY }),
      ).not.toBeInTheDocument();
      expect(editable).toHaveAttribute("contenteditable", "true");
      expect(screen.getByLabelText("Жирний")).toBeEnabled();
    });

    it("unlocks on «edit anyway» and keeps the warning standing", async () => {
      const onChange = jest.fn();
      render(<RichTextEditor value={TABLE_HTML} onChange={onChange} />);

      const editable = await screen.findByLabelText(EDITOR_LABEL);
      await waitFor(() => expect(truncationBanner()).toBeInTheDocument());

      fireEvent.click(screen.getByRole("button", { name: EDIT_ANYWAY }));

      await waitFor(() =>
        expect(editable).toHaveAttribute("contenteditable", "true"),
      );
      // The consent removes the lock, not the warning.
      expect(truncationBanner()).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: EDIT_ANYWAY }),
      ).not.toBeInTheDocument();
      expect(screen.getByLabelText("Жирний")).toBeEnabled();
    });

    it("offers no «edit anyway» while the editor is disabled", async () => {
      const onChange = jest.fn();
      render(
        <RichTextEditor value={TABLE_HTML} onChange={onChange} disabled />,
      );

      const editable = await screen.findByLabelText(EDITOR_LABEL);
      await waitFor(() => expect(truncationBanner()).toBeInTheDocument());

      // `disabled` is the caller's word and outranks the latch: the operator
      // must not be able to talk their way past it.
      expect(
        screen.queryByRole("button", { name: EDIT_ANYWAY }),
      ).not.toBeInTheDocument();
      expect(editable).toHaveAttribute("contenteditable", "false");
    });

    it("gives the next entity a fresh verdict (forms.md Rule 2b)", async () => {
      const onChange = jest.fn();
      const { rerender } = render(
        <RichTextEditor value={TABLE_HTML} onChange={onChange} resetKey="a" />,
      );
      const editable = await screen.findByLabelText(EDITOR_LABEL);
      await waitFor(() => expect(truncationBanner()).toBeInTheDocument());

      rerender(
        <RichTextEditor
          value="<p>Звичайний опис</p>"
          onChange={onChange}
          resetKey="b"
        />,
      );

      await waitFor(() => expect(truncationBanner()).not.toBeInTheDocument());
      expect(editable).toHaveAttribute("contenteditable", "true");
    });
  });
});
