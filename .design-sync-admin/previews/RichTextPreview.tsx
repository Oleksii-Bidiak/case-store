import { RichTextPreview } from "@store/store-admin";

// The «Прев'ю» tab of the blog-post / page / product forms: the sanitized HTML
// rendered with the storefront's prose rules.
const article =
  "<h2>Як обрати захисне скло для iPhone</h2>" +
  "<p>Скло рятує екран від подряпин і тріщин, але не всі стекла однакові. Ось на що варто звернути увагу перед покупкою.</p>" +
  "<h3>Покриття та товщина</h3>" +
  "<ul><li>Олеофобне покриття — менше відбитків пальців</li><li>Товщина 0,33 мм — баланс міцності й чутливості</li><li>Повне покриття екрана «від краю до краю»</li></ul>" +
  "<blockquote>Порада: купуйте скло в комплекті з рамкою для поклейки — так воно ляже рівно з першої спроби.</blockquote>" +
  "<p>Детальніше — у розділі <a href=\"/categories/screen-protectors\">Захисне скло та плівки</a>.</p>";

const specs =
  "<h2>Характеристики</h2>" +
  "<table><tbody>" +
  "<tr><th><p>Параметр</p></th><th><p>Значення</p></th></tr>" +
  "<tr><td><p>Ємність</p></td><td><p>10 000 мА·год</p></td></tr>" +
  "<tr><td><p>Вихідна потужність</p></td><td><p>20 Вт (USB-C PD)</p></td></tr>" +
  "<tr><td><p>Бездротова зарядка</p></td><td><p>MagSafe, 15 Вт</p></td></tr>" +
  "<tr><td><p>Вага</p></td><td><p>210 г</p></td></tr>" +
  "</tbody></table>";

export const Article = () => (
  <div style={{ width: 720 }}>
    <RichTextPreview
      html={article}
      emptyLabel="Почніть писати, щоб побачити попередній перегляд…"
    />
  </div>
);

export const WithTable = () => (
  <div style={{ width: 720 }}>
    <RichTextPreview
      html={specs}
      emptyLabel="Почніть писати, щоб побачити попередній перегляд…"
    />
  </div>
);

// Tiptap emits "<p></p>" for a cleared document — shown as the placeholder.
export const Empty = () => (
  <div style={{ width: 720 }}>
    <RichTextPreview
      html="<p></p>"
      emptyLabel="Почніть писати, щоб побачити попередній перегляд…"
    />
  </div>
);
