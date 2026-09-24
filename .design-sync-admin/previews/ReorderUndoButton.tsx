import { ReorderUndoButton } from "@store/store-admin";

const noop = () => {};

// Sits in the header of every drag-reorderable list (banners, carousels,
// device brands, blog categories, the category tree), beside the section title.
const Section = ({ canUndo }: { canUndo: boolean }) => (
  <div
    style={{ width: 520 }}
    className="flex flex-wrap items-center justify-between gap-2"
  >
    <h3 className="text-lg font-semibold text-foreground">Головний слайдер</h3>
    <ReorderUndoButton
      canUndo={canUndo}
      onUndo={noop}
      label="Скасувати останнє переміщення"
    />
  </div>
);

// Within ~30 s of a move: a live outline button.
export const CanUndo = () => <Section canUndo />;

// Window expired: stays focusable with aria-disabled, dimmed to 50% —
// never `disabled`, so the announcement that names it stays true.
export const Expired = () => <Section canUndo={false} />;
