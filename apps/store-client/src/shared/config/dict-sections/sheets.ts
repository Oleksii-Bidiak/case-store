// `dict.sheets` — accessible names of the catalogue's bottom / side sheets
// (TASK-2139, SД3b V-стани). Kept in its own module so the SД3 clusters can add
// copy in parallel without all of them editing dictionary.ts at once. Same
// rules as dictionary.ts: every user-facing string lives here.
//
// The visible sheet titles («Категорія», «Фільтри») stay in `dict.filters`.

export const sheetsDict = {
  /**
   * The filters drawer's close button (Catalog `.cg-x`, aria «Закрити
   * фільтри») — names what closes, the sheet itself is «Фільтри».
   */
  closeFilters: "Закрити фільтри",
  /**
   * The category-tree sheet's accessible name (Catalog: aria-label
   * «Підкатегорії»); its visible title stays «Категорія». A same-text key
   * exists as `dict.header.catalogSubcategoriesAria` — that one is the mega
   * menu's, keep the namespaces apart.
   */
  subcategoriesAria: "Підкатегорії",
} as const;
