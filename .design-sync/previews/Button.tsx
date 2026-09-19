import { Button } from "@store/store-client";

export const Variants = () => (
  <div
    style={{
      display: "flex",
      gap: 12,
      flexWrap: "wrap",
      alignItems: "center",
    }}
  >
    <Button>Додати до кошика</Button>
    <Button variant="secondary">Детальніше</Button>
    <Button variant="outline">Порівняти</Button>
    <Button variant="ghost">В обране</Button>
    <Button variant="destructive">Видалити</Button>
    <Button variant="link">Усі товари</Button>
  </div>
);

export const Sizes = () => (
  <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
    <Button size="sm">Купити</Button>
    <Button size="default">Купити</Button>
    <Button size="lg">Оформити замовлення</Button>
  </div>
);

export const Disabled = () => <Button disabled>Немає в наявності</Button>;
