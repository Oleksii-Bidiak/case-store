/**
 * The handle an edit FORM hands to the page that owns it, so an action outside
 * the form can ask «is anything unsaved?» and «save it now» (TASK-670): the
 * header's «Подивитись на сайті» offers «Зберегти й подивитись» when the form
 * holds edits, because a preview shows only what is saved.
 *
 * `isDirty` is read on demand (when the action is pressed), not pushed on every
 * keystroke — the page has nothing to re-render until then.
 *
 * Pure type — safe for every layer. Import directly (not via the barrel).
 */
export interface FormSubmitController {
  /** The form holds edits that are not saved yet. */
  isDirty: () => boolean;
  /**
   * Validate and run the form's own save. Resolves `true` only when the save
   * landed; `false` when validation stopped it or the server refused.
   */
  submit: () => Promise<boolean>;
}
