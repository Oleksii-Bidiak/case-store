import { Badge } from "@store/store-client";

// Commerce meanings follow docs/design-system.md: sale = discount, success =
// in stock / new, warning = running low, destructive = sold out.
export const Commerce = () => (
  <div
    style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}
  >
    <Badge variant="sale">−25%</Badge>
    <Badge variant="success">Новинка</Badge>
    <Badge variant="success">В наявності</Badge>
    <Badge variant="warning">Закінчується</Badge>
    <Badge variant="destructive">Немає в наявності</Badge>
  </div>
);

export const Variants = () => (
  <div
    style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}
  >
    <Badge>Хіт</Badge>
    <Badge variant="secondary">Apple</Badge>
    <Badge variant="outline">USB-C</Badge>
    <Badge variant="ghost">MagSafe</Badge>
  </div>
);
