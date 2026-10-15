// A waiting list of screenshots, kept in the browser (IndexedDB) so it is still
// there the next time the site is opened. IndexedDB is used because screenshots
// are far too big for localStorage.

const DB_NAME = "brawlhalla-upload-queue";
const STORE = "screenshots";

function open() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") return reject(new Error("This browser can't keep a queue."));
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "id" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error("Could not open the queue."));
  });
}

// Runs one request against the store and resolves with its result.
async function run(mode, action) {
  const db = await open();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = action(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(req?.result);
      tx.onerror = () => reject(tx.error || new Error("The queue could not be updated."));
      tx.onabort = () => reject(tx.error || new Error("The queue could not be updated."));
    });
  } finally {
    db.close();
  }
}

const newId = () =>
  globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;

// Everything waiting, oldest first. Each item: { id, name, type, size, addedAt, blob }.
export async function listQueue() {
  const items = (await run("readonly", (store) => store.getAll())) || [];
  return items.sort((a, b) => a.addedAt - b.addedAt);
}

// Adds screenshots (File objects). Returns the items that were stored.
export async function addToQueue(files) {
  const added = [];
  const base = Date.now();
  let i = 0;
  for (const file of files) {
    // The File is stored as-is (a Blob), so nothing is lost or re-compressed.
    const item = {
      id: newId(),
      name: file.name || "screenshot",
      type: file.type,
      size: file.size,
      addedAt: base + i++, // keeps the order the files were picked in
      blob: file,
    };
    await run("readwrite", (store) => store.put(item));
    added.push(item);
  }
  return added;
}

export const removeFromQueue = (id) => run("readwrite", (store) => store.delete(id));

// The stored blob back as a File, ready to send to the server.
export const queueItemToFile = (item) =>
  new File([item.blob], item.name, { type: item.type || item.blob.type });
