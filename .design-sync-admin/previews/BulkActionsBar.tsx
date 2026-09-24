import { BulkActionsBar } from "@store/store-admin";

const noop = () => {};

// Product list (widgets/product-list): three rows selected on the page.
// No bulk delete on purpose — product deletion is a soft delete.
export const Products = () => (
  <div style={{ width: "100%" }}>
    <BulkActionsBar
      selectedCount={3}
      onClear={noop}
      actions={[
        { label: "Активувати (3)", onClick: noop },
        { label: "Деактивувати (3)", onClick: noop },
        { label: "Перемістити до групи (3)", onClick: noop },
        { label: "Задати колір (3)", onClick: noop },
      ]}
    />
  </div>
);

// Review moderation: approve stays outline, reject is destructive.
export const ReviewModeration = () => (
  <div style={{ width: "100%" }}>
    <BulkActionsBar
      selectedCount={2}
      onClear={noop}
      actions={[
        { label: "Схвалити (2)", onClick: noop },
        { label: "Відхилити текст (2)", onClick: noop, variant: "destructive" },
      ]}
    />
  </div>
);

// isPending = the mutation's in-flight flag: every control is disabled.
export const Pending = () => (
  <div style={{ width: "100%" }}>
    <BulkActionsBar
      selectedCount={5}
      onClear={noop}
      isPending
      actions={[
        { label: "Активувати (5)", onClick: noop },
        { label: "Деактивувати (5)", onClick: noop },
      ]}
    />
  </div>
);
