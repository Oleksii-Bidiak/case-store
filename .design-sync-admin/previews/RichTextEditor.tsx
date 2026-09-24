import { RichTextEditor } from "@store/store-admin";

// Product form → «Опис» (features/product-form). The editor is loaded through
// next/dynamic (Tiptap touches the DOM), so it mounts a tick after the card.
const productDescription =
  "<h2>Надійний захист без зайвої ваги</h2>" +
  "<p>Чохол <strong>Spigen Ultra Hybrid</strong> поєднує прозору жорстку спинку з мʼяким бампером із TPU — iPhone 15 Pro виглядає як без чохла, а кути захищені від падінь.</p>" +
  "<ul><li>Сумісний із MagSafe та бездротовою зарядкою</li><li>Підвищені бортики навколо камери й екрана</li><li>Не жовтіє завдяки покриттю проти УФ</li></ul>" +
  "<p>У комплекті: чохол, інструкція.</p>";

const noop = () => {};

export const WithContent = () => (
  <div style={{ width: "100%" }}>
    <RichTextEditor
      value={productDescription}
      onChange={noop}
      resetKey="spg-uh-15p"
      placeholder="Опишіть товар: для чого він, з чого зроблений, що в комплекті"
    />
  </div>
);

// A new blog post: empty document shows the form's placeholder.
export const Empty = () => (
  <div style={{ width: "100%" }}>
    <RichTextEditor
      value=""
      onChange={noop}
      resetKey="new-post"
      placeholder="Почніть писати текст статті…"
    />
  </div>
);

// While the form is saving the whole editor is read-only.
export const Disabled = () => (
  <div style={{ width: "100%" }}>
    <RichTextEditor
      value={productDescription}
      onChange={noop}
      resetKey="spg-uh-15p"
      placeholder="Опишіть товар: для чого він, з чого зроблений, що в комплекті"
      disabled
    />
  </div>
);
