import path from "node:path";
let active;
// Explicit bootstrap only. Local play and imports never open a database.
export function registerStorage(root, store) {
  if (active) throw Error("STORAGE_ALREADY_INITIALIZED");
  active = { root: path.resolve(root), store };
  return () => {
    active = undefined;
  };
}
export function storageFor(file) {
  if (!active) return null;
  const relative = path.relative(active.root, path.resolve(file));
  if (
    relative === ".." ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  )
    return null;
  return { store: active.store, key: relative.split(path.sep).join("/") };
}
