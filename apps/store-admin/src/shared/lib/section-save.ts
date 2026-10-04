/**
 * The handle a form SECTION with its own endpoint hands to the page that owns
 * the one «Зберегти» (wave 198, Product Ф1): the product's specs and device
 * compatibility save through `PUT /products/:id/specs` and `/device-compat`,
 * not through the product update — so the page drives them in order through
 * this, instead of each section carrying a save button of its own.
 *
 * Pure type — safe for every layer. Import directly (not via the barrel).
 */
export interface SectionSaveController {
  /** Write the section's current state. Rejects when the server refuses. */
  save: () => Promise<void>;
  /** Throw the unsaved edits away — back to what the server holds. */
  discard: () => void;
}
