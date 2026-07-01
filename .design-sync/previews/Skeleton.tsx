import { Skeleton } from "@store/store-client";

export const TextLines = () => (
  <div style={{ display: "flex", flexDirection: "column", gap: 10, width: 320 }}>
    <Skeleton style={{ height: 32, width: 192 }} />
    <Skeleton style={{ height: 16, width: "100%" }} />
    <Skeleton style={{ height: 16, width: "75%" }} />
  </div>
);

export const Avatar = () => (
  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
    <Skeleton style={{ height: 48, width: 48, borderRadius: 9999 }} />
    <div style={{ display: "grid", gap: 6 }}>
      <Skeleton style={{ height: 16, width: 128 }} />
      <Skeleton style={{ height: 12, width: 80 }} />
    </div>
  </div>
);
