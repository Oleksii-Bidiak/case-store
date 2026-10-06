// Product restore (TASK-656) — bring a soft-deleted product back, hidden, on
// its own address and артикул; a new one is asked for only after a 409.
export {
  ProductRestoreDialog,
  type ProductRestoreDialogProps,
  type RestorableProduct,
} from "./ui/product-restore-dialog";
