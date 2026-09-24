import { Skeleton } from "@store/store-admin";

// Returns queue loading state (widgets/return-list): toolbar + six rows.
export const TableLoading = () => (
  <div
    style={{ display: "flex", flexDirection: "column", gap: 16, width: 560 }}
  >
    <Skeleton className="h-9 w-48" />
    <div
      className="rounded-lg border border-border p-4"
      style={{ display: "flex", flexDirection: "column", gap: 8 }}
    >
      {Array.from({ length: 6 }).map((_, index) => (
        <Skeleton key={index} className="h-10 w-full" />
      ))}
    </div>
  </div>
);

// Return detail loading state (widgets/return-detail): main + sidebar columns.
export const DetailLoading = () => (
  <div
    style={{
      display: "grid",
      gridTemplateColumns: "2fr 1fr",
      gap: 24,
      width: 640,
    }}
  >
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Skeleton className="h-8 w-1/3" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-48 w-full" />
    </div>
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Skeleton className="h-40 w-full" />
      <Skeleton className="h-24 w-full" />
    </div>
  </div>
);
