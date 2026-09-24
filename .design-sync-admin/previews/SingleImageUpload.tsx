import { SingleImageUpload } from "@store/store-admin";

// Settings → «Логотип магазину» (features/store-logo-upload). Copy is
// dictionary.ts → storeLogo.*; delete confirm is common.delete.
const labels = {
  alt: "Логотип магазину",
  empty: "Логотип ще не завантажено — поки що показується стандартна назва.",
  upload: "Завантажити логотип",
  replace: "Замінити логотип",
  delete: "Видалити логотип",
  deleteTitle: "Видалити логотип?",
  deleteDescription:
    "Логотип буде видалено назавжди, а сайт і адмін-панель повернуться до текстової назви магазину. Дію не можна скасувати.",
  cancel: "Скасувати",
  confirmDelete: "Видалити",
};

const hint =
  "Показується у шапці сайту та в адмін-панелі. SVG, PNG, WebP або JPG — до 1 МБ. Найкраще виглядає горизонтальний логотип на прозорому фоні.";

const ACCEPT = ".svg,.png,.webp,.jpg,.jpeg";

// A self-contained horizontal wordmark (named colours, no external host).
const LOGO_SVG =
  "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 240 64'>" +
  "<defs><linearGradient id='g' x1='0' x2='1'>" +
  "<stop offset='0' stop-color='royalblue'/><stop offset='1' stop-color='mediumslateblue'/>" +
  "</linearGradient></defs>" +
  "<rect x='4' y='8' width='48' height='48' rx='12' fill='url(#g)'/>" +
  "<rect x='20' y='18' width='16' height='28' rx='4' fill='none' stroke='white' stroke-width='3'/>" +
  "<text x='64' y='42' font-family='Arial, sans-serif' font-size='26' font-weight='700' fill='midnightblue'>CaseStore</text>" +
  "</svg>";
const LOGO_URL = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(LOGO_SVG)}`;

const noop = () => {};

export const Empty = () => (
  <div style={{ width: 560 }}>
    <SingleImageUpload
      imageUrl={null}
      accept={ACCEPT}
      labels={labels}
      hint={hint}
      onSelectFile={noop}
      onDelete={noop}
    />
  </div>
);

export const WithImage = () => (
  <div style={{ width: 560 }}>
    <SingleImageUpload
      imageUrl={LOGO_URL}
      accept={ACCEPT}
      labels={labels}
      hint={hint}
      onSelectFile={noop}
      onDelete={noop}
    />
  </div>
);

// Upload mutation pending: both buttons disabled, spinner in the primary one.
export const Uploading = () => (
  <div style={{ width: 560 }}>
    <SingleImageUpload
      imageUrl={LOGO_URL}
      accept={ACCEPT}
      labels={labels}
      hint={hint}
      isUploading
      onSelectFile={noop}
      onDelete={noop}
    />
  </div>
);

// 413 from the API → storeLogo.errorTooLarge rendered as an alert.
export const WithError = () => (
  <div style={{ width: 560 }}>
    <SingleImageUpload
      imageUrl={null}
      accept={ACCEPT}
      labels={labels}
      hint={hint}
      error="Файл завеликий — максимум 1 МБ. Стисніть зображення."
      onSelectFile={noop}
      onDelete={noop}
    />
  </div>
);
