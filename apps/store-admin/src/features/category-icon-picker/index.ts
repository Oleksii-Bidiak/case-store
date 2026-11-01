// Category icon picker (TASK-1956): the form field, its live preview and the
// pure helpers behind them.
export {
  CategoryIconPicker,
  type CategoryIconPickerProps,
} from "./ui/category-icon-picker";
export { CategoryIconPreview } from "./ui/category-icon-preview";
export { IconGrid, type IconGridProps } from "./ui/icon-grid";
export {
  buildIconPreviewRows,
  filterCategoryIcons,
  iconPreviewTiles,
  usedRootIcons,
  type IconPreviewRow,
} from "./model/icon-picker-model";
