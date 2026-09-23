// Optional cart fields may be undefined, including drafts from older terminals.
// Firestore rejects those values. Omit absent fields without changing amounts,
// options, or the caller's cart; keep invalid values for normal validation.
export function documentItems(items) {
  if (!Array.isArray(items)) return items;
  return items.map(item => Object.fromEntries(
    Object.entries(item).filter(([, value]) => value !== undefined)
  ));
}
