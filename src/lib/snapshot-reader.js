// Keep the complete, server-ordered collection, but decode only changed documents.
// The cache belongs to one subscription and is released with that subscription.
export function createSnapshotReader() {
  const records = new Map();
  let initialized = false;
  return (snapshot) => {
    if (!initialized) {
      for (const item of snapshot.docs) records.set(item.id, { id: item.id, ...item.data() });
      initialized = true;
    } else {
      for (const change of snapshot.docChanges()) {
        const item = change.doc;
        if (change.type === 'removed') records.delete(item.id);
        else records.set(item.id, { id: item.id, ...item.data() });
      }
    }
    // New array on every notification; old snapshots must remain unchanged.
    return snapshot.docs.map((item) => records.get(item.id));
  };
}
