import { Badge } from "@store/store-client";

export const Variants = () => (
  <div
    style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}
  >
    <Badge>New</Badge>
    <Badge variant="secondary">Secondary</Badge>
    <Badge variant="outline">Outline</Badge>
    <Badge variant="ghost">Ghost</Badge>
  </div>
);

export const Commerce = () => (
  <div
    style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}
  >
    <Badge variant="sale">−25%</Badge>
    <Badge variant="success">In stock</Badge>
    <Badge variant="warning">Low stock</Badge>
    <Badge variant="destructive">Sold out</Badge>
  </div>
);
