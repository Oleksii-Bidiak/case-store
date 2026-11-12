// «Мої пристрої» edits channel (TASK-1959). Fired ONLY by the shopper's own
// changes in this tab (add / activate / remove / label / clear / settings), never
// by `replaceMyDevices*` (the server state being applied) and never by another
// tab's write arriving through the `storage` event. That distinction is what
// lets the account sync push local edits without echoing the server back, and
// without two tabs PUTting the same change twice.

const editListeners = new Set<() => void>();

/** Listen for the shopper's own edits of the list or the settings. */
export function subscribeMyDevicesEdits(onEdit: () => void): () => void {
  editListeners.add(onEdit);
  return () => {
    editListeners.delete(onEdit);
  };
}

/** Called by the stores after a user-initiated write that changed something. */
export function notifyMyDevicesEdit(): void {
  for (const listener of editListeners) listener();
}
