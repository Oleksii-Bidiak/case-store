import { AdminFormSkeleton } from "@store/store-admin";

// Loading placeholder for create/edit views (product card, SEO settings).
export const Default = () => (
  <div style={{ width: 560 }}>
    <AdminFormSkeleton />
  </div>
);

export const ShortForm = () => (
  <div style={{ width: 560 }}>
    <AdminFormSkeleton rows={3} />
  </div>
);
