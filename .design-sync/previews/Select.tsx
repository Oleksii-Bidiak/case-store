import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@store/store-client";

// The Radix dropdown opens in a portal on interaction; these cards show the
// representative closed trigger (the dropdown content is interaction-driven).
export const SortBy = () => (
  <div style={{ width: 240 }}>
    <Select>
      <SelectTrigger style={{ width: "100%" }}>
        <SelectValue placeholder="Sort by: Popularity" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="popular">Popularity</SelectItem>
        <SelectItem value="price-asc">Price: Low to High</SelectItem>
        <SelectItem value="price-desc">Price: High to Low</SelectItem>
        <SelectItem value="new">Newest</SelectItem>
      </SelectContent>
    </Select>
  </div>
);

export const Sizes = () => (
  <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
    <Select>
      <SelectTrigger size="sm">
        <SelectValue placeholder="Small" />
      </SelectTrigger>
    </Select>
    <Select>
      <SelectTrigger>
        <SelectValue placeholder="Default" />
      </SelectTrigger>
    </Select>
  </div>
);

export const Disabled = () => (
  <Select>
    <SelectTrigger disabled>
      <SelectValue placeholder="Unavailable" />
    </SelectTrigger>
  </Select>
);
