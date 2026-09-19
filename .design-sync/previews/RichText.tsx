import { RichText } from "@store/store-client";

// Sanitized admin HTML (PDP description, blog article body). The allow-list is
// the API's sanitizeRichText(): headings, paragraphs, lists, links, quotes,
// tables.
const description = `
<h2>Чому саме цей кабель</h2>
<p>Нейлонове обплетення витримує понад 20 000 згинів, а роз'єми з алюмінієвим
корпусом не розхитуються з часом. Підтримує <a href="#">Power Delivery</a> до 60 Вт.</p>
<ul>
  <li>заряджає MacBook Air, iPad і iPhone 15;</li>
  <li>передає дані до 480 Мбіт/с;</li>
  <li>гарантія 12 місяців.</li>
</ul>
<h3>Характеристики</h3>
<table>
  <tbody>
    <tr><th>Довжина</th><td>2 м</td></tr>
    <tr><th>Потужність</th><td>60 Вт</td></tr>
    <tr><th>Роз'єми</th><td>USB-C → USB-C</td></tr>
  </tbody>
</table>
`;

export const ProductDescription = () => (
  <div style={{ width: 640 }}>
    <RichText content={description} />
  </div>
);
